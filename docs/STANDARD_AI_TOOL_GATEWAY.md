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

Mutations must never rely on natural-language confirmation such as `oui`, `yes`, or model interpretation alone.

`AiToolConfirmation` binds confirmation to:

- user;
- organization when applicable;
- conversation;
- turn;
- tool code;
- canonical SHA-256 argument hash;
- expiry timestamp.

A confirmation is single-use: `PENDING -> CONFIRMED -> CONSUMED`. An expired, cross-user, cross-tenant, cross-conversation, cross-turn, wrong-tool or wrong-arguments confirmation is rejected.

## Idempotency contract

`AiToolExecution` records a deterministic scope hash built from user, organization, conversation, turn, tool code and arguments hash. A unique database constraint prevents duplicate execution within that scope. Successful idempotent executions can be reused rather than repeated.

## Pharmacy migration

The first executable tool family is Pharmacy READ. Canonical tool codes cover dashboard, low stock, expiry/FEFO, alerts, sales, cash sessions, purchases, quality incidents and document summaries.

The first implementation deliberately bridges the existing private `runPharmacyReadTools()` query layer so the Gateway does not duplicate established Prisma business queries. The bridge is temporary; authorization and execution contracts are already canonical and can later point to direct per-tool query functions without changing assistant integration.

## Mutation boundary

`SUPPORT_TICKET_CREATE` and `DTSC_CONTACT_EMAIL_SEND` are registered as MUTATE, confirmation-required and idempotent, but they must remain non-executable until dedicated executors use the Gateway confirmation lifecycle. Existing keyword/model based mutation paths must not be considered migrated until that replacement is complete.

## Persistence

The additive migration `20260810002000_ai_tool_gateway_confirmation_idempotency` adds:

- `AiToolConfirmation`;
- `AiToolExecution`;
- lookup indexes;
- unique idempotency scope.

No existing business data is rewritten.

## QA

Static policy gates are wired into the Standard AI iteration QA aggregator:

- `qa-standard-ai-tool-gateway.mjs`;
- `qa-standard-ai-tool-confirmation-idempotency.mjs`.

These scripts are guards, not evidence that full runtime validation has been executed in the current environment. Before merge, run Prisma generation, type-check, lint, targeted tests, regression QA and build according to `AGENTS.md`.
