import fs from "node:fs";

const limiterPath = "lib/rate-limit.ts";
const redisRestPath = "lib/redis-rest.ts";
const runnerPath = "scripts/run-regression-qa-ci.mjs";
const docsPath = "docs/SCALABILITY_SCALE3A_DISTRIBUTED_RATE_LIMIT.md";

for (const path of [limiterPath, redisRestPath, runnerPath, docsPath]) {
  if (!fs.existsSync(path)) {
    console.error(`FAIL: missing ${path}`);
    process.exit(1);
  }
}

const limiter = fs.readFileSync(limiterPath, "utf8");
const redisRest = fs.readFileSync(redisRestPath, "utf8");
const runner = fs.readFileSync(runnerPath, "utf8");
const docs = fs.readFileSync(docsPath, "utf8");

function constantNumber(source, name) {
  const match = source.match(new RegExp(`export const ${name}\\s*=\\s*([0-9_]+)`));
  return match ? Number(match[1].replaceAll("_", "")) : Number.NaN;
}

const limiterTimeout = constantNumber(limiter, "RATE_LIMIT_REDIS_TIMEOUT_MS");
const genericTimeout = constantNumber(redisRest, "REDIS_REST_TIMEOUT_MS");
const localMaxBuckets = constantNumber(limiter, "RATE_LIMIT_LOCAL_MAX_BUCKETS");

const checks = [
  [limiter.includes('from "@/lib/redis-rest"'), "rate limiter must reuse canonical Redis REST helper"],
  [!limiter.includes("fetch("), "rate limiter must not own a direct Upstash fetch"],
  [Number.isFinite(limiterTimeout) && Number.isFinite(genericTimeout) && limiterTimeout > 0 && limiterTimeout < genericTimeout, "rate-limit timeout must be positive and stricter than generic Redis timeout"],
  [limiter.includes('"EVAL", ATOMIC_RATE_LIMIT_SCRIPT'), "distributed limiter must use one EVAL command"],
  [limiter.includes("#!lua flags=allow-key-locking"), "Lua limiter must use Upstash key-scoped locking instead of the default global script lock"],
  [limiter.includes('redis.call("INCR", KEYS[1])'), "atomic script must increment the limiter key"],
  [limiter.includes('redis.call("PTTL", KEYS[1])'), "atomic script must read remaining TTL"],
  [limiter.includes('redis.call("PEXPIRE", KEYS[1], ARGV[1])'), "atomic script must set or repair expiry"],
  [limiter.includes("current == 1 or ttl < 0"), "atomic script must repair legacy keys without TTL"],
  [limiter.includes('crypto.subtle.digest("SHA-256"'), "rate-limit storage key must be SHA-256 hashed"],
  [limiter.includes('return `dtsc:rl:v2:${hex}`'), "rate-limit storage key must use anonymized v2 namespace"],
  [limiter.includes('export type RateLimitFailureMode = "local" | "open" | "closed"'), "failure modes local/open/closed must be explicit"],
  [limiter.includes('source: "redis"') && limiter.includes('source: "local"') && limiter.includes('source: "fail-open"') && limiter.includes('source: "fail-closed"'), "result source must identify Redis and degraded modes"],
  [limiter.includes("degraded: boolean") && limiter.includes("reason: RedisRestUnavailableReason | null"), "result must expose degradation and controlled reason"],
  [limiter.includes("ok: boolean") && limiter.includes("remaining: number") && limiter.includes("resetAt: number"), "historical rate-limit result fields must remain"],
  [limiter.includes('const failureMode = options.failureMode ?? "local"'), "default mode must preserve historical local fallback"],
  [Number.isFinite(localMaxBuckets) && localMaxBuckets > 0 && localMaxBuckets <= 10000, "local fallback cardinality must be explicitly bounded"],
  [limiter.includes("pruneLocalBuckets(now)"), "local fallback must prune before inserting new buckets"],
  [!limiter.includes("console.error") && !limiter.includes("console.log"), "provider failure details must not be logged from the limiter primitive"],
  [runner.includes("node scripts/qa-scale3a-distributed-rate-limit.mjs"), "SCALE-3A QA must be wired into Regression QA"],
  [docs.includes("classification des routes sensibles") && docs.includes("tests multi-instance"), "remaining SCALE-3 scope must stay explicit in documentation"],
];

const failures = checks.filter(([ok]) => !ok).map(([, label]) => label);
if (failures.length) {
  for (const failure of failures) console.error(`FAIL: ${failure}`);
  process.exit(1);
}

console.log(`SCALE-3A distributed rate limiter contract: OK (timeout=${limiterTimeout}ms, genericRedisTimeout=${genericTimeout}ms, localBuckets<=${localMaxBuckets}).`);
