import { forbidTokens, requirePaths, requireTokens, success } from "./qa-enterprise-common-domain-lib.mjs";

requirePaths([
  "lib/enterprise/sector-convergence/pharmacy-finance-service.ts",
  "lib/enterprise/sector-convergence/health-billing-service.ts",
  "lib/enterprise/sector-convergence/health-payment-service.ts",
  "docs/ERP_FINAL_DATA_OWNERSHIP.md",
]);
requireTokens("lib/enterprise/sector-convergence/pharmacy-finance-service.ts", ["enterpriseSalesInvoice.create", "createEnterprisePayment", "pharmacySalesExtension", "pharmacyPaymentExtension"]);
requireTokens("lib/enterprise/sector-convergence/health-billing-service.ts", ["enterpriseSalesInvoice", "healthBillingExtension", "healthInvoicePayerComponent"]);
requireTokens("lib/enterprise/sector-convergence/health-payment-service.ts", ["enterprisePaymentAllocation", "healthPayerAllocation", "TransactionIsolationLevel.Serializable"]);
forbidTokens("app/api/enterprise/[organizationId]/healthcare/route.ts", ["enterpriseSectorRecord.create("]);
forbidTokens("app/api/enterprise/[organizationId]/pharmacy/route.ts", ["enterpriseSectorRecord.create("]);
forbidTokens("app/api/enterprise/[organizationId]/core/route.ts", ["enterpriseCoreRecord.create("]);
requireTokens("docs/ERP_FINAL_DATA_OWNERSHIP.md", ["une seule source de vérité", "Journal Entry", "Enterprise Payment", "HealthPatient", "Pharmacy"]);
success("ERP single source of truth contract");
