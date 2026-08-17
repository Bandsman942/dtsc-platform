import fs from "node:fs";

const helperPath = "lib/scalability/production-observability.ts";
const routePath = "app/api/admin/scalability/observability/route.ts";

for (const path of [helperPath, routePath]) {
  if (!fs.existsSync(path)) {
    console.error(`FAIL: missing ${path}`);
    process.exit(1);
  }
}

const helper = fs.readFileSync(helperPath, "utf8");
const route = fs.readFileSync(routePath, "utf8");

const checks = [
  [route.includes("requireConsoleCapability(CONSOLE_CAPABILITIES.SECURITY_READ)"), "endpoint must require SECURITY_READ"],
  [route.includes("z.coerce.number().int().min(1).max(168)"), "window must be bounded to 1..168 hours"],
  [route.includes('"Cache-Control": "private, no-store"'), "endpoint must disable shared caching"],
  [helper.includes('FROM "ApiLog"'), "snapshot must use ApiLog"],
  [helper.includes('percentile_cont(0.95)'), "snapshot must expose percentile latency"],
  [helper.includes("pg_stat_activity"), "snapshot must expose PostgreSQL connection pressure"],
  [helper.includes('FROM "AiModelCall"'), "snapshot must use AiModelCall"],
  [helper.includes('status: "NOT_MEASURED"'), "Redis must be explicitly marked not measured"],
  [helper.includes("SCALE-2 #355"), "Redis gap must link to SCALE-2"],
  [!helper.includes("DATABASE_URL"), "helper must not expose DATABASE_URL"],
  [!route.includes("organizationId"), "admin snapshot must not expose tenant identifiers"],
];

const failures = checks.filter(([ok]) => !ok).map(([, label]) => label);
if (failures.length) {
  for (const failure of failures) console.error(`FAIL: ${failure}`);
  process.exit(1);
}

console.log("SCALE-0B production observability contract: OK");
