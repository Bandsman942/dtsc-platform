-- Additive, versioned central AI assistant settings; existing policy rows remain valid.
ALTER TABLE "AiPlatformRuntimePolicy" ADD COLUMN "assistantSettings" JSONB NOT NULL DEFAULT '{}';
