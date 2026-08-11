import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { buildMcpOAuthAuthorizationUrl, createMcpOAuthPkce, discoverMcpOAuthMetadata } from "@/lib/ai/mcp/oauth";
import { createMcpOAuthState, deleteExpiredMcpOAuthStates } from "@/lib/ai/mcp/oauth-store";
import { getMcpServerDefinition } from "@/lib/ai/mcp/registry";
import { getActiveOrganizationId, requireActiveOrganizationMembership } from "@/lib/organizations";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(request)) {
    await writeApiLog({ request, statusCode: 403, startedAt });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const session = await getSession();
  if (!session) {
    await writeApiLog({ request, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const limited = await rateLimit(getRateLimitKey(request, `mcp-oauth-connect:${session.userId}`), 20, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const organizationId = getActiveOrganizationId(session);
  if (!organizationId || !await requireActiveOrganizationMembership(session, organizationId)) {
    await writeApiLog({ request, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Contexte entreprise requis." }, { status: 403 });
  }

  const form = await request.formData();
  const serverCode = String(form.get("serverCode") || "").trim();
  const server = getMcpServerDefinition(serverCode);
  if (!server || server.status !== "CERTIFIED" || server.authMode !== "OAUTH_USER") {
    await writeAuditLog({ userId: session.userId, organizationId, request, action: "MCP_OAUTH_CONNECT", entity: "MCP_CONNECTION", entityId: serverCode || null, result: "DENIED", reasonCode: "MCP_OAUTH_SERVER_NOT_AVAILABLE", riskLevel: "MEDIUM" });
    return NextResponse.json({ error: "Cette application n’est pas disponible à la connexion." }, { status: 400 });
  }
  const activeContext = session.activeContext || "GLOBAL_CLIENT";
  if (!server.contexts.includes(activeContext)) return NextResponse.json({ error: "Application indisponible dans ce contexte." }, { status: 403 });
  if (server.organizationScope === "TENANT" && session.activeOrganizationId !== organizationId) return NextResponse.json({ error: "Contexte entreprise invalide." }, { status: 403 });

  try {
    await deleteExpiredMcpOAuthStates();
    const metadata = await discoverMcpOAuthMetadata(server);
    const pkce = createMcpOAuthPkce();
    await createMcpOAuthState({
      state: pkce.state,
      userId: session.userId,
      organizationId,
      serverCode: server.code,
      verifier: pkce.verifier,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });
    const authorizationUrl = await buildMcpOAuthAuthorizationUrl({ server, metadata, state: pkce.state, challenge: pkce.challenge });
    await writeAuditLog({ userId: session.userId, organizationId, request, action: "MCP_OAUTH_CONNECT_STARTED", entity: "MCP_CONNECTION", entityId: server.code, riskLevel: "MEDIUM", metadata: { serverCode: server.code } });
    await writeApiLog({ request, statusCode: 303, userId: session.userId, startedAt, metadata: { serverCode: server.code } });
    return NextResponse.redirect(authorizationUrl, 303);
  } catch (error) {
    const reasonCode = error instanceof Error ? error.message.slice(0, 160) : "MCP_OAUTH_CONNECT_FAILED";
    await writeAuditLog({ userId: session.userId, organizationId, request, action: "MCP_OAUTH_CONNECT", entity: "MCP_CONNECTION", entityId: server.code, result: "FAILED", reasonCode, riskLevel: "HIGH", metadata: { serverCode: server.code } });
    await writeApiLog({ request, statusCode: 503, userId: session.userId, startedAt, metadata: { serverCode: server.code, reasonCode } });
    return NextResponse.json({ error: "Connexion temporairement indisponible. Vérifiez la configuration de cette application." }, { status: 503 });
  }
}
