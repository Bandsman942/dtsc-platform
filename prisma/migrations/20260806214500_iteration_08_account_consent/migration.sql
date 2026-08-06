CREATE TABLE "AccountConsentRecord" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "consentType" TEXT NOT NULL,
    "documentVersion" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'fr',
    "statementDigest" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadataJson" JSONB,
    CONSTRAINT "AccountConsentRecord_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AccountConsentRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "AccountConsentRecord_user_type_version_key" ON "AccountConsentRecord"("userId", "consentType", "documentVersion");
CREATE INDEX "AccountConsentRecord_user_accepted_idx" ON "AccountConsentRecord"("userId", "acceptedAt");
CREATE INDEX "AccountConsentRecord_type_version_accepted_idx" ON "AccountConsentRecord"("consentType", "documentVersion", "acceptedAt");
