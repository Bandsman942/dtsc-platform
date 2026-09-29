ALTER TABLE "EnterprisePayment"
ADD COLUMN "cashSessionId" TEXT;

UPDATE "EnterprisePayment" AS payment
SET "cashSessionId" = movements."cashSessionId"
FROM (
  SELECT
    "organizationId",
    "paymentId",
    MIN("cashSessionId") AS "cashSessionId"
  FROM "EnterpriseCashMovement"
  WHERE "paymentId" IS NOT NULL
  GROUP BY "organizationId", "paymentId"
  HAVING COUNT(DISTINCT "cashSessionId") = 1
) AS movements
WHERE payment."organizationId" = movements."organizationId"
  AND payment."id" = movements."paymentId"
  AND payment."methodType" = 'CASH'
  AND payment."cashSessionId" IS NULL;

CREATE INDEX "EnterprisePayment_organizationId_cashSessionId_idx"
ON "EnterprisePayment"("organizationId", "cashSessionId");

ALTER TABLE "EnterprisePayment"
ADD CONSTRAINT "EnterprisePayment_organizationId_cashSessionId_fkey"
FOREIGN KEY ("organizationId", "cashSessionId")
REFERENCES "EnterpriseCashSession"("organizationId", "id")
ON DELETE RESTRICT
ON UPDATE CASCADE;
