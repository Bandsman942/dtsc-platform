CREATE TABLE "PharmacySavedReportView" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "reportType" TEXT NOT NULL,
  "filtersJson" JSONB NOT NULL,
  "columnsJson" JSONB,
  "sortJson" JSONB,
  "visibility" TEXT NOT NULL DEFAULT 'PRIVATE',
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdById" TEXT NOT NULL,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PharmacySavedReportView_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PharmacyReportExport" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "reportType" TEXT NOT NULL,
  "reportName" TEXT NOT NULL,
  "filtersJson" JSONB NOT NULL,
  "format" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'COMPLETED',
  "fileUrl" TEXT,
  "exportedById" TEXT NOT NULL,
  "exportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "errorMessage" TEXT,
  "sensitiveExport" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PharmacyReportExport_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PharmacyReportSnapshot" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "reportType" TEXT NOT NULL,
  "snapshotName" TEXT NOT NULL,
  "periodStart" TIMESTAMP(3),
  "periodEnd" TIMESTAMP(3),
  "dataJson" JSONB NOT NULL,
  "generatedById" TEXT NOT NULL,
  "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "notes" TEXT,
  CONSTRAINT "PharmacyReportSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PharmacySavedReportView_organizationId_reportType_status_idx" ON "PharmacySavedReportView"("organizationId", "reportType", "status");
CREATE INDEX "PharmacySavedReportView_organizationId_createdById_createdAt_idx" ON "PharmacySavedReportView"("organizationId", "createdById", "createdAt");
CREATE INDEX "PharmacyReportExport_organizationId_reportType_status_idx" ON "PharmacyReportExport"("organizationId", "reportType", "status");
CREATE INDEX "PharmacyReportExport_organizationId_exportedById_exportedAt_idx" ON "PharmacyReportExport"("organizationId", "exportedById", "exportedAt");
CREATE INDEX "PharmacyReportSnapshot_organizationId_reportType_generatedAt_idx" ON "PharmacyReportSnapshot"("organizationId", "reportType", "generatedAt");
CREATE INDEX "PharmacyReportSnapshot_organizationId_generatedById_generatedAt_idx" ON "PharmacyReportSnapshot"("organizationId", "generatedById", "generatedAt");
