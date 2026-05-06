CREATE TABLE IF NOT EXISTS "PendingRegistration" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "companyName" TEXT,
  "phone" TEXT,
  "role" "UserRole" NOT NULL DEFAULT 'CLIENT',
  "otpHash" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PendingRegistration_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PendingRegistration_email_key" ON "PendingRegistration"("email");
CREATE INDEX IF NOT EXISTS "PendingRegistration_email_expiresAt_idx" ON "PendingRegistration"("email", "expiresAt");
CREATE INDEX IF NOT EXISTS "PendingRegistration_expiresAt_idx" ON "PendingRegistration"("expiresAt");

ALTER TABLE "AppSetting"
  ADD COLUMN IF NOT EXISTS "signUpOtpEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "signUpOtpExpirationMinutes" INTEGER NOT NULL DEFAULT 10;

CREATE TABLE IF NOT EXISTS "AuditLog" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "action" TEXT NOT NULL,
  "entity" TEXT NOT NULL,
  "entityId" TEXT,
  "metadata" JSONB,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "AuditLog_userId_createdAt_idx" ON "AuditLog"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");
CREATE INDEX IF NOT EXISTS "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");

CREATE TABLE IF NOT EXISTS "WebhookEvent" (
  "id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'RECEIVED',
  "payload" JSONB NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "processedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "WebhookEvent_provider_eventType_createdAt_idx" ON "WebhookEvent"("provider", "eventType", "createdAt");
CREATE INDEX IF NOT EXISTS "WebhookEvent_status_createdAt_idx" ON "WebhookEvent"("status", "createdAt");

CREATE TABLE IF NOT EXISTS "ApiLog" (
  "id" TEXT NOT NULL,
  "method" TEXT NOT NULL,
  "path" TEXT NOT NULL,
  "statusCode" INTEGER NOT NULL,
  "userId" TEXT,
  "durationMs" INTEGER,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ApiLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ApiLog_path_createdAt_idx" ON "ApiLog"("path", "createdAt");
CREATE INDEX IF NOT EXISTS "ApiLog_statusCode_createdAt_idx" ON "ApiLog"("statusCode", "createdAt");
CREATE INDEX IF NOT EXISTS "ApiLog_userId_createdAt_idx" ON "ApiLog"("userId", "createdAt");
