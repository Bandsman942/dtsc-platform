import { NextResponse } from "next/server";
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
  const [requestRecord, approvals, links, events, comments] = await Promise.all([
    purchase.requestId ? prisma.enterpriseRequest.findFirst({ where: { id: purchase.requestId, organizationId }, select: { id: true, title: true, status: true, priority: true } }) : Promise.resolve(null),
    prisma.enterpriseApproval.findMany({ where: { organizationId, targetEntityType: "EnterprisePurchase", targetEntityId: id, archivedAt: null }, orderBy: { requestedAt: "desc" }, take: 20 }),
    prisma.enterpriseEntityLink.findMany({ where: { organizationId, OR: [{ sourceEntityType: "EnterprisePurchase", sourceEntityId: id }, { targetEntityType: "EnterprisePurchase", targetEntityId: id }] }, orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.enterpriseOperationalEvent.findMany({ where: { organizationId, entityType: "EnterprisePurchase", entityId: id }, orderBy: { createdAt: "desc" }, take: 40 }),
    prisma.enterpriseOperationalComment.findMany({ where: { organizationId, entityType: "EnterprisePurchase", entityId: id, deletedAt: null }, orderBy: { createdAt: "desc" }, take: 20 }),
  ]);
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "purchases", purchaseId: id } });
  return NextResponse.json({ purchase, request: requestRecord, approvals, links, events, comments, canManage: access.canManage, currentUserId: session.userId });
}

export async function PATCH(req: Request, { params }: Params) {
  const startedAt = Date.now(); if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession(); if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-purchase-update:${session.userId}`), 120, 60 * 60 * 1000); if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { organizationId, id } = await params; const access = await getEnterpriseProcurementAccess({ session, organizationId, moduleCode: "SUPPLIERS_PURCHASES", action: "write" }); if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const current = await prisma.enterprisePurchase.findFirst({ where: { id, organizationId, archivedAt: null } });
  if (!current || (!access.canManage && ![current.requestedByUserId, current.buyerUserId, current.createdByUserId].includes(session.userId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = enterprisePurchaseUpdateSchema.safeParse(await req.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Achat invalide." }, { status: 400 });
  try {
    const purchase = await updateEnterprisePurchase(organizationId, id, session.userId, parsed.data);
    await writeAuditLog({ userId: session.userId, action: "ENTERPRISE_PURCHASE_UPDATED", entity: "EnterprisePurchase", entityId: id, request: req, metadata: { organizationId } });
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "purchases", purchaseId: id } });
    return NextResponse.json({ ok: true, purchase });
  } catch (error) { const normalized = normalizeEnterpriseCoreV2Error(error); return NextResponse.json({ error: normalized.code, message: normalized.message }, { status: normalized.status }); }
}
