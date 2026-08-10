import fs from "node:fs";
const read = (path) => fs.readFileSync(path, "utf8");
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };
const context = read("lib/ai/context-engine.ts");
expect(context.includes("organizationId"), "Context engine must be organization-aware");
expect(context.includes("listNavigableEnterpriseModules"), "Context engine must derive readable modules server-side");
expect(context.includes("resolveEnterpriseModuleAccess"), "Requested module context must be revalidated");
expect(context.includes("MEDICAL_RECORDS"), "Health clinical access must be explicitly checked");
expect(context.includes("CONFIDENTIAL"), "Organization-scoped turns must be confidential by default");
expect(context.includes("contextVersion"), "Context engine must produce a version hash");
if (failures.length) { console.error(failures.join("\n")); process.exit(1); }
console.log("standard-ai-context-engine: OK");
