import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const helper = readFileSync("lib/pharmacy-kpi-currency.ts", "utf8");
const exports = {};
vm.runInNewContext(ts.transpileModule(helper, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText, { exports, Number }, { filename: "pharmacy-kpi-currency.js" });

const resolve = exports.resolvePharmacyAmountKpi;
const group = (currency, amount) => ({ baseCurrency: currency, _sum: { totalAmountBase: amount } });
assert.equal(resolve([], "USD", 0).amount, 0, "Empty periods remain a valid zero");
assert.equal(resolve([group("USD", "6000.00")], "USD", 0).amount, 6000);
assert.equal(resolve([group("USD", "100")], "CDF", 0).amount, null,
  "Historical USD base must not be displayed as current CDF");
assert.equal(resolve([group("USD", "100"), group("CDF", "200")], "USD", 0).amount, null,
  "Different base currencies cannot be summed");
assert.equal(resolve([group("USD", "100")], "USD", 1).amount, null,
  "Invalid conversion snapshots must block monetary KPI");
assert.equal(resolve([group("USD", "NaN")], "USD", 0).reliable, false);
assert.equal(resolve([], "", 0).reliable, false);

const sales = readFileSync("lib/pharmacy-sales.ts", "utf8");
const workspace = readFileSync("components/enterprise/pharmacy-sales-workspace.tsx", "utf8");
assert.match(sales, /groupBy\(\{ by: \["baseCurrency"\]/,
  "KPI must group historical amounts by stored base currency");
assert.match(sales, /const base = \{ organizationId \}/);
assert.match(sales, /where: \{ \.\.\.base, saleDate: todayFilter \}/);
assert.match(sales, /where: \{ \.\.\.base, saleDate: monthFilter \}/);
assert.match(sales, /financialKpiReliable: \{ today:/);
assert.match(workspace, /role="alert"/);
assert.match(workspace, /pharmacySaleKpis\.currencyWarning/);
for (const locale of ["fr", "en"]) {
  const messages = JSON.parse(readFileSync(`locales/${locale}.json`, "utf8"));
  for (const key of ["currencyWarning", "unavailable", "todayAmount", "monthAmount"]) {
    assert.ok(messages.pharmacySaleKpis[key], `${locale} must translate ${key}`);
  }
}
console.log("OK: historical Pharmacy base-currency KPI guard, invalid snapshots, FR/EN warnings and tenant-scoped groups.");
