import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(path) { return readFileSync(new URL("../" + path, import.meta.url), "utf8"); }
const login = read("app/api/auth/sign-in/route.ts");
const challenge = read("app/api/auth/mfa/challenge/route.ts");
const manager = read("lib/auth/mfa-challenge.ts");
const enroll = read("app/api/account/security/totp/enroll/route.ts");
const confirm = read("app/api/account/security/totp/confirm/route.ts");
const disable = read("app/api/account/security/totp/disable/route.ts");
const status = read("app/api/account/security/totp/route.ts");
const authForm = read("components/auth/auth-form.tsx");
const settings = read("components/settings/totp-security-settings.tsx");
const settingsPage = read("app/settings/page.tsx");
const qr = read("lib/vendor/qrcodegen.ts");
const model = read("prisma/auth-security.prisma");
const migration = read("prisma/migrations/20261102160000_auth_mfa_challenge/migration.sql");

for (const marker of [
  "if (user.mfaRecoveryRequired || factor?.enabledAt || mandatoryMfa)",
  "await clearSessionCookie();",
  "await createMfaChallenge(",
  "mfaRequired: Boolean(factor?.enabledAt) && !user.mfaRecoveryRequired",
  "mfaEnrollmentRequired: user.mfaRecoveryRequired || (!factor?.enabledAt && mandatoryMfa)",
  "await clearMfaChallengeCookie();",
]) assert.ok(login.includes(marker), "Missing MFA sign-in condition " + marker);

const challengeStart = login.indexOf("if (user.mfaRecoveryRequired || factor?.enabledAt || mandatoryMfa)");
const sessionStart = login.indexOf("await setSessionCookie(");
assert.ok(challengeStart !== -1 && sessionStart > challengeStart, "MFA must be decided before full session");
assert.ok(login.includes('purpose: user.mfaRecoveryRequired ? "ENROLL"'), "Recovery cannot issue a full session without new MFA setup");
assert.ok(manager.includes('sameSite: "strict"'), "MFA cookie must be same-site");
assert.ok(manager.includes("httpOnly: true"), "MFA cookie must be httpOnly");
assert.ok(manager.includes("tokenHash: hashToken(token)"), "No raw challenge token in database");
assert.ok(manager.includes("FIVE_MINUTES"), "Time-bound pre-session challenge");
assert.ok(manager.includes('attempts: { lt: MAX_ATTEMPTS }'), "Atomic bounded attempts");
assert.ok(manager.includes("consumedAt: null"), "One-use challenge");

for(const marker of ["consumeMfaChallengeAttempt", "consumeTotpFactorCode", "consumeTotpRecoveryCode", "finalizeMfaChallenge", "setSessionCookie", "resolveOrganizationLoginContext", "Cache-Control"]) {
  assert.ok(challenge.includes(marker), "Challenge finalizer missing " + marker);
}
assert.ok(challenge.indexOf("finalizeMfaChallenge(") < challenge.indexOf("setSessionCookie("), "Challenge must be finalized before a session");
assert.ok(challenge.includes("failureMode: \"closed\""), "Rate limit fail-closed");
assert.ok(enroll.includes("verifyPassword"), "Enrollment requires password");
assert.ok(enroll.includes("encryptTotpSecret"), "Enrollment must encrypt secret");
assert.ok(enroll.includes("current?.enabledAt"), "Enabled factor must be immutable by enrollment");
assert.ok(confirm.includes("prisma.$transaction"), "Enrollment confirmation and backup codes must be transactional");
assert.ok(confirm.includes("enabledAt: null"), "Cannot re-confirm enabled factor");
assert.ok(confirm.includes("recoveryCodes"), "Confirmation must return one-time recovery codes");
assert.ok(disable.includes("verifyPassword"), "Disabling requires password");
assert.ok(disable.includes("consumeTotpFactorCode") && disable.includes("consumeTotpRecoveryCode"), "Disabling requires second factor");
assert.ok(status.includes('Cache-Control": "no-store"'), "Account status should not be cached");
assert.ok(!status.includes("secretCiphertext"), "Account status cannot expose TOTP secret");
assert.ok(qr.includes("MIT License"), "Vendored QR generator retains MIT notice");
assert.ok(settings.includes("qrcodegen.QrCode.encodeText"), "QR must be rendered locally");
assert.ok(!settings.includes("https://api.qr"), "No external QR providers for secrets");
assert.ok(settingsPage.includes("TotpSecuritySettings"), "Settings must expose TOTP");
assert.ok(authForm.includes("/api/auth/mfa/challenge"), "Frontend must verify second factor");
assert.ok(authForm.includes("mfaRequired"), "Frontend must recognize challenge");
assert.ok(model.includes("model AuthMfaChallenge"), "Prisma challenge model missing");
assert.ok(migration.includes('CREATE TABLE "AuthMfaChallenge"'), "Challenge migration missing");
console.log("AUTH-02: source contract checks OK. Authenticated browser E2E is additionally required.");
