ALTER TABLE "EnterpriseBudget"
  ADD COLUMN "scenarioCode" TEXT NOT NULL DEFAULT 'BASE',
  ADD COLUMN "versionNumber" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "parentBudgetId" TEXT,
  ADD COLUMN "fiscalYearCode" TEXT,
  ADD COLUMN "ownerUserId" TEXT,
  ADD COLUMN "submittedAt" TIMESTAMP(3),
  ADD COLUMN "frozenAt" TIMESTAMP(3),
  ADD COLUMN "frozenByUserId" TEXT,
  ADD COLUMN "forecastAmount" DECIMAL(18,2),
  ADD COLUMN "forecastMethod" TEXT,
  ADD COLUMN "forecastConfidence" DECIMAL(5,2),
  ADD COLUMN "assumptionsJson" JSONB,
  ADD COLUMN "actualFreshnessAt" TIMESTAMP(3);

ALTER TABLE "EnterpriseBudgetLine"
  ADD COLUMN "accountCode" TEXT,
  ADD COLUMN "costCenterCode" TEXT,
  ADD COLUMN "projectId" TEXT,
  ADD COLUMN "siteId" TEXT,
  ADD COLUMN "responsibleUserId" TEXT,
  ADD COLUMN "quantity" DECIMAL(18,4),
  ADD COLUMN "unitCode" TEXT,
  ADD COLUMN "hypothesis" TEXT,
  ADD COLUMN "forecastAmount" DECIMAL(18,2);

ALTER TABLE "EnterpriseReport"
  ADD COLUMN "unitCode" TEXT,
  ADD COLUMN "roundingPolicyCode" TEXT NOT NULL DEFAULT 'HALF_UP_2',
  ADD COLUMN "sourcePolicyCode" TEXT,
  ADD COLUMN "metricDefinitionCodesJson" JSONB,
  ADD COLUMN "freshnessAt" TIMESTAMP(3);

ALTER TABLE "EnterpriseDepartment" ADD COLUMN "parentDepartmentId" TEXT;

ALTER TABLE "AuditLog"
  ADD COLUMN "organizationId" TEXT,
  ADD COLUMN "requestId" TEXT,
  ADD COLUMN "result" TEXT NOT NULL DEFAULT 'SUCCESS',
  ADD COLUMN "reasonCode" TEXT,
  ADD COLUMN "riskLevel" TEXT,
  ADD COLUMN "beforeJson" JSONB,
  ADD COLUMN "afterJson" JSONB;

CREATE TABLE "EnterpriseBudgetAlert" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "budgetId" TEXT NOT NULL,
  "budgetLineId" TEXT,
  "ruleCode" TEXT NOT NULL,
  "thresholdType" TEXT NOT NULL,
  "thresholdValue" DECIMAL(18,4) NOT NULL,
  "currentValue" DECIMAL(18,4),
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "severity" TEXT NOT NULL DEFAULT 'WARNING',
  "periodStart" TIMESTAMP(3),
  "periodEnd" TIMESTAMP(3),
  "responsibleUserId" TEXT,
  "recipientIdsJson" JSONB,
  "deduplicationKey" TEXT NOT NULL,
  "triggeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),
  "closedAt" TIMESTAMP(3),
  "metadataJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EnterpriseBudgetAlert_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseReportView" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "reportType" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "visibility" TEXT NOT NULL DEFAULT 'PERSONAL',
  "filtersJson" JSONB,
  "dimensionsJson" JSONB,
  "sortJson" JSONB,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "isFavorite" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "archivedAt" TIMESTAMP(3),
  CONSTRAINT "EnterpriseReportView_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseOrganizationRole" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "labelFr" TEXT NOT NULL,
  "labelEn" TEXT NOT NULL,
  "descriptionFr" TEXT,
  "descriptionEn" TEXT,
  "isSystem" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "permissionsJson" JSONB,
  "modulesJson" JSONB,
  "createdByUserId" TEXT NOT NULL,
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EnterpriseOrganizationRole_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseOrganizationMemberRole" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "memberId" TEXT NOT NULL,
  "roleId" TEXT NOT NULL,
  "assignedByUserId" TEXT NOT NULL,
  "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMP(3),
  "reason" TEXT,
  CONSTRAINT "EnterpriseOrganizationMemberRole_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseOrganizationSecurityPolicy" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "sessionIdleMinutes" INTEGER NOT NULL DEFAULT 60,
  "invitationExpiryHours" INTEGER NOT NULL DEFAULT 168,
  "maxPendingInvitations" INTEGER NOT NULL DEFAULT 100,
  "requireApprovedDomains" BOOLEAN NOT NULL DEFAULT false,
  "allowedEmailDomainsJson" JSONB,
  "defaultInvitationRole" TEXT NOT NULL DEFAULT 'MEMBER',
  "requireInvitationApproval" BOOLEAN NOT NULL DEFAULT false,
  "requireMfa" BOOLEAN NOT NULL DEFAULT false,
  "sensitiveExportApproval" BOOLEAN NOT NULL DEFAULT true,
  "devicePolicyJson" JSONB,
  "dataExportPolicyJson" JSONB,
  "updatedByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EnterpriseOrganizationSecurityPolicy_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EnterpriseBudget_organizationId_parentBudgetId_versionNumber_key" ON "EnterpriseBudget"("organizationId", "parentBudgetId", "versionNumber");
CREATE INDEX "EnterpriseBudget_organizationId_scenarioCode_status_idx" ON "EnterpriseBudget"("organizationId", "scenarioCode", "status");
CREATE INDEX "EnterpriseBudget_organizationId_fiscalYearCode_periodStart_idx" ON "EnterpriseBudget"("organizationId", "fiscalYearCode", "periodStart");
CREATE INDEX "EnterpriseBudget_organizationId_ownerUserId_status_idx" ON "EnterpriseBudget"("organizationId", "ownerUserId", "status");
CREATE INDEX "EnterpriseBudgetLine_organizationId_projectId_idx" ON "EnterpriseBudgetLine"("organizationId", "projectId");
CREATE INDEX "EnterpriseBudgetLine_organizationId_siteId_idx" ON "EnterpriseBudgetLine"("organizationId", "siteId");
CREATE INDEX "EnterpriseBudgetLine_organizationId_costCenterCode_idx" ON "EnterpriseBudgetLine"("organizationId", "costCenterCode");
CREATE INDEX "EnterpriseBudgetLine_organizationId_responsibleUserId_idx" ON "EnterpriseBudgetLine"("organizationId", "responsibleUserId");
CREATE INDEX "EnterpriseReport_organizationId_freshnessAt_idx" ON "EnterpriseReport"("organizationId", "freshnessAt");
CREATE UNIQUE INDEX "EnterpriseBudgetAlert_organizationId_deduplicationKey_key" ON "EnterpriseBudgetAlert"("organizationId", "deduplicationKey");
CREATE INDEX "EnterpriseBudgetAlert_organizationId_status_severity_idx" ON "EnterpriseBudgetAlert"("organizationId", "status", "severity");
CREATE INDEX "EnterpriseBudgetAlert_organizationId_budgetId_status_idx" ON "EnterpriseBudgetAlert"("organizationId", "budgetId", "status");
CREATE INDEX "EnterpriseBudgetAlert_organizationId_budgetLineId_status_idx" ON "EnterpriseBudgetAlert"("organizationId", "budgetLineId", "status");
CREATE INDEX "EnterpriseBudgetAlert_organizationId_responsibleUserId_status_idx" ON "EnterpriseBudgetAlert"("organizationId", "responsibleUserId", "status");
CREATE UNIQUE INDEX "EnterpriseReportView_organizationId_userId_reportType_name_key" ON "EnterpriseReportView"("organizationId", "userId", "reportType", "name");
CREATE INDEX "EnterpriseReportView_organizationId_userId_archivedAt_idx" ON "EnterpriseReportView"("organizationId", "userId", "archivedAt");
CREATE INDEX "EnterpriseReportView_organizationId_reportType_visibility_archivedAt_idx" ON "EnterpriseReportView"("organizationId", "reportType", "visibility", "archivedAt");
CREATE INDEX "EnterpriseReportView_organizationId_userId_isFavorite_archivedAt_idx" ON "EnterpriseReportView"("organizationId", "userId", "isFavorite", "archivedAt");
CREATE UNIQUE INDEX "OrganizationMember_organizationId_id_key" ON "OrganizationMember"("organizationId", "id");
CREATE UNIQUE INDEX "EnterpriseOrganizationRole_organizationId_code_key" ON "EnterpriseOrganizationRole"("organizationId", "code");
CREATE UNIQUE INDEX "EnterpriseOrganizationRole_organizationId_id_key" ON "EnterpriseOrganizationRole"("organizationId", "id");
CREATE INDEX "EnterpriseOrganizationRole_organizationId_isSystem_isActive_idx" ON "EnterpriseOrganizationRole"("organizationId", "isSystem", "isActive");
CREATE INDEX "EnterpriseOrganizationRole_organizationId_archivedAt_idx" ON "EnterpriseOrganizationRole"("organizationId", "archivedAt");
CREATE UNIQUE INDEX "EnterpriseOrganizationMemberRole_organizationId_memberId_roleId_key" ON "EnterpriseOrganizationMemberRole"("organizationId", "memberId", "roleId");
CREATE INDEX "EnterpriseOrganizationMemberRole_organizationId_memberId_revokedAt_idx" ON "EnterpriseOrganizationMemberRole"("organizationId", "memberId", "revokedAt");
CREATE INDEX "EnterpriseOrganizationMemberRole_organizationId_roleId_revokedAt_idx" ON "EnterpriseOrganizationMemberRole"("organizationId", "roleId", "revokedAt");
CREATE UNIQUE INDEX "EnterpriseOrganizationSecurityPolicy_organizationId_key" ON "EnterpriseOrganizationSecurityPolicy"("organizationId");
CREATE INDEX "EnterpriseOrganizationSecurityPolicy_requireMfa_updatedAt_idx" ON "EnterpriseOrganizationSecurityPolicy"("requireMfa", "updatedAt");
CREATE INDEX "EnterpriseDepartment_organizationId_parentDepartmentId_idx" ON "EnterpriseDepartment"("organizationId", "parentDepartmentId");
CREATE INDEX "AuditLog_organizationId_createdAt_idx" ON "AuditLog"("organizationId", "createdAt");
CREATE INDEX "AuditLog_organizationId_action_createdAt_idx" ON "AuditLog"("organizationId", "action", "createdAt");
CREATE INDEX "AuditLog_requestId_idx" ON "AuditLog"("requestId");
CREATE INDEX "AuditLog_riskLevel_createdAt_idx" ON "AuditLog"("riskLevel", "createdAt");

ALTER TABLE "EnterpriseBudget" ADD CONSTRAINT "EnterpriseBudget_parentBudget_fkey" FOREIGN KEY ("organizationId", "parentBudgetId") REFERENCES "EnterpriseBudget"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterpriseBudgetAlert" ADD CONSTRAINT "EnterpriseBudgetAlert_budget_fkey" FOREIGN KEY ("organizationId", "budgetId") REFERENCES "EnterpriseBudget"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EnterpriseBudgetAlert" ADD CONSTRAINT "EnterpriseBudgetAlert_budgetLine_fkey" FOREIGN KEY ("organizationId", "budgetLineId") REFERENCES "EnterpriseBudgetLine"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EnterpriseDepartment" ADD CONSTRAINT "EnterpriseDepartment_parentDepartment_fkey" FOREIGN KEY ("organizationId", "parentDepartmentId") REFERENCES "EnterpriseDepartment"("organizationId", "id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EnterpriseOrganizationRole" ADD CONSTRAINT "EnterpriseOrganizationRole_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EnterpriseOrganizationMemberRole" ADD CONSTRAINT "EnterpriseOrganizationMemberRole_member_fkey" FOREIGN KEY ("organizationId", "memberId") REFERENCES "OrganizationMember"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EnterpriseOrganizationMemberRole" ADD CONSTRAINT "EnterpriseOrganizationMemberRole_role_fkey" FOREIGN KEY ("organizationId", "roleId") REFERENCES "EnterpriseOrganizationRole"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterpriseOrganizationSecurityPolicy" ADD CONSTRAINT "EnterpriseOrganizationSecurityPolicy_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
