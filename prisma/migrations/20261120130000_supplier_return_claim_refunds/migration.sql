-- Link the canonical payment to the recognized supplier-return claim.
-- No second payment, treasury balance, or claim balance is persisted.
ALTER TABLE "EnterprisePayment" ADD COLUMN "supplierReturnClaimId" TEXT;
ALTER TABLE "EnterprisePayment"
  ADD CONSTRAINT "supplier_claim_refund_fk"
    FOREIGN KEY ("organizationId","supplierReturnClaimId")
    REFERENCES "EnterpriseSupplierReturnRequest" ("organizationId","id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "supplier_claim_refund_contract_check" CHECK (
    ("paymentType" <> 'SUPPLIER_RETURN_REFUND' AND "supplierReturnClaimId" IS NULL)
    OR ("paymentType" = 'SUPPLIER_RETURN_REFUND' AND "supplierReturnClaimId" IS NOT NULL
        AND "direction" = 'INBOUND' AND "methodType" = 'BANK_TRANSFER'
        AND "financialAccountId" IS NOT NULL AND "businessPartyId" IS NOT NULL
        AND "amount" > 0 AND "unallocatedAmount" = 0 AND "reference" IS NOT NULL
        AND length(trim("reference")) > 0 AND "idempotencyKey" IS NOT NULL)
  );
CREATE INDEX "supplier_claim_refund_status_idx" ON "EnterprisePayment" ("organizationId","supplierReturnClaimId","status");
CREATE UNIQUE INDEX "supplier_claim_refund_bank_reference_key"
  ON "EnterprisePayment" ("organizationId","financialAccountId","reference")
  WHERE "paymentType" = 'SUPPLIER_RETURN_REFUND' AND "status" <> 'CANCELLED';
-- The claim identity and financial intent cannot be changed after preparation.
CREATE FUNCTION protect_supplier_claim_refund() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."paymentType" = 'SUPPLIER_RETURN_REFUND' OR NEW."paymentType" = 'SUPPLIER_RETURN_REFUND' THEN
    IF NEW."paymentType" IS DISTINCT FROM OLD."paymentType" OR
       NEW."supplierReturnClaimId" IS DISTINCT FROM OLD."supplierReturnClaimId" OR
       NEW."amount" IS DISTINCT FROM OLD."amount" OR
       NEW."currencyCode" IS DISTINCT FROM OLD."currencyCode" OR
       NEW."businessPartyId" IS DISTINCT FROM OLD."businessPartyId" OR
       NEW."financialAccountId" IS DISTINCT FROM OLD."financialAccountId" OR
       NEW."paymentDate" IS DISTINCT FROM OLD."paymentDate" OR
       NEW."reference" IS DISTINCT FROM OLD."reference" OR
       NEW."idempotencyKey" IS DISTINCT FROM OLD."idempotencyKey" THEN
      RAISE EXCEPTION 'supplier claim refund intent is immutable' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "supplier_claim_refund_immutable" BEFORE UPDATE ON "EnterprisePayment"
FOR EACH ROW EXECUTE FUNCTION protect_supplier_claim_refund();
