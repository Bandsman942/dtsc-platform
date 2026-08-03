import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getEnterpriseCoreV2Access } from "@/lib/enterprise/core-v2/access";
import { normalizeEnterpriseCoreV2Error } from "@/lib/enterprise/core-v2/errors";
import { createTaskFromMeetingDecision } from "@/lib/enterprise/core-v2/service";
import { enterpriseMeetingDecisionTaskSchema } from "@/lib/enterprise/core-v2/validators";
import { notifyUser } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";
import { workCoordinationDeepLink } from "@/lib/standard-work-coordination/deep-links";

type Params = { params: Promise<{ organizationId: string; id: string; decisionId: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-meeting-decision-task:${session.userId}`), 80, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { organizationId, id, decisionId } = await params;
  const meetingAccess = await getEnterpriseCoreV2Access({ session, organizationId, moduleCode: "MEETINGS", action: "submit" });
  const taskAccess = await getEnterpriseCoreV2Access({ session, organizationId, moduleCode: "TASKS_OPERATIONS", action: "submit" });
  if (!meetingAccess || !taskAccess?.canCreate) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const meeting = await prisma.enterpriseMeeting.findFirst({ where: { id, organizationId, archivedAt: null }, select: { organizerUserId: true } });
  if (!meeting) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!meetingAccess.canManage && meeting.organizerUserId !== session.userId) return NextResponse.json({ error: "Forbidden", message: "Seul l’organisateur ou un responsable peut créer une tâche depuis une décision." }, { status: 403 });
  const parsed = enterpriseMeetingDecisionTaskSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Tâche invalide." }, { status: 400 });
  const decision = await prisma.enterpriseMeetingDecision.findFirst({ where: { id: decisionId, meetingId: id, organizationId }, select: { title: true } });
  if (!decision) return NextResponse.json({ error: "Not found", message: "Décision de réunion introuvable." }, { status: 404 });
  try {
    const data = parsed.data;
    const task = await createTaskFromMeetingDecision({
      organizationId,
      meetingId: id,
      decisionId,
      actorUserId: session.userId,
      input: {
        taskType: "ACTION",
        title: data.title || decision.title,
        description: data.description || undefined,
        priority: data.priority,
        assignedToUserId: data.assignedToUserId || undefined,
        departmentId: data.departmentId || undefined,
        dueAt: data.dueAt instanceof Date ? data.dueAt : undefined,
      },
    });
    await prisma.enterpriseMeetingAction.upsert({
      where: { organizationId_meetingId_taskId: { organizationId, meetingId: id, taskId: task.id } },
      create: { organizationId, meetingId: id, taskId: task.id, createdById: session.userId },
      update: {},
    });
    if (task.assignedToUserId && task.assignedToUserId !== session.userId) await notifyUser({ userId: task.assignedToUserId, organizationId, type: "ENTERPRISE_TASK", title: "Action issue d’une réunion", body: task.title, targetUrl: workCoordinationDeepLink("TASK", task.id) });
    await writeAuditLog({ userId: session.userId, action: "ENTERPRISE_MEETING_DECISION_TASK_CREATED", entity: "EnterpriseTask", entityId: task.id, request: req, metadata: { organizationId, meetingId: id, decisionId, meetingActionLinked: true } });
    await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt, metadata: { organizationId, domain: "meetings", meetingId: id, decisionId, taskId: task.id } });
    return NextResponse.json({ ok: true, task });
  } catch (error) {
    const normalized = normalizeEnterpriseCoreV2Error(error);
    return NextResponse.json({ error: normalized.code, message: normalized.message }, { status: normalized.status });
  }
}
