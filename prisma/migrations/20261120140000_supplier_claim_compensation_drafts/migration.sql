-- Frozen non-cash compensation intent only: no settlement, reservation,
-- payment, treasury or accounting journal is produced by preparing a draft.
CREATE TABLE "EnterpriseSupplierClaimCompensation" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "claimId" TEXT NOT NULL,
  "payableId" TEXT NOT NULL,
  "currencyCode" TEXT NOT NULL,
  "amount" DECIMAL(20,6) NOT NULL,
  "accountingDate" TIMESTAMP(3) NOT NULL,
  "supplierReference" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "sourceCreditJournalId" TEXT NOT NULL,
  "targetInvoiceJournalId" TEXT NOT NULL,
  "claimAccountId" TEXT NOT NULL,
  "payableAccountId" TEXT NOT NULL,
  "requestedByUserId" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "revision" INTEGER NOT NULL DEFAULT 1,
  "cancelledAt" TIMESTAMP(3),
  "cancelledByUserId" TEXT,
  "cancellationReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EnterpriseSupplierClaimCompensation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "supplier_comp_claim_fk" FOREIGN KEY ("organizationId","claimId")
    REFERENCES "EnterpriseSupplierReturnRequest" ("organizationId","id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "supplier_comp_payable_fk" FOREIGN KEY ("organizationId","payableId")
    REFERENCES "EnterprisePayable" ("organizationId","id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "supplier_comp_intent_check" CHECK (
    "amount" > 0 AND "currencyCode" ~ '^[A-Z]{3}$'
    AND "accountingDate" = date_trunc('day',"accountingDate")
    AND "claimAccountId" <> "payableAccountId"
    AND "sourceCreditJournalId" <> "targetInvoiceJournalId"
    AND length(trim("supplierReference")) > 0 AND length(trim("reason")) >= 8
    AND length(trim("idempotencyKey")) > 0
  ),
  CONSTRAINT "supplier_comp_state_check" CHECK (
    ("status" = 'DRAFT' AND "revision" = 1 AND "cancelledAt" IS NULL
      AND "cancelledByUserId" IS NULL AND "cancellationReason" IS NULL)
    OR ("status" = 'CANCELLED' AND "revision" = 2 AND "cancelledAt" IS NOT NULL
      AND "cancelledByUserId" IS NOT NULL AND "cancelledByUserId" = "requestedByUserId"
      AND "cancellationReason" IS NOT NULL AND length(trim("cancellationReason")) >= 8)
  )
);
CREATE UNIQUE INDEX "supplier_comp_org_id_key" ON "EnterpriseSupplierClaimCompensation" ("organizationId","id");
CREATE UNIQUE INDEX "supplier_comp_idempotency_key" ON "EnterpriseSupplierClaimCompensation" ("organizationId","idempotencyKey");
CREATE INDEX "supplier_comp_claim_status_idx" ON "EnterpriseSupplierClaimCompensation" ("organizationId","claimId","status");
CREATE INDEX "supplier_comp_payable_status_idx" ON "EnterpriseSupplierClaimCompensation" ("organizationId","payableId","status");

CREATE FUNCTION protect_supplier_claim_compensation_draft() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."status" <> 'DRAFT' OR NEW."status" <> 'CANCELLED' OR NEW."revision" <> OLD."revision" + 1
    OR (to_jsonb(NEW) - ARRAY['status','revision','cancelledAt','cancelledByUserId','cancellationReason','updatedAt'])
        IS DISTINCT FROM
       (to_jsonb(OLD) - ARRAY['status','revision','cancelledAt','cancelledByUserId','cancellationReason','updatedAt'])
  THEN
    RAISE EXCEPTION 'supplier claim compensation draft intent is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "supplier_comp_draft_immutable" BEFORE UPDATE ON "EnterpriseSupplierClaimCompensation"
FOR EACH ROW EXECUTE FUNCTION protect_supplier_claim_compensation_draft();
