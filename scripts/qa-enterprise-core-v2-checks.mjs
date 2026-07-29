import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const failures = [];
const ok = (condition, message) => { if (!condition) failures.push(message); };
const includes = (file, snippets) => {
  const content = read(file);
  for (const snippet of snippets) ok(content.includes(snippet), `${file}: missing ${snippet}`);
  return content;
};

const schema = read("prisma/enterprise-core-v2.prisma");
for (const model of ["EnterpriseTask", "EnterpriseRequest", "EnterpriseApproval", "EnterpriseMeeting", "EnterpriseMeetingParticipant", "EnterpriseMeetingDecision", "EnterpriseOperationalEvent", "EnterpriseOperationalComment"]) {
  ok(schema.includes(`model ${model} {`), `Dedicated Prisma model missing: ${model}`);
}
ok(read("prisma/schema.prisma").includes("model EnterpriseCoreRecord {"), "EnterpriseCoreRecord legacy model must remain available.");
ok(schema.includes("organizationId"), "Dedicated models must carry organizationId.");
ok(schema.includes("revision         Int"), "Optimistic concurrency revision fields must exist.");
ok(schema.includes("@@unique([meetingId, userId])"), "Meeting participants must be unique per meeting/user.");

const migration = read("prisma/migrations/20260729150000_add_enterprise_core_v2/migration.sql");
for (const table of ["EnterpriseTask", "EnterpriseRequest", "EnterpriseApproval", "EnterpriseMeeting"]) ok(migration.includes(`CREATE TABLE \"${table}\"`), `Migration missing ${table}.`);
ok(!/DROP\s+(TABLE|COLUMN)/i.test(migration), "Sprint 6 migration must remain additive and non-destructive.");
const approvalGuardMigration = read("prisma/migrations/20260729164000_guard_enterprise_approval_pending_target/migration.sql");
ok(approvalGuardMigration.includes("EnterpriseApproval_one_pending_per_target_key"), "Pending approval unique guard migration is missing.");
ok(approvalGuardMigration.includes('WHERE "status" = \'PENDING\''), "Pending approval guard must be a partial PENDING index.");
ok(!/DROP\s+(TABLE|COLUMN)/i.test(approvalGuardMigration), "Approval race guard migration must remain additive.");

const service = includes("lib/enterprise/core-v2/service.ts", [
  "status: \"PENDING\", revision",
  "SELF_APPROVAL_DENIED",
  "WRONG_APPROVER",
  "APPROVAL_DECISION_CONFLICT",
  "CROSS_TENANT_SOURCE_DENIED",
  "createEnterpriseMeetingDecision",
  "createTaskFromMeetingDecision",
  "enterpriseEntityLink.create",
]);
ok((service.match(/updateMany\(/g) || []).length >= 6, "Sensitive transitions must use guarded updateMany calls.");

const errors = read("lib/enterprise/core-v2/errors.ts");
ok(errors.includes('error.code === "P2002"') && errors.includes("status: 409"), "Concurrent unique conflicts must normalize to HTTP 409.");

const approvalRoute = read("app/api/enterprise/[organizationId]/approvals/route.ts");
ok(approvalRoute.includes("pendingForTarget"), "Approval API must reject a second pending approval before insert when detectable.");

const core = includes("lib/enterprise/enterprise-core.ts", ["LEGACY_CORE_WRITE_DENIED", "isDedicatedCoreDomain"]);
ok(core.includes("EnterpriseCoreRecord"), "Legacy core implementation was unexpectedly removed.");

const activities = read("app/api/enterprise/[organizationId]/activities/route.ts");
ok(activities.includes("createEnterpriseRequestInTransaction"), "Enterprise Activities must create a dedicated EnterpriseRequest.");
ok(!activities.includes("createEnterpriseCoreRecord"), "Enterprise Activities must not create new generic request records.");

const pharmacy = read("app/api/enterprise/[organizationId]/pharmacy/activities/route.ts");
ok(pharmacy.includes("createEnterpriseOperationalObject"), "PHARMACY activities must use the Sprint 6 compatibility dispatcher.");
ok(!pharmacy.includes("createEnterpriseCoreRecord"), "PHARMACY must not directly create generic Sprint 6 objects.");

for (const route of [
  "app/api/enterprise/[organizationId]/tasks/route.ts",
  "app/api/enterprise/[organizationId]/tasks/[id]/actions/route.ts",
  "app/api/enterprise/[organizationId]/requests/route.ts",
  "app/api/enterprise/[organizationId]/requests/[id]/actions/route.ts",
  "app/api/enterprise/[organizationId]/approvals/route.ts",
  "app/api/enterprise/[organizationId]/approvals/[id]/actions/route.ts",
  "app/api/enterprise/[organizationId]/meetings/route.ts",
  "app/api/enterprise/[organizationId]/meetings/[id]/actions/route.ts",
]) {
  const content = read(route);
  ok(content.includes("isSameOriginRequest"), `${route}: same-origin protection missing.`);
  ok(content.includes("await rateLimit"), `${route}: awaited rate limit missing.`);
  ok(content.includes("getEnterpriseCoreV2Access"), `${route}: centralized tenant/module access missing.`);
}

const moduleWorkspace = read("components/enterprise/enterprise-module-workspace.tsx");
for (const component of ["EnterpriseTasksWorkspace", "EnterpriseRequestsWorkspace", "EnterpriseApprovalsWorkspace", "EnterpriseMeetingsWorkspace"]) ok(moduleWorkspace.includes(component), `Dedicated UI workspace missing from routing: ${component}`);

const adminLoader = read("lib/enterprise/enterprise-admin-loader.ts");
for (const source of ["prisma.enterpriseTask", "prisma.enterpriseRequest", "prisma.enterpriseApproval", "prisma.enterpriseMeeting"]) ok(adminLoader.includes(source), `Administration KPI loader missing ${source}.`);

const vercel = read("vercel.json");
ok(vercel.includes('"main": true') && vercel.includes('"*": false'), "Vercel git deployment policy must remain main-only.");
ok(vercel.includes('VERCEL_ENV:-') && vercel.includes('production'), "Vercel ignoreCommand must preserve production-only behavior.");

if (failures.length) {
  console.error("ERP Core v2 QA failed:\n- " + failures.join("\n- "));
  process.exit(1);
}
console.log("ERP Core v2 QA passed: dedicated domains, tenant guards, transitions, approval race safety, legacy safety and production-only Vercel policy verified.");
