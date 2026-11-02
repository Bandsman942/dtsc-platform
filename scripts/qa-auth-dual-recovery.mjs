import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = p => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const model = read("prisma/auth-mfa-recovery.prisma");
const migration = read("prisma/migrations/20261102214500_auth_mfa_recovery_two_person/migration.sql");
const userModel = read("prisma/schema.prisma");
const create = read("app/api/admin/security/mfa-recovery/route.ts");
const decide = read("app/api/admin/security/mfa-recovery/[id]/route.ts");
const role = read("app/api/admin/users/[id]/role/route.ts");
const status = read("app/api/admin/users/[id]/status/route.ts");
const changed = read("components/admin/critical-change-select.tsx");
const roleSelect = read("components/admin/user-role-select.tsx");
const statusSelect = read("components/admin/user-status-select.tsx");
const auth = read("lib/auth.ts");
const signIn = read("app/api/auth/sign-in/route.ts");
const confirmation = read("app/api/account/security/totp/confirm/route.ts");
const consoleUI = read("components/admin/console-mfa-recovery-panel.tsx");
const consolePage = read("app/admin/console-page.tsx");

assert.ok(model.includes("model AuthMfaRecoveryRequest"));
assert.ok(migration.includes('CREATE TABLE "AuthMfaRecoveryRequest"'));
assert.ok(migration.includes('CREATE UNIQUE INDEX "AuthMfaRecoveryRequest_one_pending_target_idx"'));
assert.ok(migration.includes('ADD COLUMN "mfaRecoveryRequired"'));
assert.ok(migration.includes('ADD COLUMN "mfaRecoveryInvalidBefore"'));
assert.ok(userModel.includes('mfaRecoveryTargets') && userModel.includes('mfaRecoveryRequested'));
assert.ok(userModel.includes('mfaRecoveryApproved'), "Three independent User relations must be modeled");
assert.ok(auth.includes("mfaRecoveryInvalidBefore") && auth.includes("mfaRecoveryRequired"));
assert.ok(auth.includes("session.mfaVerifiedAt <= identity.mfaRecoveryInvalidBefore.getTime()"), "Old verified cookies rejected");
assert.ok(signIn.includes('purpose: user.mfaRecoveryRequired ? "ENROLL"'), "Recovery must force limited enrollment");
assert.ok(confirmation.includes('mfaRecoveryRequired: false'), "Unlock only after factor confirmation");
for (const source of [create, decide]) {
  assert.ok(source.includes("CONSOLE_CAPABILITIES.SECURITY_MANAGE"), "Only security managers can act");
  assert.ok(source.includes("hasRecentStepUp(access.session)"), "Dual recovery requires recent strong reauth");
  assert.ok(source.includes("isSameOriginRequest(req)"), "Reject cross-site mutations");
  assert.ok(source.includes('failureMode: "closed"'), "Rate limiting fails closed");
  assert.ok(source.includes("writeAuditLog"), "Decision must be recorded");
}
assert.ok(create.includes('target.role !== "ADMIN"'), "No privilege abuse for ordinary accounts");
assert.ok(create.includes("target?.id === access.session.userId"), "Requester cannot request own recovery");
assert.ok(decide.includes("current.requestedByUserId, current.targetUserId"), "Second approver must differ from requester and target");
assert.ok(decide.includes("requestedByUserId: { not: access.session.userId }"), "Dual approval CAS must enforce distinct actors");
assert.ok(decide.includes("tx.authTotpFactor.deleteMany"), "Only approval may remove old MFA factor");
assert.ok(decide.includes("tx.user.update"), "Approval must lock all old cookies");
assert.ok(decide.includes("tx.authMfaChallenge.updateMany"), "Outstanding MFA challenges must be invalidated");
assert.ok(decide.includes("await prisma.$transaction"), "Recovery commits atomically");
assert.ok(consoleUI.includes('fetch("/api/auth/step-up"'), "Console requires step-up before recovery");
assert.ok(consolePage.includes("<ConsoleMfaRecoveryPanel"), "Recovery must have real Console UI");
for (const endpoint of [role, status]) {
  assert.ok(endpoint.includes('reasonCode: "STEP_UP_REQUIRED"'), "Role/status mutations must reject without step-up");
  assert.ok(endpoint.includes("hasRecentStepUp(access.session)"));
}
assert.ok(changed.includes('fetch("/api/auth/step-up"'));
assert.ok(roleSelect.includes("CriticalChangeSelect") && statusSelect.includes("CriticalChangeSelect"));
const payrollPanel = read("components/admin/payroll-approval-panel.tsx");
for (const role of ["ceo", "coo"]) {
  const route = read(`app/api/admin/${role}/payroll-approvals/[id]/review/route.ts`);
  assert.ok(route.includes("hasRecentStepUp(session)"), role + " payroll approval requires MFA");
  assert.ok(route.includes('reasonCode: "STEP_UP_REQUIRED"'), role + " denies unverified mutation");
  assert.ok(route.includes("writeAuditLog"), role + " decisions remain audited");
}
assert.ok(payrollPanel.includes('fetch("/api/auth/step-up"'), "Payroll UI must perform step-up");
assert.ok(payrollPanel.includes("securityPassword") && payrollPanel.includes("securityCode"), "Payroll approval exposes secure reauth form");
const paymentRoute = read("app/api/enterprise/[organizationId]/payments/[paymentId]/transition/route.ts");
const transferRoute = read("app/api/enterprise/[organizationId]/account-transfers/[transferId]/transition/route.ts");
const criticalActions = read("lib/auth/critical-actions.ts");
const paymentUi = read("components/enterprise/professional/enterprise-finance-payments-workspace.tsx");
const treasuryUi = read("components/enterprise/professional/enterprise-finance-payments-treasury-workspace.tsx");
const criticalStepUpUi = read("components/enterprise/professional/finance-critical-step-up.tsx");
for (const action of ["APPROVE", "CONFIRM", "RECONCILE", "REVERSE"]) {
  assert.ok(criticalActions.includes('"' + action + '"'), "Payment action " + action + " must require step-up");
}
assert.ok(paymentRoute.includes("requiresPaymentStepUp(parsed.data.action)"), "Finance API must enforce step-up independently of UI");
assert.ok(paymentRoute.includes("hasRecentStepUp(auth.session)"), "Finance API must inspect verified session");
assert.ok(transferRoute.includes("requiresPaymentStepUp(parsed.data.action)") && transferRoute.includes("hasRecentStepUp(auth.session)"), "Money transfer approval and execution must require step-up");
assert.ok(paymentRoute.includes('reasonCode: "STEP_UP_REQUIRED"'), "Finance API must return actionable 428");
assert.ok(criticalStepUpUi.includes('fetch("/api/auth/step-up"'), "Finance step-up must invoke authenticated endpoint");
assert.ok(paymentUi.includes("performFinanceCriticalStepUp(form, actionTarget.action)"), "Modern payments UI must not bypass step-up");
assert.ok(treasuryUi.includes("performFinanceCriticalStepUp(form, actionTarget.action)"), "Legacy treasury/payments UI must not bypass step-up");
assert.ok(paymentUi.includes("<FinanceCriticalStepUpFields"), "Modern payments UI must show verification");
assert.ok(treasuryUi.includes("<FinanceCriticalStepUpFields"), "Treasury payments UI must show verification");
console.log("AUTH-04: dual-operator recovery and administrative step-up safety checks OK; browser E2E pending.");
