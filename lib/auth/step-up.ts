import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { getAuthCookieDomain } from "@/lib/domains";
import { requireEnv } from "@/lib/env";
import { shouldUseSecureSessionCookie } from "@/lib/session-cookie-security";
import { SESSION_COOKIE, type SessionPayload } from "@/lib/session";

const COOKIE = "dtsc_stepup";
const FIVE_MINUTES = 5 * 60;
function sessionDigest(value: string) { return createHash("sha256").update(value).digest("hex"); }
function sig(payload: string) { return createHmac("sha256", requireEnv("AUTH_SECRET")).update(payload).digest("hex"); }
function safeEqual(a: string, b: string) {
  if (!/^[a-f0-9]{64}$/.test(a) || !/^[a-f0-9]{64}$/.test(b)) return false;
  return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}
function cookieOptions(maxAge: number) {
  const domain = getAuthCookieDomain();
  return {
    httpOnly: true, secure: shouldUseSecureSessionCookie(), sameSite: "strict" as const,
    path: "/", maxAge, ...(domain ? { domain } : {}),
  };
}
function fingerprint(session: SessionPayload, token: string) {
  return [session.userId, session.activeOrganizationId || "", session.mfaVerifiedAt || "", sessionDigest(token)].join("|");
}

/** Short-lived cookie bound to the precise signed session (fail closed on token rotation). */
export async function issueStepUp(session: SessionPayload) {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) throw new Error("Session cookie missing");
  const body = Buffer.from(JSON.stringify({
    binding: fingerprint(session, token),
    expiresAt: Date.now() + FIVE_MINUTES * 1000,
  })).toString("base64url");
  store.set(COOKIE, body + "." + sig(body), cookieOptions(FIVE_MINUTES));
}

export async function hasRecentStepUp(session: SessionPayload) {
  const store = await cookies();
  const signed = store.get(COOKIE)?.value || "";
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token || signed.length > 2048) return false;
  const [encoded, signature, extra] = signed.split(".");
  if (!encoded || !signature || extra || !safeEqual(sig(encoded), signature)) return false;
  try {
    const claim = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    return claim.binding === fingerprint(session, token) &&
      typeof claim.expiresAt === "number" && claim.expiresAt > Date.now();
  } catch { return false; }
}

export async function clearStepUp() {
  (await cookies()).set(COOKIE, "", cookieOptions(0));
}
