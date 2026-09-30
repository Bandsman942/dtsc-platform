import { createHmac, timingSafeEqual } from "node:crypto";

const PURPOSE = "SCALE7_OBSERVABILITY";
const VERSION = 1;
const DEFAULT_TTL_SECONDS = 50 * 60;

type Scale7ObservabilityCapability = {
  v: 1;
  purpose: typeof PURPOSE;
  runId: string;
  iat: number;
  exp: number;
};

function signPayload(encodedPayload: string, secret: string) {
  return createHmac("sha256", secret).update(encodedPayload).digest("base64url");
}

export function createScale7ObservabilityCapability(runId: string, secret: string, ttlSeconds = DEFAULT_TTL_SECONDS) {
  const now = Math.floor(Date.now() / 1000);
  const payload: Scale7ObservabilityCapability = {
    v: VERSION,
    purpose: PURPOSE,
    runId,
    iat: now,
    exp: now + Math.max(60, Math.min(ttlSeconds, DEFAULT_TTL_SECONDS)),
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encodedPayload}.${signPayload(encodedPayload, secret)}`;
}

export function verifyScale7ObservabilityCapability(token: string, secret: string) {
  const [encodedPayload, signature, extra] = token.split(".");
  if (!encodedPayload || !signature || extra) return null;

  const expected = signPayload(encodedPayload, secret);
  const receivedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (receivedBuffer.length !== expectedBuffer.length || !timingSafeEqual(receivedBuffer, expectedBuffer)) return null;

  let payload: Scale7ObservabilityCapability;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as Scale7ObservabilityCapability;
  } catch {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  if (payload.v !== VERSION || payload.purpose !== PURPOSE || typeof payload.runId !== "string" || !payload.runId) return null;
  if (!Number.isFinite(payload.iat) || !Number.isFinite(payload.exp)) return null;
  if (payload.iat > now + 30 || payload.exp <= now || payload.exp - payload.iat > DEFAULT_TTL_SECONDS) return null;

  return payload;
}
