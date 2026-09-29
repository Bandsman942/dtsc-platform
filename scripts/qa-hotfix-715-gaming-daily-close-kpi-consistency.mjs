import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const check = (condition, message) => { if (!condition) failures.push(message); };

const service = read("lib/enterprise/gaming/daily-close.ts");
const workspace = read("components/enterprise/gaming/enterprise-gaming-daily-close-workspace.tsx");
const e2e = read("tests/e2e/issue-693-gaming-checkout-invoice.spec.mjs");
const docs = read("docs/ERP_GAMING_LOUNGE.md");
const regression = read("scripts/qa-regression-checks.mjs");
const pkg = read("package.json");

for (const marker of [
  "checkoutByReference",
  "paidSessionIds",
  "refundedCheckoutRefs",
  "pendingCheckouts",
  'payment.paymentType === "CUSTOMER_PAYMENT" && payment.direction === "INBOUND"',
  'payment.paymentType === "REFUND" && payment.direction === "OUTBOUND"',
  'createdAt: { lt: end }',
  'endedAt: { not: null, lt: end }',
  "paidSessionCount: paidSessionIds.length",
  "pendingCheckoutCount: pendingCheckouts.length",
  "refundedCheckoutCount: refundedCheckoutRefs.length",
]) check(service.includes(marker), `#715 service missing ${marker}`);

check(!service.includes('paidSessionCount: endedSessions.filter((session) => session.status === "PAID").length'), "#715 paid sessions must not depend only on sessions ended during the selected day.");
check(!service.includes('refundedCheckoutCount: dayCheckouts.filter'), "#715 refunds must be derived from confirmed/reconciled refund payment events.");

for (const marker of [
  "calendarDateInTimezone",
  "formatGamingBusinessDate",
  'timeZone,',
  'value={businessDate}',
  'value={siteId}',
  'selectedSite?.timezone || "UTC"',
]) check(workspace.includes(marker), `#715 workspace missing ${marker}`);
check(!workspace.includes("formatEnterpriseDate(detail.businessDate"), "#715 business day detail must not render a synthetic time.");

for (const marker of [
  'test("#706 submits Gaming daily close; #715 keeps the snapshot KPIs coherent"',
  "latePaidSessionId",
  "latePaidCheckoutReference",
  'paymentType: "REFUND"',
  "persisted.paidSessionCount",
  "persisted.pendingCheckoutCount",
  "persisted.refundedCheckoutCount",
  'refundAmount.toFixed()).toBe("100")',
]) check(e2e.includes(marker), `#715 E2E missing ${marker}`);

for (const marker of [
  "Sessions terminées",
  "Sessions payées",
  "Encaissements en attente",
  "Remboursés",
  "paymentDate",
  "snapshot",
]) check(docs.includes(marker), `#715 documentation missing ${marker}`);

check(regression.includes('qa-hotfix-715-gaming-daily-close-kpi-consistency.mjs'), "#715 must be part of canonical regression.");
check(pkg.includes('"qa:hotfix-715"'), "#715 package script missing.");

if (failures.length) {
  console.error(failures.map((failure) => `❌ ${failure}`).join("\n"));
  process.exit(1);
}

console.log("✅ Hotfix #715 vérifié : KPI de clôture Gaming cohérents avec les événements de paiement et journée métier sans heure parasite.");
