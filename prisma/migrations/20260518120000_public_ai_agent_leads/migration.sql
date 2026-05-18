ALTER TABLE "NewsletterSubscriber"
  ADD COLUMN IF NOT EXISTS "requestedService" TEXT,
  ADD COLUMN IF NOT EXISTS "needDescription" TEXT,
  ADD COLUMN IF NOT EXISTS "urgency" TEXT,
  ADD COLUMN IF NOT EXISTS "estimatedBudget" TEXT,
  ADD COLUMN IF NOT EXISTS "preferredContactChannel" TEXT,
  ADD COLUMN IF NOT EXISTS "aiSummary" TEXT;

CREATE INDEX IF NOT EXISTS "NewsletterSubscriber_source_status_idx" ON "NewsletterSubscriber"("source", "status");
