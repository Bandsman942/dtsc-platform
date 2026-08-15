import fs from "node:fs";
import process from "node:process";

const frPath = "locales/enterprise-finance.fr.json";
const enPath = "locales/enterprise-finance.en.json";
const invoicePath = "components/enterprise/professional/enterprise-finance-invoices-workspace.tsx";
const paymentsPath = "components/enterprise/professional/enterprise-finance-payments-treasury-workspace.tsx";

const fr = JSON.parse(fs.readFileSync(frPath, "utf8"));
const en = JSON.parse(fs.readFileSync(enPath, "utf8"));
const invoice = fs.readFileSync(invoicePath, "utf8");
const payments = fs.readFileSync(paymentsPath, "utf8");

let failed = false;
function check(condition, message) {
  if (condition) {
    console.log(`PASS ${message}`);
    return;
  }
  failed = true;
  console.error(`FAIL ${message}`);
}

const frKeys = Object.keys(fr).sort();
const enKeys = Object.keys(en).sort();
check(JSON.stringify(frKeys) === JSON.stringify(enKeys), "enterprise-finance FR/EN conserve une parité stricte des clés");

const expectedActions = {
  actionSubmit: ["Soumettre", "Submit"],
  actionApprove: ["Approuver", "Approve"],
  actionReject: ["Refuser", "Reject"],
  actionIssueAndPost: ["Émettre et comptabiliser", "Issue and post"],
  actionCancel: ["Annuler", "Cancel"],
  actionConfirm: ["Confirmer", "Confirm"],
  actionMarkReconciled: ["Marquer rapproché", "Mark reconciled"],
  actionReverse: ["Contrepasser", "Reverse"],
  actionExecuteAndConfirm: ["Exécuter et confirmer", "Execute and confirm"],
};
for (const [key, [frValue, enValue]] of Object.entries(expectedActions)) {
  check(fr[key] === frValue, `${key} conserve la copie FR attendue`);
  check(en[key] === enValue, `${key} expose une copie EN client-friendly`);
}

for (const key of [
  "receivablesTitle", "payablesTitle", "customerInvoices", "supplierInvoices", "receivables", "payables",
  "newInvoice", "invoiceSavedDraft", "invoiceWorkflowUpdated", "paymentSavedDraft", "financialAccountCreated",
  "transferPrepared", "paymentAllocated", "professionalPaymentsTitle", "accountsTransfersTitle", "allocatePayment",
]) {
  check(typeof fr[key] === "string" && typeof en[key] === "string", `${key} existe dans les deux catalogues`);
}

check(invoice.includes('translateEnterpriseFinance'), "Factures utilise le catalogue enterprise-finance");
check(invoice.includes('invoiceTransitionActions(detail.status, locale)'), "Factures projette les actions selon la locale");
check(invoice.includes('{action.label}</Button>'), "Factures rend un libellé client et non le code API");
check(invoice.includes('invoiceActionLabel(actionTarget.action, locale)'), "Le titre du dialogue facture localise l’action");
check(invoice.includes('action: actionTarget.action'), "Factures préserve le code d’action API dans le payload");
check(invoice.includes('description={locale === "en" ? definition.descriptionEn : definition.descriptionFr}'), "Factures utilise la description de module correspondant à la locale");
check(!invoice.includes('locale === "fr" ? action.label : action.action'), "Factures n’affiche plus le code API comme libellé EN");
check(!invoice.includes('description={definition.descriptionFr}'), "Factures n’impose plus la description française en EN");

check(payments.includes('translateEnterpriseFinance'), "Paiements/Trésorerie utilise le catalogue enterprise-finance");
check(payments.includes('paymentActions(detail.status, locale)'), "Paiements projette les actions selon la locale");
check(payments.includes('transferActions(detail.status, locale)'), "Transferts projette les actions selon la locale");
check(payments.includes('{action.label}</Button>'), "Paiements/Trésorerie rend un libellé client et non le code API");
check(payments.includes('label: action.label'), "Le dialogue d’action conserve le libellé localisé sélectionné");
check(payments.includes('action: actionTarget.action'), "Paiements/Trésorerie préserve le code d’action API dans le payload");
check(payments.includes('title={actionTarget ? `${actionTarget.label}'), "Le titre du dialogue paiement/transfert n’expose plus le code API brut");
check(payments.includes('description={locale === "en" ? definition.descriptionEn : definition.descriptionFr}'), "Paiements/Trésorerie utilise la description de module correspondant à la locale");
check(!payments.includes('locale === "fr" ? action.label : action.action'), "Paiements/Trésorerie n’affiche plus le code API comme libellé EN");
check(!payments.includes('description={definition.descriptionFr}'), "Paiements/Trésorerie n’impose plus la description française en EN");

for (const code of ["SUBMIT", "APPROVE", "REJECT", "ISSUE"]) {
  check(invoice.includes(`action: "${code}"`), `Factures conserve le code API ${code}`);
}
for (const code of ["SUBMIT", "CANCEL", "APPROVE", "CONFIRM", "RECONCILE", "REVERSE"]) {
  check(payments.includes(`action: "${code}"`), `Paiements/Trésorerie conserve le code API ${code}`);
}

if (failed) process.exit(1);
console.log("Finance operational i18n #324: contrat valide.");