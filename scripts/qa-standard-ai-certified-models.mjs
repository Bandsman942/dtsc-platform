import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const failures = [];
const expect = (condition, message) => {
  if (!condition) failures.push(message);
};

const catalog = read("lib/ai/catalog.ts");
const types = read("lib/ai/types.ts");
const modelsRoute = read("app/api/models/route.ts");
const example = read("env.example");
const audit = read("scripts/ai/audit-openrouter-catalog.mjs");

expect(types.includes("AiModelProfileCode"), "Certified model profile codes must be typed");
for (const profile of ["FAST", "BALANCED", "REASONING", "LONG_CONTEXT", "TOOLS", "VISION", "PREMIUM"]) {
  expect(types.includes(`\"${profile}\"`), `Model profile ${profile} must exist`);
}
expect(catalog.includes("AI_OPENROUTER_CERTIFIED_MODELS_JSON"), "OpenRouter models must come from explicit DTSC certification config");
expect(catalog.includes("isCertifiedOpenRouterModelDefinition"), "OpenRouter certification must validate a dedicated model shape");
expect(catalog.includes("certificationVersion"), "Certified OpenRouter models must require a certification version");
expect(catalog.includes('model.providerCode !== "OPENROUTER"'), "Generic AI model catalog must not inject arbitrary OpenRouter models");
expect(catalog.includes("if (!byCode.has(model.code))"), "OpenRouter certification must not shadow an existing DTSC model code");
expect(example.includes("No OpenRouter model is enabled by default"), "Certification boundary must be documented in env.example");
expect(!modelsRoute.includes("openrouter.ai"), "/api/models must not query OpenRouter directly");
expect(audit.includes("/models?zdr=true"), "Remote certification audit must query only ZDR-compatible catalog entries");
expect(!audit.includes("writeFile") && !audit.includes("createWriteStream"), "Remote catalog audit must be non-mutating");

if (failures.length) {
  console.error("Certified AI models QA failed:\n- " + failures.join("\n- "));
  process.exit(1);
}
console.log("Certified AI models QA passed");
