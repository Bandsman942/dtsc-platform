const PRESENCE_PREFIX = "dtsc:presence:v1";
const PRESENCE_TTL_SECONDS = 120;
const PERSIST_INTERVAL_SECONDS = 45;

type PresencePayload = {
  userId: string;
  clientSessionId: string;
  clientType: string;
  heartbeatAt: string;
};

async function upstashCommand<T>(command: unknown[]): Promise<T | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
    cache: "no-store",
    signal: AbortSignal.timeout(2_000),
  });
  if (!response.ok) throw new Error(`Presence cache command failed with ${response.status}`);
  const payload = (await response.json()) as { result: T };
  return payload.result;
}

function userKey(userId: string) {
  return `${PRESENCE_PREFIX}:user:${userId}`;
}

function sessionKey(userId: string, clientSessionId: string) {
  return `${PRESENCE_PREFIX}:session:${userId}:${clientSessionId}`;
}

function persistKey(userId: string, clientSessionId: string) {
  return `${PRESENCE_PREFIX}:persist:${userId}:${clientSessionId}`;
}

export async function writeCachedPresence(payload: PresencePayload) {
  const encoded = JSON.stringify(payload);
  try {
    await Promise.all([
      upstashCommand(["SET", userKey(payload.userId), encoded, "EX", PRESENCE_TTL_SECONDS]),
      upstashCommand(["SET", sessionKey(payload.userId, payload.clientSessionId), encoded, "EX", PRESENCE_TTL_SECONDS]),
    ]);
  } catch (error) {
    console.error("Presence cache write failed", error);
    return { cached: false, shouldPersist: true };
  }

  try {
    const acquired = await upstashCommand<string | null>([
      "SET",
      persistKey(payload.userId, payload.clientSessionId),
      payload.heartbeatAt,
      "NX",
      "EX",
      PERSIST_INTERVAL_SECONDS,
    ]);
    return { cached: true, shouldPersist: acquired === "OK" };
  } catch (error) {
    console.error("Presence persistence gate failed", error);
    return { cached: true, shouldPersist: true };
  }
}

export async function deleteCachedPresence(userId: string, clientSessionId: string) {
  try {
    await Promise.all([
      upstashCommand(["DEL", sessionKey(userId, clientSessionId)]),
      upstashCommand(["DEL", userKey(userId)]),
      upstashCommand(["DEL", persistKey(userId, clientSessionId)]),
    ]);
  } catch (error) {
    console.error("Presence cache delete failed", error);
  }
}

export async function getCachedPresenceMap(userIds: string[]) {
  const ids = [...new Set(userIds)].filter(Boolean);
  const map = new Map<string, Date>();
  if (!ids.length) return map;
  try {
    const values = await upstashCommand<Array<string | null>>(["MGET", ...ids.map(userKey)]);
    if (!values) return map;
    values.forEach((value, index) => {
      if (!value) return;
      try {
        const payload = JSON.parse(value) as PresencePayload;
        const heartbeatAt = new Date(payload.heartbeatAt);
        if (Number.isFinite(heartbeatAt.getTime())) map.set(ids[index], heartbeatAt);
      } catch {
        // Ignore malformed ephemeral cache entries and fall back to durable presence.
      }
    });
  } catch (error) {
    console.error("Presence cache read failed", error);
  }
  return map;
}
