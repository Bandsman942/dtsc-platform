CREATE TABLE "PharmacySetting" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "pharmacyName" TEXT,
  "pharmacyType" TEXT,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "timezone" TEXT NOT NULL DEFAULT 'Africa/Kinshasa',
  "language" TEXT NOT NULL DEFAULT 'fr',
  "country" TEXT,
  "city" TEXT,
  "address" TEXT,
  "phone" TEXT,
  "email" TEXT,
  "logoUrl" TEXT,
  "receiptFooterMessage" TEXT,
  "numberingSettingsJson" JSONB NOT NULL,
  "productSettingsJson" JSONB NOT NULL,
  "batchSettingsJson" JSONB NOT NULL,
  "stockSettingsJson" JSONB NOT NULL,
  "expiryFefoSettingsJson" JSONB NOT NULL,
  "salesSettingsJson" JSONB NOT NULL,
  "prescriptionSettingsJson" JSONB NOT NULL,
  "receiptPurchaseSettingsJson" JSONB NOT NULL,
  "cashPaymentSettingsJson" JSONB NOT NULL,
  "returnsLossesSettingsJson" JSONB NOT NULL,
  "alertsNotificationsSettingsJson" JSONB NOT NULL,
  "documentsComplianceSettingsJson" JSONB NOT NULL,
  "qualitySettingsJson" JSONB NOT NULL,
  "reportsExportsSettingsJson" JSONB NOT NULL,
  "privacySecuritySettingsJson" JSONB NOT NULL,
  "erpIntegrationsSettingsJson" JSONB NOT NULL,
  "settingsVersion" INTEGER NOT NULL DEFAULT 1,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdById" TEXT NOT NULL,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PharmacySetting_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PharmacyNumberingSequence" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "prefix" TEXT NOT NULL,
  "format" TEXT NOT NULL DEFAULT 'PREFIX-YYYY-000001',
  "separator" TEXT NOT NULL DEFAULT '-',
  "counterValue" INTEGER NOT NULL DEFAULT 0,
  "counterLength" INTEGER NOT NULL DEFAULT 6,
  "resetFrequency" TEXT NOT NULL DEFAULT 'YEARLY',
  "lastResetAt" TIMESTAMP(3),
  "allowManualOverride" BOOLEAN NOT NULL DEFAULT false,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PharmacyNumberingSequence_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PharmacySettingsAuditLog" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "section" TEXT NOT NULL,
  "settingKey" TEXT NOT NULL,
  "oldValueJson" JSONB,
  "newValueJson" JSONB,
  "changeReason" TEXT,
  "criticality" TEXT NOT NULL DEFAULT 'NORMAL',
  "ip" TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PharmacySettingsAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PharmacySettingsProfile" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "profileName" TEXT NOT NULL,
  "description" TEXT,
  "settingsJson" JSONB NOT NULL,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PharmacySettingsProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PharmacySetting_organizationId_key" ON "PharmacySetting"("organizationId");
CREATE INDEX "PharmacySetting_organizationId_status_idx" ON "PharmacySetting"("organizationId", "status");
CREATE UNIQUE INDEX "PharmacyNumberingSequence_organizationId_entityType_key" ON "PharmacyNumberingSequence"("organizationId", "entityType");
CREATE INDEX "PharmacyNumberingSequence_organizationId_active_idx" ON "PharmacyNumberingSequence"("organizationId", "active");
CREATE INDEX "PharmacySettingsAuditLog_organizationId_section_settingKey_idx" ON "PharmacySettingsAuditLog"("organizationId", "section", "settingKey");
CREATE INDEX "PharmacySettingsAuditLog_organizationId_actorId_createdAt_idx" ON "PharmacySettingsAuditLog"("organizationId", "actorId", "createdAt");
CREATE INDEX "PharmacySettingsProfile_organizationId_isDefault_idx" ON "PharmacySettingsProfile"("organizationId", "isDefault");
