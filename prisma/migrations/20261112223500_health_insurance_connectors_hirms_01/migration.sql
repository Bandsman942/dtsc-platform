-- Additive, UAT-first generic health insurance integration foundation.
CREATE TABLE "EnterpriseHealthInsuranceConnector" (
 "id" TEXT NOT NULL,
 "organizationId" TEXT NOT NULL,
 "adapterCode" TEXT NOT NULL DEFAULT 'HIRMS_HSL',
 "environment" TEXT NOT NULL DEFAULT 'UAT',
 "siteId" TEXT,
 "status" TEXT NOT NULL DEFAULT 'DRAFT',
 "credentialsEncrypted" TEXT,
 "credentialsUpdatedAt" TIMESTAMP(3),
 "lastAuthCheckAt" TIMESTAMP(3),
 "lastVerifiedAt" TIMESTAMP(3),
 "lastErrorCode" TEXT,
 "revision" INTEGER NOT NULL DEFAULT 1,
 "createdByUserId" TEXT NOT NULL,
 "updatedByUserId" TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "EnterpriseHealthInsuranceConnector_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EnterpriseHealthInsuranceConnector_organizationId_adapterCode_key"
 ON "EnterpriseHealthInsuranceConnector"("organizationId", "adapterCode");
CREATE UNIQUE INDEX "EnterpriseHealthInsuranceConnector_organizationId_id_key"
 ON "EnterpriseHealthInsuranceConnector"("organizationId", "id");
CREATE INDEX "EnterpriseHealthInsuranceConnector_organizationId_status_idx"
 ON "EnterpriseHealthInsuranceConnector"("organizationId", "status");

CREATE TABLE "EnterpriseHealthInsuranceVerification" (
 "id" TEXT NOT NULL,
 "organizationId" TEXT NOT NULL,
 "connectorId" TEXT NOT NULL,
 "patientId" TEXT,
 "memberLastFour" TEXT NOT NULL,
 "serviceCode" TEXT,
 "codeSystem" TEXT,
 "serviceDate" TEXT,
 "verified" BOOLEAN NOT NULL,
 "coverStatus" TEXT,
 "serviceStatus" TEXT,
 "networkStatus" TEXT,
 "createdByUserId" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "EnterpriseHealthInsuranceVerification_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "EnterpriseHealthInsuranceVerification_organizationId_createdAt_idx"
 ON "EnterpriseHealthInsuranceVerification"("organizationId", "createdAt");
CREATE INDEX "EnterpriseHealthInsuranceVerification_organizationId_connectorId_createdAt_idx"
 ON "EnterpriseHealthInsuranceVerification"("organizationId", "connectorId", "createdAt");
CREATE INDEX "EnterpriseHealthInsuranceVerification_organizationId_patientId_createdAt_idx"
 ON "EnterpriseHealthInsuranceVerification"("organizationId", "patientId", "createdAt");
ALTER TABLE "EnterpriseHealthInsuranceVerification"
 ADD CONSTRAINT "EnterpriseHealthInsuranceVerification_connector_fkey"
 FOREIGN KEY ("organizationId","connectorId")
 REFERENCES "EnterpriseHealthInsuranceConnector"("organizationId","id")
 ON DELETE RESTRICT ON UPDATE CASCADE;
