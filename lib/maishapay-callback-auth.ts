import { createHash, timingSafeEqual } from "node:crypto";

/**
 * P0 PAY-4B (#1174): Callback authentication, not PSP settlement verification.
 *
 * The shared callback secret is still a bearer token. Never persist or log it.
 * A production misconfiguration must NOT silently authorize payments.
 */
export type MaishaPayCallbackAuthResult =
  | { ok: true }
  | { ok: false; reason: "CONFIGURATION_MISSING" | "UNAUTHORIZED" };

function secureSecretMatch(expected: string, supplied: string) {
  // Digest both values to fixed-size buffers before constant-time comparison.
  const expectedHash = createHash("sha256").update(expected, "utf8").digest();
  const suppliedHash = createHash("sha256").update(supplied, "utf8").digest();
  return timingSafeEqual(expectedHash, suppliedHash);
}

export function authorizeMaishaPayCallback({
  expectedSecret,
  suppliedSecret,
  production,
}: {
  expectedSecret: string | null | undefined;
  suppliedSecret: string | null | undefined;
  production: boolean;
}): MaishaPayCallbackAuthResult {
  const configured = expectedSecret?.trim();
  if (!configured) {
    // Keep existing local developer workflow, NEVER allow unauthenticated prod.
    return production ? { ok: false, reason: "CONFIGURATION_MISSING" } : { ok: true };
  }
  if (!suppliedSecret || !secureSecretMatch(configured, suppliedSecret)) {
    return { ok: false, reason: "UNAUTHORIZED" };
  }
  return { ok: true };
}
