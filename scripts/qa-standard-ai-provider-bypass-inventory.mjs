import fs from "node:fs";

const failures = [];
const expect = (condition, message) => {
  if (!condition) failures.push(message);
};
const inventoryPath = "docs/STANDARD_AI_PROVIDER_BYPASS_INVENTORY.md";
expect(fs.existsSync(inventoryPath), "Provider bypass inventory document must exist");

if (fs.existsSync(inventoryPath)) {
  const inventory = fs.readFileSync(inventoryPath, "utf8");
  for (const path of ["lib/rag.ts", "lib/openai.ts", "lib/private-chat-actions.ts", "app/api/public/dtsc-agent/route.ts"]) {
    expect(inventory.includes(path), `Provider bypass inventory must classify ${path}`);
  }
  for (const classification of ["MIGRATE_TO_ORCHESTRATOR", "KEEP_DIRECT_TEMPORARILY", "EMBEDDING_PROVIDER_SEPARATE"]) {
    expect(inventory.includes(classification), `Provider bypass inventory must use classification ${classification}`);
  }
}

const rag = fs.readFileSync("lib/rag.ts", "utf8");
expect(rag.includes("api.openai.com/v1/embeddings"), "Current direct embeddings bypass changed; update inventory and migration plan before removing this assertion");

if (failures.length) {
  console.error("AI provider bypass inventory QA failed:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log("AI provider bypass inventory QA passed");
