-- Additive index for metadata-only, time-windowed citation evidence in DTSC Console.
-- No document or message content is copied, modified or deleted.
CREATE INDEX IF NOT EXISTS "EnterpriseAiMessage_role_deletedAt_createdAt_idx"
  ON "EnterpriseAiMessage"("role", "deletedAt", "createdAt");
