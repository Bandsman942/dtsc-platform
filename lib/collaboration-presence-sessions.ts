import { prisma } from "@/lib/prisma";
import {
  COLLABORATION_PRESENCE_DB_CHECKPOINT_MS,
  COLLABORATION_PRESENCE_REDIS_TTL_MS,
  clearCollaborationPresenceRedisLease,
  clearCollaborationPresenceRedisUserSummary,
  hasAnyActiveCollaborationPresenceRedisSession,
  refreshCollaborationPresenceRedisLease,
} from "@/lib/collaboration-presence-redis";

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

async function persistRedisPresenceCheckpoint({
  userId,
  clientSessionId,
  clientType,
  now,
  isNewLease,
  previousHeartbeatAt,
}: {
  userId: string;
  clientSessionId: string;
  clientType: CollaborationClientType;
  now: Date;
  isNewLease: boolean;
  previousHeartbeatAt: Date | null;
}) {
  const openSessions = await prisma.collaborationPresenceSession.findMany({
    where: { userId, clientSessionId, disconnectedAt: null },
    orderBy: { connectedAt: "desc" },
    take: 20,
  });
  const primary = openSessions[0] || null;
  const continuityBudgetMs = COLLABORATION_PRESENCE_DB_CHECKPOINT_MS + COLLABORATION_PRESENCE_REDIS_TTL_MS;
  const redisGapExpired = Boolean(
    isNewLease
      && previousHeartbeatAt
      && now.getTime() - previousHeartbeatAt.getTime() > COLLABORATION_PRESENCE_REDIS_TTL_MS
  );
  const dbGapExpired = Boolean(
    isNewLease
      && !previousHeartbeatAt
      && primary
      && now.getTime() - primary.lastHeartbeatAt.getTime() > continuityBudgetMs
  );
  const startNewSession = !primary || redisGapExpired || dbGapExpired;

  if (startNewSession) {
    if (openSessions.length) {
      await prisma.$transaction(
        openSessions.map((item) =>
          prisma.collaborationPresenceSession.update({
            where: { id: item.id },
            data: {
              disconnectedAt: previousHeartbeatAt || item.lastHeartbeatAt,
              disconnectReason: "HEARTBEAT_TIMEOUT",
            },
          })
        )
      );
    }
    await prisma.collaborationPresenceSession.create({
      data: {
        userId,
        clientSessionId,
        clientType,
        connectedAt: now,
        lastHeartbeatAt: now,
      },
    });
  } else if (primary) {
    if (openSessions.length > 1) {
      await prisma.$transaction(
        openSessions.slice(1).map((item) =>
          prisma.collaborationPresenceSession.update({
            where: { id: item.id },
            data: {
              disconnectedAt: item.lastHeartbeatAt,
              disconnectReason: "HEARTBEAT_TIMEOUT",
            },
          })
        )
      );
    }
    await prisma.collaborationPresenceSession.update({
      where: { id: primary.id },
      data: { lastHeartbeatAt: now, clientType },
    });
  }

  await prisma.user.update({ where: { id: userId }, data: { lastSeenAt: now } }).catch(() => null);
}

async function markCollaborationPresenceOnlineInPostgres({
  userId,
  clientSessionId,
  clientType,
}: {
  userId: string;
  clientSessionId: string;
  clientType: CollaborationClientType;
}) {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - COLLABORATION_PRESENCE_STALE_MS);

  const staleSessions = await prisma.collaborationPresenceSession.findMany({
    where: {
      userId,
      clientSessionId,
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
      clientSessionId,
      disconnectedAt: null,
      lastHeartbeatAt: { gte: staleBefore },
    },
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
        clientSessionId,
        clientType,
        connectedAt: now,
        lastHeartbeatAt: now,
      },
    });
  }

  await prisma.user.update({ where: { id: userId }, data: { lastSeenAt: now } }).catch(() => null);
  return now;
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
  const lease = await refreshCollaborationPresenceRedisLease({ userId, clientSessionId: sessionId, now });

  if (lease.mode === "REDIS") {
    if (lease.checkpointDue) {
      await persistRedisPresenceCheckpoint({
        userId,
        clientSessionId: sessionId,
        clientType: normalizedType,
        now,
        isNewLease: lease.isNewLease,
        previousHeartbeatAt: lease.previousHeartbeatAt,
      });
    }
    return now;
  }

  return markCollaborationPresenceOnlineInPostgres({
    userId,
    clientSessionId: sessionId,
    clientType: normalizedType,
  });
}

async function markCollaborationPresenceOfflineInPostgres({
  userId,
  clientSessionId,
  reason,
}: {
  userId: string;
  clientSessionId: string;
  reason: string;
}) {
  const now = new Date();
  await prisma.collaborationPresenceSession.updateMany({
    where: { userId, clientSessionId, disconnectedAt: null },
    data: { disconnectedAt: now, lastHeartbeatAt: now, disconnectReason: reason },
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
  const redisState = await clearCollaborationPresenceRedisLease({ userId, clientSessionId: sessionId });

  if (redisState.mode === "REDIS") {
    await prisma.collaborationPresenceSession.updateMany({
      where: { userId, clientSessionId: sessionId, disconnectedAt: null },
      data: { disconnectedAt: now, lastHeartbeatAt: now, disconnectReason: normalizedReason },
    });

    const otherSessions = await prisma.collaborationPresenceSession.findMany({
      where: { userId, disconnectedAt: null, clientSessionId: { not: sessionId } },
      select: { clientSessionId: true },
      orderBy: { lastHeartbeatAt: "desc" },
      take: 100,
    });
    const hasOtherLiveSession = await hasAnyActiveCollaborationPresenceRedisSession(
      userId,
      otherSessions.map((item) => item.clientSessionId)
    );

    if (hasOtherLiveSession === false) {
      await clearCollaborationPresenceRedisUserSummary(userId);
    }

    await prisma.user
      .update({
        where: { id: userId },
        data: { lastSeenAt: hasOtherLiveSession === false ? new Date(0) : now },
      })
      .catch(() => null);
    return now;
  }

  return markCollaborationPresenceOfflineInPostgres({
    userId,
    clientSessionId: sessionId,
    reason: normalizedReason,
  });
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
