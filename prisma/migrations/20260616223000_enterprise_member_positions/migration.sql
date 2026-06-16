-- Enterprise member positions: non-destructive assignment fields for RBAC and UI visibility.
ALTER TABLE "OrganizationMember"
  ADD COLUMN "positionId" TEXT,
  ADD COLUMN "positionCode" TEXT,
  ADD COLUMN "positionTitle" TEXT;

CREATE INDEX "OrganizationMember_organizationId_positionId_status_idx"
  ON "OrganizationMember"("organizationId", "positionId", "status");

CREATE INDEX "OrganizationMember_organizationId_positionCode_status_idx"
  ON "OrganizationMember"("organizationId", "positionCode", "status");
