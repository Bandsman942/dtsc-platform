import fs from "node:fs";
import path from "node:path";
const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const missing = [];
function requireTokens(file, tokens) {
  if (!fs.existsSync(path.join(root, file))) { missing.push(`Missing ${file}`); return; }
  const body = read(file);
  for (const token of tokens) if (!body.includes(token)) missing.push(`${file}: missing ${token}`);
}
requireTokens("lib/enterprise/accounting/tax-engine.ts", [
  "calculateDocumentTaxApplications", "validatedInvoiceTaxRate", "TAX_SPECIAL_TREATMENT_PROOF_REQUIRED",
  "TAX_COMPOUND_RULE_REQUIRED", "snapshotCalculatedTaxes", "recordPostedTaxApplicationsTx",
  "INPUT_NONRECOVERABLE", "OUTPUT_REVERSAL", "INPUT_REVERSAL",
]);
requireTokens("lib/enterprise/accounting/historical-credit-tax.ts", [
  "allocateHistoricalCreditLines", "CREDIT_QUANTITY_EXCEEDS_ORIGINAL", "CREDIT_TAX_EXCEEDS_ORIGINAL",
  "CREDIT_PRIOR_LINE_ALLOCATION_REQUIRED", "original.taxAmount",
]);
requireTokens("lib/enterprise/accounting/payables-service.ts", [
  "taxRecoveryRequested", "SUPPLIER_INPUT_TAX_PROOF_OR_ACCOUNT_REQUIRED", "postBusinessEventTx",
  "SUPPLIER_INPUT_TAX_REVIEW_REQUIRED",
]);
requireTokens("lib/enterprise/accounting/accounting-invoice-approval-orchestration.ts", [
  "SUPPLIER_INPUT_TAX_PROOF_REVIEW_REQUIRED", "taxRecoveryVerifiedAt",
]);
requireTokens("lib/enterprise/accounting/domain-posting-builders.ts", [
  "item.taxRecoveryRequested", "item.taxAmount.gt(0)", "SUPPLIER_CREDIT_ORIGIN_REQUIRED",
]);
requireTokens("lib/enterprise/accounting/receivables-service.ts", [
  "allocateHistoricalCreditLines", "recordPostedTaxApplicationsTx", "postBusinessEventTx",
]);
requireTokens("lib/enterprise/accounting/accounting-document-approval-orchestration.ts", [
  'sourceEntityType: "EnterpriseSalesCreditNoteItem"',
  'sourceEntityType: "EnterpriseSupplierCreditNoteItem"',
]);
for(const reporter of ["lib/enterprise/accounting/statements-service.ts","lib/ai/tools/executors/finance.ts"]) {
  requireTokens(reporter, ["OUTPUT_REVERSAL", "INPUT_REVERSAL", "ELSE 0 END", "WHEN t.direction IN ('OUTPUT','INPUT') THEN t."]);
}
requireTokens("lib/enterprise/sector-convergence/health-billing-service.ts", ["HEALTH_TAX_LINE_PROVENANCE_REQUIRED", "assertSectorLineTaxProvenance", "taxBreakdownJson"]);
requireTokens("lib/enterprise/sector-convergence/pharmacy-finance-service.ts", ["PHARMACY_TAX_LINE_PROVENANCE_REQUIRED", "assertSectorLineTaxProvenance", "taxBreakdownJson"]);
requireTokens("lib/enterprise/accounting/dgi-fiscalization-readiness.ts", [
  'certificationState: "NOT_HOMOLOGATED"', "canTransmit: false", "canClaimNormalizedInvoice: false",
  "SELLER_RCCM", "SELLER_NIF", "BUYER_TAX_NUMBER",
]);
requireTokens("app/api/enterprise/[organizationId]/taxes/rules/route.ts", [
  '"FINANCE_TAX"', "isActive: false", "proposedByUserId", "writeAuditLog", "LOCAL_LEVY",
]);
requireTokens("app/api/enterprise/[organizationId]/taxes/rules/[ruleId]/route.ts", [
  "TAX_RULE_SELF_APPROVAL_FORBIDDEN", "TransactionIsolationLevel.Serializable",
]);
requireTokens("app/api/enterprise/[organizationId]/sales-invoices/[invoiceId]/fiscalization-readiness/route.ts", [
  '"FINANCE_RECEIVABLES"', "retailFinanceReadSiteScope", "evaluateDgiReadiness",
]);
requireTokens("components/enterprise/professional/enterprise-finance-invoices-workspace.tsx", [
  "additionalTaxCodeIds", "taxEvidenceReference", "taxRecoveryRequested", "verifyInputTaxEvidence",
]);
requireTokens("prisma/migrations/20261112213000_sector_tax_evidence_and_breakdown/migration.sql", [
  "taxBreakdownJson", "sourceInvoiceItemId", "taxRecoveryVerifiedAt", "taxRecoveryRequested",
]);
requireTokens("docs/ISSUE_1124_FISCALITY_SECTOR_DGI.md", ["NOT_HOMOLOGATED", "e-DEF", "25 février 2026"]);
requireTokens("lib/enterprise/sector-convergence/sector-line-fiscal.ts", ["calculateSectorSourceTax", "assertSectorLineTaxProvenance", "SECTOR_TAX_HEADER_NOT_SUPPORTED_WITHOUT_LINE_EVIDENCE"]);
requireTokens("prisma/migrations/20261112222000_health_pharmacy_line_fiscal_provenance/migration.sql", ["HealthMedicalInvoiceItem", "PharmacySaleLine", "taxBreakdownJson"]);
requireTokens("components/enterprise/health-medical-billing-workspace.tsx", ["taxCodeId", "taxEvidenceReference", "taxCodes"]);
requireTokens("components/enterprise/pharmacy-sales-workspace.tsx", ["additionalTaxCodeIds", "taxCalculationMode", "taxEvidenceReference"]);
if (missing.length) { console.error("QA fiscal sector #1124 FAILED:\n"+missing.join("\n"));process.exit(1); }
console.log("QA fiscal sector #1124 static contracts passed; behavioral claims require CI Playwright and owner E2E.");
