import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getEnterpriseCommonDomainAccess } from "@/lib/enterprise/common/access";
import { retailInventoryVisibleSites } from "@/lib/enterprise/retail/site-access";
import { retailErrorResponse } from "@/lib/enterprise/retail/http";
import { enterpriseValidationErrorResponse } from "@/lib/enterprise/common/http";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { normalizeEnterpriseCoreV2Error } from "@/lib/enterprise/core-v2/errors";
import { enterprisePurchaseVisibilityWhere, getEnterpriseProcurementAccess } from "@/lib/enterprise/procurement/access";
import { updateEnterprisePurchase } from "@/lib/enterprise/procurement/purchase-service";
import { enterprisePurchaseUpdateSchema } from "@/lib/enterprise/procurement/validators";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string; id: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now(); const session = await getSession(); if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId, id } = await params; const access = await getEnterpriseProcurementAccess({ session, organizationId, moduleCode: "SUPPLIERS_PURCHASES", action: "read" }); if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const visible = enterprisePurchaseVisibilityWhere({ organizationId, userId: session.userId, canSeeAll: access.canSeeAll });
  const purchase = await prisma.enterprisePurchase.findFirst({ where: { AND: [visible, { id }] }, include: { items: { orderBy: { sortOrder: "asc" } }, supplier: { include: { contacts: { orderBy: [{ isPrimary: "desc" }, { name: "asc" }], take: 5 } } }, budgetLine: { include: { budget: true } }, receipts: { orderBy: { receivedAt: "desc" }, include: { items: true } } } });
  if (!purchase) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const url = new URL(req.url);
  if (url.searchParams.get("view") === "receipt-lots") {
    // Purchase visibility is necessary but not sufficient for inventory detail.
    const stockAccess = await getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "INVENTORY_LOGISTICS", action: "read", includeMutationCapabilities: false });
    if (!stockAccess) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    let scope: Awaited<ReturnType<typeof retailInventoryVisibleSites>>;
    try { scope = await retailInventoryVisibleSites(organizationId, session.userId); }
    catch (error) { return retailErrorResponse(error, "RETAIL_SITE_ACCESS_DENIED", req); }
    const page = Math.min(10000, Math.max(1, Math.trunc(Number(url.searchParams.get("page")) || 1)));
    const pageSize = Math.min(50, Math.max(1, Math.trunc(Number(url.searchParams.get("pageSize")) || 20)));
    const search = (url.searchParams.get("search") || "").trim().slice(0, 120);
    // Each physical movement is canonical, not the historical first-movement
    // receipt-line link. Include the original receipt, even for recalled lots.
    const receiptById = new Map(purchase.receipts.map((receipt) => [receipt.id, receipt]));
    const where: Prisma.EnterpriseStockMovementWhereInput = {
      organizationId, movementType: "PURCHASE_RECEIPT", direction: "IN",
      sourceEntityType: "EnterprisePurchaseReceipt",
      sourceEntityId: { in: [...receiptById.keys()] },
      sourceLineId: { in: purchase.receipts.flatMap((receipt) => receipt.items.map((item) => item.id)) },
      ...(scope.isolationEnabled ? { warehouse: { siteId: { in: scope.siteIds } } } : {}),
      ...(search ? { OR: [
        { stockLot: { lotNumber: { contains: search, mode: "insensitive" } } },
        { inventoryItem: { catalogItem: { name: { contains: search, mode: "insensitive" } } } },
        { inventoryItem: { catalogItem: { code: { contains: search, mode: "insensitive" } } } },
        { inventoryItem: { catalogItem: { sku: { contains: search, mode: "insensitive" } } } },
        { sourceEntityId: { in: purchase.receipts.filter((receipt) => receipt.reference.toLocaleLowerCase().includes(search.toLocaleLowerCase())).map((receipt) => receipt.id) } },
      ] } : {}),
    };
    const [rows, total] = await prisma.$transaction([
      prisma.enterpriseStockMovement.findMany({ where, orderBy: [{ occurredAt: "desc" }, { id: "desc" }], skip: (page - 1) * pageSize, take: pageSize, select: {
        id: true, sourceEntityId: true, sourceLineId: true, quantity: true, occurredAt: true,
        inventoryItem: { select: { catalogItem: { select: { name: true, code: true, sku: true, unitOfMeasure: { select: { symbol: true } } } } } },
        warehouse: { select: { name: true, code: true } },
        storageLocation: { select: { name: true, code: true } },
        stockLot: { select: { lotNumber: true, productionDate: true, expiryDate: true, status: true, recallReference: true } },
      } }),
      prisma.enterpriseStockMovement.count({ where }),
    ], { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    const items = rows.map((row) => ({
      ...row,
      receiptReference: receiptById.get(row.sourceEntityId || "")?.reference || null,
    }));
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "purchase-receipt-lots", purchaseId: id, page } });
    return NextResponse.json({ items, pagination: { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) } });
  }
  const itemIds = purchase.items.map((item) => item.id);
  const [requestRecord, approvals, links, events, comments, operationalLink, itemCatalogLinks] = await Promise.all([
    purchase.requestId ? prisma.enterpriseRequest.findFirst({ where: { id: purchase.requestId, organizationId }, select: { id: true, requestType: true, title: true, status: true, priority: true } }) : Promise.resolve(null),
    prisma.enterpriseApproval.findMany({ where: { organizationId, targetEntityType: "EnterprisePurchase", targetEntityId: id, archivedAt: null }, orderBy: { requestedAt: "desc" }, take: 20 }),
    prisma.enterpriseEntityLink.findMany({ where: { organizationId, OR: [{ sourceEntityType: "EnterprisePurchase", sourceEntityId: id }, { targetEntityType: "EnterprisePurchase", targetEntityId: id }] }, orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.enterpriseOperationalEvent.findMany({ where: { organizationId, entityType: "EnterprisePurchase", entityId: id }, orderBy: { createdAt: "desc" }, take: 40 }),
    prisma.enterpriseOperationalComment.findMany({ where: { organizationId, entityType: "EnterprisePurchase", entityId: id, deletedAt: null }, orderBy: { createdAt: "desc" }, take: 20 }),
    prisma.enterprisePurchaseOperationalLink.findFirst({ where: { organizationId, purchaseId: id }, select: { id: true, siteId: true, destinationWarehouseId: true, expectedReceiptType: true } }),
    itemIds.length ? prisma.enterprisePurchaseItemCatalogLink.findMany({ where: { organizationId, purchaseItemId: { in: itemIds } }, select: { purchaseItemId: true, catalogItemId: true, unitOfMeasureId: true, expectedItemType: true } }) : Promise.resolve([]),
  ]);
  const catalogIds = [...new Set(itemCatalogLinks.flatMap((link) => link.catalogItemId ? [link.catalogItemId] : []))];
  const inventoryRules = catalogIds.length ? await prisma.enterpriseInventoryItem.findMany({ where: { organizationId, catalogItemId: { in: catalogIds }, status: "ACTIVE", archivedAt: null }, select: { catalogItemId: true, lotTracking: true, expiryTracking: true } }) : [];
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "purchases", purchaseId: id } });
  return NextResponse.json({ purchase, request: requestRecord, approvals, links, events, comments, operationalLink, itemCatalogLinks, inventoryRules, canManage: access.canManage, currentUserId: session.userId });
}

export async function PATCH(req: Request, { params }: Params) {
  const startedAt = Date.now(); if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession(); if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-purchase-update:${session.userId}`), 120, 60 * 60 * 1000); if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { organizationId, id } = await params; const access = await getEnterpriseProcurementAccess({ session, organizationId, moduleCode: "SUPPLIERS_PURCHASES", action: "write" }); if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const current = await prisma.enterprisePurchase.findFirst({ where: { id, organizationId, archivedAt: null } });
  if (!current || (!access.canManage && ![current.requestedByUserId, current.buyerUserId, current.createdByUserId].includes(session.userId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = enterprisePurchaseUpdateSchema.safeParse(await req.json().catch(() => null)); if (!parsed.success) return enterpriseValidationErrorResponse(parsed.error, "PURCHASE_UPDATE_INPUT_INVALID", req);
  try {
    const purchase = await updateEnterprisePurchase(organizationId, id, session.userId, parsed.data);
    await writeAuditLog({ userId: session.userId, action: "ENTERPRISE_PURCHASE_UPDATED", entity: "EnterprisePurchase", entityId: id, request: req, metadata: { organizationId } });
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "purchases", purchaseId: id } });
    return NextResponse.json({ ok: true, purchase });
  } catch (error) { const normalized = normalizeEnterpriseCoreV2Error(error); return NextResponse.json({ error: normalized.code, message: normalized.message }, { status: normalized.status }); }
}
