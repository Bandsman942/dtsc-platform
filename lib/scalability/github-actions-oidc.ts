type GitHubOidcHeader = {
  alg?: string;
  kid?: string;
  typ?: string;
};

type GitHubJwk = JsonWebKey & { kid?: string };

export type GitHubActionsScale7Claims = {
  iss: string;
  aud: string | string[];
  exp: number;
  nbf?: number;
  iat?: number;
  repository: string;
  repository_owner: string;
  ref: string;
  workflow_ref: string;
  event_name: string;
  run_id: string;
  run_attempt?: string;
};

const ISSUER = "https://token.actions.githubusercontent.com";
const AUDIENCE = "dtsc-scale7";
const REPOSITORY = "Bandsman942/dtsc-platform";
const OWNER = "Bandsman942";
const REF = "refs/heads/main";
const WORKFLOW_REF = `${REPOSITORY}/.github/workflows/scale7-staged-certification.yml@${REF}`;
const ALLOWED_EVENTS = new Set(["issue_comment", "workflow_dispatch"]);

function decodeBase64UrlJson<T>(value: string): T {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as T;
}

function audienceIncludes(audience: string | string[], expected: string) {
  return Array.isArray(audience) ? audience.includes(expected) : audience === expected;
}

async function verifyJwtSignature(token: string, header: GitHubOidcHeader) {
  const [encodedHeader, encodedPayload, encodedSignature] = token.split(".");
  if (!encodedHeader || !encodedPayload || !encodedSignature || !header.kid) return false;

  const discoveryResponse = await fetch(`${ISSUER}/.well-known/openid-configuration`, {
    cache: "force-cache",
    headers: { Accept: "application/json" },
  });
  if (!discoveryResponse.ok) return false;
  const discovery = await discoveryResponse.json() as { jwks_uri?: string };
  if (!discovery.jwks_uri?.startsWith(`${ISSUER}/`)) return false;

  const jwksResponse = await fetch(discovery.jwks_uri, {
    cache: "force-cache",
    headers: { Accept: "application/json" },
  });
  if (!jwksResponse.ok) return false;
  const jwks = await jwksResponse.json() as { keys?: GitHubJwk[] };
  const jwk = jwks.keys?.find((candidate) => candidate.kid === header.kid && candidate.kty === "RSA");
  if (!jwk) return false;

  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  return crypto.subtle.verify(
    { name: "RSASSA-PKCS1-v1_5" },
    key,
    Buffer.from(encodedSignature, "base64url"),
    new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`),
  );
}

export async function verifyScale7GitHubActionsOidc(token: string): Promise<GitHubActionsScale7Claims | null> {
  const [encodedHeader, encodedPayload] = token.split(".");
  if (!encodedHeader || !encodedPayload) return null;

  let header: GitHubOidcHeader;
  let claims: GitHubActionsScale7Claims;
  try {
    header = decodeBase64UrlJson<GitHubOidcHeader>(encodedHeader);
    claims = decodeBase64UrlJson<GitHubActionsScale7Claims>(encodedPayload);
  } catch {
    return null;
  }

  if (header.alg !== "RS256" || !header.kid) return null;
  if (claims.iss !== ISSUER || !audienceIncludes(claims.aud, AUDIENCE)) return null;
  if (claims.repository !== REPOSITORY || claims.repository_owner !== OWNER) return null;
  if (claims.ref !== REF || claims.workflow_ref !== WORKFLOW_REF) return null;
  if (!ALLOWED_EVENTS.has(claims.event_name) || !claims.run_id) return null;

  const now = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(claims.exp) || claims.exp <= now) return null;
  if (claims.nbf && claims.nbf > now + 30) return null;
  if (claims.iat && claims.iat > now + 30) return null;

  return await verifyJwtSignature(token, header) ? claims : null;
}
