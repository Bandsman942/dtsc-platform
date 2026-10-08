import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const expect = (condition, message) => { if (!condition) failures.push(message); };
const hasAll = (content, tokens, label) => {
  for (const token of tokens) expect(content.includes(token), `${label}: missing ${token}`);
};

const schema = read("prisma/enterprise-relationship-benefits.prisma");
const migration = read("prisma/migrations/20261007193000_hotfix_781_relationship_benefits/migration.sql");
const registry = read("lib/enterprise/module-registry-common-domains.json");
const identityContracts = read("lib/enterprise/identity-links/contracts.ts");
const identityAccess = read("lib/enterprise/identity-links/access.ts");
const service = read("lib/enterprise/relationship-benefits/service.ts");
const http = read("lib/enterprise/relationship-benefits/http.ts");
const enterpriseApi = read("app/api/enterprise/[organizationId]/relationship-benefits/route.ts");
const benefitApi = read("app/api/enterprise/[organizationId]/relationship-benefits/[benefitId]/route.ts");
const usageApi = read("app/api/enterprise/[organizationId]/relationship-benefits/usages/[usageId]/route.ts");
const accountApi = read("app/api/account/enterprise-relationships/[organizationId]/benefits/route.ts");
const adminPage = read("app/enterprise-relationship-benefits/page.tsx");
const adminUi = read("components/enterprise/relationship-benefits/relationship-benefits-admin-workspace.tsx");
const userUi = read("components/enterprise/relationship-benefits/relationship-benefits-user-panel.tsx");
const relationshipUi = read("components/enterprise/identity-links/enterprise-identity-user-panel.tsx");

hasAll(schema, [
  "model EnterpriseRelationshipBenefit",
  "model EnterpriseRelationshipBenefitAudience",
  "model EnterpriseRelationshipBenefitAssignment",
  "model EnterpriseRelationshipBenefitUsage",
  "@@unique([organizationId, code])",
  "@@unique([organizationId, idempotencyKey])",
], "Prisma additive relationship benefit domain");

hasAll(migration, [
  'CREATE TABLE "EnterpriseRelationshipBenefit"',
  'CREATE TABLE "EnterpriseRelationshipBenefitUsage"',
  'INSERT INTO "EnterpriseModule"',
  "'RELATIONSHIP_BENEFITS'",
  'ON CONFLICT ("organizationId","moduleCode") DO NOTHING',
], "Additive migration and module backfill");

hasAll(registry, [
  '"code": "RELATIONSHIP_BENEFITS"',
  '"routePath": "/enterprise-relationship-benefits"',
  '"minimumPlan": "BUSINESS"',
  '"requiresActiveSubscription": true',
  '"accessPolicy": "POSITION_PERMISSION"',
], "Canonical module registry");

for (const relationType of ["PATIENT", "STUDENT", "PARENT_GUARDIAN", "POLICYHOLDER", "BENEFICIARY", "DONOR", "VOLUNTEER", "TENANT", "OWNER_CLIENT", "DISTRIBUTOR", "RESELLER", "ALUMNI", "VIP"]) {
  expect(identityContracts.includes(`"${relationType}"`), `Sector relationship type missing: ${relationType}`);
  expect(identityAccess.includes(`${relationType}:`), `Relationship capability mapping missing: ${relationType}`);
}
hasAll(identityAccess, [
  'enabled.has("RELATIONSHIP_BENEFITS")',
  'allowedEntitlements.has("RELATIONSHIP_BENEFITS")',
  'capabilities.indexOf("ENTERPRISE_BENEFITS")',
], "Relationship benefit entitlement gate");

hasAll(service, [
  "resolveEnterpriseIdentityRelationshipAccess",
  "status: \"ACTIVE\"",
  "identityLinkId",
  "organizationId",
  "assignmentMode",
  "usageLimitTotal",
  "usageLimitPerPeriod",
  "idempotencyKey",
  "enterpriseRetailLoyaltyAccount",
  "enterpriseRetailStoredValueAccount",
  "enterprisePersonBusinessReference",
  "notifyUsers",
  "notifyUser",
  "cancelRelationshipBenefitUsageByUser",
  'status: { in: ["REQUESTED", "APPROVED"] }',
  "RELATIONSHIP_BENEFIT_IDEMPOTENCY_COLLISION",
  "RELATIONSHIP_BENEFIT_RELATION_INACTIVE",
  'status: "ACTIVE"',
  "pg_advisory_xact_lock",
  "Prisma.TransactionIsolationLevel.Serializable",
  "$executeRaw",
], "Server authority, Retail aggregation, cancellation and notifications");

expect(!service.includes("EnterpriseRetailLoyaltyProgram.create"), "Relationship engine must not duplicate Retail loyalty programs");
expect(!service.includes("EnterpriseRetailLoyaltyAccount.create"), "Relationship engine must not duplicate Retail loyalty accounts");
expect(!service.includes("EnterpriseRetailStoredValueAccount.create"), "Relationship engine must not dual-write Retail stored value");
expect(!/\$queryRaw(?:Unsafe)?[\s\S]{0,220}pg_advisory_xact_lock/.test(service), "Relationship engine must not use $queryRaw for benefit quota locks");

hasAll(http, [
  "isSameOriginRequest",
  "resolveEnterpriseModuleAccess",
  'moduleCode: "RELATIONSHIP_BENEFITS"',
  "rateLimit",
], "Enterprise benefit API security");

for (const [name, source] of [
  ["enterprise collection API", enterpriseApi],
  ["enterprise benefit API", benefitApi],
  ["enterprise usage API", usageApi],
]) {
  hasAll(source, ["writeApiLog", "organizationId"], name);
}
hasAll(enterpriseApi, ["writeAuditLog", "relationshipBenefitCreateSchema"], "Enterprise create audit and validation");
hasAll(benefitApi, ["writeAuditLog", "relationshipBenefitPatchSchema"], "Benefit mutation audit and validation");
hasAll(usageApi, ["writeAuditLog", "relationshipBenefitUsageDecisionSchema"], "Usage mutation audit and validation");

hasAll(accountApi, [
  "requireIdentityLinkSession",
  "EnterpriseIdentityLinkError",
  "resolveEnterpriseRelationshipBenefits",
  "relationshipBenefitUsageSchema",
  "rateLimit",
  "writeAuditLog",
  "relationshipBenefitUsageCancelSchema",
  "cancelRelationshipBenefitUsageByUser",
  "export async function PATCH",
], "Global account relationship facade");

hasAll(adminPage, [
  "resolveEnterpriseModuleCapabilities",
  'moduleCode: "RELATIONSHIP_BENEFITS"',
  "RelationshipBenefitsAdminWorkspace",
], "Enterprise admin page access");
hasAll(adminUi, [
  "ModuleWorkspace",
  "ProfessionalTabs",
  'presentation="editor"',
  "notifyToast",
  "relationTypes",
  "identityLinkIds",
  "usageLimitTotal",
  "usageLimitPerPeriod",
], "Professional benefit administration UI");
hasAll(userUi, [
  "/api/account/enterprise-relationships/",
  "benefits?identityLinkId=",
  "idempotencyKey",
  "Fidélité Retail",
  "Cartes-cadeaux et avoirs",
  "Services autorisés par la relation",
  "Mes demandes d’avantages",
  "Cancel request",
  'method: "PATCH"',
], "Customer benefit UI, request lifecycle and Retail projection");
hasAll(relationshipUi, [
  "RelationshipBenefitsUserPanel",
  'selectedLink?.status === "ACTIVE"',
], "Active relationship integration");
expect(!relationshipUi.includes("}\\n            {detailStatus"), "Active relationship UI contains an escaped newline artifact");

if (failures.length) {
  console.error("\nHotfix #781 QA failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("Hotfix #781 QA passed.");
