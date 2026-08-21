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

console.log("QA CI auth rate-limit provisioning: OK — browser acceptances provision isolated Redis REST while Production remains fail-closed");
