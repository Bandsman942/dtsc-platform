import { deleteCachedPresence, writeCachedPresence } from "@/lib/collaboration-presence-cache";
import { prisma } from "@/lib/prisma";

export const COLLABORATION_PRESENCE_STALE_MS = 60_000;

export const COLLABORATION_CLIENT_TYPES = ["MOBILE", "TABLET", "DESKTOP", "PWA", "UNKNOWN"] as const;
export type CollaborationClientType = (typeof COLLABORATION_CLIENT_TYPES)[number];

function normalizedClientSessionId(value: string | null | undefined, userId: string) {
  const trimmed = value?.trim().slice(0, 160);
  return trimmed || `legacy-${userId}`;
}

function normalizedClientType(value: string | null | undefined): CollaborationClientType {
  return COLLABORATION_CLIENT_TYPES.includes(value as CollaborationClientType) ? (value as CollaborationClientType) : "UNKNOWN";
}

async function persistPresenceHeartbeat({
  userId,
  sessionId,
  clientType,
  now,
}: {
  userId: string;
  sessionId: string;
  clientType: CollaborationClientType;
  now: Date;
}) {
  const staleBefore = new Date(now.getTime() - COLLABORATION_PRESENCE_STALE_MS);

  const staleSessions = await prisma.collaborationPresenceSession.findMany({
    where: {
      userId,
      clientSessionId: sessionId,
      disconnectedAt: null,
      lastHeartbeatAt: { lt: staleBefore },
    },
    select: { id: true, lastHeartbeatAt: true },
    take: 20,
  });

  if (staleSessions.length) {
    await prisma.$transaction(
      staleSessions.map((item) =>
        prisma.collaborationPresenceSession.update({
          where: { id: item.id },
          data: { disconnectedAt: item.lastHeartbeatAt, disconnectReason: "HEARTBEAT_TIMEOUT" },
        })
      )
    );
  }

  const openSession = await prisma.collaborationPresenceSession.findFirst({
    where: {
      userId,
      clientSessionId: sessionId,
      disconnectedAt: null,
      lastHeartbeatAt: { gte: staleBefore },
    },
    select: { id: true },
    orderBy: { connectedAt: "desc" },
  });

  if (openSession) {
    await prisma.collaborationPresenceSession.update({
      where: { id: openSession.id },
      data: { lastHeartbeatAt: now, clientType },
    });
  } else {
    await prisma.collaborationPresenceSession.create({
      data: {
        userId,
        clientSessionId: sessionId,
        clientType,
        connectedAt: now,
        lastHeartbeatAt: now,
      },
    });
  }

  await prisma.user.update({ where: { id: userId }, data: { lastSeenAt: now } }).catch(() => null);
}

export async function markCollaborationPresenceOnline({
  userId,
  clientSessionId,
  clientType,
}: {
  userId: string;
  clientSessionId?: string | null;
  clientType?: string | null;
}) {
  const now = new Date();
  const sessionId = normalizedClientSessionId(clientSessionId, userId);
  const normalizedType = normalizedClientType(clientType);
  const cacheResult = await writeCachedPresence({
    userId,
    clientSessionId: sessionId,
    clientType: normalizedType,
    heartbeatAt: now.toISOString(),
  });

  // Redis is the fast source for live presence. PostgreSQL keeps the durable
  // journal, but heartbeat writes are coalesced to avoid write amplification.
  if (cacheResult.shouldPersist) {
    await persistPresenceHeartbeat({ userId, sessionId, clientType: normalizedType, now });
  }

  return now;
}

export async function markCollaborationPresenceOffline({
  userId,
  clientSessionId,
  reason,
}: {
  userId: string;
  clientSessionId?: string | null;
  reason?: string | null;
}) {
  const now = new Date();
  const sessionId = normalizedClientSessionId(clientSessionId, userId);
  const normalizedReason = reason?.trim().slice(0, 80) || "CLIENT_OFFLINE";

  await deleteCachedPresence(userId, sessionId);

  await prisma.collaborationPresenceSession.updateMany({
    where: { userId, clientSessionId: sessionId, disconnectedAt: null },
    data: { disconnectedAt: now, lastHeartbeatAt: now, disconnectReason: normalizedReason },
  });

  const anotherLiveSession = await prisma.collaborationPresenceSession.findFirst({
    where: {
      userId,
      disconnectedAt: null,
      lastHeartbeatAt: { gte: new Date(now.getTime() - COLLABORATION_PRESENCE_STALE_MS) },
    },
    select: { id: true },
  });

  await prisma.user
    .update({ where: { id: userId }, data: { lastSeenAt: anotherLiveSession ? now : new Date(0) } })
    .catch(() => null);
  return now;
}

export function effectivePresenceDisconnectedAt({
  disconnectedAt,
  lastHeartbeatAt,
  now = new Date(),
}: {
  disconnectedAt: Date | null;
  lastHeartbeatAt: Date;
  now?: Date;
}) {
  if (disconnectedAt) return disconnectedAt;
  if (now.getTime() - lastHeartbeatAt.getTime() > COLLABORATION_PRESENCE_STALE_MS) return lastHeartbeatAt;
  return null;
}
