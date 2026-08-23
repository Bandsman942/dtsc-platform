import fs from "node:fs";

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function requireAll(label, source, needles) {
  const missing = needles.filter((needle) => !source.includes(needle));
  if (missing.length) {
    console.error(`FAIL media proxy hotfix: ${label}: ${missing.join(", ")}`);
    process.exit(1);
  }
}

const logoStorage = read("lib/enterprise/organization-logo-storage.ts");
const logoReadRoute = read("app/api/enterprise/[organizationId]/logo/route.ts");
const logoUploadRoute = read("app/api/enterprise/[organizationId]/administration/logo/route.ts");
const enterpriseAdminPage = read("app/enterprise-admin/page.tsx");
const avatarAccess = read("lib/avatar-access.ts");
const avatarRoute = read("app/api/users/[id]/avatar/route.ts");
const conversationAvatar = read("components/chat/ConversationAvatar.tsx");

requireAll("logo storage", logoStorage, [
  "ORGANIZATION_LOGO_ASSET_PATTERN",
  "resolveOrganizationLogoStoragePath",
  "/storage/v1/object/public/",
  "organizationLogoProxyUrl",
  "downloadOrganizationLogoFromSupabase",
  "company-logos/${organizationId}/",
]);
if (logoStorage.includes("getPublicUrl")) {
  console.error("FAIL media proxy hotfix: organization logos must not depend on Supabase public URLs.");
  process.exit(1);
}

requireAll("logo read route", logoReadRoute, [
  "requireEnterpriseMembership",
  "organizationType: \"CLIENT\"",
  "resolveOrganizationLogoStoragePath",
  "downloadOrganizationLogoFromSupabase",
  "Cache-Control\": \"private",
]);
requireAll("logo upload route", logoUploadRoute, [
  "/api/enterprise/${organizationId}/logo?asset=",
  "uploaded.assetKey",
  "new URL(req.url).origin",
]);
requireAll("legacy admin logo normalization", enterpriseAdminPage, [
  "organizationLogoProxyUrl",
  "dataset.organization.logoUrl",
]);

requireAll("avatar access", avatarAccess, [
  "publicProfileConsent",
  "status: \"ACTIVE\"",
  "removedAt: null",
  "collaborationContactRequest.findFirst",
  "status: \"ACCEPTED\"",
  "isCollaborationBlocked",
]);
requireAll("avatar route", avatarRoute, [
  "canReadUserAvatar",
  "viewerUserId: session?.userId",
  "downloadProfileAvatarFromSupabase",
]);
requireAll("avatar fallback", conversationAvatar, [
  "imageFailed",
  "onError={() => setImageFailed(true)}",
  "setImageFailed(false)",
]);

console.log("PASS media proxy hotfix QA");
