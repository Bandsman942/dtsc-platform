import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = p => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const schema=read("prisma/auth-known-browser.prisma"),
 migration=read("prisma/migrations/20261102203000_auth_known_browser/migration.sql"),
 service=read("lib/auth/known-browser.ts"),
 stepup=read("lib/auth/step-up.ts"),
 endpoint=read("app/api/auth/step-up/route.ts"),
 browsers=read("app/api/account/security/known-browsers/route.ts"),
 ui=read("components/settings/known-browsers-settings.tsx"),
 consoleApi=read("app/api/admin/security/mfa-policy/route.ts"),
 consoleUi=read("components/admin/console-mfa-policy-panel.tsx"),
 signin=read("app/api/auth/sign-in/route.ts"),
 challenge=read("app/api/auth/mfa/challenge/route.ts"),
 confirm=read("app/api/account/security/totp/confirm/route.ts"),
 settings=read("app/settings/page.tsx");

for(const token of ["tokenHash","trustedAt","trustedUntil","revokedAt"])assert.ok(schema.includes(token));
assert.ok(migration.includes('CREATE TABLE "AuthKnownBrowser"'),"New device record migration");
assert.ok(service.includes("randomBytes(32)"),"Device tokens must be unpredictable");
assert.ok(service.includes("createHash(\"sha256\")"),"No raw browser token in DB");
assert.ok(service.includes("httpOnly: true"),"Secure browser token cookie");
assert.ok(service.includes("sendZohoOutboundMail"),"New-browser email alert");
assert.ok(service.includes("deliveryMode: \"direct\""),"Do not broadcast alerts");
assert.ok(service.includes("writeAuditLog"),"New-browser detection audited");
assert.ok(!/mfaBypass|skipMfa|bypassTotp/i.test(service+browsers),"Trusted markers never skip MFA");
assert.ok(service.includes("recordAuthenticatedBrowser"),"Registration implemented");
assert.ok(signin.includes("recordAuthenticatedBrowser"),"Password login triggers after completed session");
assert.ok(challenge.includes("recordAuthenticatedBrowser"),"TOTP login triggers after verified challenge");
assert.ok(confirm.includes("recordAuthenticatedBrowser"),"Enrollment success triggers login alert");
assert.ok(browsers.includes("getSession()"),"Trust cannot be unauthenticated");
assert.ok(browsers.includes("session.mfaVerifiedAt"),"Trust requires recent MFA");
assert.ok(browsers.includes("verifyPassword"),"Trust requires current password");
assert.ok(browsers.includes("userId: session.userId"),"Cannot revoke other users' browsers");
assert.ok(browsers.includes("writeAuditLog"),"Trust and revoke audited");
assert.ok(ui.includes('action: "trust"'),"Consent UI is real");
assert.ok(ui.includes('action: "revoke"'),"Revoke UI is real");
assert.ok(settings.includes("<KnownBrowsersSettings"),"UI integrated");
assert.ok(stepup.includes("timingSafeEqual"),"Step-up signature compare timing-safe");
assert.ok(stepup.includes("sessionDigest(token)"),"Step-up bound to current session cookie");
assert.ok(stepup.includes('sameSite: "strict"'),"Step-up cookie CSRF protected");
assert.ok(endpoint.includes("consumeTotpFactorCode"),"Step-up confirms TOTP factor");
assert.ok(endpoint.includes("consumeTotpRecoveryCode"),"Step-up supports one-time recovery");
assert.ok(endpoint.includes("verifyPassword"),"Step-up confirms password");
assert.ok(endpoint.includes('failureMode: "closed"'),"Step-up rate limit fails closed");
assert.ok(consoleApi.includes("hasRecentStepUp(access.session)"),"Sensitive security mutation protected");
assert.ok(consoleUi.includes('fetch("/api/auth/step-up"'),"Console triggers secure step-up UI");
console.log("AUTH-04: new-browser alerts, trust consent and signed step-up invariants OK. OWNER_E2E pending.");
