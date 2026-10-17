import fs from "node:fs";
import path from "node:path";
const read = (file) => fs.readFileSync(path.join(process.cwd(), file), "utf8");
const contract = read("lib/enterprise/enterprise-activity-form-contract.ts");
const route = read("app/api/enterprise/[organizationId]/activities/route.ts");
const loader = read("lib/enterprise/enterprise-activities-loader.ts");
const types = read("lib/enterprise/enterprise-activities-types.ts");
const moduleUi = read("components/enterprise/enterprise-activities-module.tsx");
const panel = read("components/enterprise/enterprise-activities-panels.tsx");
const fail = (message) => { throw new Error(message); };
for (const code of ["SUBMIT_SECTOR_REPORT","REPORT_SECTOR_INCIDENT","REQUEST_OPERATION_VALIDATION","REQUEST_RESOURCE","UPDATE_SECTOR_INDICATOR","CONFIRM_BOOKING","REPORT_CUSTOMER_INCIDENT","REQUEST_KITCHEN_STOCK","SUBMIT_CASH_REPORT","REQUEST_EXTRA_STAFF","REPORT_ROOM_SERVICE_PROBLEM"]) if (!contract.includes(code + ":")) fail("Missing activity contract: " + code);
for (const code of ["gamingStations","gamingBookings","gamingSessions","gamingCloses","businessParties"]) for (const [source,content] of [["loader",loader],["panel",panel],["route",route]]) if (!content.includes(code)) fail("Missing "+code+" in "+source);
for (const key of ["GAMING_INCOMPATIBLE_ACTIVITY_BLOCKS","getBusinessActivityFields","field.required","field.options","organizationId","field.source","ENTERPRISE_ACTIVITY_REFERENCE_INVALID","enterpriseActivityRequest.create","createEnterpriseRequestInTransaction"]) if (!route.includes(key)) fail("Missing server contract: "+key);
for (const key of ["businessSubtypeCode","businessSubtypeLabelFr","businessSubtypeLabelEn","gamingReferences"]) if (!types.includes(key) || !loader.includes(key)) fail("Missing subtype dataset: "+key);
for (const key of ["ModuleWorkspace","ModuleHeader","ModuleMetrics","ModuleToolbar","ModuleContent","ModuleSection","ProfessionalTabs"]) if (!moduleUi.includes(key)) fail("Missing professional UI: "+key);
for (const key of ["data-horizontal-rail","aria-pressed",'presentation="editor"',"const description = baseDescription;","busy","fieldOptions(field)","getBusinessActivityFields"]) if (!panel.includes(key)) fail("Missing responsive UI: "+key);
if (panel.includes("const description = details.length")) fail("Sector details copied into public description");
for (const key of ["GAMING_ACTIVITY_REFERENCE_MODULE_CODES", 'businessParties: "CRM_CUSTOMERS"', 'gamingCloses: "GAMING_DAILY_CLOSE"']) if (!contract.includes(key)) fail("Missing canonical per-reference permission mapping: " + key);
for (const key of ["stationAccess.canRead", "bookingAccess.canRead", "sessionAccess.canRead", "closeAccess.canRead", "customerAccess.canRead", "resolveEnterpriseModuleCapabilities"]) if (!loader.includes(key)) fail("Private references must be filtered by read permissions: " + key);
for (const key of ["GAMING_ACTIVITY_REFERENCE_MODULE_CODES[field.source]", "capabilities.canRead", "ENTERPRISE_ACTIVITY_REFERENCE_FORBIDDEN", 'roleCode: "CUSTOMER"']) if (!route.includes(key)) fail("Reference permissions must be checked again on submit: " + key);
if (!panel.includes('response.ok ? "success" : "error"') || !moduleUi.includes('tone = "error"')) fail("Success and failure toasts must use explicit outcome, independent of locale");
for (const block of ["CONFIRM_BOOKING", "REPORT_ROOM_SERVICE_PROBLEM", "SUBMIT_CASH_REPORT", "REPORT_SECTOR_INCIDENT"]) {
  if (!contract.includes('GAMING_ACTIVITY_BLOCK_COPY') || !loader.includes("GAMING_ACTIVITY_BLOCK_COPY[block.blockCode]")) fail("Gaming labels must override inherited hospitality copy");
}
if (!route.includes(String.raw`/^\d{4}-\d{2}-\d{2}$/`)) fail("Date validation must use a digit regex rather than a literal backslash");
console.log("Hotfix #873 enterprise activity form contract: PASS");
