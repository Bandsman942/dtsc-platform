import fs from "node:fs";

const policy = fs.readFileSync("lib/ai/policy.ts", "utf8");
const failures = [];
const expect = (condition, message) => {
  if (!condition) failures.push(message);
};

expect(policy.includes("INTERNAL_PROVIDER_CODES"), "AI policy must define an explicit internal-provider allow-list");
expect(policy.includes("!INTERNAL_PROVIDER_CODES.has(provider.code)"), "Unknown providers must be external by default");
expect(policy.includes("SECRET_NEVER_EXTERNAL"), "External providers must preserve SECRET refusal");
expect(!policy.includes('EXTERNAL_PROVIDER_CODES = new Set(["OPENAI", "OPENROUTER"])'), "External-provider security must not depend on a closed list of known external providers");

if (failures.length) {
  console.error("External AI provider default QA failed:\n- " + failures.join("\n- "));
  process.exit(1);
}
console.log("External AI provider default QA passed");
