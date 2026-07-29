import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { enterpriseMeetingVisibilityWhere, getEnterpriseCoreV2Access } from "@/lib/enterprise/core-v2/access";
import { normalizeEnterpriseCoreV2Error } from "@/lib/enterprise/core-v2/errors";
import { createEnterpriseMeeting } from "@/lib/enterprise/core-v2/service";
import { enterpriseMeetingCreateSchema } from "@/lib/enterprise/core-v2/validators";
import { notifyUsers } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId } = await params;
  const access = await getEnterpriseCoreV2Access({ session, organizationId, moduleCode: "MEETINGS", action: "read" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page") || 1) || 1);
  const pageSize = Math.min(50, Math.max(5, Number(url.searchParams.get("pageSize") || 20) || 20));
  const view = url.searchParams.get("view") || "upcoming";
  const participant = url.searchParams.get("participant")?.trim() || "";
  const department = url.searchParams.get("department")?.trim() || "";
  const search = url.searchParams.get("search")?.trim() || "";
  const date = url.searchParams.get("date")?.trim() || "";
  const now = new Date();
  const filters: Prisma.EnterpriseMeetingWhereInput[] = [];
  if (view === "upcoming") filters.push({ startAt: { gte: now }, status: { not: "CANCELLED" } });
  if (view === "past") filters.push({ OR: [{ endAt: { lt: now } }, { status: "COMPLETED" }] });
  if (view === "cancelled") filters.push({ status: "CANCELLED" });
  if (participant) filters.push({ participants: { some: { userId: participant } } });
  if (department) filters.push({ departmentId: department });
  if (search) filters.push({ OR: [{ title: { contains: search, mode: "insensitive" } }, { agenda: { contains: search, mode: "insensitive" } }, { physicalLocation: { contains: search, mode: "insensitive" } }] });
  if (date) {
    const start = new Date(`${date}T00:00:00.000Z`);
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    filters.push({ startAt: { gte: start, lt: end } });
  }
  const where: Prisma.EnterpriseMeetingWhereInput = { AND: [enterpriseMeetingVisibilityWhere({ organizationId, userId: session.userId, canSeeAll: access.canSeeAll }), ...filters] };
  const [items, total] = await Promise.all([
    prisma.enterpriseMeeting.findMany({ where, include: { participants: true, decisions: { orderBy: { decidedAt: "desc" }, take: 5 } }, orderBy: { startAt: view === "past" ? "desc" : "asc" }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.enterpriseMeeting.count({ where }),
  ]);
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "meetings", view, page, pageSize } });
  return NextResponse.json({ items, pagination: { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) }, canManage: access.canManage, currentUserId: session.userId });
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-meetings:${session.userId}`), 80, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { organizationId } = await params;
  const access = await getEnterpriseCoreV2Access({ session, organizationId, moduleCode: "MEETINGS", action: "submit" });
  if (!access?.canCreate) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = enterpriseMeetingCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Vérifiez les informations de la réunion." }, { status: 400 });
  try {
    const data = parsed.data;
    const meeting = await createEnterpriseMeeting(organizationId, session.userId, {
      title: data.title,
      agenda: data.agenda || undefined,
      startAt: data.startAt,
      endAt: data.endAt,
      locationMode: data.locationMode,
      physicalLocation: data.physicalLocation || undefined,
      meetingLink: data.meetingLink || undefined,
      departmentId: data.departmentId || undefined,
      participants: data.participants,
      sourceModule: data.sourceModule || undefined,
      sourceEntityType: data.sourceEntityType || undefined,
      sourceEntityId: data.sourceEntityId || undefined,
    });
    const participantIds = meeting.participants.map((participantItem) => participantItem.userId).filter((userId) => userId !== session.userId);
    if (participantIds.length) {
      await notifyUsers({ userIds: participantIds, organizationId, type: "ENTERPRISE_MEETING", title: "Invitation à une réunion", body: meeting.title, targetUrl: "/enterprise-modules/MEETINGS" });
    }
    await writeAuditLog({ userId: session.userId, action: "ENTERPRISE_MEETING_CREATED", entity: "EnterpriseMeeting", entityId: meeting.id, request: req, metadata: { organizationId, participants: participantIds.length, startAt: meeting.startAt.toISOString() } });
    await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt, metadata: { organizationId, domain: "meetings" } });
    return NextResponse.json({ ok: true, meeting }, { status: 201 });
  } catch (error) {
    const normalized = normalizeEnterpriseCoreV2Error(error);
    await writeApiLog({ request: req, statusCode: normalized.status, userId: session.userId, startedAt, metadata: { organizationId, domain: "meetings", error: normalized.code } });
    return NextResponse.json({ error: normalized.code, message: normalized.message }, { status: normalized.status });
  }
}
