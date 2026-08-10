import fs from "node:fs";
const read = (path) => fs.readFileSync(path, "utf8");
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };
const registry = read("lib/ai/cag-registry.ts");
const builders = read("lib/ai/cag-builders.ts");
expect(registry.includes("context.organization?.id"), "CAG cache key must include organization identity");
expect(registry.includes("context.userId"), "CAG cache key must include user identity");
expect(registry.includes("context.contextVersion"), "CAG cache key must include permission/config version");
expect(registry.indexOf("const existing = cache.get(key)") < registry.indexOf("const content = await builder.build(context)"), "CAG cache must be checked before the expensive builder executes");
expect(registry.includes("resolveBuilderVersion"), "CAG builders must resolve a version before cache lookup");
expect(builders.includes("settingsVersion"), "Pharmacy CAG cache version must follow Pharmacy settingsVersion");
expect(builders.includes("ce CAG de base reste organisationnel et non clinique"), "Health CAG must stay non-clinical by default");
expect(builders.includes("aucune donnée clinique n'est injectée automatiquement"), "Health CAG must not auto-inject clinical data");
if (failures.length) { console.error(failures.join("\n")); process.exit(1); }
console.log("standard-ai-cag-isolation: OK");
