-- Keep Prisma's nullable composite uniqueness aligned with the generated schema.
DROP INDEX IF EXISTS "EnterpriseWorkflowTransition_route_key";
CREATE UNIQUE INDEX "EnterpriseWorkflowTransition_workflowVersionId_fromStepId_outcome_priority_key"
  ON "EnterpriseWorkflowTransition"("workflowVersionId", "fromStepId", "outcome", "priority");

ALTER TABLE "EnterpriseApproval"
  ADD COLUMN "workflowRunId" TEXT,
  ADD COLUMN "workflowStepRunId" TEXT;

CREATE INDEX "EnterpriseApproval_organizationId_workflowRunId_status_idx"
  ON "EnterpriseApproval"("organizationId", "workflowRunId", "status");
CREATE INDEX "EnterpriseApproval_organizationId_workflowStepRunId_status_idx"
  ON "EnterpriseApproval"("organizationId", "workflowStepRunId", "status");

ALTER TABLE "EnterpriseApproval"
  ADD CONSTRAINT "EnterpriseApproval_workflowRun_fkey"
  FOREIGN KEY ("organizationId", "workflowRunId")
  REFERENCES "EnterpriseWorkflowRun"("organizationId", "id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "EnterpriseApproval"
  ADD CONSTRAINT "EnterpriseApproval_workflowStepRun_fkey"
  FOREIGN KEY ("organizationId", "workflowStepRunId")
  REFERENCES "EnterpriseWorkflowStepRun"("organizationId", "id")
  ON DELETE SET NULL ON UPDATE CASCADE;
