import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { notifyUsers } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";
import {
  applyMeetingCoordinationAction,
  getMeetingCoordinationContext,
  loadMeetingCoordination,
  meetingCoordinationActionSchema,
  MeetingCoordinationError,
} from "@/lib/standard-work-coordination/meeting-coordination";

type Params = { params: Promise<{ organizationId: string; id: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const { organizationId, id } = await params;
  const context = await getMeetingCoordinationContext({ session, organizationId, meetingId: id, action: "read" });
  if (!context) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  const [coordination, tasks] = await Promise.all([
    loadMeetingCoordination(organizationId, id),
    prisma.enterpriseTask.findMany({ where: { organizationId, archivedAt: null, status: { in: ["TODO", "IN_PROGRESS", "BLOCKED", "PENDING_APPROVAL"] } }, select: { id: true, title: true, status: true, assignedToUserId: true }, orderBy: { updatedAt: "desc" }, take: 300 }),
  ]);
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, meetingId: id, domain: "meeting-coordination" } });
  return NextResponse.json({ meeting: context.meeting, coordination, tasks, capabilities: { canUpdate: context.canMutate, canPublishMinutes: context.canMutate, canCreateFollowUpActions: context.canMutate } });
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `meeting-coordination:${session.userId}`), 180, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  const { organizationId, id } = await params;
  const context = await getMeetingCoordinationContext({ session, organizationId, meetingId: id, action: "write" });
  if (!context) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (!context.canMutate) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const parsed = meetingCoordinationActionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message || "Action réunion invalide." }, { status: 400 });
  try {
    const result = await applyMeetingCoordinationAction({ organizationId, meetingId: id, actorUserId: session.userId, payload: parsed.data });
    const coordination = await loadMeetingCoordination(organizationId, id);
    if (parsed.data.action === "SAVE_MINUTES" && parsed.data.publish) {
      const recipientIds = [...new Set(context.meeting.participants.map((participant) => participant.userId).filter((userId) => userId !== session.userId))];
      if (recipientIds.length) await notifyUsers({ userIds: recipientIds, organizationId, type: "ENTERPRISE_MEETING", title: "Compte rendu publié", body: context.meeting.title, targetUrl: `/enterprise-modules/MEETINGS?meeting=${encodeURIComponent(id)}` });
    }
    await writeAuditLog({ userId: session.userId, action: `ENTERPRISE_MEETING_${parsed.data.action}`, entity: "EnterpriseMeeting", entityId: id, request: req, metadata: { organizationId } });
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, meetingId: id, action: parsed.data.action, domain: "meeting-coordination" } });
    return NextResponse.json({ ok: true, result, coordination });
  } catch (error) {
    const known = error instanceof MeetingCoordinationError ? error : null;
    const status = known?.status || 500;
    const code = known?.code || "INTERNAL_ERROR";
    await writeApiLog({ request: req, statusCode: status, userId: session.userId, startedAt, metadata: { organizationId, meetingId: id, action: parsed.data.action, code } });
    return NextResponse.json({ error: code, message: known?.message || "L’action sur la réunion a échoué." }, { status });
  }
}
