CREATE TABLE "AiMcpControlState" (
  "serverCode" TEXT NOT NULL,
  "suspended" BOOLEAN NOT NULL DEFAULT false,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "reason" TEXT NOT NULL,
  "updatedByUserId" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiMcpControlState_pkey" PRIMARY KEY ("serverCode")
);
