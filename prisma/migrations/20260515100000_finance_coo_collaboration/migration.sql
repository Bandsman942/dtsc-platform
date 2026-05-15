-- COO collaboration comments, workflow sharing and operational report routing.
ALTER TABLE "CooOperationalReport"
  ADD COLUMN IF NOT EXISTS "recipientEmployeeId" TEXT,
  ADD COLUMN IF NOT EXISTS "recipientName" TEXT,
  ADD COLUMN IF NOT EXISTS "priority" TEXT NOT NULL DEFAULT 'NORMAL',
  ADD COLUMN IF NOT EXISTS "content" TEXT,
  ADD COLUMN IF NOT EXISTS "readAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "treatedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "CooOperationalReport_recipientEmployeeId_idx" ON "CooOperationalReport"("recipientEmployeeId");

CREATE TABLE IF NOT EXISTS "CooComment" (
  "id" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CooComment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CooComment_entityType_entityId_createdAt_idx" ON "CooComment"("entityType", "entityId", "createdAt");
CREATE INDEX IF NOT EXISTS "CooComment_authorId_idx" ON "CooComment"("authorId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'CooComment_authorId_fkey'
  ) THEN
    ALTER TABLE "CooComment"
      ADD CONSTRAINT "CooComment_authorId_fkey"
      FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "CooWorkflowShare" (
  "id" TEXT NOT NULL,
  "workflowId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "employeeName" TEXT NOT NULL,
  "userId" TEXT,
  "instruction" TEXT,
  "readAt" TIMESTAMP(3),
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CooWorkflowShare_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CooWorkflowShare_workflowId_employeeId_key" ON "CooWorkflowShare"("workflowId", "employeeId");
CREATE INDEX IF NOT EXISTS "CooWorkflowShare_employeeId_idx" ON "CooWorkflowShare"("employeeId");
CREATE INDEX IF NOT EXISTS "CooWorkflowShare_userId_idx" ON "CooWorkflowShare"("userId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'CooWorkflowShare_workflowId_fkey'
  ) THEN
    ALTER TABLE "CooWorkflowShare"
      ADD CONSTRAINT "CooWorkflowShare_workflowId_fkey"
      FOREIGN KEY ("workflowId") REFERENCES "CooWorkflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
