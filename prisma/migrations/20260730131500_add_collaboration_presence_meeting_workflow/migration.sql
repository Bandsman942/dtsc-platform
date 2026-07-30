-- Additive collaboration presence journal and scheduled meeting workflow.
-- Existing groups, messages, calls, COO meetings and minutes remain intact.

CREATE TABLE IF NOT EXISTS "CollaborationPresenceSession" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "clientSessionId" TEXT NOT NULL,
  "clientType" TEXT NOT NULL DEFAULT 'UNKNOWN',
  "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastHeartbeatAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "disconnectedAt" TIMESTAMP(3),
  "disconnectReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CollaborationPresenceSession_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CollaborationPresenceSession_userId_connectedAt_idx"
  ON "CollaborationPresenceSession"("userId", "connectedAt");
CREATE INDEX IF NOT EXISTS "CollaborationPresenceSession_userId_clientSessionId_disconnectedAt_idx"
  ON "CollaborationPresenceSession"("userId", "clientSessionId", "disconnectedAt");
CREATE INDEX IF NOT EXISTS "CollaborationPresenceSession_lastHeartbeatAt_disconnectedAt_idx"
  ON "CollaborationPresenceSession"("lastHeartbeatAt", "disconnectedAt");
CREATE INDEX IF NOT EXISTS "CollaborationPresenceSession_clientType_connectedAt_idx"
  ON "CollaborationPresenceSession"("clientType", "connectedAt");

CREATE TABLE IF NOT EXISTS "CollaborationMeetingLink" (
  "id" TEXT NOT NULL,
  "meetingId" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "callType" TEXT NOT NULL,
  "scheduledAt" TIMESTAMP(3) NOT NULL,
  "availableFrom" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
  "lastCallId" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CollaborationMeetingLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CollaborationMeetingLink_meetingId_key"
  ON "CollaborationMeetingLink"("meetingId");
CREATE UNIQUE INDEX IF NOT EXISTS "CollaborationMeetingLink_messageId_key"
  ON "CollaborationMeetingLink"("messageId");
CREATE INDEX IF NOT EXISTS "CollaborationMeetingLink_groupId_scheduledAt_status_idx"
  ON "CollaborationMeetingLink"("groupId", "scheduledAt", "status");
CREATE INDEX IF NOT EXISTS "CollaborationMeetingLink_lastCallId_idx"
  ON "CollaborationMeetingLink"("lastCallId");

CREATE TABLE IF NOT EXISTS "CollaborationMeetingMinutesPublication" (
  "id" TEXT NOT NULL,
  "meetingId" TEXT NOT NULL,
  "callId" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "promptMessageId" TEXT NOT NULL,
  "summaryMessageId" TEXT,
  "minutesId" TEXT,
  "summary" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CollaborationMeetingMinutesPublication_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CollaborationMeetingMinutesPublication_callId_key"
  ON "CollaborationMeetingMinutesPublication"("callId");
CREATE UNIQUE INDEX IF NOT EXISTS "CollaborationMeetingMinutesPublication_promptMessageId_key"
  ON "CollaborationMeetingMinutesPublication"("promptMessageId");
CREATE UNIQUE INDEX IF NOT EXISTS "CollaborationMeetingMinutesPublication_summaryMessageId_key"
  ON "CollaborationMeetingMinutesPublication"("summaryMessageId");
CREATE INDEX IF NOT EXISTS "CollaborationMeetingMinutesPublication_meetingId_status_createdAt_idx"
  ON "CollaborationMeetingMinutesPublication"("meetingId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "CollaborationMeetingMinutesPublication_groupId_createdAt_idx"
  ON "CollaborationMeetingMinutesPublication"("groupId", "createdAt");
CREATE INDEX IF NOT EXISTS "CollaborationMeetingMinutesPublication_minutesId_idx"
  ON "CollaborationMeetingMinutesPublication"("minutesId");
