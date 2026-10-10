import fs from "node:fs";
import process from "node:process";
import { spawnSync } from "node:child_process";

const root = process.cwd();

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
  oidc: "lib/scalability/github-actions-oidc.ts",
  authPool: "lib/scalability/scale7-auth-pool.ts",
  authRoute: "app/api/internal/scale7/auth-pool/route.ts",
  middleware: "middleware.ts",
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
const progression = fs.readFileSync(paths.progression, "utf8");
const docs = fs.readFileSync(paths.docs, "utf8");
const oidc = fs.readFileSync(paths.oidc, "utf8");
const authPool = fs.readFileSync(paths.authPool, "utf8");
const authRoute = fs.readFileSync(paths.authRoute, "utf8");
const middleware = fs.readFileSync(paths.middleware, "utf8");
const all = [workflow, profile, report, archive, progression, docs, oidc, authPool, authRoute, middleware].join("\n");

expect(/^on:\s*\n\s+workflow_dispatch:/m.test(workflow), "workflow_dispatch is required");
expect(/^\s+issue_comment:\s*$/m.test(workflow), "owner issue_comment trigger is required");
expect(!/^\s+(push|pull_request|schedule):/m.test(workflow), "certification must never auto-run");
expect(workflow.includes("RUN_SCALE7_CERTIFICATION"), "manual confirmation is missing");
expect(workflow.includes("github.event.issue.number == 360"), "issue trigger must be scoped to #360");
expect(workflow.includes("github.event.comment.author_association == 'OWNER'"), "issue trigger must be OWNER-only");
expect(workflow.includes("startsWith(github.event.comment.body, 'RUN_SCALE7_')"), "issue trigger must be command-scoped");
expect(workflow.includes("OWNER_COMMAND:") && workflow.includes('case "${OWNER_COMMAND}" in'), "owner command must be passed through env before shell parsing");
expect(workflow.includes("MANUAL_CONFIRMATION:") && workflow.includes('if [ "${MANUAL_CONFIRMATION}" != "RUN_SCALE7_CERTIFICATION" ]'), "manual confirmation must be passed through env before shell parsing");
expect(!workflow.includes('case "${{ github.event.comment.body }}" in'), "raw issue comment must not be interpolated into shell");
expect(workflow.includes("issues: write"), "issue result publication permission is required");
expect(workflow.includes("actions: read"), "SCALE-7 progression must have read-only Actions evidence access");
expect(
  workflow.includes("Enforce staged progression") &&
  workflow.includes("GH_TOKEN: ${{ github.token }}"),
  "staged progression must receive only the scoped GitHub token",
);
expect(workflow.includes("SCALE7_RESULT_JSON"), "owner-triggered secret-free result marker is required");
for (const target of ["500", "1000", "2500", "5000"]) {
  for (const mode of ["RAMP", "SOAK", "SPIKE"]) {
    expect(workflow.includes(`RUN_SCALE7_${target}_${mode}`), `missing owner command RUN_SCALE7_${target}_${mode}`);
  }
}
expect(workflow.includes("verify-scale7-stage-progression.mjs"), "staged progression gate is missing");
for (const marker of [
  'issues/\${issueNumber}/comments',
  'actions/runs/\${runId}',
  'compare/\${evidenceSha}...\${currentSha}',
  'comment?.user?.login !== "github-actions[bot]"',
  'result?.status !== "PASS"',
  'run.conclusion !== "success"',
  'runPath !== workflowPath',
  'governanceOnlyFiles',
]) expect(progression.includes(marker), `progression verifier missing ${marker}`);
expect(!progression.includes("SCALE7_REGISTRY_PATH"), "runtime progression must not depend on the static certification registry");
for (const target of ["500", "1000", "2500", "5000"]) expect(workflow.includes(target), `workflow missing ${target} stage`);
for (const mode of ["ramp", "soak", "spike"]) expect(workflow.includes(mode), `workflow missing ${mode} profile`);
expect(workflow.includes("grafana/setup-k6-action@v1"), "official k6 setup action is required");
expect(workflow.includes("k6-version: 2.1.0"), "k6 must be pinned");
expect(workflow.includes("actions/upload-artifact@v7"), "evidence artifact upload is required");
expect(workflow.includes("retention-days: 90"), "SCALE-7 evidence retention must be explicit");
expect(workflow.includes("api/admin/scalability/observability?windowHours=1"), "live CTO observability sampling is required");
expect(workflow.includes("vars.SCALE7_LOAD_BASE_URL || vars.SCALE1_LOAD_BASE_URL || 'https://app.dtsc-platform.com'"), "SCALE-7 must reuse the governed Production origin before requiring a dedicated override");
expect(!workflow.includes("OBSERVABILITY_COOKIE"), "SCALE-7 observability must no longer depend on a human CTO session cookie");
expect(workflow.includes('Authorization: Bearer ${oidc_token}') && workflow.includes('Origin: ${BASE_URL%/}'), "initial SCALE-7 observability must use governed OIDC with an exact Origin");
expect(workflow.includes("refresh_scale7_oidc") && workflow.includes("scale7_oidc_minted_at") && workflow.includes("-lt 240"), "long SCALE-7 runs must renew the OIDC token before expiry");
expect(workflow.includes("secrets.SCALE7_AUTH_CONTEXTS_JSON"), "SCALE-7 must preserve the operator-provided auth pool override");
expect(workflow.includes("id-token: write"), "SCALE-7 must request GitHub Actions OIDC only for governed auth-pool provisioning");
expect(workflow.includes("audience=dtsc-scale7"), "SCALE-7 OIDC audience must be dedicated");
expect(workflow.includes("if: env.SCALE7_AUTH_CONTEXTS_JSON == ''"), "SCALE-7 must provision the governed pool only when no operator override exists");
expect(workflow.includes("/api/internal/scale7/auth-pool"), "SCALE-7 governed auth-pool endpoint is missing");
expect(!workflow.includes("for name in BASE_URL SCALE7_AUTH_CONTEXTS_JSON"), "SCALE7_AUTH_CONTEXTS_JSON must no longer block preflight when governed OIDC provisioning is available");
expect(!workflow.includes("SCALE1_LOAD_SESSION_COOKIE"), "SCALE-7 must not downgrade to the single-identity SCALE-1 load session");

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
expect(profile.includes("const expectedIsolationStatuses = http.expectedStatuses(403, 404);"), "tenant-isolation 403/404 responses must be marked expected per request");
expect((profile.match(/responseCallback: expectedIsolationStatuses/g) || []).length === 2, "exactly the setup and periodic tenant-isolation probes must use the expected-status callback");
expect(!profile.includes("http.setResponseCallback("), "SCALE-7 must never globally mark 403/404 responses as expected");
expect(profile.includes('http_req_failed: ["rate<0.01"]'), "error-rate SLO is missing");
expect(profile.includes('"p(95)<1000"') && profile.includes('"p(99)<2000"'), "latency SLOs are missing");
expect(profile.includes('checks: ["rate>0.99"]'), "check-rate SLO is missing");
expect(profile.includes("ai-request"), "AI workload must be represented");
expect(
  profile.includes("JSON.stringify({ ...aiPayload, organizationId: tenant.organizationId })"),
  "SCALE-7 AI workload must bind the canonical Enterprise AI request to the current synthetic tenant",
);
expect(profile.includes("enterprise-read") && profile.includes("shop-read") && profile.includes("collaboration-read"), "business workload mix is incomplete");
expect(profile.includes("Origin: baseUrl"), "same-origin header is required for the real AI POST workload");

for (const marker of [
  'const ISSUER = "https://token.actions.githubusercontent.com"',
  'const AUDIENCE = "dtsc-scale7"',
  'const REPOSITORY = "Bandsman942/dtsc-platform"',
  'const REF = "refs/heads/main"',
  ".github/workflows/scale7-staged-certification.yml@",
  'header.alg !== "RS256"',
  "crypto.subtle.verify",
]) expect(oidc.includes(marker), `OIDC verifier missing ${marker}`);

for (const marker of [
  '"scale7-load-org-a"',
  '"scale7-load-org-b"',
  "const MAX_IDENTITIES = 500",
  "Math.ceil(targetVus / 10)",
  'sectorCode: "COMMERCE_RETAIL"',
  "resolveSaasPlanCode(plan) === \"ENTERPRISE\"",
  "reconcileOrganizationModulesWithSubscription",
  "createSessionToken",
  'aiPath: "/api/enterprise/ai/chat"',
  'useKnowledge: false',
  'useTools: false',
  'reasoningEffort: "AUTO"',
  "/retail/sales?page=1&pageSize=5",
  "/tasks?page=1&pageSize=5",
  "customerData: false",
]) expect(authPool.includes(marker), `governed auth pool missing ${marker}`);
expect(!authPool.includes("billingPlan.create"), "SCALE-7 must reuse the governed Enterprise offer instead of creating a shadow commercial plan");

for (const marker of [
  "verifyScale7GitHubActionsOidc",
  "buildScale7SyntheticAuthPool",
  '"Cache-Control": "private, no-store"',
  "origin !== new URL(req.url).origin",
]) expect(authRoute.includes(marker), `auth-pool route missing ${marker}`);
expect(!authRoute.includes("getSession("), "SCALE-7 auth-pool endpoint must authenticate GitHub OIDC, not a product user session");

const observabilityRoute = fs.readFileSync("app/api/admin/scalability/observability/route.ts", "utf8");
for (const marker of [
  "verifyScale7GitHubActionsOidc",
  "requireConsoleCapability(CONSOLE_CAPABILITIES.SECURITY_READ)",
  'authorization.startsWith("Bearer ")',
  'origin !== new URL(request.url).origin',
  '"SCALE7_GITHUB_OIDC"',
  '"Cache-Control": "private, no-store"',
]) expect(observabilityRoute.includes(marker), `SCALE-7 observability route missing ${marker}`);
expect(
  observabilityRoute.includes('Vary: "Cookie, Authorization, Origin"'),
  "SCALE-7 observability responses must vary by human cookie and governed OIDC authorization",
);

for (const marker of [
  'const scale7OidcDelegatedAdminApiRoute = "/api/admin/scalability/observability"',
  'pathname === scale7OidcDelegatedAdminApiRoute',
  'request.headers.get("authorization")?.startsWith("Bearer ")',
  'isPathMatch(pathname, dtscInternalApiRoutes) && !delegatesScale7OidcToHandler',
]) expect(middleware.includes(marker), `SCALE-7 middleware delegation missing ${marker}`);
expect(
  !middleware.includes('pathname.startsWith("/api/admin/scalability")'),
  "SCALE-7 middleware delegation must never widen to an Admin scalability prefix",
);
expect(
  middleware.includes('const dtscInternalApiRoutes = ["/api/admin", "/api/activities"]'),
  "global DTSC internal API protection must remain authoritative",
);

expect(report.includes("authTopology"), "report must archive tenant and identity counts without secrets");
expect(report.includes("dashboardP99UnderPolicyLimit"), "report enforces the expiring Dashboard P99 policy gate");
expect(report.includes("temporaryExpiresAt") && report.includes("sloPolicy:"), "sanitized report archives effective SLO and expiry");
expect(profile.includes("dashboardP99LimitMs") && profile.includes('JSON.parse(open("./scale7-dashboard-p99-policy.json"))'), "k6 reads the same versioned policy");
expect(report.includes("tenantIsolationPerfect"), "report must gate tenant isolation");
expect(report.includes("dbConnectionUtilizationUnderEightyPercent"), "report must gate DB utilization");
expect(report.includes("noDbConnectionExhaustion"), "report must gate DB exhaustion");
expect(report.includes("redisNeverUnavailable"), "report must gate Redis availability");
expect(report.includes('process.env.GITHUB_ACTIONS === "true" ? "CI_PROVEN" : "LOCAL_EXECUTED"'), "evidence state must reflect executor");
expect(archive.includes("Only CI-proven reports"), "archive must reject non-CI reports");
expect(archive.includes('report.evidence?.loadExecution !== "CI_PROVEN"'), "archive must verify CI_PROVEN evidence state");
expect(docs.includes("500 → 1,000 → 2,500 → 5,000"), "staged progression must be documented");
expect(
  docs.includes("CI_PROVEN") && docs.includes("github-actions[bot]"),
  "CI-proven GitHub evidence progression must be documented",
);
expect(docs.includes("GitHub Actions OIDC") && docs.includes("operator override"), "governed OIDC auth-pool provisioning must be documented");


const currentSha = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const evidenceSha = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const workflowRun = (profileName, runId) => ({
  conclusion: "success",
  path: ".github/workflows/scale7-staged-certification.yml",
  head_sha: evidenceSha,
  head_branch: "main",
  event: "issue_comment",
  profileName,
  id: Number(runId),
});
const resultComment = (profileName, runId, login = "github-actions[bot]") => ({
  user: { login },
  body: `SCALE-7 owner-triggered run completed — **PASS**.

SCALE7_RESULT_JSON
\`\`\`json
${JSON.stringify({
    contract: "SCALE-7",
    targetVus: 500,
    profile: profileName,
    status: "PASS",
    generatedAt: "2026-10-02T13:53:35.462Z",
    githubRunId: String(runId),
    gitSha: evidenceSha,
  })}
\`\`\``,
});
const compatibleComparison = {
  status: "ahead",
  ahead_by: 1,
  behind_by: 0,
  files: [{ filename: "scripts/load/verify-scale7-stage-progression.mjs" }],
};
const fixtureForProfiles = (profiles, options = {}) => {
  const comments = [];
  const runs = {};
  profiles.forEach((profileName, index) => {
    const runId = String(4200 + index);
    comments.push(resultComment(profileName, runId, options.login));
    runs[runId] = workflowRun(profileName, runId);
  });
  return {
    comments,
    runs,
    comparisons: {
      [`${evidenceSha}...${currentSha}`]: options.comparison || compatibleComparison,
    },
  };
};
function runProgression(targetVus, loadProfile, fixture) {
  return spawnSync(process.execPath, [paths.progression], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      TARGET_VUS: String(targetVus),
      LOAD_PROFILE: loadProfile,
      GITHUB_REPOSITORY: "Bandsman942/dtsc-platform",
      GITHUB_SHA: currentSha,
      SCALE7_PROGRESSION_TEST_MODE: "true",
      SCALE7_PROGRESS_EVIDENCE_JSON: JSON.stringify(fixture),
      GH_TOKEN: "",
      GITHUB_TOKEN: "",
    },
  });
}

expect(runProgression(500, "ramp", { comments: [], runs: {}, comparisons: {} }).status === 0, "500 ramp must not require prior evidence");
expect(runProgression(500, "soak", fixtureForProfiles(["ramp"])).status === 0, "500 soak must accept a CI-proven ramp through governance-only lineage");
expect(runProgression(500, "soak", fixtureForProfiles(["ramp"], { login: "owner-user" })).status !== 0, "human comments must never satisfy progression evidence");
expect(
  runProgression(500, "soak", fixtureForProfiles(["ramp"], {
    comparison: {
      status: "ahead",
      ahead_by: 1,
      behind_by: 0,
      files: [{ filename: "lib/account/personal-workspace.ts" }],
    },
  })).status !== 0,
  "runtime code changes after a PASS must invalidate prior-stage evidence",
);
expect(runProgression(500, "spike", fixtureForProfiles(["ramp"])).status !== 0, "500 spike must remain blocked without soak PASS");
expect(runProgression(500, "spike", fixtureForProfiles(["ramp", "soak"])).status === 0, "500 spike must accept ramp plus soak PASS evidence");

const full500Fixture = fixtureForProfiles(["ramp", "soak", "spike"]);
expect(runProgression(1000, "ramp", full500Fixture).status === 0, "1000 ramp must require and accept all three 500 PASS profiles");

for (const forbidden of ["postgresql://", "postgres://", "password=", "NEXT_PUBLIC_DATABASE_URL"]) {
  expect(!all.toLowerCase().includes(forbidden.toLowerCase()), `forbidden secret-like literal: ${forbidden}`);
}

console.log("SCALE-7 staged certification contract: OK");
