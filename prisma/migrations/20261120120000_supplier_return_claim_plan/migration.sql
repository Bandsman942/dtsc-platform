-- Additive, no inference or backfill for historic supplier returns.
ALTER TABLE "EnterpriseSupplierReturnRequest"
  ADD COLUMN "settlementPayableAmount" DECIMAL(20,6),
  ADD COLUMN "settlementClaimAmount" DECIMAL(20,6),
  ADD COLUMN "settlementClaimAccountId" TEXT;
ALTER TABLE "EnterpriseSupplierReturnRequest"
  ADD CONSTRAINT "supplier_return_claim_plan_check" CHECK (
    ("settlementPayableAmount" IS NULL AND "settlementClaimAmount" IS NULL AND "settlementClaimAccountId" IS NULL)
    OR ("settlementPayableAmount" IS NOT NULL AND "settlementPayableAmount" >= 0
        AND "settlementClaimAmount" IS NOT NULL AND "settlementClaimAmount" > 0
        AND "settlementClaimAccountId" IS NOT NULL
        AND "settlementPayableAmount" + "settlementClaimAmount" = "totalCost" + "recoverableTaxAmount")
  ),
  ADD CONSTRAINT "supplier_return_claim_account_fk"
    FOREIGN KEY ("organizationId","settlementClaimAccountId") REFERENCES "EnterpriseLedgerAccount" ("organizationId","id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE FUNCTION protect_supplier_return_claim_plan() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."settlementPayableAmount" IS DISTINCT FROM OLD."settlementPayableAmount"
     OR NEW."settlementClaimAmount" IS DISTINCT FROM OLD."settlementClaimAmount"
     OR NEW."settlementClaimAccountId" IS DISTINCT FROM OLD."settlementClaimAccountId" THEN
    RAISE EXCEPTION 'supplier return reviewed claim plan is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "supplier_return_claim_plan_immutable" BEFORE UPDATE ON "EnterpriseSupplierReturnRequest"
FOR EACH ROW EXECUTE FUNCTION protect_supplier_return_claim_plan();
