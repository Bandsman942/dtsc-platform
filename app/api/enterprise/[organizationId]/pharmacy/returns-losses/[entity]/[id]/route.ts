import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { canAccessPharmacyReturnLoss, type PharmacyReturnLossAction } from "@/lib/pharmacy-return-loss-access";
import { returnLossActionSchema } from "@/lib/pharmacy-return-loss-validators";
import { applyReturnLossStockImpact, reverseReturnLossStockImpact } from "@/lib/pharmacy-return-losses";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string; entity: string; id: string }> };
function permission(action: string): PharmacyReturnLossAction { return action === "validate" ? "validate" : action === "reject" ? "reject" : action === "cancel" ? "cancel" : action === "resolve-alert" ? "resolve" : "submit"; }

export async function PATCH(request: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession(); if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(request, `pharmacy-return-loss:${session.userId}`), 120, 3600000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { organizationId, entity, id } = await params;
  const parsed = returnLossActionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid action", message: "Action invalide." }, { status: 400 });
  const data = parsed.data; const reason = data.reason?.trim() || undefined;
  if (!(await canAccessPharmacyReturnLoss(session.userId, organizationId, permission(data.action)))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    if (entity === "event") {
      const event = await prisma.pharmacyReturnLossEvent.findFirst({ where: { id, organizationId } });
      if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });
      if (data.action === "submit") await prisma.pharmacyReturnLossEvent.update({ where: { id }, data: { status: "SUBMITTED", submittedById: session.userId, submittedAt: new Date(), updatedById: session.userId } });
      else if (data.action === "validate") await applyReturnLossStockImpact(organizationId, id, session.userId);
      else if (data.action === "reject") {
        if (!reason) throw new Error("REASON_REQUIRED");
        await prisma.pharmacyReturnLossEvent.update({ where: { id }, data: { status: "REJECTED", rejectedById: session.userId, rejectedAt: new Date(), rejectionReason: reason, updatedById: session.userId } });
      } else if (data.action === "cancel") {
        if (!reason) throw new Error("REASON_REQUIRED");
        await reverseReturnLossStockImpact(organizationId, id, session.userId, reason);
      } else throw new Error("INVALID_ACTION");
    } else if (entity === "alert" && data.action === "resolve-alert") {
      const alert = await prisma.pharmacyReturnLossAlert.findFirst({ where: { id, organizationId } });
      if (!alert) return NextResponse.json({ error: "Not found" }, { status: 404 });
      await prisma.pharmacyReturnLossAlert.update({ where: { id }, data: { status: "RESOLVED", resolvedAt: new Date() } });
    } else throw new Error("INVALID_ACTION");
    await writeAuditLog({ userId: session.userId, action: `PHARMACY_RETURN_LOSS_${data.action.toUpperCase().replaceAll("-", "_")}`, entity, entityId: id, request, metadata: { organizationId, reason: reason || null } });
    await writeApiLog({ request, statusCode: 200, userId: session.userId, startedAt });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    const messages: Record<string, string> = { REASON_REQUIRED: "Le motif est obligatoire.", EVENT_NOT_SUBMITTED: "La déclaration doit être soumise avant validation.", EVENT_NOT_FOUND: "La déclaration est introuvable.", BATCH_REQUIRED: "Un lot est obligatoire.", BATCH_NOT_FOUND: "Le lot est introuvable.", NEGATIVE_STOCK: "Cette opération rendrait le stock négatif.", INVALID_ACTION: "Cette action n'est pas autorisée." };
    return NextResponse.json({ error: code, message: messages[code] || "Action impossible." }, { status: 400 });
  }
}
