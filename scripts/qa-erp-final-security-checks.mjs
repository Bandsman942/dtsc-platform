import { forbidTokens, requirePaths, requireTokens, success } from "./qa-enterprise-common-domain-lib.mjs";

const mutatingRoutes = [
  "app/api/enterprise/[organizationId]/core/route.ts",
  "app/api/enterprise/[organizationId]/core/[id]/route.ts",
  "app/api/enterprise/[organizationId]/healthcare/route.ts",
  "app/api/enterprise/[organizationId]/pharmacy/route.ts",
  "app/api/enterprise/[organizationId]/administration/route.ts",
];
requirePaths(["docs/ERP_FINAL_SECURITY_REVIEW.md", ...mutatingRoutes]);
for (const route of mutatingRoutes) requireTokens(route, ["isSameOriginRequest", "await rateLimit", "writeApiLog"]);
for (const route of mutatingRoutes.slice(0, 4)) requireTokens(route, ["writeAuditLog", "organizationId"]);
requireTokens("app/api/enterprise/[organizationId]/healthcare/route.ts", ["resolveEnterpriseModuleAccess", "enterpriseHealthcareRecordSchema"]);
requireTokens("app/api/enterprise/[organizationId]/pharmacy/route.ts", ["resolveEnterpriseModuleAccess", "enterprisePharmacyRecordSchema"]);
forbidTokens("lib/enterprise/sector-convergence/health-billing-service.ts", ["diagnosis", "symptoms", "prescription", "labResult", "medicalNote"]);
requireTokens("docs/ERP_FINAL_SECURITY_REVIEW.md", ["IDOR", "inter-tenant", "données cliniques", "same-origin", "rate limit"]);
success("ERP final security contract");
