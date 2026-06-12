import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getHealthAppointmentAccess } from "@/lib/health-appointment-access";
import { healthAppointmentActionSchema } from "@/lib/health-appointment-validators";
import { transitionHealthAppointment } from "@/lib/health-appointments";
import { canAccessEnterpriseModule } from "@/lib/enterprise-sector-templates";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string; appointmentId: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `health-appointment-action:${session.userId}`), 120, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { organizationId, appointmentId } = await params;
  const access = await getHealthAppointmentAccess({ session, organizationId, action: "write" });
  if (!access?.canTransition) return NextResponse.json({ error: "Forbidden", message: "Vous n’avez pas la permission d’effectuer cette action." }, { status: 403 });
  const parsed = healthAppointmentActionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid action", message: "Action rendez-vous invalide." }, { status: 400 });
  const data = parsed.data;
  if (data.action === "cancel" && !access.canCancel) return NextResponse.json({ error: "Forbidden", message: "Vous n’avez pas la permission d’annuler ce rendez-vous." }, { status: 403 });
  if (data.action === "convert_consultation" && !access.canConvert) return NextResponse.json({ error: "Forbidden", message: "Vous n’avez pas la permission de convertir ce rendez-vous." }, { status: 403 });
  if (data.action === "convert_consultation" && !(await canAccessEnterpriseModule(session.userId, organizationId, "CONSULTATIONS", "write"))) {
    return NextResponse.json({ error: "Consultations unavailable", message: "Le module Consultations n’est pas actif ou accessible." }, { status: 409 });
  }
  try {
    const result = await transitionHealthAppointment(organizationId, appointmentId, session.userId, data.action, data.reason);
    await writeAuditLog({ userId: session.userId, action: `HEALTH_APPOINTMENT_${data.action.toUpperCase()}`, entity: "HealthAppointment", entityId: appointmentId, request: req, metadata: { organizationId, consultationId: result.consultationId } });
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, moduleCode: "APPOINTMENTS", action: data.action } });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const code = error instanceof Error ? error.message : "ACTION_FAILED";
    const messages: Record<string, string> = { APPOINTMENT_NOT_FOUND: "Rendez-vous introuvable.", INVALID_TRANSITION: "Cette transition de statut n’est pas autorisée.", REASON_REQUIRED: "Un motif d’annulation est obligatoire.", ALREADY_CONVERTED: "Ce rendez-vous a déjà été converti en consultation.", PROFESSIONAL_REQUIRED: "Assignez un professionnel avant de convertir ce rendez-vous en consultation." };
    return NextResponse.json({ error: code, message: messages[code] || "Action impossible sur ce rendez-vous." }, { status: code === "APPOINTMENT_NOT_FOUND" ? 404 : 409 });
  }
}
