# WF-06S2E3 — Transactional PostgreSQL race rehearsal (fixture only)

**Status:** Non-production QA exercise, no scheduler activation. Depends on #853 read-only locked probe and #855 pure fencing policy; parent #852 stays open.

## Why
A pure revision proposal does not prove PostgreSQL semantics. This QA specifically exercises real parallel database transactions, row locks, CAS and a mock outbox transaction in two tenant-scoped fixture tables with 12 competitors.

## Isolation
The script `scripts/qa-workflow-857-postgres.mjs` exits unless `DATABASE_URL` points at localhost/127.0.0.1/::1 with a database pathname containing `test`. It creates `WF857ClaimFixture` and `WF857OutboxFixture` outside Prisma migrations. The script cleans them in `finally`. It creates three temporary Organization test fixtures only for real ACTIVE CLIENT tenant filtering, removed on exit. Quality and Migration use independent clean CI databases. Do not run on shared local databases, and do not reuse these test tables as production runtime.

## What is measured
1. 12 concurrent PostgreSQL transactions contend for one tenant/version READY **test** receipt, with `FOR UPDATE OF r SKIP LOCKED`, row-revision CAS, and a unique outbox row INSERT in the same transaction. Exactly one mock event.
2. Crash simulated after staged updates/outbox but before COMMIT causes PostgreSQL ROLLBACK of both. A retry creates exactly one event.
3. Crash after COMMIT before ACK: duplicate cron/retry finds no READY row and does not reissue the event.
4. ACTIVE clients are scoped, INACTIVE/unknown version or cross-tenant queries do not claim; future and stale >24h excluded. A held competing row lock causes a skip, then releases and permits one claim.
5. Canonical occurrence SHA-256 key from #855 enforced inside transaction. No ERP run/domain event/schedule receipt created; production CHECKs remain intact.

## NOT proven
These fixtures are NOT canonical `EnterpriseWorkflowScheduleOccurrence` rows and outbox is NOT `EnterpriseDomainEvent`. The actual DB CHECK prohibits READY/CLAIMED. No real authorization, module/plan entitlement, schedule cursor, actor/source mandate, lease takeover/fencing in a production claim, conditional failure/dead path, DST scheduler callback, post-commit run execution or idempotent financial/health action. Even 12 competing SQL connections do not prove correctness of unimplemented application runtime.

## Mandatory next deliverable in #852
Implement an additive migration + real guarded transaction on canonical models, ownership and entitlement checks at execution time, unique run/outbox effects, lease and retry on crash, audited error/dead semantics, OFF-by-default secret-authenticated cron worker, 12+ production-schema PG clients under E2E. Only then review enabling any schedule. No production preview and no UI activation in #857.
