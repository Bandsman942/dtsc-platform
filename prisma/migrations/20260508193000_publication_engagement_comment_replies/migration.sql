-- Public publication engagement and nested comments for announcements.
ALTER TABLE "AnnouncementComment"
ADD COLUMN "parentId" TEXT;

ALTER TABLE "AnnouncementComment"
ADD CONSTRAINT "AnnouncementComment_parentId_fkey"
FOREIGN KEY ("parentId") REFERENCES "AnnouncementComment"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "AnnouncementComment_parentId_idx" ON "AnnouncementComment"("parentId");

CREATE TABLE "PublicPublicationComment" (
  "id" TEXT NOT NULL,
  "publicationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "parentId" TEXT,
  "content" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PublicPublicationComment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PublicPublicationComment_publicationId_createdAt_idx" ON "PublicPublicationComment"("publicationId", "createdAt");
CREATE INDEX "PublicPublicationComment_userId_idx" ON "PublicPublicationComment"("userId");
CREATE INDEX "PublicPublicationComment_parentId_idx" ON "PublicPublicationComment"("parentId");

ALTER TABLE "PublicPublicationComment"
ADD CONSTRAINT "PublicPublicationComment_publicationId_fkey"
FOREIGN KEY ("publicationId") REFERENCES "PublicPublication"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PublicPublicationComment"
ADD CONSTRAINT "PublicPublicationComment_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PublicPublicationComment"
ADD CONSTRAINT "PublicPublicationComment_parentId_fkey"
FOREIGN KEY ("parentId") REFERENCES "PublicPublicationComment"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "PublicPublicationReaction" (
  "id" TEXT NOT NULL,
  "publicationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "value" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PublicPublicationReaction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PublicPublicationReaction_publicationId_userId_key" ON "PublicPublicationReaction"("publicationId", "userId");
CREATE INDEX "PublicPublicationReaction_userId_idx" ON "PublicPublicationReaction"("userId");

ALTER TABLE "PublicPublicationReaction"
ADD CONSTRAINT "PublicPublicationReaction_publicationId_fkey"
FOREIGN KEY ("publicationId") REFERENCES "PublicPublication"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PublicPublicationReaction"
ADD CONSTRAINT "PublicPublicationReaction_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
