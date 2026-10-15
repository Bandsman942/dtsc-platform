# WF-00 — Durable execution recovery (#813)

## Ownership and bounded retries

Each run has a server-only execution token and a 90-second lease. Acquiring,
renewing and committing use conditional database writes. Short transactions lock
the run before modifying its step or action; they never await an external service.
Cancellation invalidates ownership and atomically cancels unfinished steps. A late
action may retain its success receipt but cannot advance the cancelled run.

Both worker modes share eligibility and retry policy. Expired `PROCESSING` events
with a timestamp join due `PENDING`/`FAILED` events in the `SKIP LOCKED` claim.
A valid lease is not stolen. A claimed batch item is checked again before execution.
Completion is fenced by worker ID and attempt number. At three deliveries, an
abandoned event becomes `DEAD`; permanent failures go directly to `DEAD`, while
transient failures receive bounded backoff. A `PROCESSING` event without a lease
timestamp is deliberately left for operator inspection, not automatically replayed.

The bounded recovery sweep also visits abandoned `RUNNING`/`QUEUED` runs, due
waits, and approval decisions that arrived before persistence of `WAITING_APPROVAL`.
Relative waits retain the first step start time and the persisted deadline. The
atomic wake-up never clears `resumeAt` before the wait handler consumes it.

## Evidence of effects

| Action | Recovery proof | No proof after interruption |
|---|---|---|
| New task | Domain task service and successful action receipt commit in the same transaction (`ATOMIC_TASK_V1`) | Safe retry only for this protocol; an older task attempt remains uncertain |
| Approval | Canonical approval structurally linked to the same organization and step | Uncertain; matching target status or approver alone is insufficient |
| Notification | Existing deterministic notification ID within the same organization | Safe retry through the same deterministic ID |
| Domain action | Persisted successful action receipt | Uncertain; never infer execution from the entity's current status |

`UNCERTAIN` belongs to the action attempt; its run is `BLOCKED` with
`WORKFLOW_ACTION_RECONCILIATION_REQUIRED`. The UI explains recovery in French and
English without exposing ownership tokens. All run API responses remove both
execution ownership fields. Existing effects, failures and audit records remain.

## Operator recovery

1. Inspect the run, current step, action receipt and canonical entity in the same
   organization. Preserve IDs and the reduced audit trail; do not copy confidential
   entity payloads into a ticket.
2. If the original operation subsequently persisted a canonical receipt, an
   authorized retry reconciles it and continues the current step within the attempt
   limit. It never restarts at `START`.
3. If the effect is still indeterminate, retry remains refused. Inspect the domain
   audit with an authorized owner; cancel the run and handle any necessary business
   correction through the canonical domain command. There is no generic “force
   succeeded” operation, direct Finance status edit or automatic compensation.
4. Inspect `DEAD` events and their bounded error codes. Do not reset counters or
   delete receipts to force another delivery. Record any required repair under a
   reviewed issue and its original idempotency contract.

## Deployment and rollback

Migration `20261015150000_workflow_execution_recovery` adds nullable lease/protocol
columns, an index and widens the existing action-status check with `UNCERTAIN`.
No historical migration or business row is changed. No backfill or new secret is
required. Existing attempts without the atomic-task protocol fail closed.

Before rollout, drain the old worker invocations and pause their scheduler long
enough for the 90-second lease window; old code does not implement run ownership.
Apply the migration before activating the new application, then resume scheduling
and inspect due waits, pending work and the dead queue. Deployment is exclusively
from reviewed `main`, following Quality/Migration gates and OWNER_E2E.

For rollback, pause scheduling and drain workers first. Retain the additive schema,
attempts and receipts. Restoring the previous application reintroduces the original
recovery defects: keep uncertain/abandoned work paused until a reviewed forward fix
or domain-specific repair is ready. Never remove `UNCERTAIN` rows or reverse effects
to make the old application appear healthy.

## Verification and boundaries

- `pnpm qa:workflow-recovery` runs deterministic clock/deadline, retry-category,
  public serialization and bilingual message tests against the actual TS modules.
- `pnpm qa:workflow-recovery:postgres` requires a local PostgreSQL database whose
  name contains `test`, after all migrations. Quality and Migration CI both run it.
  It executes actual engine/handlers, Prisma transactions, CAS and both worker SQL
  paths with fault injection. It covers concurrent wake/claim, task rollback and
  persisted receipt recovery, terminal redelivery, approval/notification receipts,
  unknown domain effects, cancellation and organization ownership. Domain adapters,
  task service boundary and unrelated projections/push are controlled test doubles;
  this does not certify Finance commands or authenticated UI behavior.
- Existing regression and Finance gates remain mandatory. No existing test is
  disabled. Node 22 and the pinned pnpm version remain the CI reference.
- OWNER_E2E remains separate: short wait to completion, controlled worker
  interruption/recovery, one effective task/approval/notification, cancellation
  during execution, audit visibility and recovery messages in FR/EN on desktop and
  mobile. Attach evidence before marking these checks complete.

Adapter readiness, runtime authorization, editor/versioning and broader chaos/
observability certification remain respectively #814, #815, #816 and #817. Studio,
advanced nodes, certified connectors, AI building and simulation follow #818–#822.
