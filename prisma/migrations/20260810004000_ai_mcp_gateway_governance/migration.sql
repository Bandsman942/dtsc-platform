CREATE TABLE "AiMcpDiscoverySnapshot" (
    "id" TEXT NOT NULL,
    "serverCode" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "toolsJson" JSONB NOT NULL,
    "resourcesJson" JSONB NOT NULL,
    "promptsJson" JSONB NOT NULL,
    "compatible" BOOLEAN NOT NULL DEFAULT true,
    "changeJson" JSONB,
    "discoveredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiMcpDiscoverySnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiMcpAuditEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "organizationId" TEXT,
    "serverCode" TEXT NOT NULL,
    "dtscToolCode" TEXT,
    "remoteToolName" TEXT,
    "eventType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "reasonCode" TEXT,
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiMcpAuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AiMcpDiscoverySnapshot_serverCode_version_key" ON "AiMcpDiscoverySnapshot"("serverCode", "version");
CREATE INDEX "AiMcpDiscoverySnapshot_serverCode_discoveredAt_idx" ON "AiMcpDiscoverySnapshot"("serverCode", "discoveredAt");
CREATE INDEX "AiMcpAuditEvent_serverCode_eventType_createdAt_idx" ON "AiMcpAuditEvent"("serverCode", "eventType", "createdAt");
CREATE INDEX "AiMcpAuditEvent_userId_organizationId_createdAt_idx" ON "AiMcpAuditEvent"("userId", "organizationId", "createdAt");
CREATE INDEX "AiMcpAuditEvent_dtscToolCode_status_createdAt_idx" ON "AiMcpAuditEvent"("dtscToolCode", "status", "createdAt");
