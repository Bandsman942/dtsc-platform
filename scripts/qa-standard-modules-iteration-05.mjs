import "./qa-standard-ai-policy-routing.mjs";
import "./qa-standard-ai-plan-enforcement.mjs";
import "./qa-standard-ai-provider-bypass-inventory.mjs";
import "./qa-standard-ai-normalized-stream.mjs";
import "./qa-standard-ai-provider-attempts.mjs";
import "./qa-standard-ai-openrouter-provider.mjs";
import "./qa-standard-ai-certified-models.mjs";
import "./qa-standard-ai-cross-provider-fallback.mjs";
import { runStandardAiIteration05Audit } from "./lib/standard-ai-iteration05-audit.mjs";

runStandardAiIteration05Audit("all");
