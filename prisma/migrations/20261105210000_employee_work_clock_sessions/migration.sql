-- Work sessions are observational server-time facts, never scheduled attendance or auto-approved payroll.
CREATE TABLE "EnterpriseWorkClockSession" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "stoppedAt" TIMESTAMP(3),
  "startedByUserId" TEXT NOT NULL,
  "stoppedByUserId" TEXT,
  "workSummary" TEXT,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EnterpriseWorkClockSession_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EWCS_org_id_uniq" ON "EnterpriseWorkClockSession"("organizationId", "id");
CREATE INDEX "EWCS_employee_started_idx" ON "EnterpriseWorkClockSession"("organizationId", "employeeId", "startedAt");
CREATE INDEX "EWCS_employee_open_idx" ON "EnterpriseWorkClockSession"("organizationId", "employeeId", "stoppedAt");
CREATE UNIQUE INDEX "EWCS_one_open_per_employee" ON "EnterpriseWorkClockSession"("organizationId", "employeeId") WHERE "stoppedAt" IS NULL;
-- Historical installations may predate the Prisma composite unique declaration.
CREATE UNIQUE INDEX IF NOT EXISTS "EnterpriseEmployee_organizationId_id_key" ON "EnterpriseEmployee"("organizationId", "id");
ALTER TABLE "EnterpriseWorkClockSession" ADD CONSTRAINT "EWCS_employee_fk"
  FOREIGN KEY ("organizationId", "employeeId") REFERENCES "EnterpriseEmployee"("organizationId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
