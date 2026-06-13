import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { getHealthQualityAccess } from "@/lib/health-quality-access";
import { createHealthQualityCorrectiveAction } from "@/lib/health-quality";
import { healthQualityCorrectiveActionCreateSchema } from "@/lib/health-quality-validators";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";
type Params = { params: Promise<{ organizationId: string; incidentId: string }> };
export async function POST(req: Request, { params }: Params) {
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession(); if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `health-quality-action-create:${session.userId}`), 100, 3600000); if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { organizationId, incidentId } = await params, access = await getHealthQualityAccess({ session, organizationId, action: "write" });
  if (!access?.canManageActions) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const incident = await prisma.healthQualityIncident.findFirst({ where: { id: incidentId, organizationId } });
  if (!incident) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const involved = incident.reportedById === session.userId || incident.assignedToId === session.userId;
  if ((!access.canViewAll && !involved) || (!access.canViewConfidential && (incident.confidentialityIncident || incident.restrictedAccess) && !involved)) return NextResponse.json({ error: "Forbidden", message: "Cet incident est confidentiel." }, { status: 403 });
  const parsed = healthQualityCorrectiveActionCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: "Une action corrective exige un responsable et une échéance valides." }, { status: 400 });
  try {
    const record = await createHealthQualityCorrectiveAction(organizationId, incidentId, session.userId, parsed.data);
    await writeAuditLog({ userId: session.userId, action: "HEALTH_QUALITY_CORRECTIVE_ACTION_CREATED", entity: "HealthQualityCorrectiveAction", entityId: record.id, request: req, metadata: { organizationId, incidentId } });
    return NextResponse.json({ ok: true, record, message: "Action corrective ajoutée avec succès." }, { status: 201 });
  } catch { return NextResponse.json({ error: "Invalid reference", message: "Le responsable ou l’incident n’appartient pas à cette entreprise." }, { status: 409 }); }
}
