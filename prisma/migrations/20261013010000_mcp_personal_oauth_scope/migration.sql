-- Allow personal OAuth grants without creating a fictitious Organization.
-- Existing tenant records, foreign keys and encrypted AAD remain compatible.
ALTER TABLE "McpUserOAuthConnection" ALTER COLUMN "organizationId" DROP NOT NULL;
ALTER TABLE "McpUserOAuthState" ALTER COLUMN "organizationId" DROP NOT NULL;

-- PostgreSQL treats NULL as distinct in the existing (userId, orgId, serverCode)
-- unique index. Enforce one personal grant per user/server explicitly.
CREATE UNIQUE INDEX "McpUserOAuthConnection_personal_user_server_key"
ON "McpUserOAuthConnection" ("userId", "serverCode")
WHERE "organizationId" IS NULL;

CREATE INDEX "McpUserOAuthConnection_personal_user_revoked_idx"
ON "McpUserOAuthConnection" ("userId", "revokedAt")
WHERE "organizationId" IS NULL;
