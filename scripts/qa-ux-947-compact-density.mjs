import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const file = (name) => readFileSync(name, "utf8");
const shared = file("components/workspace/module-workspace.tsx");
const finance = file("components/enterprise/professional/enterprise-finance-overview-workspace.tsx");

assert.match(shared, /export type ModuleWorkspaceDensity = "comfortable" \| "compact"/);
assert.equal((shared.match(/density = "comfortable"/g) || []).length, 4, "Root, content, toolbar and section must all default to comfortable");
assert.match(shared, /data-workspace-density=\{density\}/, "Density variant must be visible to automation");
assert.match(shared, /export function ModuleToolbar\(\{[\s\S]*?density = "comfortable"/, "Toolbar defaults to comfortable");
assert.match(shared, /export function ModuleSection\(\{[\s\S]*?density = "comfortable"/, "Section defaults to comfortable");
assert.match(shared, /"space-y-3 sm:space-y-4" : "space-y-6 sm:space-y-7"/, "Root compact variant may not change default");
assert.match(shared, /"space-y-4 sm:space-y-5" : "space-y-6 sm:space-y-8"/, "Content compact variant may not change default");
assert.match(finance, /<ModuleWorkspace density="compact">/, "Finance overview must opt into compact mode");
assert.match(finance, /<ModuleContent density="compact">/, "Finance content must opt into compact mode");
assert.match(shared, /pb-\[calc\(1rem\+env\(safe-area-inset-bottom\)\)\]/, "Preserve mobile safe area");
assert.match(shared, /min-w-0 max-w-full overflow-x-clip/, "Preserve responsive container");
console.log("OK: compact density is explicit, adopted by Finance overview, defaults and safe areas preserved.");
