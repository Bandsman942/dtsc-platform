import type { McpServerDefinition } from "@/lib/ai/mcp/types";
import { getValidMcpOAuthAccessToken } from "@/lib/ai/mcp/oauth";
import { hasRequiredMcpOAuthScopes } from "@/lib/ai/mcp/oauth-scopes";
import { getMcpOAuthGrantedScopes } from "@/lib/ai/mcp/oauth-store";

export async function getAuthorizedMcpOAuthAccessToken(input: {
  server: McpServerDefinition;
  userId: string;
  organizationId: string;
}) {
  const grantedScopes = await getMcpOAuthGrantedScopes({
    userId: input.userId,
    organizationId: input.organizationId,
    serverCode: input.server.code,
  });
  if (!grantedScopes) throw new Error("MCP_OAUTH_CONNECTION_MISSING");
  if (!hasRequiredMcpOAuthScopes(grantedScopes, input.server.oauthScopes)) {
    throw new Error("MCP_OAUTH_REAUTHORIZATION_REQUIRED");
  }
  return getValidMcpOAuthAccessToken(input);
}
