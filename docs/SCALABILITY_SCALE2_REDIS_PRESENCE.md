# SCALE-2A — Redis presence leases

Parent programme: #352  
Parent SCALE-2: #355  
Issue: #421

## Purpose

SCALE-2A removes the active collaboration presence lease from the PostgreSQL hot path while preserving `CollaborationPresenceSession` as the durable connection/disconnection journal.

The change does not remove PostgreSQL presence history and does not create a second durable source of truth. Redis stores only ephemeral online state and a bounded last-heartbeat bridge used to keep the journal accurate between durable checkpoints.

## Baseline before SCALE-2A

The private shell already uses an adaptive client lease:

- visible heartbeat every 45 seconds;
- server stale window 60 seconds;
- no scheduled heartbeat while hidden/offline;
- immediate refresh on focus/visibility/online;
- explicit offline on hidden/offline/pagehide.

However every online heartbeat still reached PostgreSQL to find stale/open sessions, update/create `CollaborationPresenceSession`, and update `User.lastSeenAt`.

At the 45-second budget this permits up to 80 heartbeat cycles/hour/client to touch the transactional database.

## Redis lease contract

Server-only keys are derived from SHA-256 digests of the authenticated user id and client-session id. Raw tenant identifiers are not accepted from the browser and Redis credentials remain server-only.

The active lease uses:

- TTL: 90 seconds;
- user summary TTL: 90 seconds;
- durable DB checkpoint cadence: 180 seconds;
- Redis last-heartbeat bridge retention: 35 days.

The active TTL is greater than the 45-second client heartbeat, leaving one missed interval of margin before the lease expires.

A heartbeat uses one Upstash REST pipeline request containing the commands required to:

1. establish the session lease with `NX` when new;
2. refresh its TTL;
3. read the previous Redis heartbeat bridge;
4. persist the latest Redis heartbeat bridge;
5. refresh the per-user online summary;
6. acquire a bounded durable-checkpoint marker.

The pipeline is not treated as a transaction. Presence is best-effort ephemeral state; durable session history continues to use PostgreSQL.

## PostgreSQL write budget

With Redis available:

- first lease/recovery: open or reconcile the durable session;
- ordinary recurring heartbeats: Redis only;
- at most once per 180 seconds: durable heartbeat checkpoint;
- explicit offline: close the durable session immediately.

The heartbeat-driven checkpoint frequency therefore falls from at most 80/hour/client to at most 20/hour/client, a structural 75% reduction. This does not claim a Production RPS reduction until a dedicated SCALE-2 load measurement is executed.

## Reads

`getCollaborationPresenceMap()` now attempts a grouped Redis `MGET` first. PostgreSQL is queried only when Redis is not configured or the Redis request cannot be completed inside the bounded timeout.

The group presence journal remains PostgreSQL-backed for historical rows. For currently open sessions it overlays Redis session snapshots so an active Redis lease is not incorrectly marked offline merely because the durable checkpoint is intentionally coalesced.

## Multi-device behavior

Each tab/device keeps its existing `clientSessionId`.

On explicit offline:

1. only that Redis session lease is removed;
2. the corresponding durable row is closed;
3. other open durable session ids are checked against Redis;
4. the per-user summary is cleared only when no other active Redis session remains.

One device therefore cannot intentionally disconnect another active device.

## Failover

Redis is an optimization and ephemeral-state authority only when available.

If `UPSTASH_REDIS_REST_URL` or `UPSTASH_REDIS_REST_TOKEN` is absent, or the Redis REST call times out/fails, the existing PostgreSQL presence path is used. The Redis REST client uses a 750 ms timeout so an interactive presence mutation cannot wait indefinitely on the external store.

This fallback preserves function but is more expensive and is not the target steady state for Production SCALE-2.

## Security

- Redis credentials are never exposed through `NEXT_PUBLIC_*` variables;
- Redis keys hash user/session identifiers;
- session identity still comes from `getSession()`;
- `/api/collaborators/presence` keeps same-origin, async rate limit and ApiLog controls;
- authorized collaborator discovery remains unchanged;
- Redis presence reads cannot widen tenant/group/contact visibility because callers still compute the authorized user ids before requesting presence state.

## Database and migrations

No Prisma schema change, migration or backfill is required. `CollaborationPresenceSession` remains intact.

## QA

`scripts/qa-scale2a-redis-presence.mjs` verifies the source contract:

- server-only Upstash variables;
- bounded REST timeout and pipeline usage;
- Redis TTL greater than client heartbeat;
- DB checkpoint coalescing;
- hashed presence keys;
- Redis-first presence reads with PostgreSQL fallback;
- Redis overlay in the presence journal;
- same-origin/rate-limit/ApiLog preservation;
- durable collaboration rule documentation;
- Regression QA wiring.

The script is injected into `scripts/run-regression-qa-ci.mjs`.

## Evidence still required

Before #421 can be considered Production-proven:

- Quality Gates on the PR head;
- owner E2E for online → hidden → visible, offline → online, two tabs/devices and presence journal;
- after merge/Production, a measurable SCALE-2 comparison of Redis latency/fallback and PostgreSQL pressure under representative collaboration traffic.

The broader #355 remains open for call-state/realtime/polling reductions.

## Rollback

Revert the SCALE-2A application changes. When Redis is unavailable the PostgreSQL fallback already preserves the pre-SCALE-2A functional path, and no historical table or migration needs restoration.
