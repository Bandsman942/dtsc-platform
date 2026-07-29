import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { enterpriseMeetingVisibilityWhere, getEnterpriseCoreV2Access } from "@/lib/enterprise/core-v2/access";
import { normalizeEnterpriseCoreV2Error } from "@/lib/enterprise/core-v2/errors";
import { getEnterpriseOperationalTimeline, updateEnterpriseMeeting } from "@/lib/enterprise/core-v2/service";
import { enterpriseMeetingUpdateSchema } from "@/lib/enterprise/core-v2/validators";
import { notifyUsers } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string; id: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId, id } = await params;
  const access = await getEnterpriseCoreV2Access({ session, organizationId, moduleCode: "MEETINGS", action: "read" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const meeting = await prisma.enterpriseMeeting.findFirst({ where: { ...enterpriseMeetingVisibilityWhere({ organizationId, userId: session.userId, canSeeAll: access.canSeeAll }), id }, include: { participants: true, decisions: { orderBy: { decidedAt: "desc" } } } });
  if (!meeting) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const [timeline, links] = await Promise.all([
    getEnterpriseOperationalTimeline({ organizationId, entityType: "EnterpriseMeeting", entityId: id }),
    prisma.enterpriseEntityLink.findMany({ where: { organizationId, OR: [{ sourceEntityType: "EnterpriseMeeting", sourceEntityId: id }, { targetEntityType: "EnterpriseMeeting", targetEntityId: id }] }, orderBy: { createdAt: "desc" }, take: 30 }),
  ]);
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "meetings", meetingId: id } });
  return NextResponse.json({ meeting, timeline, links, canManage: access.canManage, currentUserId: session.userId });
}

export async function PATCH(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-meeting-update:${session.userId}`), 100, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { organizationId, id } = await params;
  const access = await getEnterpriseCoreV2Access({ session, organizationId, moduleCode: "MEETINGS", action: "submit" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = enterpriseMeetingUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Modification invalide." }, { status: 400 });
  const existing = await prisma.enterpriseMeeting.findFirst({ where: { id, organizationId, archivedAt: null }, include: { participants: true } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!access.canManage && existing.organizerUserId !== session.userId) return NextResponse.json({ error: "Forbidden", message: "Seul l’organisateur ou un responsable peut modifier la réunion." }, { status: 403 });
  try {
    const data = parsed.data;
    const meeting = await updateEnterpriseMeeting({
      organizationId,
      meetingId: id,
      actorUserId: session.userId,
      revision: data.revision,
      data: {
        title: data.title,
        agenda: data.agenda === undefined ? undefined : data.agenda || null,
        startAt: data.startAt === undefined ? undefined : data.startAt instanceof Date ? data.startAt : null,
        endAt: data.endAt === undefined ? undefined : data.endAt instanceof Date ? data.endAt : null,
        locationMode: data.locationMode,
        physicalLocation: data.physicalLocation === undefined ? undefined : data.physicalLocation || null,
        meetingLink: data.meetingLink === undefined ? undefined : data.meetingLink || null,
        minutes: data.minutes === undefined ? undefined : data.minutes || null,
        departmentId: data.departmentId === undefined ? undefined : data.departmentId || null,
        participants: data.participants,
      },
    });
    const participantIds = meeting?.participants.map((participantItem) => participantItem.userId).filter((userId) => userId !== session.userId) || [];
    if (participantIds.length) await notifyUsers({ userIds: participantIds, organizationId, type: "ENTERPRISE_MEETING", title: "Réunion mise à jour", body: meeting?.title || existing.title, targetUrl: "/enterprise-modules/MEETINGS" });
    await writeAuditLog({ userId: session.userId, action: "ENTERPRISE_MEETING_UPDATED", entity: "EnterpriseMeeting", entityId: id, request: req, metadata: { organizationId, revision: data.revision, participants: participantIds.length } });
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "meetings", meetingId: id } });
    return NextResponse.json({ ok: true, meeting });
  } catch (error) {
    const normalized = normalizeEnterpriseCoreV2Error(error);
    await writeApiLog({ request: req, statusCode: normalized.status, userId: session.userId, startedAt, metadata: { organizationId, domain: "meetings", meetingId: id, error: normalized.code } });
    return NextResponse.json({ error: normalized.code, message: normalized.message }, { status: normalized.status });
  }
}
