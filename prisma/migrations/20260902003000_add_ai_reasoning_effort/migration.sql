ALTER TABLE "ChatConversationPreference"
ADD COLUMN "reasoningEffort" TEXT NOT NULL DEFAULT 'AUTO';

ALTER TABLE "EnterpriseAiConversationPreference"
ADD COLUMN "reasoningEffort" TEXT NOT NULL DEFAULT 'AUTO';

ALTER TABLE "EnterpriseAiConversationPreference"
ALTER COLUMN "useTools" SET DEFAULT false;

ALTER TABLE "ChatConversationPreference"
ALTER COLUMN "useCompanyContext" SET DEFAULT false;
