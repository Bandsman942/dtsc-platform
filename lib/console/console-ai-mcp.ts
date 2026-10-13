import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAssistantProfiles } from "@/lib/ai/assistant-registry";
import { MCP_SERVER_REGISTRY, isMcpOAuthPlatformConfigured } from "@/lib/ai/mcp/registry";
import { MCP_TOOL_BINDINGS } from "@/lib/ai/mcp/bindings";

export type ConsoleMcpGovernance = {
  servers: Array<{
    code: string; label: string; status: string; transport: string; authMode: string;
    scope: string; dataPolicy: string; certified: boolean; configured: boolean;
    connectedGrants: number | null; enabledBindings: number; reachable: null;
    discovery: { version: string; compatible: boolean; discoveredAt: string; toolCount: number } | null;
    suspended: boolean | null; revision: number | null;
    audit: { successful: number; denied: number; failed: number } | null;
  }>;
  bindings: Array<{
    code: string; serverCode: string; enabled: boolean; mode: string;
    certifiedVersion: string; discoveryMatches: boolean | null;
    assistants: string[] | null; contexts: string[]; requiredModules: number; requiredPermissions: number;
  }>;
  assistants: Array<{
    code: string; scope: string; version: string; toolPolicy: string;
    knowledgePolicy: string; modelPolicy: string; dataPolicy: string; sector: string | null; contexts: string[];
  }>;
  telemetry: "AVAILABLE" | "PARTIAL";
  auditedSince: string;
};

/** Global aggregates only: never load OAuth credentials, tenant identities,
 * resource content, discovery tool schemas or raw private audit payloads.
 * Connected grant counts are NOT operational MCP-tool availability.
 */
export async function getConsoleMcpGovernance(): Promise<ConsoleMcpGovernance> {
  const since = new Date(Date.now() - 7 * 86_400_000);
  const codes = MCP_SERVER_REGISTRY.map((s) => s.code);
  const [discovery, audit, grants, controls] = await Promise.allSettled([
    prisma.aiMcpDiscoverySnapshot.findMany({
      where: { serverCode: { in: codes } },
      orderBy: { discoveredAt: "desc" },
      take: 100,
      select: { serverCode: true, version: true, compatible: true, discoveredAt: true, toolsJson: true },
    }),
    prisma.aiMcpAuditEvent.groupBy({
      by: ["serverCode", "status"],
      where: { serverCode: { in: codes }, createdAt: { gte: since } },
      _count: { _all: true },
    }),
    codes.length ? prisma.$queryRaw<Array<{ serverCode: string; total: number }>>(Prisma.sql`
      SELECT "serverCode", COUNT(*)::int AS "total"
      FROM "McpUserOAuthConnection"
      WHERE "revokedAt" IS NULL AND "serverCode" IN (${Prisma.join(codes)})
      GROUP BY "serverCode"
    `) : Promise.resolve([]),
    prisma.aiMcpControlState.findMany({
      where: { serverCode: { in: codes } },
      select: { serverCode: true, suspended: true, revision: true },
    }),
  ]);
  const latest = new Map<string, { version: string; compatible: boolean; discoveredAt: string; toolCount: number }>();
  if (discovery.status === "fulfilled") for (const item of discovery.value) {
    if (!latest.has(item.serverCode)) latest.set(item.serverCode, {
      version: item.version, compatible: item.compatible,
      discoveredAt: item.discoveredAt.toISOString(),
      toolCount: Array.isArray(item.toolsJson) ? item.toolsJson.length : 0,
    });
  }
  const activity = new Map<string, { successful: number; denied: number; failed: number }>();
  if (audit.status === "fulfilled") for (const row of audit.value) {
    const counts = activity.get(row.serverCode) || { successful: 0, denied: 0, failed: 0 };
    if (row.status === "SUCCESS") counts.successful += row._count._all;
    if (row.status === "DENIED") counts.denied += row._count._all;
    if (row.status === "FAILED") counts.failed += row._count._all;
    activity.set(row.serverCode, counts);
  }
  const grantTotals = new Map(grants.status === "fulfilled" ? grants.value.map((row) => [row.serverCode, row.total] as const) : []);
  const controlStates = new Map(controls.status === "fulfilled" ? controls.value.map((row) => [row.serverCode, row] as const) : []);
  return {
    servers: MCP_SERVER_REGISTRY.map((server) => ({
      code: server.code, label: server.label, status: server.status,
      transport: server.transport, authMode: server.authMode, scope: server.organizationScope,
      dataPolicy: server.dataPolicy, certified: server.status === "CERTIFIED",
      configured: server.authMode === "NONE" || (server.authMode === "OAUTH_USER"
        ? isMcpOAuthPlatformConfigured(server)
        : Boolean(server.authEnvKey && process.env[server.authEnvKey]?.trim())),
      connectedGrants: server.authMode === "OAUTH_USER" && grants.status === "fulfilled" ? grantTotals.get(server.code) || 0 : null,
      enabledBindings: MCP_TOOL_BINDINGS.filter((b) => b.serverCode === server.code && b.enabled).length,
      reachable: null,
      discovery: latest.get(server.code) || null,
      suspended: controls.status === "fulfilled" ? (controlStates.get(server.code)?.suspended || false) : null,
      revision: controls.status === "fulfilled" ? (controlStates.get(server.code)?.revision || 0) : null,
      audit: audit.status === "fulfilled" ? activity.get(server.code) || { successful: 0, denied: 0, failed: 0 } : null,
    })),
    bindings: MCP_TOOL_BINDINGS.map((b) => {
      const d = latest.get(b.serverCode);
      return {
        code: b.dtscToolCode, serverCode: b.serverCode,
        enabled: b.enabled, mode: b.mode, certifiedVersion: b.certifiedDiscoveryVersion,
        discoveryMatches: d ? d.compatible && d.version === b.certifiedDiscoveryVersion : null,
        assistants: b.allowedAssistantCodes || null, contexts: b.contexts,
        requiredModules: b.requiredModuleCodes.length, requiredPermissions: b.requiredPermissions.length,
      };
    }),
    assistants: getAssistantProfiles().map((a) => ({
      code: a.code, scope: a.scope, version: a.version, toolPolicy: a.toolPolicyCode,
      knowledgePolicy: a.knowledgePolicyCode, modelPolicy: a.modelPolicyCode,
      dataPolicy: a.dataPolicyCode, sector: a.sectorCode || null, contexts: a.allowedContexts,
    })),
    telemetry: [discovery, audit, grants, controls].every((r) => r.status === "fulfilled") ? "AVAILABLE" : "PARTIAL",
    auditedSince: since.toISOString(),
  };
}
