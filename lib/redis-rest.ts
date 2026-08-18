export type RedisRestUnavailableReason = "UNCONFIGURED" | "TIMEOUT" | "ERROR";

export type RedisRestOutcome<T> =
  | { available: true; result: T }
  | { available: false; reason: RedisRestUnavailableReason };

export type RedisRestCommand = Array<string | number>;

export type RedisRestPipelineItem = {
  result?: unknown;
  error?: string;
};

export const REDIS_REST_TIMEOUT_MS = 750;

function redisRestConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) return null;
  return { url: url.replace(/\/+$/, ""), token };
}

export function isRedisRestConfigured() {
  return Boolean(redisRestConfig());
}

async function postRedisJson(path: string, body: unknown, timeoutMs: number): Promise<RedisRestOutcome<unknown>> {
  const config = redisRestConfig();
  if (!config) return { available: false, reason: "UNCONFIGURED" };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${config.url}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) return { available: false, reason: "ERROR" };
    return { available: true, result: await response.json() };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { available: false, reason: "TIMEOUT" };
    }
    return { available: false, reason: "ERROR" };
  } finally {
    clearTimeout(timeout);
  }
}

export async function redisRestCommand<T>(
  command: RedisRestCommand,
  timeoutMs = REDIS_REST_TIMEOUT_MS
): Promise<RedisRestOutcome<T>> {
  const outcome = await postRedisJson("", command, timeoutMs);
  if (!outcome.available) return outcome;

  const payload = outcome.result as { result?: T; error?: string };
  if (payload?.error) return { available: false, reason: "ERROR" };
  return { available: true, result: payload?.result as T };
}

export async function redisRestPipeline(
  commands: RedisRestCommand[],
  timeoutMs = REDIS_REST_TIMEOUT_MS
): Promise<RedisRestOutcome<RedisRestPipelineItem[]>> {
  const outcome = await postRedisJson("/pipeline", commands, timeoutMs);
  if (!outcome.available) return outcome;

  if (!Array.isArray(outcome.result)) return { available: false, reason: "ERROR" };
  const items = outcome.result as RedisRestPipelineItem[];
  if (items.some((item) => typeof item?.error === "string" && item.error.length > 0)) {
    return { available: false, reason: "ERROR" };
  }
  return { available: true, result: items };
}
