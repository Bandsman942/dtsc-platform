import fs from "node:fs";
import process from "node:process";

const files = {
  workflow: ".github/workflows/scale1-db-load.yml",
  profile: "scripts/load/scale1-db-intermediate.js",
  report: "scripts/load/build-scale1-db-report.mjs",
};

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

function expect(condition, message) {
  if (!condition) fail(message);
}

for (const [label, path] of Object.entries(files)) {
  expect(fs.existsSync(path), `${label} file is missing: ${path}`);
}

const workflow = fs.readFileSync(files.workflow, "utf8");
const profile = fs.readFileSync(files.profile, "utf8");
const report = fs.readFileSync(files.report, "utf8");
const all = `${workflow}\n${profile}\n${report}`;

expect(/^on:\s*\n\s+workflow_dispatch:/m.test(workflow), "workflow must be manual workflow_dispatch only");
expect(!/^\s+(push|pull_request|schedule):/m.test(workflow), "workflow must never run on push, pull_request or schedule");
expect(workflow.includes('RUN_SCALE1_DB_LOAD'), "manual confirmation gate is missing");
expect(workflow.includes('vars.SCALE1_LOAD_BASE_URL'), "SCALE1_LOAD_BASE_URL repository variable is missing");
expect(workflow.includes('secrets.SCALE1_LOAD_SESSION_COOKIE'), "load-session secret is missing");
expect(workflow.includes('secrets.SCALE1_CTO_SESSION_COOKIE'), "CTO observability-session secret is missing");
expect(workflow.includes('grafana/setup-k6-action@v1'), "official k6 setup action major v1 is required");
expect(workflow.includes('k6-version: 2.1.0'), "k6 version must stay explicitly pinned for reproducible evidence");
expect(workflow.includes('actions/upload-artifact@v7'), "load evidence must be archived as a GitHub artifact");
expect(workflow.includes('/api/admin/scalability/observability?windowHours=1'), "PostgreSQL observability sampling is missing");
expect(workflow.includes("jq -c '{generatedAt:.snapshot.generatedAt,database:.snapshot.database}'"), "observability artifact must retain only the sanitized database snapshot");
expect(workflow.includes('retention-days: 30'), "load artifacts must have an explicit retention period");
expect(workflow.includes('if: always()'), "evidence upload/final gate must survive a failed load threshold");

for (const target of [100, 250, 500]) {
  expect(profile.includes(String(target)), `SCALE-1B profile is missing ${target} VU support`);
}
expect(!/target:\s*(1000|2500|5000)\b/.test(profile), "SCALE-1B must not own 1,000/2,500/5,000 VU stages");
expect(profile.includes('TARGET_VUS must be one of 100, 250 or 500'), "hard 500-VU upper bound is missing");
expect(profile.includes('SESSION_COOKIE is required'), "authenticated load must fail closed without a session");
expect(profile.includes('preflight.status !== 200'), "authenticated preflight must require HTTP 200");
expect(!profile.includes('[200, 307, 401]'), "redirect/unauthenticated responses must not pass SCALE-1B checks");
expect(!/http\.(post|put|patch|del|delete)\s*\(/i.test(profile), "SCALE-1B Production profile must remain read-only");
expect(profile.includes('http_req_failed: ["rate<0.01"]'), "HTTP error-rate gate is missing");
expect(profile.includes('"p(95)<1000"') && profile.includes('"p(99)<2000"'), "P95/P99 latency gates are missing");
expect(profile.includes('checks: ["rate>0.99"]'), "check-rate gate is missing");
expect(profile.includes('sleep(4 + Math.random() * 4)'), "active-user think time must remain bounded");

expect(report.includes('database.connectionModes[0] === "NEON_POOLED"'), "report must require Neon pooled runtime");
expect(report.includes('database.connectionStatuses[0] === "OK"'), "report must require an OK runtime policy");
expect(report.includes('database.maxConnectionUtilization < 0.8'), "report must fail at 80% connection utilization");
expect(report.includes('database.maxIdleInTransactionConnections === 0'), "report must reject idle-in-transaction sessions");
expect(report.includes('database.maxCurrentConnections < database.maxConnections'), "report must reject PostgreSQL connection exhaustion");
expect(report.includes('process.env.GITHUB_ACTIONS === "true" ? "CI_PROVEN" : "LOCAL_EXECUTED"'), "evidence state must reflect the actual executor");
expect(report.includes('scale7Issue: 360'), "SCALE-7 ownership boundary is missing");

for (const forbidden of ['postgresql://', 'postgres://', 'session=', 'password=', 'NEXT_PUBLIC_DATABASE_URL']) {
  expect(!all.toLowerCase().includes(forbidden.toLowerCase()), `forbidden secret-like literal found: ${forbidden}`);
}

console.log("SCALE-1B load evidence contract: OK");
