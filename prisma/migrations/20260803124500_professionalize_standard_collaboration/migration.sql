-- Standard modules iteration 03: additive collaboration, messaging, calls, announcements and moderation foundations.

ALTER TABLE "CollaborationGroup"
  ADD COLUMN IF NOT EXISTS "contextType" TEXT NOT NULL DEFAULT 'PERSONAL',
  ADD COLUMN IF NOT EXISTS "directKey" TEXT,
  ADD COLUMN IF NOT EXISTS "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "closedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "closedById" TEXT,
  ADD COLUMN IF NOT EXISTS "rulesJson" JSONB;

CREATE UNIQUE INDEX IF NOT EXISTS "CollaborationGroup_directKey_key" ON "CollaborationGroup"("directKey");
CREATE INDEX IF NOT EXISTS "CollaborationGroup_contextType_status_lastActivityAt_idx" ON "CollaborationGroup"("contextType", "status", "lastActivityAt");

ALTER TABLE "CollaborationGroupMember"
  ADD COLUMN IF NOT EXISTS "lastReadMessageId" TEXT,
  ADD COLUMN IF NOT EXISTS "lastReadAt" TIMESTAMP(3);

ALTER TABLE "CollaborationGroupMessage"
  ADD COLUMN IF NOT EXISTS "clientMessageId" TEXT,
  ADD COLUMN IF NOT EXISTS "threadRootId" TEXT,
  ADD COLUMN IF NOT EXISTS "editedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "pinnedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "pinnedById" TEXT,
  ADD COLUMN IF NOT EXISTS "deletionScope" TEXT,
  ADD COLUMN IF NOT EXISTS "deletionReason" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "CollaborationGroupMessage_groupId_authorId_clientMessageId_key" ON "CollaborationGroupMessage"("groupId", "authorId", "clientMessageId");
CREATE INDEX IF NOT EXISTS "CollaborationGroupMessage_groupId_pinnedAt_idx" ON "CollaborationGroupMessage"("groupId", "pinnedAt");
CREATE INDEX IF NOT EXISTS "CollaborationGroupMessage_threadRootId_createdAt_idx" ON "CollaborationGroupMessage"("threadRootId", "createdAt");

ALTER TABLE "CollaborationGroupCall"
  ADD COLUMN IF NOT EXISTS "ringExpiresAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "acceptedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "failureReason" TEXT;

ALTER TABLE "Announcement"
  ADD COLUMN IF NOT EXISTS "audienceJson" JSONB,
  ADD COLUMN IF NOT EXISTS "commentsEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "scheduledAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "publishedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;
CREATE INDEX IF NOT EXISTS "Announcement_scheduledAt_status_idx" ON "Announcement"("scheduledAt", "status");

ALTER TABLE "AnnouncementComment"
  ADD COLUMN IF NOT EXISTS "moderationStatus" TEXT NOT NULL DEFAULT 'VISIBLE',
  ADD COLUMN IF NOT EXISTS "editedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "deletedById" TEXT,
  ADD COLUMN IF NOT EXISTS "restoredAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE INDEX IF NOT EXISTS "AnnouncementComment_announcementId_moderationStatus_deletedAt_createdAt_idx" ON "AnnouncementComment"("announcementId", "moderationStatus", "deletedAt", "createdAt");

ALTER TABLE "AnnouncementReport"
  ADD COLUMN IF NOT EXISTS "moderatorId" TEXT,
  ADD COLUMN IF NOT EXISTS "decision" TEXT,
  ADD COLUMN IF NOT EXISTS "resolvedAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "CollaborationMessageReaction" (
  "id" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "reactionType" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CollaborationMessageReaction_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CollaborationMessageReaction_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "CollaborationGroupMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "CollaborationMessageReaction_messageId_userId_reactionType_key" ON "CollaborationMessageReaction"("messageId", "userId", "reactionType");
CREATE INDEX IF NOT EXISTS "CollaborationMessageReaction_groupId_messageId_createdAt_idx" ON "CollaborationMessageReaction"("groupId", "messageId", "createdAt");
CREATE INDEX IF NOT EXISTS "CollaborationMessageReaction_userId_createdAt_idx" ON "CollaborationMessageReaction"("userId", "createdAt");

CREATE TABLE IF NOT EXISTS "CollaborationMessageAttachment" (
  "id" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "uploaderId" TEXT NOT NULL,
  "storageBucket" TEXT NOT NULL,
  "storagePath" TEXT NOT NULL,
  "originalName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "checksum" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "CollaborationMessageAttachment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CollaborationMessageAttachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "CollaborationGroupMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "CollaborationMessageAttachment_groupId_messageId_createdAt_idx" ON "CollaborationMessageAttachment"("groupId", "messageId", "createdAt");
CREATE INDEX IF NOT EXISTS "CollaborationMessageAttachment_uploaderId_createdAt_idx" ON "CollaborationMessageAttachment"("uploaderId", "createdAt");
CREATE INDEX IF NOT EXISTS "CollaborationMessageAttachment_status_deletedAt_idx" ON "CollaborationMessageAttachment"("status", "deletedAt");

CREATE TABLE IF NOT EXISTS "CollaborationMessageReport" (
  "id" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "reporterId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "description" TEXT,
  "priority" TEXT NOT NULL DEFAULT 'NORMAL',
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "moderatorId" TEXT,
  "decision" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CollaborationMessageReport_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CollaborationMessageReport_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "CollaborationGroupMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "CollaborationMessageReport_messageId_reporterId_key" ON "CollaborationMessageReport"("messageId", "reporterId");
CREATE INDEX IF NOT EXISTS "CollaborationMessageReport_groupId_status_createdAt_idx" ON "CollaborationMessageReport"("groupId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "CollaborationMessageReport_moderatorId_status_createdAt_idx" ON "CollaborationMessageReport"("moderatorId", "status", "createdAt");

CREATE TABLE IF NOT EXISTS "CollaborationUserBlock" (
  "id" TEXT NOT NULL,
  "blockerId" TEXT NOT NULL,
  "blockedId" TEXT NOT NULL,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMP(3),
  CONSTRAINT "CollaborationUserBlock_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "CollaborationUserBlock_blockerId_blockedId_key" ON "CollaborationUserBlock"("blockerId", "blockedId");
CREATE INDEX IF NOT EXISTS "CollaborationUserBlock_blockedId_revokedAt_createdAt_idx" ON "CollaborationUserBlock"("blockedId", "revokedAt", "createdAt");
CREATE INDEX IF NOT EXISTS "CollaborationUserBlock_blockerId_revokedAt_createdAt_idx" ON "CollaborationUserBlock"("blockerId", "revokedAt", "createdAt");

CREATE TABLE IF NOT EXISTS "CollaborationModerationAction" (
  "id" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "targetType" TEXT NOT NULL,
  "targetId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "reason" TEXT,
  "metadataJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CollaborationModerationAction_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CollaborationModerationAction_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "CollaborationGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "CollaborationModerationAction_groupId_targetType_targetId_createdAt_idx" ON "CollaborationModerationAction"("groupId", "targetType", "targetId", "createdAt");
CREATE INDEX IF NOT EXISTS "CollaborationModerationAction_actorId_createdAt_idx" ON "CollaborationModerationAction"("actorId", "createdAt");

CREATE TABLE IF NOT EXISTS "AnnouncementMedia" (
  "id" TEXT NOT NULL,
  "announcementId" TEXT NOT NULL,
  "uploaderId" TEXT NOT NULL,
  "storagePath" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "originalName" TEXT,
  "altText" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "AnnouncementMedia_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AnnouncementMedia_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "Announcement"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "AnnouncementMedia_announcementId_status_sortOrder_idx" ON "AnnouncementMedia"("announcementId", "status", "sortOrder");
CREATE INDEX IF NOT EXISTS "AnnouncementMedia_uploaderId_createdAt_idx" ON "AnnouncementMedia"("uploaderId", "createdAt");

CREATE TABLE IF NOT EXISTS "AnnouncementCommentReaction" (
  "id" TEXT NOT NULL,
  "announcementId" TEXT NOT NULL,
  "commentId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "reactionType" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AnnouncementCommentReaction_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AnnouncementCommentReaction_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "AnnouncementComment"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "AnnouncementCommentReaction_commentId_userId_reactionType_key" ON "AnnouncementCommentReaction"("commentId", "userId", "reactionType");
CREATE INDEX IF NOT EXISTS "AnnouncementCommentReaction_announcementId_commentId_createdAt_idx" ON "AnnouncementCommentReaction"("announcementId", "commentId", "createdAt");
CREATE INDEX IF NOT EXISTS "AnnouncementCommentReaction_userId_createdAt_idx" ON "AnnouncementCommentReaction"("userId", "createdAt");

CREATE TABLE IF NOT EXISTS "AnnouncementCommentMention" (
  "id" TEXT NOT NULL,
  "announcementId" TEXT NOT NULL,
  "commentId" TEXT NOT NULL,
  "mentionedUserId" TEXT NOT NULL,
  "isRead" BOOLEAN NOT NULL DEFAULT false,
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AnnouncementCommentMention_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AnnouncementCommentMention_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "AnnouncementComment"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "AnnouncementCommentMention_commentId_mentionedUserId_key" ON "AnnouncementCommentMention"("commentId", "mentionedUserId");
CREATE INDEX IF NOT EXISTS "AnnouncementCommentMention_announcementId_mentionedUserId_isRead_createdAt_idx" ON "AnnouncementCommentMention"("announcementId", "mentionedUserId", "isRead", "createdAt");

CREATE TABLE IF NOT EXISTS "AnnouncementCommentReport" (
  "id" TEXT NOT NULL,
  "announcementId" TEXT NOT NULL,
  "commentId" TEXT NOT NULL,
  "reporterId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "description" TEXT,
  "priority" TEXT NOT NULL DEFAULT 'NORMAL',
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "moderatorId" TEXT,
  "decision" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AnnouncementCommentReport_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AnnouncementCommentReport_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "AnnouncementComment"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "AnnouncementCommentReport_commentId_reporterId_key" ON "AnnouncementCommentReport"("commentId", "reporterId");
CREATE INDEX IF NOT EXISTS "AnnouncementCommentReport_announcementId_status_priority_createdAt_idx" ON "AnnouncementCommentReport"("announcementId", "status", "priority", "createdAt");
CREATE INDEX IF NOT EXISTS "AnnouncementCommentReport_moderatorId_status_createdAt_idx" ON "AnnouncementCommentReport"("moderatorId", "status", "createdAt");
