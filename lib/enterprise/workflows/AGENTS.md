# Enterprise Workflow Engine rules

These rules apply to every file under `lib/enterprise/workflows/` and to callers that execute the Common Workflow Engine.

- The workflow engine orchestrates dedicated ERP domain services. It must never bypass Task, Request, Meeting, Approval, Purchase, Budget, Expense or Report state machines through generic Prisma status updates.
- Published workflow versions are immutable. Every run stays pinned to the exact version that started it, even after another version is published.
- Definitions, versions, runs, events, assignments, approvals and generated actions are always scoped to one active client `organizationId`; DTSC global roles never bypass active client membership.
- Workflow triggers, condition fields, placeholders, assignment strategies and domain actions use static allow-listed adapters. Arbitrary JavaScript, SQL, dynamic Prisma model access and arbitrary HTTP calls are forbidden.
- Workflow V1 is a directed acyclic graph. Exactly one START, at least one reachable END, no orphan steps, no ambiguous branches and no loops are publication invariants.
- Domain events are durable and idempotent. Event delivery, run creation, step execution, notifications and generated entities must remain safe under duplicate delivery or worker retries.
- Approval steps reuse `EnterpriseApproval` and the existing approval services. Preserve designated approver, target tenant, target state and no-self-approval guards; V1 approvals remain sequential.
- Workflow-generated tasks, approvals, notifications and domain actions require stable idempotency keys. A retry resumes the safe failed/current step; never blindly replay from START.
- Waiting workflows persist `WAITING_TIME` and `resumeAt`. They must never rely on an open HTTP request or in-memory timer.
- Worker routes are authenticated with a dedicated server secret, use bounded batches, race-safe claims, finite retries and safe dead-event visibility. Never expose the secret in logs, responses or documentation.
- Cancellation prevents future steps and may cancel a linked pending approval, but it never deletes successful actions or attempts automatic compensation.
- Runtime payloads and timelines remain bounded and must not copy private documents, clinical records, banking details or full confidential entities.
- Legacy `EnterpriseWorkflow` records remain a read-only sector catalog unless a deterministic, reviewed draft migration exists. Legacy and Engine v2 must never execute the same event unintentionally.
- A disabled Vercel Preview status is expected and is not functional validation. Deployments remain production-only from `main`; do not change `deploymentEnabled`, `ignoreCommand` or invoke Vercel deployment commands from feature branches.
