import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { revokeMcpOAuthRemoteToken } from "@/lib/ai/mcp/oauth";
import { getMcpOAuthConnection, revokeMcpOAuthConnection } from "@/lib/ai/mcp/oauth-store";
import { getMcpServerDefinition } from "@/lib/ai/mcp/registry";
import { getActiveOrganizationId, requireActiveOrganizationMembership } from "@/lib/organizations";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(request, `mcp-oauth-disconnect:${session.userId}`), 30, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const organizationId = getActiveOrganizationId(session);
  if (!organizationId || !await requireActiveOrganizationMembership(session, organizationId)) return NextResponse.json({ error: "Contexte entreprise requis." }, { status: 403 });
  const form = await request.formData();
  const serverCode = String(form.get("serverCode") || "").trim();
  const server = getMcpServerDefinition(serverCode);
  if (!server || server.status !== "CERTIFIED" || server.authMode !== "OAUTH_USER") return NextResponse.json({ error: "Application indisponible." }, { status: 400 });

  const connection = await getMcpOAuthConnection({ userId: session.userId, organizationId, serverCode: server.code });
  if (!connection) return NextResponse.redirect(new URL("/ai/apps?oauth=disconnected", request.url), 303);

  let remoteRevocationFailed = false;
  try {
    await revokeMcpOAuthRemoteToken({ server, accessToken: connection.credentials.accessToken });
  } catch {
    remoteRevocationFailed = true;
  }
  await revokeMcpOAuthConnection({ userId: session.userId, organizationId, serverCode: server.code });
  await writeAuditLog({
    userId: session.userId,
    organizationId,
    request,
    action: "MCP_OAUTH_DISCONNECTED",
    entity: "MCP_CONNECTION",
    entityId: server.code,
    result: remoteRevocationFailed ? "PARTIAL" : "SUCCESS",
    reasonCode: remoteRevocationFailed ? "MCP_OAUTH_REMOTE_REVOCATION_FAILED" : null,
    riskLevel: remoteRevocationFailed ? "HIGH" : "MEDIUM",
    metadata: { serverCode: server.code, localCredentialsDestroyed: true },
  });
  await writeApiLog({ request, statusCode: 303, userId: session.userId, startedAt, metadata: { serverCode: server.code, remoteRevocationFailed } });
  return NextResponse.redirect(new URL("/ai/apps?oauth=disconnected", request.url), 303);
}
