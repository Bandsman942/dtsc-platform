-- User preferences for chatbot, notifications and PWA push subscriptions.
ALTER TABLE "User" ADD COLUMN "preferredModel" TEXT;
ALTER TABLE "User" ADD COLUMN "notifySupportEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN "notifyUsageEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN "notifyBroadcastEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN "pushNotificationsEnabled" BOOLEAN NOT NULL DEFAULT false;

-- Lightweight project/folder organization for chat history.
ALTER TABLE "Conversation" ADD COLUMN "projectName" TEXT;
CREATE INDEX "Conversation_userId_projectName_updatedAt_idx" ON "Conversation"("userId", "projectName", "updatedAt");

-- Browser/PWA notification subscriptions. Actual visible notifications are triggered
-- from the authenticated app session; this table keeps endpoint consent auditable.
CREATE TABLE "PushSubscription" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "endpoint" TEXT NOT NULL,
  "p256dh" TEXT NOT NULL,
  "auth" TEXT NOT NULL,
  "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");
CREATE INDEX "PushSubscription_userId_updatedAt_idx" ON "PushSubscription"("userId", "updatedAt");
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
