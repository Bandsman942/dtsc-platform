import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const failures = [];
const expect = (condition, message) => {
  if (!condition) failures.push(message);
};

const policy = read("lib/ai/policy.ts");
const orchestrator = read("lib/ai/orchestrator.ts");
const catalog = read("lib/ai/catalog.ts");
const types = read("lib/ai/types.ts");

expect(types.includes("dataClassifications?: AiDataClassification[]"), "Ai