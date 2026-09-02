import fs from "node:fs";
import path from "node:path";
import { runStandardAiAgentAudit } from "./lib/standard-ai-agent-audit.mjs";

runStandardAiAgentAudit("budgets");

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const policy = read("lib/ai/agent/policy.ts");
const plans = read("lib/billing/plans.ts");
const globalAgentRoute = read("app/api/chat/agent/route.ts");
const enterpriseAgentRoute = read("app/api/enterprise/ai/agent/route.ts");

const fail = (message) => {
  console.error(`Agent plan budget QA failed: ${message}`);
  process.exitCode = 1;
};

function planBlock(code) {
  const match = policy.match(new RegExp(`${code}: \\{([\\s\\S]*?)\\n  \\},`));
  if (!match) {
    fail(`missing ${code} budget block`);
    return "";
  }
  return match[1];
}

function readNumber(block, key) {
  const match = block.match(new RegExp(`${key}:\\s*([0-9_]+(?:\\.[0-9]+)?)`));
  if (!match) {
    fail(`missing ${key}`);
    return 0;
  }
  return Number(match[1].replaceAll("_", ""));
}

const starter = planBlock("STARTER");
const business = planBlock("BUSINESS");
const enterprise = planBlock("ENTERPRISE");
const keys = ["maxSteps", "maxToolCalls", "maxTokens", "maxEstimatedCost", "maxDurationMs"];

for (const key of keys) {
  const starterValue = readNumber(starter, key);
  const businessValue = readNumber(business, key);
  const enterpriseValue = readNumber(enterprise, key);
  if (!(starterValue < businessValue && businessValue < enterpriseValue)) {
    fail(`${key} must scale strictly STARTER < BUSINESS < ENTERPRISE`);
  }
}

if (readNumber(enterprise, "maxToolCalls") < 15) fail("ENTERPRISE must allow at least 15 tool calls for cross-module analysis");
if (readNumber(enterprise, "maxToolCalls") !== 20) fail("ENTERPRISE maxToolCalls must remain 20 for the #554 contract");
if (readNumber(enterprise, "maxSteps") !== 18) fail("ENTERPRISE maxSteps must remain 18 for the #554 contract");
if (readNumber(enterprise, "maxTokens") !== 64_000) fail("ENTERPRISE maxTokens must remain 64000 for the #554 contract");
if (readNumber(enterprise, "maxDurationMs") !== 150_000) fail("ENTERPRISE maxDurationMs must remain 150000 for the #554 contract");

for (const alias of ["premium", "enterprise", "entreprise"]) {
  if (!plans.includes(`${alias}: "ENTERPRISE"`)) fail(`${alias} must resolve to ENTERPRISE`);
}

if (!policy.includes("Math.min")) fail("client-requested budgets must remain server-clamped");
if (!policy.includes('mode === "READ" || mode === "PREPARE"')) fail("sensitive domains must remain READ/PREPARE only");

for (const [name, source] of [["global", globalAgentRoute], ["enterprise", enterpriseAgentRoute]]) {
  if (!/export const maxDuration = 180;/.test(source)) fail(`${name} Agent route must allow the bounded 180s infrastructure ceiling`);
}

if (!process.exitCode) console.log("Agent plan budget QA passed");
