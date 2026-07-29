-- Sprint 5: expand the existing payroll model without rewriting legacy payroll history.
ALTER TABLE "HrcfoPayroll"
  ADD COLUMN "workflowVersion" INTEGER,
  ADD COLUMN "baseAmountSource" TEXT,
  ADD COLUMN "baseAmountOverride" DECIMAL(12,2),
  ADD COLUMN "baseAmountOverrideReason" TEXT,
  ADD COLUMN "bonusReason" TEXT,
  ADD COLUMN "deductionReason" TEXT,
  ADD COLUMN "workCoverage" TEXT,
  ADD COLUMN "workCoverageExceptionReason" TEXT,
  ADD COLUMN "approvedWorkMinutes" INTEGER,
  ADD COLUMN "approvedWorkEntryCount" INTEGER,
  ADD COLUMN "approvedSubmissionCount" INTEGER,
  ADD COLUMN "workEvidenceCapturedAt" TIMESTAMP(3),
  ADD COLUMN "preparedByEmployeeId" TEXT,
  ADD COLUMN "requiredApproverCode" TEXT,
  ADD COLUMN "approverEmployeeId" TEXT,
  ADD COLUMN "submittedAt" TIMESTAMP(3),
  ADD COLUMN "approvedAt" TIMESTAMP(3),
  ADD COLUMN "rejectedAt" TIMESTAMP(3),
  ADD COLUMN "paidAt" TIMESTAMP(3),
  ADD COLUMN "reviewComment" TEXT,
  ADD COLUMN "adjustmentEvidenceUrl" TEXT,
  ADD COLUMN "paymentReference" TEXT,
  ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "HrcfoPayrollWorkEntry" (
  "id" TEXT NOT NULL,
  "payrollId" TEXT NOT NULL,
  "workEntryId" TEXT NOT NULL,
  "workSubmissionId" TEXT NOT NULL,
  "approvedMinutes" INTEGER NOT NULL,
  "releasedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HrcfoPayrollWorkEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HrcfoPayrollReview" (
  "id" TEXT NOT NULL,
  "payrollId" TEXT NOT NULL,
  "actorEmployeeId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "comment" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HrcfoPayrollReview_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "HrcfoPayrollWorkEntry_payrollId_workEntryId_key"
  ON "HrcfoPayrollWorkEntry"("payrollId", "workEntryId");
CREATE UNIQUE INDEX "HrcfoPayrollWorkEntry_active_workEntry_key"
  ON "HrcfoPayrollWorkEntry"("workEntryId") WHERE "releasedAt" IS NULL;
CREATE INDEX "HrcfoPayrollWorkEntry_payrollId_releasedAt_idx"
  ON "HrcfoPayrollWorkEntry"("payrollId", "releasedAt");
CREATE INDEX "HrcfoPayrollWorkEntry_workSubmissionId_idx"
  ON "HrcfoPayrollWorkEntry"("workSubmissionId");
CREATE INDEX "HrcfoPayrollReview_payrollId_createdAt_idx"
  ON "HrcfoPayrollReview"("payrollId", "createdAt");
CREATE INDEX "HrcfoPayrollReview_actorEmployeeId_createdAt_idx"
  ON "HrcfoPayrollReview"("actorEmployeeId", "createdAt");
CREATE INDEX "HrcfoPayroll_workflowVersion_status_idx"
  ON "HrcfoPayroll"("workflowVersion", "status", "periodStart");
CREATE INDEX "HrcfoPayroll_requiredApproverCode_status_idx"
  ON "HrcfoPayroll"("requiredApproverCode", "status");
CREATE INDEX "HrcfoPayroll_preparedByEmployeeId_idx"
  ON "HrcfoPayroll"("preparedByEmployeeId");
CREATE INDEX "HrcfoPayroll_approverEmployeeId_idx"
  ON "HrcfoPayroll"("approverEmployeeId");

-- New Sprint 5 transactions use a dedicated source type. This avoids reinterpreting
-- historical PAYROLL transactions while making new approvals idempotent at DB level.
CREATE UNIQUE INDEX "HrcfoExpense_payroll_workflow_source_key"
  ON "HrcfoExpense"("sourceId")
  WHERE "sourceType" = 'PAYROLL_WORKFLOW' AND "sourceId" IS NOT NULL;

ALTER TABLE "HrcfoPayroll"
  ADD CONSTRAINT "HrcfoPayroll_preparedByEmployeeId_fkey"
  FOREIGN KEY ("preparedByEmployeeId") REFERENCES "HrcfoEmployee"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "HrcfoPayroll_approverEmployeeId_fkey"
  FOREIGN KEY ("approverEmployeeId") REFERENCES "HrcfoEmployee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "HrcfoPayrollWorkEntry"
  ADD CONSTRAINT "HrcfoPayrollWorkEntry_payrollId_fkey"
  FOREIGN KEY ("payrollId") REFERENCES "HrcfoPayroll"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "HrcfoPayrollWorkEntry_workEntryId_fkey"
  FOREIGN KEY ("workEntryId") REFERENCES "DtscWorkEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "HrcfoPayrollWorkEntry_workSubmissionId_fkey"
  FOREIGN KEY ("workSubmissionId") REFERENCES "DtscWorkSubmission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "HrcfoPayrollReview"
  ADD CONSTRAINT "HrcfoPayrollReview_payrollId_fkey"
  FOREIGN KEY ("payrollId") REFERENCES "HrcfoPayroll"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "HrcfoPayrollReview_actorEmployeeId_fkey"
  FOREIGN KEY ("actorEmployeeId") REFERENCES "HrcfoEmployee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "HrcfoPayroll"
  ADD CONSTRAINT "HrcfoPayroll_sprint5_status_check" CHECK (
    "workflowVersion" IS DISTINCT FROM 1 OR "status" IN ('DRAFT','PENDING_APPROVAL','CHANGES_REQUESTED','VALIDATED','REJECTED','PAID','CANCELLED')
  ),
  ADD CONSTRAINT "HrcfoPayroll_sprint5_no_self_approval_check" CHECK (
    "workflowVersion" IS DISTINCT FROM 1 OR "approverEmployeeId" IS NULL OR "approverEmployeeId" <> "employeeId"
  ),
  ADD CONSTRAINT "HrcfoPayroll_sprint5_bonus_reason_check" CHECK (
    "workflowVersion" IS DISTINCT FROM 1 OR "bonusAmount" <= 0 OR NULLIF(BTRIM("bonusReason"), '') IS NOT NULL
  ),
  ADD CONSTRAINT "HrcfoPayroll_sprint5_deduction_reason_check" CHECK (
    "workflowVersion" IS DISTINCT FROM 1 OR "deductionAmount" <= 0 OR NULLIF(BTRIM("deductionReason"), '') IS NOT NULL
  ),
  ADD CONSTRAINT "HrcfoPayroll_sprint5_coverage_check" CHECK (
    "workflowVersion" IS DISTINCT FROM 1 OR "workCoverage" IN ('COMPLETE','PARTIAL','NONE')
  ),
  ADD CONSTRAINT "HrcfoPayroll_sprint5_evidence_nonnegative_check" CHECK (
    "workflowVersion" IS DISTINCT FROM 1 OR (
      COALESCE("approvedWorkMinutes", 0) >= 0 AND
      COALESCE("approvedWorkEntryCount", 0) >= 0 AND
      COALESCE("approvedSubmissionCount", 0) >= 0
    )
  );

ALTER TABLE "HrcfoPayrollWorkEntry"
  ADD CONSTRAINT "HrcfoPayrollWorkEntry_approvedMinutes_check" CHECK ("approvedMinutes" >= 0);

CREATE OR REPLACE FUNCTION guard_dtsc_payroll_workflow()
RETURNS trigger AS $$
BEGIN
  IF OLD."workflowVersion" = 1 THEN
    IF OLD."status" = 'DRAFT' AND NEW."status" NOT IN ('DRAFT','PENDING_APPROVAL','CANCELLED') THEN
      RAISE EXCEPTION 'Invalid payroll transition from DRAFT to %', NEW."status";
    ELSIF OLD."status" = 'CHANGES_REQUESTED' AND NEW."status" NOT IN ('CHANGES_REQUESTED','PENDING_APPROVAL') THEN
      RAISE EXCEPTION 'Invalid payroll transition from CHANGES_REQUESTED to %', NEW."status";
    ELSIF OLD."status" = 'PENDING_APPROVAL' AND NEW."status" NOT IN ('PENDING_APPROVAL','VALIDATED','CHANGES_REQUESTED','REJECTED') THEN
      RAISE EXCEPTION 'Invalid payroll transition from PENDING_APPROVAL to %', NEW."status";
    ELSIF OLD."status" = 'VALIDATED' AND NEW."status" NOT IN ('VALIDATED','PAID') THEN
      RAISE EXCEPTION 'Invalid payroll transition from VALIDATED to %', NEW."status";
    ELSIF OLD."status" IN ('PAID','REJECTED','CANCELLED') AND NEW."status" <> OLD."status" THEN
      RAISE EXCEPTION 'Payroll status % is terminal', OLD."status";
    END IF;

    IF OLD."status" IN ('VALIDATED','PAID','REJECTED','CANCELLED') AND (
      NEW."employeeId" IS DISTINCT FROM OLD."employeeId" OR
      NEW."periodStart" IS DISTINCT FROM OLD."periodStart" OR
      NEW."periodEnd" IS DISTINCT FROM OLD."periodEnd" OR
      NEW."grossAmount" IS DISTINCT FROM OLD."grossAmount" OR
      NEW."bonusAmount" IS DISTINCT FROM OLD."bonusAmount" OR
      NEW."deductionAmount" IS DISTINCT FROM OLD."deductionAmount" OR
      NEW."netAmount" IS DISTINCT FROM OLD."netAmount" OR
      NEW."budgetId" IS DISTINCT FROM OLD."budgetId" OR
      NEW."accountId" IS DISTINCT FROM OLD."accountId" OR
      NEW."baseAmountOverride" IS DISTINCT FROM OLD."baseAmountOverride" OR
      NEW."baseAmountOverrideReason" IS DISTINCT FROM OLD."baseAmountOverrideReason" OR
      NEW."bonusReason" IS DISTINCT FROM OLD."bonusReason" OR
      NEW."deductionReason" IS DISTINCT FROM OLD."deductionReason" OR
      NEW."workCoverage" IS DISTINCT FROM OLD."workCoverage" OR
      NEW."workCoverageExceptionReason" IS DISTINCT FROM OLD."workCoverageExceptionReason" OR
      NEW."approvedWorkMinutes" IS DISTINCT FROM OLD."approvedWorkMinutes" OR
      NEW."approvedWorkEntryCount" IS DISTINCT FROM OLD."approvedWorkEntryCount" OR
      NEW."approvedSubmissionCount" IS DISTINCT FROM OLD."approvedSubmissionCount"
    ) THEN
      RAISE EXCEPTION 'Validated or terminal payroll financial evidence is immutable';
    END IF;

    IF NEW."status" = 'PENDING_APPROVAL' AND (NEW."submittedAt" IS NULL OR NEW."requiredApproverCode" NOT IN ('CEO','COO')) THEN
      RAISE EXCEPTION 'Pending payroll requires submission metadata and approver policy';
    END IF;
    IF NEW."status" IN ('PENDING_APPROVAL','VALIDATED','PAID') AND NEW."workCoverage" <> 'COMPLETE' AND NULLIF(BTRIM(NEW."workCoverageExceptionReason"), '') IS NULL THEN
      RAISE EXCEPTION 'Incomplete payroll work coverage requires an explicit reason';
    END IF;
    IF NEW."status" IN ('VALIDATED','PAID') AND (NEW."approverEmployeeId" IS NULL OR NEW."approvedAt" IS NULL OR NEW."transactionId" IS NULL) THEN
      RAISE EXCEPTION 'Validated payroll requires independent approval and one financial transaction';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "HrcfoPayroll_sprint5_workflow_guard"
BEFORE UPDATE ON "HrcfoPayroll"
FOR EACH ROW EXECUTE FUNCTION guard_dtsc_payroll_workflow();
