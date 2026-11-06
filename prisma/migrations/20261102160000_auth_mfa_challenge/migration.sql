-- AUTH-02: 5-minute one-time challenge is NOT an authenticated session.
CREATE TABLE "AuthMfaChallenge" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "redirectTo" TEXT NOT NULL,
  "organizationId" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuthMfaChallenge_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AuthMfaChallenge_tokenHash_key" ON "AuthMfaChallenge"("tokenHash");
CREATE INDEX "AuthMfaChallenge_userId_expiresAt_idx" ON "AuthMfaChallenge"("userId", "expiresAt");
CREATE INDEX "AuthMfaChallenge_expiresAt_idx" ON "AuthMfaChallenge"("expiresAt");
ALTER TABLE "AuthMfaChallenge" ADD CONSTRAINT "AuthMfaChallenge_userId_fkey"
 FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;