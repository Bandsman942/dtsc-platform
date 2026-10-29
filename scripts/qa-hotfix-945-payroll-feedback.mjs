import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const panel = read("components/admin/payroll-approval-panel.tsx");
const ceo = read("app/api/admin/ceo/payroll-approvals/[id]/review/route.ts");
const coo = read("app/api/admin/coo/payroll-approvals/[id]/review/route.ts");
const fr = JSON.parse(read("locales/fr.json")).payrollWorkflow;
const en = JSON.parse(read("locales/en.json")).payrollWorkflow;

for (const [label, source] of [["CEO", ceo], ["COO", coo]]) {
  assert.match(source, /return NextResponse\.json\(\{ ok: true, payroll \}\)/, `${label} must return a verified payroll on success`);
}
assert.match(panel, /useToastMessage\(notice\)/, "Toast must be driven by typed notice");
assert.doesNotMatch(panel, /useToastMessage\(message\)|setMessage\(/, "Legacy string feedback must not be used in payroll review");
assert.match(panel, /body\?\.ok !== true \|\| !body\.payroll/, "Success requires server confirmation and actual payroll");
assert.match(panel, /if \(!response\.ok\)/, "HTTP failure must not be success");
assert.match(panel, /if \(!selected \|\| !decision \|\| saving\) return/, "Duplicate submissions must be blocked");
assert.match(panel, /setNotice\(\{ tone: "error", description: t\("approvalNetworkError"\) \}\)/, "Network errors must be explicit");
assert.match(panel, /setNotice\(\{\s*tone: "success"/, "Confirmed result uses semantic success");
for (const status of ["401", "403", "409", "429", "400", "422", "500"]) {
  assert.ok(panel.includes(status), `Missing handling of HTTP status ${status}`);
}
for (const key of [
  "approvalSessionExpired", "approvalForbidden", "approvalConflict",
  "approvalRateLimited", "approvalInvalidDecision", "approvalServiceUnavailable",
  "approvalNetworkError", "approvalUnexpectedResponse",
]) {
  assert.equal(typeof fr[key], "string", `FR ${key} must be in the canonical dictionary`);
  assert.equal(typeof en[key], "string", `EN ${key} must be in the canonical dictionary`);
  assert.ok(fr[key].length > 20 && en[key].length > 20, `${key} must be actionable`);
}
assert.deepEqual(Object.keys(fr).sort(), Object.keys(en).sort(), "Payroll FR/EN keys must remain aligned");
console.log("OK: payroll approval feedback typed, status-aware, FR/EN aligned; E2E remains required.");
