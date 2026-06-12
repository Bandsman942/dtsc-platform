import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getHealthConsultationAccess } from "@/lib/health-consultation-access";
import { healthConsultationActionSchema } from "@/lib/health-consultation-validators";
import { transitionHealthConsultation } from "@/lib/health-consultations";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string; consultationId: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `health-consultation-action:${session.userId}`), 120, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { organizationId, consultationId } = await params;
  const access = await getHealthConsultationAccess({ session, organizationId, action: "write" });
  if (!access) return NextResponse.json({ error: "Forbidden", message: "Vous n’avez pas la permission d’effectuer cette action." }, { status: 403 });
  const parsed = healthConsultationActionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid action", message: "Action consultation invalide." }, { status: 400 });
  const data = parsed.data;
  if (!["close", "reopen", "cancel"].includes(data.action) && !access.canUpdate) return NextResponse.json({ error: "Forbidden", message: "Vous n’avez pas la permission de faire évoluer cette consultation." }, { status: 403 });
  if (data.action === "close" && !access.canClose) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (data.action === "reopen" && !access.canReopen) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (data.action === "cancel" && !access.canCancel) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const consultation = await transitionHealthConsultation(organizationId, consultationId, session.userId, data.action, data.reason);
    await writeAuditLog({ userId: session.userId, action: `HEALTH_CONSULTATION_${data.action.toUpperCase()}`, entity: "HealthConsultation", entityId: consultationId, request: req, metadata: { organizationId, reason: data.reason } });
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, moduleCode: "CONSULTATIONS", action: data.action } });
    return NextResponse.json({ ok: true, consultation });
  } catch (error) {
    const code = error instanceof Error ? error.message : "ACTION_FAILED";
    const messages: Record<string, string> = { CONSULTATION_NOT_FOUND: "Consultation introuvable.", INVALID_TRANSITION: "Cette transition de statut n’est pas autorisée.", REASON_REQUIRED: "Un motif est obligatoire pour cette action." };
    return NextResponse.json({ error: code, message: messages[code] || "Action impossible sur cette consultation." }, { status: code === "CONSULTATION_NOT_FOUND" ? 404 : 409 });
  }
}
