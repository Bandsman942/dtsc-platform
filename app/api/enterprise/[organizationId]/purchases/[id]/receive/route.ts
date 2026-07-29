import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { normalizeEnterpriseCoreV2Error } from "@/lib/enterprise/core-v2/errors";
import { getEnterpriseProcurementAccess } from "@/lib/enterprise/procurement/access";
import { receiveEnterprisePurchase } from "@/lib/enterprise/procurement/purchase-service";
import { enterprisePurchaseReceiptSchema } from "@/lib/enterprise/procurement/validators";
import { notifyUser } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string; id: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession(); if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-purchase-receive:${session.userId}`), 100, 60 * 60 * 1000); if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { organizationId, id } = await params; const access = await getEnterpriseProcurementAccess({ session, organizationId, moduleCode: "SUPPLIERS_PURCHASES", action: "write" }); if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const current = await prisma.enterprisePurchase.findFirst({ where: { id, organizationId, archivedAt: null } }); if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!access.canManage && current.buyerUserId !== session.userId) return NextResponse.json({ error: "Forbidden", message: "Seul l’acheteur désigné ou un responsable peut enregistrer une réception." }, { status: 403 });
  const parsed = enterprisePurchaseReceiptSchema.safeParse(await req.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Réception invalide." }, { status: 400 });
  try {
    const result = await receiveEnterprisePurchase(organizationId, id, session.userId, parsed.data);
    if (current.requestedByUserId !== session.userId) await notifyUser({ userId: current.requestedByUserId, organizationId, type: "ENTERPRISE_PURCHASE", title: result.purchase?.status === "RECEIVED" ? "Achat reçu" : "Réception partielle", body: current.title, targetUrl: "/enterprise-modules/SUPPLIERS_PURCHASES" });
    await writeAuditLog({ userId: session.userId, action: result.purchase?.status === "RECEIVED" ? "ENTERPRISE_PURCHASE_RECEIVED" : "ENTERPRISE_PURCHASE_PARTIALLY_RECEIVED", entity: "EnterprisePurchase", entityId: id, request: req, metadata: { organizationId, receiptId: result.receipt.id, receiptReference: result.receipt.reference } });
    await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt, metadata: { organizationId, domain: "purchases", purchaseId: id, receiptId: result.receipt.id } });
    return NextResponse.json({ ok: true, ...result }, { status: 201 });
  } catch (error) { const normalized = normalizeEnterpriseCoreV2Error(error); await writeApiLog({ request: req, statusCode: normalized.status, userId: session.userId, startedAt, metadata: { organizationId, domain: "purchases", purchaseId: id, error: normalized.code } }); return NextResponse.json({ error: normalized.code, message: normalized.message }, { status: normalized.status }); }
}
