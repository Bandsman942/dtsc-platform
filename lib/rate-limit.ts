type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

function localRateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const current = buckets.get(key);

  if (!current || current.resetAt < now) {
    const resetAt = now + windowMs;
    buckets.set(key, { count: 1, resetAt });
    return { ok: true, remaining: limit - 1, resetAt };
  }

  if (current.count >= limit) {
    return { ok: false, remaining: 0, resetAt: current.resetAt };
  }

  current.count += 1;
  return { ok: true, remaining: limit - current.count, resetAt: current.resetAt };
}

async function upstashCommand<T>(command: unknown[]) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    return null;
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Upstash rate limit command failed with ${response.status}`);
  }

  return (await response.json()) as { result: T };
}

export async function rateLimit(key: string, limit: number, windowMs: number) {
  const safeKey = `dtsc:rl:${key.replace(/[^a-zA-Z0-9:_-]/g, "_")}`;
  const resetAt = Date.now() + windowMs;

  try {
    const counter = await upstashCommand<number>(["INCR", safeKey]);
    if (counter) {
      if (counter.result === 1) {
        await upstashCommand(["PEXPIRE", safeKey, windowMs]);
      }

      return {
        ok: counter.result <= limit,
        remaining: Math.max(0, limit - counter.result),
        resetAt,
      };
    }
  } catch (error) {
    console.error("Distributed rate limit failed, falling back to local limiter", error);
  }

  return localRateLimit(safeKey, limit, windowMs);
}

export function getRateLimitKey(req: Request, scope: string) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  return `${scope}:${ip}`;
}
