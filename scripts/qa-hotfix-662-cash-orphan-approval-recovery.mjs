import fs from "node:fs";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

const checks = [];
function expect(ok, label) {
  checks.push({ ok: Boolean(ok), label });
}
function hasAll(source, markers) {
  return markers.every((marker) => source.includes(marker));
}

const treasury = read("lib/enterprise/accounting/treasury-service.ts");
const orchestration = read("lib/enterprise/accounting/accounting-operations-approval-orchestration.ts");
const approvalSchemas = read("lib/enterprise/accounting/accounting-approval-schemas.ts");
const recoveryRoute = read("app/api/enterprise/[organizationId]/cash-sessions/[sessionId]/approver/route.ts");
const cashCollection = read("app/api/enterprise/[organizationId]/cash-sessions/route.ts");
const cashWorkspace = read("components/enterprise/professional/enterprise-finance-cash-workspace.tsx");
const approverSelect = read("components/enterprise/enterprise-approver-select.tsx");
const retailSchemas = read("lib/enterprise/retail/schemas.ts");
const retailService = read("lib/enterprise/retail/service.ts");
const dailyCloseRoute = read("app/api/enterprise/[organizationId]/retail/daily-close/route.ts");
const dailyCloseWorkspace = read("components/enterprise/professional/retail-daily-close-workspace.tsx");
const mobileManager = read("components/enterprise/professional/mobile-money-cash-session-manager.tsx");
const packageJson = read("package.json");
const browserAcceptance = read("tests/e2e/issue-662-cash-orphan-approval-recovery.spec.mjs");
const acceptanceWorkflow = read(".github/workflows/hotfix-662-cash-orphan-approval-recovery.yml");
const ownerE2E = read("docs/OWNER_E2E_662_CASH_ORPHAN_APPROVAL_RECOVERY.md");

expect(!treasury.includes("export async function submitCashSessionClose("), "legacy cash submission without assigned approval is removed");
expect(!treasury.includes("export async function validateCashSession("), "legacy cash decision bypass is removed");

expect(hasAll(approvalSchemas, [
  "assignCashSessionApproverSchema",
  "approverUserId: id",
  "revision",
]), "recovery assignment has a dedicated validated schema");

expect(hasAll(orchestration, [
  "assignCashSessionApproverRecovery",
  'session.status !== "PENDING_VALIDATION"',
  'status: { in: ["PENDING", "QUEUED"] }',
  "ACCOUNTING_APPROVAL_ALREADY_PENDING",
  'targetEntityType: "EnterpriseCashSession"',
  "requesterUserId: session.cashierUserId",
  "createAccountingApprovalAssignment",
  'eventType: "CASH_SESSION_APPROVER_ASSIGNED"',
  "recovery: true",
]), "recovery creates one canonical assigned approval without mutating the cash count");
expect(orchestration.indexOf("createAccountingApprovalAssignment") < orchestration.lastIndexOf('status: "PENDING_VALIDATION"'), "canonical assigned submission creates approval in the same orchestration as pending status");

expect(hasAll(recoveryRoute, [
  'authorizeFinanceRequest(req, organizationId, "FINANCE_CASH", "manage"',
  "listEnterpriseApprovalCandidates",
  "requesterUserId: session.cashierUserId",
  "assignCashSessionApproverRecovery",
  "ENTERPRISE_CASH_SESSION_APPROVER_ASSIGNED",
  "writeApiLog",
  "writeAuditLog",
]), "recovery endpoint is manager-protected, cashier-aware and audited");

expect(hasAll(approverSelect, [
  "candidatesEndpoint?: string",
  "const endpoint = candidatesEndpoint ||",
]), "canonical approver selector supports a server-resolved candidate source");

expect(hasAll(cashCollection, [
  'status: { in: ["PENDING", "QUEUED"] }',
  "approvalBySessionId",
  "approverLabelByUserId",
  "canAssignApprover",
  "assignedToCurrentUser",
  "canApprove:",
  "canReject:",
]), "cash list exposes server-authoritative assignment and decision capabilities");

expect(hasAll(cashWorkspace, [
  "assignTarget",
  "assignCashSessionApprover",
  "/approver",
  "candidatesEndpoint=",
  'detail.capabilities?.canAssignApprover',
  'detail.capabilities?.canApprove',
  't("cashApproverMissing")',
]), "cash workspace distinguishes recovery assignment from assigned validation");
expect(!cashWorkspace.includes('canManage && detail.status === "PENDING_VALIDATION"'), "cash workspace no longer offers validation to every manager");

expect(hasAll(retailSchemas, [
  "approverUserId: id.optional()",
  'line.accountType === "CASH"',
  'path: ["approverUserId"]',
]), "daily close schema requires an approver when a cash line is submitted");

expect(hasAll(retailService, [
  'RETAIL_CLOSE_APPROVER_REQUIRED',
  "createAccountingApprovalAssignment",
  'targetEntityType: "EnterpriseCashSession"',
  "approverUserId: input.approverUserId",
  "requireAccountingApprovalDecision",
  "decideAccountingApproval",
  'eventType: "CASH_SESSION_CLOSED"',
  'eventType: "CASH_SESSION_REJECTED"',
]), "Shop daily close creates and decides canonical cash approvals");
expect(retailService.indexOf("createAccountingApprovalAssignment") < retailService.indexOf('status: "PENDING_VALIDATION"', retailService.indexOf("export async function createRetailDailyClose")), "Shop daily close assigns approval before the cash session enters pending validation");

expect(hasAll(dailyCloseRoute, [
  "cashSessionIds",
  "cashApproverById",
  "canApprove",
  "canReject",
  'status === "PENDING_VALIDATION"',
]), "daily close API only exposes decisions that match cash assignment state");
expect(hasAll(dailyCloseWorkspace, [
  'moduleCode="FINANCE_CASH"',
  "dailyCloseApproverRequired",
  "item.capabilities?.canApprove",
  "item.capabilities?.canReject",
]), "daily close UI selects the Finance approver and honors server capabilities");

expect(hasAll(mobileManager, [
  "cashSessionManageApproval",
  "/enterprise-modules/FINANCE_CASH?cashSessionId=",
]), "pending Retail tills link to the canonical Cash recovery surface");

expect(hasAll(packageJson, [
  '"qa:hotfix-662": "node scripts/qa-hotfix-662-cash-orphan-approval-recovery.mjs"',
  "qa-hotfix-662-cash-orphan-approval-recovery.mjs",
]), "hotfix QA is exposed directly and included in regression");

expect(hasAll(browserAcceptance, [
  "PENDING_VALIDATION",
  "targetEntityType: \"EnterpriseCashSession\"",
  "Affecter un validateur",
  "Valider la clôture",
  "CLOSED",
  "RETAIL_DAILY_CLOSE",
  "approverUserId",
]), "browser acceptance covers orphan recovery, assigned decision and new Shop daily close");
expect(hasAll(acceptanceWorkflow, [
  "Hotfix #662",
  "pnpm qa:hotfix-662",
  "pnpm qa:regression",
  "pnpm type-check",
  "pnpm lint",
  "pnpm build",
  "issue-662-cash-orphan-approval-recovery.spec.mjs",
]), "dedicated workflow proves static, regression, build and browser acceptance");
expect(hasAll(ownerE2E, [
  "E2E #662 bon",
  "OWNER_E2E",
  "320",
  "1024",
]), "OWNER_E2E #662 remains an explicit manual acceptance contract");

const failed = checks.filter((check) => !check.ok);
for (const check of checks) console.log(`${check.ok ? "PASS" : "FAIL"} #662 ${check.label}`);
if (failed.length) {
  console.error(`Hotfix #662 QA: ${failed.length} échec(s).`);
  process.exit(1);
}
console.log(`Hotfix #662 QA: PASS (${checks.length} contrôles).`);
