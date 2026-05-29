ALTER TABLE "EnterpriseDepartment"
ADD COLUMN IF NOT EXISTS "responsibleUserId" TEXT;

CREATE INDEX IF NOT EXISTS "EnterpriseDepartment_responsibleUserId_idx"
ON "EnterpriseDepartment"("responsibleUserId");
