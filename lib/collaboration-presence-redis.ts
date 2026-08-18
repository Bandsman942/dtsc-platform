import { createHash } from "node:crypto";
import {
  redisRestCommand,
  redisRestPipeline,
  type RedisRestUnavailableReason,
} from "@/lib/redis-rest";
import { REDIS_OBSERVABILITY_METRICS, redisObservabilityMetricCommands } from "@/lib/scalability/redis-observability";

export const COLLABORATION_PRESENCE_REDIS_TTL_MS = 90_000;
export const COLLABORATION_PRESENCE_HISTORY_TTL_MS = 35 * 24 * 60 * 60 * 1000;
export const COLLABORATION_PRESENCE_DB_CHECKPOINT_MS = 180_000;

export type CollaborationPresenceRedisMode =
  | { mode: "REDIS" }
  | { mode: "FALLBACK"; reason: RedisRestUnavailableReason };

export type CollaborationPresenceLeaseRefresh =
  | {
      mode: "REDIS";
      isNewLease: boolean;
      checkpointDue: boolean;
      previousHeartbeatAt: Date | null;
    }
  | { mode: "FALLBACK"; reason: RedisRestUnavailableReason };

export type CollaborationPresenceSessionSnapshot = {
  online: boolean;
  lastHeartbeatAt: Date | null;
};

function digest(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

function userToken(userId: string) {
  return digest(userId);
}

function sessionToken(clientSessionId: string) {
  return digest(clientSessionId);
}

function activeSessionKey(userId: string, clientSessionId: string) {
  return `dtsc:presence:v2:session:${userToken(userId)}:${sessionToken(clientSessionId)}`;
}

function sessionHistoryKey(userId: string, clientSessionId: string) {
  return `dtsc:presence:v2:last:${userToken(userId)}:${sessionToken(clientSessionId)}`;
}

function userPresenceKey(userId: string) {
  return `dtsc:presence:v2:user:${userToken(userId)}`;
}

function checkpointKey(userId: string, clientSessionId: string) {
  return `dtsc:presence:v2:checkpoint:${userToken(userId)}:${sessionToken(clientSessionId)}`;
}

function snapshotKey(userId: string, clientSessionId: string) {
  return `${userId}:${clientSessionId}`;
}

function parseTimestamp(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  const date = new Date(numeric);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function refreshCollaborationPresenceRedisLease({
  userId,
  clientSessionId,
  now = new Date(),
}: {
  userId: string;
  clientSessionId: string;
  now?: Date;
}): Promise<CollaborationPresenceLeaseRefresh> {
  const activeKey = activeSessionKey(userId, clientSessionId);
  const historyKey = sessionHistoryKey(userId, clientSessionId);
  const currentUserKey = userPresenceKey(userId);
  const durableCheckpointKey = checkpointKey(userId, clientSessionId);
  const nowMs = now.getTime();

  const outcome = await redisRestPipeline([
    ["SET", activeKey, "1", "PX", COLLABORATION_PRESENCE_REDIS_TTL_MS, "NX"],
    ["PEXPIRE", activeKey, COLLABORATION_PRESENCE_REDIS_TTL_MS],
    ["GET", historyKey],
    ["SET", historyKey, nowMs, "PX", COLLABORATION_PRESENCE_HISTORY_TTL_MS],
    ["SET", currentUserKey, nowMs, "PX", COLLABORATION_PRESENCE_REDIS_TTL_MS],
    ["SET", durableCheckpointKey, "1", "PX", COLLABORATION_PRESENCE_DB_CHECKPOINT_MS, "NX"],
    ...redisObservabilityMetricCommands(REDIS_OBSERVABILITY_METRICS.presenceLeaseRedis, 1, now),
  ]);

  if (!outcome.available) return { mode: "FALLBACK", reason: outcome.reason };

  const isNewLease = outcome.result[0]?.result === "OK";
  const checkpointDue = isNewLease || outcome.result[5]?.result === "OK";
  return {
    mode: "REDIS",
    isNewLease,
    checkpointDue,
    previousHeartbeatAt: parseTimestamp(outcome.result[2]?.result),
  };
}

export async function clearCollaborationPresenceRedisLease({
  userId,
  clientSessionId,
}: {
  userId: string;
  clientSessionId: string;
}): Promise<CollaborationPresenceRedisMode> {
  const outcome = await redisRestPipeline([
    ["DEL", activeSessionKey(userId, clientSessionId)],
    ["DEL", checkpointKey(userId, clientSessionId)],
  ]);
  if (!outcome.available) return { mode: "FALLBACK", reason: outcome.reason };
  return { mode: "REDIS" };
}

export async function clearCollaborationPresenceRedisUserSummary(userId: string) {
  return redisRestCommand<number>(["DEL", userPresenceKey(userId)]);
}

export async function hasAnyActiveCollaborationPresenceRedisSession(
  userId: string,
  clientSessionIds: string[]
): Promise<boolean | null> {
  const ids = [...new Set(clientSessionIds.map((item) => item.trim()).filter(Boolean))].slice(0, 100);
  if (!ids.length) return false;

  const outcome = await redisRestCommand<Array<string | null>>([
    "MGET",
    ...ids.map((clientSessionId) => activeSessionKey(userId, clientSessionId)),
  ]);
  if (!outcome.available) return null;
  return Array.isArray(outcome.result) && outcome.result.some((value) => value !== null);
}

export async function getCollaborationPresenceRedisMap(userIds: string[]) {
  const ids = [...new Set(userIds.map((item) => item.trim()).filter(Boolean))].slice(0, 2_000);
  if (!ids.length) return new Map<string, Date>();

  const outcome = await redisRestPipeline([
    ["MGET", ...ids.map(userPresenceKey)],
    ...redisObservabilityMetricCommands(REDIS_OBSERVABILITY_METRICS.presenceReadRedis),
  ]);
  if (!outcome.available) return null;

  const values = Array.isArray(outcome.result[0]?.result)
    ? (outcome.result[0]?.result as Array<string | number | null>)
    : [];
  const now = Date.now();
  const map = new Map<string, Date>();
  ids.forEach((userId, index) => {
    const timestamp = parseTimestamp(values[index]);
    if (timestamp && now - timestamp.getTime() <= COLLABORATION_PRESENCE_REDIS_TTL_MS) {
      map.set(userId, timestamp);
    }
  });
  return map;
}

export async function getCollaborationPresenceRedisSessionSnapshots(
  sessions: Array<{ userId: string; clientSessionId: string }>
) {
  const unique = [...new Map(
    sessions
      .filter((item) => item.userId && item.clientSessionId)
      .map((item) => [snapshotKey(item.userId, item.clientSessionId), item])
  ).values()].slice(0, 1_000);
  if (!unique.length) return new Map<string, CollaborationPresenceSessionSnapshot>();

  const outcome = await redisRestPipeline([
    ["MGET", ...unique.map((item) => activeSessionKey(item.userId, item.clientSessionId))],
    ["MGET", ...unique.map((item) => sessionHistoryKey(item.userId, item.clientSessionId))],
  ]);
  if (!outcome.available) return null;

  const activeValues = Array.isArray(outcome.result[0]?.result)
    ? (outcome.result[0]?.result as Array<string | null>)
    : [];
  const historyValues = Array.isArray(outcome.result[1]?.result)
    ? (outcome.result[1]?.result as Array<string | number | null>)
    : [];
  const now = Date.now();
  const map = new Map<string, CollaborationPresenceSessionSnapshot>();

  unique.forEach((item, index) => {
    const lastHeartbeatAt = parseTimestamp(historyValues[index]);
    const active = activeValues[index] !== null && activeValues[index] !== undefined;
    map.set(snapshotKey(item.userId, item.clientSessionId), {
      online: Boolean(active && lastHeartbeatAt && now - lastHeartbeatAt.getTime() <= COLLABORATION_PRESENCE_REDIS_TTL_MS),
      lastHeartbeatAt,
    });
  });

  return map;
}

export function collaborationPresenceRedisSnapshotKey(userId: string, clientSessionId: string) {
  return snapshotKey(userId, clientSessionId);
}
