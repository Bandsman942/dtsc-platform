import { forbidTokens, requireTokens, success } from "./qa-enterprise-common-domain-lib.mjs";

for (const route of [
  "app/api/enterprise/[organizationId]/core/route.ts",
  "app/api/enterprise/[organizationId]/core/[id]/route.ts",
  "app/api/enterprise/[organizationId]/healthcare/route.ts",
  "app/api/enterprise/[organizationId]/pharmacy/route.ts",
]) {
  requireTokens(route, ["LEGACY_READ_ONLY", "status: 410", "WRITE_ATTEMPT_BLOCKED"]);
}
forbidTokens("app/api/enterprise/[organizationId]/core/route.ts", ["enterpriseCoreRecord.create("]);
forbidTokens("app/api/enterprise/[organizationId]/core/[id]/route.ts", ["enterpriseCoreRecord.update(", "enterpriseCoreRecord.delete("]);
forbidTokens("app/api/enterprise/[organizationId]/healthcare/route.ts", ["enterpriseSectorRecord.create(", "enterpriseSectorRecord.update(", "enterpriseSectorRecord.delete("]);
forbidTokens("app/api/enterprise/[organizationId]/pharmacy/route.ts", ["enterpriseSectorRecord.create(", "enterpriseSectorRecord.update(", "enterpriseSectorRecord.delete("]);
requireTokens("app/api/enterprise/[organizationId]/administration/route.ts", ["LEGACY_WORKFLOW_WRITE_ATTEMPT_BLOCKED", "LEGACY_WORKFLOW_WRITE_DENIED", "status: 410"]);
success("ERP legacy read-only contract");
