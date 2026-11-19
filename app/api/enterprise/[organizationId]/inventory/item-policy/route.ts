import { Prisma } from "@prisma/client";
import { rateLimit } from "@/lib/rate-limit";
import { retailInventoryVisibleSites } from "@/lib/enterprise/retail/site-access";
import { retailErrorResponse } from "@/lib/enterprise/retail/http";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { notifyUser } from "@/lib/notifications";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getEnterpriseCommonDomainAccess } from "@/lib/enterprise/common/access";
import { lotReclassificationSchema, submitStockLotReclassification } from "@/lib/enterprise/inventory/lot-reclassification";
import { enterpriseDomainErrorResponse, enterpriseValidationErrorResponse } from "@/lib/enterprise/common/http";
import { prisma } from "@/lib/prisma";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string }> };
const inputSchema = z.object({
  inventoryItemId: z.string().min(1), revision: z.number().int().positive(),
  minimumQuantity: z.number().min(0).max(1_000_000_000).nullable(),
  reorderQuantity: z.number().min(0).max(1_000_000_000).nullable(),
  lotTracking: z.boolean(), expiryTracking: z.boolean(),
}).strict();

export async function PUT(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId } = await params;
  const access = await getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "INVENTORY_LOGISTICS", action: "manage" });
  if (!access?.canAdminister) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  // Policies affect every warehouse, not just the currently selected site.
  try { if ((await retailInventoryVisibleSites(organizationId, session.userId)).isolationEnabled) return NextResponse.json({ error: "Forbidden" }, { status: 403 }); }
  catch (error) { return retailErrorResponse(error, "RETAIL_SITE_ACCESS_DENIED"); }
  if (!(await rateLimit(`inventory-item-policy:${organizationId}:${session.userId}`, 30, 60_000)).ok) return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  const parsed = inputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return enterpriseValidationErrorResponse(parsed.error, "INVENTORY_POLICY_INVALID", req);
  const input = parsed.data;
  if (input.expiryTracking && !input.lotTracking) return NextResponse.json({ error: "INVENTORY_POLICY_BATCH_REQUIRED", message: "Activez le suivi des lots avant les péremptions." }, { status: 400 });
  const result = await prisma.$transaction(async (tx) => {
    const item = await tx.enterpriseInventoryItem.findFirst({ where: { organizationId, id: input.inventoryItemId, status: "ACTIVE", archivedAt: null, catalogItem: { organizationId, status: "ACTIVE", archivedAt: null, trackInventory: true } }, select: { id: true, catalogItemId: true, revision: true, lotTracking: true, expiryTracking: true } });
    if (!item) return "NOT_FOUND" as const;
    if (item.revision !== input.revision) return "CONFLICT" as const;
    const [pharmacy,sector] = await Promise.all([tx.pharmacyProductExtension.count({where:{organizationId,catalogItemId:item.catalogItemId}}),tx.enterpriseSectorInventoryEvent.count({where:{organizationId,catalogItemId:item.catalogItemId}})]);
    if (pharmacy || sector) return "SECTOR_AUTHORITY" as const;
    if (input.lotTracking && !item.lotTracking) {
      const unmapped = await tx.enterpriseInventoryBalance.findFirst({ where: { organizationId, inventoryItemId: item.id, stockLotId: null, OR: [{ quantityOnHand: { not: 0 } }, { quantityReserved: { not: 0 } }] }, select: { id: true } });
      if (unmapped) return "UNMAPPED_STOCK" as const;
    }
    if (input.expiryTracking && !item.expiryTracking) {
      const undated = await tx.enterpriseStockLot.findFirst({ where: { organizationId, inventoryItemId: item.id, archivedAt: null, expiryDate: null }, select: { id: true } });
      if (undated) return "UNDATED_LOTS" as const;
    }
    if ((item.lotTracking && !input.lotTracking) || (item.expiryTracking && !input.expiryTracking)) {
      const historicLots = await tx.enterpriseStockLot.count({ where: { organizationId, inventoryItemId: item.id, archivedAt: null } });
      if (historicLots) return "HAS_LOTS" as const;
    }
    const updated = await tx.enterpriseInventoryItem.updateMany({ where: { organizationId, id: item.id, revision: input.revision }, data: {
      minimumQuantity: input.minimumQuantity, reorderQuantity: input.reorderQuantity,
      lotTracking: input.lotTracking, expiryTracking: input.expiryTracking,
      updatedByUserId: session.userId, revision: { increment: 1 },
    } });
    return updated.count === 1 ? "OK" as const : "CONFLICT" as const;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }).catch((error: unknown) => {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") return "CONFLICT" as const;
    throw error;
  });
  if (result !== "OK") return NextResponse.json({ error: result === "SECTOR_AUTHORITY" ? "STOCK_RECLASS_SECTOR_AUTHORITY" : `INVENTORY_POLICY_${result}`, message: result === "SECTOR_AUTHORITY" ? "Cet article relève du registre sectoriel. Gérez ses règles de stock dans le module dédié." : result === "UNMAPPED_STOCK" ? "Des quantités historiques existent sans lot. Ne créez pas une nouvelle entrée : régularisez le stock existant avant d’activer les lots." : result === "UNDATED_LOTS" ? "Renseignez les dates réelles de péremption des lots existants avant d’activer le suivi des péremptions." : result === "HAS_LOTS" ? "Des lots existants empêchent de désactiver leur traçabilité." : result === "NOT_FOUND" ? "Article de stock introuvable." : "La politique a été modifiée entre-temps. Actualisez la fiche." }, { status: result === "NOT_FOUND" ? 404 : 409 });
  await writeAuditLog({ userId: session.userId, organizationId, action: "ENTERPRISE_INVENTORY_ITEM_POLICY_UPDATED", entity: "EnterpriseInventoryItem", entityId: input.inventoryItemId, request: req, metadata: { revision: input.revision + 1, lotTracking: input.lotTracking, expiryTracking: input.expiryTracking } });
  await writeApiLog({ request: req, startedAt, statusCode: 200, userId: session.userId, metadata: { organizationId, domain: "inventory-item-policy" } });
  return NextResponse.json({ ok: true, revision: input.revision + 1 });
}

/** Submit a zero-sum assignment of an existing untracked balance. The
 * designated independent approver decides it from the common Validations. */
export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId } = await params;
  const access = await getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "INVENTORY_LOGISTICS", action: "manage" });
  if (!access?.canAdminister) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!(await rateLimit("inventory-lot-reclass:" + organizationId + ":" + session.userId, 30, 60_000)).ok) return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  const parsed = lotReclassificationSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return enterpriseValidationErrorResponse(parsed.error, "STOCK_RECLASS_ALLOCATION_INVALID", req);
  try {
    const result = await submitStockLotReclassification(organizationId, session.userId, parsed.data);
    if (!result.idempotent) await notifyUser({ userId: result.approval.approverUserId, organizationId, type: "ENTERPRISE_APPROVAL", title: "Régularisation des lots à valider", body: result.request.reference, targetUrl: `/enterprise-modules/VALIDATIONS?approval=${encodeURIComponent(result.approval.id)}` }).catch(() => undefined);
    await writeAuditLog({ userId: session.userId, organizationId, action: "STOCK_LOT_RECLASS_SUBMITTED", entity: "EnterpriseStockLotReclassification", entityId: result.request.id, request: req, metadata: { approvalId: result.approval.id, idempotent: result.idempotent } });
    await writeApiLog({ request: req, startedAt, userId: session.userId, statusCode: result.idempotent ? 200 : 201, metadata: { organizationId, domain: "inventory-lot-reclass" } });
    return NextResponse.json({ ok: true, reference: result.request.reference, approvalId: result.approval.id, idempotent: result.idempotent }, { status: result.idempotent ? 200 : 201 });
  } catch (error) { return enterpriseDomainErrorResponse(error, "STOCK_RECLASS_FAILED", req); }
}
