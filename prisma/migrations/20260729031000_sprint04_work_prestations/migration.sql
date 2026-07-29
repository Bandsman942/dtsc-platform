-- Sprint 4 — DTSC real work prestations and independent operational validation
-- Expand-only migration. No payroll table or historical planning data is modified.

CREATE TABLE "DtscWorkSubmission" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "declaredMinutes" INTEGER NOT NULL DEFAULT 0,
    "validatedMinutes" INTEGER,
    "submittedAt" TIMESTAMP(3),
    "reviewerEmployeeId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewComment" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DtscWorkSubmission_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "DtscWorkSubmission_period_check" CHECK ("periodEnd" >= "periodStart"),
    CONSTRAINT "DtscWorkSubmission_minutes_check" CHECK ("declaredMinutes" >= 0 AND ("validatedMinutes" IS NULL OR "validatedMinutes" >= 0)),
    CONSTRAINT "DtscWorkSubmission_status_check" CHECK ("status" IN ('DRAFT', 'SUBMITTED', 'CHANGES_REQUESTED', 'APPROVED', 'REJECTED', 'CANCELLED'))
);

CREATE TABLE "DtscWorkEntry" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "workDate" TIMESTAMP(3) NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "breakMinutes" INTEGER NOT NULL DEFAULT 0,
    "workedMinutes" INTEGER NOT NULL,
    "locationMode" TEXT,
    "workType" TEXT NOT NULL DEFAULT 'NORMAL_WORK',
    "summary" TEXT NOT NULL,
    "details" TEXT,
    "sourceType" TEXT,
    "sourceId" TEXT,
    "submissionId" TEXT,
    "scheduleOutsideAvailability" BOOLEAN NOT NULL DEFAULT false,
    "scheduleBlockingCount" INTEGER NOT NULL DEFAULT 0,
    "scheduleWarningCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "DtscWorkEntry_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "DtscWorkEntry_minutes_check" CHECK ("breakMinutes" >= 0 AND "workedMinutes" > 0),
    CONSTRAINT "DtscWorkEntry_schedule_counts_check" CHECK ("scheduleBlockingCount" >= 0 AND "scheduleWarningCount" >= 0),
    CONSTRAINT "DtscWorkEntry_work_type_check" CHECK ("workType" IN ('NORMAL_WORK', 'MEETING', 'MISSION', 'PROJECT_WORK', 'SUPPORT', 'TRAINING', 'ADMINISTRATIVE', 'OTHER'))
);

CREATE TABLE "DtscWorkSubmissionReview" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "actorEmployeeId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DtscWorkSubmissionReview_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "DtscWorkSubmissionReview_action_check" CHECK ("action" IN ('SUBMITTED', 'RESUBMITTED', 'APPROVED', 'CHANGES_REQUESTED', 'REJECTED'))
);

CREATE UNIQUE INDEX "DtscWorkSubmission_employeeId_periodStart_periodEnd_key"
ON "DtscWorkSubmission"("employeeId", "periodStart", "periodEnd");

CREATE INDEX "DtscWorkSubmission_status_periodStart_idx"
ON "DtscWorkSubmission"("status", "periodStart");

CREATE INDEX "DtscWorkSubmission_reviewerEmployeeId_status_idx"
ON "DtscWorkSubmission"("reviewerEmployeeId", "status");

CREATE INDEX "DtscWorkSubmission_employeeId_periodStart_idx"
ON "DtscWorkSubmission"("employeeId", "periodStart");

CREATE INDEX "DtscWorkEntry_employeeId_workDate_deletedAt_idx"
ON "DtscWorkEntry"("employeeId", "workDate", "deletedAt");

CREATE INDEX "DtscWorkEntry_submissionId_deletedAt_idx"
ON "DtscWorkEntry"("submissionId", "deletedAt");

CREATE INDEX "DtscWorkEntry_sourceType_sourceId_idx"
ON "DtscWorkEntry"("sourceType", "sourceId");

CREATE INDEX "DtscWorkSubmissionReview_submissionId_createdAt_idx"
ON "DtscWorkSubmissionReview"("submissionId", "createdAt");

CREATE INDEX "DtscWorkSubmissionReview_actorEmployeeId_createdAt_idx"
ON "DtscWorkSubmissionReview"("actorEmployeeId", "createdAt");

ALTER TABLE "DtscWorkSubmission"
ADD CONSTRAINT "DtscWorkSubmission_employeeId_fkey"
FOREIGN KEY ("employeeId") REFERENCES "HrcfoEmployee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DtscWorkSubmission"
ADD CONSTRAINT "DtscWorkSubmission_reviewerEmployeeId_fkey"
FOREIGN KEY ("reviewerEmployeeId") REFERENCES "HrcfoEmployee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "DtscWorkEntry"
ADD CONSTRAINT "DtscWorkEntry_employeeId_fkey"
FOREIGN KEY ("employeeId") REFERENCES "HrcfoEmployee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DtscWorkEntry"
ADD CONSTRAINT "DtscWorkEntry_submissionId_fkey"
FOREIGN KEY ("submissionId") REFERENCES "DtscWorkSubmission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DtscWorkSubmissionReview"
ADD CONSTRAINT "DtscWorkSubmissionReview_submissionId_fkey"
FOREIGN KEY ("submissionId") REFERENCES "DtscWorkSubmission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DtscWorkSubmissionReview"
ADD CONSTRAINT "DtscWorkSubmissionReview_actorEmployeeId_fkey"
FOREIGN KEY ("actorEmployeeId") REFERENCES "HrcfoEmployee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
