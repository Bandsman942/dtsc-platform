-- DTSC Console professionalization iteration 07 (additive only)
ALTER TABLE "SupportTicket"
  ADD COLUMN "assignedAt" TIMESTAMP(3),
  ADD COLUMN "firstRespondedAt" TIMESTAMP(3),
  ADD COLUMN "slaFirstResponseDueAt" TIMESTAMP(3),
  ADD COLUMN "slaResolutionDueAt" TIMESTAMP(3),
  ADD COLUMN "slaPausedAt" TIMESTAMP(3),
  ADD COLUMN "slaBreachedAt" TIMESTAMP(3),
  ADD COLUMN "escalatedAt" TIMESTAMP(3),
  ADD COLUMN "escalationReason" TEXT,
  ADD COLUMN "satisfactionRating" INTEGER,
  ADD COLUMN "satisfactionComment" TEXT;


ALTER TABLE "PublicPublication"
  ADD COLUMN "status" TEXT NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN "locale" TEXT NOT NULL DEFAULT 'fr',
  ADD COLUMN "seoJson" JSONB,
  ADD COLUMN "publishedAt" TIMESTAMP(3),
  ADD COLUMN "archivedAt" TIMESTAMP(3);

UPDATE "PublicPublication"
SET "status" = CASE WHEN "published" = true THEN 'PUBLISHED' ELSE 'DRAFT' END,
    "publishedAt" = CASE WHEN "published" = true THEN "updatedAt" ELSE NULL END;

ALTER TABLE "WebhookEvent"
  ADD COLUMN "requestId" TEXT,
  ADD COLUMN "idempotencyKey" TEXT,
  ADD COLUMN "lastAttemptAt" TIMESTAMP(3),
  ADD COLUMN "nextRetryAt" TIMESTAMP(3),
  ADD COLUMN "appliedAt" TIMESTAMP(3);

CREATE TABLE "BillingPlanVersion" (
  "id" TEXT NOT NULL,
  "planId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "priceUsd" DECIMAL(10,2) NOT NULL,
  "dailyMessageLimit" INTEGER NOT NULL,
  "dailyTokenLimit" INTEGER NOT NULL,
  "maxDocuments" INTEGER NOT NULL,
  "effectiveAt" TIMESTAMP(3) NOT NULL,
  "retiredAt" TIMESTAMP(3),
  "createdByUserId" TEXT,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BillingPlanVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PublicPublicationVersion" (
  "id" TEXT NOT NULL,
  "publicationId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "excerpt" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "coverLabel" TEXT,
  "published" BOOLEAN NOT NULL,
  "locale" TEXT NOT NULL DEFAULT 'fr',
  "seoJson" JSONB,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PublicPublicationVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlatformIncident" (
  "id" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "service" TEXT NOT NULL,
  "severity" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "ownerUserId" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL,
  "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "impact" TEXT,
  "updatesJson" JSONB,
  "resolvedAt" TIMESTAMP(3),
  "cause" TEXT,
  "correctiveActions" TEXT,
  "logReference" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlatformIncident_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FeatureFlag" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "descriptionFr" TEXT NOT NULL,
  "descriptionEn" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DISABLED',
  "audience" TEXT NOT NULL DEFAULT 'INTERNAL',
  "environment" TEXT NOT NULL DEFAULT 'PRODUCTION',
  "rolloutPercentage" INTEGER NOT NULL DEFAULT 0,
  "organizationIds" JSONB,
  "userIds" JSONB,
  "startsAt" TIMESTAMP(3),
  "endsAt" TIMESTAMP(3),
  "ownerUserId" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FeatureFlag_pkey" PRIMARY KEY ("id")
);


CREATE TABLE "ConsoleOperationJob" (
  "id" TEXT NOT NULL,
  "operationType" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "actorUserId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "requestId" TEXT,
  "inputJson" JSONB,
  "resultJson" JSONB,
  "errorMessage" TEXT,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ConsoleOperationJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlatformSettingHistory" (
  "id" TEXT NOT NULL,
  "settingCode" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "valueType" TEXT NOT NULL,
  "previousValue" JSONB,
  "nextValue" JSONB,
  "sensitive" BOOLEAN NOT NULL DEFAULT false,
  "environment" TEXT NOT NULL DEFAULT 'PRODUCTION',
  "effect" TEXT,
  "restartRequired" BOOLEAN NOT NULL DEFAULT false,
  "reason" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "requestId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlatformSettingHistory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BillingPlanVersion_planId_version_key" ON "BillingPlanVersion"("planId", "version");
CREATE INDEX "BillingPlanVersion_planId_effectiveAt_idx" ON "BillingPlanVersion"("planId", "effectiveAt");
CREATE INDEX "SupportTicket_assignedToDtscUserId_status_updatedAt_idx" ON "SupportTicket"("assignedToDtscUserId", "status", "updatedAt");
CREATE INDEX "SupportTicket_slaFirstResponseDueAt_firstRespondedAt_idx" ON "SupportTicket"("slaFirstResponseDueAt", "firstRespondedAt");
CREATE INDEX "SupportTicket_slaResolutionDueAt_resolvedAt_idx" ON "SupportTicket"("slaResolutionDueAt", "resolvedAt");
CREATE INDEX "PublicPublication_status_locale_publishedAt_idx" ON "PublicPublication"("status", "locale", "publishedAt");
CREATE UNIQUE INDEX "PublicPublicationVersion_publicationId_version_key" ON "PublicPublicationVersion"("publicationId", "version");
CREATE INDEX "PublicPublicationVersion_publicationId_createdAt_idx" ON "PublicPublicationVersion"("publicationId", "createdAt");
CREATE UNIQUE INDEX "PlatformIncident_reference_key" ON "PlatformIncident"("reference");
CREATE INDEX "PlatformIncident_status_severity_startedAt_idx" ON "PlatformIncident"("status", "severity", "startedAt");
CREATE INDEX "PlatformIncident_service_startedAt_idx" ON "PlatformIncident"("service", "startedAt");
CREATE INDEX "PlatformIncident_ownerUserId_idx" ON "PlatformIncident"("ownerUserId");
CREATE UNIQUE INDEX "FeatureFlag_code_key" ON "FeatureFlag"("code");
CREATE INDEX "FeatureFlag_status_environment_idx" ON "FeatureFlag"("status", "environment");
CREATE INDEX "FeatureFlag_ownerUserId_idx" ON "FeatureFlag"("ownerUserId");
CREATE INDEX "ConsoleOperationJob_operationType_status_createdAt_idx" ON "ConsoleOperationJob"("operationType", "status", "createdAt");
CREATE INDEX "ConsoleOperationJob_actorUserId_createdAt_idx" ON "ConsoleOperationJob"("actorUserId", "createdAt");
CREATE INDEX "ConsoleOperationJob_requestId_idx" ON "ConsoleOperationJob"("requestId");
CREATE INDEX "PlatformSettingHistory_settingCode_createdAt_idx" ON "PlatformSettingHistory"("settingCode", "createdAt");
CREATE INDEX "PlatformSettingHistory_actorUserId_createdAt_idx" ON "PlatformSettingHistory"("actorUserId", "createdAt");
CREATE INDEX "PlatformSettingHistory_requestId_idx" ON "PlatformSettingHistory"("requestId");
CREATE INDEX "WebhookEvent_requestId_idx" ON "WebhookEvent"("requestId");
CREATE INDEX "WebhookEvent_idempotencyKey_idx" ON "WebhookEvent"("idempotencyKey");
CREATE UNIQUE INDEX "WebhookEvent_provider_idempotencyKey_key" ON "WebhookEvent"("provider", "idempotencyKey");

ALTER TABLE "BillingPlanVersion" ADD CONSTRAINT "BillingPlanVersion_planId_fkey" FOREIGN KEY ("planId") REFERENCES "BillingPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PublicPublicationVersion" ADD CONSTRAINT "PublicPublicationVersion_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "PublicPublication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_satisfactionRating_check" CHECK ("satisfactionRating" IS NULL OR ("satisfactionRating" >= 1 AND "satisfactionRating" <= 5));
ALTER TABLE "FeatureFlag" ADD CONSTRAINT "FeatureFlag_rolloutPercentage_check" CHECK ("rolloutPercentage" >= 0 AND "rolloutPercentage" <= 100);
