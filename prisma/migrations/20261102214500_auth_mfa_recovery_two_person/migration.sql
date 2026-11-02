-- AUTH-04: two-independent-security-operators recovery; no direct MFA bypass token.
ALTER TABLE "User" ADD COLUMN "mfaRecoveryRequired" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "mfaRecoveryInvalidBefore" TIMESTAMP(3);

CREATE TABLE "AuthMfaRecoveryRequest" (
  "id" TEXT NOT NULL,
  "targetUserId" TEXT NOT NULL,
  "requestedByUserId" TEXT NOT NULL,
  "approvedByUserId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "reason" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "resolvedAt" TIMESTAMP(3),
  CONSTRAINT "AuthMfaRecoveryRequest_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "AuthMfaRecoveryRequest" ADD CONSTRAINT "AuthMfaRecoveryRequest_targetUserId_fkey"
  FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuthMfaRecoveryRequest" ADD CONSTRAINT "AuthMfaRecoveryRequest_requestedByUserId_fkey"
  FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AuthMfaRecoveryRequest" ADD CONSTRAINT "AuthMfaRecoveryRequest_approvedByUserId_fkey"
  FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "AuthMfaRecoveryRequest_targetUserId_status_expiresAt_idx" ON "AuthMfaRecoveryRequest"("targetUserId","status","expiresAt");
CREATE INDEX "AuthMfaRecoveryRequest_status_expiresAt_idx" ON "AuthMfaRecoveryRequest"("status","expiresAt");
CREATE INDEX "AuthMfaRecoveryRequest_requestedByUserId_createdAt_idx" ON "AuthMfaRecoveryRequest"("requestedByUserId","createdAt");
-- Database constraint prevents concurrent duplicate pending resets of the same identity.
CREATE UNIQUE INDEX "AuthMfaRecoveryRequest_one_pending_target_idx" ON "AuthMfaRecoveryRequest"("targetUserId") WHERE "status" = 'PENDING';
