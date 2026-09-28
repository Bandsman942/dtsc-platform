import fs from "node:fs";
import process from "node:process";

const paths = {
  workflow: ".github/workflows/scale7-staged-certification.yml",
  profile: "scripts/load/scale7-staged-certification.js",
  report: "scripts/load/build-scale7-certification-report.mjs",
  archive: "scripts/load/archive-scale7-certification.mjs",
  progression: "scripts/load/verify-scale7-stage-progression.mjs",
  registry: "data/scalability/scale7-certifications.json",
  registryTs: "lib/scalability/scale7-certification-registry.ts",
  docs: "docs/SCALABILITY_SCALE7_STAGED_CERTIFICATION.md",
  runbook: "docs/OWNER_E2E_360_SCALE7_STAGED_CERTIFICATION.md",
};

function fail(message) {
  console.error(`FAIL SCALE-7: ${message}`);
  process.exit(1);
}
function expect(condition, message) {
  if (!condition) fail(message);
}

for (const [label, path] of Object.entries(paths)) expect(fs.existsSync(path), `${label} missing: ${path}`);

const workflow = fs.readFileSync(paths.workflow, "utf8");
const profile = fs.readFileSync(paths.profile, "utf8");
const report = fs.readFileSync(paths.report, "utf8");
const archive = fs.readFileSync(paths.archive, "utf8");
const docs = fs.readFileSync(paths.docs, "utf8");
const all = [workflow, profile, report, archive, docs].join("\n");

expect(/^on:\s*\n\s+workflow_dispatch:/m.test(workflow), "workflow_dispatch is required");
expect(!/^\s+(push|pull_request|schedule):/m.test(workflow), "certification must never auto-run");
expect(workflow.includes("RUN_SCALE7_CERTIFICATION"), "manual confirmation is missing");
expect(workflow.includes("verify-scale7-stage-progression.mjs"), "staged progression gate is missing");
for (const target of ["500", "1000", "2500", "5000"]) expect(workflow.includes(target), `workflow missing ${target} stage`);
for (const mode of ["ramp", "soak", "spike"]) expect(workflow.includes(mode), `workflow missing ${mode} profile`);
expect(workflow.includes("grafana/setup-k6-action@v1"), "official k6 setup action is required");
expect(workflow.includes("k6-version: 2.1.0"), "k6 must be pinned");
expect(workflow.includes("actions/upload-artifact@v7"), "evidence artifact upload is required");
expect(workflow.includes("retention-days: 90"), "SCALE-7 evidence retention must be explicit");
expect(workflow.includes("api/admin/scalability/observability?windowHours=1"), "live CTO observability sampling is required");

expect(profile.includes("SCALE7_AUTH_CONTEXTS_JSON"), "multi-tenant auth pool is required");
expect(profile.includes("tenants.length < 2"), "at least two tenants must be enforced");
expect(profile.includes("minimumIdentityCount = Math.max(8, Math.ceil(targetVus / 100))"), "identity pool must scale with the target stage");
expect(profile.includes("session cookies must be unique per load identity"), "load identities must use unique sessions");
expect(profile.includes("new Set(tenants.map((tenant) => tenant.organizationId)).size !== tenants.length"), "distinct organizations must be enforced");
expect(profile.includes("requires aiPath and aiPayload"), "representative AI workload must be mandatory");
expect(profile.includes("preflight-own-tenant"), "each load identity must prove access to its own tenant");
expect(profile.includes("Own-tenant preflight failed"), "own-tenant preflight must fail closed");
expect(profile.includes("tenant_isolation_pass"), "tenant-isolation metric is required");
expect(profile.includes("isolation.status === 403 || isolation.status === 404"), "foreign-tenant access must be denied");
expect(profile.includes('http_req_failed: ["rate<0.01"]'), "error-rate SLO is missing");
expect(profile.includes('"p(95)<1000"') && profile.includes('"p(99)<2000"'), "latency SLOs are missing");
expect(profile.includes('checks: ["rate>0.99"]'), "check-rate SLO is missing");
expect(profile.includes("ai-request"), "AI workload must be represented");
expect(profile.includes("enterprise-read") && profile.includes("shop-read") && profile.includes("collaboration-read"), "business workload mix is incomplete");

expect(report.includes("authTopology"), "report must archive tenant and identity counts without secrets");
expect(report.includes("tenantIsolationPerfect"), "report must gate tenant isolation");
expect(report.includes("dbConnectionUtilizationUnderEightyPercent"), "report must gate DB utilization");
expect(report.includes("noDbConnectionExhaustion"), "report must gate DB exhaustion");
expect(report.includes("redisNeverUnavailable"), "report must gate Redis availability");
expect(report.includes('process.env.GITHUB_ACTIONS === "true" ? "CI_PROVEN" : "LOCAL_EXECUTED"'), "evidence state must reflect executor");
expect(archive.includes("Only CI-proven reports"), "archive must reject non-CI reports");
expect(archive.includes('report.evidence?.loadExecution !== "CI_PROVEN"'), "archive must verify CI_PROVEN evidence state");
expect(docs.includes("500 → 1,000 → 2,500 → 5,000"), "staged progression must be documented");

for (const forbidden of ["postgresql://", "postgres://", "password=", "NEXT_PUBLIC_DATABASE_URL"]) {
  expect(!all.toLowerCase().includes(forbidden.toLowerCase()), `forbidden secret-like literal: ${forbidden}`);
}

console.log("SCALE-7 staged certification contract: OK");
