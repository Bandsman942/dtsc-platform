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

expect(types.includes("AiModelProfileCode"), "Certified model profile codes must be typed");
for (const profile of ["FAST", "BALANCED", "REASONING", "LONG_CONTEXT", "TOOLS", "VISION", "PREMIUM"]) {
  expect(types.includes(`\"${profile}\"`), `Model profile ${profile} must exist`);
}
expect(catalog.includes("AI_OPENROUTER_CERTIFIED_MODELS_JSON"), "OpenRouter models must come from explicit DTSC certification config");
expect(catalog.includes('.filter((model) => model.providerCode === "OPENROUTER")'), "Certified OpenRouter config must reject foreign provider definitions");
expect(catalog.includes('.filter((model) => model.providerCode !== "OPENROUTER")'), "Generic AI model catalog must not inject arbitrary OpenRouter models");
expect(example.includes("Never expose the whole remote OpenRouter catalog directly to clients"), "Certification boundary must be documented in env.example");
expect(!modelsRoute.includes("openrouter.ai"), "/api/models must not query OpenRouter directly");

if (failures.length) {
  console.error("Certified AI models QA failed:\n- " + failures.join("\n- "));
  process.exit(1);
}
console.log("Certified AI models QA passed");
