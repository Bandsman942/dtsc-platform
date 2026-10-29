import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync("lib/enterprise/business-context.ts", "utf8");
const sales = readFileSync("lib/pharmacy-sales.ts", "utf8");
const route = readFileSync("app/api/enterprise/[organizationId]/pharmacy/sales/route.ts", "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const exports = {};
class TestDomainError extends Error {
  constructor(code, status) { super(code); this.code = code; this.status = status; }
}
vm.runInNewContext(compiled, {
  exports, Date, Intl, Map, Error,
  require: (id) => {
    assert.equal(id, "@/lib/enterprise/common/errors", "Business calendar must not import additional runtime dependencies");
    return { EnterpriseDomainError: TestDomainError };
  },
}, { filename: "business-context.js" });
const calendar = exports.enterpriseBusinessCalendarWindows;
assert.equal(typeof calendar, "function", "Shared business calendar helper must be exported");

function check(label, at, zone, expectedDate, start, end) {
  const r = calendar(new Date(at), zone);
  assert.equal(r.businessDate, expectedDate, `${label}: business date`);
  assert.equal(r.day.gte.toISOString(), start, `${label}: start`);
  assert.equal(r.day.lt.toISOString(), end, `${label}: end`);
  assert.ok(r.day.lt > r.day.gte, `${label}: nonempty window`);
}
check("Kinshasa before local midnight", "2026-10-29T22:30:00.000Z", "Africa/Kinshasa",
  "2026-10-29", "2026-10-28T23:00:00.000Z", "2026-10-29T23:00:00.000Z");
check("Kinshasa after local midnight", "2026-10-29T23:30:00.000Z", "Africa/Kinshasa",
  "2026-10-30", "2026-10-29T23:00:00.000Z", "2026-10-30T23:00:00.000Z");
check("NY DST spring: 23h day", "2026-03-08T12:00:00.000Z", "America/New_York",
  "2026-03-08", "2026-03-08T05:00:00.000Z", "2026-03-09T04:00:00.000Z");
check("NY DST fall: 25h day", "2026-11-01T12:00:00.000Z", "America/New_York",
  "2026-11-01", "2026-11-01T04:00:00.000Z", "2026-11-02T05:00:00.000Z");
const month = calendar(new Date("2026-10-29T23:30:00.000Z"), "Africa/Kinshasa").month;
assert.equal(month.gte.toISOString(), "2026-09-30T23:00:00.000Z");
assert.equal(month.lt.toISOString(), "2026-10-31T23:00:00.000Z");
assert.throws(() => calendar(new Date(), "Invalid/Zone"), { code: "ORGANIZATION_TIMEZONE_INVALID" });

assert.match(sales, /getEnterpriseBusinessContext\(prisma, organizationId\)/);
assert.match(sales, /const todayFilter = businessCalendar\.day/);
assert.match(sales, /const monthFilter = businessCalendar\.month/);
assert.match(sales, /saleDate: todayFilter/g);
assert.match(sales, /saleDate: monthFilter/);
assert.doesNotMatch(sales, /getUTCFullYear\(\)|86_400_000/, "UTC bounds must not remain in sales dataset");
assert.match(route, /enterpriseDomainErrorResponse\(error, "PHARMACY_SALES_READ_FAILED", req\)/);
console.log("OK: Pharmacy business day/month windows (Africa/Kinshasa and New York DST), tenant timezone and API errors.");
