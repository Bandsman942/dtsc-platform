import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { normalizeEnterpriseCoreV2Error } from "@/lib/enterprise/core-v2/errors";
import { getEnterpriseProcurementAccess } from "@/lib/enterprise/procurement/access";
import { transitionEnterprisePurchase } from "@/lib/enterprise/procurement/purchase-service";
import { enterprisePurchaseActionSchema } from "@/lib/enterprise/procurement/validators";
import { notifyUser } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string; id: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now(); if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession(); if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-purchase-action:${session.userId}`), 120, 60 * 60 * 1000); if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { organizationId, id } = await params; const access = await getEnterpriseProcurementAccess({ session, organizationId, moduleCode: "SUPPLIERS_PURCHASES", action: "write" }); if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = enterprisePurchaseActionSchema.safeParse(await req.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Action invalide." }, { status: 400 });
  const current = await prisma.enterprisePurchase.findFirst({ where: { id, organizationId, archivedAt: null } }); if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const action = parsed.data.action;
  const related = [current.requestedByUserId, current.buyerUserId, current.createdByUserId].some((userId) => userId === session.userId);
  const allowed = action === "SUBMIT" ? access.canManage || related : action === "ORDER" || action === "CLOSE" ? access.canManage || current.buyerUserId === session.userId : action === "CANCEL" ? access.canManage || current.requestedByUserId === session.userId || current.createdByUserId === session.userId : access.canManage;
  if (!allowed) return NextResponse.json({ error: "Forbidden", message: "Vous n’êtes pas autorisé à exécuter cette transition d’achat." }, { status: 403 });
  try {
    const result = await transitionEnterprisePurchase(organizationId, id, session.userId, parsed.data);
    if (action === "SUBMIT" && "approverUserId" in result) await notifyUser({ userId: result.approverUserId, organizationId, type: "ENTERPRISE_APPROVAL", title: "Approbation d’achat requise", body: "Un achat attend votre décision.", targetUrl: "/enterprise-modules/VALIDATIONS" });
    if ((action === "ORDER" || action === "CANCEL") && current.requestedByUserId !== session.userId) await notifyUser({ userId: current.requestedByUserId, organizationId, type: "ENTERPRISE_PURCHASE", title: action === "ORDER" ? "Achat commandé" : "Achat annulé", body: current.title, targetUrl: "/enterprise-modules/SUPPLIERS_PURCHASES" });
    const auditAction = action === "SUBMIT" ? "ENTERPRISE_PURCHASE_SUBMITTED" : action === "ORDER" ? "ENTERPRISE_PURCHASE_ORDERED" : action === "CLOSE" ? "ENTERPRISE_PURCHASE_CLOSED" : action === "CANCEL" ? "ENTERPRISE_PURCHASE_CANCELLED" : "ENTERPRISE_PURCHASE_ARCHIVED";
    await writeAuditLog({ userId: session.userId, action: auditAction, entity: "EnterprisePurchase", entityId: id, request: req, metadata: { organizationId, fromStatus: current.status } });
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "purchases", purchaseId: id, action } });
    return NextResponse.json({ ok: true, result });
  } catch (error) { const normalized = normalizeEnterpriseCoreV2Error(error); await writeApiLog({ request: req, statusCode: normalized.status, userId: session.userId, startedAt, metadata: { organizationId, domain: "purchases", purchaseId: id, action, error: normalized.code } }); return NextResponse.json({ error: normalized.code, message: normalized.message }, { status: normalized.status }); }
}
