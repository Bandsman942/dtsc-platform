import { createHash, createHmac, timingSafeEqual } from "node:crypto";

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
  signature,
  rawBody,
  production,
}: {
  expectedSecret: string | null | undefined;
  suppliedSecret: string | null | undefined;
  signature?: string | null;
  rawBody?: string | null;
  production: boolean;
}): MaishaPayCallbackAuthResult {
  const configured = expectedSecret?.trim();
  if (!configured) {
    // Keep existing local developer workflow, NEVER allow unauthenticated prod.
    return production ? { ok: false, reason: "CONFIGURATION_MISSING" } : { ok: true };
  }
  // Official MaishaPay docs describe X-MaishaPay-Signature as
  // sha256=<lowercase hex> HMAC of the EXACT UTF-8 request body.
  // A present (but bad) signature must never fall back to a bearer token.
  if (signature !== null && signature !== undefined) {
    const match = /^sha256=([a-fA-F0-9]{64})$/.exec(signature.trim());
    if (!match || typeof rawBody !== "string") {
      return { ok: false, reason: "UNAUTHORIZED" };
    }
    const expected = createHmac("sha256", configured).update(rawBody, "utf8").digest();
    const provided = Buffer.from(match[1], "hex");
    return timingSafeEqual(expected, provided) ? { ok: true } : { ok: false, reason: "UNAUTHORIZED" };
  }
  // Compatibility-only shared-secret transport. Provider HMAC is preferred.
  if (!suppliedSecret || !secureSecretMatch(configured, suppliedSecret)) {
    return { ok: false, reason: "UNAUTHORIZED" };
  }
  return { ok: true };
}
