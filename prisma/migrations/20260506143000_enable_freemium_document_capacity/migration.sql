UPDATE "BillingPlan"
SET "maxDocuments" = 1
WHERE "id" = 'freemium' AND "maxDocuments" < 1;
