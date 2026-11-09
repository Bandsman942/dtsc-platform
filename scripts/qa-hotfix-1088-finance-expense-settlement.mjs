import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const schema = read("prisma/enterprise-finance-reporting.prisma");
const paymentSchema = read("prisma/enterprise-accounting.prisma");
const migration = read("prisma/migrations/20261109093000_finance_budget_expense_settlement/migration.sql");
const budget = read("lib/enterprise/finance/budget-service.ts");
const expense = read("lib/enterprise/finance/expense-service.ts");
const payments = read("lib/enterprise/accounting/payments-service.ts");
const expensePosting = read("lib/enterprise/accounting/payroll-expense-accounting-service.ts");
const postingBuilders = read("lib/enterprise/accounting/domain-posting-builders.ts");
const registry = read("lib/enterprise/accounting/posting-registry-final.ts");
const postingService = read("lib/enterprise/accounting/posting-service.ts");
const details = read("app/api/enterprise/[organizationId]/expenses/[id]/route.ts");
const budgetDetails = read("app/api/enterprise/[organizationId]/budgets/[id]/route.ts");
const selectors = read("app/api/enterprise/[organizationId]/budgets/references/route.ts");
const financeUi = read("components/enterprise/core-v2/enterprise-finance-workspace-hotfix.tsx");
const financeGuide = read("lib/user-guides/iteration06-guides.ts");

for (const column of ["fundingFinancialAccountId", "beneficiaryEmployeeId", "settlementMode", "paymentDueDate", "preferredFinancialAccountId"]) {
  assert.match(schema, new RegExp(`\\b${column}\\b`), `${column} persists in canonical finance schema`);
  assert.match(migration, new RegExp(`ADD COLUMN "${column}"`), `${column} migration is additive`);
}
assert.match(paymentSchema, /expenseId\s+String\?/, "Payment has a nullable expense source");
assert.match(migration, /FOREIGN KEY \("organizationId", "expenseId"\)/, "Payment source enforces tenant boundary at database level");
assert.match(migration, /FOREIGN KEY \("organizationId", "fundingFinancialAccountId"\)/);
assert.match(migration, /FOREIGN KEY \("organizationId", "preferredFinancialAccountId"\)/);
assert.match(budget, /fundingAccount\.currencyCode !== currency/, "Budget funding cannot silently cross currencies");
assert.match(budget, /BUDGET_FUNDING_SITE_MISMATCH/, "Store-scoped budget funding cannot cross stores");
assert.match(budget, /organizationId, code: accountCode, isActive: true/, "Budget ledger code must be active and tenant scoped");
assert.doesNotMatch(budget, /enterpriseTreasuryTransaction\.create|enterpriseFinancialAccount\.update\(/, "Budget never writes treasury");
assert.match(expense, /requirePreferredAccount\(/, "Preferred account validated");
assert.match(expense, /requireBeneficiaryEmployee\(/, "Employee reimbursement validated");
assert.match(expensePosting, /expense\.purchaseId \|\| expense\.supplierId/, "Direct posting rejects supplier and purchase duplicates");
assert.match(expensePosting, /EXPENSE_EMPLOYEE_TREATMENT_MISMATCH/, "Employee treatment is explicit");
assert.match(postingBuilders, /EXPENSE_BUDGET_ACCOUNT_NOT_POSTABLE/, "Direct charge account must be postable");
assert.match(postingBuilders, /buildExpenseSettlementPosting/, "A dedicated settlement posting exists");
assert.match(postingBuilders, /accountMappingKey: counterpart[\s\S]*debit: payment\.amount/, "Settlement debits liability or clearing");
assert.match(postingBuilders, /accountMappingKey: `ACCOUNT_ID:\$\{account\.ledgerAccountId\}`[\s\S]*credit: payment\.amount/, "Settlement credits actual treasury ledger");
assert.match(registry, /EXPENSE_SETTLEMENT_CONFIRMED: buildExpenseSettlementPosting/, "New event is registered centrally");
assert.match(payments, /payment\.paymentType === "EXPENSE_SETTLEMENT"/, "Payment confirm identifies expense settlement");
assert.match(payments, /SELECT id FROM "EnterpriseExpense"[^`]*FOR UPDATE/, "Concurrent reservations lock the source expense");
assert.match(payments, /status: \{ notIn: \["CANCELLED", "REVERSED"\] \}/, "Cancelled and reversed payments do not consume reserved balance");
assert.match(payments, /EXPENSE_PAYMENT_EXCEEDS_REMAINING/, "Overpayment forbidden");
assert.match(payments, /EXPENSE_PAYMENT_INSUFFICIENT_FUNDS/, "Funds rechecked at confirmation");
assert.match(payments, /account\?\.accountType !== "BANK"/, "Bank transfers require the bank-type account");
assert.match(payments, /tx\.enterpriseTreasuryTransaction\.create/, "Money moves only in confirm transaction");
assert.match(payments, /postBusinessEventTx\(tx, organizationId/, "Treasury and journal use same transaction");
assert.match(postingService, /postingEvent|postingEvent/, "Canonical posting service remains source of truth");
assert.match(details, /enterprisePayment\.aggregate/, "Totals never depend on first 50 payment rows");
assert.match(details, /getEnterpriseAccountingAccess/, "Settlement capability is server-side");
assert.match(budgetDetails, /fundingAccountLabels/, "Saved budgets show human-readable finance accounts");
assert.match(selectors, /getEnterpriseFinanceAccess/, "Budget references check module permissions");
assert.doesNotMatch(selectors, /operationalBalance|availableBalance|maskedReference/, "Budget selector does not leak account balance/identifier");
for (const step of ["Autorisation budgétaire", "Comptabiliser cette dépense", "Préparer un règlement distinct"]) {
  assert.ok(financeUi.includes(step), `${step} is explained in the UI`);
}
assert.match(financeGuide, /Guide Budgets, dépenses et règlements/, "Contextual user help is updated");

console.log("PASS #1088: tenant-linked funding, expense classification, non-debiting budgets, single posting, partial payment reservation and atomic settlement contract.");
