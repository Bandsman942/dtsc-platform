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

Definitions without executors are intentionally non-executable and must not be exposed to a model.

## Authorization order

For organization-scoped tools the Gateway reuses existing authorities instead of inventing parallel RBAC:

- active session context and organization binding;
- Enterprise AI access/settings/entitlements via `getEnterpriseAiAccess()`;
- assistant profile restrictions;
- sector restriction;
- minimum SaaS plan;
- canonical enterprise module access via `resolveEnterpriseModuleAccess()`;
- data classification restrictions.

`SECRET` data is rejected by the Gateway.

## Runtime validation

Model-provided arguments are untrusted. `executeAiTool()` parses arguments with the canonical Zod schema before authorization or execution. Executor output is also validated before it is persisted or returned to the assistant.

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

The validated business arguments are stored server-side with the pending confirmation. The browser receives only a confirmation identifier plus a sanitized preview. When the user confirms, the server reloads the stored arguments and re-applies authorization before execution; the browser never resubmits mutable business arguments as authority.

A confirmation is single-use: `PENDING -> CONFIRMED -> CONSUMED`. An expired, cross-user, cross-tenant, cross-conversation, cross-turn, wrong-tool or wrong-arguments confirmation is rejected. Cancellation moves a pending confirmation to `CANCELLED`.

### HTTP surface

- `GET /api/ai/tools/pending` lists the current user's non-expired pending confirmations in the active organization context. An optional `conversationId` narrows the list.
- `POST /api/ai/tools/confirm` accepts only `{ confirmationId }`, confirms the matching server-side request and executes it through the Gateway.
- `POST /api/ai/tools/cancel` accepts only `{ confirmationId }` and cancels a matching pending request.

All three endpoints are same-origin and session scoped. Confirmation and cancellation are rate limited where relevant.

## Chat confirmation UX

`components/chat/ai-tool-confirmation-dock.tsx` provides the user-facing approval control for the private DTSC chatbot. It is mounted by `app/chat/page.tsx` and portaled into the immersive chatbot surface so the streaming workspace does not need to be structurally rewritten.

The control:

- is localized in French and English;
- is responsive on mobile and desktop;
- displays only a sanitized subject and ticket priority when available;
- exposes explicit **Confirm** and **Cancel** actions;
- displays the rule that typing `yes/oui` in the chat is never authorization;
- reports success or failure through the existing toast system;
- refreshes pending confirmations while the chat is open.

## Idempotency contract

`AiToolExecution` records a deterministic scope hash built from user, organization, conversation, turn, tool code and arguments hash. A unique database constraint prevents duplicate execution within that scope.

`executeAiTool()` checks for an already successful idempotent execution before consuming another confirmation, allowing safe retries to reuse the prior result. It also performs the `AiToolExecution` insert with `ON CONFLICT ... DO NOTHING RETURNING id`. Only the request that actually inserts the `STARTED` row may invoke the executor. A concurrent duplicate sees the existing row and returns `TOOL_EXECUTION_IN_PROGRESS` instead of performing a second side effect.

## Pharmacy migration

The first migrated executable tool family is Pharmacy READ. Canonical tool codes cover dashboard, low stock, expiry/FEFO, alerts, sales, cash sessions, purchases, quality incidents and document summaries.

The existing `runPharmacyReadTools()` export is now a compatibility adapter that passes through the Tool Gateway. The raw established Prisma business queries live in `lib/enterprise-ai/pharmacy-tool-data.ts` and are invoked only by canonical Pharmacy executors. This avoids recursive Gateway calls while preserving established business query semantics.

## Private chatbot mutations

`SUPPORT_TICKET_CREATE` and `DTSC_CONTACT_EMAIL_SEND` are registered as `MUTATE`, confirmation-required and idempotent, with explicit executors in `lib/ai/tools/executors/private-actions.ts`.

`lib/private-chat-actions.ts` no longer directly creates support tickets, contact messages, notifications or outbound Zoho mail. It only extracts a requested action, validates the required fields and asks `executeAiTool()` to prepare a pending confirmation.

The actual side effect occurs only after the structured confirmation endpoint succeeds. The confirmation is bound to the persisted conversation and latest persisted user message (`turnId`).

The private intent extractor still uses the legacy direct OpenAI Responses call as a temporary parsing bridge. It has no mutation authority. Migrating intent extraction to the canonical multimodel orchestration layer is a later cleanup and does not change the Tool Gateway execution boundary.

## Persistence

The additive migration `20260810002000_ai_tool_gateway_confirmation_idempotency` adds:

- `AiToolConfirmation`;
- `AiToolExecution`;
- confirmation lookup indexes;
- the unique idempotency scope.

No existing business data is rewritten.

The Standard AI Prisma fragment is updated. Final consolidation must still synchronize the generated/main Prisma schema together with the AI05 RAG additions before the stacked AI program is integrated onto the then-current `main`.

## QA

Static policy gates are wired into the Standard AI iteration QA aggregator:

- `qa-standard-ai-tool-gateway.mjs`;
- `qa-standard-ai-tool-confirmation-idempotency.mjs`;
- `qa-standard-ai-private-tool-actions.mjs`.

The Tool Gateway QA now verifies Pharmacy registration, explicit private mutation executors, structured confirmation requirements, database-level concurrency protection and the chat confirmation control.

These scripts are guards, not evidence that full runtime validation has been executed in the current environment. Before merge, run Prisma generation, type-check, lint, targeted tests, regression QA and build according to `AGENTS.md`.

## Iteration boundary

AI06 establishes the canonical Tool Gateway and the first controlled READ/MUTATE integrations. MCP discovery and remote MCP execution are explicitly out of scope here and belong to AI07. MCP tools must enter through the same registry, authorization, schema, confirmation, idempotency and audit contracts rather than bypassing them.
