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
const journalRoute = read("app/api/enterprise/[organizationId]/journal-entries/[entryId]/transition/route.ts");
const paymentRoute = read("app/api/enterprise/[organizationId]/payments/[paymentId]/transition/route.ts");
const salesRoute = read("app/api/enterprise/[organizationId]/sales-invoices/[invoiceId]/transition/route.ts");
const supplierRoute = read("app/api/enterprise/[organizationId]/supplier-invoices/[invoiceId]/transition/route.ts");
const closeRoute = read("app/api/enterprise/[organizationId]/financial-close/[closeId]/transition/route.ts");
const cashCloseRoute = read("app/api/enterprise/[organizationId]/cash-sessions/[sessionId]/close/route.ts");
const cashValidateRoute = read("app/api/enterprise/[organizationId]/cash-sessions/[sessionId]/validate/route.ts");
const reconciliationRoute = read("app/api/enterprise/[organizationId]/reconciliations/[sessionId]/complete/route.ts");

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

console.log("QA #511 accounting approval orchestration: PASS");