import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { createEnterpriseCoreRecord } from "@/lib/enterprise/enterprise-core";
import { createPharmacyActivityRequest, getPharmacyActivityDashboard } from "@/lib/pharmacy-activities";
import { getPharmacyActivityAccess } from "@/lib/pharmacy-activity-access";
import { pharmacyActivityCreateSchema } from "@/lib/pharmacy-activity-validators";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(request: Request, { params }: Params) {
  const startedAt = Date.now(); const session = await getSession(); if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId } = await params; if (!(await getPharmacyActivityAccess(session.userId, organizationId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try { const dataset = await getPharmacyActivityDashboard(organizationId, session.userId); await writeApiLog({ request, statusCode: 200, userId: session.userId, startedAt }); return NextResponse.json(dataset); }
  catch (error) { return NextResponse.json({ error: "LOAD_FAILED", message: error instanceof Error ? error.message : "Chargement impossible." }, { status: 400 }); }
}
export async function POST(request: Request, { params }: Params) {
  const startedAt = Date.now(); if (!isSameOriginRequest(request)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession(); if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(request, `pharmacy-activities:${session.userId}`), 80, 3600000); if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { organizationId } = await params; if (!(await getPharmacyActivityAccess(session.userId, organizationId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = pharmacyActivityCreateSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: "Le formulaire contient des valeurs invalides." }, { status: 400 });
  try {
    const activity = await createPharmacyActivityRequest(organizationId, session.userId, parsed.data);
    const requestLike = ["REPLENISHMENT_REQUEST", "STOCK_ADJUSTMENT_REQUEST", "PHARMACIST_ADVICE_REQUEST", "DOCUMENT_REQUEST"].includes(parsed.data.activityType);
    const reportLike = ["CASH_REPORT", "INVENTORY_SUBMISSION"].includes(parsed.data.activityType);
    await createEnterpriseCoreRecord({
      organizationId,
      actorUserId: session.userId,
      data: {
        moduleCode: requestLike ? "INTERNAL_REQUESTS" : reportLike ? "REPORTS" : "TASKS_OPERATIONS",
        recordType: requestLike ? "INTERNAL_REQUEST" : reportLike ? "REPORT" : "TASK",
        title: parsed.data.title,
        description: parsed.data.description,
        priority: parsed.data.priority,
        assignedToUserId: parsed.data.assignedToId || parsed.data.pharmacistId || undefined,
        departmentId: parsed.data.departmentId || undefined,
        dueAt: parsed.data.dueAt ? new Date(parsed.data.dueAt) : undefined,
        sourceModule: "PHARMACY_ACTIVITIES",
        sourceEntityType: "PharmacyActivityItem",
        sourceEntityId: activity.id,
        sectorCode: "PHARMACY",
        metadata: { activityType: parsed.data.activityType, resultEntityType: activity.resultEntityType, resultEntityId: activity.resultEntityId },
      },
    });
    await writeAuditLog({ userId: session.userId, action: "PHARMACY_ACTIVITY_CREATED", entity: "PharmacyActivityItem", entityId: activity.id, request, metadata: { organizationId, activityType: parsed.data.activityType, resultEntityId: activity.resultEntityId } });
    await writeApiLog({ request, statusCode: 201, userId: session.userId, startedAt }); return NextResponse.json({ ok: true, activity }, { status: 201 });
  } catch (error) { return NextResponse.json({ error: "CREATE_FAILED", message: error instanceof Error ? error.message : "Création impossible." }, { status: 400 }); }
}
