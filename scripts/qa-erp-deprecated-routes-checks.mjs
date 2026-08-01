import { requirePaths, requireTokens, success } from "./qa-enterprise-common-domain-lib.mjs";

const routes = [
  "app/api/enterprise/[organizationId]/core/route.ts",
  "app/api/enterprise/[organizationId]/core/[id]/route.ts",
  "app/api/enterprise/[organizationId]/healthcare/route.ts",
  "app/api/enterprise/[organizationId]/pharmacy/route.ts",
];
requirePaths(["docs/ERP_ROUTE_DECOMMISSION_REGISTER.md", ...routes]);
for (const route of routes) requireTokens(route, ["status: 410", "deprecatedRouteHit", "writeApiLog", "writeAuditLog"]);
requireTokens("docs/ERP_ROUTE_DECOMMISSION_REGISTER.md", ["410 Gone", "Redirection", "Lecture historique", "Workflow Engine v2"]);
success("ERP deprecated route contract");
