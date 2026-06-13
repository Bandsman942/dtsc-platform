import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { getHealthQualityAccess } from "@/lib/health-quality-access";
import { healthQualityCorrectiveAction } from "@/lib/health-quality";
import { healthQualityCorrectiveActionUpdateSchema } from "@/lib/health-quality-validators";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";
type Params = { params: Promise<{ organizationId: string; actionId: string }> };
export async function PATCH(req: Request, { params }: Params) {
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession(); if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `health-quality-action-update:${session.userId}`), 100, 3600000); if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { organizationId, actionId } = await params, access = await getHealthQualityAccess({ session, organizationId, action: "write" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const existing = await prisma.healthQualityCorrectiveAction.findFirst({ where: { id: actionId, organizationId }, include: { incident: true } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const involved = existing.responsibleUserId === session.userId || existing.incident.reportedById === session.userId || existing.incident.assignedToId === session.userId;
  if ((!access.canViewAll && !involved) || (!access.canViewConfidential && (existing.incident.confidentialityIncident || existing.incident.restrictedAccess) && !involved)) return NextResponse.json({ error: "Forbidden", message: "Cet incident est confidentiel." }, { status: 403 });
  const parsed = healthQualityCorrectiveActionUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: "Action corrective invalide." }, { status: 400 });
  const allowed = parsed.data.action === "validate" || parsed.data.action === "reject" ? access.canValidateActions : access.canManageActions;
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const record = await healthQualityCorrectiveAction(organizationId, actionId, session.userId, parsed.data);
    await writeAuditLog({ userId: session.userId, action: `HEALTH_QUALITY_ACTION_${parsed.data.action.toUpperCase()}`, entity: "HealthQualityCorrectiveAction", entityId: actionId, request: req, metadata: { organizationId } });
    return NextResponse.json({ ok: true, record, message: "Action corrective mise à jour avec succès." });
  } catch { return NextResponse.json({ error: "Action impossible", message: "Cette action corrective est verrouillée ou la transition n’est pas autorisée." }, { status: 409 }); }
}
