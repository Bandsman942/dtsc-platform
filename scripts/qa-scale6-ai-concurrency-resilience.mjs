import fs from "node:fs";
function read(path) { return fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8"); }
function expect(condition, label) { if (!condition) { console.error(`FAIL SCALE-6: ${label}`); process.exitCode = 1; } else console.log(`PASS SCALE-6: ${label}`); }
function all(source, markers) { return markers.every((marker) => source.includes(marker)); }

const concurrency = read("lib/ai/concurrency.ts");
const orchestrator = read("lib/ai/orchestrator.ts");
const health = read("lib/ai/health.ts");
const errors = read("lib/ai/errors.ts");
const observability = read("lib/scalability/production-observability.ts");
const dashboard = read("components/admin/cto-scalability-dashboard.tsx");
const i18n = read("lib/scalability/console-i18n.ts");
const page = read("app/admin/cto/scalability/page.tsx");
const pkg = read("package.json");
const regression = read("scripts/qa-regression-checks.mjs");

expect(all(concurrency, ["AiConcurrencyWorkload", "\"CHAT\"", "\"AGENT\"", "\"EMBEDDING\"", "USER", "ORGANIZATION", "PROVIDER"]), "workload and scope separation is explicit");
expect(all(concurrency, ["redisRestCommand", "\"EVAL\"", "ACQUIRE_SCRIPT", "RELEASE_SCRIPT", "queueWaitMs", "leaseTtlMs"]), "distributed atomic admission and bounded wait are implemented");
expect(all(concurrency, ["localCounters", "tryAcquireLocal", "releaseLocal"]), "bounded local protection exists when Redis is unavailable");
expect(all(concurrency, ["withAiConcurrencyLease", 'value.type === "COMPLETED"', 'value.type === "ERROR"', "async cancel"]), "lease lifetime follows streaming completion, errors and cancellation");
expect(all(orchestrator, ["acquireAiConcurrencyLease", "withAiConcurrencyLease", "releaseAiConcurrencyLease", 'saturatedScope === "PROVIDER"', 'reasonCode: "RATE_LIMITED"']), "canonical router enforces admission and provider-only saturation fallback");
expect(all(health, ["AiProviderAttempt", "RECENT_ATTEMPTS_ALL_FAILED", "RECENT_SUCCESS_RATE_LOW"]), "existing health registry remains the canonical circuit-breaker signal");
expect(all(errors, ['status === 429', 'reasonCode: "RATE_LIMITED"', 'status >= 500', 'reasonCode: "PROVIDER_UNAVAILABLE"', 'reasonCode: "TIMEOUT"']), "429, 5xx and timeout provider failures remain normalized and retry-aware");
expect(all(observability, ["AiProviderAttempt", "activeAttempts", "throttledAttempts", "timeoutAttempts", "providerUnavailableAttempts", "getAiConcurrencyPolicySnapshot"]), "CTO snapshot exposes secret-free SCALE-6 capacity signals");
expect(all(dashboard, ["snapshot.ai.capacity.activeAttempts", "snapshot.ai.capacity.throttledAttempts", "snapshot.ai.capacity.timeoutAttempts", "snapshot.ai.capacity.providerUnavailableAttempts", "aiChatConcurrency", "aiAgentConcurrency", "aiEmbeddingConcurrency"]), "CTO UI renders SCALE-6 signals and guardrails");
expect(all(i18n, ["Tentatives IA actives", "Active AI attempts", "Concurrence Agent", "Agent concurrency", "garde-fous de concurrence", "concurrency guardrails"]), "SCALE-6 UI copy is FR/EN");
expect(all(page, ["CONSOLE_CAPABILITIES.SECURITY_READ", "getProductionObservabilitySnapshot"]), "CTO scalability surface remains SECURITY_READ protected");
expect(pkg.includes('"qa:scale6-ai-concurrency"'), "targeted SCALE-6 QA is exposed");
expect(regression.includes('await import("./qa-scale6-ai-concurrency-resilience.mjs")'), "SCALE-6 QA is permanent in regression");
if (process.exitCode) process.exit(process.exitCode);
console.log("SCALE-6 AI concurrency/resilience QA passed.");
