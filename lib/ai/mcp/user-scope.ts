import type { McpServerDefinition } from "@/lib/ai/mcp/types";
import type { AiToolRuntimeContext } from "@/lib/ai/tools/types";

/**
 * Certified MCP OAuth grants never cross PERSONAL / ORGANIZATION boundaries.
 * A nullable organizationId means a real personal grant, not a fallback to a
 * previous organization. DTSC_INTERNAL and ORGANIZATION must carry an active
 * matching organization, including for GLOBAL-scope MCP servers.
 */
export function resolveMcpUserAuthScope(input: {
  server: McpServerDefinition;
  context: AiToolRuntimeContext;
}) {
  const activeContext = input.context.session.activeContext || "GLOBAL_CLIENT";
  if (!input.server.contexts.includes(activeContext)) throw new Error("MCP_CONTEXT_NOT_ALLOWED");
  if (!input.context.userId || input.context.session.userId !== input.context.userId) {
    throw new Error("MCP_USER_CONTEXT_INVALID");
  }
  const organizationId = input.context.organizationId || null;
  if (activeContext === "ORGANIZATION" || activeContext === "DTSC_INTERNAL") {
    if (!organizationId || input.context.session.activeOrganizationId !== organizationId) {
      throw new Error("MCP_ORGANIZATION_CONTEXT_REQUIRED");
    }
  } else if (activeContext === "GLOBAL_CLIENT" || activeContext === "COMMUNITY") {
    if (organizationId) throw new Error("MCP_PERSONAL_CONTEXT_REQUIRED");
  } else {
    throw new Error("MCP_CONTEXT_NOT_ALLOWED");
  }
  if (input.server.organizationScope === "TENANT" && activeContext !== "ORGANIZATION") {
    throw new Error("MCP_TENANT_CONTEXT_REQUIRED");
  }

  return input.server.authMode === "OAUTH_USER"
    ? { userId: input.context.userId, organizationId }
    : null;
}
