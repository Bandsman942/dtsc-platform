ALTER TABLE "EnterpriseGamingSession"
ADD COLUMN "pausedAt" TIMESTAMP(3),
ADD COLUMN "timingPolicyJson" JSONB;

CREATE TABLE "EnterpriseGamingSessionTransition" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "metadataJson" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EnterpriseGamingSessionTransition_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "EnterpriseGamingSessionTransition_action_check" CHECK ("action" IN ('START', 'PAUSE', 'RESUME', 'EXTEND', 'TRANSFER', 'END')),
    CONSTRAINT "EnterpriseGamingSessionTransition_from_status_check" CHECK ("fromStatus" IS NULL OR "fromStatus" IN ('WAITING', 'ACTIVE', 'PAUSED', 'ENDED', 'TO_CHECKOUT', 'PAID', 'CANCELLED')),
    CONSTRAINT "EnterpriseGamingSessionTransition_to_status_check" CHECK ("toStatus" IN ('WAITING', 'ACTIVE', 'PAUSED', 'ENDED', 'TO_CHECKOUT', 'PAID', 'CANCELLED'))
);

CREATE UNIQUE INDEX "EnterpriseGamingSessionTransition_organizationId_id_key"
ON "EnterpriseGamingSessionTransition"("organizationId", "id");

CREATE UNIQUE INDEX "GamingSessionTransition_org_idempotency_key"
ON "EnterpriseGamingSessionTransition"("organizationId", "idempotencyKey");

CREATE INDEX "EnterpriseGamingSessionTransition_organizationId_sessionId_occurredAt_idx"
ON "EnterpriseGamingSessionTransition"("organizationId", "sessionId", "occurredAt");

CREATE INDEX "EnterpriseGamingSessionTransition_organizationId_action_occurredAt_idx"
ON "EnterpriseGamingSessionTransition"("organizationId", "action", "occurredAt");

ALTER TABLE "EnterpriseGamingSessionTransition"
ADD CONSTRAINT "EnterpriseGamingSessionTransition_organizationId_sessionId_fkey"
FOREIGN KEY ("organizationId", "sessionId")
REFERENCES "EnterpriseGamingSession"("organizationId", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EnterpriseGamingSession"
ADD CONSTRAINT "EnterpriseGamingSession_paused_state_check"
CHECK (("status" = 'PAUSED' AND "pausedAt" IS NOT NULL) OR ("status" <> 'PAUSED' AND "pausedAt" IS NULL));
