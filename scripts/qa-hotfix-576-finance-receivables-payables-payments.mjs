import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const ok = (condition, message) => {
  if (!condition) {
    console.error(`❌ ${message}`);
    process.exitCode = 1;
  } else {
    console.log(`✅ ${message}`);
  }
};

const modulePage = read("components/enterprise/enterprise-finance-module-page.tsx");
const operationalWorkspace = read("components/enterprise/professional/enterprise-operational-finance-workspace.tsx");
const invoiceWorkspace = read("components/enterprise/professional/enterprise-finance-invoices-workspace-hotfix.tsx");
const paymentWorkspace = read("components/enterprise/professional/enterprise-finance-payments-workspace-hotfix.tsx");
const sharedWorkspace = read("components/enterprise/professional/finance-professional-workspace-shared.tsx");
const referenceSelect = read("components/enterprise/core-v2/finance-reference-select.tsx");
const receivablesRoute = read("app/api/enterprise/[organizationId]/receivables/route.ts");
const payablesRoute = read("app/api/enterprise/[organizationId]/payables/route.ts");
const paymentsRoute = read("app/api/enterprise/[organizationId]/payments/route.ts");
const salesInvoicesRoute = read("app/api/enterprise/[organizationId]/sales-invoices/route.ts");
const supplierInvoicesRoute = read("app/api/enterprise/[organizationId]/supplier-invoices/route.ts");
const salesCreditsRoute = read("app/api/enterprise/[organizationId]/sales-credit-notes/route.ts");
const supplierCreditsRoute = read("app/api/enterprise/[organizationId]/supplier-credit-notes/route.ts");
const salesCreditPost = read("app/api/enterprise/[organizationId]/sales-credit-notes/[creditNoteId]/post/route.ts");
const supplierCreditPost = read("app/api/enterprise/[organizationId]/supplier-credit-notes/[creditNoteId]/post/route.ts");
const referenceRoute = read("app/api/enterprise/[organizationId]/finance/reference-options/route.ts");
const operationalLookups = read("app/api/enterprise/[organizationId]/operational-lookups/route.ts");
const summaryService = read("lib/enterprise/finance/operational-summary-service.ts");
const supplierParty = read("lib/enterprise/accounting/supplier-party-convergence.ts");
const sourceValidation = read("lib/enterprise/accounting/invoice-source-validation.ts");
const creditPreflight = read("lib/enterprise/accounting/credit-note-posting-preflight.ts");
const paymentAllocationRoute = read("app/api/enterprise/[organizationId]/payments/[paymentId]/allocations/route.ts");
const supplierTransitionRoute = read("app/api/enterprise/[organizationId]/supplier-invoices/[invoiceId]/transition/route.ts");
const financeToolContract = read("lib/ai/tools/finance-contract.ts");
const aiAuthorize = read("lib/ai/tools/authorize.ts");
const financeExecutor = read("lib/ai/tools/executors/finance.ts");
const regressionAdapter = read("scripts/qa-regression-checks.mjs");
const pkg = JSON.parse(read("package.json"));

ok(modulePage.includes("resolveEnterpriseModuleCapabilities") && !modulePage.includes("MANAGER_ROLES"), "Finance UI derives capabilities from the canonical module-access resolver, not a local manager-role shortcut.");
ok(operationalWorkspace.includes("EnterpriseFinanceInvoicesWorkspaceHotfix") && operationalWorkspace.includes("EnterpriseFinancePaymentsWorkspaceHotfix"), "The three operational Finance modules route through the hotfix workspaces.");

for (const [name, source] of [["receivables", receivablesRoute], ["payables", payablesRoute]]) {
  ok(source.includes('url.searchParams.get("overdue")') && source.includes('url.searchParams.get("ageBucket")'), `${name}: overdue and ageing filters are server-side.`);
  ok(source.includes('url.searchParams.get("recordId")') && source.includes("skip: (page - 1) * pageSize"), `${name}: deep-link record resolution coexists with server pagination.`);
  ok(source.includes("groupBy") && source.includes('by: ["currencyCode"]'), `${name}: money metrics remain separated by currency.`);
  ok(source.includes("startOfUtcDay") && source.includes("D90_PLUS"), `${name}: ageing uses a deterministic UTC day boundary and complete buckets.`);
}

ok(paymentsRoute.includes('url.searchParams.get("direction")') && paymentsRoute.includes('url.searchParams.get("unallocated")') && paymentsRoute.includes('url.searchParams.get("workflowPending")'), "Payments inbound/outbound/unallocated/approval views filter before pagination.");
ok(paymentsRoute.includes('by: ["currencyCode"]') && paymentsRoute.includes("inboundByCurrency") && paymentsRoute.includes("outboundByCurrency"), "Payment monetary metrics are not aggregated across currencies.");
ok(paymentsRoute.includes("PAYMENT_COUNTERPARTY_INVALID") && paymentsRoute.includes('expectedRole = parsed.data.paymentType === "CUSTOMER_PAYMENT" ? "CUSTOMER" : "SUPPLIER"'), "Customer and supplier payments validate canonical party roles and payment direction.");

ok(salesInvoicesRoute.includes("capabilities:") && salesInvoicesRoute.includes("assignedIds.has(item.id)"), "Sales invoices expose assignment-aware record capabilities.");
ok(supplierInvoicesRoute.includes("EnterpriseSupplierInvoiceReview") && supplierInvoicesRoute.includes("EnterpriseSupplierInvoiceApproval") && supplierInvoicesRoute.includes("canReview") && supplierInvoicesRoute.includes("canApprove"), "Supplier invoice queue preserves review then approval assignments.");
ok(salesCreditsRoute.includes("EnterpriseSalesCreditNoteApproval") && salesCreditsRoute.includes("canReject") && salesCreditsRoute.includes("canPost"), "Sales credit-note assigned workflow capabilities reach the UI.");
ok(supplierCreditsRoute.includes("EnterpriseSupplierCreditNoteApproval") && supplierCreditsRoute.includes("canReject") && supplierCreditsRoute.includes("canPost"), "Supplier credit-note assigned workflow capabilities reach the UI.");

ok(invoiceWorkspace.includes('kind="catalog-item"') && invoiceWorkspace.includes("catalogItemId"), "Invoice lines preserve the canonical catalog relationship.");
ok(invoiceWorkspace.includes('kind="expense"') && invoiceWorkspace.includes('name="expenseId"') && invoiceWorkspace.includes('kind="asset"') && invoiceWorkspace.includes('name="assetId"'), "Supplier invoices preserve approved-expense and asset relations.");
ok(invoiceWorkspace.includes('kind === "credit" ? "POST"') && invoiceWorkspace.includes("canReject") && invoiceWorkspace.includes("creditNoteId"), "Credit-note detail actions and deep links are complete.");
ok(invoiceWorkspace.includes('presentation="editor"') && invoiceWorkspace.includes("useToastMessage") && invoiceWorkspace.includes("disabled={busy}"), "Invoice UX follows the editor/busy/toast contract.");
ok(!invoiceWorkspace.includes("useFinanceLookups"), "Invoice hotfix no longer depends on capped bulk lookups.");

ok(paymentWorkspace.includes("FinanceBalanceTargetSelect") && !paymentWorkspace.includes("useFinanceLookups"), "Payment allocation uses searched canonical balances rather than the old capped cache.");
ok(paymentWorkspace.includes('kind="financial-account"') && paymentWorkspace.includes('kind="payroll-run"') && paymentWorkspace.includes('kind="supplier"'), "Payment account, payroll run and supplier references are searched server-side.");
ok(paymentWorkspace.includes('action: "CANCEL"') && paymentWorkspace.includes('financeT(locale, "actionCancel")'), "Payment cancellation is not mislabeled as rejection.");
ok(paymentWorkspace.includes('presentation="editor"') && paymentWorkspace.includes("useToastMessage") && paymentWorkspace.includes("disabled={busy}"), "Payment UX follows the editor/busy/toast contract.");

ok(referenceRoute.includes("const take = 30") && referenceRoute.includes("parentId") && referenceRoute.includes("authorizeFinanceRequest"), "Operational Finance references are searched in bounded tenant-scoped windows under module authorization.");
for (const kind of ["customer", "supplier", "sales-order", "fulfillment", "contract", "purchase", "purchase-receipt", "project", "expense", "asset", "catalog-item", "financial-account", "payroll-run", "employee", "expense-account"]) {
  ok(referenceRoute.includes(`\"${kind}\"`), `Reference lookup supports ${kind}.`);
}
ok(referenceSelect.includes("moduleCode") && referenceSelect.includes("parentId") && referenceSelect.includes("setTimeout") && referenceSelect.includes("220"), "FinanceReferenceSelect uses debounced server search with parent scoping.");

ok(sourceValidation.includes("assertSalesInvoiceSources") && sourceValidation.includes("SALES_INVOICE_FULFILLMENT_INVALID") && sourceValidation.includes("SALES_INVOICE_CONTRACT_CURRENCY_MISMATCH"), "Customer invoice cross-module references are revalidated server-side.");
ok(sourceValidation.includes("assertSupplierInvoiceSources") && sourceValidation.includes("SUPPLIER_INVOICE_ASSET_SUPPLIER_MISMATCH") && sourceValidation.includes("THREE_WAY_MATCH_CURRENCY_MISMATCH"), "Supplier invoice purchase/receipt/project/asset references are revalidated server-side.");
ok(salesInvoicesRoute.includes("assertSalesInvoiceSources") && supplierInvoicesRoute.includes("assertSupplierInvoiceSources"), "Invoice creation routes invoke cross-module source validation before persistence.");

ok(supplierParty.includes("enterpriseSupplierPartyLink") && supplierParty.includes("ensureSupplierInvoicePartyBeforePosting") && supplierParty.includes("ensurePayablePartyBeforeAllocation"), "Supplier and business-party identities converge through the canonical supplier-party link.");
ok(supplierTransitionRoute.includes("ensureSupplierInvoicePartyBeforePosting") && paymentAllocationRoute.includes("ensurePayablePartyBeforeAllocation"), "Supplier-party convergence is enforced before posting and legacy payable allocation.");

ok(creditPreflight.includes("SALES_CREDIT_NOTE_EXCEEDS_OPEN_RECEIVABLE") && creditPreflight.includes("SUPPLIER_CREDIT_NOTE_EXCEEDS_OPEN_PAYABLE") && creditPreflight.includes("TransactionIsolationLevel.Serializable"), "Credit-note posting preflight prevents an exhausted balance from becoming negative.");
ok(salesCreditPost.includes("assertSalesCreditNoteStillPostable") && supplierCreditPost.includes("assertSupplierCreditNoteStillPostable"), "Both credit-note posting routes execute the balance preflight.");

ok(sharedWorkspace.includes('return "EnterpriseReceivable"') && sharedWorkspace.includes('return "EnterprisePayable"') && sharedWorkspace.includes('return "EnterpriseSalesCreditNote"') && sharedWorkspace.includes('return "EnterpriseSupplierCreditNote"'), "Documents and comments attach to the actual canonical Finance object type.");

ok(summaryService.includes("FINANCE_RECEIVABLES") && summaryService.includes("FINANCE_PAYABLES") && summaryService.includes("FINANCE_PAYMENTS"), "Operational Finance summary covers the three hotfix modules from server data.");
ok(operationalLookups.includes("enterprisePayrollRun.findMany") && operationalLookups.includes('status: "APPROVED"') && operationalLookups.includes("id: run.id"), "Payments expose approved payroll runs, not bare payroll periods.");

for (const [toolCode, moduleCode, label] of [
  ["FINANCE_RECEIVABLES_READ", "FINANCE_RECEIVABLES", "Receivables"],
  ["FINANCE_PAYABLES_READ", "FINANCE_PAYABLES", "Payables"],
  ["FINANCE_PAYMENTS_READ", "FINANCE_PAYMENTS", "Payments"],
]) {
  ok(
    financeToolContract.includes(`code: "${toolCode}", moduleCode: "${moduleCode}"`) &&
      financeToolContract.includes("requiredModuleCodes: [spec.moduleCode]"),
    `${label} AI read tool requires its canonical module entitlement.`,
  );
}
ok(aiAuthorize.includes("getEnterpriseAiAccess") && aiAuthorize.includes("resolveEnterpriseModuleAccess"), "AI tool authorization keeps AI entitlement plus effective module access gates.");
ok(financeExecutor.includes("enterpriseReceivable") && financeExecutor.includes("enterprisePayable") && financeExecutor.includes("enterprisePayment") && financeExecutor.includes("currencyCode"), "AI Finance executors read canonical Finance tables and preserve currency dimensions.");

ok(String(pkg.scripts?.["qa:regression"] || "").includes("qa-regression-checks.mjs"), "package.json keeps the regression adapter in qa:regression.");
ok(regressionAdapter.includes('await import("./qa-hotfix-576-finance-receivables-payables-payments.mjs")'), "Hotfix 576 QA is wired into the regression adapter and therefore into qa:regression.");

if (process.exitCode) {
  console.error("\nHotfix #576 Finance regression gate failed.");
  process.exit(process.exitCode);
}
console.log("\nHotfix #576 Finance regression gate passed.");
