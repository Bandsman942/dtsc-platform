-- Additive domain inverse for an ALREADY POSTED supplier claim offset.
-- Preserve the original posting and allocation; never rewrite prior migrations.
ALTER TABLE "EnterpriseSupplierClaimCompensation"
  ADD COLUMN "reversedAt" TIMESTAMP(3),
  ADD COLUMN "reversedByUserId" TEXT,
  ADD COLUMN "reversalReason" TEXT,
  ADD COLUMN "reversalJournalEntryId" TEXT;

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
  OR ("status" = 'REVERSED' AND "revision" = 5
    AND "approvedAt" IS NOT NULL AND "approvedByUserId" = "approverUserId"
    AND "postedAt" IS NOT NULL AND "postedByUserId" IS NOT NULL AND "postingJournalEntryId" IS NOT NULL
    AND "reversedAt" IS NOT NULL AND "reversedByUserId" IS NOT NULL
    AND "reversedByUserId" <> "requestedByUserId"
    AND "reversedByUserId" <> "approverUserId"
    AND "reversedByUserId" <> "postedByUserId"
    AND "reversalJournalEntryId" IS NOT NULL
    AND "reversalReason" IS NOT NULL AND length(trim("reversalReason")) >= 8)
);
ALTER TABLE "EnterpriseSupplierClaimCompensation" DROP CONSTRAINT "supplier_comp_no_ghost_decision";
ALTER TABLE "EnterpriseSupplierClaimCompensation" ADD CONSTRAINT "supplier_comp_no_ghost_decision" CHECK (
  ("status" IN ('DRAFT','PENDING_APPROVAL','APPROVED','POSTED','REVERSED','REJECTED','CANCELLED'))
  AND ("status" = 'CANCELLED' OR ("cancelledAt" IS NULL AND "cancelledByUserId" IS NULL AND "cancellationReason" IS NULL))
  AND ("status" IN ('APPROVED','POSTED','REVERSED') OR ("approvedAt" IS NULL AND "approvedByUserId" IS NULL))
  AND ("status" = 'REJECTED' OR ("rejectedAt" IS NULL AND "rejectedByUserId" IS NULL AND "rejectionReason" IS NULL))
  AND ("status" IN ('POSTED','REVERSED') OR ("postedAt" IS NULL AND "postedByUserId" IS NULL AND "postingJournalEntryId" IS NULL))
  AND ("status" = 'REVERSED' OR
    ("reversedAt" IS NULL AND "reversedByUserId" IS NULL
      AND "reversalReason" IS NULL AND "reversalJournalEntryId" IS NULL))
);
CREATE UNIQUE INDEX "supplier_comp_reversal_journal_key"
  ON "EnterpriseSupplierClaimCompensation" ("organizationId","reversalJournalEntryId");

-- The trigger permits exactly POSTED -> REVERSED, revision +1.
-- Its extra comparison also freezes all prior approval and posting evidence.
CREATE OR REPLACE FUNCTION protect_supplier_claim_compensation_draft() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT (
    (OLD."status" = 'DRAFT' AND NEW."status" IN ('CANCELLED','PENDING_APPROVAL'))
    OR (OLD."status" = 'PENDING_APPROVAL' AND NEW."status" IN ('APPROVED','REJECTED'))
    OR (OLD."status" = 'APPROVED' AND NEW."status" = 'POSTED')
    OR (OLD."status" = 'POSTED' AND NEW."status" = 'REVERSED')
  ) OR NEW."revision" <> OLD."revision" + 1
    OR (to_jsonb(NEW) - ARRAY['status','revision','submittedAt','approverUserId','approvedAt','approvedByUserId','rejectedAt','rejectedByUserId','rejectionReason','postedAt','postedByUserId','postingJournalEntryId','cancelledAt','cancelledByUserId','cancellationReason','reversedAt','reversedByUserId','reversalReason','reversalJournalEntryId','updatedAt'])
       IS DISTINCT FROM
       (to_jsonb(OLD) - ARRAY['status','revision','submittedAt','approverUserId','approvedAt','approvedByUserId','rejectedAt','rejectedByUserId','rejectionReason','postedAt','postedByUserId','postingJournalEntryId','cancelledAt','cancelledByUserId','cancellationReason','reversedAt','reversedByUserId','reversalReason','reversalJournalEntryId','updatedAt'])
    OR (OLD."status" = 'POSTED' AND NEW."status" = 'REVERSED'
      AND (to_jsonb(NEW) - ARRAY['status','revision','reversedAt','reversedByUserId','reversalReason','reversalJournalEntryId','updatedAt'])
        IS DISTINCT FROM
          (to_jsonb(OLD) - ARRAY['status','revision','reversedAt','reversedByUserId','reversalReason','reversalJournalEntryId','updatedAt']))
  THEN
    RAISE EXCEPTION 'supplier claim compensation intent is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
