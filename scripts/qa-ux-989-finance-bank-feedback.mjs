import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const collectionPath = "components/enterprise/professional/use-operational-finance-collection.ts";
const bankPath = "components/enterprise/professional/enterprise-finance-cash-bank-reconciliation-base.tsx";

function execute(file, extras = {}) {
  const exports = {};
  const compiled = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(compiled, { exports, Error, Date, Number, JSON, URLSearchParams, ...extras }, { filename: file });
  return exports;
}

const shared = execute("components/enterprise/professional/finance-professional-workspace-shared.tsx", { require: () => ({}) });
const ui = execute("components/enterprise/professional/finance-professional-ui.ts");

function collectionWith(fetchImpl) {
  return execute(collectionPath, {
    fetch: fetchImpl,
    require: (moduleName) => moduleName.includes("finance-professional-workspace-shared")
      ? { FinanceApiError: shared.FinanceApiError }
      : {},
  });
}

for (const status of [400, 401, 403, 409, 422, 429, 500]) {
  const collection = collectionWith(async () => ({
    ok: false,
    status,
    json: async () => ({ error: "FINANCE_COLLECTION_READ_FAILED", message: "SQL private tenant record", details: { private: "never displayed" } }),
  }));
  await assert.rejects(collection.fetchOperationalFinanceJson("/api/test"), (error) => {
    assert.equal(error.name, "FinanceApiError");
    assert.equal(error.status, status);
    assert.equal(error.code, "FINANCE_COLLECTION_READ_FAILED");
    assert.equal(error.clientMessage, null, "GET read must not expose backend text as client message");
    for (const locale of ["fr", "en"]) {
      const rendered = ui.safeFinanceError(error, locale === "en" ? "Unable to load bank data." : "Impossible de charger les données bancaires.", locale);
      assert.doesNotMatch(rendered, /SQL|private tenant record|FINANCE_COLLECTION_READ_FAILED/);
    }
    return true;
  });
}

const known = collectionWith(async () => ({ ok: false, status: 409, json: async () => ({ error: "CASH_SESSION_CONFLICT" }) }));
await assert.rejects(known.fetchOperationalFinanceJson("/api/test"), (error) =>
  error.code === "CASH_SESSION_CONFLICT" && error.status === 409 && /cash|caisse/i.test(ui.safeFinanceError(error, "", "fr")),
  "known Finance business reason must keep priority");

const network = collectionWith(async () => { throw new TypeError("internal network address and credentials"); });
await assert.rejects(network.fetchOperationalFinanceJson("/api/test"), (error) =>
  error.name === "FinanceApiError" && error.code === "FINANCE_NETWORK_UNAVAILABLE" && error.status === 0 && error.clientMessage === null);

const invalidJson = collectionWith(async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError("bad JSON"); } }));
await assert.rejects(invalidJson.fetchOperationalFinanceJson("/api/test"), (error) =>
  error.name === "FinanceApiError" && error.code === "FINANCE_RESPONSE_INVALID" && error.status === 200);

const found = collectionWith(async (url) => {
  assert.match(url, /recordId=record-123/);
  return { ok: true, status: 200, json: async () => ({ items: [{ id: "record-123" }] }) };
});
assert.equal((await found.fetchOperationalFinanceRecord("/api/records", "record-123"))?.id, "record-123");

const abortedController = new AbortController();
abortedController.abort();
const aborted = collectionWith(async () => { throw new Error("abort requested"); });
await assert.rejects(aborted.fetchOperationalFinanceJson("/api/test", { signal: abortedController.signal }), (error) =>
  error.name !== "FinanceApiError", "an aborted query must not be presented as a network failure");

const collectionSource = readFileSync(collectionPath, "utf8");
assert.match(collectionSource, /if \(controller\.signal\.aborted\) return;/);
assert.match(collectionSource, /if \(!controller\.signal\.aborted\) setLoading\(false\)/);
assert.match(collectionSource, /locale === "en" \? "This finance view could not be loaded\."/);

const bank = readFileSync(bankPath, "utf8");
const errorCalls = bank.split("\n").filter((line) => line.includes("safeFinanceError("));
assert.ok(errorCalls.length >= 10, "all bank/cash/reconciliation failures must use safe Finance messages");
for (const line of errorCalls) assert.match(line, /, locale\)\)/, "active locale must reach every bank/reconciliation error path");
assert.match(bank, /fetchOperationalFinanceJson\(`/);
assert.match(bank, /setMatchTarget\(null\); setRefreshKey\(\(value\) => value \+ 1\);\s*try \{\s*setDetail\(await loadExact/);
assert.match(bank, /Match saved, but its details could not be refreshed/);
assert.match(bank, /setErrorMessage\(tx\(locale,/);

console.log("OK #989: bank/reconciliation reads preserve typed HTTP codes without unsafe text, locale and write/refresh separation.");
