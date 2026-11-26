import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";
import { Prisma } from "@prisma/client";

const require = createRequire(import.meta.url);
const cache = new Map();
function load(path) {
  if (cache.has(path)) return cache.get(path);
  const unit = { exports: {} };
  cache.set(path, unit.exports);
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    module: unit, exports: unit.exports, require: name => name.startsWith("@/") ? load(`${name.slice(2)}.ts`) : require(name),
  }, { filename: path });
  return unit.exports;
}
const { requireInventoryQuantity: quantity, addInventoryQuantities: add, convertInventoryQuantity: convert } = load("lib/enterprise/inventory/quantity-policy.ts");
const { formatInventoryQuantity: format, inventoryQuantityExportValue: exportQuantity } = load("lib/enterprise/inventory/quantity-display.ts");
const { planFefoLots, readReservationLotAllocations } = load("lib/enterprise/inventory/lot-allocation.ts");
const { Decimal } = Prisma;

for (let scale = 0; scale <= 6; scale++) {
  const valid = scale === 0 ? "2" : `2.${"0".repeat(scale - 1)}1`;
  assert.equal(quantity(valid, scale).toFixed(), valid);
  assert.equal(quantity("0", scale).toFixed(), "0");
  const invalid = `2.${"0".repeat(scale)}1`;
  assert.throws(() => quantity(invalid, scale), { code: scale === 6 ? "INVENTORY_PHYSICAL_QUANTITY_PRECISION" : "INVENTORY_UNIT_QUANTITY_PRECISION" });
  assert.throws(() => quantity("0", scale, { positive: true }), { code: "INVENTORY_PHYSICAL_QUANTITY_PRECISION" });
}
assert.equal(quantity("999999999999999.999999", 6).toFixed(), "999999999999999.999999");
assert.equal(add("999999999999999.999998", "0.000001").toFixed(), "999999999999999.999999");
assert.equal(add("5", "-0.123456").toFixed(), "4.876544");
assert.equal(quantity("-0.123456", 6, { signed: true }).toFixed(), "-0.123456");
for (const bad of ["1000000000000000", "-1", "Infinity", "NaN", "0.0000001"]) {
  assert.throws(() => quantity(bad, 6), { code: "INVENTORY_PHYSICAL_QUANTITY_PRECISION" });
}
for (const scale of [-1, 7, 1.5, undefined]) assert.throws(() => quantity("1", scale), { code: "INVENTORY_UNIT_QUANTITY_PRECISION" });
assert.equal(convert("1.234567", "1000", 3).toFixed(), "1234.567");
assert.equal(convert("-1.5", "2", 0).toFixed(), "-3");
assert.throws(() => convert("0.000001", "0.1", 6), { code: "INVENTORY_PHYSICAL_QUANTITY_PRECISION" });
assert.throws(() => convert("1", `1.${"0".repeat(60)}1`, 6), { code: "INVENTORY_PHYSICAL_QUANTITY_PRECISION" });
assert.throws(() => convert("1.5", "1", 0), { code: "INVENTORY_UNIT_QUANTITY_PRECISION" });
for (const factor of ["0", "-1", "NaN"]) assert.throws(() => convert("1", factor, 6), { code: "INVENTORY_UNIT_CONVERSION_INVALID" });
const historical = new Decimal("1.123456");
assert.equal(format(historical, 0).value, "1.123456");
assert.equal(format(historical, 0).precisionMismatch, true);
assert.equal(historical.toFixed(), "1.123456");
assert.equal(exportQuantity("999999999999999.999999"), "999999999999999.999999");
assert.equal(exportQuantity("1234.123456"), 1234.123456);
assert.equal(exportQuantity("0.000001"), 0.000001);

const candidate = { id: "batch-A", status: "AVAILABLE", expiryDate: null, quantityOnHand: new Decimal("1"), quantityReserved: new Decimal("0") };
const allocation = planFefoLots({ candidates: [candidate], quantity: "0.000001", businessDate: "2026-11-25", expiryMode: "BLOCK" });
assert.equal(allocation.allocations[0].quantity.toFixed(), "0.000001");
assert.equal(allocation.shortfall.toFixed(), "0");
assert.throws(() => planFefoLots({ candidates: [candidate], quantity: "0.0000001", businessDate: "2026-11-25", expiryMode: "BLOCK" }));
// Regression: default Decimal precision (20 significant digits) used to make
// the final reserved micro-unit sellable at the preserved 21-digit capacity.
const largestLot = { ...candidate, quantityOnHand: new Decimal("999999999999999.999999"), quantityReserved: new Decimal("0.000001") };
const largestPlan = planFefoLots({ candidates: [largestLot], quantity: "999999999999999.999999", businessDate: "2026-11-25", expiryMode: "BLOCK" });
assert.equal(largestPlan.allocations[0].quantity.toFixed(), "999999999999999.999998");
assert.equal(largestPlan.shortfall.toFixed(), "0.000001");
assert.equal(Prisma.Decimal.precision, 20, "Physical arithmetic must not change the global monetary Decimal context");
const lotTools = load("lib/enterprise/inventory/lot-allocation.ts");
const full = new Decimal("999999999999999.999999"), micro = new Decimal("0.000001");
assert.equal(lotTools.reservationLegacyRemaining({ quantity: full, fulfilledQuantity: micro }).toFixed(), "999999999999999.999998");
const split = [{balanceId:"a",stockLotId:"A",storageLocationId:null,quantity:"999999999999999.999998",fulfilledQuantity:"0.000001"},{balanceId:"b",stockLotId:"B",storageLocationId:null,quantity:"0.000001",fulfilledQuantity:"0"}];
assert.equal(lotTools.readReservationLotAllocations({quantity:full,fulfilledQuantity:micro,lotAllocations:split}).length,2);
const consumed = lotTools.consumeReservationLotAllocations(split,new Decimal("999999999999999.999998"));
assert.equal(consumed.movements[0].consumedQuantity,"999999999999999.999997");assert.equal(consumed.movements[1].consumedQuantity,"0.000001");assert.equal(consumed.next[0].fulfilledQuantity,"999999999999999.999998");
const invoiceLots = lotTools.readInvoiceLotAllocations({stockLotId:null,invoiceItem:{quantity:full},lotAllocations:[{stockLotId:"A",quantity:"999999999999999.999998"},{stockLotId:"B",quantity:"0.000001"}]},micro);
assert.equal(invoiceLots.length,1);assert.equal(invoiceLots[0].quantity.toFixed(),"999999999999999.999998");
const promised = lotTools.planReservationLotAllocations({balances:[{id:"a",stockLotId:"A",storageLocationId:null,quantityOnHand:full,quantityReserved:micro,stockLot:{status:"AVAILABLE",archivedAt:null,expiryDate:null}}],reservations:[],holds:[],quantity:full,businessDate:"2026-11-25",requireExpiry:false});
assert.equal(promised.allocations[0].quantity,"999999999999999.999998");assert.equal(promised.shortfall.toFixed(),"0.000001");
const returned = lotTools.planPhysicalInvoiceReturnLots({source:{stockLotId:"A",invoiceItem:{quantity:full}},movements:[{id:"out",stockLotId:"A",quantity:full}],previous:[{quantity:micro,stockDisposition:"RESTOCK",lotAllocations:[{stockLotId:"A",quantity:"0.000001"}]}],quantity:new Decimal("999999999999999.999998"),selected:[{stockLotId:"A",quantity:"999999999999999.999998"}]});
assert.equal(returned[0].quantity.toFixed(),"999999999999999.999998");
const snapshot = { quantity: new Decimal("0.000001"), fulfilledQuantity: new Decimal(0), lotAllocations: [{ balanceId: "balance-A", stockLotId: "batch-A", storageLocationId: null, quantity: "0.000001", fulfilledQuantity: "0" }] };
assert.equal(readReservationLotAllocations(snapshot)[0].quantity, "0.000001");
assert.throws(() => readReservationLotAllocations({ ...snapshot, lotAllocations: [{ ...snapshot.lotAllocations[0], quantity: "0.0000001" }] }));
const { stockMovementCreateSchema } = load("lib/enterprise/inventory/schemas.ts");
const { receiptLotAllocationsSchema } = load("lib/enterprise/procurement/receipt-lot-schema.ts");
const move = { inventoryItemId: "item", warehouseId: "warehouse", movementType: "PURCHASE_RECEIPT", direction: "IN", quantity: 0.000001, idempotencyKey: "precision-test" };
assert.equal(stockMovementCreateSchema.safeParse(move).success, true);
const invalidMove = stockMovementCreateSchema.safeParse({ ...move, quantity: 0.0000001 });
assert.equal(invalidMove.success, false);
assert.equal(receiptLotAllocationsSchema.safeParse([{ purchaseItemId: "line", batches: [{ lotNumber: "batch", productionDate: null, expiryDate: null, quantity: 0.000001 }] }]).success, true);
const { enterpriseValidationErrorResponse } = load("lib/enterprise/common/http.ts");
for (const [locale, fragment] of [["fr", "six décimales"], ["en", "six decimal places"]]) {
  const response = enterpriseValidationErrorResponse(invalidMove.error, "VALIDATION_FAILED", new Request("http://localhost", { headers: { "accept-language": locale } }));
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.ok(body.message.includes(fragment));
  assert.ok(!body.message.includes("INVENTORY_"), "Validation messages must remain human in both languages");
}
console.log("PASS #1228: unit precision 0–6, physical capacity, exact arithmetic, conversions, historical preservation and FEFO snapshots");

await import("./qa-data-intelligence-commercial-1228.mjs");

await import("./qa-data-intelligence-sales-quantities-1228.mjs");

await import("./qa-data-intelligence-purchase-quantities-1228.mjs");

await import("./qa-data-intelligence-treasury-1228.mjs");

await import("./qa-data-intelligence-stock-totals-1228.mjs");


// #1228: export the register's localized statuses without changing API filters.
{
  const path = "components/enterprise/professional/hr-design2-tools.tsx";
  const unit = { exports: {} };
  const jsx = (_component, props) => props;
  const label = (locale, group, value) => [locale, group, value].join(":");
  const i18nPath = "components/enterprise/professional/professional-erp-i18n.ts";
  const i18nUnit = { exports: {} };
  const dictionaries = Object.fromEntries(["fr", "en"].map(locale => [locale, JSON.parse(fs.readFileSync("locales/professional-erp-people." + locale + ".json", "utf8"))]));
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(i18nPath, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    module: i18nUnit, exports: i18nUnit.exports,
    require: name => {
      if (name === "@/components/i18n/locale-provider") return { useAppLocale: () => "fr" };
      if (name === "@/lib/i18n") return { translateProfessionalErp: (locale, key) => dictionaries[locale][key] || label(locale, "fallback", key) };
      throw new Error("Unexpected HR dictionary dependency: " + name);
    },
  }, { filename: i18nPath });
  const { canonicalContractType, professionalHrCodeLabel, professionalErpT } = i18nUnit.exports;
  for (const locale of ["fr", "en"]) {
    assert.equal(professionalHrCodeLabel(locale, "scheduleType", "WEEKLY"), locale === "fr" ? "Hebdomadaire" : "Weekly");
    assert.equal(professionalHrCodeLabel(locale, "scheduleType", "DATE"), locale === "fr" ? "Date précise" : "Specific date");
    assert.equal(professionalHrCodeLabel(locale, "attendanceSource", "MANUAL"), locale === "fr" ? "Saisie manuelle" : "Manual entry");
    assert.equal(professionalHrCodeLabel(locale, "attendanceSource", "IMPORT"), "Import");
    assert.equal(professionalHrCodeLabel(locale, "attendanceSource", "SYSTEM"), locale === "fr" ? "Système" : "System");
    assert.equal(professionalHrCodeLabel(locale, "attendanceSource", ""), "");
    assert.equal(professionalHrCodeLabel(locale, "attendanceSource", "UNKNOWN"), professionalErpT(locale, "common.valueToReview"));
  }
  for (const [legacy, canonical] of [["EMPLOYEE","EMPLOYMENT"],["CONTRACTOR","CONSULTING"],["INTERN","INTERNSHIP"],["TEMPORARY","FIXED_TERM"],["INDEFINITE","INDEFINITE"]]) assert.equal(canonicalContractType(legacy), canonical);
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, {
    module: unit, exports: unit.exports,
    require: (name) => {
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
      if (name.endsWith("/erp-design2-register")) return { ErpDesign2RegisterTools: () => null };
      if (name.endsWith("/professional-erp-i18n")) return { canonicalContractType, professionalHrCodeLabel, professionalErpEnumLabel: label, professionalErpT: (locale, key) => [locale, key].join(":") };
      throw new Error("Unexpected HR export dependency: " + name);
    },
  }, { filename: path });
  const kinds = ["contracts", "schedules", "attendance", "leave", "timesheets", "payroll-runs", "payroll-periods"];
  for (const locale of ["fr", "en"]) for (const kind of kinds) {
    const known = locale === "fr" ? "Statut affiché" : "Displayed status";
    const props = unit.exports.HrDesign2Tools({
      kind, locale, organizationId: "tenant-A", organizationName: "Example", title: "Register",
      filters: new URLSearchParams({ status: "TEST_STATUS", search: "sample", dateFrom: "2026-11-01", dateTo: "2026-11-25", page: "2", pageSize: "25", ...(kind === "contracts" ? { archived: "1" } : {}) }),
      status: "TEST_STATUS", statuses: [{ id: "", label: "All" }, { id: "TEST_STATUS", label: known }],
      onStatusChange() {}, dateFrom: "", dateTo: "", onDateChange() {},
    });
    const statusColumn = props.columns.find((column) => column.key === "status");
    assert.equal(statusColumn.get({ status: "TEST_STATUS" }), known);
    assert.equal(statusColumn.get({ status: null }), "");
    assert.equal(props.filters.status, "TEST_STATUS");
    assert.equal(props.filters.search, "sample");
    assert.equal(props.filters.page, "2");
    assert.equal(props.reportFilters.find(filter => filter.label === locale + ":hr.filter.status").value, known);
    assert.equal(props.reportFilters.find(filter => filter.label === locale + ":hr.filter.search").value, "sample");
    assert.equal(props.reportFilters.find(filter => filter.label === locale + ":hr.filter.from").value, "2026-11-01");
    assert.equal(props.reportFilters.find(filter => filter.label === locale + ":hr.filter.to").value, "2026-11-25");
    assert.ok(!props.reportFilters.some(filter => filter.label === "page" || filter.label === "pageSize"));
    if (kind === "contracts") {
      assert.equal(props.reportFilters.find(filter => filter.label === locale + ":hr.filter.archive").value, locale + ":hr.filter.archived");
      const type = props.columns.find(column => column.key === "contractType");
      assert.equal(type.get({ contractType: "TEMPORARY" }), label(locale, "employmentContractType", "FIXED_TERM"));
      assert.equal(type.get({ contractType: null }), "");
    }
    if (kind === "schedules") assert.equal(props.columns.find(column => column.key === "scheduleType").get({ scheduleType: "WEEKLY" }), professionalHrCodeLabel(locale, "scheduleType", "WEEKLY"));
    if (kind === "attendance") assert.equal(props.columns.find(column => column.key === "source").get({ source: "MANUAL" }), professionalHrCodeLabel(locale, "attendanceSource", "MANUAL"));
    assert.ok(props.endpoint.startsWith("/api/enterprise/tenant-A/"));
    for (const privateKey of ["notes", "baseCompensation", "terms", "payslip", "reason"]) {
      assert.ok(!props.columns.some((column) => column.key === privateKey));
    }
    if (kind === "contracts") {
      assert.equal(statusColumn.get({ status: "ENDED", archivedAt: "2026-11-25" }), locale === "fr" ? "Archivé" : "Archived");
      assert.equal(statusColumn.get({ status: "ENDED" }), label(locale, "employmentContractStatus", "ENDED"));
    }
    if (kind === "schedules" || kind === "attendance") assert.equal(statusColumn.get({ status: "UNRECOGNIZED" }), locale + ":common.valueToReview");
    if (kind === "leave" || kind === "timesheets") assert.equal(statusColumn.get({ status: "APPROVED" }), label(locale, "timeStatus", "APPROVED"));
    if (kind.startsWith("payroll-")) assert.equal(statusColumn.get({ status: "APPROVED" }), label(locale, "payrollStatus", "APPROVED"));
    if (kind === "leave") {
      const type = props.columns.find((column) => column.key === "leaveType");
      assert.equal(type.get({ leaveType: "ANNUAL" }), label(locale, "leaveType", "ANNUAL"));
      assert.equal(type.get({ leaveType: null }), "");
    }
  }
  console.log("PASS #1228: localized HR register export statuses in all seven registries, leave type and unchanged filter/privacy contract");
}

await import("./qa-data-intelligence-syscohada-draft-1228.mjs");

await import("./qa-data-intelligence-unit-conversions-1228.mjs");

await import("./qa-data-intelligence-unit-conversion-api-1228.mjs");
