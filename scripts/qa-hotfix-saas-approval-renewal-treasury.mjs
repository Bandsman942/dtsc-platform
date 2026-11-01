import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const manual = read("lib/subscription-payments.ts");
const paymentApi = read("app/api/admin/manual-subscription-payments/route.ts");
const decisionApi = read("app/api/admin/manual-subscription-payments/[id]/route.ts");
const finance = read("lib/hr-cfo-finance.ts");
const renewal = read("app/api/billing/renewal-request/route.ts");
const billing = read("app/billing/page.tsx");
const treasury = read("components/admin/internal-finance-controls.tsx");
const migration = read("prisma/migrations/20261101100000_internal_treasury_currency_controls/migration.sql");

assert.match(paymentApi, /manualSubscriptionApprovalNotificationTarget/);
assert.match(paymentApi, /DUPLICATE_PAYMENT_REFERENCE/);
assert.match(decisionApi, /validator/);
assert.match(manual, /MANUAL_PAYMENT_SELF_APPROVAL_FORBIDDEN/);
assert.match(manual, /FOR UPDATE/g);
assert.match(manual, /createValidatedTransactionInTx/g);
assert.match(manual, /DTSC-M-/);
assert.match(finance, /TREASURY_ACCOUNT_CURRENCY_MISMATCH/);
assert.match(finance, /ensureSubscriptionSettlementAccount/);
assert.match(migration, /reconciliationIssue/);
assert.match(renewal, /SAAS_SUBSCRIPTION_RENEWAL/);
assert.match(renewal, /ORGANIZATION_ADMIN_REQUIRED/);
assert.match(billing, /SubscriptionRenewalActions/);
assert.match(billing, /ManualSubscriptionPaymentsAdmin/);
assert.match(treasury, /groupBy/);
assert.match(treasury, /reconciliationIssue/);
for (const locale of ["fr", "en"]) {
  const translations = JSON.parse(read(`locales/${locale}.json`));
  assert.ok(translations.subscriptionRenewal?.expired);
  assert.ok(translations.internalFinance?.unverifiedAccounts);
}
console.log("PASS: static contracts for manual approvals, renewal and treasury (DB E2E not executed)");
