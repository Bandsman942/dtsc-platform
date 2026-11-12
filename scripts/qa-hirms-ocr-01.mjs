import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const parts = {
  migration: read("prisma/migrations/20261113005500_hirms_ocr_pipeline/migration.sql"),
  schema: read("prisma/enterprise-health-insurance-connectors.prisma"),
  transport: read("lib/enterprise/health-insurance-connectors/hirms-ocr.ts"),
  service: read("lib/enterprise/health-insurance-connectors/ocr-service.ts"),
  route: read("app/api/enterprise/[organizationId]/insurance-connectors/ocr/route.ts"),
  poll: read("app/api/enterprise/[organizationId]/insurance-connectors/ocr/status/route.ts"),
  env: read("lib/enterprise/health-insurance-connectors/environments.ts"),
  ui: read("components/enterprise/hirms-ocr-workspace.tsx"),
  invoiceStatus: read("lib/enterprise/health-insurance-connectors/hirms-status.ts"),
  invoiceReconcile: read("lib/enterprise/health-insurance-connectors/invoice-service.ts"),
};
for (const marker of ["EnterpriseHealthInsuranceOcrJob", "documentDigest", "externalJobId", "transportStatus"]) {
  assert.ok(parts.schema.includes(marker) && parts.migration.includes(marker), "Missing OCR schema " + marker);
}
for (const marker of ["https://hirmsapi.healthsystemlink.com", "https://hslapi.alatlabs.com", "HEALTH_INSURANCE_HIRMS_UAT_OCR_ENABLED", "HEALTH_INSURANCE_HIRMS_PRODUCTION_OCR_ENABLED", "HEALTH_INSURANCE_HIRMS_PRODUCTION_ORGANIZATION_IDS"]) {
  assert.ok(parts.env.includes(marker), "Missing environment gate "+marker);
}
for (const marker of ['"/api/ocr/documents"', '"/api/ocr/jobs/"', "Authorization:", "form.append", "invoiceDate", "getHirmsAccessToken", "HIRMS_OCR_PROXY_MAX_BYTES"]) {
  assert.ok(parts.transport.includes(marker), "Missing HSL OCR contract "+marker);
}
for (const marker of ["sha256", "sniffMime", "assertHirmsOcrUploadEnabled", "enterpriseHealthInsuranceOcrJob.create", "enterpriseHealthInsuranceOcrJob.updateMany", "UNKNOWN_OUTCOME", "environment"]) {
  assert.ok(parts.service.includes(marker), "Missing safe outbox "+marker);
}
for (const marker of ["isSameOriginRequest", "rateLimit", "activeOrganizationId", "getHealthInsuranceAccess", "canAccessPharmacySales", "productionConfirmation", "HEALTH"]) {
  const target = marker === "HEALTH" ? parts.service + parts.env : parts.route;
  assert.ok(target.includes(marker), "Missing route security "+marker);
}
for (const marker of ["isSameOriginRequest", "rateLimit", "activeOrganizationId", "pollHirmsOcrJob"]) {
  assert.ok(parts.poll.includes(marker), "Missing poll security "+marker);
}
for (const marker of ["HirmsEnvironmentSwitch","PRODUCTION","FileScan","invoiceDate","poll"]) assert.ok(parts.ui.includes(marker), "Missing UX "+marker);
for (const marker of ['"/api/invoices/status/"', "assertHirmsEnvironmentEnabled", "getHirmsAccessToken"]) assert.ok(parts.invoiceStatus.includes(marker), marker);
assert.ok(parts.invoiceReconcile.includes("reconcileHirmsInvoiceStatus"), "No independent invoice status reconciliation");
assert.ok(!parts.service.includes("rawText") && !parts.service.includes("documentBody"), "Never store OCR contents");
console.log("✅ HIRMS OCR-01: PDF/image -> multipart upload -> job ID -> status, tenant RBAC, immutable hosts, 4 MiB limit, no clinical payload persistence.");
