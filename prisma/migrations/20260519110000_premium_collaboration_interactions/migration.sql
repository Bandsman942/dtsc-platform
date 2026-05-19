-- Premium interactions, announcement actions, comment mentions and collaboration groups.

ALTER TABLE "Announcement"
  ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS "category" TEXT NOT NULL DEFAULT 'GENERAL',
  ADD COLUMN IF NOT EXISTS "visibility" TEXT NOT NULL DEFAULT 'INTERNAL',
  ADD COLUMN IF NOT EXISTS "viewCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "shareCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "reportCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "lastAction" TEXT,
  ADD COLUMN IF NOT EXISTS "pinnedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Announcement_status_createdAt_idx" ON "Announcement"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "Announcement_deletedAt_archivedAt_idx" ON "Announcement"("deletedAt", "archivedAt");

CREATE TABLE IF NOT EXISTS "AnnouncementShare" (
  "id" TEXT NOT NULL,
  "announcementId" TEXT NOT NULL,
  "senderId" TEXT NOT NULL,
  "recipientId" TEXT NOT NULL,
  "message" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AnnouncementShare_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AnnouncementShare_announcementId_senderId_recipientId_key" ON "AnnouncementShare"("announcementId", "senderId", "recipientId");
CREATE INDEX IF NOT EXISTS "AnnouncementShare_recipientId_createdAt_idx" ON "AnnouncementShare"("recipientId", "createdAt");
CREATE INDEX IF NOT EXISTS "AnnouncementShare_senderId_createdAt_idx" ON "AnnouncementShare"("senderId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "AnnouncementShare" ADD CONSTRAINT "AnnouncementShare_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "Announcement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "AnnouncementShare" ADD CONSTRAINT "AnnouncementShare_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "AnnouncementShare" ADD CONSTRAINT "AnnouncementShare_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "AnnouncementReport" (
  "id" TEXT NOT NULL,
  "announcementId" TEXT NOT NULL,
  "reporterId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "description" TEXT,
  "priority" TEXT NOT NULL DEFAULT 'NORMAL',
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AnnouncementReport_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AnnouncementReport_announcementId_status_idx" ON "AnnouncementReport"("announcementId", "status");
CREATE INDEX IF NOT EXISTS "AnnouncementReport_reporterId_createdAt_idx" ON "AnnouncementReport"("reporterId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "AnnouncementReport" ADD CONSTRAINT "AnnouncementReport_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "Announcement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "AnnouncementReport" ADD CONSTRAINT "AnnouncementReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "CooCommentMention" (
  "id" TEXT NOT NULL,
  "commentId" TEXT NOT NULL,
  "mentionedUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CooCommentMention_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CooCommentMention_commentId_mentionedUserId_key" ON "CooCommentMention"("commentId", "mentionedUserId");
CREATE INDEX IF NOT EXISTS "CooCommentMention_mentionedUserId_createdAt_idx" ON "CooCommentMention"("mentionedUserId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "CooCommentMention" ADD CONSTRAINT "CooCommentMention_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "CooComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "CooCommentMention" ADD CONSTRAINT "CooCommentMention_mentionedUserId_fkey" FOREIGN KEY ("mentionedUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "CollaborationGroup" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "groupType" TEXT NOT NULL DEFAULT 'PROJECT',
  "ownerId" TEXT NOT NULL,
  "companyId" TEXT,
  "visibility" TEXT NOT NULL DEFAULT 'PRIVATE',
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CollaborationGroup_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CollaborationGroup_ownerId_status_updatedAt_idx" ON "CollaborationGroup"("ownerId", "status", "updatedAt");
CREATE INDEX IF NOT EXISTS "CollaborationGroup_companyId_idx" ON "CollaborationGroup"("companyId");

DO $$ BEGIN
  ALTER TABLE "CollaborationGroup" ADD CONSTRAINT "CollaborationGroup_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "CollaborationGroupMember" (
  "id" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'MEMBER',
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leftAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CollaborationGroupMember_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CollaborationGroupMember_groupId_userId_key" ON "CollaborationGroupMember"("groupId", "userId");
CREATE INDEX IF NOT EXISTS "CollaborationGroupMember_userId_status_updatedAt_idx" ON "CollaborationGroupMember"("userId", "status", "updatedAt");
CREATE INDEX IF NOT EXISTS "CollaborationGroupMember_groupId_role_idx" ON "CollaborationGroupMember"("groupId", "role");

DO $$ BEGIN
  ALTER TABLE "CollaborationGroupMember" ADD CONSTRAINT "CollaborationGroupMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "CollaborationGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "CollaborationGroupMember" ADD CONSTRAINT "CollaborationGroupMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "CollaborationGroupInvitation" (
  "id" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "invitedById" TEXT NOT NULL,
  "invitedUserId" TEXT,
  "invitedEmail" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "invitationMessage" TEXT,
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "respondedAt" TIMESTAMP(3),
  CONSTRAINT "CollaborationGroupInvitation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CollaborationGroupInvitation_groupId_status_idx" ON "CollaborationGroupInvitation"("groupId", "status");
CREATE INDEX IF NOT EXISTS "CollaborationGroupInvitation_invitedUserId_status_createdAt_idx" ON "CollaborationGroupInvitation"("invitedUserId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "CollaborationGroupInvitation_invitedEmail_status_idx" ON "CollaborationGroupInvitation"("invitedEmail", "status");

DO $$ BEGIN
  ALTER TABLE "CollaborationGroupInvitation" ADD CONSTRAINT "CollaborationGroupInvitation_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "CollaborationGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "CollaborationGroupInvitation" ADD CONSTRAINT "CollaborationGroupInvitation_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "CollaborationGroupInvitation" ADD CONSTRAINT "CollaborationGroupInvitation_invitedUserId_fkey" FOREIGN KEY ("invitedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "CollaborationGroupMessage" (
  "id" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "messageType" TEXT NOT NULL DEFAULT 'TEXT',
  "replyToId" TEXT,
  "sharedChatbotConversationId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'SENT',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "CollaborationGroupMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CollaborationGroupMessage_groupId_createdAt_idx" ON "CollaborationGroupMessage"("groupId", "createdAt");
CREATE INDEX IF NOT EXISTS "CollaborationGroupMessage_authorId_createdAt_idx" ON "CollaborationGroupMessage"("authorId", "createdAt");
CREATE INDEX IF NOT EXISTS "CollaborationGroupMessage_sharedChatbotConversationId_idx" ON "CollaborationGroupMessage"("sharedChatbotConversationId");

DO $$ BEGIN
  ALTER TABLE "CollaborationGroupMessage" ADD CONSTRAINT "CollaborationGroupMessage_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "CollaborationGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "CollaborationGroupMessage" ADD CONSTRAINT "CollaborationGroupMessage_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "CollaborationGroupMessage" ADD CONSTRAINT "CollaborationGroupMessage_replyToId_fkey" FOREIGN KEY ("replyToId") REFERENCES "CollaborationGroupMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "CollaborationGroupMessage" ADD CONSTRAINT "CollaborationGroupMessage_sharedChatbotConversationId_fkey" FOREIGN KEY ("sharedChatbotConversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "CollaborationMessageMention" (
  "id" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "mentionedUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CollaborationMessageMention_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CollaborationMessageMention_messageId_mentionedUserId_key" ON "CollaborationMessageMention"("messageId", "mentionedUserId");
CREATE INDEX IF NOT EXISTS "CollaborationMessageMention_mentionedUserId_createdAt_idx" ON "CollaborationMessageMention"("mentionedUserId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "CollaborationMessageMention" ADD CONSTRAINT "CollaborationMessageMention_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "CollaborationGroupMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "CollaborationMessageMention" ADD CONSTRAINT "CollaborationMessageMention_mentionedUserId_fkey" FOREIGN KEY ("mentionedUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "CollaborationGroupAuditLog" (
  "id" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "actorId" TEXT,
  "action" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CollaborationGroupAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CollaborationGroupAuditLog_groupId_createdAt_idx" ON "CollaborationGroupAuditLog"("groupId", "createdAt");
CREATE INDEX IF NOT EXISTS "CollaborationGroupAuditLog_actorId_createdAt_idx" ON "CollaborationGroupAuditLog"("actorId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "CollaborationGroupAuditLog" ADD CONSTRAINT "CollaborationGroupAuditLog_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "CollaborationGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "CollaborationGroupAuditLog" ADD CONSTRAINT "CollaborationGroupAuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
