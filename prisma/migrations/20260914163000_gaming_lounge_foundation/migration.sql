-- Gaming Lounge foundation (#639)
-- Additive only. Shared Asset, CRM, Catalog, Inventory and Finance domains remain authoritative.

CREATE TABLE "EnterpriseGamingConfiguration" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "settingsJson" JSONB,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdByUserId" TEXT NOT NULL,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EnterpriseGamingConfiguration_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseGamingStationProfile" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "stationCode" TEXT NOT NULL,
    "displayName" TEXT,
    "consoleFamily" TEXT,
    "maxPlayers" INTEGER NOT NULL DEFAULT 2,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "notes" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdByUserId" TEXT NOT NULL,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "EnterpriseGamingStationProfile_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "EnterpriseGamingStationProfile_maxPlayers_check" CHECK ("maxPlayers" > 0),
    CONSTRAINT "EnterpriseGamingStationProfile_status_check" CHECK ("status" IN ('AVAILABLE', 'IN_USE', 'RESERVED', 'MAINTENANCE', 'OUT_OF_SERVICE'))
);

CREATE TABLE "EnterpriseGamingBooking" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "stationId" TEXT NOT NULL,
    "businessPartyId" TEXT,
    "scheduledStartAt" TIMESTAMP(3) NOT NULL,
    "scheduledEndAt" TIMESTAMP(3) NOT NULL,
    "playerCount" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "idempotencyKey" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdByUserId" TEXT NOT NULL,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "EnterpriseGamingBooking_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "EnterpriseGamingBooking_window_check" CHECK ("scheduledEndAt" > "scheduledStartAt"),
    CONSTRAINT "EnterpriseGamingBooking_playerCount_check" CHECK ("playerCount" > 0),
    CONSTRAINT "EnterpriseGamingBooking_status_check" CHECK ("status" IN ('DRAFT', 'CONFIRMED', 'CHECKED_IN', 'NO_SHOW', 'CANCELLED', 'CONVERTED'))
);

CREATE TABLE "EnterpriseGamingPricingRule" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "serviceCatalogItemId" TEXT NOT NULL,
    "stationId" TEXT,
    "pricingMode" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "durationMinutes" INTEGER,
    "billingIncrementMinutes" INTEGER,
    "validFrom" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "dayOfWeekMask" INTEGER,
    "startMinuteOfDay" INTEGER,
    "endMinuteOfDay" INTEGER,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "ruleJson" JSONB,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdByUserId" TEXT NOT NULL,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "EnterpriseGamingPricingRule_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "EnterpriseGamingPricingRule_amount_check" CHECK ("amount" >= 0),
    CONSTRAINT "EnterpriseGamingPricingRule_duration_check" CHECK ("durationMinutes" IS NULL OR "durationMinutes" > 0),
    CONSTRAINT "EnterpriseGamingPricingRule_increment_check" CHECK ("billingIncrementMinutes" IS NULL OR "billingIncrementMinutes" > 0),
    CONSTRAINT "EnterpriseGamingPricingRule_validity_check" CHECK ("validUntil" IS NULL OR "validFrom" IS NULL OR "validUntil" > "validFrom"),
    CONSTRAINT "EnterpriseGamingPricingRule_startMinute_check" CHECK ("startMinuteOfDay" IS NULL OR ("startMinuteOfDay" >= 0 AND "startMinuteOfDay" <= 1439)),
    CONSTRAINT "EnterpriseGamingPricingRule_endMinute_check" CHECK ("endMinuteOfDay" IS NULL OR ("endMinuteOfDay" >= 0 AND "endMinuteOfDay" <= 1439)),
    CONSTRAINT "EnterpriseGamingPricingRule_mode_check" CHECK ("pricingMode" IN ('FIXED_DURATION', 'PER_MINUTE', 'PER_HOUR', 'PACKAGE'))
);

CREATE TABLE "EnterpriseGamingSession" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "stationId" TEXT NOT NULL,
    "bookingId" TEXT,
    "businessPartyId" TEXT,
    "serviceCatalogItemId" TEXT,
    "pricingRuleId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'WAITING',
    "startedAt" TIMESTAMP(3),
    "expectedEndAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "pausedSeconds" INTEGER NOT NULL DEFAULT 0,
    "billableSeconds" INTEGER,
    "pricingSnapshotJson" JSONB,
    "currency" TEXT,
    "quotedAmount" DECIMAL(18,2),
    "finalAmount" DECIMAL(18,2),
    "idempotencyKey" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdByUserId" TEXT NOT NULL,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "EnterpriseGamingSession_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "EnterpriseGamingSession_pausedSeconds_check" CHECK ("pausedSeconds" >= 0),
    CONSTRAINT "EnterpriseGamingSession_billableSeconds_check" CHECK ("billableSeconds" IS NULL OR "billableSeconds" >= 0),
    CONSTRAINT "EnterpriseGamingSession_quotedAmount_check" CHECK ("quotedAmount" IS NULL OR "quotedAmount" >= 0),
    CONSTRAINT "EnterpriseGamingSession_finalAmount_check" CHECK ("finalAmount" IS NULL OR "finalAmount" >= 0),
    CONSTRAINT "EnterpriseGamingSession_time_order_check" CHECK ("endedAt" IS NULL OR "startedAt" IS NULL OR "endedAt" >= "startedAt"),
    CONSTRAINT "EnterpriseGamingSession_status_check" CHECK ("status" IN ('WAITING', 'ACTIVE', 'PAUSED', 'ENDED', 'TO_CHECKOUT', 'PAID', 'CANCELLED'))
);

CREATE UNIQUE INDEX "EnterpriseGamingConfiguration_organizationId_key"
ON "EnterpriseGamingConfiguration"("organizationId");
CREATE INDEX "EnterpriseGamingConfiguration_organizationId_idx"
ON "EnterpriseGamingConfiguration"("organizationId");

CREATE UNIQUE INDEX "EnterpriseGamingStationProfile_organizationId_id_key"
ON "EnterpriseGamingStationProfile"("organizationId", "id");
CREATE UNIQUE INDEX "GamingStation_org_asset_key"
ON "EnterpriseGamingStationProfile"("organizationId", "assetId");
CREATE UNIQUE INDEX "GamingStation_org_code_key"
ON "EnterpriseGamingStationProfile"("organizationId", "stationCode");
CREATE INDEX "EnterpriseGamingStationProfile_organizationId_status_sortOrder_idx"
ON "EnterpriseGamingStationProfile"("organizationId", "status", "sortOrder");
CREATE INDEX "EnterpriseGamingStationProfile_organizationId_consoleFamily_status_idx"
ON "EnterpriseGamingStationProfile"("organizationId", "consoleFamily", "status");
CREATE INDEX "EnterpriseGamingStationProfile_archivedAt_idx"
ON "EnterpriseGamingStationProfile"("archivedAt");

CREATE UNIQUE INDEX "EnterpriseGamingBooking_organizationId_id_key"
ON "EnterpriseGamingBooking"("organizationId", "id");
CREATE UNIQUE INDEX "GamingBooking_org_reference_key"
ON "EnterpriseGamingBooking"("organizationId", "reference");
CREATE UNIQUE INDEX "GamingBooking_org_idempotency_key"
ON "EnterpriseGamingBooking"("organizationId", "idempotencyKey");
CREATE INDEX "EnterpriseGamingBooking_organizationId_stationId_status_scheduledStartAt_idx"
ON "EnterpriseGamingBooking"("organizationId", "stationId", "status", "scheduledStartAt");
CREATE INDEX "EnterpriseGamingBooking_organizationId_businessPartyId_status_idx"
ON "EnterpriseGamingBooking"("organizationId", "businessPartyId", "status");
CREATE INDEX "EnterpriseGamingBooking_organizationId_status_scheduledStartAt_idx"
ON "EnterpriseGamingBooking"("organizationId", "status", "scheduledStartAt");
CREATE INDEX "EnterpriseGamingBooking_archivedAt_idx"
ON "EnterpriseGamingBooking"("archivedAt");

CREATE UNIQUE INDEX "EnterpriseGamingPricingRule_organizationId_id_key"
ON "EnterpriseGamingPricingRule"("organizationId", "id");
CREATE UNIQUE INDEX "GamingPricingRule_org_code_key"
ON "EnterpriseGamingPricingRule"("organizationId", "code");
CREATE INDEX "EnterpriseGamingPricingRule_organizationId_serviceCatalogItemId_status_idx"
ON "EnterpriseGamingPricingRule"("organizationId", "serviceCatalogItemId", "status");
CREATE INDEX "EnterpriseGamingPricingRule_organizationId_stationId_status_idx"
ON "EnterpriseGamingPricingRule"("organizationId", "stationId", "status");
CREATE INDEX "EnterpriseGamingPricingRule_organizationId_status_validFrom_idx"
ON "EnterpriseGamingPricingRule"("organizationId", "status", "validFrom");
CREATE INDEX "EnterpriseGamingPricingRule_archivedAt_idx"
ON "EnterpriseGamingPricingRule"("archivedAt");

CREATE UNIQUE INDEX "EnterpriseGamingSession_organizationId_id_key"
ON "EnterpriseGamingSession"("organizationId", "id");
CREATE UNIQUE INDEX "GamingSession_org_reference_key"
ON "EnterpriseGamingSession"("organizationId", "reference");
CREATE UNIQUE INDEX "GamingSession_org_booking_key"
ON "EnterpriseGamingSession"("organizationId", "bookingId");
CREATE UNIQUE INDEX "GamingSession_org_idempotency_key"
ON "EnterpriseGamingSession"("organizationId", "idempotencyKey");
CREATE INDEX "EnterpriseGamingSession_organizationId_stationId_status_startedAt_idx"
ON "EnterpriseGamingSession"("organizationId", "stationId", "status", "startedAt");
CREATE INDEX "EnterpriseGamingSession_organizationId_businessPartyId_status_idx"
ON "EnterpriseGamingSession"("organizationId", "businessPartyId", "status");
CREATE INDEX "EnterpriseGamingSession_organizationId_status_endedAt_idx"
ON "EnterpriseGamingSession"("organizationId", "status", "endedAt");
CREATE INDEX "EnterpriseGamingSession_organizationId_serviceCatalogItemId_status_idx"
ON "EnterpriseGamingSession"("organizationId", "serviceCatalogItemId", "status");
CREATE INDEX "EnterpriseGamingSession_archivedAt_idx"
ON "EnterpriseGamingSession"("archivedAt");

-- Database-level safety net for concurrent station starts. #641 must still use
-- a transaction and idempotency key so callers receive deterministic errors.
CREATE UNIQUE INDEX "GamingSession_one_live_per_station_key"
ON "EnterpriseGamingSession"("organizationId", "stationId")
WHERE "archivedAt" IS NULL AND "status" IN ('ACTIVE', 'PAUSED');

ALTER TABLE "EnterpriseGamingBooking"
ADD CONSTRAINT "EnterpriseGamingBooking_organizationId_stationId_fkey"
FOREIGN KEY ("organizationId", "stationId")
REFERENCES "EnterpriseGamingStationProfile"("organizationId", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EnterpriseGamingPricingRule"
ADD CONSTRAINT "EnterpriseGamingPricingRule_organizationId_stationId_fkey"
FOREIGN KEY ("organizationId", "stationId")
REFERENCES "EnterpriseGamingStationProfile"("organizationId", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EnterpriseGamingSession"
ADD CONSTRAINT "EnterpriseGamingSession_organizationId_stationId_fkey"
FOREIGN KEY ("organizationId", "stationId")
REFERENCES "EnterpriseGamingStationProfile"("organizationId", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EnterpriseGamingSession"
ADD CONSTRAINT "EnterpriseGamingSession_organizationId_bookingId_fkey"
FOREIGN KEY ("organizationId", "bookingId")
REFERENCES "EnterpriseGamingBooking"("organizationId", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EnterpriseGamingSession"
ADD CONSTRAINT "EnterpriseGamingSession_organizationId_pricingRuleId_fkey"
FOREIGN KEY ("organizationId", "pricingRuleId")
REFERENCES "EnterpriseGamingPricingRule"("organizationId", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;
