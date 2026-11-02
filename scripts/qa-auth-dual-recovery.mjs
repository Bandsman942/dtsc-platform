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
const registry = read("lib/auth/session-registry.ts");
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
assert.ok(auth.includes("isAuthSessionActive"), "Authorization must consult the canonical registry");
assert.ok(registry.includes("mfaRecoveryInvalidBefore") && registry.includes("mfaRecoveryRequired"));
assert.ok(registry.includes("session.mfaVerifiedAt <= user.mfaRecoveryInvalidBefore.getTime()"), "Old verified cookies rejected by registry");
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
console.log("AUTH-04: dual-operator recovery and administrative step-up safety checks OK; browser E2E pending.");
