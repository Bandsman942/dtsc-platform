# DTSC Standard AI — MCP Gateway Architecture

## Objective

DTSC integrates Model Context Protocol only behind the canonical AI Tool Gateway. MCP discovery is metadata, not authority. A remote MCP server cannot grant DTSC permissions, activate a tool, select a tenant, downgrade a data classification, or bypass confirmation/idempotency/audit rules.

## Mandatory flow

```text
MCP server configuration
  -> certified server registry
  -> controlled discovery snapshot
  -> explicit disabled-by-default binding
  -> canonical AiToolDefinition
  -> Tool Gateway Zod/runtime validation
  -> DTSC context/assistant/tenant/module/plan authorization
  -> MCP exact permission check when configured
  -> DTSC data boundary
  -> current remote schema verification
  -> hardened MCP transport
  -> remote READ tool
  -> Tool Gateway audit + MCP audit
```

A discovered tool that has no enabled `MCP_*` binding never enters `AI_TOOL_REGISTRY`, receives no runtime schema, has no executor and is invisible to model/tool selection.

## Configuration

### Servers

`DTSC_MCP_SERVERS_JSON` is server-only configuration. Empty/missing configuration means zero MCP servers. Each server declares:

- stable code and label;
- HTTPS endpoint and exact host allow-list;
- `STREAMABLE_HTTP` transport;
- allowed DTSC session contexts;
- `GLOBAL` or `TENANT` organization scope;
- `DISABLED`, `CERTIFIED` or `SUSPENDED` status;
- data policy (`PUBLIC_ONLY`, `BUSINESS_ALLOWED`, `SENSITIVE_CERTIFIED`);
- `NONE` or `BEARER_ENV` authentication;
- server-side token environment-variable name when required;
- timeout and maximum response size;
- allowed tool modes.

AI07 rejects every non-READ mode in the certified server registry.

### Tool bindings

`DTSC_MCP_TOOL_BINDINGS_JSON` is an explicit allow-list. Bindings default to `enabled: false`. An enabled binding must include:

- certified MCP server code;
- remote tool name;
- DTSC code prefixed `MCP_`;
- approved discovery version;
- certified input/output schemas and SHA-256 hashes;
- DTSC contexts, modules, permissions, plan, assistants and sectors;
- READ mode only;
- no mutation confirmation flag;
- optional tighter timeout;
- audit level.

Unsupported JSON Schema constructs fail closed. The initial converter supports bounded object/array/primitive/enum schemas and rejects composition (`oneOf`, `anyOf`, `allOf`, `$ref`, `not`) until explicitly implemented and tested.

## Discovery

`discoverMcpServer()` reads `tools/list` and, when available, `resources/list` and `prompts/list`. The normalized snapshot receives a deterministic SHA-256 version. `discoverAndPersistMcpServer()` compares it with the last persisted snapshot and writes:

- `AiMcpDiscoverySnapshot`;
- `AiMcpAuditEvent` for changed discovery.

Added tools do not auto-activate. Removed or schema-changed tools make a discovery comparison incompatible. Before each bound tool call, the current remote input/output schema hashes must still match the certified binding; otherwise execution fails with a stable schema-change reason.

## Tool Gateway integration

Enabled MCP bindings are appended to `AI_TOOL_REGISTRY` as normal `AiToolDefinition` objects. `lib/ai/tools/schemas.ts` resolves their certified runtime validators and `lib/ai/tools/executors/index.ts` resolves an MCP executor only for an enabled binding.

Therefore `executeAiTool()` remains the only business execution entry point. Existing Tool Gateway rules still apply before the MCP executor is reached.

## Tenant and permission boundary

A `TENANT` MCP server requires:

- active session context `ORGANIZATION`;
- `context.organizationId`;
- exact equality with `session.activeOrganizationId`.

Canonical Tool Gateway module/plan access runs first. If the MCP binding declares exact `requiredPermissions`, `authorizeMcpRequiredPermissions()` additionally verifies active organization membership, role assignments and position permissions. Enterprise owner/admin roles and `enterprise.admin.manage` remain the canonical administrative overrides.

## Data boundary

DTSC AI classifications are normalized before MCP egress:

- `PUBLIC` -> PUBLIC;
- `INTERNAL` -> INTERNAL;
- `CONFIDENTIAL` -> CONFIDENTIAL;
- `RESTRICTED`, `HEALTH_SENSITIVE`, `HR_SENSITIVE`, `FINANCIAL_SENSITIVE`, `LEGAL_SENSITIVE` -> SENSITIVE;
- `SECRET` -> SECRET.

`SECRET` is never sent. Sensitive data requires a `SENSITIVE_CERTIFIED` server. `PUBLIC_ONLY` servers reject every non-public classification.

## First delivery boundary

AI07 intentionally ships with no invented connector and no default certified server. A real GitHub, Drive, CRM, calendar or document connector is activated only after its real endpoint/authentication/data policy are available and its discovery snapshot is reviewed.

This iteration enables only READ MCP tools. PREPARE, MUTATE and SENSITIVE_MUTATE bindings are rejected by registry integrity checks.

## Persistence

Additive migration `20260810004000_ai_mcp_gateway_governance` creates:

- `AiMcpDiscoverySnapshot` for versioned remote capabilities;
- `AiMcpAuditEvent` for discovery and execution evidence.

A companion `prisma/standard-ai-mcp.prisma` fragment records the intended declarative models. As with the AI05/AI06 stacked work, final integration must reconcile these fragments into the then-current canonical Prisma schema before merge to `main`.
