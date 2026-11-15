/** Internationalized presentation of immutable enterprise audit events. */
export type AuditLocale = "fr" | "en";
const names: Record<string,[string,string]> = {
  "RETAIL_SITE_ASSIGNMENT_CREATED": [
    "Collaborateur affecté à une boutique",
    "Staff assigned to store"
  ],
  "RETAIL_SITE_ASSIGNMENT_UPDATED": [
    "Autorisations de la boutique modifiées",
    "Store permissions updated"
  ],
  "ENTERPRISE_RETAIL_INVOICE_SUBMIT": [
    "Facture soumise à validation",
    "Invoice submitted"
  ],
  "ENTERPRISE_RETAIL_INVOICE_APPROVE": [
    "Facture approuvée",
    "Invoice approved"
  ],
  "ENTERPRISE_RETAIL_INVOICE_ISSUE": [
    "Facture émise et comptabilisée",
    "Invoice issued and posted"
  ],
  "ENTERPRISE_RETAIL_INVOICE_CANCEL": [
    "Facture impayée annulée",
    "Unpaid invoice cancelled"
  ],
  "ENTERPRISE_RETAIL_INVOICE_REJECT": [
    "Facture refusée",
    "Invoice rejected"
  ],
  "ENTERPRISE_RETAIL_INVOICE_REQUEST_CORRECTION": [
    "Correction de facture demandée",
    "Invoice correction requested"
  ],
  "ENTERPRISE_RETAIL_INVOICE_PAYMENT_PROPOSED": [
    "Encaissement préparé",
    "Collection prepared"
  ],
  "ENTERPRISE_RETAIL_INVOICE_PAYMENT_SUBMIT": [
    "Encaissement soumis à validation",
    "Collection submitted"
  ],
  "ENTERPRISE_RETAIL_INVOICE_PAYMENT_APPROVE": [
    "Encaissement approuvé",
    "Collection approved"
  ],
  "ENTERPRISE_RETAIL_INVOICE_PAYMENT_CONFIRM": [
    "Encaissement confirmé et comptabilisé",
    "Collection confirmed and posted"
  ],
  "ENTERPRISE_RETAIL_INVOICE_PAYMENT_ALLOCATED": [
    "Paiement affecté à la facture",
    "Payment allocated to invoice"
  ],
  "ENTERPRISE_RETAIL_INVOICE_PAYMENT_CANCEL": [
    "Encaissement brouillon annulé",
    "Draft collection cancelled"
  ],
  "ENTERPRISE_RETAIL_INVOICE_RETURN_SUBMITTED": [
    "Annulation de facture encaissée demandée",
    "Paid-invoice cancellation requested"
  ],
  "ENTERPRISE_RETAIL_INVOICE_RETURN_APPROVE": [
    "Annulation de facture encaissée approuvée",
    "Paid-invoice cancellation approved"
  ],
  "ENTERPRISE_RETAIL_INVOICE_RETURN_REJECT": [
    "Annulation de facture encaissée refusée",
    "Paid-invoice cancellation rejected"
  ],
  "ENTERPRISE_RETAIL_INVOICE_RETURN_INSPECTED": [
    "Retour de stock inspecté",
    "Returned stock inspected"
  ],
  "ENTERPRISE_RETAIL_INVOICE_RETURN_PREPARED": [
    "Avoir et remboursements préparés",
    "Credit note and refunds prepared"
  ],
  "ENTERPRISE_RETAIL_INVOICE_RETURN_SETTLED": [
    "Avoir et remboursements liquidés",
    "Credit note and refunds settled"
  ],
  "ENTERPRISE_AUDIT_LOGS_VIEWED": [
    "Journal d'audit consulté",
    "Audit history viewed"
  ]
};
const words: Record<string,string> = {
  "ENTERPRISE": "Entreprise",
  "RETAIL": "Commerce",
  "INVOICE": "facture",
  "PAYMENT": "paiement",
  "RETURN": "retour",
  "REFUND": "remboursement",
  "CASH": "caisse",
  "STOCK": "stock",
  "SALES": "ventes",
  "APPROVAL": "approbation",
  "APPROVE": "approuvé",
  "APPROVED": "approuvé",
  "REJECT": "refusé",
  "REJECTED": "refusé",
  "REQUEST": "demande",
  "REQUESTED": "demandé",
  "CREATED": "créé",
  "UPDATED": "modifié",
  "DELETED": "supprimé",
  "VIEWED": "consulté",
  "EXPORTED": "exporté",
  "ASSIGNMENT": "affectation",
  "ACCESS": "accès",
  "PERMISSIONS": "autorisations",
  "FINANCE": "finances",
  "ACCOUNT": "compte",
  "CONFIRMED": "confirmé",
  "CONFIRM": "confirmation",
  "SUBMITTED": "soumis",
  "SUBMIT": "soumission",
  "CANCEL": "annulé",
  "CANCELLED": "annulé",
  "SETTLED": "liquidé",
  "TRANSFER": "transfert",
  "SESSION": "session",
  "CLOSED": "fermée",
  "MODULE": "module",
  "ORGANIZATION": "organisation",
  "USER": "utilisateur",
  "SECURITY": "sécurité",
  "AUDIT": "audit",
  "LOGS": "journaux",
  "SITE": "boutique",
  "STORE": "boutique",
  "EXPENSE": "dépense",
  "BUDGET": "budget",
  "CUSTOMER": "client",
  "SUPPLIER": "fournisseur",
  "INVENTORY": "inventaire",
  "POSTED": "comptabilisé",
  "RECONCILED": "rapproché",
  "RECORD": "enregistrement",
  "ROLE": "rôle",
  "EXPENSES": "dépenses"
};
const translated: Record<string,[string,string]> = {
  SUCCESS: ["Réussi","Successful"], FAILED: ["Échec","Failed"], DENIED: ["Refusé","Denied"], PARTIAL: ["Partiel","Partial"],
  LOW: ["Faible","Low"], MEDIUM: ["Modéré","Medium"], HIGH: ["Élevé","High"], CRITICAL: ["Critique","Critical"],
  RETAIL_OWNER_GRANTED_SELF_APPROVAL: ["Auto-validation accordée par le propriétaire","Owner-granted self-approval"],
  SELF_APPROVAL_OVERRIDE: ["Exception d'auto-validation","Self-approval exception"],
  AUDIT_LOG_VIEW: ["Consultation du journal d'audit","Audit history viewed"],
};
const entities: Record<string,[string,string]> = {
  EnterpriseRetailSiteAssignment: ["Accès d'une boutique","Store access"],
  EnterpriseSalesInvoice: ["Facture client","Customer invoice"],
  EnterprisePayment: ["Paiement","Payment"],
  EnterpriseRetailInvoiceReturnRequest: ["Annulation et retour","Cancellation and return"],
  EnterprisePaymentAllocation: ["Affectation de paiement","Payment allocation"],
  Organization: ["Entreprise","Organization"],
};
function pick(name: string | null | undefined, locale: AuditLocale, table: Record<string,[string,string]>) {
  if (!name) return "—";
  return table[name]?.[locale === "en" ? 1 : 0] ?? name;
}
export function auditActionLabel(action: string, locale: AuditLocale) {
  if (names[action]) return pick(action,locale,names);
  return locale === "en" ? action.replaceAll("_"," ").toLowerCase() :
    action.split("_").map(token=>words[token] || token.toLowerCase()).join(" ");
}
export function auditResultLabel(code: string, locale: AuditLocale) { return pick(code,locale,translated); }
export function auditRiskLabel(code: string | null | undefined, locale: AuditLocale) { return pick(code,locale,translated); }
export function auditReasonLabel(code: string | null | undefined, locale: AuditLocale) {
  if (!code) return "—";
  return translated[code] ? pick(code,locale,translated) : auditActionLabel(code,locale);
}
export function auditEntityLabel(entity: string, locale: AuditLocale) { return pick(entity,locale,entities); }
