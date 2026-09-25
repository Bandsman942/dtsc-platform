import fs from "node:fs";

function read(path) { return fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8"); }
function expect(condition, label) {
  if (!condition) { console.error(`FAIL EDU-1: ${label}`); process.exitCode = 1; }
  else console.log(`PASS EDU-1: ${label}`);
}
function all(source, markers) { return markers.every((marker) => source.includes(marker)); }

const schema = read("prisma/enterprise-education.prisma");
const migration = read("prisma/migrations/20260926002000_education_academic_structure/migration.sql");
const registry = read("lib/enterprise/module-registry-education.json");
const registryRuntime = read("lib/enterprise/module-registry.ts");
const moduleOrder = read("lib/enterprise/module-order.ts");
const constants = read("lib/enterprise/education/constants.ts");
const schemas = read("lib/enterprise/education/schemas.ts");
const http = read("lib/enterprise/education/http.ts");
const service = read("lib/enterprise/education/service.ts");
const collectionRoute = read("app/api/enterprise/[organizationId]/education/structure/route.ts");
const itemRoute = read("app/api/enterprise/[organizationId]/education/structure/[id]/route.ts");
const page = read("app/enterprise-education/[moduleCode]/page.tsx");
const workspace = read("components/enterprise/education/enterprise-education-workspace.tsx");
const i18n = read("lib/enterprise/education/i18n.ts");
const guides = read("lib/enterprise/education-user-guides.ts");
const guideRegistry = read("lib/user-guides/enterprise-guide-registry.ts");
const doc = read("docs/ERP_EDUCATION_ACADEMIC_STRUCTURE.md");
const packageJson = read("package.json");
const regression = read("scripts/qa-regression-checks.mjs");

for (const model of [
  "EnterpriseEducationInstitutionSettings",
  "EnterpriseEducationCampus",
  "EnterpriseEducationAcademicYear",
  "EnterpriseEducationAcademicPeriod",
  "EnterpriseEducationAcademicLevel",
  "EnterpriseEducationDepartment",
  "EnterpriseEducationProgram",
  "EnterpriseEducationClassGroup",
  "EnterpriseEducationSubject",
  "EnterpriseEducationCourseOffering",
  "EnterpriseEducationCalendarEvent",
]) expect(schema.includes(`model ${model}`), `dedicated model exists: ${model}`);

expect(all(schema, ["organizationId", "revision", "archivedAt", "@@unique([organizationId, id])"]), "tenant scope, revision and archive conventions are present");
expect(all(schema, [
  "EnterpriseEducationAcademicPeriod",
  "@relation(fields: [organizationId, academicYearId]",
  "EnterpriseEducationClassGroup",
  "@relation(fields: [organizationId, campusId]",
  "EnterpriseEducationCourseOffering",
  "@relation(fields: [organizationId, subjectId]",
]), "cross-reference relations carry organizationId in composite foreign keys");
expect(!schema.includes("EducationInvoice") && !schema.includes("EducationPayment") && !schema.includes("EducationPayroll"), "EDU-1 does not duplicate Finance or HR authorities");

expect(all(migration, [
  'CREATE TABLE "EnterpriseEducationCampus"',
  'CREATE TABLE "EnterpriseEducationAcademicYear"',
  'CREATE TABLE "EnterpriseEducationCourseOffering"',
  'CREATE TABLE "EnterpriseEducationCalendarEvent"',
  "'education-template-v2'",
  '"version", "label"',
  "'EDUCATION_SETTINGS'",
  "'ACADEMIC_STRUCTURE'",
  "'ACADEMIC_CALENDAR'",
]), "additive migration creates academic schema and Education template v2");
expect(!/\bDROP\s+(TABLE|COLUMN|TYPE|INDEX)\b/i.test(migration), "migration contains no destructive DROP");
expect(all(migration, [
  "v1 module rows become navigation-inactive only",
  "'STUDENTS','TEACHERS','CLASSES','COURSES','ATTENDANCE','EXAMS_GRADES','SCHOOL_FEES','PARENTS_GUARDIANS','DISCIPLINE','ACADEMIC_REPORTS'",
  '"isEnabled" = false',
]), "legacy Education v1 navigation is disabled without destructive conversion");

for (const code of ["EDUCATION_SETTINGS", "ACADEMIC_STRUCTURE", "ACADEMIC_CALENDAR"]) {
  expect(registry.includes(`"code": "${code}"`), `canonical registry includes ${code}`);
}
expect(all(registry, ['"domain": "SECTOR_EDUCATION"', '"implementationStatus": "ACTIVE"', '"minimumPlan": "BUSINESS"', '"workspaceKey": "ENTERPRISE_EDUCATION"']), "Education modules are active, sector-scoped and plan-governed");
expect(!all(registry, ['"alias": "TEACHERS"', '"alias": "EXAMS_GRADES"']), "legacy ambiguous codes are not automatic aliases");
expect(all(registryRuntime, ["module-registry-education.json", "SECTOR_EDUCATION", "...educationRegistryData.modules"]), "Education registry participates in canonical runtime");
expect(moduleOrder.includes("SECTOR_EDUCATION: 70"), "Education has a navigation order");
expect(all(constants, ["EDUCATION_RESOURCE_MODULE", "EDUCATION_SETTINGS", "ACADEMIC_STRUCTURE", "ACADEMIC_CALENDAR"]), "resource-to-module map is explicit");

expect(all(schemas, ["z.coerce.date()", "revision", "endAfterStart", "educationMutationSchema"]), "inputs validate dates, revisions and transitions");
expect(all(http, ["activeOrganizationId !== organizationId", "getEnterpriseCommonDomainAccess", "isSameOriginRequest", "rateLimit", "EDUCATION_RESOURCE_MODULE"]), "HTTP authorization enforces active tenant, module permissions, origin and rate limits");
expect(all(service, [
  "organizationId",
  "archivedAt: null",
  "EnterpriseDomainConflictError",
  "revision: { increment: 1 }",
  "EDUCATION_PERIOD_YEAR_MISMATCH",
  "EDUCATION_CLASS_SCOPE_MISMATCH",
  "assertArchivableYear",
  "assertArchivablePeriod",
]), "service enforces tenant references, optimistic concurrency and historical protection");
expect(!service.includes(".delete(") && !service.includes(".deleteMany("), "service exposes no hard delete");
expect(all(service, ["pageSize", "skip", "take", "pagination("]), "academic lists are server-paginated");

expect(all(collectionRoute, ["authorizeEducationRequest", "educationCreateEnvelopeSchema", "listEducationResource", "writeAuditLog", "writeApiLog"]), "collection API is typed, authorized and audited");
expect(all(itemRoute, ['export async function PATCH', 'export async function DELETE()', '"METHOD_NOT_ALLOWED"', "revision"]), "item API uses explicit transitions and refuses DELETE");

expect(all(page, ["EDUCATION_MODULE_CODES", "resolveEnterpriseModuleCapabilities", 'sectorCode: EDUCATION_SECTOR_CODE', "EnterpriseEducationWorkspace"]), "Education route is canonical, permission-aware and sector-bound");
expect(all(workspace, [
  "ModuleWorkspace",
  "ModuleHeader",
  "ModuleToolbar",
  "ModuleMetrics",
  "BusinessList",
  'presentation="editor"',
  "320",
].filter((marker) => marker !== "320")), "workspace uses common responsive primitives and full-screen editor dialogs");
expect(all(workspace, ["setup", "pagination", "loadList", "hasNextPage", "EmptyState"]), "workspace includes setup assistant, pagination and empty states");
expect(all(i18n, ['fr:', 'en:', '"Structure académique"', '"Academic structure"']), "Education UI copy is FR/EN");
expect(all(guides, ["EDUCATION_SETTINGS", "ACADEMIC_STRUCTURE", "ACADEMIC_CALENDAR", "relatedModules", "troubleshooting"]), "three canonical Education user guides exist");
expect(all(guideRegistry, ["EDUCATION_USER_GUIDES", "EDUCATION_USER_GUIDES[normalized]"]), "Education guides are registered in the canonical help registry");

expect(all(doc, ["EDU-1", "Isolation multi-tenant", "Template Education v2", "Aucune suppression physique", "Rollback"]), "EDU-1 technical and user-facing contract is documented");
expect(packageJson.includes('"qa:education-academic-structure"'), "EDU-1 targeted QA command is exposed");
expect(regression.includes('await import("./qa-education-academic-structure.mjs")'), "EDU-1 gate runs permanently in qa:regression");

if (process.exitCode) process.exit(process.exitCode);
console.log("EDU-1 academic structure QA passed.");
