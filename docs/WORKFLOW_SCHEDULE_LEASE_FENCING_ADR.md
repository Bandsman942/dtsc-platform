# WF-06S2E2 — Pure lease and fencing contract (#855)

**Status:** INERT, pure contract only. Parent #852 remains open.

## Ground truth
WF-06A `advanced-schedule.ts` computes the occurrence key as SHA-256 of JSON `[organizationId,scheduleId,versionId,localDate,localTime]`. WF-06S1/#850 already persist `status=RESERVED`, unique tenant-local receipt, `revision`, `claimToken`, `leaseUntil`, `attemptCount`, and enforce the irreversible-in-this-release PostgreSQL invariant `EW_Occurrence_inert_execution_check`. E1/#853 probes row locking but does not write.

## Lease decision
`planInertWorkflowScheduleClaim(receipt, asOf)` is a pure object (not an ORM mutation). It refuses anything except an untouched RESERVED receipt, exact canonical key and due time within 24 hours. It returns an **expected revision** (CAS precondition), a hypothetical next revision and first attempt; no token, grant, entitlement or action. Multiple callers can produce identical suggestions: this is **not** a database claim.

`assessInertWorkflowLeaseFence(receipt, offeredToken, asOf)` models a **hypothetical** CLAIMED receipt (for future migration) and rejects an invalid owner token, expired lease, overlong lease, attempts >3, or a linked run/outbox. Tokens are compared after SHA-256 using `timingSafeEqual`; none are returned/logged. Both functions always emit `authorized:false` and `executable:false`.

## What is NOT proven
No actual parallel worker claim, live entitlement/actor/source revalidation, commercial subscription quota, outbox/run transaction, retries or crash E2E. The existing PostgreSQL CHECK still disallows CLAIMED, and no production caller imports this helper. Simulated CAS is not a concurrency test; #853 had true read-only DB lock competition, #852 still needs write/concurrency certification.

## Activation prerequisites — #852
Only after implementation and E2E can an **additive, reviewed schema migration** replace the inert checks, alongside (in the same deliverable) an authenticated, flag-OFF dispatcher that:
- Locks tenant/schedule/receipt and live owner/entitlement/source or fails closed.
- Enforces canonical plan quotas and DST/catch-up; obtains token and revision atomically.
- Inserts exactly one workflow run OR durable outbox within the same transaction.
- Handles lease expiry, crash before/after commit, worker duplicate and dead cases without replaying START or double charging.
- Has a server-side kill switch, manual disable/cancel and audit/reconciliation.

No Preview Vercel, branch-only PR CI, Production only from main after OWNER_E2E; rollback is removal of this pure module, tests and docs without DB action.
