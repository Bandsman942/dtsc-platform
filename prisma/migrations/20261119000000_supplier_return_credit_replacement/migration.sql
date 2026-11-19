-- Additive audit evidence; no existing credit, stock or journal is rewritten.
CREATE TABLE "EnterpriseSupplierReturnCreditReplacement" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "returnRequestId" TEXT NOT NULL,
  "supplierId" TEXT NOT NULL,
  "previousCreditNoteId" TEXT NOT NULL,
  "previousCreditRevision" INTEGER NOT NULL,
  "previousSupplierReference" TEXT NOT NULL,
  "replacementCreditNoteId" TEXT NOT NULL,
  "replacementSupplierReference" TEXT NOT NULL,
  "rejectionApprovalId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "replacedByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EnterpriseSupplierReturnCreditReplacement_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "supplier_credit_history_distinct_check" CHECK ("previousCreditNoteId" <> "replacementCreditNoteId" AND "previousSupplierReference" <> "replacementSupplierReference" AND "previousCreditRevision" > 0),
  CONSTRAINT "supplier_credit_history_return_fk" FOREIGN KEY ("organizationId","returnRequestId") REFERENCES "EnterpriseSupplierReturnRequest" ("organizationId","id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "supplier_credit_history_previous_fk" FOREIGN KEY ("organizationId","previousCreditNoteId") REFERENCES "EnterpriseSupplierCreditNote" ("organizationId","id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "supplier_credit_history_replacement_fk" FOREIGN KEY ("organizationId","replacementCreditNoteId") REFERENCES "EnterpriseSupplierCreditNote" ("organizationId","id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "supplier_return_replaced_credit_key" ON "EnterpriseSupplierReturnCreditReplacement" ("organizationId","previousCreditNoteId");
CREATE UNIQUE INDEX "supplier_return_replacement_credit_key" ON "EnterpriseSupplierReturnCreditReplacement" ("organizationId","replacementCreditNoteId");
CREATE UNIQUE INDEX "supplier_return_replaced_reference_key" ON "EnterpriseSupplierReturnCreditReplacement" ("organizationId","supplierId","previousSupplierReference");
CREATE INDEX "supplier_return_credit_history_idx" ON "EnterpriseSupplierReturnCreditReplacement" ("organizationId","returnRequestId","createdAt");
