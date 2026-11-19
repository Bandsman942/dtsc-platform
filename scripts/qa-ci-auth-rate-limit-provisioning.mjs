import fs from "node:fs";

const files = {
  policy: "lib/rate-limit-policy.ts",
  rateLimit: "lib/rate-limit.ts",
  signIn: "app/api/auth/sign-in/route.ts",
  accounting: ".github/workflows/accounting-acceptance.yml",
  shop2: ".github/workflows/shop2-behavioral.yml",
  proxy: "scripts/ci-upstash-redis-rest-proxy.mjs",
  regression: "scripts/run-regression-qa-ci.mjs",
};

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function requireToken(content, token, label) {
  if (!content.includes(token)) {
    throw new Error(`CI auth rate-limit provisioning contract missing ${label}: ${token}`);
  }
}

const policy = read(files.policy);
const rateLimit = read(files.rateLimit);
const signIn = read(files.signIn);
const proxy = read(files.proxy);
const regression = read(files.regression);

requireToken(policy, '{ prefix: "auth:sign-in:", profile: "security-critical"', "security-critical sign-in policy");
requireToken(policy, 'securityCritical: { name: "security-critical", failureMode: "closed" }', "fail-closed security policy");
requireToken(signIn, 'rateLimit(getRateLimitKey(req, "auth:sign-in"), 8, 15 * 60 * 1000)', "sign-in rate limiter");
requireToken(rateLimit, '#!lua flags=allow-key-locking', "Upstash atomic rate-limit Lua header in product runtime");
if (/auth:sign-in[\s\S]{0,500}failureMode\s*:\s*["'](?:open|local)["']/.test(signIn)) {
  throw new Error("Sign-in route must not weaken the security-critical failure mode for CI");
}

requireToken(proxy, "CI_REDIS_REST_TOKEN is required", "explicit CI proxy token");
requireToken(proxy, '["PING"]', "Redis health probe");
requireToken(proxy, 'request.url !== "/" && request.url !== "/pipeline"', "Upstash-compatible command endpoints");
requireToken(proxy, 'const UPSTASH_LUA_KEY_LOCKING_HEADER = "#!lua flags=allow-key-locking"', "exact Upstash Lua header normalization");
requireToken(proxy, 'normalized[0]?.toUpperCase() === "EVAL"', "EVAL-only normalization scope");
requireToken(proxy, "normalizeCommandForLocalRedis(command)", "local Redis command normalization");
requireToken(regression, 'commands.unshift("node scripts/qa-ci-auth-rate-limit-provisioning.mjs")', "regression QA integration");

for (const [name, path] of [["accounting", files.accounting], ["shop2", files.shop2]]) {
  const workflow = read(path);
  requireToken(workflow, "image: redis:7-alpine", `${name} isolated Redis service`);
  requireToken(workflow, "UPSTASH_REDIS_REST_URL: http://127.0.0.1:8079", `${name} Redis REST URL`);
  requireToken(workflow, "UPSTASH_REDIS_REST_TOKEN:", `${name} Redis REST token`);
  requireToken(workflow, "CI_REDIS_REST_TOKEN:", `${name} proxy token`);
  requireToken(workflow, "node scripts/ci-upstash-redis-rest-proxy.mjs", `${name} proxy startup`);
  requireToken(workflow, "/healthz", `${name} proxy health wait`);
  requireToken(workflow, '"scripts/ci-upstash-redis-rest-proxy.mjs"', `${name} proxy path trigger`);
  requireToken(workflow, '"scripts/qa-ci-auth-rate-limit-provisioning.mjs"', `${name} QA path trigger`);
}

const accountingWorkflow = read(files.accounting);
requireToken(accountingWorkflow, "Reset isolated Redis state before close acceptance", "accounting suite-boundary Redis reset");
requireToken(accountingWorkflow, '--data \'["FLUSHDB"]\'', "accounting isolated Redis FLUSHDB command");
const resetIndex = accountingWorkflow.indexOf("Reset isolated Redis state before close acceptance");
const closeIndex = accountingWorkflow.indexOf("Accounting period close and history protection");
if (resetIndex === -1 || closeIndex === -1 || resetIndex > closeIndex) {
  throw new Error("Accounting Redis reset must happen before close/history acceptance");
}


 // The Shop 2 browser suite uses more than eight legitimate sign-ins from the
 // same loopback IP. Keep security-critical auth limiting unchanged: split the
 // independent acceptance groups across explicit resets of CI-only Redis.
const shop2Workflow = read(files.shop2);
requireToken(shop2Workflow, '"scripts/qa-routes-retail-http.mjs"', "Retail HTTP acceptance path trigger");
requireToken(shop2Workflow, '"docs/routing/routes-05a-retail-manifest.json"', "Retail HTTP manifest path trigger");
requireToken(shop2Workflow, 'E2E_ROUTING_RETAIL_ISOLATED: "true"', "isolated-only Retail HTTP activation");
requireToken(shop2Workflow, "run: pnpm qa:routing-retail-http", "Retail HTTP acceptance command");
const shop2Stages = [
  "ROUTES-05A Retail HTTP acceptance without a browser",
  "Reset isolated Redis after Retail HTTP acceptance",
  "Shop 2 POS behavioral acceptance - finance and relationships",
  "Reset isolated Redis state before Shop 2 retail experience acceptance",
  "Shop 2 retail experience acceptance",
  "Reset isolated Redis state before Shop 2 invoice isolation acceptance",
  "Shop 2 invoice and global multistore acceptance",
  "Reset isolated Redis state before Shop 2 three-actor Finance acceptance",
  "Shop 2 independent Finance lifecycle acceptance",
  "Reset isolated Redis before Retail offline Finance draft acceptance",
  "Retail offline Finance draft replay acceptance",
  "Reset isolated Redis before Retail financial trace acceptance",
  "Retail financial KPI source evidence acceptance",
  "Reset isolated Redis before #1212 sector inventory acceptance",
  "Inventory #1212 common stock contract across sector tenants",
];
let previousStageIndex = -1;
for (const stage of shop2Stages) {
  const index = shop2Workflow.indexOf(`- name: ${stage}`);
  if (index <= previousStageIndex) throw new Error(`Shop 2 CI authentication isolation stage missing or out of order: ${stage}`);
  previousStageIndex = index;
}
// Each independent acceptance group must have exactly one reset of the
// disposable loopback Redis service, never an extra or remote FLUSHDB.
const resetStages = shop2Stages.filter((stage) => stage.startsWith("Reset isolated Redis"));
const resetCommand = '--data \'["FLUSHDB"]\'';
if ((shop2Workflow.match(/--data '\["FLUSHDB"\]'/g) || []).length !== resetStages.length) {
  throw new Error("Shop 2 CI must reset only disposable Redis after Retail HTTP acceptance and before each independent browser acceptance group");
}
for (const stage of resetStages) {
  const start = shop2Workflow.indexOf(`- name: ${stage}\n`);
  const end = shop2Workflow.indexOf("\n      - name:", start + 1);
  const step = shop2Workflow.slice(start, end === -1 ? undefined : end);
  if (start === -1 || step.split(resetCommand).length !== 2) {
    throw new Error(`Shop 2 CI must run one Redis reset in the intended step: ${stage}`);
  }
  requireToken(step, 'Authorization: Bearer ${CI_REDIS_REST_TOKEN}', `${stage} CI-only token`);
  requireToken(step, "http://127.0.0.1:8079/ >/dev/null", `${stage} isolated loopback endpoint`);
}
requireToken(shop2Workflow, 'E2E_INVENTORY_SECTOR_ISOLATED: "true"', "isolated-only sector inventory activation");
const shop2Specs = [
  "accounting-atomic-retail-posting", "issue-786-relationship-benefits-enforcement",
  "issue-910-relationship-credit", "scale5b-retail-dashboard-cache",
  "shop2-commercial", "shop2-customer-payments", "shop2-customer-value-ui",
  "shop2-daily-close-ui", "shop2-final-coherence-ui", "shop2-retail", "shop2-z-global",
  "shop2-invoice-finance-lifecycle", "retail-offline-finance-1116", "retail-financial-kpi-1117",
  "inventory-1212-sector-common",
];
const acceptanceRuns = shop2Workflow.split("\n").filter((line) =>
  line.includes("run: pnpm exec playwright test tests/e2e/"),
).join("\n");
for (const spec of shop2Specs) {
  const token = `tests/e2e/${spec}.spec.mjs`;
  if (acceptanceRuns.split(token).length !== 2) {
    throw new Error(`Shop 2 CI must run each behavioral acceptance spec exactly once: ${token}`);
  }
}

console.log("QA CI auth rate-limit provisioning: OK — browser acceptances provision isolated Redis REST while Production remains fail-closed");
