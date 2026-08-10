# DTSC Standard AI — MCP Gateway Architecture

## Objective

AI07 integrates Model Context Protocol only behind the canonical DTSC AI Tool Gateway delivered by AI06. MCP discovery is metadata, not authority: a remote server cannot grant DTSC permissions, choose a tenant, bypass plan/module checks, downgrade a data classification, auto-activate a tool, or execute a mutation outside the Tool Gateway.

AI08 does not create a parallel MCP runtime. Bounded agent loops may consume only MCP tools that are already projected into the canonical Tool Gateway and authorized for the current run.

## Mandatory flow

```text
MCP server configuration
  -> certified server registry
  -> controlled discovery snapshot
  -> explicit disabled-by-default binding
  -> canonical AiToolDefinition
  -> Tool Gateway schema validation
  -> DTSC context/assistant/tenant/module/plan authorization
  -> exact MCP binding permissions
  -> DTSC data boundary
  -> current remote schema verification
  -> hardened Streamable HTTP transport
  -> remote READ tool
  -> Tool Gateway audit + MCP audit
  -> optional bounded AI08 agent continuation
```

A discovered tool without an enabled `MCP_*` binding never enters `AI_TOOL_REGISTRY`, receives no runtime executor, and is invisible to model/tool selection, including Agent Mode.

## Protocol baseline

DTSC targets MCP `2026-07-28` over stateless Streamable HTTP. Each request is an independent POST and carries:

- `MCP-Protocol-Version: 2026-07-28`;
- `Mcp-Method`;
- `Mcp-Name` for `tools/call`, `resources/read`, and `prompts/get`;
- per-request `_meta` protocol/client metadata.

The client advertises both `application/json` and `text/event-stream`, accepts either JSON or request-scoped SSE responses, rejects redirects, and does not use the removed protocol-level session/GET-stream behavior.

`Mcp-Name` and `Mcp-Param-*` values use the MCP Base64 sentinel form when plain header transmission is unsafe (non-ASCII/control characters, leading/trailing whitespace, or a value already matching the sentinel form).

## Server registry

`DTSC_MCP_SERVERS_JSON` is server-only configuration. Empty or missing configuration means zero MCP servers.

Each definition declares a stable code, endpoint, exact host allow-list, contexts, tenant/global scope, status, data policy, authentication mode, timeout/response limits, and allowed tool modes.

AI07 accepts READ mode only. `BEARER_ENV` resolves credentials exclusively from a dedicated server-side environment variable. The same auth env key cannot be intentionally assigned to multiple server definitions.

## Controlled discovery

`discoverMcpServer()` inventories `tools/list` plus optional `resources/list` and `prompts/list`. The normalized snapshot receives a deterministic SHA-256 version and is persisted in `AiMcpDiscoverySnapshot`.

Discovery never activates a capability. Added tools remain disabled. Removed or schema-changed tools mark discovery incompatible. Immediately before an enabled tool call, the current input/output schema hashes must still match the certified binding.

## Tool bindings

`DTSC_MCP_TOOL_BINDINGS_JSON` is an explicit allow-list. Bindings default to `enabled: false` and pin:

- server code and remote tool name;
- DTSC `MCP_*` code;
- certified discovery version;
- input/output schema hashes and schemas;
- contexts, modules, exact permissions, minimum plan, assistants and sectors;
- timeout and audit level.

All MCP tools in AI07/AI08 are `READ`, require no mutation confirmation, and are deliberately `idempotent: false`. This is important: a live remote read must not reuse a historical `AiToolExecution` result as an implicit cache.

## Tool Gateway integration

Enabled MCP bindings are projected into canonical `AiToolDefinition` objects. Runtime input/output schemas are derived from the certified JSON Schema and validated with Zod. Executors resolve through the existing AI06 executor boundary. `executeAiTool()` therefore remains the only business execution entry point.

The existing AI06 mutation guarantees remain unchanged: MCP does not introduce PREPARE/MUTATE/SENSITIVE_MUTATE in AI07 or AI08.

## AI08 Agent Runtime integration

Agent Mode receives only the MCP tool definitions that survive both canonical Tool Gateway authorization and the run budget/tool allow-list. A model-proposed MCP call then re-enters `executeAiTool()` like any other tool.

The agent cannot:

- discover a new MCP tool during a run and self-enable it;
- change a certified endpoint or schema hash;
- widen tenant, plan, assistant or module permissions;
- convert a READ MCP binding into a mutation;
- send `SECRET` data externally;
- treat an MCP resource/prompt as instruction authority.

An MCP result is reinjected into the model as untrusted tool data. The agent can use it for synthesis, but it cannot promote that result to system/CAG authority.

A real MCP Agent E2E is not claimed unless a server is actually configured and certified in the environment under test. Empty MCP configuration remains a valid fail-closed production state, but it is not evidence that the MCP Agent scenario passed.

## Tenant, permission and plan boundary

Canonical Tool Gateway authorization runs first. A tenant-scoped MCP server additionally requires an active `ORGANIZATION` session and exact equality between runtime `organizationId` and `session.activeOrganizationId`.

When a binding declares exact permissions, DTSC revalidates the active membership, organization role assignments, and enterprise position permissions before remote egress. Remote MCP metadata is never an authorization source.

The AI08 Enterprise Agent UI resolves the active organization from the authenticated session before it starts a run; this does not replace server-side revalidation at the MCP and Tool Gateway boundaries.

## Data boundary

DTSC classifications map to MCP egress levels:

- `PUBLIC` -> `PUBLIC`;
- `INTERNAL` -> `INTERNAL`;
- `CONFIDENTIAL` -> `CONFIDENTIAL`;
- `RESTRICTED`, `HEALTH_SENSITIVE`, `HR_SENSITIVE`, `FINANCIAL_SENSITIVE`, `LEGAL_SENSITIVE` -> `SENSITIVE`;
- `SECRET` -> `SECRET`.

`SECRET` is never sent. Sensitive data requires `SENSITIVE_CERTIFIED`. `PUBLIC_ONLY` rejects every non-public classification.

When a runtime supplies no explicit classification, DTSC fails closed to a conservative default: organization/DTSC-internal contexts become `CONFIDENTIAL`; other contexts become `INTERNAL`. Public egress therefore requires an explicit public classification.

## Resources and prompts

MCP resources are separate explicit bindings (`DTSC_MCP_RESOURCE_BINDINGS_JSON`), disabled by default, permission checked, tenant scoped where applicable, size limited, and returned with:

- `trust: UNTRUSTED_EXTERNAL_CONTENT`;
- `instructionAuthority: NONE`;
- MCP provenance/discovery version.

They are not automatically injected into RAG, CAG, system prompts, or model context. Remote prompts are discovery inventory only in AI07/AI08.

## Persistence

Migration `20260810004000_ai_mcp_gateway_governance` additively creates:

- `AiMcpDiscoverySnapshot`;
- `AiMcpAuditEvent`.

The repo uses Prisma multi-file schema configuration (`prisma.schema = ./prisma`), so `prisma/standard-ai-mcp.prisma` is part of the canonical schema layout rather than a temporary duplicate.

AI08 `AiAgentRun` / `AiAgentStep` records reference execution metadata but do not duplicate MCP discovery or protocol audit state.

## Delivery boundary

AI07 ships the secure MCP capability with zero configured servers by default. AI08 can orchestrate certified MCP READ tools only when such bindings exist.

A real GitHub, Drive, CRM, calendar, document, or other connector is enabled only after the actual endpoint, authentication, data policy, discovery snapshot, schema hashes, permissions, and E2E evidence are reviewed. No connector or MCP Agent pass is fabricated for roadmap optics.
