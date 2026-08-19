import fs from "node:fs";
import path from "node:path";

const files = {
  limiter: "lib/rate-limit.ts",
  route: "app/api/admin/scalability/rate-limit-probe/route.ts",
  harness: "scripts/load/scale3-rate-limit-resilience.mjs",
  workflow: ".github/workflows/scale3-rate-limit-resilience.yml",
  docs: "docs/SCALABILITY_SCALE3C_RESILIENCE_EVIDENCE.md",
  runner: "scripts/run-regression-qa-ci.mjs",
};

for (const file of Object.values(files)) {
  if (!fs.existsSync(file)) {
    console.error(`FAIL: missing ${file}`);
    process.exit(1);
  }
}

const limiter = fs.readFileSync(files.limiter, "utf8");
const route = fs.readFileSync(files.route, "utf8");
const harness = fs.readFileSync(files.harness, "utf8");
const workflow = fs.readFileSync(files.workflow, "utf8");
const docs = fs.readFileSync(files.docs, "utf8");
const runner = fs.readFileSync(files.runner, "utf8");
const probeName = "__rateLimitWithUnavailableRedisForScalabilityProbe";

function sourceFiles(root) {
  const results = [];
  if (!fs.existsSync(root)) return results;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) results.push(...sourceFiles(full));
    else if (/\.(ts|tsx|js|mjs)$/.test(entry.name)) results.push(full);
  }
  return results;
}

const probeImports = sourceFiles("app")
  .filter((file) => fs.readFileSync(file, "utf8").includes(probeName));

const checks = [
  [limiter.includes(`export async function ${probeName}`), "controlled unavailable-Redis probe function must exist"],
  [limiter.includes("buildRateLimitContext") && limiter.includes("resultFromRedisOutcome"), "healthy and controlled failure paths must share policy/result resolution"],
  [limiter.includes("return resultFromRedisOutcome(context, { available: false, reason })"), "controlled failure must enter at Redis outcome boundary"],
  [!limiter.includes("process.env.SCALE3") && !limiter.includes("SCALE3_FAULT"), "production primitive must not use environment fault switches"],
  [probeImports.length === 1 && probeImports[0].replaceAll("\\", "/") === files.route, "fault injection helper must only be imported by the authenticated scalability probe"],
  [route.includes("requireConsoleCapability(CONSOLE_CAPABILITIES.SECURITY_READ)"), "probe route must require SECURITY_READ"],
  [route.includes('z.enum(["healthy", "closed", "local", "open"])'), "probe modes must be explicit and bounded"],
  [route.includes("randomBytes(8)") && route.includes("instanceId: INSTANCE_ID"), "probe must expose only an ephemeral instance identifier"],
  [route.includes('mode === "healthy"') && route.includes("await rateLimit(key"), "healthy mode must use real rateLimit/Redis path"],
  [route.includes('"TIMEOUT"') && route.includes('mode === "open" ? { failureMode: "open" } : {}'), "controlled failover must inject normalized TIMEOUT and keep open explicit"],
  [route.includes('auth:sign-in:scale3-probe:'), "closed probe must use a security-critical classified scope"],
  [route.includes('scale3-probe:availability:'), "local probe must use the availability-balanced default scope"],
  [route.includes('"Cache-Control": "private, no-store"') && route.includes('Vary: "Cookie"'), "probe responses must be private and no-store"],
  [!route.includes("@/lib/db") && !route.includes("prisma") && !route.includes("DATABASE_URL"), "probe route must not write or depend on PostgreSQL"],
  [!route.includes("hostname") && !route.includes("process.pid") && !route.includes("UPSTASH_REDIS"), "probe response code must not expose host/process/Redis configuration"],
  [harness.includes("HEALTHY_REQUESTS") && harness.includes("HEALTHY_CONCURRENCY") && harness.includes("FAILOVER_REQUESTS"), "harness must use bounded concurrent workloads"],
  [harness.includes('const WARMUP_REQUESTS = boundedInt(process.env.SCALE3_WARMUP_REQUESTS, 160, 40, 400)'), "warm-up request count must remain bounded"],
  [harness.includes('const WARMUP_CONCURRENCY = boundedInt(process.env.SCALE3_WARMUP_CONCURRENCY, 80, 10, 200)'), "warm-up concurrency must be bounded"],
  [harness.includes('`${RUN_ID}-warmup`') && harness.includes('`${RUN_ID}-healthy`'), "warm-up and certified healthy workloads must use distinct quota keys"],
  [harness.indexOf('`${RUN_ID}-warmup`') < harness.indexOf('`${RUN_ID}-healthy`'), "warm-up must execute before the certified healthy burst"],
  [harness.includes('const HEALTHY_REQUESTS = boundedInt(process.env.SCALE3_HEALTHY_REQUESTS, 400, 100, 1200)'), "certified healthy request volume must remain 400 by default"],
  [harness.includes('const HEALTHY_CONCURRENCY = boundedInt(process.env.SCALE3_HEALTHY_CONCURRENCY, 80, 10, 200)'), "certified healthy concurrency must remain 80 by default"],
  [harness.includes('summary.latencyMs.p95 <= 2_000'), "HTTP p95 certification gate must remain <= 2000 ms"],
  [harness.includes('sourceCount(warmup, "redis") === WARMUP_REQUESTS'), "warm-up must itself validate Redis-only results"],
  [harness.includes("warmup,") && harness.includes("version: 2"), "sanitized report must expose warm-up diagnostics separately"],
  [harness.includes("healthy.instanceCount >= 2"), "healthy Production gate must require at least two instances"],
  [harness.includes('sourceCount(healthy, "redis") === HEALTHY_REQUESTS'), "healthy gate must require Redis for every result"],
  [harness.includes("healthy.allowed === HEALTHY_LIMIT"), "healthy gate must prove one global distributed quota"],
  [harness.includes('sourceCount(closed, "fail-closed") === FAILOVER_REQUESTS'), "closed failover must be fully gated"],
  [harness.includes('sourceCount(local, "local") === FAILOVER_REQUESTS'), "local failover must be fully gated"],
  [harness.includes('sourceCount(open, "fail-open") === FAILOVER_REQUESTS'), "explicit open probe must be fully gated"],
  [harness.includes('reasonCount(closed, "TIMEOUT")') && harness.includes('reasonCount(local, "TIMEOUT")') && harness.includes('reasonCount(open, "TIMEOUT")'), "failover gates must require normalized TIMEOUT"],
  [harness.includes("local.allowed <= LOCAL_LIMIT * Math.max(1, local.instanceCount)"), "local fallback must be bounded per observed instance"],
  [harness.includes("primitive p99 must stay <= 300 ms"), "controlled failover must gate primitive latency"],
  [!harness.includes("SESSION_COOKIE,") || harness.includes("Cookie: SESSION_COOKIE"), "session cookie may only be used as an HTTP request header"],
  [!harness.includes("baseUrl:") && !harness.includes("redisUrl:") && !harness.includes("instanceIds:"), "sanitized report must not persist base URL, Redis URL or raw instance IDs"],
  [workflow.includes("workflow_dispatch:") && workflow.includes("issue_comment:"), "resilience workflow must support manual and owner issue triggers"],
  [workflow.includes("github.event.issue.number == 434") && workflow.includes("github.event.comment.author_association == 'OWNER'"), "issue trigger must be restricted to owner on certification issue #434"],
  [workflow.includes("/issues/434/comments"), "owner-triggered evidence comments must be published to certification issue #434"],
  [workflow.includes('SCALE3_WARMUP_REQUESTS: "160"') && workflow.includes('SCALE3_WARMUP_CONCURRENCY: "80"'), "workflow must explicitly configure the bounded warm-up"],
  [workflow.includes('SCALE3_HEALTHY_REQUESTS: "400"') && workflow.includes('SCALE3_HEALTHY_CONCURRENCY: "80"'), "workflow must not reduce the certified healthy load"],
  [workflow.includes("SCALE1_LOAD_BASE_URL") && workflow.includes("SCALE1_CTO_SESSION_COOKIE") && workflow.includes("VERCEL_AUTOMATION_BYPASS_SECRET"), "workflow must reuse governed Production load credentials"],
  [workflow.includes("actions/upload-artifact@v7") && workflow.includes("retention-days: 30"), "sanitized evidence must be archived"],
  [!workflow.includes("vercel deploy") && !workflow.includes("deploy_to_vercel") && !workflow.includes("preview"), "resilience workflow must not deploy or provision Preview"],
  [docs.includes(">= 2 instances") && docs.includes("TIMEOUT") && docs.includes("ne coupe jamais Redis Production"), "documentation must state multi-instance and controlled failover boundaries"],
  [docs.includes("#434") && docs.includes("#432"), "documentation must separate implementation and Production certification issues"],
  [docs.includes("32230763475") && docs.includes("32230979755") && docs.includes("warm-up"), "documentation must preserve failed Production evidence and warm-up rationale"],
  [runner.includes("node scripts/qa-scale3c-resilience-evidence.mjs"), "SCALE-3C QA must be wired into Regression QA"],
];

const failures = checks.filter(([ok]) => !ok).map(([, label]) => label);
if (failures.length) {
  for (const failure of failures) console.error(`FAIL: ${failure}`);
  process.exit(1);
}

console.log(`SCALE-3C resilience evidence contract: OK (probe imports=${probeImports.length}, certification #434 owner-gated, warm-up separated, certified load/gates unchanged).`);
