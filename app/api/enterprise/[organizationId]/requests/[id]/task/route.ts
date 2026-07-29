import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getEnterpriseCoreV2Access } from "@/lib/enterprise/core-v2/access";
import { normalizeEnterpriseCoreV2Error } from "@/lib/enterprise/core-v2/errors";
import { createEnterpriseTask } from "@/lib/enterprise/core-v2/service";
import { enterpriseTaskCreateSchema } from "@/lib/enterprise/core-v2/validators";
import { notifyUser } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string; id: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-request-task:${session.userId}`), 100, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { organizationId, id } = await params;
  const requestAccess = await getEnterpriseCoreV2Access({ session, organizationId, moduleCode: "INTERNAL_REQUESTS", action: "submit" });
  const taskAccess = await getEnterpriseCoreV2Access({ session, organizationId, moduleCode: "TASKS_OPERATIONS", action: "submit" });
  if (!requestAccess || !taskAccess?.canCreate) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const requestRecord = await prisma.enterpriseRequest.findFirst({ where: { id, organizationId, archivedAt: null } });
  if (!requestRecord) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const isRelated = requestAccess.canManage || requestRecord.requestedByUserId === session.userId || requestRecord.assignedToUserId === session.userId;
  if (!isRelated) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!["SUBMITTED", "IN_REVIEW", "APPROVED"].includes(requestRecord.status)) {
    return NextResponse.json({ error: "Invalid request state", message: "Une tâche ne peut être créée depuis cette demande que lorsqu’elle est soumise, en revue ou approuvée." }, { status: 409 });
  }
  const parsed = enterpriseTaskCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Tâche invalide." }, { status: 400 });
  try {
    const data = parsed.data;
    const task = await createEnterpriseTask(organizationId, session.userId, {
      taskType: data.taskType,
      title: data.title,
      description: data.description || undefined,
      priority: data.priority,
      assignedToUserId: data.assignedToUserId || undefined,
      departmentId: data.departmentId || requestRecord.departmentId || undefined,
      startAt: data.startAt instanceof Date ? data.startAt : undefined,
      dueAt: data.dueAt instanceof Date ? data.dueAt : undefined,
      parentTaskId: data.parentTaskId || undefined,
      sourceModule: "INTERNAL_REQUESTS",
      sourceEntityType: "EnterpriseRequest",
      sourceEntityId: requestRecord.id,
    });
    if (task.assignedToUserId && task.assignedToUserId !== session.userId) {
      await notifyUser({ userId: task.assignedToUserId, organizationId, type: "ENTERPRISE_TASK", title: "Tâche issue d’une demande", body: task.title, targetUrl: "/enterprise-modules/TASKS_OPERATIONS" });
    }
    await writeAuditLog({ userId: session.userId, action: "ENTERPRISE_REQUEST_TASK_CREATED", entity: "EnterpriseTask", entityId: task.id, request: req, metadata: { organizationId, requestId: id } });
    await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt, metadata: { organizationId, domain: "requests", requestId: id, taskId: task.id } });
    return NextResponse.json({ ok: true, task }, { status: 201 });
  } catch (error) {
    const normalized = normalizeEnterpriseCoreV2Error(error);
    await writeApiLog({ request: req, statusCode: normalized.status, userId: session.userId, startedAt, metadata: { organizationId, domain: "requests", requestId: id, error: normalized.code } });
    return NextResponse.json({ error: normalized.code, message: normalized.message }, { status: normalized.status });
  }
}
