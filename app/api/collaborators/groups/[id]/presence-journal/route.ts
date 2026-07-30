import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import { assertGroupMemberForSession, canManageGroup } from "@/lib/collaboration";
import { COLLABORATION_PRESENCE_STALE_MS, effectivePresenceDisconnectedAt } from "@/lib/collaboration-presence-sessions";
import { prisma } from "@/lib/prisma";

const CLIENT_TYPES = new Set(["MOBILE", "TABLET", "DESKTOP", "PWA", "UNKNOWN"]);
const SESSION_STATUSES = new Set(["ALL", "ONLINE", "OFFLINE"]);
const DURATION_FILTERS = new Set(["ALL", "UNDER_5", "5_60", "OVER_60"]);
const SORTS = new Set(["RECENT", "OLDEST", "LONGEST"]);

type Params = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const currentMember = await assertGroupMemberForSession(id, session);
  if (!currentMember || !canManageGroup(currentMember, session.role)) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt, metadata: { action: "presence_journal_denied", groupId: id } });
    return NextResponse.json({ error: "Forbidden", message: "Ce journal est réservé au propriétaire et aux administrateurs du groupe." }, { status: 403 });
  }

  const url = new URL(req.url);
  const search = (url.searchParams.get("search") || "").trim().toLocaleLowerCase().slice(0, 120);
  const requestedUserId = (url.searchParams.get("userId") || "").trim();
  const rawStatus = (url.searchParams.get("status") || "ALL").toUpperCase();
  const status = SESSION_STATUSES.has(rawStatus) ? rawStatus : "ALL";
  const rawClientType = (url.searchParams.get("clientType") || "ALL").toUpperCase();
  const clientType = rawClientType === "ALL" || CLIENT_TYPES.has(rawClientType) ? rawClientType : "ALL";
  const rawDuration = (url.searchParams.get("duration") || "ALL").toUpperCase();
  const duration = DURATION_FILTERS.has(rawDuration) ? rawDuration : "ALL";
  const rawSort = (url.searchParams.get("sort") || "RECENT").toUpperCase();
  const sort = SORTS.has(rawSort) ? rawSort : "RECENT";
  const page = Math.max(1, Math.min(Number(url.searchParams.get("page") || 1) || 1, 1000));
  const pageSize = Math.max(10, Math.min(Number(url.searchParams.get("pageSize") || 30) || 30, 100));
  const now = new Date();
  const from = parseDateBoundary(url.searchParams.get("from"), false) || new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const to = parseDateBoundary(url.searchParams.get("to"), true) || now;

  const members = await prisma.collaborationGroupMember.findMany({
    where: { groupId: id },
    select: {
      userId: true,
      status: true,
      role: true,
      joinedAt: true,
      leftAt: true,
      user: { select: { id: true, name: true, email: true, avatarUrl: true, jobTitle: true, lastSeenAt: true } },
    },
    orderBy: { joinedAt: "asc" },
    take: 300,
  });

  const eligibleMembers = members.filter((member) => {
    if (requestedUserId && member.userId !== requestedUserId) return false;
    if (!search) return true;
    return `${member.user.name} ${member.user.email} ${member.user.jobTitle || ""}`.toLocaleLowerCase().includes(search);
  });
  const memberByUserId = new Map(eligibleMembers.map((member) => [member.userId, member]));
  if (!eligibleMembers.length) {
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { action: "presence_journal", groupId: id, count: 0 } });
    return NextResponse.json({ sessions: [], members: members.map(memberOption), metrics: emptyMetrics(), page, pageSize, total: 0, hasMore: false });
  }

  const membershipWindows = eligibleMembers.map((member) => ({
    userId: member.userId,
    connectedAt: {
      gte: member.joinedAt > from ? member.joinedAt : from,
      lte: member.leftAt && member.leftAt < to ? member.leftAt : to,
    },
  }));

  const records = await prisma.collaborationPresenceSession.findMany({
    where: {
      OR: membershipWindows,
      ...(clientType !== "ALL" ? { clientType } : {}),
    },
    orderBy: { connectedAt: "desc" },
    take: 1000,
  });

  const normalized = records
    .map((record) => {
      const member = memberByUserId.get(record.userId);
      if (!member) return null;
      const effectiveDisconnected = effectivePresenceDisconnectedAt(record);
      const online = effectiveDisconnected === null && now.getTime() - record.lastHeartbeatAt.getTime() <= COLLABORATION_PRESENCE_STALE_MS;
      const endedAt = effectiveDisconnected || now;
      const durationSeconds = Math.max(0, Math.round((endedAt.getTime() - record.connectedAt.getTime()) / 1000));
      return {
        id: record.id,
        userId: record.userId,
        clientType: record.clientType,
        connectedAt: record.connectedAt,
        lastHeartbeatAt: record.lastHeartbeatAt,
        disconnectedAt: effectiveDisconnected,
        disconnectReason: record.disconnectReason || (effectiveDisconnected && !record.disconnectedAt ? "HEARTBEAT_TIMEOUT" : null),
        online,
        durationSeconds,
        member: memberOption(member),
      };
    })
    .filter((record): record is NonNullable<typeof record> => Boolean(record))
    .filter((record) => status === "ALL" || (status === "ONLINE" ? record.online : !record.online))
    .filter((record) => matchesDuration(record.durationSeconds, duration));

  normalized.sort((left, right) => {
    if (sort === "OLDEST") return new Date(left.connectedAt).getTime() - new Date(right.connectedAt).getTime();
    if (sort === "LONGEST") return right.durationSeconds - left.durationSeconds;
    return new Date(right.connectedAt).getTime() - new Date(left.connectedAt).getTime();
  });

  const total = normalized.length;
  const start = (page - 1) * pageSize;
  const sessions = normalized.slice(start, start + pageSize);
  const metrics = {
    totalSessions: total,
    onlineNow: new Set(normalized.filter((item) => item.online).map((item) => item.userId)).size,
    totalConnectedSeconds: normalized.reduce((sum, item) => sum + item.durationSeconds, 0),
    averageSessionSeconds: total ? Math.round(normalized.reduce((sum, item) => sum + item.durationSeconds, 0) / total) : 0,
  };

  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { action: "presence_journal", groupId: id, count: sessions.length } });
  return NextResponse.json({ sessions, members: members.map(memberOption), metrics, page, pageSize, total, hasMore: start + sessions.length < total, truncated: records.length >= 1000 });
}

function memberOption(member: {
  userId: string;
  status: string;
  role: string;
  joinedAt: Date;
  leftAt: Date | null;
  user: { id: string; name: string; email: string; avatarUrl: string | null; jobTitle: string | null; lastSeenAt: Date | null };
}) {
  return {
    userId: member.userId,
    status: member.status,
    role: member.role,
    joinedAt: member.joinedAt,
    leftAt: member.leftAt,
    user: member.user,
  };
}

function parseDateBoundary(value: string | null, endOfDay: boolean) {
  if (!value) return null;
  const date = new Date(value.length <= 10 ? `${value}T00:00:00.000Z` : value);
  if (Number.isNaN(date.getTime())) return null;
  if (endOfDay && value.length <= 10) date.setUTCHours(23, 59, 59, 999);
  return date;
}

function matchesDuration(seconds: number, filter: string) {
  if (filter === "UNDER_5") return seconds < 5 * 60;
  if (filter === "5_60") return seconds >= 5 * 60 && seconds <= 60 * 60;
  if (filter === "OVER_60") return seconds > 60 * 60;
  return true;
}

function emptyMetrics() {
  return { totalSessions: 0, onlineNow: 0, totalConnectedSeconds: 0, averageSessionSeconds: 0 };
}
