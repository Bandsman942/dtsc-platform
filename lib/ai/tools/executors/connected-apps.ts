import { listConnectedAppsForUser } from "@/lib/ai/mcp/app-catalog";
import type { AiToolExecutor } from "@/lib/ai/tools/types";

/**
 * Product availability only, NOT an MCP call or tool execution proof.
 * Query grants for the exact authenticated user and current scope.
 * No OAuth scopes, server endpoints, access tokens, tenant IDs or payloads.
 */
export const CONNECTED_APP_AI_TOOL_EXECUTORS: Record<string, AiToolExecutor> = {
  CONNECTED_APPS_STATUS_READ: async ({ context }) => {
    const active = context.session.activeContext || "GLOBAL_CLIENT";
    const personal = active === "GLOBAL_CLIENT" || active === "COMMUNITY";
    if (context.session.userId !== context.userId) throw new Error("MCP_APP_SCOPE_DENIED");
    const organizationId = personal ? null : context.organizationId || null;
    if (!personal && (active !== "ORGANIZATION" || !organizationId || organizationId !== context.session.activeOrganizationId)) {
      throw new Error("MCP_APP_SCOPE_DENIED");
    }
    if (personal && context.organizationId) throw new Error("MCP_APP_SCOPE_DENIED");
    const apps = await listConnectedAppsForUser({
      userId: context.session.userId, organizationId,
      locale: context.session.locale || "fr",
    });
    return {
      path: "/ai/apps",
      scope: personal ? "PERSONAL" : "ORGANIZATION",
      operationalToolCallsVerified: false as const,
      applications: apps.slice(0, 20).map((app) => ({
        code: app.code,
        name: app.name,
        availability: app.availability,
      })),
    };
  },
};
