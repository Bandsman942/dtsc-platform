import fs from "node:fs";
const read = (path) => fs.readFileSync(path, "utf8");
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };
const registry = read("lib/ai/assistant-registry.ts");
const runtime = read("lib/ai/assistant-runtime.ts");
const enterpriseRoute = read("app/api/enterprise/ai/chat/route.ts");
const globalRoute = read("app/api/chat/v2/route.ts");
expect(registry.includes("sectorAllowed"), "Requested sector profile must be matched to the real sector");
expect(registry.includes("ENTERPRISE_GENERAL"), "Invalid sector profile must fall back to enterprise general when allowed");
expect(runtime.includes("prepareAiTurn"), "Shared assistant turn runtime must exist");
expect(enterpriseRoute.includes("prepareAiTurn"), "Enterprise assistant must use shared runtime");
expect(globalRoute.includes("prepareAiTurn"), "Global chat must use shared runtime");
expect(globalRoute.includes('assistantCode: "DTSC_GENERAL"'), "Global chatbot must preserve DTSC_GENERAL profile");
if (failures.length) { console.error(failures.join("\n")); process.exit(1); }
console.log("standard-ai-sector-assistants: OK");
