import { existsSync, readFileSync } from "node:fs";

const failures = [];
function read(path) {
  if (!existsSync(path)) {
    failures.push(`Fichier introuvable: ${path}`);
    return "";
  }
  return readFileSync(path, "utf8").replace(/\r\n/g, "\n");
}
function check(label, condition, hint = "") {
  if (condition) console.log(`PASS ${label}`);
  else {
    failures.push(`${label}${hint ? `\n  ${hint}` : ""}`);
    console.error(`FAIL ${label}`);
  }
}
function containsAll(source, values) {
  return values.every((value) => source.includes(value));
}

const telemetry = read("lib/scalability/redis-observability.ts");
const redisRest = read("lib/redis-rest.ts");
const presenceRedis = read("lib/collaboration-presence-redis.ts");
const presenceSessions = read("lib/collaboration-presence-sessions.ts");
const presenceRoute = read("app/api/collaborators/presence/route.ts");
const callInbox = read("lib/collaboration-call-event-inbox.ts");
const callEventsRoute = read("app/api/collaborators/calls/events/route.ts");
const productionObservability = read("lib/scalability/production-observability.ts");
const dashboard = read("components/admin/cto-scalability-dashboard.tsx");
const i18n = read("lib/scalability/console-i18n.ts");
const pwaBridge = read("components/pwa/pwa-notification-bridge.tsx");
const runner = read("scripts/run-regression-qa-ci.mjs");

check(
  "télémétrie Redis serveur-only sans Prisma ni identité métier",
  containsAll(telemetry, ["REDIS_OBSERVABILITY_BUCKET_MS", "REDIS_OBSERVABILITY_TTL_SECONDS", '"HINCRBY"', '"HGETALL"', "getRedisObservabilitySnapshot"])
    && !telemetry.includes("@/lib/prisma")
    && !telemetry.includes("NEXT_PUBLIC")
    && !telemetry.includes("userId")
    && !telemetry.includes("groupId")
);

check(
  "Redis REST reste borné et secret serveur",
  containsAll(redisRest, ["REDIS_REST_TIMEOUT_MS = 750", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "AbortController"])
    && !redisRest.includes("NEXT_PUBLIC_UPSTASH")
);

check(
  "présence embarque le compteur Redis dans les pipelines existants",
  containsAll(presenceRedis, [
    "redisObservabilityMetricCommands",
    "REDIS_OBSERVABILITY_METRICS.presenceLeaseRedis",
    "REDIS_OBSERVABILITY_METRICS.presenceReadRedis",
  ])
);

check(
  "heartbeat présence Redis-only n'écrit plus ApiLog systématiquement",
  containsAll(presenceSessions, ["mode: \"REDIS\" as const", "checkpointed: lease.checkpointDue", "mode: \"FALLBACK\" as const"])
    && containsAll(presenceRoute, ["let successMetadata", "presence.mode === \"FALLBACK\" || presence.checkpointed", "if (successMetadata)"])
    && !presenceRoute.includes("await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });")
);

check(
  "sécurité et refus présence restent journalisés",
  containsAll(presenceRoute, ["statusCode: 403", "statusCode: 401", "statusCode: 429", "statusCode: 400", "isSameOriginRequest", "await rateLimit"])
);

check(
  "inbox appels compte lectures/publications Redis sans identité dans les métriques",
  containsAll(callInbox, [
    "REDIS_OBSERVABILITY_METRICS.callInboxReadRedis",
    "REDIS_OBSERVABILITY_METRICS.callPublishRedis",
    "redisObservabilityMetricCommands",
    "settingsSource: \"REDIS\"",
    "settingsSource: \"DATABASE\"",
  ])
);

check(
  "poll appels Redis-only n'écrit plus ApiLog systématiquement",
  containsAll(callEventsRoute, [
    "if (shouldReadDatabase || settingsResult.settingsSource === \"DATABASE\")",
    "dbReconciled: shouldReadDatabase",
    "settingsSource: settingsResult.settingsSource",
  ])
    && !callEventsRoute.includes("touchUserPresence")
);

check(
  "snapshot Production remplace le placeholder Redis par des mesures réelles",
  containsAll(productionObservability, [
    "getRedisObservabilitySnapshot(windowHours)",
    "presenceCheckpointCount",
    "presenceFallbackCount",
    "callDbReconciliationCount",
    "callFallbackCount",
    "redisLeaseCount",
    "redisInboxReadCount",
    "redisFirstRate",
    "dbReadRate",
  ])
    && !productionObservability.includes('status: "NOT_MEASURED"')
);

check(
  "dashboard CTO affiche les chemins Redis mesurés",
  containsAll(dashboard, [
    "snapshot.redis.probeLatencyMs",
    "snapshot.redis.presence.redisLeaseCount",
    "snapshot.redis.presence.dbFallbackCount",
    "snapshot.redis.calls.redisInboxReadCount",
    "snapshot.redis.calls.dbReconciliationCount",
    "snapshot.redis.calls.dbReadRate",
  ])
    && !dashboard.includes('t("redisDeferred")')
);

check(
  "libellés Redis observabilité existent en FR et EN",
  i18n.split("presenceRedisLeases").length >= 3
    && i18n.split("callDbReconciliations").length >= 3
    && i18n.split("redisSourceHint").length >= 3
);

check(
  "notifications générales restent push-first sans polling périodique artificiel",
  containsAll(pwaBridge, ["pushManager.getSubscription", "activePushSubscription", "/api/notifications/foreground"])
    && !pwaBridge.includes("setInterval")
);

check(
  "SCALE-2C est branché à Regression QA",
  runner.includes("node scripts/qa-scale2c-redis-observability.mjs")
);

if (failures.length) {
  console.error("\nSCALE-2C Redis observability QA failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("\nSCALE-2C Redis observability QA passed.");
