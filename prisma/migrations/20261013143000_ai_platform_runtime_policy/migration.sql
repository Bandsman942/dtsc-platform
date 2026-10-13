CREATE TABLE "AiPlatformRuntimePolicy" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "disabledProviderCodes" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "disabledModelCodes" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "agentCeilings" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "updatedByUserId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiPlatformRuntimePolicy_pkey" PRIMARY KEY ("id")
);
