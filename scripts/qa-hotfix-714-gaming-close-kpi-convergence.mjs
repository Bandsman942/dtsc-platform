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
  'paymentDate: { gte: start, lt: end }',
  'status: { in: ["CONFIRMED", "RECONCILED"] }',
  'const paidSessionIds = new Set(',
  'checkout?.status === "PAID"',
  'const refundedSessionIds = new Set(',
  'checkout?.status === "REFUNDED"',
  'const pendingCheckoutCount = await tx.enterpriseGamingCheckout.count',
  'endedAt: { lt: end }',
  'paidSessionCount: paidSessionIds.size',
  'pendingCheckoutCount,',
  'refundedCheckoutCount: refundedSessionIds.size',
]) check(service.includes(marker), `#714 service missing ${marker}`);

check(!service.includes('financialAccountId: { in: accountIds },\n          status: { in: ["CONFIRMED", "RECONCILED"] }'),
  "#714 KPI payment discovery must not depend on the accounts manually declared in the close.");
check(!service.includes('paidSessionCount: endedSessions.filter'),
  "#714 paid sessions must not be restricted to sessions ended on the same day.");
check(!service.includes('pendingCheckoutCount: dayCheckouts.filter'),
  "#714 pending checkout backlog must not be restricted to same-day ended sessions.");

for (const marker of [
  "function formatBusinessDate",
  "dateStyle: \"medium\"",
  "timeZone: timezone",
  "formatBusinessDate(detail.businessDate, locale, detail.timezone)",
]) check(workspace.includes(marker), `#714 workspace missing ${marker}`);
check(!workspace.includes("formatEnterpriseDate(detail.businessDate"),
  "#714 business day detail must not render a time component.");

for (const marker of [
  "crossDayPaidSessionId",
  "previous day",
  "persisted.paidSessionCount",
  "persisted.pendingCheckoutCount",
]) check(e2e.includes(marker), `#714 E2E missing ${marker}`);

for (const marker of [
  "paiements confirmés/réconciliés",
  "backlog",
  "snapshot",
]) check(docs.includes(marker), `#714 documentation missing ${marker}`);

check(regression.includes("qa-hotfix-714-gaming-close-kpi-convergence.mjs"), "#714 must be part of canonical regression.");
check(pkg.includes('"qa:hotfix-714"'), "#714 package script missing.");

if (failures.length) {
  console.error(failures.map((failure) => `❌ ${failure}`).join("\n"));
  process.exit(1);
}
console.log("✅ Hotfix #714 vérifié : KPI de clôture Gaming convergents avec les événements de paiement et journée métier sans heure parasite.");
