import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const read = (path) => readFileSync(path, "utf8");
const source = read("lib/client-action-feedback.ts");
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const runtime = { exports: {} };
runInNewContext(js, runtime);
const { actionFeedback } = runtime.exports;

assert.equal(actionFeedback(false, null, { success: "OK", failure: "Impossible" }).tone, "error");
assert.equal(actionFeedback(false, { message: "Droits insuffisants" }, { success: "OK", failure: "Impossible" }).description, "Droits insuffisants");
assert.equal(actionFeedback(true, { message: "error-like wording" }, { success: "Enregistré", failure: "Impossible" }).tone, "success");
assert.equal(actionFeedback(true, null, { success: "Enregistré", failure: "Impossible" }).description, "Enregistré");

const toasts = read("components/ui/use-toast-message.ts");
const list = read("components/ui/list-controls.tsx");
const patients = read("components/enterprise/health-patients-workspace.tsx");
const sales = read("components/enterprise/pharmacy-sales-workspace.tsx");
assert.match(toasts, /typeof message === "object" && message \? message\.tone/);
assert.match(list, /useAppLocale/);
assert.match(list, /type="search"/);
assert.match(list, /Previous page/);
assert.match(list, /Page suivante/);
assert.match(patients, /actionFeedback\(response\.ok, body/);
assert.match(sales, /actionFeedback\(response\.ok, body/);

console.log("PASS UX-03: typed HTTP feedback, repeated notices and FR/EN list controls");
