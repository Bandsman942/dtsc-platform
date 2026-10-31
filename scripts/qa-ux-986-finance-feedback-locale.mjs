import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

function execute(file, extra = {}) {
  const exports = {};
  const compiled = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(compiled, { exports, Intl, Date, Number, Error, JSON, ...extra }, { filename: file });
  return exports;
}

const ui = execute("components/enterprise/professional/finance-professional-ui.ts");
for (const status of [400, 401, 403, 409, 422, 429, 500, 502]) {
  const error = { name: "FinanceApiError", code: "FINANCE_OPERATION_FAILED", clientMessage: null, status };
  const fr = ui.financeErrorMessage(error, "fr");
  const en = ui.financeErrorMessage(error, "en");
  assert.ok(fr && en && fr !== en, `HTTP ${status} must have distinct, safe FR/EN copy`);
  assert.doesNotMatch(`${fr} ${en}`, /Prisma|SQL|stack trace|organizationId|FINANCE_OPERATION_FAILED/);
}
const network = { name: "FinanceApiError", code: "FINANCE_NETWORK_UNAVAILABLE", status: 0 };
assert.match(ui.financeErrorMessage(network, "fr"), /connexion/i);
assert.match(ui.financeErrorMessage(network, "en"), /connection/i);
assert.match(ui.financeErrorMessage({ name: "FinanceApiError", code: "FUNDING_APPROVAL_CONFLICT", status: 409 }, "en"), /approv|refresh/i,
  "Known business reason codes must keep priority over generic HTTP status");
const detailed = { name: "FinanceApiError", code: "FINANCE_OPERATION_FAILED", status: 422, clientMessage: "Le montant ne peut pas être négatif." };
assert.equal(ui.financeErrorMessage(detailed, "fr"), detailed.clientMessage, "Safe French validation detail must be preserved");

for (const status of [400, 401, 403, 409, 422, 429, 500]) {
  const api = execute("components/enterprise/professional/finance-professional-workspace-shared.tsx", {
    require: () => ({}),
    fetch: async () => ({ ok: false, status, json: async () => ({ error: "FINANCE_OPERATION_FAILED" }) }),
  });
  await assert.rejects(api.financeMutation("/api/test", { amount: 1 }), (error) =>
    error.name === "FinanceApiError" && error.status === status && error.code === "FINANCE_OPERATION_FAILED",
  `HTTP ${status} must reject instead of confirming a financial mutation`);
}
const disconnected = execute("components/enterprise/professional/finance-professional-workspace-shared.tsx", {
  require: () => ({}),
  fetch: async () => { throw new TypeError("Connection closed"); },
});
await assert.rejects(disconnected.financeMutation("/api/test", { amount: 1 }), (error) =>
  error.name === "FinanceApiError" && error.status === 0 && error.code === "FINANCE_NETWORK_UNAVAILABLE");

for (const file of [
  "components/enterprise/professional/enterprise-finance-cash-workspace.tsx",
  "components/enterprise/professional/enterprise-finance-payments-workspace.tsx",
  "components/enterprise/professional/enterprise-finance-invoices-workspace.tsx",
]) {
  const lines = readFileSync(file, "utf8").split("\n").filter((line) => line.includes("safeFinanceError("));
  assert.ok(lines.length > 0, `${file} must consume the shared typed feedback`);
  for (const line of lines) assert.match(line, /, locale\)/, `${file} must propagate the active locale for every failure`);
  assert.match(readFileSync(file, "utf8"), /useToastMessage\(/, `${file} must retain global toast feedback`);
}

const shared = readFileSync("components/enterprise/professional/finance-professional-workspace-shared.tsx", "utf8");
assert.match(shared, /if \(!response\.ok\)\s*\{\s*throw new FinanceApiError/);
assert.match(shared, /FINANCE_NETWORK_UNAVAILABLE/);
console.log("OK: Finance Cash, Payments and Invoices preserve typed HTTP failures and active FR/EN locale.");
