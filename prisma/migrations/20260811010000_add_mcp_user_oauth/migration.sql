CREATE TABLE "McpUserOAuthConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "serverCode" TEXT NOT NULL,
    "encryptedCredentials" TEXT NOT NULL,
    "grantedScopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "expiresAt" TIMESTAMP(3),
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "refreshedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "McpUserOAuthConnection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "McpUserOAuthConnection_user_org_server_key"
ON "McpUserOAuthConnection"("userId", "organizationId", "serverCode");

CREATE INDEX "McpUserOAuthConnection_org_server_idx"
ON "McpUserOAuthConnection"("organizationId", "serverCode");

CREATE INDEX "McpUserOAuthConnection_user_revoked_idx"
ON "McpUserOAuthConnection"("userId", "revokedAt");

ALTER TABLE "McpUserOAuthConnection"
ADD CONSTRAINT "McpUserOAuthConnection_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "McpUserOAuthConnection"
ADD CONSTRAINT "McpUserOAuthConnection_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "McpUserOAuthState" (
    "id" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "serverCode" TEXT NOT NULL,
    "encryptedVerifier" TEXT NOT NULL,
    "redirectPath" TEXT NOT NULL DEFAULT '/ai/apps',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "McpUserOAuthState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "McpUserOAuthState_state_key" ON "McpUserOAuthState"("state");
CREATE INDEX "McpUserOAuthState_user_expires_idx" ON "McpUserOAuthState"("userId", "expiresAt");

ALTER TABLE "McpUserOAuthState"
ADD CONSTRAINT "McpUserOAuthState_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "McpUserOAuthState"
ADD CONSTRAINT "McpUserOAuthState_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
