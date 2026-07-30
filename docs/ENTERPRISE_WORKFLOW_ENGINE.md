# Common Enterprise Workflow Engine — Sprint 9

## 1. Purpose

The Common Workflow Engine orchestrates the dedicated ERP objects introduced by Core v2:

- `EnterpriseTask`;
- `EnterpriseRequest`;
- `EnterpriseApproval`;
- `EnterpriseMeeting`;
- `EnterprisePurchase`;
- `EnterpriseBudget`;
- `EnterpriseExpense`;
- `EnterpriseReport`.

The engine decides **what should happen next**. The dedicated domain service decides **whether and how that action may happen**.

The engine is not a replacement state machine, financial ledger, stock system, document repository or clinical workflow store. It never applies generic Prisma status patches to those domains.

## 2. Legacy workflow audit

The pre-existing `EnterpriseWorkflow` model belongs to sector templates and organization provisioning. It stores labels and `stepsJson` used by:

- `lib/enterprise/enterprise-workflows-loader.ts`;
- `lib/enterprise/enterprise-activity-workflows-loader.ts`;
- enterprise administration/activity presentation.

It is a catalog/configuration surface, not a durable runtime. Sprint 9 therefore keeps it readable and introduces dedicated execution models. No legacy entry is automatically published or executed. This prevents one business event from activating both the legacy catalog and Engine v2.

## 3. Persistence model

### Definitions

`EnterpriseWorkflowDefinition` is the stable logical workflow owned by one organization. `organizationId + code` is unique. It stores the trigger contract and points to the current published version.

### Versions

`EnterpriseWorkflowVersion` is `DRAFT`, `PUBLISHED` or `RETIRED`. Only a draft can be edited. Publishing retires the previously published version. A partial unique index enforces one published version per definition.

Existing runs never re-read `definition.currentVersionId`; they keep their initial `workflowVersionId`.

### Steps and transitions

`EnterpriseWorkflowStep` supports only:

- START;
- CONDITION;
- ASSIGN;
- CREATE_APPROVAL;
- CREATE_TASK;
- DOMAIN_ACTION;
- NOTIFICATION;
- WAIT_UNTIL;
- END.

`EnterpriseWorkflowTransition` links steps explicitly with an outcome, priority and optional typed declarative condition.

### Runs

`EnterpriseWorkflowRun` stores the source entity, trigger, exact version, current step, status, resume date, actors, revision and bounded failure information.

Statuses are:

- QUEUED;
- RUNNING;
- WAITING_APPROVAL;
- WAITING_TIME;
- BLOCKED;
- COMPLETED;
- REJECTED;
- FAILED;
- CANCELLED.

### Step runs and timeline

`EnterpriseWorkflowStepRun` records every step, attempt count, assignment, bounded input/output and failure details. `EnterpriseWorkflowEvent` produces the operational timeline displayed in the UI.

### Action attempts

`EnterpriseWorkflowActionAttempt` stores a stable idempotency key, attempt number, result entity and error category. Generated tasks, approvals and notifications therefore survive duplicate delivery without duplication.

## 4. Publication readiness and DAG validation

Publication is refused unless:

- exactly one START exists;
- at least one END exists;
- every referenced step belongs to the same version;
- every non-START step has an incoming route;
- every non-END step has a continuation;
- every step is reachable from START;
- at least one END is reachable;
- no cycle exists;
- condition steps have TRUE and FALSE branches;
- approval steps have APPROVED and REJECTED branches;
- branches are not ambiguous at the same priority;
- trigger events, condition fields, domain actions, assignments and placeholders are allowed by the adapter;
- specific users and department managers remain active members of the same organization.

The API returns a structured readiness response containing blocker codes, human-readable messages and optional step codes.

## 5. Conditions

Conditions are validated with Zod and evaluated without `eval`, JavaScript expressions, SQL or user regexes.

Allowed operators:

- EQUALS / NOT_EQUALS;
- IN / NOT_IN;
- GREATER_THAN / GREATER_THAN_OR_EQUAL;
- LESS_THAN / LESS_THAN_OR_EQUAL;
- EXISTS / NOT_EXISTS.

Each adapter exposes its own condition-field allow-list. Financial comparisons use `Prisma.Decimal`, not floating-point arithmetic.

## 6. Static domain adapter registry

`lib/enterprise/workflows/adapters/` contains an explicit registry. There is no `prisma[entityType]` dynamic access.

Each adapter can:

- load one organization-scoped entity;
- expose allowed condition fields and placeholders;
- resolve entity actors;
- expose allowed trigger events;
- call an allow-listed dedicated domain command.

Initial adapters:

| Entity | Authoritative command path |
|---|---|
| Task | Core v2 Task service |
| Request | Core v2 Request service |
| Meeting | Core v2 Meeting service |
| Purchase | Procurement Purchase service |
| Budget | Finance Budget service |
| Expense | Finance Expense service |
| Report | Reporting service |

Sector-specific objects are intentionally absent from V1. PHARMACY stock and HEALTH_CARE clinical truth are never mutated by this engine.

## 7. Assignment resolution

Supported strategies:

- SPECIFIC_USER;
- SPECIFIC_ROLE;
- DEPARTMENT_MANAGER;
- ENTITY_REQUESTER;
- ENTITY_ASSIGNEE;
- ENTITY_BUYER;
- ENTITY_CREATOR;
- PREVIOUS_STEP_ACTOR.

The server verifies an active `OrganizationMember` in the same organization at publication time where possible and again at runtime. An unresolved assignment blocks the run with `WORKFLOW_ASSIGNEE_NOT_FOUND`; the engine never selects an arbitrary person.

## 8. Approval orchestration

CREATE_APPROVAL uses the existing `EnterpriseApproval` model and dedicated creation/decision services. The approval has structural links:

- `workflowRunId`;
- `workflowStepRunId`.

Purchase, Budget and Expense submission services may already create the authoritative pending approval. The workflow links that approval instead of creating a second one. Approval steps are sequential: the next approval is created only after the current decision resumes and advances the run.

If requester and resolved approver are the same user, the run is blocked. Existing tenant, target-state, designated-approver and no-self-approval checks remain authoritative.

Approval decisions emit operational events. The durable outbox event resumes the linked step idempotently with APPROVED, REJECTED or CANCELLED.

## 9. Generated tasks and domain actions

CREATE_TASK calls the Sprint 6 task service and records source module/entity references. It never inserts a task directly from the runner.

DOMAIN_ACTION calls the adapter, which calls the dedicated service. The runner never performs a generic status update. Invalid business transitions become BUSINESS failures and normally block the run for an administrator to inspect.

## 10. Templates and notifications

Text templates support only adapter-approved placeholders such as:

- `{{entity.id}}`;
- `{{entity.reference}}`;
- `{{entity.title}}`;
- `{{entity.status}}`;
- `{{workflow.name}}`.

Templates are length-bounded and values are sanitized as plain text.

NOTIFICATION resolves the recipient server-side, uses the central notification/Web Push architecture and creates a deterministic notification ID from the step idempotency key. Locked-screen messages remain intentionally generic and do not include documents, clinical data or confidential financial payloads.

## 11. Durable waits

WAIT_UNTIL supports:

- a bounded relative number of hours;
- an allow-listed date field from the source adapter.

The run persists `WAITING_TIME + resumeAt`. No request, serverless function or JavaScript timer remains open. The worker resumes due runs.

The V1 maximum wait is one year. Negative, invalid or unlimited waits are rejected.

## 12. Transactional domain-event outbox

`EnterpriseOperationalEvent` is already written by authoritative ERP services in their business transactions. The Sprint 9 migration adds an `AFTER INSERT` PostgreSQL trigger that mirrors only allow-listed events to `EnterpriseDomainEvent` in the same transaction.

This prevents the failure mode where a domain mutation commits but its workflow event is lost after a process crash.

The outbox payload is deliberately small:

- fromStatus;
- toStatus;
- actorUserId;
- occurredAt;
- bounded metadata.

It does not copy the complete source entity or attached private content.

## 13. Worker and race safety

`processPendingWorkflowEvents()`:

1. claims a maximum of 20 due events;
2. uses PostgreSQL `FOR UPDATE SKIP LOCKED`;
3. stores `lockedAt` and `lockedBy` with a 90-second lease;
4. processes one event idempotently;
5. marks it PROCESSED, FAILED or DEAD;
6. applies bounded backoff;
7. resumes due WAITING_TIME runs.

Maximum attempts: 3.

The internal route is:

`GET|POST /api/internal/workflows/process`

It requires:

`Authorization: Bearer <WORKFLOW_WORKER_SECRET>`

The comparison is timing-safe. The secret must exist only in protected production environment variables and must never appear in logs, source code, responses or screenshots.

## 14. Failure handling

Categories:

- TRANSIENT: bounded automatic retry;
- BUSINESS: BLOCKED or explicit failure requiring business correction;
- CONFIGURATION: BLOCKED until the draft/configuration or assignment is corrected;
- SECURITY: FAILED and audited;
- TERMINAL: FAILED without infinite retry.

Manual retry is available only on BLOCKED/FAILED runs, only for an authorized organization administrator, and only while the step remains within the attempt limit. Retry resumes the current safe step with the same action idempotency key; it never replays from START.

## 15. Cancellation

An authorized administrator may cancel a non-terminal run using optimistic revision control.

Cancellation:

- prevents future steps;
- cancels pending/running/waiting step runs;
- attempts to cancel linked pending approvals through their domain services;
- preserves completed tasks, notifications, approvals and timeline entries;
- performs no automatic compensation or magical rollback.

## 16. RBAC and tenant isolation

Every user API requires:

- authenticated session;
- active `ORGANIZATION` context matching the route organization;
- active client-organization membership;
- workflow-specific permission;
- same-origin validation for mutations;
- rate limiting;
- typed Zod input.

DTSC global ADMIN does not bypass membership in a client organization.

Run readers need workflow supervision rights or must be directly related to the run through start/assignment. Timeline entries expose operational summaries, not full source payloads.

## 17. UI and mobile behavior

The existing WORKFLOWS module now mounts `EnterpriseWorkflowsWorkspace` with:

- Definitions;
- Runs;
- Monitoring.

The editor is a structured ordered list, not a BPMN canvas. It exposes step type, configuration, assignment, outcomes and next step. Readiness blockers are shown explicitly before publication.

The workspace follows DTSC's mobile architecture:

`ModuleWorkspace → Metrics → Toolbar → BusinessList → Detail → ContextActions`

It uses compact cards, horizontally scrollable tabs, internal dialog scrolling and native selects. Labels are rendered in French and English; raw codes such as `WAITING_APPROVAL` are not displayed as primary UI labels.

## 18. Controlled templates

Four templates are available:

- Internal request → manager approval → task → requester notification;
- Purchase → approval → buyer/creator notification;
- Budget → approval → creator notification;
- Expense → approval → requester/creator notification.

Selecting a template creates a DRAFT. No financial workflow is automatically published or activated.

## 19. APIs

Definitions:

- `GET/POST /api/enterprise/[organizationId]/workflows`
- `GET/PATCH/DELETE /api/enterprise/[organizationId]/workflows/[id]`

Versions:

- `POST /api/enterprise/[organizationId]/workflows/[id]/versions`
- `PATCH /api/enterprise/[organizationId]/workflows/[id]/versions/[versionId]`
- `POST .../publish`
- `POST .../retire`

Runs:

- `GET /api/enterprise/[organizationId]/workflow-runs`
- `GET /api/enterprise/[organizationId]/workflow-runs/[id]`
- `POST .../start`
- `POST .../[id]/retry`
- `POST .../[id]/cancel`

Domain events are internal. There is no public endpoint that lets a browser fabricate a business event.

## 20. Operations guide

### Identify a blocked run

Open WORKFLOWS → Monitoring, inspect the timeline and record:

- workflowRunId;
- workflowVersionId;
- current step;
- source entity type/id;
- failure category/code.

Do not copy confidential source content into support tickets.

### Correct configuration

Published versions are immutable. Create a new draft version, correct steps/assignments/branches, resolve readiness blockers and publish. Existing runs remain on their original version; a configuration correction for an existing blocked run must also preserve the assumptions of that original version.

### Retry a step

Resolve the missing member, permission, configuration or transient dependency, then use “Retry current step”. Verify that the same idempotency key is reused and no duplicate Task/Approval/Notification is created.

### Cancel a run

Use cancellation only when future steps must stop. The interface explains that successful actions remain. Confirm any linked pending approval is cancelled; never manually delete generated evidence.

### Inspect dead events

Query/monitor `EnterpriseDomainEvent` where `processingStatus = DEAD`. Review `attemptCount`, `lastError`, entity type/id and timestamps. Do not reset it blindly. Correct the root cause and use a controlled operations procedure.

### Verify production worker

1. Confirm `WORKFLOW_WORKER_SECRET` exists in the production environment without displaying its value.
2. Confirm the scheduler targets the internal worker route with the Bearer secret.
3. Invoke/observe one bounded batch.
4. Confirm unauthorized calls receive 401.
5. Confirm processed events become PROCESSED and no cross-tenant run is produced.
6. Confirm due waits resume.

## 21. CI/CD and production rollout

The repository remains production-only from `main`:

feature branch → GitHub Quality Gates → PR review → merge `main` → one Vercel Production deployment.

Feature branches intentionally have no functional Vercel Preview. The disabled-preview status is informational, not a test result.

Production must run:

1. `prisma migrate deploy`;
2. `pnpm build`;
3. worker verification;
4. main SHA = Vercel production SHA;
5. authorized smoke tests.

No `vercel`, `vercel deploy` or `vercel --prod` command is run from the feature branch.

## 22. Deferred scope

Sprint 9 does not implement:

- BPMN 2.0;
- drag-and-drop canvas;
- parallel approval quorum;
- arbitrary loops;
- JavaScript/SQL execution;
- arbitrary HTTP/webhooks;
- third-party plugins;
- automatic compensation;
- process mining;
- AI-generated or AI-executed workflows.

The engine remains AI-independent and exposes a controlled registry that can later become a safe tool boundary without giving AI direct database or workflow-execution authority.
