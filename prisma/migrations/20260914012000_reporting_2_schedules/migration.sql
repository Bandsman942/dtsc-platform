-- Reporting 2.0: additive persistence for recurring report schedules and delivery history.
CREATE TABLE "EnterpriseReportSchedule" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "reportType" TEXT NOT NULL,
    "reportTitle" TEXT NOT NULL,
    "reportDescription" TEXT,
    "frequency" TEXT NOT NULL,
    "timeZone" TEXT NOT NULL DEFAULT 'UTC',
    "hour" INTEGER NOT NULL,
    "minute" INTEGER NOT NULL DEFAULT 0,
    "dayOfWeek" INTEGER,
    "dayOfMonth" INTEGER,
    "filtersJson" JSONB,
    "deliveryChannelsJson" JSONB NOT NULL,
    "recipientEmailsJson" JSONB,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "nextRunAt" TIMESTAMP(3) NOT NULL,
    "lastEnqueuedAt" TIMESTAMP(3),
    "lastCompletedAt" TIMESTAMP(3),
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),
    CONSTRAINT "EnterpriseReportSchedule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseReportScheduleRun" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "generationEventId" TEXT,
    "reportId" TEXT,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "deliveryStatus" TEXT NOT NULL DEFAULT 'ARCHIVE_PENDING',
    "errorCode" TEXT,
    "enqueuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EnterpriseReportScheduleRun_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EnterpriseReportSchedule_organizationId_id_key" ON "EnterpriseReportSchedule"("organizationId", "id");
CREATE INDEX "EnterpriseReportSchedule_organizationId_isEnabled_nextRunAt_idx" ON "EnterpriseReportSchedule"("organizationId", "isEnabled", "nextRunAt");
CREATE INDEX "EnterpriseReportSchedule_organizationId_reportType_archivedAt_idx" ON "EnterpriseReportSchedule"("organizationId", "reportType", "archivedAt");
CREATE INDEX "EnterpriseReportSchedule_organizationId_createdByUserId_archivedAt_idx" ON "EnterpriseReportSchedule"("organizationId", "createdByUserId", "archivedAt");

CREATE UNIQUE INDEX "EnterpriseReportScheduleRun_organizationId_scheduleId_dueAt_key" ON "EnterpriseReportScheduleRun"("organizationId", "scheduleId", "dueAt");
CREATE INDEX "EnterpriseReportScheduleRun_organizationId_scheduleId_status_idx" ON "EnterpriseReportScheduleRun"("organizationId", "scheduleId", "status");
CREATE INDEX "EnterpriseReportScheduleRun_organizationId_generationEventId_idx" ON "EnterpriseReportScheduleRun"("organizationId", "generationEventId");
CREATE INDEX "EnterpriseReportScheduleRun_organizationId_reportId_idx" ON "EnterpriseReportScheduleRun"("organizationId", "reportId");
CREATE INDEX "EnterpriseReportScheduleRun_organizationId_status_createdAt_idx" ON "EnterpriseReportScheduleRun"("organizationId", "status", "createdAt");

ALTER TABLE "EnterpriseReportScheduleRun"
ADD CONSTRAINT "EnterpriseReportScheduleRun_organizationId_scheduleId_fkey"
FOREIGN KEY ("organizationId", "scheduleId")
REFERENCES "EnterpriseReportSchedule"("organizationId", "id")
ON DELETE CASCADE ON UPDATE CASCADE;
