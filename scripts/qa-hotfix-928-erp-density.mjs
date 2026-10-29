import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("components/workspace/module-workspace.tsx", "utf8");
const header = source.split("export function ModuleHeader(")[1]?.split("export function ModuleToolbar(")[0] || "";
const content = source.split("export function ModuleContent(")[1]?.split("export function ModuleSection(")[0] || "";
assert.match(header, /data-workspace-module-header/);
assert.match(header, /bg-dtsc-surface px-3\.5 py-3/);
assert.match(header, /sm:text-\[1\.45rem\]/);
assert.match(header, /border-l-\[3px\] border-cyan-500/);
assert.match(header, /data-workspace-back-action/);
assert.match(header, /data-workspace-refresh-action/);
assert.match(header, /data-workspace-primary-action/);
assert.match(header, /data-responsive-actions/);
assert.match(header, /<details className=/);
assert.doesNotMatch(header, /Sparkles|linear-gradient|blur-\[1px\]/);
assert.match(content, /space-y-6.*sm:space-y-8/);
assert.match(source, /safe-area-inset-bottom/);
console.log("PASS UX-05: ERP compact header, visible primary action, mobile overflow menu and dense workspaces");
