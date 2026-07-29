import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getEnterpriseCoreV2Access } from "@/lib/enterprise/core-v2/access";
import { normalizeEnterpriseCoreV2Error } from "@/lib/enterprise/core-v2/errors";
import { transitionEnterpriseMeeting } from "@/lib/enterprise/core-v2/service";
import { enterpriseMeetingActionSchema } from "@/lib/enterprise/core-v2/validators";
import { notifyUsers } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string; id: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-meeting-action:${session.userId}`), 120, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { organizationId, id } = await params;
  const access = await getEnterpriseCoreV2Access({ session, organizationId, moduleCode: "MEETINGS", action: "submit" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = enterpriseMeetingActionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: "L’action demandée est invalide." }, { status: 400 });
  const meeting = await prisma.enterpriseMeeting.findFirst({ where: { id, organizationId, archivedAt: null }, include: { participants: true } });
  if (!meeting) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!access.canManage && meeting.organizerUserId !== session.userId) return NextResponse.json({ error: "Forbidden", message: "Seul l’organisateur ou un responsable peut changer l’état de la réunion." }, { status: 403 });
  const data = parsed.data;
  try {
    const updated = await transitionEnterpriseMeeting({ organizationId, meetingId: id, actorUserId: session.userId, action: data.action, revision: data.revision, comment: data.comment || undefined });
    if (data.action === "CANCEL") {
      const participantIds = meeting.participants.map((participantItem) => participantItem.userId).filter((userId) => userId !== session.userId);
      if (participantIds.length) await notifyUsers({ userIds: participantIds, organizationId, type: "ENTERPRISE_MEETING", title: "Réunion annulée", body: meeting.title, targetUrl: "/enterprise-modules/MEETINGS" });
    }
    await writeAuditLog({ userId: session.userId, action: `ENTERPRISE_MEETING_${data.action}`, entity: "EnterpriseMeeting", entityId: id, request: req, metadata: { organizationId, fromStatus: meeting.status, toStatus: updated?.status } });
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "meetings", meetingId: id, action: data.action } });
    return NextResponse.json({ ok: true, meeting: updated });
  } catch (error) {
    const normalized = normalizeEnterpriseCoreV2Error(error);
    await writeApiLog({ request: req, statusCode: normalized.status, userId: session.userId, startedAt, metadata: { organizationId, domain: "meetings", meetingId: id, action: data.action, error: normalized.code } });
    return NextResponse.json({ error: normalized.code, message: normalized.message }, { status: normalized.status });
  }
}
