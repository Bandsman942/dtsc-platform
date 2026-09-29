import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const check = (condition, message) => { if (!condition) failures.push(message); };

const schema = read("prisma/enterprise-gaming.prisma");
const migration = read("prisma/migrations/20260929143500_gaming_daily_close_assigned_approver/migration.sql");
const schemas = read("lib/enterprise/gaming/checkout-schemas.ts");
const service = read("lib/enterprise/gaming/daily-close.ts");
const access = read("lib/enterprise/gaming/access.ts");
const collectionRoute = read("app/api/enterprise/[organizationId]/gaming/daily-closes/route.ts");
const decisionRoute = read("app/api/enterprise/[organizationId]/gaming/daily-closes/[closeId]/route.ts");
const workspace = read("components/enterprise/gaming/enterprise-gaming-daily-close-workspace.tsx");
const copy = read("components/enterprise/gaming/gaming-daily-close-i18n.ts");
const e2e = read("tests/e2e/issue-693-gaming-checkout-invoice.spec.mjs");
const regression = read("scripts/qa-regression-checks.mjs");
const pkg = read("package.json");

check(schema.includes("approverUserId       String?"), "#710 schema must persist nullable assigned approver for historical compatibility.");
check(migration.includes('ADD COLUMN IF NOT EXISTS "approverUserId" TEXT'), "#710 migration must add assigned approver additively.");
check(!/\bDROP\s+(TABLE|COLUMN|TYPE|INDEX)\b/i.test(migration), "#710 migration must remain non-destructive.");

check(schemas.includes("approverUserId: id"), "#710 create schema must require an approver.");
check(schemas.includes('reason: z.string().trim().max(1000).optional()'), "#710 validation reason must not have a minimum length.");
check(schemas.includes('value.action === "REJECT"') && schemas.includes("value.reason.length < 8"), "#710 rejection must keep the 8-character minimum.");
check(schemas.includes('"ASSIGN_APPROVER"') && schemas.includes("GAMING_CLOSE_APPROVER_REQUIRED"), "#710 must support explicit recovery assignment for historical submitted closes.");

for (const marker of [
  "assertEnterpriseApprovalCandidate",
  "assertEnterpriseApprovalDecision",
  'moduleCode: "GAMING_DAILY_CLOSE"',
  "GAMING_CLOSE_APPROVER_NOT_ASSIGNED",
  "GAMING_CLOSE_APPROVER_ALREADY_ASSIGNED",
  "GAMING_CLOSE_APPROVER_ASSIGNMENT_FORBIDDEN",
  'input.action === "ASSIGN_APPROVER"',
  "GAMING_CLOSE_WRONG_APPROVER",
  "approverUserId: input.approverUserId",
]) check(service.includes(marker), `#710 service missing ${marker}`);

check(access.includes('"approve"') && access.includes("capabilities.canApprove"), "#710 Gaming access must expose canonical approve capability.");
check(collectionRoute.includes("canApprove: gamingAccess.canApprove"), "#710 collection API must expose approve capability.");
check(decisionRoute.includes('action: "approve"'), "#710 decision route must require approve capability.");
check(!decisionRoute.includes("parsed.error.issues[0]?.message"), "#710 decision API must not expose raw Zod messages.");
check(!collectionRoute.includes("parsed.error.issues[0]?.message"), "#710 create API must not expose raw Zod messages.");

for (const marker of [
  "approval-candidates?moduleCode=GAMING_DAILY_CLOSE",
  "candidate.isRequester",
  "approverUserId",
  "collection.extra.canApprove",
  "openAssignApprover",
  'action: "ASSIGN_APPROVER"',
  'min-w-[1120px]',
  "whitespace-nowrap px-3 py-3",
  "md:hidden",
  "hidden overflow-x-auto md:block",
]) check(workspace.includes(marker), `#710 workspace missing ${marker}`);

for (const marker of ["Validateur", "Approver", "d’au moins 8 caractères", "at least 8 characters"]) {
  check(copy.includes(marker), `#710 i18n missing ${marker}`);
}

for (const marker of [
  "approverUserId,",
  'GAMING_CLOSE_SELF_VALIDATION_FORBIDDEN',
  'GAMING_CLOSE_REJECTION_REASON_TOO_SHORT',
  'action: "ASSIGN_APPROVER"',
  'reason: "Parfait"',
]) check(e2e.includes(marker), `#710 E2E missing ${marker}`);

check(regression.includes('qa-hotfix-710-gaming-close-approver-responsive.mjs'), "#710 must be part of canonical regression.");
check(pkg.includes('"qa:hotfix-710"'), "#710 package script missing.");

if (failures.length) {
  console.error(failures.map((failure) => `❌ ${failure}`).join("\n"));
  process.exit(1);
}
console.log("✅ Hotfix #710 vérifié : validateur assigné, décision maker/checker sûre et détail responsive.");
