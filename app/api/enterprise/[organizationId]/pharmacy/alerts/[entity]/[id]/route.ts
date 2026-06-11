import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { canAccessPharmacyAlerts } from "@/lib/pharmacy-alert-access";
import { pharmacyAlertActionSchema, pharmacyAlertRuleSchema, pharmacyAlertSettingSchema } from "@/lib/pharmacy-alert-validators";
import { transitionPharmacyAlert } from "@/lib/pharmacy-alerts";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string; entity: string; id: string }> };
export async function PATCH(request: Request, { params }: Params) {
  const startedAt = Date.now(); if (!isSameOriginRequest(request)) return NextResponse.json({ error: "Forbidden" }, { status: 403 }); const session = await getSession(); if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); const limited = await rateLimit(getRateLimitKey(request, `pharmacy-alert-action:${session.userId}`), 120, 3600000); if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 }); const { organizationId, entity, id } = await params; const body = await request.json().catch(() => null);
  if (!(await canAccessPharmacyAlerts(session.userId, organizationId, entity === "alert" ? "update" : "manage"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    if (entity === "alert") { const parsed = pharmacyAlertActionSchema.safeParse(body); if (!parsed.success) return NextResponse.json({ error: "Invalid action", message: "Action alerte invalide." }, { status: 400 }); await transitionPharmacyAlert(organizationId, id, session.userId, parsed.data.action, parsed.data.comment, parsed.data.assignedToId || undefined); }
    else if (entity === "rule") { const parsed = pharmacyAlertRuleSchema.safeParse(body); if (!parsed.success) return NextResponse.json({ error: "Invalid rule", message: "Paramètres de règle invalides." }, { status: 400 }); const rule = await prisma.pharmacyAlertRule.findFirst({ where: { id, organizationId } }); if (!rule) return NextResponse.json({ error: "Not found" }, { status: 404 }); await prisma.pharmacyAlertRule.update({ where: { id }, data: parsed.data }); }
    else if (entity === "settings") { const parsed = pharmacyAlertSettingSchema.safeParse(body); if (!parsed.success) return NextResponse.json({ error: "Invalid settings", message: "Paramètres alertes invalides." }, { status: 400 }); await prisma.pharmacyAlertSetting.update({ where: { organizationId }, data: { ...parsed.data, updatedById: session.userId } }); }
    else return NextResponse.json({ error: "Invalid entity" }, { status: 400 });
    await writeAuditLog({ userId: session.userId, action: `PHARMACY_ALERT_${entity.toUpperCase()}_UPDATED`, entity, entityId: id, request, metadata: { organizationId } }); await writeApiLog({ request, statusCode: 200, userId: session.userId, startedAt }); return NextResponse.json({ ok: true });
  } catch (error) { const code = error instanceof Error ? error.message : "UNKNOWN"; return NextResponse.json({ error: code, message: code === "COMMENT_REQUIRED" ? "Un motif ou commentaire est obligatoire." : code === "ASSIGNEE_INVALID" ? "Le responsable sélectionné n'appartient pas à cette organisation." : "Action impossible." }, { status: 400 }); }
}
