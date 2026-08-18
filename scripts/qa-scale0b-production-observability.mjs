import fs from "node:fs";

const helperPath = "lib/scalability/production-observability.ts";
const routePath = "app/api/admin/scalability/observability/route.ts";
const redisObservabilityPath = "lib/scalability/redis-observability.ts";

for (const path of [helperPath, routePath, redisObservabilityPath]) {
  if (!fs.existsSync(path)) {
    console.error(`FAIL: missing ${path}`);
    process.exit(1);
  }
}

const helper = fs.readFileSync(helperPath, "utf8");
const route = fs.readFileSync(routePath, "utf8");
const redisObservability = fs.readFileSync(redisObservabilityPath, "utf8");

const checks = [
  [route.includes("requireConsoleCapability(CONSOLE_CAPABILITIES.SECURITY_READ)"), "endpoint must require SECURITY_READ"],
  [route.includes("z.coerce.number().int().min(1).max(168)"), "window must be bounded to 1..168 hours"],
  [route.includes('"Cache-Control": "private, no-store"'), "endpoint must disable shared caching"],
  [helper.includes('FROM "ApiLog"'), "snapshot must use ApiLog"],
  [helper.includes('percentile_cont(0.95)'), "snapshot must expose percentile latency"],
  [helper.includes("pg_stat_activity"), "snapshot must expose PostgreSQL connection pressure"],
  [helper.includes('FROM "AiModelCall"'), "snapshot must use AiModelCall"],
  [helper.includes("getRedisObservabilitySnapshot(windowHours)"), "Redis must use the canonical measured SCALE-2 snapshot"],
  [helper.includes("redisFirstRate") && helper.includes("dbReadRate"), "Redis snapshot must expose Redis-first and DB-path ratios"],
  [!helper.includes('status: "NOT_MEASURED"'), "Redis must no longer use the obsolete NOT_MEASURED placeholder"],
  [redisObservability.includes('"PING"') && redisObservability.includes('"HGETALL"'), "Redis observability must use a live probe and bounded counters"],
  [!redisObservability.includes("@/lib/prisma"), "Redis hot-path counters must not write PostgreSQL"],
  [!helper.includes("DATABASE_URL"), "helper must not expose DATABASE_URL"],
  [!route.includes("organizationId"), "admin snapshot must not expose tenant identifiers"],
];

const failures = checks.filter(([ok]) => !ok).map(([, label]) => label);
if (failures.length) {
  for (const failure of failures) console.error(`FAIL: ${failure}`);
  process.exit(1);
}

console.log("SCALE-0B production observability contract: OK");
