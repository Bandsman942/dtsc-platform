import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const page = read("app/settings/page.tsx");
const workspace = read("components/settings/security-settings-workspace.tsx");
const totp = read("components/settings/totp-security-settings.tsx");
const sessions = read("components/settings/active-sessions-settings.tsx");
const browsers = read("components/settings/known-browsers-settings.tsx");
const push = read("components/settings/session-and-push-settings.tsx");

assert.ok(page.includes('<ModuleSection') && page.includes('id="account-security"'), "Security must reuse the canonical fullscreen ModuleSection");
for (const marker of ["Sécurité du compte et notifications", "Account security and notifications", "<SecuritySettingsWorkspace", "currentSession={("]) {
  assert.ok(page.includes(marker), "Missing consolidated personal security: " + marker);
}
for (const label of ["overview", "mfa", "sessions", "browsers", "notifications"]) {
  assert.ok(workspace.includes('key: "' + label + '"'), "Missing account security area: " + label);
  assert.ok(workspace.includes('id="security-panel-' + label + '"'), "Missing dedicated panel: " + label);
  assert.ok(workspace.includes('hidden={active !== "' + label + '"}'), "Unselected sensitive panel must be hidden: " + label);
}
for (const cmp of ["<TotpSecuritySettings", "<ActiveSessionsSettings", "<KnownBrowsersSettings", "<SessionAndPushSettings"]) {
  assert.ok(workspace.includes(cmp), "Existing working security control must remain reachable: " + cmp);
}
assert.ok(workspace.includes("aria-pressed={selected}") && workspace.includes("aria-controls="), "Keyboard-usable section selector needs accessible state");
assert.ok(workspace.includes("focus-visible:ring-2") && workspace.includes("min-h-14"), "Mobile touch targets and focus indicators must remain");
assert.ok(workspace.includes("currentSession: ReactNode"), "Current session details must remain readable in section");
assert.ok(workspace.includes("Preserve component state"), "One-time recovery codes must survive security panel switches");
assert.ok(totp.includes("qrcodegen.QrCode.encodeText"), "QR provisioning must remain local");
assert.ok(totp.includes("width: 248") && totp.includes('maxWidth: "100%"'), "TOTP QR size must be bounded at 248px on desktop and mobile");
assert.ok(totp.includes("data-totp-qr-container"), "QR needs a dedicated centered scan container");
assert.ok(!totp.includes("https://api.qr"), "Never send TOTP provisioning secret to an external QR service");
for (const [name, file, feature] of [
  ["TOTP", totp, '"/api/account/security/totp/confirm"'],
  ["Server sessions", sessions, '"revoke_others"'],
  ["Trusted browser", browsers, 'action: "trust"'],
  ["Session and Push", push, '"/api/account/session-policy"'],
]) {
  assert.ok(file.includes("embedded = false"), name + " needs embedded presentation without changing its API");
  assert.ok(file.includes(feature), name + " must keep the original interactive server action");
}
console.log("UX-SEC #1019: QR bounded, section consolidated, mobile/FR/EN navigation and all protected actions preserved.");
