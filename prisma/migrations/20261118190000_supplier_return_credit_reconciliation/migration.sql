-- Additive evidence only. Preserve former approval and dispatch states and all journals.
ALTER TABLE "EnterpriseSupplierReturnRequest"
  ADD COLUMN "supplierCreditNoteId" TEXT,
  ADD COLUMN "supplierCreditReference" TEXT,
  ADD COLUMN "reconciledAt" TIMESTAMP(3),
  ADD COLUMN "reconciledByUserId" TEXT,
  ADD COLUMN "creditJournalEntryId" TEXT;
ALTER TABLE "EnterpriseSupplierReturnRequest" DROP CONSTRAINT "supplier_return_status_check";
ALTER TABLE "EnterpriseSupplierReturnRequest" ADD CONSTRAINT "supplier_return_status_check"
  CHECK ("status" IN ('PENDING_APPROVAL','APPROVED','REJECTED','CANCELLED','DISPATCHED','RECONCILED'));
ALTER TABLE "EnterpriseSupplierReturnRequest" DROP CONSTRAINT "supplier_return_dispatch_evidence_check";
ALTER TABLE "EnterpriseSupplierReturnRequest" ADD CONSTRAINT "supplier_return_dispatch_evidence_check"
  CHECK (("status" IN ('DISPATCHED','RECONCILED') AND "dispatchedAt" IS NOT NULL AND "dispatchedByUserId" IS NOT NULL AND "dispatchReference" IS NOT NULL AND "dispatchMovementId" IS NOT NULL AND "dispatchAccountingEventId" IS NOT NULL)
  OR ("status" NOT IN ('DISPATCHED','RECONCILED') AND "dispatchedAt" IS NULL AND "dispatchedByUserId" IS NULL AND "dispatchReference" IS NULL AND "dispatchMovementId" IS NULL AND "dispatchAccountingEventId" IS NULL));
ALTER TABLE "EnterpriseSupplierReturnRequest" ADD CONSTRAINT "supplier_return_credit_pair_check"
  CHECK (("supplierCreditNoteId" IS NULL AND "supplierCreditReference" IS NULL) OR
         ("supplierCreditNoteId" IS NOT NULL AND "supplierCreditReference" IS NOT NULL AND "status" IN ('DISPATCHED','RECONCILED')));
ALTER TABLE "EnterpriseSupplierReturnRequest" ADD CONSTRAINT "supplier_return_reconciled_evidence_check"
  CHECK (("status" = 'RECONCILED' AND "supplierCreditNoteId" IS NOT NULL AND "reconciledAt" IS NOT NULL AND "reconciledByUserId" IS NOT NULL AND "creditJournalEntryId" IS NOT NULL)
  OR ("status" <> 'RECONCILED' AND "reconciledAt" IS NULL AND "reconciledByUserId" IS NULL AND "creditJournalEntryId" IS NULL));
CREATE UNIQUE INDEX "supplier_return_credit_note_key" ON "EnterpriseSupplierReturnRequest" ("organizationId","supplierCreditNoteId");
CREATE UNIQUE INDEX "supplier_return_supplier_credit_reference_key" ON "EnterpriseSupplierReturnRequest" ("organizationId","supplierId","supplierCreditReference");
CREATE UNIQUE INDEX "supplier_return_credit_journal_key" ON "EnterpriseSupplierReturnRequest" ("organizationId","creditJournalEntryId");
-- This restricted first workflow supports one return for an invoice, including
-- after reconciliation. Rejected/cancelled proposals do not count.
DROP INDEX "supplier_return_one_live_invoice_idx";
CREATE UNIQUE INDEX "supplier_return_one_live_invoice_idx" ON "EnterpriseSupplierReturnRequest" ("organizationId","supplierInvoiceId") WHERE "status" IN ('PENDING_APPROVAL','APPROVED','DISPATCHED','RECONCILED');
