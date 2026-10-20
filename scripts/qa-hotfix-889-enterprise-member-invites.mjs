import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const shared = read("lib/enterprise/member-invitation-roles.ts");
const validators = read("lib/validators.ts");
const route = read("app/api/enterprise/[organizationId]/members/route.ts");
const patch = read("app/api/enterprise/[organizationId]/members/[memberId]/route.ts");
const panel = read("components/enterprise/enterprise-admin-panels.tsx");
const module = read("components/enterprise/enterprise-administration-module.tsx");

assert.match(shared, /ENTERPRISE_INVITABLE_ROLES = \["MANAGER", "MEMBER", "GUEST"\]/, "Invitation only grants non-privileged roles");
assert.match(shared, /ENTERPRISE_PRIVILEGED_ROLES = \["OWNER", "ADMIN_ENTREPRISE", "ADMIN_ENTERPRISE"\]/, "Both historical admin aliases remain recognized");
assert.equal((shared.match(/value: "(MANAGER|MEMBER|GUEST)", labelFr:/g) || []).length, 3, "Exactly three invite options without duplicate admin");
assert.match(validators, /role: z\.enum\(ENTERPRISE_INVITABLE_ROLES\)/, "Zod and select use the same source of truth");

assert.match(route, /reasonCode: "INVITATION_FIELDS_INVALID"/, "Invalid input has typed error code");
assert.match(route, /INVITATION_ROLE_NOT_ALLOWED/, "Unsupported role is identified");
assert.match(route, /fieldErrors/, "Input errors preserve field specificity");
assert.match(route, /invalidFields \}/, "Field names logged without request values");
assert.match(route, /isEnterpriseInvitableRole\(configuredRole\)/, "Configured default cannot grant admin privilege");
assert.match(route, /status: "INVITED"/, "Invited membership never activates itself");
assert.match(route, /sendEnterpriseInvitationEmail/, "Existing email delivery remains supported");
assert.match(route, /organizationId, userId: targetUser\.id/, "Membership remains tenant-scoped");

assert.match(patch, /criticalAdminRoles\.has\(data\.role\) \|\| criticalAdminRoles\.has\(member\.role\)/, "No client-side upgrade or downgrade of privileged role");
assert.match(patch, /ADMIN_ROLE_DTSC_ONLY/, "Forbidden privilege mutation returns stable code");
assert.match(patch, /remainingCriticalAdmins === 0/, "Last-admin protection retained");

assert.match(panel, /ENTERPRISE_INVITABLE_ROLE_OPTIONS\.map/, "Role select shows only canonical selectable roles");
assert.doesNotMatch(panel, /Object\.entries\(roleLabels\)\.map/, "No duplicate privileged role aliases in combobox");
assert.match(panel, /isEnterprisePrivilegedRole\(defaultValue\)/, "Existing admins are read-only");
assert.match(panel, /if \(result\.ok\) \{\s*setInviteOpen\(false\)/, "Invite form closes only after backend success");
assert.match(panel, /setInviteFieldErrors\(result\.fieldErrors \|\| \{\}\)/, "Field errors displayed without losing input");
assert.match(panel, /disabled=\{inviting\}/, "Double-submit blocked");
assert.match(panel, /role="alert"/, "Accessible field and general errors");
assert.match(module, /if \(!response\.ok \|\| !body\?\.ok\)/, "Both HTTP and business failures prevent success");
assert.match(module, /body\.emailSent/, "Email delivery outcome is distinguished from internal invitation");
assert.match(module, /return \{ ok: false, message: errorMessage/, "UI receives actionable failure");

console.log("✓ Hotfix #889 enterprise invitations: role policy, field errors, UI persistence and security contracts");
