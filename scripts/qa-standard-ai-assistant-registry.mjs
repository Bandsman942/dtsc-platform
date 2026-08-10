import fs from "node:fs";
const read = (path) => fs.readFileSync(path, "utf8");
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };
const registry = read("lib/ai/assistant-registry.ts");
for (const code of ["DTSC_GENERAL", "ENTERPRISE_GENERAL", "PHARMACY_ASSISTANT", "HEALTH_ASSISTANT", "SHOP_ASSISTANT"]) expect(registry.includes(`code: "${code}"`), `Missing assistant profile ${code}`);
expect(registry.includes("allowedContexts"), "Assistant profiles must declare allowed contexts");
expect(registry.includes("version: \"1\""), "Assistant profiles must be versioned");
expect(registry.includes("requestedCode"), "Requested profiles must be revalidated through registry resolution");
if (failures.length) { console.error(failures.join("\n")); process.exit(1); }
console.log("standard-ai-assistant-registry: OK");
