import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (path) => readFileSync(path, "utf8");
let count = 0;
function check(path, ...tokens) {
  const text = read(path);
  for (const token of tokens) { assert.ok(text.includes(token), `${path}: missing ${token}`); count++; }
  if (path.endsWith(".tsx")) { assert.ok(text.startsWith('"use client"') || !text.includes('"use client"'), `${path}: broken client directive`); count++; }
}
const root = "components/enterprise/";
const ops = ["tasks", "requests", "approvals", "meetings"];
for (const name of ops) {
  check(`${root}core-v2/enterprise-${name}-workspace.tsx`, "ErpDesign2Metric", "ErpDesign2RegisterSection", "CoordinationDesign2Tools", "dateFrom", "dateTo", "onDateChange", "onStatusChange");
  check(`app/api/enterprise/[organizationId]/${name}/route.ts`, "financeBusinessDateRange", "organizationId", "civilRange");
}
check(`${root}core-v2/enterprise-workflows-workspace.tsx`, "ErpDesign2Metric", "ErpDesign2RegisterTools", "runFrom", "runTo", "onDateChange");
check("app/api/enterprise/[organizationId]/workflow-runs/route.ts", "financeBusinessDateRange", "visibleRuns", "items: visibleRuns", "sourceEntityType: { in: permittedEntityTypes }");
check(`${root}professional/coordination-design2-tools.tsx`, "ErpDesign2RegisterTools", "taskType", "targetEntityType", "locationMode");
check(`${root}professional/hr-design2-tools.tsx`, "ErpDesign2RegisterTools", "contracts", "attendance", "timesheets", "payroll-runs", "payroll-periods");
for (const [component, route] of [
  ["enterprise-human-resources-workspace.tsx", "employment-contracts"],
  ["enterprise-time-attendance-workspace.tsx", "leave-requests"],
  ["enterprise-payroll-operations-workspace.tsx", "payroll-runs"],
]) {
  check(`${root}professional/${component}`, "ErpDesign2Metric", "HrDesign2Tools", "dateFrom", "dateTo");
  check(`app/api/enterprise/[organizationId]/${route}/route.ts`, "financeBusinessDateRange", "organizationId");
}
for (const name of ["work-schedules", "attendance", "timesheets", "payroll-periods"]) {
  check(`app/api/enterprise/[organizationId]/${name}/route.ts`, "financeBusinessDateRange", "businessDateFilter", "organizationId");
}
check(`${root}enterprise-activities-module.tsx`, "ErpDesign2Metric", "EnterpriseRequestsPanel", "organizationName={organization.name}");
check(`${root}enterprise-activities-panels.tsx`, "ErpDesign2RegisterTools", "useEnterpriseV2Collection", "activity-requests", "onStatusChange", "onDateChange");
check("app/api/enterprise/[organizationId]/activity-requests/route.ts", "requireEnterpriseMembership", "canUseFeature", "financeBusinessDateRange", "projectEnterpriseActivityRequestWorkflows", "organizationId", "createdById", "assignedToUserId");
check(`${root}enterprise-module-workspace.tsx`, 'density={["TASKS_OPERATIONS"', "organizationName={organizationName}");
check(`${root}professional/finance-design2-controls.tsx`, "total > 1000", "downloadProfessionalXlsx", "downloadProfessionalPdf");
const e2e = read("docs/OWNER_E2E_1203_OPERATIONS_HR_ACTIVITIES_DESIGN2.md");
assert.match(e2e, /NON EXÉCUTÉ|NOT_EXECUTED/); assert.match(e2e, /320|360/); count += 2;
console.log("PASS", count, "checks — operations, HR and enterprise activities Design 2.0 #1203");
