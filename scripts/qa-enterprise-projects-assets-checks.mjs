import { forbidTokens, requirePaths, requireTokens, success } from "./qa-enterprise-common-domain-lib.mjs";

requirePaths([
  "prisma/enterprise-projects-assets.prisma",
  "lib/enterprise/projects-assets/projects.ts",
  "lib/enterprise/projects-assets/project-lifecycle.ts",
  "lib/enterprise/projects-assets/assets.ts",
  "app/api/enterprise/[organizationId]/projects/route.ts",
  "app/api/enterprise/[organizationId]/projects/[projectId]/transition/route.ts",
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
  "updateMany",
  "revision: input.revision",
  "PROJECT_${targetStatus}",
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