import fs from "node:fs";
import process from "node:process";

const read = (path) => fs.readFileSync(path, "utf8");
const policy = read("lib/rate-limit-policy.ts");
const limiter = read("lib/rate-limit.ts");
const telemetry = read("lib/scalability/rate-limit-fallback-observability.ts");

const failures = [];
const expect = (condition, message) => {
  if (!condition) failures.push(message);
};

for (const profile of ["security-critical", "cost-critical", "availability-balanced", "availability-first"]) {
  expect(policy.includes(`name: "${profile}"`), `profil ${profile} absent du registre central`);
}
expect(policy.includes('securityCritical: { name: "security-critical", failureMode: "closed" }'), "security-critical doit être fail-closed");
expect(policy.includes('costCritical: { name: "cost-critical", failureMode: "closed" }'), "cost-critical doit être fail-closed");
expect(policy.includes('availabilityBalanced: { name: "availability-balanced", failureMode: "local" }'), "availability-balanced doit rester local");
expect(policy.includes('availabilityFirst: { name: "availability-first", failureMode: "open" }'), "availability-first doit être le seul profil fail-open prévu");
expect(!policy.includes('profile: "availability-first"'), "aucune règle ne doit activer availability-first dans SCALE-3B");

const requiredRules = [
  ["auth:sign-in:", "security-critical"],
  ["auth:sign-up:", "security-critical"],
  ["auth:forgot-password:", "security-critical"],
  ["auth:reset-password:", "security-critical"],
  ["enterprise-identity-", "security-critical"],
  ["mcp-oauth-", "security-critical"],
  ["billing-checkout:", "security-critical"],
  ["public:contact:", "security-critical"],
  ["public:newsletter:", "security-critical"],
  ["ai-tool-confirm:", "security-critical"],
  ["ai-tool-cancel:", "security-critical"],
  ["chat:", "cost-critical"],
  ["chat-v2:", "cost-critical"],
  ["chat-agent:", "cost-critical"],
  ["public:dtsc-agent:", "cost-critical"],
  ["enterprise-ai-chat:", "cost-critical"],
  ["enterprise-ai-agent:", "cost-critical"],
  ["collaborators-ai-compose:", "cost-critical"],
  ["collaborators-agent:", "cost-critical"],
  ["ai-mcp:", "cost-critical"],
];
for (const [prefix, profile] of requiredRules) {
  expect(policy.includes(`prefix: "${prefix}", profile: "${profile}"`), `${prefix} doit être classé ${profile}`);
}

const routeContracts = [
  ["app/api/auth/sign-in/route.ts", '"auth:sign-in"'],
  ["app/api/auth/sign-up/route.ts", '"auth:sign-up"'],
  ["app/api/auth/forgot-password/route.ts", '"auth:forgot-password"'],
  ["app/api/auth/reset-password/route.ts", '"auth:reset-password"'],
  ["app/api/account/identity-link-requests/route.ts", "enterprise-identity-request:"],
  ["app/api/account/identity-links/decision/route.ts", "enterprise-identity-user-decision:"],
  ["app/api/ai/apps/oauth/connect/route.ts", "mcp-oauth-connect:"],
  ["app/api/ai/apps/oauth/disconnect/route.ts", "mcp-oauth-disconnect:"],
  ["app/api/billing/checkout/route.ts", "billing-checkout:"],
  ["app/api/public/contact/route.ts", '"public:contact"'],
  ["app/api/public/newsletter/route.ts", '"public:newsletter"'],
  ["app/api/ai/tools/confirm/route.ts", "ai-tool-confirm:"],
  ["app/api/ai/tools/cancel/route.ts", "ai-tool-cancel:"],
  ["app/api/chat/route.ts", "chat:${session.userId}"],
  ["app/api/chat/v2/route.ts", "chat-v2:${session.userId}"],
  ["app/api/chat/agent/route.ts", "chat-agent:${session.userId}"],
  ["app/api/public/dtsc-agent/route.ts", '"public:dtsc-agent"'],
  ["app/api/enterprise/ai/chat/route.ts", "enterprise-ai-chat:"],
  ["app/api/enterprise/ai/agent/route.ts", "enterprise-ai-agent:"],
  ["app/api/collaborators/ai/compose/route.ts", "collaborators-ai-compose:"],
  ["app/api/collaborators/ai/agent/route.ts", "collaborators-agent:"],
  ["lib/ai/mcp/tool-adapter.ts", "ai-mcp:${input.context.userId}:${server.code}"],
];
for (const [path, marker] of routeContracts) {
  const content = read(path);
  expect(content.includes(marker), `${path} ne porte plus le scope rate-limit attendu ${marker}`);
}

expect(limiter.includes("resolveRateLimitPolicy(key, options.failureMode)"), "le primitive doit résoudre le registre central avant le fallback");
expect(limiter.includes("recordRateLimitFallback({ policy, source: result.source, reason: result.reason })"), "le primitive doit observer les résultats dégradés");
expect(!limiter.includes('options.failureMode ?? "local"'), "le choix de panne ne doit plus être implicitement local dans le primitive");
expect(limiter.indexOf("resolveRateLimitPolicy(key, options.failureMode)") < limiter.indexOf("rateLimitStorageKey(key)"), "la classification doit se faire sur la clé logique avant anonymisation");
expect(limiter.includes("return `dtsc:rl:v2:${hex}`"), "les clés de stockage doivent rester SHA-256");

expect(telemetry.includes("RATE_LIMIT_FALLBACK_TELEMETRY_FLUSH_MS = 60_000"), "fenêtre de télémétrie bornée à une minute absente");
expect(telemetry.includes("RATE_LIMIT_FALLBACK_TELEMETRY_MAX_BUCKETS = 64"), "borne de buckets télémétrie absente");
expect(telemetry.includes('event: "dtsc.rate_limit.degraded"'), "événement structuré de fallback absent");
expect(telemetry.includes("JSON.stringify"), "la télémétrie doit être structurée");
expect(!telemetry.includes("prisma"), "la télémétrie de panne ne doit pas écrire PostgreSQL");
expect(!telemetry.includes("redisRestCommand") && !telemetry.includes("redisRestPipeline"), "la télémétrie de panne doit rester indépendante de Redis");
expect(!telemetry.includes("logicalKey") && !telemetry.includes("userId") && !telemetry.includes("organizationId") && !telemetry.includes("ipAddress"), "la télémétrie ne doit recevoir aucune identité ou clé logique brute");
expect(!telemetry.includes("console.error"), "aucun objet erreur provider brut ne doit être loggé par la télémétrie");

if (failures.length) {
  for (const failure of failures) console.error(`FAIL ${failure}`);
  process.exit(1);
}

console.log("SCALE-3B rate-limit policy + bounded fallback telemetry QA: PASS");
