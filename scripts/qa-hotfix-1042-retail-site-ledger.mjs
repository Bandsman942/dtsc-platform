import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const { Prisma } = require("@prisma/client");
const source = fs.readFileSync("lib/enterprise/retail/site-financial-report.ts", "utf8");
const module = { exports: {} };
let calls = 0;
const groupedRows = [
  { siteId: "site-a", currencyCode: "CDF", accountType: "REVENUE", accountSubtype: "REVENUE", amount: new Prisma.Decimal("100.50"), lineCount: 2n },
  { siteId: "site-a", currencyCode: "CDF", accountType: "EXPENSE", accountSubtype: "COST_OF_SALES", amount: new Prisma.Decimal("40.20"), lineCount: 1n },
  { siteId: "site-a", currencyCode: "CDF", accountType: "EXPENSE", accountSubtype: "OPERATING_EXPENSES", amount: new Prisma.Decimal("10.30"), lineCount: 1n },
  { siteId: "site-a", currencyCode: "CDF", accountType: "OTHER_INCOME", accountSubtype: "OTHER_INCOME", amount: new Prisma.Decimal("5.01"), lineCount: 1n },
  { siteId: "site-a", currencyCode: "USD", accountType: "REVENUE", accountSubtype: "REVENUE", amount: new Prisma.Decimal("20"), lineCount: 1n },
  { siteId: "site-b", currencyCode: "CDF", accountType: "REVENUE", accountSubtype: "REVENUE", amount: new Prisma.Decimal("-10.50"), lineCount: 2n },
  { siteId: null, currencyCode: "CDF", accountType: "EXPENSE", accountSubtype: "OPERATING_EXPENSES", amount: new Prisma.Decimal("12"), lineCount: 1n },
];
vm.runInNewContext(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, {
  module, exports: module.exports,
  require: (id) => {
    if (id === "@prisma/client") return { Prisma };
    if (id === "@/lib/prisma") return { prisma: { $queryRaw: async (sql) => {
      calls += 1;
      const statement = sql.strings.join("?");
      assert.match(statement, /INNER JOIN "EnterpriseJournalEntry"/);
      assert.match(statement, /e\.status IN \('POSTED', 'REVERSED'\)/);
      assert.match(statement, /l\."siteId" IN/);
      assert.match(statement, /GROUP BY l\."siteId"/);
      return groupedRows;
    } } };
    return require(id);
  },
});

const { retailPostedSiteLedger } = module.exports;
const none = await retailPostedSiteLedger("tenant", new Date("2026-11-01"), new Date("2026-11-07"), []);
assert.equal(calls, 0, "No query when no site is active");
assert.equal(none.bySite.length, 0);
const report = await retailPostedSiteLedger("tenant", new Date("2026-11-01"), new Date("2026-11-07"), ["site-a", "site-b"]);
assert.equal(calls, 1, "Single grouped tenant/site/currency query");
assert.equal(report.bySite.length, 3, "Currency figures never mixed");
const cdf = report.bySite.find((row) => row.siteId === "site-a" && row.currencyCode === "CDF");
assert.equal(cdf.revenue, "100.500000");
assert.equal(cdf.costOfSales, "40.200000");
assert.equal(cdf.operatingExpenses, "10.300000");
assert.equal(cdf.otherIncome, "5.010000");
assert.equal(cdf.grossMargin, "60.300000");
assert.equal(cdf.operatingResult, "55.010000");
assert.equal(cdf.journalLineCount, 5);
assert.equal(report.bySite.find((row) => row.currencyCode === "USD").revenue, "20.000000");
assert.equal(report.bySite.find((row) => row.siteId === "site-b").revenue, "-10.500000", "Reversals retain their signed effect");
assert.equal(report.unallocated.length, 1, "Entries without a store must be flagged, not allocated proportionally");
assert.equal(report.unallocated[0].operatingExpenses, "12.000000");
console.log("HOTFIX #1042 posted-ledger site grouping, exact margins and unallocated rows: OK");
