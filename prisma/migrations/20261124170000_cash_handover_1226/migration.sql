CREATE TABLE "EnterpriseCashHandover" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "sourceSessionId" TEXT NOT NULL, "targetSessionId" TEXT NOT NULL,
  "amount" DECIMAL(20,6) NOT NULL, "currencyCode" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'PENDING',
  "reason" TEXT NOT NULL, "decisionReason" TEXT, "proposedByUserId" TEXT NOT NULL, "decidedByUserId" TEXT,
  "idempotencyKey" TEXT NOT NULL, "revision" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "decidedAt" TIMESTAMP(3),
  CONSTRAINT "EnterpriseCashHandover_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EnterpriseCashHandover_organizationId_id_key" ON "EnterpriseCashHandover"("organizationId","id");
CREATE UNIQUE INDEX "EnterpriseCashHandover_organizationId_idempotencyKey_key" ON "EnterpriseCashHandover"("organizationId","idempotencyKey");
CREATE INDEX "EnterpriseCashHandover_organizationId_sourceSessionId_status_idx" ON "EnterpriseCashHandover"("organizationId","sourceSessionId","status");
CREATE INDEX "EnterpriseCashHandover_organizationId_targetSessionId_status_idx" ON "EnterpriseCashHandover"("organizationId","targetSessionId","status");
ALTER TABLE "EnterpriseCashHandover" ADD CONSTRAINT "EnterpriseCashHandover_organizationId_sourceSessionId_fkey" FOREIGN KEY ("organizationId","sourceSessionId") REFERENCES "EnterpriseCashSession"("organizationId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterpriseCashHandover" ADD CONSTRAINT "EnterpriseCashHandover_organizationId_targetSessionId_fkey" FOREIGN KEY ("organizationId","targetSessionId") REFERENCES "EnterpriseCashSession"("organizationId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
