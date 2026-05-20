-- Group audio/video calls and COO meeting call workflow.

ALTER TABLE "CooTask"
  ADD COLUMN IF NOT EXISTS "sourceMeetingId" TEXT,
  ADD COLUMN IF NOT EXISTS "sourceDecisionId" TEXT;

CREATE INDEX IF NOT EXISTS "CooTask_sourceMeetingId_idx" ON "CooTask"("sourceMeetingId");

ALTER TABLE "CooMeeting"
  ADD COLUMN IF NOT EXISTS "meetingMode" TEXT NOT NULL DEFAULT 'COMMENTS_ONLY',
  ADD COLUMN IF NOT EXISTS "linkedEntityType" TEXT,
  ADD COLUMN IF NOT EXISTS "linkedEntityId" TEXT,
  ADD COLUMN IF NOT EXISTS "collaborationGroupId" TEXT,
  ADD COLUMN IF NOT EXISTS "activeCallId" TEXT;

CREATE INDEX IF NOT EXISTS "CooMeeting_meetingMode_status_idx" ON "CooMeeting"("meetingMode", "status");
CREATE INDEX IF NOT EXISTS "CooMeeting_collaborationGroupId_idx" ON "CooMeeting"("collaborationGroupId");

ALTER TABLE "CollaborationGroup"
  ADD COLUMN IF NOT EXISTS "meetingId" TEXT,
  ADD COLUMN IF NOT EXISTS "autoCreated" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "archived" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "CollaborationGroup_meetingId_idx" ON "CollaborationGroup"("meetingId");

CREATE TABLE IF NOT EXISTS "CooMeetingDecision" (
  "id" TEXT NOT NULL,
  "meetingId" TEXT NOT NULL,
  "decisionText" TEXT NOT NULL,
  "responsibleUserId" TEXT,
  "dueDate" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "linkedTaskId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CooMeetingDecision_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CooMeetingDecision_meetingId_status_idx" ON "CooMeetingDecision"("meetingId", "status");
CREATE INDEX IF NOT EXISTS "CooMeetingDecision_responsibleUserId_status_idx" ON "CooMeetingDecision"("responsibleUserId", "status");
CREATE INDEX IF NOT EXISTS "CooMeetingDecision_linkedTaskId_idx" ON "CooMeetingDecision"("linkedTaskId");

CREATE TABLE IF NOT EXISTS "CooMeetingMinutes" (
  "id" TEXT NOT NULL,
  "meetingId" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "validatedById" TEXT,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CooMeetingMinutes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CooMeetingMinutes_meetingId_status_idx" ON "CooMeetingMinutes"("meetingId", "status");
CREATE INDEX IF NOT EXISTS "CooMeetingMinutes_createdById_createdAt_idx" ON "CooMeetingMinutes"("createdById", "createdAt");

CREATE TABLE IF NOT EXISTS "CollaborationGroupCall" (
  "id" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "meetingId" TEXT,
  "callType" TEXT NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'LIVEKIT',
  "roomName" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'RINGING',
  "startedById" TEXT NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CollaborationGroupCall_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CollaborationGroupCall_groupId_status_startedAt_idx" ON "CollaborationGroupCall"("groupId", "status", "startedAt");
CREATE INDEX IF NOT EXISTS "CollaborationGroupCall_meetingId_status_idx" ON "CollaborationGroupCall"("meetingId", "status");
CREATE INDEX IF NOT EXISTS "CollaborationGroupCall_roomName_idx" ON "CollaborationGroupCall"("roomName");
CREATE INDEX IF NOT EXISTS "CollaborationGroupCall_startedById_startedAt_idx" ON "CollaborationGroupCall"("startedById", "startedAt");

CREATE TABLE IF NOT EXISTS "CollaborationGroupCallParticipant" (
  "id" TEXT NOT NULL,
  "callId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "joinedAt" TIMESTAMP(3),
  "leftAt" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'INVITED',
  "microphoneEnabled" BOOLEAN NOT NULL DEFAULT true,
  "cameraEnabled" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CollaborationGroupCallParticipant_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CollaborationGroupCallParticipant_callId_userId_key" ON "CollaborationGroupCallParticipant"("callId", "userId");
CREATE INDEX IF NOT EXISTS "CollaborationGroupCallParticipant_userId_status_idx" ON "CollaborationGroupCallParticipant"("userId", "status");
CREATE INDEX IF NOT EXISTS "CollaborationGroupCallParticipant_callId_status_idx" ON "CollaborationGroupCallParticipant"("callId", "status");

CREATE TABLE IF NOT EXISTS "CollaborationGroupCallEvent" (
  "id" TEXT NOT NULL,
  "callId" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "meetingId" TEXT,
  "userId" TEXT,
  "eventType" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CollaborationGroupCallEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CollaborationGroupCallEvent_callId_createdAt_idx" ON "CollaborationGroupCallEvent"("callId", "createdAt");
CREATE INDEX IF NOT EXISTS "CollaborationGroupCallEvent_groupId_createdAt_idx" ON "CollaborationGroupCallEvent"("groupId", "createdAt");
CREATE INDEX IF NOT EXISTS "CollaborationGroupCallEvent_meetingId_createdAt_idx" ON "CollaborationGroupCallEvent"("meetingId", "createdAt");
CREATE INDEX IF NOT EXISTS "CollaborationGroupCallEvent_userId_createdAt_idx" ON "CollaborationGroupCallEvent"("userId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "CooMeetingDecision" ADD CONSTRAINT "CooMeetingDecision_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "CooMeeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "CooMeetingMinutes" ADD CONSTRAINT "CooMeetingMinutes_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "CooMeeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "CollaborationGroupCall" ADD CONSTRAINT "CollaborationGroupCall_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "CollaborationGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "CollaborationGroupCallParticipant" ADD CONSTRAINT "CollaborationGroupCallParticipant_callId_fkey" FOREIGN KEY ("callId") REFERENCES "CollaborationGroupCall"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "CollaborationGroupCallEvent" ADD CONSTRAINT "CollaborationGroupCallEvent_callId_fkey" FOREIGN KEY ("callId") REFERENCES "CollaborationGroupCall"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
