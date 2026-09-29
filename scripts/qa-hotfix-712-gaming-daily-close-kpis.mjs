import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const check = (condition, message) => { if (!condition) failures.push(message); };

const service = read("lib/enterprise/gaming/daily-close.ts");
const workspace = read("components/enterprise/gaming/enterprise-gaming-daily-close-workspace.tsx");
const docs = read("docs/ERP_GAMING_LOUNGE.md");
const e2e = read("tests/e2e/issue-693-gaming-checkout-invoice.spec.mjs");
const regression = read("scripts/qa-regression-checks.mjs");
const pkg = read("package.json");
const workflow = read(".github/workflows/gaming-646-commercial-readiness.yml");

for (const marker of [
  "getEnterpriseBusinessContext",
  "safeTimezone(site?.timezone, businessContext.timezone)",
  'endedAt: { gte: start, lt: end }',
  'pendingCheckoutStatuses = ["INVOICE_PENDING", "AWAITING_PAYMENT", "PARTIALLY_PAID", "REFUND_PENDING"]',
  'endedAt: { not: null, lt: end }',
  "financialCheckoutByReference",
  "paidSessionIds",
  "refundedCheckoutRefs",
  'checkout.status === "PAID"',
  'checkout.status === "REFUNDED"',
  "paidSessionCount: paidSessionIds.size",
  "pendingCheckoutCount: pendingCheckouts.length",
  "refundedCheckoutCount: refundedCheckoutRefs.size",
]) check(service.includes(marker), `#712 service missing ${marker}`);

check(!service.includes('paidSessionCount: endedSessions.filter'), "#712 paid sessions must not be limited to sessions ended on the same day.");
check(!service.includes("dayCheckouts.filter"), "#712 pending/refunded KPIs must not reuse only same-day ended sessions.");
check(service.includes('status: { in: ["CONFIRMED", "RECONCILED"] }'), "#712 financial event KPIs must use confirmed/reconciled canonical payments.");
check(service.includes('paymentDate: { gte: start, lt: end }'), "#712 financial event KPIs must remain bounded by the business day.");
check(!service.includes("exchangeRate"), "#712 must not introduce FX conversion in Gaming close.");

for (const marker of [
  "/business-context",
  "businessContext?.businessDate",
  "formatBusinessDate",
  "timeZone,",
]) check(workspace.includes(marker), `#712 workspace missing ${marker}`);
check(!workspace.includes("formatEnterpriseDate(detail.businessDate"), "#712 detail must not render a business date as a timestamp.");

for (const marker of [
  "fuseau canonique de l’entreprise",
  "paidSessionCount",
  "pendingCheckoutCount",
  "refundedCheckoutCount",
  "snapshot est recalculé dans la transaction de création puis figé à la soumission",
]) check(docs.includes(marker), `#712 documentation missing ${marker}`);

for (const marker of [
  "#706/#710/#712 submits a coherent Gaming daily-close KPI snapshot",
  "latePaidSessionId",
  'methodType: "OTHER"',
  'action: "REQUEST_REFUND"',
  'action: "APPROVE_REFUND"',
  "paidSessionCount).toBe(1)",
  "pendingCheckoutCount).toBeGreaterThan(0)",
  "refundedCheckoutCount).toBe(1)",
  "timezone).toBe(timezone)",
]) check(e2e.includes(marker), `#712 E2E missing ${marker}`);

check(regression.includes('qa-hotfix-712-gaming-daily-close-kpis.mjs'), "#712 must be wired into canonical regression.");
check(pkg.includes('"qa:hotfix-712"'), "#712 package script missing.");
check(workflow.includes("Validate hotfix 712 daily close KPI contract"), "#712 Gaming workflow targeted QA step missing.");

if (failures.length) {
  console.error(failures.map((failure) => `❌ ${failure}`).join("\n"));
  process.exit(1);
}

console.log("✅ Hotfix #712 vérifié : KPI de clôture Gaming alignés sur la journée métier, les paiements canoniques et le backlog.");
