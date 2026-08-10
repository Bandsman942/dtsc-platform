CREATE TABLE "AiProviderAttempt" (
    "id" TEXT NOT NULL,
    "routeRequestId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT,
    "contextCode" TEXT NOT NULL,
    "taskType" TEXT NOT NULL,
    "providerCode" TEXT NOT NULL,
    "modelCode" TEXT NOT NULL,
    "providerModelId" TEXT NOT NULL,
    "attemptIndex" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'STARTED',
    "reasonCode" TEXT,
    "durationMs" INTEGER,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiProviderAttempt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AiProviderAttempt_routeRequestId_attemptIndex_key"
ON "AiProviderAttempt"("routeRequestId", "attemptIndex");

CREATE INDEX "AiProviderAttempt_organizationId_providerCode_modelCode_createdAt_idx"
ON "AiProviderAttempt"("organizationId", "providerCode", "modelCode", "createdAt");

CREATE INDEX "AiProviderAttempt_status_reasonCode_createdAt_idx"
ON "AiProviderAttempt"("status", "reasonCode", "createdAt");
