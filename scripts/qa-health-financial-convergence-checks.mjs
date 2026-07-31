import { forbidTokens, requirePaths, requireTokens, success } from "./qa-enterprise-common-domain-lib.mjs";

requirePaths([
  "lib/enterprise/sector-convergence/health-billing-service.ts",
  "lib/enterprise/sector-convergence/health-payment-service.ts",
  "lib/enterprise/accounting/sector-adapters/health.ts",
  "scripts/backfill-health-invoices.mjs",
  "scripts/backfill-health-payments.mjs",
]);
requireTokens("prisma/enterprise-sector-convergence.prisma", [
  "model HealthBillingExtension",
  "model HealthInvoicePayerComponent",
  "model HealthInsuranceReceivableExtension",
  "model HealthPaymentExtension",
  "model HealthPayerAllocation",
]);
requireTokens("lib/enterprise/sector-convergence/health-billing-service.ts", [
  "HEALTH_PAYER_COMPONENT_TOTAL_MISMATCH",
  "HEALTH_INSURER_ROLE_REQUIRED",
  "HealthInvoicePayerComponent",
  "EnterpriseSalesInvoice",
  "MEDICAL_CONFIDENTIAL",
]);
requireTokens("lib/enterprise/sector-convergence/health-payment-service.ts", [
  "HEALTH_PAYMENT_ALLOCATION_EXCEEDS_BALANCE",
  "HealthPayerAllocation",
  "EnterprisePaymentAllocation",
  "TransactionIsolationLevel.Serializable",
  "PAYMENT_ALLOCATION_CONFIRMED",
]);
requireTokens("lib/enterprise/accounting/sector-adapters/health.ts", [
  "HEALTH_WRITE_OFF_APPROVED",
  "buildHealthWriteOffPosting",
]);
forbidTokens("lib/enterprise/sector-convergence/health-billing-service.ts", [
  "diagnosis",
  "symptoms",
  "prescription",
  "labResult",
  "medicalNote",
]);
success("Health financial convergence invariants");
