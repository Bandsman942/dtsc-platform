import fs from "node:fs";

const failures = [];
const read = (path) => fs.readFileSync(path, "utf8");
const check = (condition, message) => { if (!condition) failures.push(message); };
const hasAll = (source, tokens) => tokens.every((token) => source.includes(token));

const payments = read("lib/enterprise/accounting/payments-service.ts");
const refunds = read("lib/enterprise/accounting/customer-refund-service.ts");
const paymentRoute = read("app/api/enterprise/[organizationId]/payments/route.ts");
const financeHttp = read("lib/enterprise/accounting/http.ts");
const financeUi = read("components/enterprise/professional/finance-professional-ui.ts");
const health = read("lib/enterprise/sector-convergence/health-billing-service.ts");
const pharmacy = read("lib/enterprise/sector-convergence/pharmacy-finance-service.ts");
const tailoring = JSON.parse(read("lib/enterprise/module-registry-tailoring.json"));
const confidentiality = read("scripts/qa-sector-data-confidentiality-checks.mjs");
const financeArchitecture = read("docs/ERP_FINANCE_ARCHITECTURE.md");
const sectorMapping = read("docs/ERP_SECTOR_FINANCIAL_MAPPING.md");

for (const token of [
  'const CASH_SESSION_BINDING_CUTOVER_AT = new Date("2026-09-29T08:30:00.000Z")',
  "createdAt: Date",
  "isLegacyCashSessionBinding",
  "PAYMENT_CASH_SESSION_BINDING_REQUIRED",
  "Legacy cash session rebound before confirmation",
  "Historical cash session binding recovered before confirmation",
  "postBusinessEventTx",
  "reverseJournalEntryTx",
]) {
  check(payments.includes(token), `payments service missing: ${token}`);
}
check(
  payments.includes('if (!cashSession) throw new EnterpriseAccountingError("OPEN_CASH_SESSION_REQUIRED", 409)'),
  "new Cash payment creation must require an OPEN session",
);
check(
  payments.includes("relatedUserIds: [payment.initiatedByUserId, payment.approvedByUserId]"),
  "payment confirmation must keep maker/checker/settler separation",
);

for (const token of [
  "postBusinessEventTx",
  "current.approvedByUserId",
  'postingEvent: "CUSTOMER_REFUND_CONFIRMED"',
]) {
  check(refunds.includes(token), `customer refund service missing: ${token}`);
}
check(!refunds.includes('import { postBusinessEvent }'), "customer refund confirmation must not post after transaction commit");
check(
  refunds.includes("relatedUserIds: [current.initiatedByUserId, current.approvedByUserId]"),
  "customer refund confirmation must reject initiator and approver",
);

for (const token of [
  "const actorBlocker",
  'item.initiatedByUserId === auth.session.userId',
  'item.approvedByUserId === auth.session.userId',
  "const confirmationBlocker = actorBlocker || cashBlocker",
  "const canConfirm = capabilities.canWrite",
  "&& !confirmationBlocker",
]) {
  check(paymentRoute.includes(token), `payment confirmation capability guard missing: ${token}`);
}
for (const source of [financeHttp, financeUi]) {
  check(source.includes("PAYMENT_CASH_SESSION_BINDING_REQUIRED"), "safe recent Cash binding message missing");
  check(source.includes("REFUND_PAYMENT_SELF_CONFIRMATION_FORBIDDEN"), "safe refund separation message missing");
}

check(hasAll(health, ["enterpriseCatalogItem.findMany", "catalogNameById"]), "Health must resolve controlled Catalog labels");
check(!health.includes("description: item.description"), "Health Finance must never copy free-text clinical line description");
check(hasAll(pharmacy, ["enterpriseCatalogItem.findMany", "catalogNameById"]), "Pharmacy must resolve common Catalog labels");
check(!pharmacy.includes("description: `Pharmacy item ${line.productId}`"), "Pharmacy Finance must not expose product UUID as label");

const tailoringByCode = new Map(tailoring.modules.map((item) => [item.code, item]));
for (const [code, integrations] of [
  ["TAILORING_OVERVIEW", ["SALES_QUOTES_ORDERS", "FINANCE_RECEIVABLES", "FINANCE_PAYMENTS"]],
  ["TAILORING_MATERIAL_PROFILES", ["FINANCE_INVENTORY"]],
  ["TAILORING_FINISHING", ["SALES_QUOTES_ORDERS", "FINANCE_RECEIVABLES", "FINANCE_PAYMENTS"]],
]) {
  const module = tailoringByCode.get(code);
  check(Boolean(module), `Tailoring registry missing ${code}`);
  for (const integration of integrations) {
    check(module?.recommendedIntegrations?.includes(integration), `${code} must recommend ${integration}`);
  }
}

for (const forbidden of [
  "historyOfPresentIllness:",
  "allergies:",
  "prescriptionText:",
  "resultValue:",
  "resultInterpretation:",
  "description: item.description",
]) {
  check(confidentiality.includes(forbidden), `Health confidentiality QA must forbid ${forbidden}`);
}

for (const marker of [
  "20260929083000_payment_cash_session_binding",
  "three independent duties",
]) {
  check(financeArchitecture.includes(marker), `Finance architecture missing ${marker}`);
}
for (const marker of [
  "### Gaming checkout and close",
  "### Tailoring / Manufacturing delivery-to-finance boundary",
  "### Retail / Shop",
  "## Health confidentiality boundary",
  "## Inverse symmetry",
  "#728",
]) {
  check(sectorMapping.includes(marker), `Sector financial mapping missing ${marker}`);
}

if (failures.length) {
  console.error("FAIL #741 stale Finance PR cleanup:\n" + failures.map((item) => `- ${item}`).join("\n"));
  process.exit(1);
}
console.log("PASS #741 stale Finance PR cleanup preserves atomic refunds, legacy-only Cash recovery and sector confidentiality.");
