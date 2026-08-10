# DTSC Standard AI — Tool Gateway

## Scope

The Tool Gateway is the only approved execution boundary for model-initiated tools in DTSC. AI06 established internal READ/PREPARE/MUTATE execution; AI07 extends the same boundary to explicitly certified remote MCP READ tools without creating a second orchestration/runtime.

## Core rule

A model never receives direct authority over a database mutation or remote side effect. A tool becomes executable only when its canonical definition, runtime schemas, explicit executor, centralized authorization, tenant/module/plan/sector/context checks, confirmation/idempotency policy and audit contract all agree.

Definitions without schemas or executors are not executable and must not be exposed to the model.

## Tool modes

- `READ`: authorized live read; no mutation confirmation and no execution-result caching through idempotency.
- `PREPARE`: creates a draft/result without final mutation. `TASK_DRAFT_PREPARE` remains the certified first PREPARE tool.
- `MUTATE`: side effect only after structural human confirmation and with idempotence.
- `SENSITIVE_MUTATE`: reserved for stronger controls; no payment, accounting posting or clinical mutation is certified by AI06/AI07.

## Authorization order

For organization-scoped tools the Gateway reuses canonical DTSC authorities:

- session context and active organization binding;
- Enterprise AI access/settings/entitlements;
- assistant profile and sector restrictions;
- SaaS plan;
- enterprise module access;
- data classification.

`SECRET` fails closed. A client/model supplied tool code never grants authority.

## Runtime validation

`executeAiTool()` resolves a definition, Zod input/output schemas and executor before execution. Model arguments are parsed before authorization/execution; executor output is validated before persistence or return.

Arbitrary dynamic import or path execution driven by model/client text is forbidden.

## Confirmation contract

Mutations never use natural-language approval such as `oui`, `yes`, `ok` or model interpretation as confirmation. `AiToolConfirmation` binds a pending action to user, organization, conversation, turn, tool code, canonical arguments hash and expiry.

Validated arguments remain server-side. The browser receives a confirmation identifier and sanitized preview. Confirmation is single-use and cancellation/expiration prevents execution.

The same-origin/session-scoped APIs are:

- `GET /api/ai/tools/pending`;
- `POST /api/ai/tools/confirm`;
- `POST /api/ai/tools/cancel`.

## Idempotency contract

Mutations use deterministic `AiToolExecution.idempotencyScopeKey` and an atomic `ON CONFLICT ... DO NOTHING RETURNING id` claim so concurrent retries cannot repeat a side effect.

Live `READ` tools intentionally use `idempotent: false`; every read receives a unique execution scope. This prevents an earlier successful read from becoming an implicit stale business-data cache.

## Internal certified tools

AI06 keeps:

- Pharmacy dashboard/stock/expiry/alerts/sales/cash/purchases/quality/document READ tools;
- `TASK_DRAFT_PREPARE`;
- `SUPPORT_TICKET_CREATE` and `DTSC_CONTACT_EMAIL_SEND` as confirmation-required idempotent mutations.

The Pharmacy deterministic selector is only a temporary selection fallback. Every selected code still passes through `executeAiTool()` and `authorizeAiTool()`.

## MCP extension in AI07

MCP remains subordinate to this Gateway:

```text
controlled MCP discovery
  -> explicit disabled-by-default binding
  -> canonical AiToolDefinition
  -> Tool Gateway authorization + Zod
  -> MCP-specific permission/data/schema checks
  -> hardened remote READ executor
```

`DTSC_MCP_TOOL_BINDINGS_JSON` entries are not executable merely because a remote server advertises them. Only an enabled binding on a certified server is projected into `AI_TOOL_REGISTRY` and receives a dynamic MCP executor/schema.

AI07 is READ-only. MCP definitions use `requiresConfirmation: false` and `idempotent: false`. PREPARE/MUTATE/SENSITIVE_MUTATE MCP modes are rejected by registry integrity.

Tenant-scoped MCP execution re-checks exact active organization and binding-specific DTSC permissions before any network call. Current remote input/output schema hashes must match the certified binding immediately before `tools/call`.

MCP resources use separate bindings and are returned as `UNTRUSTED_EXTERNAL_CONTENT` with `instructionAuthority: NONE`; they are never automatically promoted into RAG/CAG/system authority.

See `docs/STANDARD_AI_MCP_ARCHITECTURE.md` and `docs/STANDARD_AI_MCP_SECURITY.md`.

## Persistence

AI06 uses the additive Tool Gateway confirmation/execution persistence. AI07 additively introduces `AiMcpDiscoverySnapshot` and `AiMcpAuditEvent` through migration `20260810004000_ai_mcp_gateway_governance`.

The repo uses Prisma multi-file schema configuration (`prisma.schema = ./prisma`). The AI governance/MCP fragments are therefore canonical schema fragments, not temporary duplicate models to copy into another file.

`AiToolExecution` remains the transversal execution source of truth. `EnterpriseAiToolCall` is only an Enterprise-domain projection. `AiMcpAuditEvent` adds protocol/server/discovery evidence without replacing canonical execution identity.

## QA

AI06 gates remain mandatory. AI07 adds:

- MCP registry integrity;
- explicit tool/resource binding integrity;
- auth/permission checks;
- SSRF/rate-limit guards;
- data-policy fail-closed checks;
- tenant isolation;
- discovery/schema-drift checks;
- MCP 2026-07-28 protocol checks including JSON+SSE and Base64 header encoding.

All AI00→AI07 checks are wired into `scripts/qa-standard-modules-iteration-05.mjs`, which is part of the full regression command. CI remains authoritative for Prisma generation, clean migrations, type-check, regression, lint, build and specialized acceptance workflows.

## Current boundary

AI07 provides the certified MCP execution capability but enables no fabricated external connector. Empty MCP configuration is the safe default. Real connectors are activated only after endpoint/auth/data-policy review, explicit bindings, discovery/hash certification and E2E evidence. Agent loops and multi-step autonomous execution remain AI08.
