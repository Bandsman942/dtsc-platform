-- CreateTable
CREATE TABLE "EnterpriseFinancialStatementSnapshot" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "statementType" TEXT NOT NULL,
    "fiscalPeriodId" TEXT,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "filtersJson" JSONB,
    "snapshotJson" JSONB NOT NULL,
    "checksum" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'GENERATED',
    "generatedByUserId" TEXT NOT NULL,
    "publishedByUserId" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),
    CONSTRAINT "EnterpriseFinancialStatementSnapshot_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "EnterpriseFinancialStatementSnapshot_organizationId_stateme_idx" ON "EnterpriseFinancialStatementSnapshot"("organizationId", "statementType", "generatedAt");
CREATE UNIQUE INDEX "EnterpriseFinancialStatementSnapshot_organizationId_id_key" ON "EnterpriseFinancialStatementSnapshot"("organizationId", "id");
CREATE UNIQUE INDEX "EnterpriseFinancialStatementSnapshot_organizationId_stateme_key" ON "EnterpriseFinancialStatementSnapshot"("organizationId", "statementType", "periodStart", "periodEnd", "currencyCode", "checksum");
ALTER TABLE "EnterpriseFiscalPeriod" ADD CONSTRAINT "EnterpriseFiscalPeriod_organizationId_fiscalYearId_fkey" FOREIGN KEY ("organizationId", "fiscalYearId") REFERENCES "EnterpriseFiscalYear"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterpriseFinancialClose" ADD CONSTRAINT "EnterpriseFinancialClose_organizationId_fiscalPeriodId_fkey" FOREIGN KEY ("organizationId", "fiscalPeriodId") REFERENCES "EnterpriseFiscalPeriod"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterpriseAccountGroup" ADD CONSTRAINT "EnterpriseAccountGroup_organizationId_chartId_fkey" FOREIGN KEY ("organizationId", "chartId") REFERENCES "EnterpriseChartOfAccounts"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterpriseLedgerAccount" ADD CONSTRAINT "EnterpriseLedgerAccount_organizationId_chartId_fkey" FOREIGN KEY ("organizationId", "chartId") REFERENCES "EnterpriseChartOfAccounts"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterpriseLedgerAccount" ADD CONSTRAINT "EnterpriseLedgerAccount_organizationId_accountGroupId_fkey" FOREIGN KEY ("organizationId", "accountGroupId") REFERENCES "EnterpriseAccountGroup"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterpriseLedgerAccount" ADD CONSTRAINT "EnterpriseLedgerAccount_organizationId_parentId_fkey" FOREIGN KEY ("organizationId", "parentId") REFERENCES "EnterpriseLedgerAccount"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterpriseJournalEntry" ADD CONSTRAINT "EnterpriseJournalEntry_organizationId_journalId_fkey" FOREIGN KEY ("organizationId", "journalId") REFERENCES "EnterpriseJournal"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterpriseJournalEntry" ADD CONSTRAINT "EnterpriseJournalEntry_organizationId_fiscalPeriodId_fkey" FOREIGN KEY ("organizationId", "fiscalPeriodId") REFERENCES "EnterpriseFiscalPeriod"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterpriseJournalLine" ADD CONSTRAINT "EnterpriseJournalLine_organizationId_journalEntryId_fkey" FOREIGN KEY ("organizationId", "journalEntryId") REFERENCES "EnterpriseJournalEntry"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EnterpriseJournalLine" ADD CONSTRAINT "EnterpriseJournalLine_organizationId_ledgerAccountId_fkey" FOREIGN KEY ("organizationId", "ledgerAccountId") REFERENCES "EnterpriseLedgerAccount"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterpriseSalesInvoiceItem" ADD CONSTRAINT "EnterpriseSalesInvoiceItem_organizationId_salesInvoiceId_fkey" FOREIGN KEY ("organizationId", "salesInvoiceId") REFERENCES "EnterpriseSalesInvoice"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EnterpriseSalesCreditNote" ADD CONSTRAINT "EnterpriseSalesCreditNote_organizationId_salesInvoiceId_fkey" FOREIGN KEY ("organizationId", "salesInvoiceId") REFERENCES "EnterpriseSalesInvoice"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterpriseSalesCreditNoteItem" ADD CONSTRAINT "EnterpriseSalesCreditNoteItem_organizationId_salesCreditNo_fkey" FOREIGN KEY ("organizationId", "salesCreditNoteId") REFERENCES "EnterpriseSalesCreditNote"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EnterpriseReceivable" ADD CONSTRAINT "EnterpriseReceivable_organizationId_salesInvoiceId_fkey" FOREIGN KEY ("organizationId", "salesInvoiceId") REFERENCES "EnterpriseSalesInvoice"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterpriseReceivableAllocation" ADD CONSTRAINT "EnterpriseReceivableAllocation_organizationId_receivableId_fkey" FOREIGN KEY ("organizationId", "receivableId") REFERENCES "EnterpriseReceivable"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterpriseSupplierInvoiceItem" ADD CONSTRAINT "EnterpriseSupplierInvoiceItem_organizationId_supplierInvoi_fkey" FOREIGN KEY ("organizationId", "supplierInvoiceId") REFERENCES "EnterpriseSupplierInvoice"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EnterpriseSupplierCreditNote" ADD CONSTRAINT "EnterpriseSupplierCreditNote_organizationId_supplierInvoic_fkey" FOREIGN KEY ("organizationId", "supplierInvoiceId") REFERENCES "EnterpriseSupplierInvoice"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterprisePayable" ADD CONSTRAINT "EnterprisePayable_organizationId_supplierInvoiceId_fkey" FOREIGN KEY ("organizationId", "supplierInvoiceId") REFERENCES "EnterpriseSupplierInvoice"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterprisePayableAllocation" ADD CONSTRAINT "EnterprisePayableAllocation_organizationId_payableId_fkey" FOREIGN KEY ("organizationId", "payableId") REFERENCES "EnterprisePayable"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterpriseThreeWayMatch" ADD CONSTRAINT "EnterpriseThreeWayMatch_organizationId_supplierInvoiceId_fkey" FOREIGN KEY ("organizationId", "supplierInvoiceId") REFERENCES "EnterpriseSupplierInvoice"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterprisePaymentAllocation" ADD CONSTRAINT "EnterprisePaymentAllocation_organizationId_paymentId_fkey" FOREIGN KEY ("organizationId", "paymentId") REFERENCES "EnterprisePayment"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterprisePaymentAllocation" ADD CONSTRAINT "EnterprisePaymentAllocation_organizationId_receivableId_fkey" FOREIGN KEY ("organizationId", "receivableId") REFERENCES "EnterpriseReceivable"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterprisePaymentAllocation" ADD CONSTRAINT "EnterprisePaymentAllocation_organizationId_payableId_fkey" FOREIGN KEY ("organizationId", "payableId") REFERENCES "EnterprisePayable"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterprisePaymentEvent" ADD CONSTRAINT "EnterprisePaymentEvent_organizationId_paymentId_fkey" FOREIGN KEY ("organizationId", "paymentId") REFERENCES "EnterprisePayment"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EnterpriseFinancialAccount" ADD CONSTRAINT "EnterpriseFinancialAccount_organizationId_ledgerAccountId_fkey" FOREIGN KEY ("organizationId", "ledgerAccountId") REFERENCES "EnterpriseLedgerAccount"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterpriseTreasuryTransaction" ADD CONSTRAINT "EnterpriseTreasuryTransaction_organizationId_financialAcco_fkey" FOREIGN KEY ("organizationId", "financialAccountId") REFERENCES "EnterpriseFinancialAccount"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterpriseTreasuryTransaction" ADD CONSTRAINT "EnterpriseTreasuryTransaction_organizationId_paymentId_fkey" FOREIGN KEY ("organizationId", "paymentId") REFERENCES "EnterprisePayment"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterpriseCashSession" ADD CONSTRAINT "EnterpriseCashSession_organizationId_financialAccountId_fkey" FOREIGN KEY ("organizationId", "financialAccountId") REFERENCES "EnterpriseFinancialAccount"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterpriseCashMovement" ADD CONSTRAINT "EnterpriseCashMovement_organizationId_cashSessionId_fkey" FOREIGN KEY ("organizationId", "cashSessionId") REFERENCES "EnterpriseCashSession"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterpriseCashCount" ADD CONSTRAINT "EnterpriseCashCount_organizationId_cashSessionId_fkey" FOREIGN KEY ("organizationId", "cashSessionId") REFERENCES "EnterpriseCashSession"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EnterpriseCashDiscrepancy" ADD CONSTRAINT "EnterpriseCashDiscrepancy_organizationId_cashSessionId_fkey" FOREIGN KEY ("organizationId", "cashSessionId") REFERENCES "EnterpriseCashSession"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterpriseBankStatement" ADD CONSTRAINT "EnterpriseBankStatement_organizationId_financialAccountId_fkey" FOREIGN KEY ("organizationId", "financialAccountId") REFERENCES "EnterpriseFinancialAccount"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterpriseBankStatementLine" ADD CONSTRAINT "EnterpriseBankStatementLine_organizationId_bankStatementId_fkey" FOREIGN KEY ("organizationId", "bankStatementId") REFERENCES "EnterpriseBankStatement"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EnterpriseReconciliationSession" ADD CONSTRAINT "EnterpriseReconciliationSession_organizationId_financialAc_fkey" FOREIGN KEY ("organizationId", "financialAccountId") REFERENCES "EnterpriseFinancialAccount"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterpriseReconciliationMatch" ADD CONSTRAINT "EnterpriseReconciliationMatch_organizationId_reconciliatio_fkey" FOREIGN KEY ("organizationId", "reconciliationSessionId") REFERENCES "EnterpriseReconciliationSession"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EnterpriseTaxRate" ADD CONSTRAINT "EnterpriseTaxRate_organizationId_taxCodeId_fkey" FOREIGN KEY ("organizationId", "taxCodeId") REFERENCES "EnterpriseTaxCode"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterpriseTaxRule" ADD CONSTRAINT "EnterpriseTaxRule_organizationId_taxCodeId_fkey" FOREIGN KEY ("organizationId", "taxCodeId") REFERENCES "EnterpriseTaxCode"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterpriseAssetDepreciationSchedule" ADD CONSTRAINT "EnterpriseAssetDepreciationSchedule_organizationId_assetAc_fkey" FOREIGN KEY ("organizationId", "assetAccountingProfileId") REFERENCES "EnterpriseAssetAccountingProfile"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterpriseAssetDepreciationEntry" ADD CONSTRAINT "EnterpriseAssetDepreciationEntry_organizationId_depreciati_fkey" FOREIGN KEY ("organizationId", "depreciationScheduleId") REFERENCES "EnterpriseAssetDepreciationSchedule"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterpriseAssetDisposal" ADD CONSTRAINT "EnterpriseAssetDisposal_organizationId_assetAccountingProf_fkey" FOREIGN KEY ("organizationId", "assetAccountingProfileId") REFERENCES "EnterpriseAssetAccountingProfile"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterpriseAccountingDimensionValue" ADD CONSTRAINT "EnterpriseAccountingDimensionValue_organizationId_accounti_fkey" FOREIGN KEY ("organizationId", "accountingDimensionId") REFERENCES "EnterpriseAccountingDimension"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterpriseOpeningBalanceLine" ADD CONSTRAINT "EnterpriseOpeningBalanceLine_organizationId_openingBalance_fkey" FOREIGN KEY ("organizationId", "openingBalanceImportId") REFERENCES "EnterpriseOpeningBalanceImport"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
