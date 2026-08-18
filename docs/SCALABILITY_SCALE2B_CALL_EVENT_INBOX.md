# SCALE-2B — Redis call-event inbox

Parent programme: #352
Parent SCALE-2: #355
Issue: #423
Depends on: #421 / PR #422

## Purpose

SCALE-2B removes the global call-event notification feed from the PostgreSQL hot read path while preserving `CollaborationGroupCallEvent` as the durable audit/history source.

LiveKit remains the realtime media provider. Redis is used only for bounded ephemeral delivery state and cache materialization.

## Baseline before SCALE-2B

`GlobalCallToast` called `/api/collaborators/calls/events` every 6 seconds while the page was visible.

Each successful read could execute all of the following even when no call event existed:

- presence touch;
- active collaboration-group lookup;
- per-group subscription/access checks;
- user call-preference lookup;
- missed-call expiration;
- durable `CollaborationGroupCallEvent` query.

That polling shape multiplied PostgreSQL work by the number of connected browser sessions.

## Redis inbox contract

Each authenticated user has a server-only Redis inbox key derived from SHA-256 of the user id. Raw user or tenant identifiers are not exposed in the Redis key.

For every durable call event, publication happens only after the PostgreSQL write/transaction succeeds.

Publication:

1. loads the durable event and current call status;
2. derives active recipients from `CollaborationGroupMember` server-side;
3. excludes the event actor, matching the previous feed behavior;
4. serializes only the client-safe call-event projection;
5. appends it with `RPUSH`;
6. trims to the newest 100 items;
7. keeps the inbox for 15 minutes.

Redis publication is best-effort delivery acceleration. Failure never rolls back the durable call event.

## Hot read path

`GET /api/collaborators/calls/events` now:

1. authenticates the session;
2. reads the authenticated user's Redis inbox;
3. reads call preferences from Redis cache, loading PostgreSQL only on cache miss;
4. filters participant-level events according to the user's current preferences;
5. returns without touching presence and without performing the full group/event query on ordinary Redis hits.

The call-settings cache has a 5-minute TTL and is explicitly invalidated by `PATCH /api/account/preferences` after user preferences are persisted.

## Durable reconciliation and failover

A Redis inbox is not the durable source of truth. `CollaborationGroupCallEvent` remains canonical history.

To avoid silent event loss across a Redis outage or failed publish, each authenticated user can acquire a Redis reconciliation lease at most once every 5 minutes. When due, the endpoint performs the existing authorized PostgreSQL group/event lookup, merges durable events with Redis events by event id, and advances normally.

If Redis itself is unavailable, the endpoint immediately uses the PostgreSQL path for that request.

This means:

- steady-state polling does not execute the legacy DB chain;
- Redis outage does not make call events disappear permanently;
- reconciliation frequency is bounded independently from browser polling frequency;
- access checks continue to run on the durable fallback path.

## Missed-call expiration

Missed-call expiration remains idempotent and durable. When it creates a `CALL_MISSED` event, the event is published to the same Redis inbox mechanism after the transaction commits.

The global feed no longer needs to execute missed-call expiration on every browser poll. It is reached only during bounded DB reconciliation/fallback and the existing call/group mutation/read paths.

## Client polling budget

The previous permanent `setInterval(..., 6000)` is removed.

The toast client now uses recursive adaptive polling:

- idle cadence: 12 seconds;
- shortly after receiving events: 5 seconds;
- hidden document: no network polling;
- offline browser: no network polling;
- visibility/online recovery: immediate refresh then normal scheduling.

At idle this halves the browser request cadence before considering the much larger reduction in database work per request.

## Security and tenancy

- Redis credentials remain server-only through the existing Upstash REST helper;
- inbox keys hash the authenticated user id;
- clients cannot provide a tenant id or alternate inbox key;
- recipients are derived from active server-side group membership at publish time;
- the actor is excluded from its own global toast inbox;
- PostgreSQL reconciliation retains canonical access/subscription checks;
- removing a user from a group prevents future events from being published to that user's inbox.

## Producers covered

The common Redis publication hook is called for durable events produced by:

- group/direct call start;
- scheduled-meeting call start;
- join;
- leave;
- end/cancel;
- reject;
- connection interrupted/reconnected;
- participant mute/unmute;
- missed-call expiration.

## Database and migrations

No Prisma schema change, migration or backfill is required.

`CollaborationGroupCallEvent` remains unchanged and authoritative for durable history.

## QA

`scripts/qa-scale2b-call-event-inbox.mjs` protects:

- hashed Redis keys;
- bounded inbox length and TTL;
- Redis-first global read;
- absence of `touchUserPresence()` from the hot polling route;
- bounded durable reconciliation;
- adaptive hidden/offline-aware client polling;
- preference-cache invalidation;
- event publication from all known call-event producers;
- Regression QA wiring.

## Evidence still required

Before #423 can be considered Production-proven:

- Quality Gates on the exact PR head;
- owner E2E for incoming call toast, join/leave/end, hidden/visible, offline/online and preferences;
- Production deployment from `main` only;
- post-merge measurement of ordinary Redis-hit requests vs DB-reconciled requests and PostgreSQL pressure.

## Rollback

Revert SCALE-2B. PostgreSQL durable call events are never removed, so reverting restores the previous feed without data restoration or migration rollback.
