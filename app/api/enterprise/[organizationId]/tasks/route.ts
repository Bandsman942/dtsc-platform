import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { enterpriseTaskVisibilityWhere, getEnterpriseCoreV2Access } from "@/lib/enterprise/core-v2/access";
import { normalizeEnterpriseCoreV2Error } from "@/lib/enterprise/core-v2/errors";
import { createEnterpriseTask } from "@/lib/enterprise/core-v2/service";
import { enterpriseTaskCreateSchema } from "@/lib/enterprise/core-v2/validators";
import { notifyUser } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string }> };

function pageParams(url: URL) {
  const page = Math.max(1, Number(url.searchParams.get("page") || 1) || 1);
  const pageSize = Math.min(50, Math.max(5, Number(url.searchParams.get("pageSize") || 20) || 20));
  return { page, pageSize };
}

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId } = await params;
  const access = await getEnterpriseCoreV2Access({ session, organizationId, moduleCode: "TASKS_OPERATIONS", action: "read" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const { page, pageSize } = pageParams(url);
  const search = url.searchParams.get("search")?.trim() || "";
  const status = url.searchParams.get("status")?.trim() || "";
  const priority = url.searchParams.get("priority")?.trim() || "";
  const assignee = url.searchParams.get("assignee")?.trim() || "";
  const department = url.searchParams.get("department")?.trim() || "";
  const overdue = url.searchParams.get("overdue") === "true";
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const now = new Date();

  const filters: Prisma.EnterpriseTaskWhereInput[] = [];
  if (search) filters.push({ OR: [{ title: { contains: search, mode: "insensitive" } }, { description: { contains: search, mode: "insensitive" } }] });
  if (status) filters.push({ status });
  if (priority) filters.push({ priority });
  if (assignee) filters.push({ assignedToUserId: assignee });
  if (department) filters.push({ departmentId: department });
  if (overdue) filters.push({ dueAt: { lt: now }, status: { in: ["TODO", "IN_PROGRESS", "BLOCKED"] } });
  if (from || to) {
    const dueAt: Prisma.DateTimeNullableFilter = {};
    if (from) dueAt.gte = new Date(from);
    if (to) dueAt.lte = new Date(to);
    filters.push({ dueAt });
  }

  const where: Prisma.EnterpriseTaskWhereInput = {
    AND: [enterpriseTaskVisibilityWhere({ organizationId, userId: session.userId, canSeeAll: access.canSeeAll }), ...filters],
  };
  const [items, total] = await Promise.all([
    prisma.enterpriseTask.findMany({ where, orderBy: [{ dueAt: "asc" }, { updatedAt: "desc" }], skip: (page - 1) * pageSize, take: pageSize }),
    prisma.enterpriseTask.count({ where }),
  ]);
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "tasks", page, pageSize } });
  return NextResponse.json({ items, pagination: { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) }, canManage: access.canManage, currentUserId: session.userId });
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-tasks:${session.userId}`), 100, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests", message: "Trop d’actions sur les tâches en peu de temps." }, { status: 429 });
  const { organizationId } = await params;
  const access = await getEnterpriseCoreV2Access({ session, organizationId, moduleCode: "TASKS_OPERATIONS", action: "submit" });
  if (!access?.canCreate) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = enterpriseTaskCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Vérifiez les informations de la tâche." }, { status: 400 });

  try {
    const data = parsed.data;
    const task = await createEnterpriseTask(organizationId, session.userId, {
      taskType: data.taskType,
      title: data.title,
      description: data.description || undefined,
      priority: data.priority,
      assignedToUserId: data.assignedToUserId || undefined,
      departmentId: data.departmentId || undefined,
      startAt: data.startAt instanceof Date ? data.startAt : undefined,
      dueAt: data.dueAt instanceof Date ? data.dueAt : undefined,
      parentTaskId: data.parentTaskId || undefined,
      sourceModule: data.sourceModule || undefined,
      sourceEntityType: data.sourceEntityType || undefined,
      sourceEntityId: data.sourceEntityId || undefined,
    });
    if (task.assignedToUserId && task.assignedToUserId !== session.userId) {
      await notifyUser({ userId: task.assignedToUserId, organizationId, type: "ENTERPRISE_TASK", title: "Nouvelle tâche assignée", body: task.title, targetUrl: "/enterprise-modules/TASKS_OPERATIONS" });
    }
    await writeAuditLog({ userId: session.userId, action: "ENTERPRISE_TASK_CREATED", entity: "EnterpriseTask", entityId: task.id, request: req, metadata: { organizationId, assignedToUserId: task.assignedToUserId, taskType: task.taskType } });
    await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt, metadata: { organizationId, domain: "tasks" } });
    return NextResponse.json({ ok: true, task }, { status: 201 });
  } catch (error) {
    const normalized = normalizeEnterpriseCoreV2Error(error);
    await writeApiLog({ request: req, statusCode: normalized.status, userId: session.userId, startedAt, metadata: { organizationId, domain: "tasks", error: normalized.code } });
    return NextResponse.json({ error: normalized.code, message: normalized.message }, { status: normalized.status });
  }
}
