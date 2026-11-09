-- Finance planning is not a treasury movement. Preserve optional funding and
-- settlement intent separately from posted, immutable financial transactions.
ALTER TABLE "EnterpriseBudgetLine" ADD COLUMN "fundingFinancialAccountId" TEXT;
ALTER TABLE "EnterpriseExpense" ADD COLUMN "beneficiaryEmployeeId" TEXT;
ALTER TABLE "EnterpriseExpense" ADD COLUMN "settlementMode" TEXT NOT NULL DEFAULT 'DEFERRED';
ALTER TABLE "EnterpriseExpense" ADD COLUMN "paymentDueDate" TIMESTAMP(3);
ALTER TABLE "EnterpriseExpense" ADD COLUMN "preferredFinancialAccountId" TEXT;
ALTER TABLE "EnterprisePayment" ADD COLUMN "expenseId" TEXT;

CREATE INDEX "EnterpriseBudgetLine_organizationId_fundingFinancialAccountId_idx" ON "EnterpriseBudgetLine"("organizationId", "fundingFinancialAccountId");
CREATE INDEX "EnterpriseExpense_organizationId_beneficiaryEmployeeId_idx" ON "EnterpriseExpense"("organizationId", "beneficiaryEmployeeId");
CREATE INDEX "EnterpriseExpense_organizationId_preferredFinancialAccountId_idx" ON "EnterpriseExpense"("organizationId", "preferredFinancialAccountId");
CREATE INDEX "EnterprisePayment_organizationId_expenseId_status_idx" ON "EnterprisePayment"("organizationId", "expenseId", "status");

ALTER TABLE "EnterpriseBudgetLine" ADD CONSTRAINT "EnterpriseBudgetLine_funding_financial_account_fkey"
  FOREIGN KEY ("organizationId", "fundingFinancialAccountId") REFERENCES "EnterpriseFinancialAccount"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterpriseExpense" ADD CONSTRAINT "EnterpriseExpense_preferred_financial_account_fkey"
  FOREIGN KEY ("organizationId", "preferredFinancialAccountId") REFERENCES "EnterpriseFinancialAccount"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterprisePayment" ADD CONSTRAINT "EnterprisePayment_expense_fkey"
  FOREIGN KEY ("organizationId", "expenseId") REFERENCES "EnterpriseExpense"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
