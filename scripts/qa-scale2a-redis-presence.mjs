import fs from "node:fs";

function read(path) {
  if (!fs.existsSync(path)) {
    console.error(`Fichier introuvable: ${path}`);
    process.exit(1);
  }
  return fs.readFileSync(path, "utf8");
}

function expect(condition, message) {
  if (!condition) {
    console.error(`FAIL SCALE-2A: ${message}`);
    process.exit(1);
  }
}

const redisRest = read("lib/redis-rest.ts");
const redisPresence = read("lib/collaboration-presence-redis.ts");
const presenceSessions = read("lib/collaboration-presence-sessions.ts");
const standardCollaboration = read("lib/standard-collaboration.ts");
const presenceRoute = read("app/api/collaborators/presence/route.ts");
const presenceJournal = read("app/api/collaborators/groups/[id]/presence-journal/route.ts");
const presenceLease = read("components/dtsc/use-collaboration-presence-lease.ts");
const collaborationAgents = read("app/api/collaborators/AGENTS.md");
const regressionRunner = read("scripts/run-regression-qa-ci.mjs");

expect(redisRest.includes('process.env.UPSTASH_REDIS_REST_URL'), "Redis REST URL server env missing");
expect(redisRest.includes('process.env.UPSTASH_REDIS_REST_TOKEN'), "Redis REST token server env missing");
expect(!redisRest.includes("NEXT_PUBLIC_UPSTASH"), "Redis credentials must never become NEXT_PUBLIC");
expect(redisRest.includes('postRedisJson("/pipeline"'), "Redis pipeline endpoint must be used");
expect(redisRest.includes("AbortController"), "Redis REST calls must be timeout-bounded");
expect(redisRest.includes("REDIS_REST_TIMEOUT_MS = 750"), "Redis presence fallback timeout budget changed unexpectedly");

const heartbeatMatch = presenceLease.match(/PRESENCE_HEARTBEAT_MS\s*=\s*([0-9_]+)/);
const ttlMatch = redisPresence.match(/COLLABORATION_PRESENCE_REDIS_TTL_MS\s*=\s*([0-9_]+)/);
const checkpointMatch = redisPresence.match(/COLLABORATION_PRESENCE_DB_CHECKPOINT_MS\s*=\s*([0-9_]+)/);
expect(heartbeatMatch && ttlMatch && checkpointMatch, "Presence heartbeat/TTL/checkpoint constants must be statically measurable");
const heartbeatMs = Number(heartbeatMatch[1].replaceAll("_", ""));
const ttlMs = Number(ttlMatch[1].replaceAll("_", ""));
const checkpointMs = Number(checkpointMatch[1].replaceAll("_", ""));
expect(ttlMs > heartbeatMs, `Redis TTL (${ttlMs}) must exceed client heartbeat (${heartbeatMs})`);
expect(checkpointMs >= heartbeatMs * 3, `DB checkpoint (${checkpointMs}) must coalesce at least three heartbeat intervals (${heartbeatMs})`);

expect(redisPresence.includes('"SET", activeKey, "1", "PX", COLLABORATION_PRESENCE_REDIS_TTL_MS, "NX"'), "Presence session lease must be Redis TTL + NX");
expect(redisPresence.includes("COLLABORATION_PRESENCE_HISTORY_TTL_MS"), "Redis presence history bridge is missing");
expect(redisPresence.includes("createHash(\"sha256\")"), "Redis presence keys must hash identifiers");
expect(redisPresence.includes("getCollaborationPresenceRedisMap"), "Redis batch user presence read missing");
expect(redisPresence.includes("getCollaborationPresenceRedisSessionSnapshots"), "Redis session snapshot read missing");

expect(presenceSessions.includes("refreshCollaborationPresenceRedisLease"), "Online presence must attempt Redis first");
expect(presenceSessions.includes('if (lease.mode === "REDIS")'), "Redis presence branch missing");
expect(presenceSessions.includes("if (lease.checkpointDue)"), "Durable DB checkpoints must be coalesced");
expect(presenceSessions.includes("markCollaborationPresenceOnlineInPostgres"), "PostgreSQL fallback must remain available");
expect(presenceSessions.includes("clearCollaborationPresenceRedisLease"), "Offline must clear the Redis session lease");
expect(presenceSessions.includes("hasAnyActiveCollaborationPresenceRedisSession"), "Multi-session offline protection missing");

const redisReadIndex = standardCollaboration.indexOf("getCollaborationPresenceRedisMap(ids)");
const dbReadIndex = standardCollaboration.indexOf("prisma.collaborationPresenceSession.findMany", redisReadIndex);
expect(redisReadIndex >= 0 && dbReadIndex > redisReadIndex, "Presence map must read Redis before PostgreSQL fallback");
expect(presenceJournal.includes("getCollaborationPresenceRedisSessionSnapshots"), "Presence journal must overlay Redis session state");
expect(presenceJournal.includes("collaborationPresenceRedisSnapshotKey"), "Presence journal Redis snapshot key missing");

expect(presenceRoute.includes("isSameOriginRequest(req)"), "Presence mutation must preserve same-origin protection");
expect(presenceRoute.includes("await rateLimit("), "Presence mutation must preserve async rate limiting");
expect(presenceRoute.includes("writeApiLog"), "Presence mutation must preserve API logging");
expect(collaborationAgents.includes("lease éphémère Redis TTL"), "Collaboration durable rules must document Redis presence leases");
expect(regressionRunner.includes("qa-scale2a-redis-presence.mjs"), "SCALE-2A QA must be wired into Regression QA");

console.log(`SCALE-2A Redis presence contract: OK (heartbeat=${heartbeatMs}ms, redisTTL=${ttlMs}ms, dbCheckpoint=${checkpointMs}ms)`);
