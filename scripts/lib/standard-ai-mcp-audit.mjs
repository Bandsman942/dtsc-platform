import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

export function runStandardAiMcpAudit(mode = "all") {
  const failures = [];
  const registry = read("lib/ai/mcp/registry.ts");
  const bindings = read("lib/ai/mcp/bindings.ts");
  const authorization = read("lib/ai/mcp/authorization.ts");
  const resourceAdapter = read("lib/ai/mcp/resource-adapter.ts");
  const security = read("lib/ai/mcp/security.ts");
  const transport = read("lib/ai/mcp/transport.ts");
  const adapter = read("lib/ai/mcp/tool-adapter.ts");
  const discovery = read("lib/ai/mcp/discovery.ts");
  const schema = read("lib/ai/mcp/schema.ts");
  const toolRegistry = read("lib/ai/tool-registry.ts");
  const schemas = read("lib/ai/tools/schemas.ts");
  const executors = read("lib/ai/tools/executors/index.ts");
  const migration = read("prisma/migrations/20260810004000_ai_mcp_gateway_governance/migration.sql");

  const check = (condition, message) => { if (!condition) failures.push(message); };

  if (["all", "registry"].includes(mode)) {
    check(registry.includes("DTSC_MCP_SERVERS_JSON"), "MCP servers must come from controlled server-side configuration");
    check(registry.includes('status === "CERTIFIED"'), "only CERTIFIED MCP servers may be listed as certified");
    check(registry.includes('mode !== "READ"'), "AI07 registry must reject non-READ tool modes");
    check(registry.includes("authEnvKeys"), "MCP bearer env keys must not be intentionally shared across certified servers");
    check(!registry.includes("NEXT_PUBLIC_"), "MCP registry must not use public client environment variables");
  }

  if (["all", "bindings"].includes(mode)) {
    check(bindings.includes("DTSC_MCP_TOOL_BINDINGS_JSON"), "MCP tool bindings must be explicit configuration");
    check(bindings.includes("enabled: z.boolean().default(false)"), "MCP bindings must default disabled");
    check(bindings.includes("certified input schema hash mismatch"), "MCP bindings must pin input schema hash");
    check(bindings.includes("certified output schema hash mismatch"), "MCP bindings must pin output schema hash");
    check(bindings.includes("idempotent: false"), "MCP READ tools must stay fresh and must not reuse historical tool execution results");
    check(toolRegistry.includes("listMcpAiToolDefinitions"), "canonical Tool Registry must include only bound MCP definitions");
    check(schemas.includes("getMcpBindingInputSchema"), "MCP input must use runtime validation");
    check(executors.includes("getMcpToolExecutor"), "MCP execution must stay behind canonical Tool Gateway executors");
    check(resourceAdapter.includes("DTSC_MCP_RESOURCE_BINDINGS_JSON"), "MCP resources must require explicit bindings");
    check(resourceAdapter.includes('trust: "UNTRUSTED_EXTERNAL_CONTENT"'), "MCP resource content must remain untrusted");
    check(resourceAdapter.includes('instructionAuthority: "NONE"'), "MCP resources must have no instruction authority");
  }

  if (["all", "auth"].includes(mode)) {
    check(transport.includes('authMode === "BEARER_ENV"'), "MCP bearer auth must be resolved server-side");
    check(transport.includes("process.env[envKey]"), "MCP token must be loaded from server environment");
    check(!adapter.includes("Authorization:"), "MCP tool adapter must not construct/export credentials");
    check(adapter.includes("MCP_TENANT_CONTEXT_REQUIRED"), "tenant MCP servers must enforce active organization context");
    check(adapter.includes("authorizeMcpRequiredPermissions"), "MCP tool binding permissions must be enforced before remote calls");
    check(resourceAdapter.includes("authorizeMcpRequiredPermissions"), "MCP resource binding permissions must be enforced before remote calls");
    check(authorization.includes("MCP_REQUIRED_PERMISSION_DENIED"), "missing exact MCP required-permission denial");
  }

  if (["all", "ssrf"].includes(mode)) {
    for (const marker of ["MCP_ENDPOINT_HTTPS_REQUIRED", "MCP_ENDPOINT_PRIVATE_NETWORK_FORBIDDEN", "MCP_ENDPOINT_DNS_PRIVATE_NETWORK_FORBIDDEN", "MCP_ENDPOINT_HOST_NOT_ALLOWLISTED"]) {
      check(security.includes(marker), `missing MCP SSRF guard ${marker}`);
    }
    check(transport.includes('redirect: "manual"'), "MCP transport must not automatically follow redirects");
    check(transport.includes("maxResponseBytes"), "MCP transport must cap response size");
    check(transport.includes("AbortController"), "MCP transport must enforce timeout");
    check(adapter.includes("await rateLimit"), "MCP tool execution must be rate limited before remote egress");
    check(resourceAdapter.includes("await rateLimit"), "MCP resource reads must be rate limited before remote egress");
  }

  if (["all", "data-policy"].includes(mode)) {
    check(security.includes("MCP_SECRET_DATA_FORBIDDEN"), "SECRET data must never be sent to MCP");
    check(security.includes("MCP_SENSITIVE_SERVER_NOT_CERTIFIED"), "sensitive data must require certified sensitive MCP policy");
    check(adapter.includes("effectiveClassifications"), "MCP tool calls must fail closed when no explicit data classification is supplied");
    check(resourceAdapter.includes("effectiveClassifications"), "MCP resources must fail closed when no explicit data classification is supplied");
    check(adapter.includes("authorizeMcpDataBoundary"), "MCP tool execution must apply data boundary before remote call");
    check(resourceAdapter.includes("authorizeMcpDataBoundary"), "MCP resource reads must apply data boundary before remote call");
  }

  if (["all", "tenant-isolation"].includes(mode)) {
    check(adapter.includes("activeOrganizationId !== input.context.organizationId"), "MCP tenant execution must compare active organization");
    check(adapter.includes("organizationScope === \"TENANT\""), "MCP tenant-scoped servers require explicit tenant policy");
    check(resourceAdapter.includes("activeOrganizationId !== input.context.organizationId"), "MCP tenant resource reads must compare active organization");
    check(toolRegistry.includes("requiredModuleCodes"), "MCP canonical definitions must remain subject to Tool Gateway module access");
  }

  if (["all", "discovery"].includes(mode)) {
    check(discovery.includes('method: "tools/list"'), "MCP discovery must use tools/list");
    check(discovery.includes("compareMcpDiscovery"), "MCP discovery must compare snapshots");
    check(adapter.includes("MCP_TOOL_INPUT_SCHEMA_CHANGED"), "changed MCP input schema must fail closed");
    check(adapter.includes("MCP_TOOL_OUTPUT_SCHEMA_CHANGED"), "changed MCP output schema must fail closed");
    check(migration.includes('CREATE TABLE "AiMcpDiscoverySnapshot"'), "MCP discovery snapshots must be persisted");
    check(migration.includes('CREATE TABLE "AiMcpAuditEvent"'), "MCP events must be audited");
  }

  if (["all", "protocol"].includes(mode)) {
    check(transport.includes('DTSC_MCP_PROTOCOL_VERSION = "2026-07-28"'), "MCP transport must target the approved protocol revision");
    check(transport.includes('Accept: "application/json, text/event-stream"'), "MCP Streamable HTTP client must advertise JSON and SSE");
    check(transport.includes('"MCP-Protocol-Version"'), "MCP protocol version header is required");
    check(transport.includes('"Mcp-Method"'), "MCP method header is required");
    check(transport.includes('"Mcp-Name"'), "MCP name header must be mirrored when applicable");
    check(transport.includes("io.modelcontextprotocol/protocolVersion"), "MCP per-request protocol metadata is required");
    check(transport.includes("text/event-stream") && transport.includes("parseSseJsonRpcResponse"), "MCP client must consume SSE responses");
    check(schema.includes("encodeMcpHeaderValue") && schema.includes("=?base64?"), "MCP header values must support Base64 sentinel encoding");
    check(transport.includes("encodeMcpHeaderValue(name)"), "Mcp-Name must use compliant header encoding");
  }

  if (failures.length) {
    console.error(`Standard AI MCP ${mode} QA failed:\n${failures.map((item) => `- ${item}`).join("\n")}`);
    process.exitCode = 1;
  } else {
    console.log(`Standard AI MCP ${mode} QA passed`);
  }
}
