-- Iteration 7/8 owner E2E remediation v3: persistent professional toolbox notes.
-- Additive and non-destructive: browser-local legacy notes remain untouched.
CREATE TABLE "ProfessionalToolNote" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "moduleKey" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "contentHtml" TEXT NOT NULL DEFAULT '',
  "contentText" TEXT NOT NULL DEFAULT '',
  "noteType" TEXT NOT NULL DEFAULT 'NOTE',
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "priority" TEXT NOT NULL DEFAULT 'NORMAL',
  "labels" TEXT,
  "color" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "pinned" BOOLEAN NOT NULL DEFAULT false,
  "dueAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProfessionalToolNote_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProfessionalToolNote_userId_moduleKey_status_sortOrder_idx"
  ON "ProfessionalToolNote"("userId", "moduleKey", "status", "sortOrder");
CREATE INDEX "ProfessionalToolNote_userId_noteType_dueAt_idx"
  ON "ProfessionalToolNote"("userId", "noteType", "dueAt");
CREATE INDEX "ProfessionalToolNote_userId_updatedAt_idx"
  ON "ProfessionalToolNote"("userId", "updatedAt");

ALTER TABLE "ProfessionalToolNote"
  ADD CONSTRAINT "ProfessionalToolNote_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
