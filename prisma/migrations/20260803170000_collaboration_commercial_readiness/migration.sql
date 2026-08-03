CREATE TABLE "CollaborationConversationFilter" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "criteriaJson" JSONB NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CollaborationConversationFilter_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CollaborationConversationFilter_userId_name_key"
ON "CollaborationConversationFilter"("userId", "name");

CREATE INDEX "CollaborationConversationFilter_userId_position_updatedAt_idx"
ON "CollaborationConversationFilter"("userId", "position", "updatedAt");
