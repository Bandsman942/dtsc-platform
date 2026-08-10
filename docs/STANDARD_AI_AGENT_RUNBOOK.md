# DTSC Standard AI — Agent Runtime Runbook

## Scope

This runbook covers AI08 interactive agent incidents, rollback and operational verification. It does not activate the reserved `DURABLE` agent class.

## Fast triage

Check in this order:

1. identify the Production SHA and the affected agent run id;
2. read `AiAgentRun.status`, `reasonCode`, limits and aggregate usage;
3. read `AiAgentStep` metadata without exposing prompts or private reasoning;
4. identify provider/model attempts through the existing AI observability layer;
5. verify Tool Gateway authorization/execution records for any tool involved;
6. verify the active tenant and current user permissions;
7. determine whether an external provider/MCP dependency is involved.

Never copy `metadataJson`, tool arguments, prompts, secrets or sensitive source content into an incident channel unless the destination is explicitly authorized for that classification.

## Common states

### `BUDGET_EXHAUSTED`

Expected controlled stop. Check which server ceiling was reached: steps, tool calls, tokens, estimated cost or active duration. Do not raise limits client-side. Change server policy only through normal review and QA.

### `WAITING_CONFIRMATION`

The run has proposed a mutation and is suspended. Confirm that `pendingConfirmationId` points to a live `AiToolConfirmation`. Natural-language replies are not authorization.

If the user rejects the confirmation, `/api/ai/tools/cancel` must cancel the proposal and close the linked waiting run with `CONFIRMATION_CANCELLED`.

### `READY_TO_RESUME`

A canonical `AiToolExecution(status=SUCCESS)` exists after structural approval. Resume only through `/api/ai/agent/runs/:id/resume`; do not accept browser-supplied tool results or arguments.

### `CANCELLED`

Cancellation is terminal for the run. Previously executed mutations remain auditable and are not rolled back implicitly.

### Provider failure

Use AI provider attempt observability to distinguish retryable provider/network failures from policy refusal. Provider fallback belongs to the Policy Router; do not add a second fallback loop in Agent Runtime.

## Security incidents

Immediately stop promotion and investigate if any of the following occurs:

- tool execution without `executeAiTool()`;
- cross-tenant run or tool visibility;
- external provider/MCP call for `SECRET` data;
- mutation without structural confirmation where confirmation is required;
- duplicate non-idempotent mutation after retry;
- prompt, private chain-of-thought or tool arguments exposed by run status/UI;
- client values increasing server budgets;
- `SENSITIVE_MUTATE` exposed to the model in the AI08 baseline.

## Rollback

AI08 routes are opt-in and legacy chat routes remain independent. The preferred rollback is therefore:

1. revert the AI08 application PR from `main` using the normal governed release process;
2. keep additive `AiAgentRun` / `AiAgentStep` schema in place if a destructive rollback is unnecessary;
3. stop exposing Agent Mode in the immersive assistant shell;
4. leave historical Agent/Tool execution records intact for audit;
5. expire or cancel pending confirmations rather than deleting audit history;
6. verify legacy `/api/chat/v2` and `/api/enterprise/ai/chat` behavior;
7. rerun Quality Gates and production-like acceptance before redeploying.

Do not delete already executed business mutations as part of application rollback. Reversal, when legitimate, must use the canonical business workflow for that domain.

## Post-deploy verification

On the exact Production SHA, verify at minimum:

- Global Chatbot Agent Mode starts a bounded run;
- Enterprise Agent Mode resolves the active organization correctly;
- a READ tool is visible only when authorized;
- PREPARE produces a draft without final mutation;
- a certified MUTATE suspends for explicit approval;
- approval produces one canonical execution and one resume path;
- rejection closes the waiting run without mutation;
- cancellation closes an active or suspended run;
- cross-tenant and sensitive-domain scenarios fail closed;
- tokens/cost are aggregated without functional double counting;
- no private reasoning is displayed or persisted.

## Commercial readiness evidence

`COMMERCIAL_READY` requires owner-executed Production E2E evidence on a `main` SHA, including configured provider/fallback and MCP scenarios where applicable. Lack of a real configured provider or certified MCP server must be recorded as a missing proof, never converted into a synthetic pass.
