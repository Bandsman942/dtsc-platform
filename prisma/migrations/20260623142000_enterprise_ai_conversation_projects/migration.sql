-- Add persistent project folders for Enterprise AI conversations.
CREATE TABLE "EnterpriseAiConversationProject" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "EnterpriseAiConversationProject_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "EnterpriseAiConversation"
  ADD COLUMN "projectId" TEXT;

INSERT INTO "EnterpriseAiConversationProject" ("id", "organizationId", "userId", "name", "createdAt", "updatedAt")
SELECT
  'eaip_' || md5("organizationId" || ':' || "userId" || ':' || trim("projectName")) AS "id",
  "organizationId",
  "userId",
  trim("projectName") AS "name",
  MIN("createdAt") AS "createdAt",
  MAX("updatedAt") AS "updatedAt"
FROM "EnterpriseAiConversation"
WHERE "projectName" IS NOT NULL
  AND trim("projectName") <> ''
GROUP BY "organizationId", "userId", trim("projectName")
ON CONFLICT DO NOTHING;

UPDATE "EnterpriseAiConversation"
SET "projectId" = 'eaip_' || md5("organizationId" || ':' || "userId" || ':' || trim("projectName"))
WHERE "projectName" IS NOT NULL
  AND trim("projectName") <> '';

CREATE UNIQUE INDEX "EnterpriseAiConversationProject_organizationId_userId_name_key"
  ON "EnterpriseAiConversationProject"("organizationId", "userId", "name");

CREATE INDEX "EnterpriseAiConversationProject_organizationId_userId_updatedAt_idx"
  ON "EnterpriseAiConversationProject"("organizationId", "userId", "updatedAt");

CREATE INDEX "EnterpriseAiConversation_organizationId_userId_projectId_updatedAt_idx"
  ON "EnterpriseAiConversation"("organizationId", "userId", "projectId", "updatedAt");

ALTER TABLE "EnterpriseAiConversationProject"
  ADD CONSTRAINT "EnterpriseAiConversationProject_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EnterpriseAiConversationProject"
  ADD CONSTRAINT "EnterpriseAiConversationProject_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EnterpriseAiConversation"
  ADD CONSTRAINT "EnterpriseAiConversation_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "EnterpriseAiConversationProject"("id") ON DELETE SET NULL ON UPDATE CASCADE;
