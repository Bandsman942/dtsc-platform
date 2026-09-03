import { forbidTokens, requirePaths, requireTokens, success } from "./qa-enterprise-common-domain-lib.mjs";

requirePaths([
  "prisma/enterprise-projects-assets.prisma",
  "lib/enterprise/projects-assets/projects.ts",
  "lib/enterprise/projects-assets/project-lifecycle.ts",
  "lib/enterprise/projects-assets/project-controls.ts",
  "lib/enterprise/projects-assets/milestone-approval-coordination.ts",
  "lib/enterprise/projects-assets/milestone-approval-cancel.ts",
  "lib/enterprise/projects-assets/assets.ts",
  "app/api/enterprise/[organizationId]/projects/route.ts",
  "app/api/enterprise/[organizationId]/projects/[projectId]/transition/route.ts",
  "app/api/enterprise/[organizationId]/projects/[projectId]/deliverables/route.ts",
  "app/api/enterprise/[organizationId]/projects/[projectId]/milestones/[milestoneId]/transition/route.ts",
  "app/api/enterprise/[organizationId]/project-risks/[riskId]/transition/route.ts",
  "app/api/enterprise/[organizationId]/project-issues/[issueId]/transition/route.ts",
  "app/api/enterprise/[organizationId]/deliverables/route.ts",
  "app/api/enterprise/[organizationId]/assets/route.ts",
  "app/api/enterprise/[organizationId]/projects-assets-lookups/route.ts",
  "components/enterprise/professional/enterprise-projects-services-workspace.tsx",
  "components/enterprise/professional/enterprise-time-deliverables-workspace.tsx",
  "components/enterprise/professional/enterprise-assets-maintenance-workspace-v2.tsx",
]);

requireTokens("lib/enterprise/projects-assets/helpers.ts", [
  "departmentId",
  "budgetId",
  "documentId",
  "DEPARTMENT_NOT_FOUND",
  "BUDGET_NOT_FOUND",
  "DOCUMENT_NOT_FOUND",
]);
requireTokens("lib/enterprise/projects-assets/projects.ts", [
  "PROJECT_MEMBER_DUPLICATE",
  "PROJECT_DATE_RANGE_INVALID",
  "MILESTONE_AFTER_PROJECT_END",
  "DELIVERABLE_AFTER_PROJECT_END",
  "DELIVERABLE_REVIEW_COMMENT_REQUIRED",
  "SELF_APPROVAL_FORBIDDEN",
  "revision",
]);
requireTokens("lib/enterprise/projects-assets/project-lifecycle.ts", [
  "PROJECT_TRANSITIONS",
  "PROJECT_DELIVERABLES_INCOMPLETE",
  "PROJECT_MILESTONES_INCOMPLETE",
  "PROJECT_RISKS_OPEN",
  "PROJECT_ISSUES_OPEN",
  "enterpriseProjectMilestone.count",
  "enterpriseProjectRisk.count",
  "enterpriseProjectIssue.count",
  "updateMany",
  "revision: input.revision",
  "PROJECT_${targetStatus}",
]);
requireTokens("lib/enterprise/projects-assets/project-controls.ts", [
  "transitionEnterpriseProjectMilestone",
  "transitionEnterpriseProjectRisk",
  "transitionEnterpriseProjectIssue",
  "SUBMIT_APPROVAL",
  "EnterpriseProjectMilestone",
  "assertEnterpriseApprovalCandidate",
  "assertEnterpriseApprovalDecision",
  "SELF_APPROVAL_FORBIDDEN",
  "PENDING_APPROVAL_EXISTS",
  "PROJECT_RISK_CLOSED",
  "PROJECT_RISK_REOPENED",
  "PROJECT_ISSUE_${targetStatus}",
  "revision: input.revision",
]);
requireTokens("lib/enterprise/projects-assets/milestone-approval-coordination.ts", [
  "ensureProjectMilestoneApprovalSubmissionVersion",
  "recordProjectMilestoneApprovalDecision",
  "EnterpriseProjectMilestone",
  "enterpriseApprovalSubmissionVersion",
  "enterpriseApprovalDecision",
  "idempotencyKey",
]);
requireTokens("lib/enterprise/projects-assets/milestone-approval-cancel.ts", [
  "cancelEnterpriseProjectMilestoneApproval",
  "APPROVAL_CANCEL_DENIED",
  "PROJECT_MILESTONE_APPROVAL_CANCELLED",
  "status: \"PLANNED\"",
  "approvalRevision",
]);
for (const path of [
  "app/api/enterprise/[organizationId]/projects/[projectId]/milestones/[milestoneId]/transition/route.ts",
  "app/api/enterprise/[organizationId]/project-risks/[riskId]/transition/route.ts",
  "app/api/enterprise/[organizationId]/project-issues/[issueId]/transition/route.ts",
]) requireTokens(path, ["isSameOriginRequest", "rateLimit", "writeAuditLog", 'moduleCode: "PROJECTS_SERVICES"']);
requireTokens("app/api/enterprise/[organizationId]/approvals/[id]/actions/route.ts", [
  "EnterpriseProjectMilestone",
  "ensureProjectMilestoneApprovalSubmissionVersion",
  "recordProjectMilestoneApprovalDecision",
  "decideEnterpriseProjectMilestone",
  "cancelEnterpriseProjectMilestoneApproval",
]);
requireTokens("lib/enterprise/approval-targets.ts", [
  'EnterpriseProjectMilestone: "PROJECTS_SERVICES"',
  'targetEntityType === "EnterpriseProjectMilestone"',
  "PROJECTS_SERVICES?milestone=",
]);
requireTokens("app/api/enterprise/[organizationId]/deliverables/route.ts", [
  "TIME_DELIVERABLES",
  "approvedMinutes",
  "enterpriseTimesheetEntry.findMany",
  "timesheet: { status: \"APPROVED\", archivedAt: null }",
  "canSubmit",
  "canAccept",
  "canRequestChanges",
  "canReject",
  "item.createdByUserId !== session.userId",
]);
requireTokens("app/api/enterprise/[organizationId]/projects/[projectId]/deliverables/route.ts", [
  "getEnterpriseProcurementAccess",
  "canAccessEnterpriseDocument",
  "moduleCode: \"DOCUMENTS\"",
  "documentAccess.canManage",
]);
requireTokens("app/api/enterprise/[organizationId]/projects-assets-lookups/route.ts", [
  "enterpriseDocumentVisibilityWhere",
  "enterprisePurchaseVisibilityWhere",
  "getEnterpriseProcurementAccess",
  "canReadDocuments",
  "canReadProcurement",
]);
requireTokens("app/api/enterprise/[organizationId]/assets/route.ts", [
  "getEnterpriseProcurementAccess",
  "enterprisePurchaseVisibilityWhere",
  "moduleCode: \"SUPPLIERS_PURCHASES\"",
]);
requireTokens("lib/enterprise/projects-assets/assets.ts", [
  "synchronizeAssetOperationalStatus",
  "ASSET_ALREADY_ASSIGNED",
  "ASSET_PURCHASE_SUPPLIER_MISMATCH",
  "ASSET_MAINTENANCE_IN_PROGRESS",
  "OUT_OF_SERVICE",
  "MAINTENANCE",
  "ASSIGNED",
  "AVAILABLE",
  "ASSET_INCIDENT_RESOLVED",
]);
requireTokens("components/enterprise/professional/enterprise-projects-services-workspace.tsx", [
  "ProfessionalPager",
  "presentation=\"editor\"",
  "useToastMessage",
  "busyAction",
  "projects.canWrite",
  "projects.canManage",
  "budgetId",
  "contractId",
  "ISSUE",
]);
requireTokens("components/enterprise/professional/enterprise-time-deliverables-workspace.tsx", [
  "ProfessionalPager",
  "presentation=\"editor\"",
  "useToastMessage",
  "approvedMinutes",
  "item.canSubmit",
  "item.canAccept",
  "item.canRequestChanges",
  "item.canReject",
]);
requireTokens("components/enterprise/professional/enterprise-assets-maintenance-workspace-v2.tsx", [
  "ProfessionalPager",
  "presentation=\"editor\"",
  "useToastMessage",
  "assets.canWrite",
  "assets.canManage",
  "purchaseId",
  "assignmentTarget",
]);
forbidTokens("components/enterprise/professional/enterprise-projects-services-workspace.tsx", ["window.prompt", "window.alert", "window.confirm"]);
forbidTokens("components/enterprise/professional/enterprise-time-deliverables-workspace.tsx", ["window.prompt", "window.alert", "window.confirm"]);
forbidTokens("components/enterprise/professional/enterprise-assets-maintenance-workspace-v2.tsx", ["window.prompt", "window.alert", "window.confirm"]);
requireTokens("components/enterprise/enterprise-common-domain-workspace.tsx", ["PROJECTS_SERVICES", "TIME_DELIVERABLES", "ASSETS_MAINTENANCE"]);
success("enterprise project, deliverable and asset professional lifecycles");
