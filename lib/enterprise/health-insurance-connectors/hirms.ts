import { z } from "zod";
import { createHash } from "node:crypto";
import { assertHirmsEnvironmentEnabled, hirmsEndpoints, type HirmsEnvironment } from "./environments";
import { type HealthInsuranceAdapter, type InsuranceMemberVerification, type InsuranceVerificationResult, InsuranceConnectorError } from "./registry";

// HSL endpoints are a constant allow-list. User-supplied URLs are never accepted.

const outputSchema = z.object({
  verified: z.boolean(),
  memberName: z.string().nullable().optional(),
  planName: z.string().nullable().optional(),
  serviceDate: z.string().nullable().optional(),
  cover: z.enum(["Active", "NotStarted", "Ended"]).nullable().optional(),
  service: z.enum(["Covered", "NeedsPreAuthorisation", "NotCovered", "UnknownCode"]).nullable().optional(),
  network: z.enum(["Allowed", "NeedsPreAuthorisation", "NotAllowed"]).nullable().optional(),
});
type Entry = { token: string; expiresAt: number };
const accessTokens = new Map<string, Entry>();
const keyFor = (environment: HirmsEnvironment, username: string, secret: string) =>
  createHash("sha256").update(JSON.stringify([environment, username, secret])).digest("hex");

async function getToken({ username, secret }: { username: string; secret: string }, environment: HirmsEnvironment, organizationId: string, force = false): Promise<string> {
  assertHirmsEnvironmentEnabled(environment, organizationId);
  const key = keyFor(environment, username, secret);
  const cached = accessTokens.get(key);
  if (!force && cached && cached.expiresAt > Date.now() + 30_000) return cached.token;
  const form = new URLSearchParams({
    grant_type: "client_credentials", client_id: "hirms-ingest",
    scope: "invoices:submit", username, password: secret,
  });
  let response: Response;
  try {
    response = await fetch(hirmsEndpoints(environment).token, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form, cache: "no-store", signal: AbortSignal.timeout(10_000) });
  } catch {
    throw new InsuranceConnectorError("HIRMS_AUTH_UNREACHABLE", 503);
  }
  if (!response.ok) {
    accessTokens.delete(key);
    throw new InsuranceConnectorError("HIRMS_AUTH_REFUSED", response.status === 400 || response.status === 401 ? 401 : 502);
  }
  const body: unknown = await response.json().catch(() => null);
  const token = z.object({ access_token: z.string().min(10), expires_in: z.coerce.number().positive() }).safeParse(body);
  if (!token.success) throw new InsuranceConnectorError("HIRMS_AUTH_RESPONSE_INVALID", 502);
  accessTokens.set(key, { token: token.data.access_token, expiresAt: Date.now() + token.data.expires_in * 1000 });
  return token.data.access_token;
}

async function verify(credentials: { username: string; secret: string }, input: InsuranceMemberVerification, environment: HirmsEnvironment, organizationId: string): Promise<InsuranceVerificationResult> {
  async function call(force = false) {
    const token = await getToken(credentials, environment, organizationId, force);
    try {
      return await fetch(hirmsEndpoints(environment).api + "/api/members/verify", {
        method: "POST", cache: "no-store", signal: AbortSignal.timeout(12_000),
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "Accept-Language": "fr" },
        body: JSON.stringify(input),
      });
    } catch {
      throw new InsuranceConnectorError("HIRMS_VERIFY_UNREACHABLE", 503);
    }
  }
  let response = await call();
  if (response.status === 401) response = await call(true); // One token refresh only.
  if (!response.ok) {
    if (response.status === 429) {
      const seconds = Number(response.headers.get("Retry-After") || 60);
      throw new InsuranceConnectorError("HIRMS_RATE_LIMITED", 429, Number.isFinite(seconds) ? Math.max(1, Math.min(seconds, 3600)) : 60);
    }
    if (response.status === 401) throw new InsuranceConnectorError("HIRMS_ACCESS_EXPIRED", 401);
    if (response.status === 403) throw new InsuranceConnectorError("HIRMS_ACTION_NOT_GRANTED", 403);
    if (response.status === 400) throw new InsuranceConnectorError("HIRMS_VERIFICATION_INPUT_INVALID", 400);
    throw new InsuranceConnectorError(response.status >= 500 ? "HIRMS_SERVICE_UNAVAILABLE" : "HIRMS_VERIFICATION_REJECTED", 502);
  }
  const parsed = outputSchema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) throw new InsuranceConnectorError("HIRMS_VERIFICATION_RESPONSE_INVALID", 502);
  const p = parsed.data;
  return {
    verified: p.verified,
    memberName: p.verified ? p.memberName || null : null,
    planName: p.verified ? p.planName || null : null,
    serviceDate: p.verified ? p.serviceDate || null : null,
    cover: p.verified ? p.cover || null : null,
    service: p.verified ? p.service || null : null,
    network: p.verified ? p.network || null : null,
  };
}

export const hirmsAdapter: HealthInsuranceAdapter = {
  code: "HIRMS_HSL", checkConnection: async (credentials, environment, organizationId) => { await getToken(credentials, environment, organizationId, true); }, verify,
};

/** Reuse the approved HSL OAuth flow for invoice transport. */
export async function getHirmsAccessToken(credentials: { username: string; secret: string }, environment: HirmsEnvironment, organizationId: string, force = false) {
  return getToken(credentials, environment, organizationId, force);
}
