-- Forward-only state extension: preserve immutable drafts and existing
-- DRAFT -> CANCELLED history. No settlement, no payment, no journal.
ALTER TABLE "EnterpriseSupplierClaimCompensation"
  ADD COLUMN "submittedAt" TIMESTAMP(3),
  ADD COLUMN "approverUserId" TEXT,
  ADD COLUMN "approvedAt" TIMESTAMP(3),
  ADD COLUMN "approvedByUserId" TEXT,
  ADD COLUMN "rejectedAt" TIMESTAMP(3),
  ADD COLUMN "rejectedByUserId" TEXT,
  ADD COLUMN "rejectionReason" TEXT,
  ADD COLUMN "postedAt" TIMESTAMP(3),
  ADD COLUMN "postedByUserId" TEXT,
  ADD COLUMN "postingJournalEntryId" TEXT;
ALTER TABLE "EnterpriseSupplierClaimCompensation" DROP CONSTRAINT "supplier_comp_state_check";
ALTER TABLE "EnterpriseSupplierClaimCompensation" ADD CONSTRAINT "supplier_comp_state_check" CHECK (
  ("status" = 'DRAFT' AND "revision" = 1 AND "submittedAt" IS NULL AND "approverUserId" IS NULL)
  OR ("status" = 'CANCELLED' AND "revision" = 2 AND "submittedAt" IS NULL
    AND "cancelledAt" IS NOT NULL AND "cancelledByUserId" = "requestedByUserId"
    AND "cancellationReason" IS NOT NULL AND length(trim("cancellationReason")) >= 8)
  OR ("status" = 'PENDING_APPROVAL' AND "revision" = 2
    AND "submittedAt" IS NOT NULL AND "approverUserId" IS NOT NULL AND "approverUserId" <> "requestedByUserId"
    AND "approvedAt" IS NULL AND "postedAt" IS NULL)
  OR ("status" = 'APPROVED' AND "revision" = 3 AND "approvedAt" IS NOT NULL AND "approvedByUserId" = "approverUserId" AND "postedAt" IS NULL)
  OR ("status" = 'REJECTED' AND "revision" = 3 AND "rejectedAt" IS NOT NULL AND "rejectedByUserId" = "approverUserId" AND length(trim("rejectionReason")) >= 8)
  OR ("status" = 'POSTED' AND "revision" = 4 AND "approvedAt" IS NOT NULL AND "approvedByUserId" = "approverUserId"
    AND "postedAt" IS NOT NULL AND "postedByUserId" IS NOT NULL AND "postingJournalEntryId" IS NOT NULL)
);
ALTER TABLE "EnterpriseSupplierClaimCompensation" DROP CONSTRAINT IF EXISTS "supplier_comp_no_ghost_decision";
ALTER TABLE "EnterpriseSupplierClaimCompensation" ADD CONSTRAINT "supplier_comp_no_ghost_decision" CHECK (
  ("status" IN ('DRAFT','PENDING_APPROVAL','APPROVED','POSTED','REJECTED','CANCELLED'))
  AND ("status" = 'CANCELLED' OR ("cancelledAt" IS NULL AND "cancelledByUserId" IS NULL AND "cancellationReason" IS NULL))
  AND ("status" IN ('APPROVED','POSTED') OR ("approvedAt" IS NULL AND "approvedByUserId" IS NULL))
  AND ("status" = 'REJECTED' OR ("rejectedAt" IS NULL AND "rejectedByUserId" IS NULL AND "rejectionReason" IS NULL))
  AND ("status" = 'POSTED' OR ("postedAt" IS NULL AND "postedByUserId" IS NULL AND "postingJournalEntryId" IS NULL))
);
CREATE UNIQUE INDEX "supplier_comp_posting_journal_key" ON "EnterpriseSupplierClaimCompensation" ("organizationId","postingJournalEntryId");
CREATE INDEX "supplier_comp_target_active_idx" ON "EnterpriseSupplierClaimCompensation" ("organizationId","payableId","status");
CREATE INDEX "supplier_comp_source_active_idx" ON "EnterpriseSupplierClaimCompensation" ("organizationId","claimId","status");
CREATE OR REPLACE FUNCTION protect_supplier_claim_compensation_draft() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT (
    (OLD."status" = 'DRAFT' AND NEW."status" IN ('CANCELLED','PENDING_APPROVAL'))
    OR (OLD."status" = 'PENDING_APPROVAL' AND NEW."status" IN ('APPROVED','REJECTED'))
    OR (OLD."status" = 'APPROVED' AND NEW."status" = 'POSTED')
  ) OR NEW."revision" <> OLD."revision" + 1
    OR (to_jsonb(NEW) - ARRAY['status','revision','submittedAt','approverUserId','approvedAt','approvedByUserId','rejectedAt','rejectedByUserId','rejectionReason','postedAt','postedByUserId','postingJournalEntryId','cancelledAt','cancelledByUserId','cancellationReason','updatedAt'])
       IS DISTINCT FROM
       (to_jsonb(OLD) - ARRAY['status','revision','submittedAt','approverUserId','approvedAt','approvedByUserId','rejectedAt','rejectedByUserId','rejectionReason','postedAt','postedByUserId','postingJournalEntryId','cancelledAt','cancelledByUserId','cancellationReason','updatedAt'])
  THEN
    RAISE EXCEPTION 'supplier claim compensation intent is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
