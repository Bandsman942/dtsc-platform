import { forbidTokens, requirePaths, requireTokens, success } from "./qa-enterprise-common-domain-lib.mjs";

const overview = "components/enterprise/professional/enterprise-finance-overview-workspace.tsx";
const financeFr = "locales/enterprise-finance.fr.json";
const financeEn = "locales/enterprise-finance.en.json";
const projections = "app/api/enterprise/[organizationId]/erp-projections/route.ts";
const overviewSummaryRoute = "app/api/enterprise/[organizationId]/finance/overview-summary/route.ts";
const overviewSummaryService = "lib/enterprise/finance/overview-summary-service.ts";

requirePaths([overview, financeFr, financeEn, projections, overviewSummaryRoute, overviewSummaryService]);
requireTokens(overview, [
  'type MetricValue = { state: "success" | "empty" | "error"; value: number | null',
  'state: "error", value: null',
  'value.state === "error"',
  'financeT(locale, "unavailable")',
  'financeT(locale, "metricsUnavailable")',
  "degradedMetrics",
  "projectionError",
  'financeT(locale, "projectionHealthUnavailable")',
  "/finance/overview-summary",
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
  "/payments?page=1&pageSize=100&status=CONFIRMED",
]);
requireTokens(overviewSummaryRoute, [
  "authorizeFinanceRequest",
  '"FINANCE_OVERVIEW"',
  '"view"',
  "getEnterpriseFinanceOverviewSummary",
]);
requireTokens(overviewSummaryService, [
  "enterpriseReceivable.count",
  "enterprisePayable.count",
  "enterprisePayment.count",
  "enterpriseCashSession.count",
  "enterpriseReconciliationSession.count",
  "enterpriseSalesInvoice.count",
  "enterpriseSupplierInvoice.count",
  "enterpriseApproval.count",
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
