import { forbidTokens, requirePaths, requireTokens, success } from "./qa-enterprise-common-domain-lib.mjs";

const overview = "components/enterprise/professional/enterprise-finance-overview-workspace.tsx";
const financeFr = "locales/enterprise-finance.fr.json";
const financeEn = "locales/enterprise-finance.en.json";
const projections = "app/api/enterprise/[organizationId]/erp-projections/route.ts";

requirePaths([overview, financeFr, financeEn, projections]);
requireTokens(overview, [
  "type SourceState = \"success\" | \"empty\" | \"error\"",
  "state: \"error\", total: null",
  'financeT(locale, "unavailable")',
  'financeT(locale, "metricsUnavailable")',
  "projectionError",
  'financeT(locale, "projectionHealthUnavailable")',
]);
requireTokens(financeFr, [
  '"unavailable": "Indisponible"',
  '"metricsUnavailable": "indicateur(s) sont indisponibles. Les valeurs ne sont pas remplacées par zéro."',
  '"projectionHealthUnavailable": "La santé des projections inter-modules est indisponible."',
]);
requireTokens(financeEn, [
  '"unavailable": "Unavailable"',
  '"metricsUnavailable": "metric(s) are unavailable. Values are not replaced with zero."',
  '"projectionHealthUnavailable": "Cross-module projection health is unavailable."',
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