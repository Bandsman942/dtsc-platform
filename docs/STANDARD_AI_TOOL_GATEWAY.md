# DTSC Standard AI — Tool Gateway

## Scope

This document defines the runtime contract for AI tools used by DTSC assistants. The Tool Gateway is the only approved path for model-initiated business actions.

## Core rule

A model never receives direct authority over a database mutation or external side effect. A tool becomes executable only when all of the following exist and agree:

1. canonical definition in `lib/ai/tool-registry.ts`;
2. runtime Zod input and output schemas;
3. explicit executor registration;
4. centralized authorization;
5. tenant/module/plan/sector/context checks where relevant;
6. structured confirmation for every mutation;
7. idempotency for every mutation;
8. audit persistence.

Definitions without schemas or executors are intentionally non-executable and must not be exposed to a model.

## Tool modes

- `READ`: authorized read only; no human confirmation.
- `PREPARE`: creates a draft/result without final mutation. `TASK_DRAFT_PREPARE` is the first certified PREPARE tool and never writes a task by itself.
- `MUTATE`: side effect allowed only after a structural human confirmation.
- `SENSITIVE_MUTATE`: reserved for stronger future controls; AI06 does not certify payments, accounting postings or clinical mutations.

## Authorization order

For organization-scoped tools the Gateway reuses existing authorities instead of inventing parallel RBAC:

- active session context and organization binding;
- Enterprise AI access/settings/entitlements via `getEnterpriseAiAccess()`;
- assistant profile restrictions;
- sector restriction;
- minimum SaaS plan;
- canonical enterprise module access via `resolveEnterpriseModuleAccess()`;
- data classification restrictions.

The registry preserves `requiredPermissions` as declarative policy metadata while the current Enterprise execution path delegates effective membership/role/permission enforcement to the canonical module-access engine. `SECRET` data fails closed.

## Runtime validation

Model-provided arguments are untrusted. `executeAiTool()` parses arguments with the canonical Zod schema before authorization or execution. Executor output is also validated before it is persisted or returned to the assistant.

A client-provided `toolCode` can only resolve a statically registered executor. Arbitrary dynamic import or path execution driven by model/client text is forbidden.

## Confirmation contract

Mutations never rely on natural-language confirmation such as `oui`, `yes`, `ok` or model interpretation alone.

`AiToolConfirmation` binds confirmation to:

- user;
- organization when applicable;
- conversation;
- turn;
- tool code;
- canonical SHA-256 argument hash;
- expiry timestamp.

Validated business arguments are stored server-side with the pending confirmation. The browser receives only a confirmation identifier plus a sanitized preview. When the user confirms, the server reloads those stored arguments and re-applies the Gateway boundary; the browser never resubmits editable business arguments as authority.

A confirmation is single-use: `PENDING -> CONFIRMED -> CONSUMED`. An expired, cross-user, cross-tenant, cross-conversation, cross-turn, wrong-tool or wrong-arguments confirmation is rejected. Cancellation moves a pending confirmation to `CANCELLED` and clears the stored arguments.

### HTTP surface

- `GET /api/ai/tools/pending` lists the current user's non-expired pending confirmations in the active organization context. An optional `conversationId` narrows the list.
- `POST /api/ai/tools/confirm` accepts only `{ confirmationId }`, confirms the matching server-side request and executes it through the Gateway.
- `POST /api/ai/tools/cancel` accepts only `{ confirmationId }` and cancels a matching pending request.

All three endpoints are same-origin and session scoped. Mutation confirmation/cancellation are rate limited.

## Chat confirmation UX

`components/chat/ai-tool-confirmation-dock.tsx` provides the user-facing approval control for the DTSC chatbot and is mounted by `app/chat/page.tsx`.

The control is French/English and responsive, shows only sanitized information such as subject and ticket priority, exposes explicit Confirm/Cancel actions, states that typing `oui/yes` is never authorization, and reports execution state through the existing toast system.

## Idempotency contract

`AiToolExecution` records a deterministic scope hash built from user, organization, conversation, turn, tool code and arguments hash. A unique database constraint prevents duplicate execution within that scope.

`executeAiTool()` checks for an already successful idempotent execution before creating another side effect and performs the execution claim using `ON CONFLICT ... DO NOTHING RETURNING id`. Only the request that inserts the `STARTED` row may call the executor. A concurrent duplicate returns `TOOL_EXECUTION_IN_PROGRESS` rather than performing a second mutation.

## Pharmacy migration

The first migrated executable tool family is Pharmacy READ. Canonical codes cover dashboard, low stock, expiry/FEFO, alerts, sales, cash sessions, purchases, quality incidents and document summaries.

The existing `runPharmacyReadTools()` export is now a compatibility adapter. It performs deterministic selection as a temporary fallback, then every selected code still passes through `executeAiTool()` and `authorizeAiTool()`. Selection therefore has no authorization authority.

Raw established Prisma business queries live in `lib/enterprise-ai/pharmacy-tool-data.ts` and remain organization-scoped. Structured provider tool calling may replace keyword selection later without changing the Gateway execution boundary.

## Private chatbot mutations

`SUPPORT_TICKET_CREATE` and `DTSC_CONTACT_EMAIL_SEND` are registered as `MUTATE`, confirmation-required and idempotent, with explicit executors in `lib/ai/tools/executors/private-actions.ts`.

`lib/private-chat-actions.ts` no longer directly creates support tickets, contact messages, notifications or outbound Zoho mail. It only extracts intent, validates required fields and asks the Gateway to prepare a pending confirmation. The actual side effect occurs only through the structured confirmation endpoint.

The private intent extractor still uses the legacy direct OpenAI Responses call as a temporary parsing bridge. It has no mutation authority. Migrating that parsing bridge to canonical multimodel structured tool calls is a later orchestration cleanup.

## Persistence

The additive migration `20260810002000_ai_tool_gateway_confirmation_idempotency` adds `AiToolConfirmation`, `AiToolExecution`, lookup indexes and the unique idempotency scope. No existing business data is rewritten.

The same models are synchronized in both `prisma/standard-ai-governance.prisma` and the canonical `prisma/schema.prisma` before merge eligibility.

Enterprise executions may additionally write `EnterpriseAiToolCall` when an organization conversation is available. This is an Enterprise-domain projection, not a competing source of truth for transversal execution identity: `AiToolExecution` owns Tool Gateway idempotency and execution state.

## QA

AI06 is wired into the Standard AI regression aggregator with dedicated guards:

- `qa-standard-ai-tool-gateway.mjs` — registry/schema/executor/runtime/UI integrity;
- `qa-standard-ai-tool-authorization.mjs` — context, assistant, tenant, plan, module and classification authorization;
- `qa-standard-ai-tool-confirmation-idempotency.mjs` — structural bindings, single use, schema/migration parity and concurrency/idempotency;
- `qa-standard-ai-tool-tenant-isolation.mjs` — organization scoping of confirmations and Pharmacy loaders;
- `qa-standard-ai-private-tool-actions.mjs` — no direct email/ticket mutation bypass and no natural-language confirmation authority.

CI remains authoritative for Prisma generation, clean-database migration, type-check, regression, lint, build and specialized acceptances.

## Iteration boundary

AI06 establishes the canonical Tool Gateway and first controlled READ/PREPARE/MUTATE integrations. MCP discovery and remote MCP execution are explicitly out of scope and belong to AI07. MCP tools must later enter through these same registry, authorization, schema, confirmation, idempotency and audit contracts rather than bypassing them.
