ALTER TABLE "User"
ADD COLUMN "jobTitle" TEXT,
ADD COLUMN "bio" TEXT,
ADD COLUMN "location" TEXT,
ADD COLUMN "website" TEXT,
ADD COLUMN "avatarUrl" TEXT,
ADD COLUMN "publicProfileConsent" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "User_publicProfileConsent_idx" ON "User"("publicProfileConsent");
