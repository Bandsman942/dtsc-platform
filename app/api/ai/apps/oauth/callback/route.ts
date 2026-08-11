import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { exchangeMcpOAuthCode } from "@/lib/ai/mcp/oauth";
import { consumeMcpOAuthState, saveMcpOAuthConnection } from "@/lib/ai/mcp/oauth-store";
import { getMcpServerDefinition } from "@/lib/ai/mcp/registry";
import { getAppBaseUrl } from "@/lib/domains";
import { getActiveOrganizationId, requireActiveOrganizationMembership } from "@/lib/organizations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function appsRedirect(status: string) {
  const base = getAppBaseUrl();
  const url = new URL("/ai/apps", base || "http://localhost:3000");
  url.searchParams.set("oauth", status);
  return url;
}

export async function GET(request: Request) {
  const startedAt = Date.now();
  const url = new URL(request.url);
  const state = url.searchParams.get("state")?.trim() || "";
  const code = url.searchParams.get("code")?.trim() || "";
  const providerError = url.searchParams.get("error")?.trim() || "";
  const session = await getSession();
  if (!session) {
    await writeApiLog({ request, statusCode: 401, startedAt });
    return NextResponse.redirect(appsRedirect("session-required"), 303);
  }
  if (!state) {
    await writeAuditLog({ userId: session.userId, request, action: "MCP_OAUTH_CALLBACK", entity: "MCP_CONNECTION", result: "DENIED", reasonCode: "MCP_OAUTH_STATE_MISSING", riskLevel: "HIGH" });
    return NextResponse.redirect(appsRedirect("invalid-state"), 303);
  }

  const savedState = await consumeMcpOAuthState(state).catch(() => null);
  if (!savedState || savedState.userId !== session.userId) {
    await writeAuditLog({ userId: session.userId, request, action: "MCP_OAUTH_CALLBACK", entity: "MCP_CONNECTION", result: "DENIED", reasonCode: "MCP_OAUTH_STATE_INVALID", riskLevel: "HIGH" });
    await writeApiLog({ request, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.redirect(appsRedirect("invalid-state"), 303);
  }

  const activeOrganizationId = getActiveOrganizationId(session);
  if (activeOrganizationId !== savedState.organizationId || !await requireActiveOrganizationMembership(session, savedState.organizationId)) {
    await writeAuditLog({ userId: session.userId, organizationId: savedState.organizationId, request, action: "MCP_OAUTH_CALLBACK", entity: "MCP_CONNECTION", entityId: savedState.serverCode, result: "DENIED", reasonCode: "MCP_OAUTH_TENANT_CONTEXT_CHANGED", riskLevel: "HIGH" });
    return NextResponse.redirect(appsRedirect("organization-changed"), 303);
  }

  const server = getMcpServerDefinition(savedState.serverCode);
  if (!server || server.status !== "CERTIFIED" || server.authMode !== "OAUTH_USER") {
    await writeAuditLog({ userId: session.userId, organizationId: savedState.organizationId, request, action: "MCP_OAUTH_CALLBACK", entity: "MCP_CONNECTION", entityId: savedState.serverCode, result: "DENIED", reasonCode: "MCP_OAUTH_SERVER_NOT_CERTIFIED", riskLevel: "HIGH" });
    return NextResponse.redirect(appsRedirect("not-available"), 303);
  }

  if (providerError || !code) {
    await writeAuditLog({ userId: session.userId, organizationId: savedState.organizationId, request, action: "MCP_OAUTH_CONNECT", entity: "MCP_CONNECTION", entityId: server.code, result: "FAILED", reasonCode: providerError ? "MCP_OAUTH_PROVIDER_DENIED" : "MCP_OAUTH_CODE_MISSING", riskLevel: "MEDIUM", metadata: { serverCode: server.code } });
    return NextResponse.redirect(appsRedirect(providerError === "access_denied" ? "cancelled" : "failed"), 303);
  }

  try {
    const credentials = await exchangeMcpOAuthCode({ server, code, verifier: savedState.verifier });
    const effectiveCredentials = credentials.scope.length || !server.oauthScopes?.length
      ? credentials
      : { ...credentials, scope: [...server.oauthScopes] };
    await saveMcpOAuthConnection({
      userId: session.userId,
      organizationId: savedState.organizationId,
      serverCode: server.code,
      credentials: effectiveCredentials,
    });
    await writeAuditLog({
      userId: session.userId,
      organizationId: savedState.organizationId,
      request,
      action: "MCP_OAUTH_CONNECTED",
      entity: "MCP_CONNECTION",
      entityId: server.code,
      riskLevel: "MEDIUM",
      metadata: { serverCode: server.code, scopes: effectiveCredentials.scope },
    });
    await writeApiLog({ request, statusCode: 303, userId: session.userId, startedAt, metadata: { serverCode: server.code } });
    return NextResponse.redirect(appsRedirect("connected"), 303);
  } catch (error) {
    const reasonCode = error instanceof Error ? error.message.slice(0, 160) : "MCP_OAUTH_CALLBACK_FAILED";
    await writeAuditLog({ userId: session.userId, organizationId: savedState.organizationId, request, action: "MCP_OAUTH_CONNECT", entity: "MCP_CONNECTION", entityId: server.code, result: "FAILED", reasonCode, riskLevel: "HIGH", metadata: { serverCode: server.code } });
    await writeApiLog({ request, statusCode: 503, userId: session.userId, startedAt, metadata: { serverCode: server.code, reasonCode } });
    return NextResponse.redirect(appsRedirect("failed"), 303);
  }
}
