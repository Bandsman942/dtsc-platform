import { spawnSync } from "node:child_process";
import { runStandardAiIteration05Audit } from "./lib/standard-ai-iteration05-audit.mjs";

runStandardAiIteration05Audit("all");

const checks = [
  ["AI00 integration", "scripts/qa-ai00-integration-gate.mjs"],
  ["AI plan enforcement", "scripts/qa-standard-ai-plan-enforcement.mjs"],
  ["AI provider bypass inventory", "scripts/qa-standard-ai-provider-bypass-inventory.mjs"],
  ["AI provider adapters", "scripts/qa-standard-ai-provider-adapters.mjs"],
  ["AI normalized stream", "scripts/qa-standard-ai-normalized-stream.mjs"],
  ["AI stream cancellation", "scripts/qa-standard-ai-stream-cancellation.mjs"],
  ["AI provider attempts", "scripts/qa-standard-ai-provider-attempts.mjs"],
  ["AI OpenRouter provider", "scripts/qa-standard-ai-openrouter-provider.mjs"],
  ["AI certified models", "scripts/qa-standard-ai-certified-models.mjs"],
  ["AI cross-provider fallback", "scripts/qa-standard-ai-cross-provider-fallback.mjs"],
  ["AI external provider default", "scripts/qa-standard-ai-external-provider-default.mjs"],
  ["AI model UI policy", "scripts/qa-standard-ai-model-ui-policy.mjs"],
  ["AI Policy Router V2", "scripts/qa-standard-ai-policy-router-v2.mjs"],
  ["AI routing determinism", "scripts/qa-standard-ai-routing-determinism.mjs"],
  ["AI routing cost/health", "scripts/qa-standard-ai-routing-cost-health.mjs"],
  ["AI data policy fallbacks", "scripts/qa-standard-ai-data-policy-fallbacks.mjs"],
  ["AI assistant registry", "scripts/qa-standard-ai-assistant-registry.mjs"],
  ["AI context engine", "scripts/qa-standard-ai-context-engine.mjs"],
  ["AI CAG isolation", "scripts/qa-standard-ai-cag-isolation.mjs"],
  ["AI sector assistants", "scripts/qa-standard-ai-sector-assistants.mjs"],
  ["AI embedding provider", "scripts/qa-standard-ai-embedding-provider.mjs"],
  ["AI index versioning", "scripts/qa-standard-ai-index-versioning.mjs"],
  ["AI RAG hybrid retrieval", "scripts/qa-standard-ai-rag-hybrid.mjs"],
  ["AI RAG reindex idempotency", "scripts/qa-standard-ai-rag-reindex-idempotency.mjs"],
  ["AI Tool Gateway runtime", "scripts/qa-standard-ai-tool-gateway.mjs"],
  ["AI Tool Gateway authorization", "scripts/qa-standard-ai-tool-authorization.mjs"],
  ["AI Tool Gateway confirmation", "scripts/qa-standard-ai-tool-confirmation.mjs"],
  ["AI Tool Gateway idempotency runtime", "scripts/qa-standard-ai-tool-idempotency-runtime.mjs"],
  ["AI Tool Gateway confirmation/idempotency compatibility", "scripts/qa-standard-ai-tool-confirmation-idempotency.mjs"],
  ["AI Tool Gateway tenant isolation", "scripts/qa-standard-ai-tool-tenant-isolation.mjs"],
  ["AI private action Gateway", "scripts/qa-standard-ai-private-tool-actions.mjs"],
  ["AI MCP registry", "scripts/qa-standard-ai-mcp-registry.mjs"],
  ["AI MCP tool bindings", "scripts/qa-standard-ai-mcp-tool-bindings.mjs"],
  ["AI MCP auth", "scripts/qa-standard-ai-mcp-auth.mjs"],
  ["AI MCP SSRF", "scripts/qa-standard-ai-mcp-ssrf.mjs"],
  ["AI MCP data policy", "scripts/qa-standard-ai-mcp-data-policy.mjs"],
  ["AI MCP tenant isolation", "scripts/qa-standard-ai-mcp-tenant-isolation.mjs"],
  ["AI MCP discovery", "scripts/qa-standard-ai-mcp-discovery.mjs"],
  ["AI MCP protocol", "scripts/qa-standard-ai-mcp-protocol.mjs"],
  ["AI Agent runtime", "scripts/qa-standard-ai-agent-runtime.mjs"],
  ["AI Agent budgets", "scripts/qa-standard-ai-agent-budgets.mjs"],
  ["AI Agent confirmation", "scripts/qa-standard-ai-agent-confirmation.mjs"],
  ["AI Agent idempotency", "scripts/qa-standard-ai-agent-idempotency.mjs"],
  ["AI Agent cancellation", "scripts/qa-standard-ai-agent-cancellation.mjs"],
  ["AI Agent tenant isolation", "scripts/qa-standard-ai-agent-tenant-isolation.mjs"],
  ["AI Agent sensitive domains", "scripts/qa-standard-ai-agent-sensitive-domains.mjs"],
];

for (const [label, script] of checks) {
  console.log(`\n[standard-ai-iteration-05] ${label}`);
  const result = spawnSync(process.execPath, [script], { stdio: "inherit" });
  if (result.status !== 0) {
    console.error(`[standard-ai-iteration-05] FAILED: ${label}`);
    process.exit(result.status || 1);
  }
}

console.log("\n[standard-ai-iteration-05] AI00 + AI01 + AI02 + AI03 + AI04 + AI05 + AI06 + AI07 + AI08 gates passed");
