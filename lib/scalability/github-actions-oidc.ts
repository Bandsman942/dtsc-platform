type GithubActionsOidcClaims = {
  iss?: string;
  aud?: string | string[];
  exp?: number;
  nbf?: number;
  iat?: number;
  repository?: string;
  repository_owner?: string;
  ref?: string;
  sha?: string;
  workflow_ref?: string;
  actor?: string;
  event_name?: string;
};

const OIDC_ISSUER = "https://token.actions.githubusercontent.com";
const OIDC_JWKS = "https://token.actions.githubusercontent.com/.well-known/jwks";
const OIDC_AUDIENCE = "dtsc-scale7-provisioning";
const EXPECTED_REPOSITORY = "Bandsman942/dtsc-platform";
const EXPECTED_OWNER = "Bandsman942";
const EXPECTED_REF = "refs/heads/main";
const EXPECTED_WORKFLOW_REF = "Bandsman942/dtsc-platform/.github/workflows/scale7-staged-certification.yml@refs/heads/main";

function decodeJson(part: string) {
  try {
    return JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function audienceIncludes(aud: string | string[] | undefined, expected: string) {
  return typeof aud === "string" ? aud === expected : Array.isArray(aud) && aud.includes(expected);
}

export async function verifyScale7GithubActionsOidc(token: string) {
  const [encodedHeader, encodedPayload, encodedSignature] = token.split(".");
  if (!encodedHeader || !encodedPayload || !encodedSignature) return null;

  const header = decodeJson(encodedHeader);
  const claims = decodeJson(encodedPayload) as GithubActionsOidcClaims | null;
  if (!header || !claims || header.alg !== "RS256" || typeof header.kid !== "string") return null;

  const now = Math.floor(Date.now() / 1000);
  if (
    claims.iss !== OIDC_ISSUER ||
    !audienceIncludes(claims.aud, OIDC_AUDIENCE) ||
    !claims.exp || claims.exp <= now ||
    (claims.nbf != null && claims.nbf > now + 30) ||
    claims.repository !== EXPECTED_REPOSITORY ||
    claims.repository_owner !== EXPECTED_OWNER ||
    claims.ref !== EXPECTED_REF ||
    claims.workflow_ref !== EXPECTED_WORKFLOW_REF ||
    claims.actor !== EXPECTED_OWNER ||
    !["issue_comment", "workflow_dispatch"].includes(claims.event_name || "") ||
    !claims.sha?.match(/^[0-9a-f]{40}$/i)
  ) {
    return null;
  }

  const jwksResponse = await fetch(OIDC_JWKS, { cache: "no-store" });
  if (!jwksResponse.ok) return null;
  const jwks = await jwksResponse.json().catch(() => null) as { keys?: JsonWebKey[] } | null;
  const jwk = jwks?.keys?.find((candidate) => candidate.kid === header.kid);
  if (!jwk) return null;

  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    Buffer.from(encodedSignature, "base64url"),
    new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`),
  );
  if (!valid) return null;

  return {
    sha: claims.sha,
    actor: claims.actor,
    eventName: claims.event_name,
  };
}

export const SCALE7_GITHUB_OIDC_AUDIENCE = OIDC_AUDIENCE;
