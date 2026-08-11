-- Reconcile the commercial catalog split introduced when BillingPlan.audience
-- separated PERSONAL and ORGANIZATION offers. Historical OrganizationSubscription
-- rows may still reference the former personal offers. Keep the repair explicit,
-- bounded and idempotent; historical invoices/payments are intentionally untouched.

INSERT INTO "BillingPlan" (
  "id",
  "name",
  "slug",
  "description",
  "audience",
  "priceUsd",
  "dailyMessageLimit",
  "dailyTokenLimit",
  "maxDocuments",
  "isActive",
  "sortOrder",
  "createdAt",
  "updatedAt"
)
VALUES
  ('org-starter', 'Organisation Essentielle', 'org-starter', 'Socle professionnel pour une petite organisation et ses premiers modules DTSC.', 'ORGANIZATION', 25.00, 500, 1500000, 50, true, 10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('org-growth', 'Organisation Croissance', 'org-growth', 'Capacités étendues pour une organisation en croissance, ses équipes et ses opérations.', 'ORGANIZATION', 75.00, 2000, 6000000, 250, true, 11, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('org-premium', 'Organisation Premium', 'org-premium', 'Offre avancée pour organisations avec capacités renforcées, gouvernance et support prioritaire.', 'ORGANIZATION', 180.00, 10000, 30000000, 1000, true, 12, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT DO NOTHING;

-- These three identifiers are reserved for the organization catalog. Correct an
-- accidental legacy audience without changing price, quotas, activation or any
-- other administrator-managed field.
UPDATE "BillingPlan"
SET "audience" = 'ORGANIZATION', "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" IN ('org-starter', 'org-growth', 'org-premium')
  AND "audience" NOT IN ('ORGANIZATION', 'BOTH');

UPDATE "OrganizationSubscription"
SET
  "planId" = CASE
    WHEN "planId" IN ('freemium', 'starter') THEN 'org-starter'
    WHEN "planId" = 'growth' THEN 'org-growth'
    WHEN "planId" = 'premium' THEN 'org-premium'
    ELSE "planId"
  END,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "planId" IN ('freemium', 'starter', 'growth', 'premium')
  AND EXISTS (
    SELECT 1
    FROM "BillingPlan" AS target
    WHERE target."id" = CASE
      WHEN "OrganizationSubscription"."planId" IN ('freemium', 'starter') THEN 'org-starter'
      WHEN "OrganizationSubscription"."planId" = 'growth' THEN 'org-growth'
      WHEN "OrganizationSubscription"."planId" = 'premium' THEN 'org-premium'
    END
      AND target."isActive" = true
      AND target."audience" IN ('ORGANIZATION', 'BOTH')
  );
