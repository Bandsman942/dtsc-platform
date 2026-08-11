import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { getAppBaseUrl } from "@/lib/domains";
import type { McpServerDefinition } from "@/lib/ai/mcp/types";
import { getMcpOAuthConnection, saveMcpOAuthConnection, type McpOAuthCredentials } from "@/lib/ai/mcp/oauth-store";
import { writeAuditLog } from "@/lib/audit";

const DISCOVERY_TIMEOUT_MS = 8_000;
const MAX_METADATA_BYTES = 128_000;

export type McpOAuthMetadata = {
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  revocationEndpoint?: string | null;
  scopesSupported?: string[];
};

type ProtectedResourceMetadata = {
  resource?: string;
  authorization_servers?: string[];
  scopes_supported?: string[];
};

type AuthorizationServerMetadata = {
  issuer?: string;
  authorization_endpoint?: string;
  token_endpoint?: string;
  revocation_endpoint?: string;
  scopes_supported?: string[];
  code_challenge_methods_supported?: string[];
};

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
};

function certifiedOauthHosts(server: McpServerDefinition) {
  return new Set((server.oauthAllowedHosts || []).map((host) => host.toLowerCase()));
}

function assertCertifiedOAuthUrl(server: McpServerDefinition, value: string, reasonCode: string) {
  const url = new URL(value);
  if (url.protocol !== "https:" && process.env.NODE_ENV === "production") throw new Error(`${reasonCode}_HTTPS_REQUIRED`);
  if (!certifiedOauthHosts(server).has(url.hostname.toLowerCase())) throw new Error(`${reasonCode}_HOST_NOT_CERTIFIED`);
  if (url.username || url.password) throw new Error(`${reasonCode}_CREDENTIALS_FORBIDDEN`);
  return url;
}

async function fetchMetadataJson<T>(server: McpServerDefinition, value: string, reasonCode: string): Promise<T> {
  const url = assertCertifiedOAuthUrl(server, value, reasonCode);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DISCOVERY_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      redirect: "manual",
      cache: "no-store",
      signal: controller.signal,
    });
    if (response.status >= 300 && response.status < 400) throw new Error(`${reasonCode}_REDIRECT_FORBIDDEN`);
    if (!response.ok) throw new Error(`${reasonCode}_HTTP_${response.status}`);
    const length = Number(response.headers.get("content-length") || "0");
    if (length > MAX_METADATA_BYTES) throw new Error(`${reasonCode}_TOO_LARGE`);
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > MAX_METADATA_BYTES) throw new Error(`${reasonCode}_TOO_LARGE`);
    return JSON.parse(new TextDecoder().decode(buffer)) as T;
  } finally {
    clearTimeout(timer);
  }
}

function metadataUrlForIssuer(issuer: string, kind: "oauth" | "oidc") {
  const url = new URL(issuer);
  const suffix = kind === "oauth" ? "/.well-known/oauth-authorization-server" : "/.well-known/openid-configuration";
  const path = url.pathname === "/" ? "" : url.pathname.replace(/\/$/, "");
  url.pathname = `${suffix}${path}`;
  url.search = "";
  url.hash = "";
  return url.toString();
}

async function discoverProtectedResource(server: McpServerDefinition) {
  const endpoint = new URL(server.endpoint);
  const candidates = [
    `${endpoint.origin}/.well-known/oauth-protected-resource${endpoint.pathname === "/" ? "" : endpoint.pathname.replace(/\/$/, "")}`,
    `${endpoint.origin}/.well-known/oauth-protected-resource`,
  ];
  for (const candidate of candidates) {
    try {
      return await fetchMetadataJson<ProtectedResourceMetadata>(server, candidate, "MCP_OAUTH_RESOURCE_METADATA");
    } catch {
      // Try the next certified metadata location. A configured authorization server remains the final fallback.
    }
  }
  return null;
}

async function discoverAuthorizationMetadata(server: McpServerDefinition, issuer: string) {
  for (const kind of ["oauth", "oidc"] as const) {
    try {
      const metadata = await fetchMetadataJson<AuthorizationServerMetadata>(server, metadataUrlForIssuer(issuer, kind), "MCP_OAUTH_AUTH_METADATA");
      if (metadata.authorization_endpoint && metadata.token_endpoint) return metadata;
    } catch {
      // Continue to the alternate standardized discovery document on the same certified host.
    }
  }
  throw new Error("MCP_OAUTH_AUTH_METADATA_UNAVAILABLE");
}

export async function discoverMcpOAuthMetadata(server: McpServerDefinition): Promise<McpOAuthMetadata> {
  if (server.status !== "CERTIFIED" || server.authMode !== "OAUTH_USER") throw new Error("MCP_OAUTH_SERVER_NOT_CERTIFIED");
  if (!server.oauthAllowedHosts?.length) throw new Error("MCP_OAUTH_ALLOWED_HOSTS_MISSING");

  const resource = await discoverProtectedResource(server);
  const issuer = server.oauthAuthorizationServer || resource?.authorization_servers?.[0];
  if (!issuer) throw new Error("MCP_OAUTH_AUTHORIZATION_SERVER_MISSING");
  assertCertifiedOAuthUrl(server, issuer, "MCP_OAUTH_AUTHORIZATION_SERVER");

  const auth = await discoverAuthorizationMetadata(server, issuer);
  if (!auth.authorization_endpoint || !auth.token_endpoint) throw new Error("MCP_OAUTH_AUTH_METADATA_INVALID");
  assertCertifiedOAuthUrl(server, auth.authorization_endpoint, "MCP_OAUTH_AUTHORIZATION_ENDPOINT");
  assertCertifiedOAuthUrl(server, auth.token_endpoint, "MCP_OAUTH_TOKEN_ENDPOINT");
  if (auth.revocation_endpoint) assertCertifiedOAuthUrl(server, auth.revocation_endpoint, "MCP_OAUTH_REVOCATION_ENDPOINT");
  if (auth.code_challenge_methods_supported?.length && !auth.code_challenge_methods_supported.includes("S256")) {
    throw new Error("MCP_OAUTH_PKCE_S256_UNSUPPORTED");
  }

  return {
    issuer: auth.issuer || issuer,
    authorizationEndpoint: auth.authorization_endpoint,
    tokenEndpoint: auth.token_endpoint,
    revocationEndpoint: auth.revocation_endpoint || null,
    scopesSupported: auth.scopes_supported || resource?.scopes_supported,
  };
}

export function createMcpOAuthPkce() {
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const state = randomBytes(32).toString("base64url");
  return { verifier, challenge, state };
}

export function getMcpOAuthCallbackUrl() {
  const base = getAppBaseUrl();
  if (!base) throw new Error("MCP_OAUTH_APP_URL_MISSING");
  return `${base}/api/ai/apps/oauth/callback`;
}

function clientIdFor(server: McpServerDefinition) {
  const key = server.oauthClientIdEnvKey || "";
  const value = key ? process.env[key]?.trim() : "";
  if (!value) throw new Error("MCP_OAUTH_CLIENT_ID_MISSING");
  return value;
}

function clientSecretFor(server: McpServerDefinition) {
  const key = server.oauthClientSecretEnvKey || "";
  return key ? process.env[key]?.trim() || null : null;
}

export async function buildMcpOAuthAuthorizationUrl(input: {
  server: McpServerDefinition;
  metadata: McpOAuthMetadata;
  state: string;
  challenge: string;
}) {
  const url = new URL(input.metadata.authorizationEndpoint);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientIdFor(input.server));
  url.searchParams.set("redirect_uri", getMcpOAuthCallbackUrl());
  url.searchParams.set("state", input.state);
  url.searchParams.set("code_challenge", input.challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("resource", input.server.endpoint);
  if (input.server.oauthScopes?.length) url.searchParams.set("scope", input.server.oauthScopes.join(" "));
  return url.toString();
}

function credentialsFromTokenResponse(token: TokenResponse, previousRefreshToken?: string | null): McpOAuthCredentials {
  if (!token.access_token || !token.token_type) throw new Error("MCP_OAUTH_TOKEN_RESPONSE_INVALID");
  const expiresAt = typeof token.expires_in === "number" && Number.isFinite(token.expires_in)
    ? new Date(Date.now() + Math.max(0, token.expires_in) * 1000).toISOString()
    : null;
  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token || previousRefreshToken || null,
    tokenType: token.token_type,
    scope: token.scope?.split(/\s+/).filter(Boolean) || [],
    expiresAt,
  };
}

async function postToken(server: McpServerDefinition, metadata: McpOAuthMetadata, body: URLSearchParams) {
  const endpoint = assertCertifiedOAuthUrl(server, metadata.tokenEndpoint, "MCP_OAUTH_TOKEN_ENDPOINT");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), server.timeoutMs);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
      body,
      redirect: "manual",
      cache: "no-store",
      signal: controller.signal,
    });
    if (response.status >= 300 && response.status < 400) throw new Error("MCP_OAUTH_TOKEN_REDIRECT_FORBIDDEN");
    const token = await response.json().catch(() => null) as TokenResponse | null;
    if (!response.ok || !token || token.error) throw new Error("MCP_OAUTH_TOKEN_EXCHANGE_FAILED");
    return token;
  } finally {
    clearTimeout(timer);
  }
}

export async function exchangeMcpOAuthCode(input: {
  server: McpServerDefinition;
  code: string;
  verifier: string;
}) {
  const metadata = await discoverMcpOAuthMetadata(input.server);
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: input.code,
    client_id: clientIdFor(input.server),
    redirect_uri: getMcpOAuthCallbackUrl(),
    code_verifier: input.verifier,
    resource: input.server.endpoint,
  });
  const secret = clientSecretFor(input.server);
  if (secret) body.set("client_secret", secret);
  const token = await postToken(input.server, metadata, body);
  return credentialsFromTokenResponse(token);
}

export async function getValidMcpOAuthAccessToken(input: {
  server: McpServerDefinition;
  userId: string;
  organizationId: string;
}) {
  const connection = await getMcpOAuthConnection({
    userId: input.userId,
    organizationId: input.organizationId,
    serverCode: input.server.code,
  });
  if (!connection) throw new Error("MCP_OAUTH_CONNECTION_MISSING");
  const expiresAt = connection.credentials.expiresAt ? new Date(connection.credentials.expiresAt).getTime() : null;
  if (!expiresAt || expiresAt > Date.now() + 60_000) return connection.credentials.accessToken;
  if (!connection.credentials.refreshToken) throw new Error("MCP_OAUTH_REFRESH_TOKEN_MISSING");

  try {
    const metadata = await discoverMcpOAuthMetadata(input.server);
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: connection.credentials.refreshToken,
      client_id: clientIdFor(input.server),
      resource: input.server.endpoint,
    });
    const secret = clientSecretFor(input.server);
    if (secret) body.set("client_secret", secret);
    if (input.server.oauthScopes?.length) body.set("scope", input.server.oauthScopes.join(" "));
    const token = await postToken(input.server, metadata, body);
    const credentials = credentialsFromTokenResponse(token, connection.credentials.refreshToken);
    await saveMcpOAuthConnection({
      userId: input.userId,
      organizationId: input.organizationId,
      serverCode: input.server.code,
      credentials,
      refreshed: true,
    });
    await writeAuditLog({
      userId: input.userId,
      organizationId: input.organizationId,
      action: "MCP_OAUTH_REFRESH",
      entity: "MCP_CONNECTION",
      entityId: input.server.code,
      riskLevel: "MEDIUM",
      metadata: { serverCode: input.server.code },
    });
    return credentials.accessToken;
  } catch (error) {
    await writeAuditLog({
      userId: input.userId,
      organizationId: input.organizationId,
      action: "MCP_OAUTH_REFRESH",
      entity: "MCP_CONNECTION",
      entityId: input.server.code,
      result: "FAILED",
      reasonCode: error instanceof Error ? error.message : "MCP_OAUTH_REFRESH_FAILED",
      riskLevel: "HIGH",
      metadata: { serverCode: input.server.code },
    });
    throw error;
  }
}

export async function revokeMcpOAuthRemoteToken(input: {
  server: McpServerDefinition;
  accessToken: string;
}) {
  const metadata = await discoverMcpOAuthMetadata(input.server);
  if (!metadata.revocationEndpoint) return;
  const endpoint = assertCertifiedOAuthUrl(input.server, metadata.revocationEndpoint, "MCP_OAUTH_REVOCATION_ENDPOINT");
  const body = new URLSearchParams({ token: input.accessToken, client_id: clientIdFor(input.server) });
  const secret = clientSecretFor(input.server);
  if (secret) body.set("client_secret", secret);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    redirect: "manual",
    cache: "no-store",
  });
  if (response.status >= 300 && response.status < 400) throw new Error("MCP_OAUTH_REVOCATION_REDIRECT_FORBIDDEN");
  if (!response.ok && response.status !== 404) throw new Error("MCP_OAUTH_REVOCATION_FAILED");
}
