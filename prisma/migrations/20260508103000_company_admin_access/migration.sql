ALTER TABLE "AppSetting" ADD COLUMN "adminRoleAccess" JSONB NOT NULL DEFAULT '{}';

CREATE TABLE "CompanyProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationName" TEXT NOT NULL,
    "legalForm" TEXT,
    "sector" TEXT,
    "sizeRange" TEXT,
    "country" TEXT,
    "city" TEXT,
    "website" TEXT,
    "description" TEXT,
    "mission" TEXT,
    "productsServices" TEXT,
    "customers" TEXT,
    "markets" TEXT,
    "competitors" TEXT,
    "processes" TEXT,
    "tools" TEXT,
    "dataSystems" TEXT,
    "compliance" TEXT,
    "challenges" TEXT,
    "goals" TEXT,
    "kpis" TEXT,
    "userPosition" TEXT,
    "department" TEXT,
    "responsibilities" TEXT,
    "decisionRole" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CompanyActivity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "frequency" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "tools" TEXT,
    "dataInputs" TEXT,
    "dataOutputs" TEXT,
    "painPoints" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyActivity_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CompanyProfile_userId_key" ON "CompanyProfile"("userId");
CREATE INDEX "CompanyProfile_sector_idx" ON "CompanyProfile"("sector");
CREATE INDEX "CompanyProfile_updatedAt_idx" ON "CompanyProfile"("updatedAt");
CREATE INDEX "CompanyActivity_userId_priority_updatedAt_idx" ON "CompanyActivity"("userId", "priority", "updatedAt");

ALTER TABLE "CompanyProfile" ADD CONSTRAINT "CompanyProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompanyActivity" ADD CONSTRAINT "CompanyActivity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
