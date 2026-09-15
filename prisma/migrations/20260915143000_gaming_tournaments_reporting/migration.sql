-- Gaming Lounge #645 — tournaments/events persistence only.
-- CRM, Assets, Finance and Reports remain canonical sources outside these operational tables.

CREATE TABLE "EnterpriseGamingTournament" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "siteId" TEXT,
    "entryCatalogItemId" TEXT,
    "tournamentFormat" TEXT NOT NULL DEFAULT 'SINGLE_ELIMINATION',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "registrationOpensAt" TIMESTAMP(3),
    "registrationClosesAt" TIMESTAMP(3),
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "maxParticipants" INTEGER,
    "notes" TEXT,
    "idempotencyKey" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdByUserId" TEXT NOT NULL,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),
    CONSTRAINT "EnterpriseGamingTournament_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseGamingTournamentRegistration" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "businessPartyId" TEXT NOT NULL,
    "salesInvoiceId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'REGISTERED',
    "seedNumber" INTEGER,
    "resultRank" INTEGER,
    "resultLabel" TEXT,
    "checkedInAt" TIMESTAMP(3),
    "withdrawnAt" TIMESTAMP(3),
    "disqualifiedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "idempotencyKey" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdByUserId" TEXT NOT NULL,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EnterpriseGamingTournamentRegistration_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseGamingTournamentStation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "stationId" TEXT NOT NULL,
    "slotStartAt" TIMESTAMP(3) NOT NULL,
    "slotEndAt" TIMESTAMP(3) NOT NULL,
    "label" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ASSIGNED',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdByUserId" TEXT NOT NULL,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EnterpriseGamingTournamentStation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseGamingTournamentTransition" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "metadataJson" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EnterpriseGamingTournamentTransition_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EnterpriseGamingTournament_organizationId_id_key" ON "EnterpriseGamingTournament"("organizationId", "id");
CREATE UNIQUE INDEX "GamingTournament_org_reference_key" ON "EnterpriseGamingTournament"("organizationId", "reference");
CREATE UNIQUE INDEX "GamingTournament_org_idempotency_key" ON "EnterpriseGamingTournament"("organizationId", "idempotencyKey");
CREATE INDEX "EnterpriseGamingTournament_organizationId_status_startsAt_idx" ON "EnterpriseGamingTournament"("organizationId", "status", "startsAt");
CREATE INDEX "EnterpriseGamingTournament_organizationId_siteId_startsAt_idx" ON "EnterpriseGamingTournament"("organizationId", "siteId", "startsAt");
CREATE INDEX "EnterpriseGamingTournament_organizationId_entryCatalogItemId_idx" ON "EnterpriseGamingTournament"("organizationId", "entryCatalogItemId");
CREATE INDEX "EnterpriseGamingTournament_archivedAt_idx" ON "EnterpriseGamingTournament"("archivedAt");

CREATE UNIQUE INDEX "EnterpriseGamingTournamentRegistration_organizationId_id_key" ON "EnterpriseGamingTournamentRegistration"("organizationId", "id");
CREATE UNIQUE INDEX "GamingTournamentRegistration_participant_key" ON "EnterpriseGamingTournamentRegistration"("organizationId", "tournamentId", "businessPartyId");
CREATE UNIQUE INDEX "GamingTournamentRegistration_invoice_key" ON "EnterpriseGamingTournamentRegistration"("organizationId", "salesInvoiceId");
CREATE UNIQUE INDEX "GamingTournamentRegistration_idempotency_key" ON "EnterpriseGamingTournamentRegistration"("organizationId", "idempotencyKey");
CREATE INDEX "EnterpriseGamingTournamentRegistration_organizationId_tournamentId_status_idx" ON "EnterpriseGamingTournamentRegistration"("organizationId", "tournamentId", "status");
CREATE INDEX "EnterpriseGamingTournamentRegistration_organizationId_businessPartyId_status_idx" ON "EnterpriseGamingTournamentRegistration"("organizationId", "businessPartyId", "status");

CREATE UNIQUE INDEX "EnterpriseGamingTournamentStation_organizationId_id_key" ON "EnterpriseGamingTournamentStation"("organizationId", "id");
CREATE UNIQUE INDEX "GamingTournamentStation_assignment_key" ON "EnterpriseGamingTournamentStation"("organizationId", "tournamentId", "stationId");
CREATE INDEX "EnterpriseGamingTournamentStation_organizationId_stationId_status_slotStartAt_slotEndAt_idx" ON "EnterpriseGamingTournamentStation"("organizationId", "stationId", "status", "slotStartAt", "slotEndAt");
CREATE INDEX "EnterpriseGamingTournamentStation_organizationId_tournamentId_status_idx" ON "EnterpriseGamingTournamentStation"("organizationId", "tournamentId", "status");

CREATE UNIQUE INDEX "EnterpriseGamingTournamentTransition_organizationId_id_key" ON "EnterpriseGamingTournamentTransition"("organizationId", "id");
CREATE UNIQUE INDEX "GamingTournamentTransition_org_idempotency_key" ON "EnterpriseGamingTournamentTransition"("organizationId", "idempotencyKey");
CREATE INDEX "EnterpriseGamingTournamentTransition_organizationId_tournamentId_occurredAt_idx" ON "EnterpriseGamingTournamentTransition"("organizationId", "tournamentId", "occurredAt");
CREATE INDEX "EnterpriseGamingTournamentTransition_organizationId_action_occurredAt_idx" ON "EnterpriseGamingTournamentTransition"("organizationId", "action", "occurredAt");

ALTER TABLE "EnterpriseGamingTournamentRegistration" ADD CONSTRAINT "EnterpriseGamingTournamentRegistration_org_tournament_fkey" FOREIGN KEY ("organizationId", "tournamentId") REFERENCES "EnterpriseGamingTournament"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterpriseGamingTournamentStation" ADD CONSTRAINT "EnterpriseGamingTournamentStation_org_tournament_fkey" FOREIGN KEY ("organizationId", "tournamentId") REFERENCES "EnterpriseGamingTournament"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterpriseGamingTournamentStation" ADD CONSTRAINT "EnterpriseGamingTournamentStation_org_station_fkey" FOREIGN KEY ("organizationId", "stationId") REFERENCES "EnterpriseGamingStationProfile"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterpriseGamingTournamentTransition" ADD CONSTRAINT "EnterpriseGamingTournamentTransition_org_tournament_fkey" FOREIGN KEY ("organizationId", "tournamentId") REFERENCES "EnterpriseGamingTournament"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EnterpriseGamingTournament" ADD CONSTRAINT "EnterpriseGamingTournament_status_check" CHECK ("status" IN ('DRAFT','REGISTRATION_OPEN','REGISTRATION_CLOSED','IN_PROGRESS','COMPLETED','CANCELLED'));
ALTER TABLE "EnterpriseGamingTournament" ADD CONSTRAINT "EnterpriseGamingTournament_format_check" CHECK ("tournamentFormat" IN ('SINGLE_ELIMINATION','DOUBLE_ELIMINATION','ROUND_ROBIN','LEAGUE','CUSTOM'));
ALTER TABLE "EnterpriseGamingTournament" ADD CONSTRAINT "EnterpriseGamingTournament_dates_check" CHECK ("endsAt" > "startsAt" AND ("registrationClosesAt" IS NULL OR "registrationClosesAt" <= "startsAt") AND ("registrationOpensAt" IS NULL OR "registrationClosesAt" IS NULL OR "registrationOpensAt" < "registrationClosesAt"));
ALTER TABLE "EnterpriseGamingTournament" ADD CONSTRAINT "EnterpriseGamingTournament_max_participants_check" CHECK ("maxParticipants" IS NULL OR "maxParticipants" > 1);
ALTER TABLE "EnterpriseGamingTournamentRegistration" ADD CONSTRAINT "EnterpriseGamingTournamentRegistration_status_check" CHECK ("status" IN ('REGISTERED','CHECKED_IN','WITHDRAWN','DISQUALIFIED','COMPLETED'));
ALTER TABLE "EnterpriseGamingTournamentRegistration" ADD CONSTRAINT "EnterpriseGamingTournamentRegistration_rank_check" CHECK (("seedNumber" IS NULL OR "seedNumber" > 0) AND ("resultRank" IS NULL OR "resultRank" > 0));
ALTER TABLE "EnterpriseGamingTournamentStation" ADD CONSTRAINT "EnterpriseGamingTournamentStation_status_check" CHECK ("status" IN ('ASSIGNED','RELEASED'));
ALTER TABLE "EnterpriseGamingTournamentStation" ADD CONSTRAINT "EnterpriseGamingTournamentStation_dates_check" CHECK ("slotEndAt" > "slotStartAt");
