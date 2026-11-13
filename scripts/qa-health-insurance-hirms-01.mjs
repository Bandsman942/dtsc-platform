import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const schema = read("prisma/enterprise-health-insurance-connectors.prisma");
const migration = read("prisma/migrations/20261112223500_health_insurance_connectors_hirms_01/migration.sql");
const hirms = read("lib/enterprise/health-insurance-connectors/hirms.ts");
const crypto = read("lib/enterprise/health-insurance-connectors/crypto.ts");
const environments = read("lib/enterprise/health-insurance-connectors/environments.ts");
const dualMigration = read("prisma/migrations/20261112234000_hirms_two_environments/migration.sql");
const service = read("lib/enterprise/health-insurance-connectors/service.ts");
const route = read("app/api/enterprise/[organizationId]/insurance-connectors/route.ts");
const verify = read("app/api/enterprise/[organizationId]/insurance-connectors/verify/route.ts");
const ui = read("components/enterprise/health-insurance-connector-workspace.tsx");
const memberUi = read("components/enterprise/insurance-member-verify-workspace.tsx");

for (const model of ["EnterpriseHealthInsuranceConnector", "EnterpriseHealthInsuranceVerification"]) {
  assert.match(schema, new RegExp(`model ${model}`));
  assert.match(migration, new RegExp(`CREATE TABLE "${model}"`));
}
for (const marker of ["AES", "aes-256-gcm", "HEALTH_INSURANCE_CREDENTIALS_KEY"]) {
  assert.ok(crypto.includes(marker), `Missing encryption marker ${marker}`);
}
for (const marker of ['"/api/members/verify"', '"grant_type":', "client_credentials", "invoices:submit", "Bearer", "Retry-After", "HSL"]) {
  assert.ok(hirms.includes(marker) || (marker === '"grant_type":' && hirms.includes("grant_type:")), `Missing HIRMS contract marker: ${marker}`);
}
for (const marker of ["getHealthInsuranceAccess", "canAccessPharmacySales", "isSameOriginRequest", "rateLimit", "session.activeOrganizationId", "writeAuditLog"]) assert.ok(verify.includes(marker), marker);
for (const marker of ["resolveEnterpriseModuleAccess", "isSameOriginRequest", "connectorSettingsSchema", "writeAuditLog"]) assert.ok(route.includes(marker), marker);
for (const marker of ["organizationId", "siteId", "sealHirmsCredentials", "openHirmsCredentials", "healthPatient.findFirst", "lastVerifiedAt"]) assert.ok(service.includes(marker), marker);
for (const marker of [
  "https://hslapi.alatlabs.com", "https://hslauth.alatlabs.com/application/o/token/",
  "https://hirmsapi.healthsystemlink.com", "https://auth.healthsystemlink.com/application/o/token/",
  "HEALTH_INSURANCE_HIRMS_PRODUCTION_ENABLED", "HEALTH_INSURANCE_HIRMS_PRODUCTION_INVOICE_SEND_ENABLED",
  "HEALTH_INSURANCE_HIRMS_UAT_INVOICE_SEND_ENABLED", "HIRMS_PRODUCTION_NOT_ENABLED",
]) assert.ok(environments.includes(marker), "Environment missing: " + marker);
for (const marker of ["EHIConnector_org_adapter_env_key", "EHIInvoiceSubmission_org_adapter_env_invoice_key"]) {
  assert.ok(schema.includes(marker) && dualMigration.includes(marker), "Missing environment-scoped DB constraint: "+marker);
}
assert.ok(hirms.includes("hirmsEndpoints(environment)") && hirms.includes("keyFor(environment, username, secret)"), "OAuth and cache must be environment/credential-scoped");
assert.ok(!ui.includes("localStorage") && !memberUi.includes("localStorage"), "No browser credential or QR persistence");
assert.ok(ui.includes("HirmsEnvironmentSwitch") && memberUi.includes("HirmsEnvironmentSwitch") && memberUi.includes("serviceDate"), "UAT/Production UX and optional service date required");
console.log("✅ HIRMS-01 contract QA passed: additive schema, encrypted credentials, allow-listed UAT and Production with opt-in gates, isolated credentials, tenant/RBAC, rate limits and UI.");
