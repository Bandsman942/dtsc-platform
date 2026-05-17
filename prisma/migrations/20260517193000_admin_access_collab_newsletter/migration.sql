ALTER TABLE "NewsletterSubscriber"
  ADD COLUMN "phone" TEXT,
  ADD COLUMN "jobTitle" TEXT,
  ADD COLUMN "signupPage" TEXT,
  ADD COLUMN "commercialConsent" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "internalNotes" TEXT,
  ADD COLUMN "convertedToUser" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "convertedUserId" TEXT,
  ADD COLUMN "convertedAt" TIMESTAMP(3);

CREATE INDEX "NewsletterSubscriber_convertedUserId_idx" ON "NewsletterSubscriber"("convertedUserId");

ALTER TABLE "CooMeeting"
  ADD COLUMN "sourceModule" TEXT,
  ADD COLUMN "targetSection" TEXT,
  ADD COLUMN "confidentialityLevel" TEXT NOT NULL DEFAULT 'INTERNAL';

ALTER TABLE "LegalCase"
  ADD COLUMN "sourceModule" TEXT,
  ADD COLUMN "targetSection" TEXT;

ALTER TABLE "LegalContract"
  ADD COLUMN "sourceModule" TEXT,
  ADD COLUMN "targetSection" TEXT;

ALTER TABLE "LegalRisk"
  ADD COLUMN "sourceModule" TEXT,
  ADD COLUMN "targetSection" TEXT;

ALTER TABLE "LegalDispute"
  ADD COLUMN "sourceModule" TEXT,
  ADD COLUMN "targetSection" TEXT;

ALTER TABLE "LegalRequest"
  ADD COLUMN "sourceModule" TEXT,
  ADD COLUMN "targetSection" TEXT;
