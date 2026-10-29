import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const route = read("app/api/enterprise/[organizationId]/healthcare/insurance/route.ts");
const workspace = read("components/enterprise/health-insurance-workspace.tsx");
const context = read("lib/enterprise/business-context.ts");

assert.match(route, /getHealthInsuranceAccess\(\{session,organizationId,action:"read"\}\)/, "Permissions must remain server enforced");
assert.match(route, /getEnterpriseBusinessContext\(prisma,organizationId\)/, "Read canonical tenant business context");
assert.match(route, /formatEnterpriseBusinessDate\(new Date\(\),context\.timezone\)/, "Use org-local date");
assert.match(route, /enterpriseDomainErrorResponse\(error,"HEALTH_INSURANCE_BUSINESS_DATE_UNAVAILABLE"\)/, "Invalid timezone may not silently fall back");
assert.match(route, /return NextResponse\.json\(\{businessDate,providers:/, "Send date only with authorized response");
assert.match(context, /assertEnterpriseTimezone\(organization\.timezone\)/, "Canonical timezone must be validated");
assert.doesNotMatch(workspace, /localCalendarDate\(|getFullYear\(\)|getMonth\(\)|getDate\(\)/, "Request form must never use browser timezone for default date");
assert.match(workspace, /request = \(businessDate = ""\) =>/, "Request default must accept business date explicitly");
assert.match(workspace, /requestDate: businessDate/, "Business date becomes request date");
assert.match(workspace, /request\(typeof d\?\.businessDate === "string" \? d\.businessDate : ""\)/, "Use server date when opening request");
assert.match(workspace, /setForm\(/, "Form reset required on opening new request");
console.log("OK: Health coverage request date comes from authorized tenant timezone, never device clock.");
