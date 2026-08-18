import fs from "node:fs";

const helperPath = "lib/scalability/production-observability.ts";
if (!fs.existsSync(helperPath)) {
  console.error(`FAIL: missing ${helperPath}`);
  process.exit(1);
}

const helper = fs.readFileSync(helperPath, "utf8");
const checks = [
  [helper.includes("function observedRate"), "snapshot must use one bounded observed-rate helper"],
  [helper.includes("throughput: observedRate(api.sampleCount, windowHours)"), "API throughput must derive from ApiLog sample count"],
  [helper.includes("throughput: observedRate(ai.sampleCount, windowHours)"), "AI throughput must derive from AiModelCall sample count"],
  [helper.includes('COUNT(*) FILTER (WHERE "reasonCode" = \'RATE_LIMITED\')::int AS "rateLimitedCount"'), "AI rate limits must derive from persisted reasonCode"],
  [helper.includes("rateLimitedRate: ai.sampleCount > 0"), "AI rate-limit rate must be guarded against empty samples"],
  [helper.includes("getRedisObservabilitySnapshot(windowHours)"), "Redis throughput paths must derive from the measured SCALE-2 snapshot"],
  [helper.includes("redisFirstRate") && helper.includes("dbReadRate"), "Redis throughput snapshot must expose Redis-first and bounded DB-path ratios"],
  [!helper.includes('status: "NOT_MEASURED"'), "Redis must not regress to the obsolete NOT_MEASURED placeholder"],
  [!helper.includes("DATABASE_URL"), "snapshot must not expose DATABASE_URL"],
  [!helper.includes("metadataJson"), "snapshot must not expose AI metadata payloads"],
];

const failures = checks.filter(([ok]) => !ok).map(([, label]) => label);
if (failures.length) {
  for (const failure of failures) console.error(`FAIL: ${failure}`);
  process.exit(1);
}

console.log("SCALE-0C throughput observability contract: OK");
