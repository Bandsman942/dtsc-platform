import "./qa-standard-ai-policy-routing.mjs";
import "./qa-standard-ai-plan-enforcement.mjs";
import "./qa-standard-ai-provider-bypass-inventory.mjs";
import "./qa-standard-ai-normalized-stream.mjs";
import "./qa-standard-ai-provider-attempts.mjs";
import "./qa-standard-ai-openrouter-provider.mjs";
import "./qa-standard-ai-certified-models.mjs";
import "./qa-standard-ai-cross-provider-fallback.mjs";
import "./qa-standard-ai-external-provider-default.mjs";
import "./qa-standard-ai-model-ui-policy.mjs";
import "./qa-standard-ai-policy-router-v2.mjs";
import "./qa-standard-ai-routing-determinism.mjs";
import "./qa-standard-ai-routing-cost-health.mjs";
import "./qa-standard-ai-data-policy-fallbacks.mjs";
import { runStandardAiIteration05Audit } from "./lib/standard-ai-iteration05-audit.mjs";

runStandardAiIteration05Audit("all");
