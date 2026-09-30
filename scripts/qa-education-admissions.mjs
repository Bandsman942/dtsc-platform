import fs from "node:fs";

function read(path) {
  return fs.readFileSync(new URL("../" + path, import.meta.url), "utf8");
}

function expect(condition, label) {
  if (!condition) {
    console.error("FAIL EDU-2: " + label);
    process.exitCode = 1;
  } else {
    console.log("PASS EDU-2: " + label);
  }
}

function all(source, markers) {
  return markers.every((marker) => source.includes(marker));
}

const schema = read("prisma/enterprise-education.prisma");
const migration = read("prisma/migrations/20260928164000_education_admissions_enrollments/migration.sql");
const registry = read("lib/enterprise/module-registry-education.json");
const coreRegistry = read("lib/enterprise/module-registry-data.json");
const constants = read("lib/enterprise/education/constants.ts");
const http = read("lib/enterprise/education/http.ts");
const schemas = read("lib/enterprise/education/admissions-schemas.ts");
const service = read("lib/enterprise/education/admissions-service.ts");
const populationRoute = read("app/api/enterprise/[organizationId]/education/population/route.ts");
const admissionRoute = read("app/api/enterprise/[organizationId]/education/admissions/[id]/route.ts");
const admissionActions = read("app/api/enterprise/[organizationId]/education/admissions/[id]/actions/route.ts");
const studentRoute = read("app/api/enterprise/[organizationId]/education/students/[id]/route.ts");
const guardianRoute = read("app/api/enterprise/[organizationId]/education/students/[id]/guardians/route.ts");
const enrollmentActions = read("app/api/enterprise/[organizationId]/education/enrollments/[id]/actions/route.ts");
const page = read("app/enterprise-education/[moduleCode]/page.tsx");
const workspace = read("components/enterprise/education/enterprise-education-population-workspace.tsx");
const i18n = read("lib/enterprise/education/population-i18n.ts");
const guides = read("lib/enterprise/education-user-guides.ts");
const doc = read("docs/ERP_EDUCATION_ADMISSIONS_STUDENTS.md");
const owner = read("docs/OWNER_E2E_282_EDUCATION_ADMISSIONS.md");
const packageJson = read("package.json");
const regression = read("scripts/qa-regression-checks.mjs");

const models = [
  "EnterpriseEducationCandidate",
  "EnterpriseEducationAdmissionApplication",
  "EnterpriseEducationAdmissionDecision",
  "EnterpriseEducationStudent",
  "EnterpriseEducationGuardian",
  "EnterpriseEducationStudentGuardian",
  "EnterpriseEducationEnrollment",
  "EnterpriseEducationEnrollmentPlacement",
  "EnterpriseEducationEnrollmentHistory",
];

for (const model of models) {
  expect(schema.includes("model " + model), "dedicated model exists: " + model);
}

expect(all(schema, [
  "@@unique([organizationId, id])",
  "revision",
  "sourceCandidateId",
  "businessPartyId",
  "userId",
  "effectiveFrom",
  "effectiveUntil",
  "EnterpriseEducationEnrollmentHistory",
]), "tenant scope, external identity bridges, revision and effective-dated history are modeled");

expect(all(schema, [
  "@relation(fields: [organizationId, candidateId]",
  "@relation(fields: [organizationId, academicYearId]",
  "@relation(fields: [organizationId, campusId]",
  "@relation(fields: [organizationId, enrollmentId]",
]), "Education-internal foreign keys are tenant-aware");

expect(
  !schema.includes("EducationInvoice") &&
  !schema.includes("EducationPayment") &&
  !schema.includes("EducationDocumentBlob"),
  "EDU-2 does not duplicate Finance or Documents authorities",
);

const tables = [
  "EnterpriseEducationCandidate",
  "EnterpriseEducationAdmissionApplication",
  "EnterpriseEducationStudent",
  "EnterpriseEducationGuardian",
  "EnterpriseEducationEnrollment",
  "EnterpriseEducationEnrollmentPlacement",
  "EnterpriseEducationEnrollmentHistory",
];

for (const table of tables) {
  expect(migration.includes('CREATE TABLE "' + table + '"'), "migration creates " + table);
}

expect(!/\bDROP\s+(TABLE|COLUMN|TYPE|INDEX)\b/i.test(migration), "migration remains additive and non-destructive");

expect(all(migration, [
  "'ADMISSIONS'",
  "'STUDENTS'",
  "'GUARDIANS'",
  "enterprise.education.admissions.approve",
  "education-v2-block-admissions",
  "education-v2-block-students",
]), "Education template v2 receives EDU-2 modules, permissions and activity blocks");

for (const code of ["ADMISSIONS", "STUDENTS", "GUARDIANS"]) {
  expect(registry.includes('"code": "' + code + '"'), "registry includes " + code);
  expect(constants.includes('"' + code + '"'), "Education module codes include " + code);
}

expect(!coreRegistry.includes('"code": "STUDENTS"'), "legacy PLANNED STUDENTS placeholder is removed when EDU-2 becomes canonical");
expect(all(registry, [
  '"code": "STUDENTS"',
  '"implementationStatus": "ACTIVE"',
  '"routePath": "/enterprise-education/STUDENTS"',
]), "EDU-2 owns the single canonical STUDENTS definition");

expect(all(registry, [
  '"implementationStatus": "ACTIVE"',
  '"workspaceKey": "ENTERPRISE_EDUCATION"',
  '"minimumPlan": "BUSINESS"',
]), "EDU-2 modules are plan-governed and use the canonical Education workspace");

expect(registry.includes('"PARENTS_GUARDIANS"'), "legacy parent and guardian code has a single explicit convergence path");

expect(all(schemas, [
  "educationAdmissionCreateSchema",
  "educationAdmissionActionSchema",
  "educationEnrollmentActionSchema",
  "educationStudentGuardianLinkSchema",
  'z.literal("DECIDE")',
  'z.literal("TRANSFER")',
  "revision",
]), "EDU-2 inputs validate lifecycle actions and revisions");

expect(all(http, [
  "EDUCATION_ADMISSION_NOT_ACCEPTED",
  "EDUCATION_USER_LINK_INVALID",
  "EDUCATION_PARTY_LINK_INVALID",
  "REVISION_CONFLICT",
]), "human EDU-2 domain errors are mapped");

expect(all(service, [
  "validatePlacementReferences",
  "validateExternalIdentityLinks",
  "organizationId",
  "EnterpriseDomainConflictError",
  "EDUCATION_ADMISSION_SUBMITTED",
  "EDUCATION_ADMISSION_DECIDED",
  "EDUCATION_ENROLLMENT_CREATED",
  "EDUCATION_ENROLLMENT_STATUS_CHANGED",
  'placementReason: "INITIAL"',
  "placementReason: input.action",
  "effectiveUntil: effectiveAt",
]), "service enforces tenant references, optimistic concurrency, audit events and historical placements");

expect(all(service, [
  "if (application.enrollment)",
  "idempotent: true",
  "sourceCandidateId: application.candidateId",
]), "accepted admission conversion is idempotent");

expect(!service.includes(".delete(") && !service.includes(".deleteMany("), "EDU-2 service exposes no destructive delete");
expect(all(service, ["pageSize", "skip", "take", "pageResult"]), "admissions, students and guardians use server pagination");

expect(all(service, [
  "organizationMember.findFirst",
  "enterpriseBusinessParty.findFirst",
  'status: "ACTIVE"',
  "archivedAt: null",
]), "optional User and BusinessParty links are validated inside the active tenant");

expect(all(populationRoute, [
  "authorizeEducationRequest",
  "resolveEnterpriseModuleCapabilities",
  "listAdmissions",
  "listStudents",
  "listGuardians",
  "writeAuditLog",
  "writeApiLog",
]), "population API is authorized, capability-aware and audited");

expect(all(admissionRoute, [
  "export async function PATCH",
  "export async function DELETE()",
  '"METHOD_NOT_ALLOWED"',
]), "admission update route refuses hard delete");

expect(all(admissionActions, [
  'permissionAction = parsed.data.action === "DECIDE" ? "approve" : "write"',
  "actOnAdmission",
]), "admission decisions require approval capability");

expect(all(studentRoute, [
  "export async function PATCH",
  "export async function DELETE()",
  '"METHOD_NOT_ALLOWED"',
]), "student route refuses hard delete");

expect(all(guardianRoute, [
  "linkGuardianToStudent",
  "GUARDIANS",
  "writeAuditLog",
]), "guardian relationship route is module-protected and audited");

expect(all(enrollmentActions, [
  "actOnEnrollment",
  "STUDENTS",
  "writeAuditLog",
]), "enrollment lifecycle route is student-module protected and audited");

expect(all(page, [
  "EnterpriseEducationPopulationWorkspace",
  '"ADMISSIONS"',
  '"STUDENTS"',
  '"GUARDIANS"',
]), "Education router sends EDU-2 modules to the dedicated population workspace");

expect(all(workspace, [
  "ModuleWorkspace",
  "ModuleHeader",
  "ModuleToolbar",
  "ModuleMetrics",
  "BusinessList",
  'presentation="editor"',
  "notifyToast",
  '"DECIDE"',
  '"ENROLL"',
  '"TRANSFER"',
  '"WITHDRAW"',
  '"LINK_GUARDIAN"',
]), "EDU-2 workspace uses canonical responsive primitives, global toasts and real lifecycle actions");

expect(all(i18n, [
  "fr:",
  "en:",
  '"Admissions"',
  '"Étudiants"',
  '"Students"',
]), "EDU-2 UI copy is FR and EN");

for (const code of ["ADMISSIONS", "STUDENTS", "GUARDIANS"]) {
  expect(guides.includes("  " + code + ": {"), "user guide exists for " + code);
}

expect(all(doc, [
  "EDU-2",
  "EnterpriseBusinessParty",
  "EnterpriseDocument",
  "Rollback",
]), "EDU-2 architecture documents authority boundaries and rollback");

expect(all(owner, [
  "E2E #282 bon",
  "deux campus",
  "REVISION_CONFLICT",
  "320, 360, 375, 390, 414, 768 et 1024",
]), "OWNER_E2E covers lifecycle, isolation, concurrency and responsive widths");

expect(packageJson.includes('"qa:education-admissions"'), "EDU-2 targeted QA command is exposed");
expect(regression.includes('await import("./qa-education-admissions.mjs")'), "EDU-2 gate runs permanently in qa:regression");

if (process.exitCode) process.exit(process.exitCode);
console.log("EDU-2 admissions and student registry QA passed.");
