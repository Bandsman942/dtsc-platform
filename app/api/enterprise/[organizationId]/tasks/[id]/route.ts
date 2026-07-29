import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { canMutateOwnedObject, enterpriseTaskVisibilityWhere, getEnterpriseCoreV2Access } from "@/lib/enterprise/core-v2/access";
import { normalizeEnterpriseCoreV2Error } from "@/lib/enterprise/core-v2/errors";
import { getEnterpriseOperationalTimeline, updateEnterpriseTask } from "@/lib/enterprise/core-v2/service";
import { enterpriseTaskUpdateSchema } from "@/lib/enterprise/core-v2/validators";
import { notifyUser } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string; id: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId, id } = await params;
  const access = await getEnterpriseCoreV2Access({ session, organizationId, moduleCode: "TASKS_OPERATIONS", action: "read" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const task = await prisma.enterpriseTask.findFirst({ where: { ...enterpriseTaskVisibilityWhere({ organizationId, userId: session.userId, canSeeAll: access.canSeeAll }), id } });
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const timeline = await getEnterpriseOperationalTimeline({ organizationId, entityType: "EnterpriseTask", entityId: id });
  const links = await prisma.enterpriseEntityLink.findMany({ where: { organizationId, OR: [{ sourceEntityType: "EnterpriseTask", sourceEntityId: id }, { targetEntityType: "EnterpriseTask", targetEntityId: id }] }, orderBy: { createdAt: "desc" }, take: 20 });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "tasks", taskId: id } });
  return NextResponse.json({ task, timeline, links, canManage: access.canManage, currentUserId: session.userId });
}

export async function PATCH(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-task-update:${session.userId}`), 120, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { organizationId, id } = await params;
  const access = await getEnterpriseCoreV2Access({ session, organizationId, moduleCode: "TASKS_OPERATIONS", action: "submit" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = enterpriseTaskUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Modification invalide." }, { status: 400 });
  const existing = await prisma.enterpriseTask.findFirst({ where: { id, organizationId, archivedAt: null } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canMutateOwnedObject({ canManage: access.canManage, userId: session.userId, relatedUserIds: [existing.createdByUserId, existing.assignedToUserId] })) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const data = parsed.data;
    const task = await updateEnterpriseTask({
      organizationId,
      taskId: id,
      actorUserId: session.userId,
      revision: data.revision,
      data: {
        title: data.title,
        description: data.description === undefined ? undefined : data.description || null,
        priority: data.priority,
        assignedToUserId: data.assignedToUserId === undefined ? undefined : data.assignedToUserId || null,
        departmentId: data.departmentId === undefined ? undefined : data.departmentId || null,
        startAt: data.startAt === undefined ? undefined : data.startAt instanceof Date ? data.startAt : null,
        dueAt: data.dueAt === undefined ? undefined : data.dueAt instanceof Date ? data.dueAt : null,
      },
    });
    if (task?.assignedToUserId && task.assignedToUserId !== existing.assignedToUserId && task.assignedToUserId !== session.userId) {
      await notifyUser({ userId: task.assignedToUserId, organizationId, type: "ENTERPRISE_TASK", title: "Tâche réassignée", body: task.title, targetUrl: "/enterprise-modules/TASKS_OPERATIONS" });
    }
    await writeAuditLog({ userId: session.userId, action: "ENTERPRISE_TASK_UPDATED", entity: "EnterpriseTask", entityId: id, request: req, metadata: { organizationId, revision: data.revision } });
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "tasks", taskId: id } });
    return NextResponse.json({ ok: true, task });
  } catch (error) {
    const normalized = normalizeEnterpriseCoreV2Error(error);
    await writeApiLog({ request: req, statusCode: normalized.status, userId: session.userId, startedAt, metadata: { organizationId, domain: "tasks", taskId: id, error: normalized.code } });
    return NextResponse.json({ error: normalized.code, message: normalized.message }, { status: normalized.status });
  }
}
