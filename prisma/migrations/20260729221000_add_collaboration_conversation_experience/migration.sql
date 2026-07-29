-- Additive collaboration UX/media extension.
-- Existing CollaborationGroup and CollaborationGroupMessage remain untouched.

CREATE TABLE "CollaborationGroupExperience" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "avatarStorageBucket" TEXT,
    "avatarStoragePath" TEXT,
    "avatarMimeType" TEXT,
    "avatarSizeBytes" INTEGER,
    "avatarUpdatedById" TEXT,
    "avatarUpdatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CollaborationGroupExperience_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CollaborationGroupStory" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "caption" TEXT,
    "storageBucket" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "CollaborationGroupStory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CollaborationVoiceMessage" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "storageBucket" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "waveformJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "CollaborationVoiceMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CollaborationGroupPreference" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "favorite" BOOLEAN NOT NULL DEFAULT false,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "notifications" TEXT NOT NULL DEFAULT 'ALL',
    "mutedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CollaborationGroupPreference_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CollaborationGroupExperience_groupId_key" ON "CollaborationGroupExperience"("groupId");
CREATE INDEX "CollaborationGroupExperience_groupId_updatedAt_idx" ON "CollaborationGroupExperience"("groupId", "updatedAt");

CREATE INDEX "CollaborationGroupStory_groupId_expiresAt_createdAt_idx" ON "CollaborationGroupStory"("groupId", "expiresAt", "createdAt");
CREATE INDEX "CollaborationGroupStory_authorId_createdAt_idx" ON "CollaborationGroupStory"("authorId", "createdAt");

CREATE UNIQUE INDEX "CollaborationVoiceMessage_messageId_key" ON "CollaborationVoiceMessage"("messageId");
CREATE INDEX "CollaborationVoiceMessage_groupId_createdAt_idx" ON "CollaborationVoiceMessage"("groupId", "createdAt");
CREATE INDEX "CollaborationVoiceMessage_authorId_createdAt_idx" ON "CollaborationVoiceMessage"("authorId", "createdAt");

CREATE UNIQUE INDEX "CollaborationGroupPreference_groupId_userId_key" ON "CollaborationGroupPreference"("groupId", "userId");
CREATE INDEX "CollaborationGroupPreference_userId_pinned_favorite_updatedAt_idx" ON "CollaborationGroupPreference"("userId", "pinned", "favorite", "updatedAt");
CREATE INDEX "CollaborationGroupPreference_groupId_userId_idx" ON "CollaborationGroupPreference"("groupId", "userId");

-- Database-level tenant/member data safety without changing legacy tables.
ALTER TABLE "CollaborationGroupExperience"
  ADD CONSTRAINT "CollaborationGroupExperience_groupId_fkey"
  FOREIGN KEY ("groupId") REFERENCES "CollaborationGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CollaborationGroupStory"
  ADD CONSTRAINT "CollaborationGroupStory_groupId_fkey"
  FOREIGN KEY ("groupId") REFERENCES "CollaborationGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CollaborationVoiceMessage"
  ADD CONSTRAINT "CollaborationVoiceMessage_groupId_fkey"
  FOREIGN KEY ("groupId") REFERENCES "CollaborationGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CollaborationVoiceMessage"
  ADD CONSTRAINT "CollaborationVoiceMessage_messageId_fkey"
  FOREIGN KEY ("messageId") REFERENCES "CollaborationGroupMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CollaborationGroupPreference"
  ADD CONSTRAINT "CollaborationGroupPreference_groupId_fkey"
  FOREIGN KEY ("groupId") REFERENCES "CollaborationGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
