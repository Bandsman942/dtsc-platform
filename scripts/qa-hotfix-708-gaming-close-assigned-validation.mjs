import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const check = (condition, message) => { if (!condition) failures.push(message); };
const hasAll = (content, tokens, label) => {
  for (const token of tokens) check(content.includes(token), `${label}: missing ${token}`);
};

const schemas = read("lib/enterprise/gaming/checkout-schemas.ts");
const service = read("lib/enterprise/gaming/daily-close.ts");
const collectionRoute = read("app/api/enterprise/[organizationId]/gaming/daily-closes/route.ts");
const detailRoute = read("app/api/enterprise/[organizationId]/gaming/daily-closes/[closeId]/route.ts");
const workspace = read("components/enterprise/gaming/enterprise-gaming-daily-close-workspace.tsx");
const copy = read("components/enterprise/gaming/gaming-daily-close-i18n.ts");
const http = read("lib/enterprise/gaming/checkout-http.ts");
const approvalTargets = read("lib/enterprise/approval-targets.ts");
const approvalActions = read("app/api/enterprise/[organizationId]/approvals/[id]/actions/route.ts");
const approvalsRoute = read("app/api/enterprise/[organizationId]/approvals/route.ts");
const approvalCoordination = read("lib/standard-work-coordination/approval-coordination.ts");
const approvalsWorkspace = read("components/enterprise/core-v2/enterprise-approvals-workspace.tsx");
const e2e = read("tests/e2e/issue-693-gaming-checkout-invoice.spec.mjs");
const packageJson = read("package.json");

hasAll(schemas, [
  "approverUserId: id",
  "gamingDailyCloseValidateSchema",
  "gamingDailyCloseRejectSchema",
  "gamingDailyCloseCommandSchema",
  'z.literal("ASSIGN_APPROVER")',
  'reason: z.string().trim().min(8).max(1000)',
], "assigned close schemas");
check(
  schemas.includes('action: z.literal("VALIDATE")') && schemas.includes("reason: z.string().trim().max(1000).optional()"),
  "VALIDATE must keep an optional reason without an 8-character minimum.",
);

hasAll(service, [
  "assertEnterpriseApprovalCandidate",
  "assertEnterpriseApprovalDecision",
  'moduleCode: "GAMING_DAILY_CLOSE"',
  'targetEntityType: "EnterpriseGamingDailyClose"',
  "approverUserId: input.approverUserId",
  "GAMING_CLOSE_SELF_VALIDATION_FORBIDDEN",
  "GAMING_CLOSE_REJECTION_REASON_TOO_SHORT",
  "assignGamingDailyCloseApprover",
  "GAMING_CLOSE_APPROVAL_NOT_ASSIGNED",
  "GAMING_CLOSE_WRONG_APPROVER",
  'approval?.status === "PENDING" ? approval.approverUserId : null',
], "assigned close service");

hasAll(collectionRoute, [
  "canAssignApprover:",
  "canApprove:",
  "canReject:",
  "item.approverUserId === session.userId",
  "GAMING_CLOSE_APPROVER_REQUIRED",
], "close collection capabilities");

hasAll(detailRoute, [
  "gamingDailyCloseCommandSchema",
  'action === "ASSIGN_APPROVER"',
  'action: accessAction',
  "assignGamingDailyCloseApprover",
  "GAMING_CLOSE_REJECTION_REASON_TOO_SHORT",
], "close detail command route");

hasAll(workspace, [
  "/approval-candidates?moduleCode=GAMING_DAILY_CLOSE",
  'name="approverUserId"',
  "copy.assignValidator",
  "detail.capabilities?.canApprove",
  "detail.capabilities?.canReject",
  "detail.capabilities?.canAssignApprover",
  'className="grid gap-3 lg:hidden"',
  'min-w-[1080px]',
  "data-horizontal-rail",
], "close workspace");
check(
  !workspace.includes('detail.status === "SUBMITTED" && collection.canManage'),
  "The old global manage-based decision buttons must not return.",
);
check(
  workspace.includes("localDateInputValue") && !workspace.includes("new Date().toISOString().slice(0, 10)"),
  "Gaming daily close must not reintroduce a naive UTC business-date default.",
);

hasAll(copy, [
  "Choisir un validateur",
  "Aucun validateur disponible",
  "Cette clôture attend la décision du validateur désigné.",
  "The rejection reason must contain at least 8 characters.",
], "close i18n");

hasAll(http, [
  "GAMING_CLOSE_APPROVER_REQUIRED",
  "GAMING_CLOSE_APPROVER_NOT_ELIGIBLE",
  "GAMING_CLOSE_WRONG_APPROVER",
  "GAMING_CLOSE_APPROVAL_NOT_ASSIGNED",
  "GAMING_CLOSE_REJECTION_REASON_TOO_SHORT",
  "GAMING_CLOSE_DECISION_INVALID",
  "GAMING_DAILY_CLOSE_DECISION_FAILED",
], "close error messages");

hasAll(approvalTargets, [
  'EnterpriseGamingDailyClose: "GAMING_DAILY_CLOSE"',
  'EnterpriseGamingDailyClose: { fr: "Clôture Gaming", en: "Gaming daily close" }',
], "approval target registry");

hasAll(approvalCoordination, [
  'entityType === "EnterpriseGamingDailyClose"',
  "enterpriseGamingDailyClose.findFirst",
  "differenceAmount",
], "validation center snapshot");

hasAll(approvalActions, [
  'targetEntityType === "EnterpriseGamingDailyClose"',
  "decideGamingDailyClose",
  "gamingCheckoutErrorResponse",
], "validation center decision routing");

hasAll(approvalsWorkspace, [
  '"EnterpriseGamingDailyClose"',
  "canonicalApprovalTargetLabel",
], "validation center Gaming close UI");

hasAll(approvalsRoute, [
  "enterpriseGamingDailyClose.findMany",
  '"EnterpriseGamingDailyClose"',
  "item.reference",
], "validation center Gaming close target summary");

hasAll(e2e, [
  "#708 assigns a validator before submitting Gaming daily close",
  "#708 legacy submitted close can receive an assigned validator",
  "#708 rejection requires at least eight characters",
], "authenticated E2E coverage");

check(packageJson.includes('"qa:hotfix-708"'), "package.json must expose qa:hotfix-708");
check(packageJson.includes("qa-hotfix-708-gaming-close-assigned-validation.mjs"), "qa:hotfix-708 must point to the targeted guard.");

if (failures.length) {
  console.error(failures.map((failure) => `❌ ${failure}`).join("\n"));
  process.exit(1);
}
console.log("✅ Hotfix #708 vérifié : validateur assigné, décisions fail-closed, erreurs métier et détail responsive.");
