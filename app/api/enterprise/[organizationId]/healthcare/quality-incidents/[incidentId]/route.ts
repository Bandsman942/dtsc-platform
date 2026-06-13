/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { getHealthQualityAccess } from "@/lib/health-quality-access";
import { healthQualityIncidentAction, updateHealthQualityIncident } from "@/lib/health-quality";
import { healthQualityIncidentActionSchema, healthQualityIncidentUpdateSchema } from "@/lib/health-quality-validators";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string; incidentId: string }> };
function visible(record: { reportedById: string; assignedToId: string | null; confidentialityIncident: boolean; restrictedAccess: boolean; correctiveActions: { responsibleUserId: string }[] }, userId: string, access: any) {
  const involved = record.reportedById === userId || record.assignedToId === userId || record.correctiveActions.some((item) => item.responsibleUserId === userId);
  return (access.canViewAll || involved) && (access.canViewConfidential || (!record.confidentialityIncident && !record.restrictedAccess) || involved);
}
export async function GET(_: Request, { params }: Params) {
  const session = await getSession(); if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId, incidentId } = await params, access = await getHealthQualityAccess({ session, organizationId, action: "read" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const record = await prisma.healthQualityIncident.findFirst({ where: { id: incidentId, organizationId }, include: { correctiveActions: { orderBy: { dueDate: "asc" } }, events: { orderBy: { createdAt: "desc" } } } });
  if (!record) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!visible(record, session.userId, access)) return NextResponse.json({ error: "Forbidden", message: record.confidentialityIncident ? "Cet incident est confidentiel." : "Vous n’avez pas la permission de consulter cet incident." }, { status: 403 });
  return NextResponse.json({ record });
}
export async function PATCH(req: Request, { params }: Params) {
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession(); if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `health-quality-update:${session.userId}`), 100, 3600000); if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { organizationId, incidentId } = await params, access = await getHealthQualityAccess({ session, organizationId, action: "write" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const existing = await prisma.healthQualityIncident.findFirst({ where: { id: incidentId, organizationId }, include: { correctiveActions: { select: { responsibleUserId: true } } } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!visible(existing, session.userId, access)) return NextResponse.json({ error: "Forbidden", message: existing.confidentialityIncident ? "Cet incident est confidentiel." : "Vous n’avez pas la permission de consulter cet incident." }, { status: 403 });
  const body = await req.json().catch(() => null), actionParsed = healthQualityIncidentActionSchema.safeParse(body), updateParsed = healthQualityIncidentUpdateSchema.safeParse(body);
  if (!actionParsed.success && !updateParsed.success) return NextResponse.json({ error: "Invalid payload", message: "Les informations de traitement sont invalides." }, { status: 400 });
  const action = actionParsed.success ? actionParsed.data.action : "update";
  const allowed = action === "qualify" ? access.canQualify : action === "assign" ? access.canAssign : action === "investigate" ? access.canInvestigate : action === "close" ? access.canClose : action === "reopen" ? access.canReopen : action === "archive" ? access.canArchive : access.canUpdate;
  if (!allowed) return NextResponse.json({ error: "Forbidden", message: "Vous n’avez pas la permission pour cette action." }, { status: 403 });
  try {
    const record = actionParsed.success ? await healthQualityIncidentAction(organizationId, incidentId, session.userId, actionParsed.data) : await updateHealthQualityIncident(organizationId, incidentId, session.userId, updateParsed.data);
    await writeAuditLog({ userId: session.userId, action: `HEALTH_QUALITY_INCIDENT_${action.toUpperCase()}`, entity: "HealthQualityIncident", entityId: incidentId, request: req, metadata: { organizationId } });
    const messages: Record<string, string> = { qualify: "Incident qualifié avec succès.", investigate: "Investigation enregistrée avec succès.", close: "Incident clôturé avec succès.", reopen: "Incident rouvert avec succès.", archive: "Incident archivé avec succès.", assign: "Responsable assigné avec succès.", update: "Incident mis à jour avec succès." };
    return NextResponse.json({ ok: true, record, message: messages[action] });
  } catch (error) {
    const code = error instanceof Error ? error.message : "FAILED";
    const messages: Record<string, string> = { LOCKED: "Cet incident est clôturé ou archivé et ne peut pas être modifié librement.", REASON_REQUIRED: "Une raison est obligatoire pour cette modification sensible.", OPEN_ACTIONS: "Des actions correctives restent ouvertes. Ajoutez une justification pour clôturer.", INVALID_TRANSITION: "Cette transition de statut n’est pas autorisée." };
    return NextResponse.json({ error: code, message: messages[code] || "Action impossible." }, { status: 409 });
  }
}
