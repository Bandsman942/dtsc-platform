import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { canAccessPharmacyQuality } from "@/lib/pharmacy-quality-access";
import { transitionQualityEntity } from "@/lib/pharmacy-quality";
import { pharmacyQualityActionSchema } from "@/lib/pharmacy-quality-validators";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string; entity: string; id: string }> };
export async function PATCH(request: Request, { params }: Params) {
  const startedAt = Date.now(); if (!isSameOriginRequest(request)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession(); if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(request, `pharmacy-quality-action:${session.userId}`), 150, 3600000); if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { organizationId, entity, id } = await params; const parsed = pharmacyQualityActionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid action", message: "Action qualité invalide." }, { status: 400 });
  const managed = ["close", "reject", "cancel", "validate", "reject-capa", "quarantine-batch", "block-batch", "create-alert"].includes(parsed.data.action);
  if (!(await canAccessPharmacyQuality(session.userId, organizationId, managed ? "manage" : "update"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    await transitionQualityEntity(organizationId, entity, id, session.userId, parsed.data.action, parsed.data.comment?.trim() || undefined, parsed.data.assignedToId || undefined);
    await writeAuditLog({ userId: session.userId, action: `PHARMACY_QUALITY_${parsed.data.action.toUpperCase().replaceAll("-", "_")}`, entity, entityId: id, request, metadata: { organizationId } });
    await writeApiLog({ request, statusCode: 200, userId: session.userId, startedAt }); return NextResponse.json({ ok: true });
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN"; const messages: Record<string, string> = { INCIDENT_NOT_FOUND: "L'incident est introuvable.", ASSIGNEE_INVALID: "Le responsable sélectionné est invalide.", COMMENT_REQUIRED: "Un commentaire ou motif est obligatoire.", IMMEDIATE_ACTION_REQUIRED: "Une action immédiate doit être documentée avant le signalement.", RESOLUTION_REQUIRED: "Un résumé de résolution est obligatoire avant de clôturer cet incident critique.", INVESTIGATION_REQUIRED: "L'investigation obligatoire doit être terminée avant la clôture.", CAPA_OPEN: "Toutes les actions CAPA obligatoires doivent être validées avant la clôture.", BATCH_REASON_REQUIRED: "Un lot lié et un motif sont obligatoires.", BATCH_NOT_FOUND: "Le lot lié est introuvable." };
    return NextResponse.json({ error: code, message: messages[code] || "Action impossible." }, { status: 400 });
  }
}
