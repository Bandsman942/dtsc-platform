import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { resolvePharmacyActivityAction } from "@/lib/pharmacy-activities";
import { getPharmacyActivityAccess } from "@/lib/pharmacy-activity-access";
import { pharmacyActivityActionSchema } from "@/lib/pharmacy-activity-validators";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string; id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const startedAt = Date.now(); if (!isSameOriginRequest(request)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession(); if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(request, `pharmacy-activity-action:${session.userId}`), 100, 3600000); if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { organizationId, id } = await params; if (!(await getPharmacyActivityAccess(session.userId, organizationId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = pharmacyActivityActionSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: "Action invalide." }, { status: 400 });
  try {
    const activity = await resolvePharmacyActivityAction(organizationId, session.userId, id, parsed.data.action, parsed.data.comment, parsed.data.assignedToId, parsed.data.response, parsed.data.documentId);
    await writeAuditLog({ userId: session.userId, action: `PHARMACY_ACTIVITY_${parsed.data.action.toUpperCase().replaceAll("-", "_")}`, entity: "PharmacyActivityItem", entityId: id, request, metadata: { organizationId } });
    await writeApiLog({ request, statusCode: 200, userId: session.userId, startedAt }); return NextResponse.json({ ok: true, activity });
  } catch (error) { return NextResponse.json({ error: "ACTION_FAILED", message: error instanceof Error ? error.message : "Action impossible." }, { status: 400 }); }
}
