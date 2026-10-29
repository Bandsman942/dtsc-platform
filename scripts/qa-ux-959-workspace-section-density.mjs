import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (name) => readFileSync(name, "utf8");
const source = read("components/workspace/module-workspace.tsx");
const finance = read("components/enterprise/professional/enterprise-finance-overview-workspace.tsx");

assert.match(source, /export type ModuleWorkspaceDensity = "comfortable" \| "compact"/);
assert.equal((source.match(/density = "comfortable"/g) || []).length, 4, "All four primitives default to comfortable");
assert.match(source, /data-workspace-toolbar\s+data-workspace-density=\{density\}/, "Toolbar density must be observable");
assert.match(source, /density === "compact" \? "p-2\.5 sm:p-3" : "p-3\.5 sm:p-4"/, "Toolbar must preserve comfortable spacing");
assert.match(source, /density === "compact" \? "gap-2 px-3 py-3 sm:px-4 sm:py-3" : "gap-4 px-4 py-4 sm:px-5 sm:py-5"/, "Section must preserve comfortable spacing");
assert.equal((source.match(/data-workspace-density=\{density\}/g) || []).length, 5, "Workspace, content, toolbar and two section states must expose density");
assert.match(source, /min-h-11 w-full min-w-0 max-w-full/, "Collapsed section remains touch-accessible");
assert.equal((finance.match(/<ModuleSection density="compact"/g) || []).length, 3, "Finance section cards must opt in explicitly");
assert.match(source, /role="dialog"\s+aria-modal="true"/, "Full-screen section must stay accessible");
assert.match(source, /containModalTab\(event, section\)/, "Focus trap must remain");
assert.match(source, /focus-visible:ring-2 focus-visible:ring-cyan-400\/60/, "Keyboard focus must remain visible");
console.log("OK: toolbar and section density opt-in; defaults, focus and mobile touch targets preserved.");
