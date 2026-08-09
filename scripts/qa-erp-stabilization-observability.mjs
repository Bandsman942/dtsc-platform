import { forbidTokens, requirePaths, requireTokens, success } from "./qa-enterprise-common-domain-lib.mjs";

const overview = "components/enterprise/professional/enterprise-finance-overview-workspace.tsx";
const projections = "app/api/enterprise/[organizationId]/erp-projections/route.ts";

requirePaths([overview, projections]);
requireTokens(overview, [
  "type SourceState = \"success\" | \"empty\" | \"error\"",
  "state: \"error\", total: null",
  "Indisponible",
  "Unavailable",
  "Les valeurs ne sont pas remplacées par zéro",
  "Values are not replaced with zero",
  "projectionError",
  "Cross-module projection health is unavailable",
]);
forbidTokens(overview, [
  "if (!response.ok || !body) return { total: 0",
  "if (projectionsResponse.ok && projectionsBody) setProjectionHealth(projectionsBody)",
]);
requireTokens(projections, [
  "clientSafeProjectionMessage",
  "retryable: item.status === \"FAILED\"",
  "lastErrorMessage: clientSafeProjectionMessage",
]);
forbidTokens(projections, [
  "lastErrorMessage: item.lastErrorMessage",
  "...item,",
]);

success("ERP stabilization degraded-state observability");
