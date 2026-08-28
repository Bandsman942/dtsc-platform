import fs from "node:fs";

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL #511: ${message}`);
    process.exit(1);
  }
  console.log(`PASS #511: ${message}`);
}

const targets = read("lib/enterprise/approval-targets.ts");
const service = read("lib/enterprise/accounting/accounting-approval-service.ts");
const human = read("lib/enterprise/accounting/accounting-human-approval-orchestration.ts");
const invoices = read("lib/enterprise/accounting/accounting-invoice-approval-orchestration.ts");
const operations = read("lib/enterprise/accounting/accounting-operations-approval-orchestration.ts");
const documents = read("lib/enterprise/accounting/accounting-document-approval-orchestration.ts");
const workflowAdapter = read("lib/enterprise/workflows/adapters/finance.ts");
const journalRoute = read("app/api/enterprise/[organizationId]/journal-entries/[entryId]/transition/route.ts");
const paymentRoute = read("app/api/enterprise/[organizationId]/payments/[paymentId]/transition/route.ts");
const salesRoute = read("app/api/enterprise/[organizationId]/sales-invoices/[invoiceId]/transition/route.ts");
const supplierRoute = read("app/api/enterprise/[organizationId]/supplier-invoices/[invoiceId]/transition/route.ts");
const closeRoute = read("app/api/enterprise/[organizationId]/financial-close/[closeId]/transition/route.ts");
const cashCloseRoute = read("app/api/enterprise/[organizationId]/cash-sessions/[sessionId]/close/route.ts");
const cashValidateRoute = read("app/api/enterprise/[organizationId]/cash-sessions/[sessionId]/validate/route.ts");
const reconciliationRoute = read("app/api/enterprise/[organizationId]/reconciliations/[sessionId]/complete/route.ts");
const openingTransitionRoute = read("app/api/enterprise/[organizationId]/opening-balances/[openingId]/transition/route.ts");
const openingPostRoute = read("app/api/enterprise/[organizationId]/opening-balances/[openingId]/post/route.ts");
const salesCreditTransitionRoute = read("app/api/enterprise/[organizationId]/sales-credit-notes/[creditNoteId]/transition/route.ts");
const salesCreditPostRoute = read("app/api/enterprise/[organizationId]/sales-credit-notes/[creditNoteId]/post/route.ts");
const supplierCreditTransitionRoute = read("app/api/enterprise/[organizationId]/supplier-credit-notes/[creditNoteId]/transition/route.ts");
const supplierCreditPostRoute = read("app/api/enterprise/[organizationId]/supplier-credit-notes/[creditNoteId]/post/route.ts");
const cashReconciliationWorkspace = read("components/enterprise/professional/enterprise-finance-cash-bank-reconciliation-workspace.tsx");

for (const target of [
  "EnterpriseJournalEntry",
  "EnterprisePayment",
  "EnterpriseSalesInvoice",
  "EnterpriseSupplierInvoiceReview",
  "EnterpriseSupplierInvoiceApproval",
  "EnterpriseFinancialClose",
  "EnterpriseCashSession",
  "EnterpriseReconciliationSession",
  "EnterpriseOpeningBalanceApproval",
  "EnterpriseSalesCreditNoteApproval",
  "EnterpriseSupplierCreditNoteApproval",
]) {
  assert(service.includes(target), `${target} est enregistré dans le contrat comptable`);
  assert(targets.includes(target), `${target} est projeté dans le Centre des actions`);
}

assert(service.includes('initialStatus?: "PENDING" | "QUEUED"'), "les étapes multi-niveaux supportent QUEUED");
assert(service.includes("activateQueuedAccountingApproval"), "une approbation finale peut être activée après revue");
assert(invoices.includes('targetEntityType: "EnterpriseSupplierInvoiceReview"'), "la revue fournisseur possède sa propre affectation");
assert(invoices.includes('targetEntityType: "EnterpriseSupplierInvoiceApproval"'), "l'approbation fournisseur possède sa propre affectation");
assert(invoices.includes('initialStatus: "QUEUED"'), "l'approbation fournisseur reste en file jusqu'à la revue");
assert(invoices.includes("SUPPLIER_INVOICE_REVIEWER_APPROVER_MUST_DIFFER"), "reviewer et approbateur fournisseur doivent être distincts");
assert(invoices.includes("THREE_WAY_MATCH_VARIANCE_UNRESOLVED"), "le three-way match reste une barrière à l'approbation");

assert(journalRoute.includes("submitJournalEntryForAssignedApproval") && journalRoute.includes("decideJournalEntryAssignedApproval"), "Journal utilise l'affectation explicite pour SUBMIT/APPROVE/REJECT");
assert(journalRoute.includes("transitionJournalEntry") && human.includes('action: "APPROVE" | "REJECT"'), "POST Journal reste hors de l'orchestrateur humain");
assert(paymentRoute.includes("submitPaymentForAssignedApproval") && paymentRoute.includes("approvePaymentAssignedApproval"), "Payment utilise l'affectation explicite");
assert(paymentRoute.includes("transitionEnterprisePayment"), "CONFIRM/RECONCILE/REVERSE Payment restent dans le moteur d'exécution historique");
assert(salesRoute.includes("submitSalesInvoiceForAssignedApproval") && salesRoute.includes("approveSalesInvoiceAssignedApproval"), "facture client utilise l'affectation explicite");
assert(salesRoute.includes("transitionSalesInvoice"), "ISSUE/posting facture client reste séparé");
assert(supplierRoute.includes("submitSupplierInvoiceForAssignedReview") && supplierRoute.includes("reviewSupplierInvoiceAssignedStep") && supplierRoute.includes("approveSupplierInvoiceAssignedStep"), "facture fournisseur suit SUBMIT → REVIEW → APPROVE");
assert(supplierRoute.includes("transitionSupplierInvoice"), "POST facture fournisseur reste séparé");
assert(closeRoute.includes("submitFinancialCloseForAssignedApproval") && closeRoute.includes("approveFinancialCloseAssignedApproval"), "clôture financière utilise l'affectation explicite");
assert(closeRoute.includes("transitionFinancialClose"), "CLOSE/REOPEN restent séparés de l'approbation");
assert(cashCloseRoute.includes("submitCashSessionCloseForAssignedValidation") && cashValidateRoute.includes("validateCashSessionAssignedApproval"), "session de caisse possède un validateur affecté");
assert(reconciliationRoute.includes("submitReconciliationForAssignedValidation") && reconciliationRoute.includes("decideReconciliationAssignedValidation"), "rapprochement possède soumission puis validation explicite");
assert(operations.includes('status: "PENDING_VALIDATION"'), "les opérations préparées attendent une décision explicite");
assert(
  cashReconciliationWorkspace.includes('moduleCode="FINANCE_CASH"')
    && cashReconciliationWorkspace.includes('approverUserId: String(form.get("approverUserId") || "")'),
  "clôture de caisse exige un validateur sélectionné dans l’UI",
);
assert(
  cashReconciliationWorkspace.includes('moduleCode="FINANCE_RECONCILIATION"')
    && cashReconciliationWorkspace.includes('action: "SUBMIT"')
    && cashReconciliationWorkspace.includes('action: "APPROVE"')
    && cashReconciliationWorkspace.includes('action: "REJECT"')
    && cashReconciliationWorkspace.includes('detail.status === "PENDING_VALIDATION"'),
  "rapprochement expose soumission affectée puis approbation/rejet dans l’UI",
);
assert(
  cashReconciliationWorkspace.includes('tab === "pending" ? (isBank ? "SUBMITTED" : "PENDING_VALIDATION")'),
  "le filtre pending conserve SUBMITTED pour Banque et PENDING_VALIDATION pour Caisse/Rapprochement",
);

for (const [label, source, submitMarker, decisionMarker, postSource, postMarker, legacyMarker] of [
  ["soldes d'ouverture", openingTransitionRoute, "submitOpeningBalanceForAssignedApproval", "decideOpeningBalanceAssignedApproval", openingPostRoute, "postApprovedOpeningBalance", "approveAndPostOpeningBalance"],
  ["avoirs clients", salesCreditTransitionRoute, "submitSalesCreditNoteForAssignedApproval", "decideSalesCreditNoteAssignedApproval", salesCreditPostRoute, "postApprovedSalesCreditNote", "approveAndPostSalesCreditNote"],
  ["avoirs fournisseurs", supplierCreditTransitionRoute, "submitSupplierCreditNoteForAssignedApproval", "decideSupplierCreditNoteAssignedApproval", supplierCreditPostRoute, "postApprovedSupplierCreditNote", "approveAndPostSupplierCreditNote"],
]) {
  assert(source.includes(submitMarker) && source.includes(decisionMarker), `${label}: SUBMIT et décision humaine utilisent l'orchestrateur affecté`);
  assert(postSource.includes(postMarker), `${label}: POST utilise une opération post-approbation distincte`);
  assert(!postSource.includes(legacyMarker), `${label}: la route POST ne combine plus approbation et comptabilisation`);
}

assert(documents.includes('status: "PENDING_APPROVAL"'), "les soldes d'ouverture et avoirs passent par PENDING_APPROVAL");
assert(documents.includes('targetEntityType: "EnterpriseOpeningBalanceApproval"'), "soldes d'ouverture affectés dans EnterpriseApproval");
assert(documents.includes('targetEntityType: "EnterpriseSalesCreditNoteApproval"'), "avoirs clients affectés dans EnterpriseApproval");
assert(documents.includes('targetEntityType: "EnterpriseSupplierCreditNoteApproval"'), "avoirs fournisseurs affectés dans EnterpriseApproval");
assert(documents.includes('initial.status !== "APPROVED"') && documents.includes('credit.status !== "APPROVED"'), "les opérations POST refusent un document non approuvé");

for (const forbidden of [
  "approveAndPostSalesCreditNote",
  "approveAndPostSupplierCreditNote",
  "validateCashSession",
  "completeReconciliationSession",
]) {
  assert(!workflowAdapter.includes(forbidden), `workflow automatique n'utilise plus ${forbidden}`);
}
assert(workflowAdapter.includes('const salesInvoiceActions = ["ISSUE", "CANCEL", "VOID"]'), "workflow facture client ne peut ni soumettre ni approuver");
assert(workflowAdapter.includes('const supplierInvoiceActions = ["POST", "CANCEL"]'), "workflow facture fournisseur ne peut ni reviewer ni approuver");
assert(workflowAdapter.includes('const paymentActions = ["CONFIRM", "RECONCILE", "CANCEL", "REVERSE"]'), "workflow paiement ne peut ni soumettre ni approuver");
assert(workflowAdapter.includes('const journalActions = ["POST", "CANCEL"]'), "workflow journal ne peut ni soumettre ni approuver");
assert(workflowAdapter.includes('entityType: "EnterpriseCashSession"') && workflowAdapter.includes('async executeDomainAction() { return denyAction("EnterpriseCashSession"); }'), "workflow caisse ne peut pas prendre une décision humaine");
assert(workflowAdapter.includes('async executeDomainAction() { return denyAction("EnterpriseReconciliationSession"); }'), "workflow rapprochement ne peut pas prendre une décision humaine");
assert(workflowAdapter.includes('domainActions: new Set(["POST"])') && workflowAdapter.includes("postApprovedSalesCreditNote") && workflowAdapter.includes("postApprovedSupplierCreditNote"), "workflows d'avoirs ne peuvent exécuter que POST après approbation");

console.log("QA #511 accounting approval orchestration: PASS");
