-- AUTH-01: additive account-global TOTP tables. No account is enrolled by this migration.
CREATE TABLE "AuthTotpFactor" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "secretCiphertext" TEXT NOT NULL,
    "enabledAt" TIMESTAMP(3),
    "lastAcceptedStep" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AuthTotpFactor_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuthRecoveryCode" (
    "id" TEXT NOT NULL,
    "factorId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuthRecoveryCode_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AuthTotpFactor_userId_key" ON "AuthTotpFactor"("userId");
CREATE INDEX "AuthTotpFactor_enabledAt_idx" ON "AuthTotpFactor"("enabledAt");
CREATE UNIQUE INDEX "AuthRecoveryCode_factorId_codeHash_key" ON "AuthRecoveryCode"("factorId", "codeHash");
CREATE INDEX "AuthRecoveryCode_factorId_consumedAt_idx" ON "AuthRecoveryCode"("factorId", "consumedAt");

ALTER TABLE "AuthTotpFactor" ADD CONSTRAINT "AuthTotpFactor_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuthRecoveryCode" ADD CONSTRAINT "AuthRecoveryCode_factorId_fkey"
  FOREIGN KEY ("factorId") REFERENCES "AuthTotpFactor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
