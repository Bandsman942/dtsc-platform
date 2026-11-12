-- HSL OCR pipeline: additive tenant-scoped jobs, metadata only, no file bytes or clinical text.
CREATE TABLE "EnterpriseHealthInsuranceOcrJob" (
 "id" TEXT NOT NULL,
 "organizationId" TEXT NOT NULL,
 "connectorId" TEXT NOT NULL,
 "adapterCode" TEXT NOT NULL DEFAULT 'HIRMS_HSL',
 "environment" TEXT NOT NULL DEFAULT 'UAT',
 "salesInvoiceId" TEXT,
 "documentDigest" TEXT NOT NULL,
 "mimeType" TEXT NOT NULL,
 "bytes" INTEGER NOT NULL,
 "invoiceDate" TEXT NOT NULL,
 "externalJobId" TEXT,
 "transportStatus" TEXT NOT NULL DEFAULT 'UPLOADING',
 "httpStatus" INTEGER,
 "remoteStatus" TEXT,
 "lastPolledAt" TIMESTAMP(3),
 "errorCode" TEXT,
 "createdByUserId" TEXT NOT NULL,
 "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "EnterpriseHealthInsuranceOcrJob_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EHIOcr_org_adapter_env_digest_key"
 ON "EnterpriseHealthInsuranceOcrJob"("organizationId","adapterCode","environment","documentDigest");
CREATE INDEX "EHIOcr_org_env_date_idx"
 ON "EnterpriseHealthInsuranceOcrJob"("organizationId","environment","submittedAt");
CREATE INDEX "EHIOcr_org_remote_id_idx"
 ON "EnterpriseHealthInsuranceOcrJob"("organizationId","externalJobId");
ALTER TABLE "EnterpriseHealthInsuranceOcrJob"
 ADD CONSTRAINT "EnterpriseHealthInsuranceOcrJob_connector_fkey"
 FOREIGN KEY ("organizationId","connectorId")
 REFERENCES "EnterpriseHealthInsuranceConnector"("organizationId","id")
 ON DELETE RESTRICT ON UPDATE CASCADE;
