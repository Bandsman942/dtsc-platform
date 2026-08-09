import { forbidTokens, requirePaths, requireTokens, success } from "./qa-enterprise-common-domain-lib.mjs";

const overview = "components/enterprise/professional/enterprise-finance-overview-workspace.tsx";
requirePaths([overview]);
requireTokens(overview, [
  "type SourceState = \"success\" | \"error\"",
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
success("ERP stabilization degraded-state observability");
