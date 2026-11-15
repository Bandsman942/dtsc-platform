/** Presentation-only localization. Immutable audit event codes remain untouched in storage. */
export type AuditDisplayLocale = "fr" | "en";
const EXACT: Record<string, [string, string]> = {
  RETAIL_SITE_ASSIGNMENT_CREATED: ["Affectation du personnel créée", "Store staff assignment created"],
  RETAIL_SITE_ASSIGNMENT_UPDATED: ["Autorisations d’une boutique modifiées", "Store access permissions updated"],
  ENTERPRISE_RETAIL_INVOICE_SUBMIT: ["Facture soumise à validation", "Invoice submitted for approval"],
  ENTERPRISE_RETAIL_INVOICE_APPROVE: ["Facture approuvée", "Invoice approved"],
  ENTERPRISE_RETAIL_INVOICE_REJECT: ["Facture refusée", "Invoice rejected"],
  ENTERPRISE_RETAIL_INVOICE_ISSUE: ["Facture émise et comptabilisée", "Invoice issued and posted"],
  ENTERPRISE_RETAIL_INVOICE_CANCEL: ["Brouillon de facture annulé", "Draft invoice cancelled"],
  ENTERPRISE_RETAIL_INVOICE_PAYMENT_PROPOSED: ["Encaissement préparé", "Collection prepared"],
  ENTERPRISE_RETAIL_INVOICE_PAYMENT_SUBMIT: ["Encaissement soumis à validation", "Collection submitted for approval"],
  ENTERPRISE_RETAIL_INVOICE_PAYMENT_APPROVE: ["Encaissement approuvé", "Collection approved"],
  ENTERPRISE_RETAIL_INVOICE_PAYMENT_CANCEL: ["Proposition d’encaissement annulée", "Collection proposal cancelled"],
  ENTERPRISE_RETAIL_INVOICE_RETURN_SUBMITTED: ["Annulation / retour de facture encaissée demandé", "Paid invoice cancellation / return requested"],
  ENTERPRISE_RETAIL_INVOICE_RETURN_APPROVED: ["Demande d’annulation / retour approuvée", "Paid invoice cancellation / return approved"],
  ENTERPRISE_RETAIL_INVOICE_RETURN_REJECTED: ["Demande d’annulation / retour refusée", "Paid invoice cancellation / return rejected"],
  ENTERPRISE_AUDIT_LOGS_VIEWED: ["Journal d’audit consulté", "Audit log viewed"],
};
const FR: Record<string, string> = {
  ENTERPRISE: "entreprise", RETAIL: "boutique", POS: "point de vente",
  INVOICE: "facture", INVOICES: "factures", PAYMENT: "encaissement", PAYMENTS: "encaissements",
  RETURN: "retour", RETURNS: "retours", REFUND: "remboursement", CASH: "caisse",
  CREDIT: "avoir", NOTE: "document", STOCK: "stock", INVENTORY: "inventaire",
  APPROVE: "approuvé", APPROVED: "approuvé", APPROVAL: "validation",
  SUBMIT: "soumis", SUBMITTED: "soumis", CREATE: "créé", CREATED: "créé",
  UPDATE: "modifié", UPDATED: "modifié", CANCEL: "annulé", CANCELLED: "annulé",
  CONFIRM: "confirmé", CONFIRMED: "confirmé", REJECT: "refusé", REJECTED: "refusé",
  SETTLE: "liquidé", SETTLED: "liquidé", FINANCE: "finance", SITE: "boutique",
  ASSIGNMENT: "affectation", ACCESS: "accès", USER: "utilisateur", MEMBER: "collaborateur",
  OPEN: "ouvert", CLOSE: "fermé", CLOSED: "fermé", EXPENSE: "dépense",
  SALES: "vente", AUDIT: "audit", LOGS: "journaux", VIEWED: "consulté",
  REQUEST: "demande", REQUESTED: "demandé", DECIDED: "décidé",
  RECONCILED: "rapproché", POSTED: "comptabilisé", ALLOCATED: "affecté",
  FORBIDDEN: "interdit", FAILED: "échoué", ERROR: "erreur",
};
const EN: Record<string, string> = {
  ENTERPRISE: "enterprise", RETAIL: "store", POS: "point of sale",
  INVOICE: "invoice", PAYMENT: "payment", RETURN: "return", REFUND: "refund",
  CREATED: "created", UPDATED: "updated", SUBMIT: "submitted", APPROVE: "approved",
  CANCEL: "cancelled", REJECT: "rejected", SITE: "store", ASSIGNMENT: "assignment",
};
const LEVELS: Record<string, [string, string]> = {
  ALL: ["Tous", "All"], LOW: ["Faible", "Low"], MEDIUM: ["Moyen", "Medium"],
  HIGH: ["Élevé", "High"], CRITICAL: ["Critique", "Critical"], WARNING: ["Avertissement", "Warning"],
  ERROR: ["Erreur", "Error"], SUCCESS: ["Réussi", "Succeeded"], SUCCEEDED: ["Réussi", "Succeeded"],
  FAILED: ["Échoué", "Failed"], DENIED: ["Refusé", "Denied"], APPROVED: ["Approuvé", "Approved"],
  REJECTED: ["Refusé", "Rejected"], PENDING: ["En attente", "Pending"],
};
const ENTITIES: Record<string, [string, string]> = {
  EnterpriseSalesInvoice: ["Facture client", "Customer invoice"],
  EnterprisePayment: ["Encaissement / paiement", "Collection / payment"],
  EnterpriseRetailInvoiceReturnRequest: ["Demande d’annulation / retour", "Cancellation / return request"],
  EnterpriseRetailSiteAssignment: ["Affectation par boutique", "Store staff assignment"],
  EnterpriseSalesCreditNote: ["Avoir client", "Customer credit note"],
  Organization: ["Entreprise", "Enterprise"],
};
function fromPair(pair: [string, string] | undefined, locale: AuditDisplayLocale) {
  return pair ? pair[locale === "fr" ? 0 : 1] : null;
}
function tokenLabel(code: string, locale: AuditDisplayLocale): string {
  const dictionary = locale === "fr" ? FR : EN;
  const tokens = code.toUpperCase().split("_").filter(Boolean);
  return tokens.map((token) => dictionary[token] || token.toLowerCase()).join(" ");
}
export function auditActionLabel(action: string, locale: AuditDisplayLocale): string {
  const full = action.replace(/^ENTERPRISE_/, "");
  return fromPair(EXACT[action] || EXACT[full], locale) || tokenLabel(full, locale);
}
export function auditValueLabel(value: string | null | undefined, locale: AuditDisplayLocale): string {
  if (!value) return "—";
  return fromPair(LEVELS[value.toUpperCase()], locale) || tokenLabel(value, locale);
}
export function auditEntityLabel(entity: string, locale: AuditDisplayLocale): string {
  return fromPair(ENTITIES[entity], locale) || entity.replace(/([a-z])([A-Z])/g, "$1 $2");
}
export function auditSearchCode(search: string, locale: AuditDisplayLocale): string {
  if (locale === "en") return search.trim();
  const term = search.trim().toLocaleLowerCase("fr");
  const found: Record<string, string> = {
    facture: "INVOICE", factures: "INVOICE", encaissement: "PAYMENT",
    paiement: "PAYMENT", remboursement: "REFUND", boutique: "SITE",
    affectation: "ASSIGNMENT", annulation: "CANCEL", annuler: "CANCEL",
    approbation: "APPROVE", approuvé: "APPROVE", approuver: "APPROVE",
    soumission: "SUBMIT", soumis: "SUBMIT", création: "CREATED",
    modification: "UPDATED", retour: "RETURN", audit: "AUDIT",
  };
  return found[term] || search.trim();
}
