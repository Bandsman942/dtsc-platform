ALTER TABLE "EnterpriseGamingBooking"
  ADD COLUMN "confirmedAt" TIMESTAMP(3),
  ADD COLUMN "checkedInAt" TIMESTAMP(3),
  ADD COLUMN "noShowAt" TIMESTAMP(3),
  ADD COLUMN "cancelledAt" TIMESTAMP(3),
  ADD COLUMN "convertedAt" TIMESTAMP(3);

ALTER TABLE "EnterpriseGamingBooking"
  ADD CONSTRAINT "EnterpriseGamingBooking_schedule_check"
    CHECK ("scheduledEndAt" > "scheduledStartAt"),
  ADD CONSTRAINT "EnterpriseGamingBooking_player_count_check"
    CHECK ("playerCount" >= 1 AND "playerCount" <= 16),
  ADD CONSTRAINT "EnterpriseGamingBooking_status_check"
    CHECK ("status" IN ('DRAFT', 'CONFIRMED', 'CHECKED_IN', 'NO_SHOW', 'CANCELLED', 'CONVERTED'));

CREATE TABLE "EnterpriseGamingBookingTransition" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "bookingId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "fromStatus" TEXT,
  "toStatus" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "metadataJson" JSONB,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EnterpriseGamingBookingTransition_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EnterpriseGamingBookingTransition_organizationId_id_key"
  ON "EnterpriseGamingBookingTransition"("organizationId", "id");
CREATE UNIQUE INDEX "GamingBookingTransition_org_idempotency_key"
  ON "EnterpriseGamingBookingTransition"("organizationId", "idempotencyKey");
CREATE INDEX "EnterpriseGamingBookingTransition_organizationId_bookingId_occurredAt_idx"
  ON "EnterpriseGamingBookingTransition"("organizationId", "bookingId", "occurredAt");
CREATE INDEX "EnterpriseGamingBookingTransition_organizationId_action_occurredAt_idx"
  ON "EnterpriseGamingBookingTransition"("organizationId", "action", "occurredAt");

ALTER TABLE "EnterpriseGamingBookingTransition"
  ADD CONSTRAINT "EnterpriseGamingBookingTransition_booking_fkey"
  FOREIGN KEY ("organizationId", "bookingId")
  REFERENCES "EnterpriseGamingBooking"("organizationId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
