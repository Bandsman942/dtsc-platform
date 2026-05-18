ALTER TABLE "AppSetting"
  ADD COLUMN IF NOT EXISTS "allowNonClientPublicationDrafts" BOOLEAN NOT NULL DEFAULT false;
