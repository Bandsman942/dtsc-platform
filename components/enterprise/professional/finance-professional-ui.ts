"use client";

import type { StatusBadgeTone } from "@/components/workspace/status-badge";

export type FinanceLocale = "fr" | "en";

const STATUS_LABELS: Record<FinanceLocale, Record<string, string>> = {
  fr: {
    DRAFT: "Brouillon", SUBMITTED: "Soumis", IN_REVIEW: "En revue", PENDING_REVIEW: "En attente de revue", REVIEWED: "Revu",
    PENDING_APPROVAL: "En attente de validation", APPROVED: "Approuvé", ISSUED: "Émis", POSTED: "Comptabilisé", PARTIALLY_PAID: "Partiellement payé",
    PAID: "Payé", OVERDUE: "En retard", DISPUTED: "En litige", WRITTEN_OFF: "Passé en irrécouvrable", CANCELLED: "Annulé", VOID: "Invalidé", VOIDED: "Invalidé",
    CREDIT_NOTE: "Avoir", REJECTED: "Refusé", RETURNED: "Renvoyé pour correction", CONFIRMED: "Confirmé", PARTIALLY_ALLOCATED: "Partiellement affecté",
    ALLOCATED: "Affecté", UNALLOCATED: "Non affecté", RECONCILED: "Rapproché", UNRECONCILED: "Non rapproché", REVERSED: "Contrepassé",
    ACTIVE: "Actif", INACTIVE: "Inactif", SUSPENDED: "Suspendu", OPEN: "Ouverte", CLOSING: "Clôture en préparation", PENDING_VALIDATION: "En attente de validation",
    VALIDATED: "Validée", SOFT_CLOSED: "Clôture provisoire", CLOSED: "Fermé", LOCKED: "Verrouillé", PREPARED: "Préparé", IN_PROGRESS: "En cours",
    COMPLETED: "Terminé", EXECUTED: "Exécuté", FAILED: "Échec", IMPORTED: "Importé", READY: "Prêt", BLOCKED: "Bloqué", PUBLISHED: "Publié", DEPRECATED: "Remplacé",
    REOPENED: "Réouvert", MATCHED: "Rapproché", UNMATCHED: "À rapprocher", PENDING: "En attente", PLANNED: "Planifié"
  },
  en: {
    DRAFT: "Draft", SUBMITTED: "Submitted", IN_REVIEW: "In review", PENDING_REVIEW: "Pending review", REVIEWED: "Reviewed", PENDING_APPROVAL: "Pending approval",
    APPROVED: "Approved", ISSUED: "Issued", POSTED: "Posted", PARTIALLY_PAID: "Partially paid", PAID: "Paid", OVERDUE: "Overdue", DISPUTED: "Disputed",
    WRITTEN_OFF: "Written off", CANCELLED: "Cancelled", VOID: "Voided", VOIDED: "Voided", CREDIT_NOTE: "Credit note", REJECTED: "Rejected", RETURNED: "Returned for correction",
    CONFIRMED: "Confirmed", PARTIALLY_ALLOCATED: "Partially allocated", ALLOCATED: "Allocated", UNALLOCATED: "Unallocated", RECONCILED: "Reconciled", UNRECONCILED: "Unreconciled",
    REVERSED: "Reversed", ACTIVE: "Active", INACTIVE: "Inactive", SUSPENDED: "Suspended", OPEN: "Open", CLOSING: "Closing", PENDING_VALIDATION: "Pending validation",
    VALIDATED: "Validated", SOFT_CLOSED: "Soft closed", CLOSED: "Closed", LOCKED: "Locked", PREPARED: "Prepared", IN_PROGRESS: "In progress", COMPLETED: "Completed",
    EXECUTED: "Executed", FAILED: "Failed", IMPORTED: "Imported", READY: "Ready", BLOCKED: "Blocked", PUBLISHED: "Published", DEPRECATED: "Superseded", REOPENED: "Reopened",
    MATCHED: "Matched", UNMATCHED: "To reconcile", PENDING: "Pending", PLANNED: "Planned"
  }
};

const METRIC_LABELS: Record<FinanceLocale, Record<string, string>> = {
  fr: {
    hasFunctionalCurrency: "Devise configurée", hasFiscalYear: "Exercice actif", hasOpenPeriod: "Période ouverte", hasChartOfAccounts: "Plan comptable disponible",
    hasSalesJournal: "Journal des ventes configuré", hasPurchaseJournal: "Journal des achats configuré", hasFinancialAccount: "Compte bancaire ou caisse disponible",
    hasTaxConfiguration: "Règles de taxes configurées", ledgerReady: "Comptabilisation prête", openReceivables: "Créances ouvertes", overdueReceivables: "Créances en retard",
    openPayables: "Dettes ouvertes", overduePayables: "Dettes en retard", unallocatedPayments: "Paiements non affectés", availableTreasury: "Trésorerie disponible",
    openCashSessions: "Caisses ouvertes", pendingReconciliations: "Rapprochements en attente", invoicesToPost: "Factures non comptabilisées", pendingApprovals: "Opérations à valider"
  },
  en: {
    hasFunctionalCurrency: "Functional currency configured", hasFiscalYear: "Active fiscal year", hasOpenPeriod: "Open period", hasChartOfAccounts: "Chart of accounts available",
    hasSalesJournal: "Sales journal configured", hasPurchaseJournal: "Purchase journal configured", hasFinancialAccount: "Bank or cash account available", hasTaxConfiguration: "Tax rules configured",
    ledgerReady: "Posting ready", openReceivables: "Open receivables", overdueReceivables: "Overdue receivables", openPayables: "Open payables", overduePayables: "Overdue payables",
    unallocatedPayments: "Unallocated payments", availableTreasury: "Available treasury", openCashSessions: "Open cash sessions", pendingReconciliations: "Pending reconciliations",
    invoicesToPost: "Invoices not posted", pendingApprovals: "Operations awaiting approval"
  }
};

const ENUM_LABELS: Record<FinanceLocale, Record<string, string>> = {
  fr: {
    WEIGHTED_AVERAGE: "Coût moyen pondéré", FIFO: "Premier entré, premier sorti", CASH: "Caisse", BANK: "Compte bancaire", MOBILE_MONEY: "Portefeuille électronique",
    CLEARING: "Compte de transit", INBOUND: "Encaissement", OUTBOUND: "Décaissement", CUSTOMER_PAYMENT: "Encaissement client", SUPPLIER_PAYMENT: "Paiement fournisseur",
    CUSTOMER_REFUND: "Remboursement client", SUPPLIER_REFUND: "Remboursement fournisseur", PAYROLL_PAYMENT: "Paiement de paie", EXPENSE_REIMBURSEMENT: "Remboursement de dépense",
    TAX_PAYMENT: "Paiement fiscal", REFUND: "Remboursement", TRANSFER: "Transfert", OTHER: "Autre", BANK_TRANSFER: "Virement bancaire", CARD: "Carte", CHEQUE: "Chèque", CREDIT: "Crédit",
    ASSET: "Actif", LIABILITY: "Passif", EQUITY: "Capitaux propres", REVENUE: "Produit", EXPENSE: "Charge", OTHER_INCOME: "Autre produit", OTHER_EXPENSE: "Autre charge",
    SALES: "Ventes", PURCHASES: "Achats", PAYROLL: "Paie", INVENTORY: "Stocks", ASSETS: "Immobilisations", TAX: "Fiscalité", OPENING: "Ouverture", ADJUSTMENT: "Ajustement", GENERAL: "Opérations générales",
    BALANCE_SHEET: "Bilan", INCOME_STATEMENT: "Compte de résultat", DEBIT: "Débit", CREDIT_BALANCE: "Crédit"
  },
  en: {
    WEIGHTED_AVERAGE: "Weighted average", FIFO: "First in, first out", CASH: "Cash", BANK: "Bank account", MOBILE_MONEY: "Electronic wallet", CLEARING: "Clearing account",
    INBOUND: "Receipt", OUTBOUND: "Disbursement", CUSTOMER_PAYMENT: "Customer receipt", SUPPLIER_PAYMENT: "Supplier payment", CUSTOMER_REFUND: "Customer refund", SUPPLIER_REFUND: "Supplier refund",
    PAYROLL_PAYMENT: "Payroll payment", EXPENSE_REIMBURSEMENT: "Expense reimbursement", TAX_PAYMENT: "Tax payment", REFUND: "Refund", TRANSFER: "Transfer", OTHER: "Other",
    BANK_TRANSFER: "Bank transfer", CARD: "Card", CHEQUE: "Cheque", CREDIT: "Credit", ASSET: "Asset", LIABILITY: "Liability", EQUITY: "Equity", REVENUE: "Revenue", EXPENSE: "Expense",
    OTHER_INCOME: "Other income", OTHER_EXPENSE: "Other expense", SALES: "Sales", PURCHASES: "Purchases", PAYROLL: "Payroll", INVENTORY: "Inventory", ASSETS: "Fixed assets", TAX: "Tax",
    OPENING: "Opening", ADJUSTMENT: "Adjustment", GENERAL: "General operations", BALANCE_SHEET: "Balance sheet", INCOME_STATEMENT: "Income statement", DEBIT: "Debit", CREDIT_BALANCE: "Credit"
  }
};

export const FINANCE_ERROR_MESSAGES: Record<FinanceLocale, Record<string, string>> = {
  fr: {
    PAYMENT_ALLOCATION_EXCEEDS_UNALLOCATED: "Le montant affecté dépasse la partie encore disponible de ce paiement.",
    FINANCE_PERIOD_CLOSED: "Cette période financière est fermée. Choisissez une période ouverte ou demandez une réouverture autorisée.",
    SELF_APPROVAL_FORBIDDEN: "Une autre personne autorisée doit approuver cette opération.",
    FINANCIAL_CLOSE_SELF_APPROVAL_FORBIDDEN: "Une autre personne autorisée doit approuver cette clôture.",
    FINANCIAL_CLOSE_SELF_CLOSE_FORBIDDEN: "Une autre personne autorisée doit finaliser cette clôture.",
    THREE_WAY_MATCH_VARIANCE_UNRESOLVED: "La facture présente encore des écarts avec la commande ou la réception.",
    POSTING_MAPPING_MISSING: "Un compte comptable requis n’est pas encore configuré pour cette opération.",
    ACCOUNT_MAPPING_NOT_FOUND: "Un compte comptable nécessaire manque dans la configuration de l’entreprise.",
    FINANCE_EXCHANGE_RATE_REQUIRED: "Aucun taux de change applicable n’est disponible pour cette date. Ajoutez un taux puis réessayez.",
    FINANCE_EXCHANGE_RATE_INVALID: "Le taux de change doit être supérieur à zéro.",
    FINANCE_EXCHANGE_RATE_PAIR_INVALID: "Choisissez deux devises différentes pour ce taux de change.",
    FINANCE_EXCHANGE_RATE_ACTIVE_VERSION_EXISTS: "Un taux actif existe déjà pour cette paire et cette date. Désactivez-le avant de publier une correction.",
    DUPLICATE_POSTING_ATTEMPT: "Cette opération a déjà été comptabilisée. Aucune écriture en double n’a été créée.",
    POSTING_BATCH_ALREADY_EXISTS: "Cette opération a déjà été traitée. L’écriture existante a été conservée.",
    JOURNAL_ENTRY_UNBALANCED: "Le total des débits doit être égal au total des crédits avant la comptabilisation.",
    REGULATORY_STATEMENT_PERIOD_INVALID: "La période choisie pour l’état financier n’est pas valide.",
    REGULATORY_STATEMENT_TYPE_NOT_SUPPORTED: "Cet état financier n’est pas disponible pour le plan comptable actif.",
    CHART_TEMPLATE_UPGRADE_REQUIRES_CONTROLLED_MIGRATION: "Cette nouvelle version nécessite une revue avant application. Consultez l’analyse d’impact puis validez la migration.",
    CHART_OF_ACCOUNTS_REVISION_CONFLICT: "Le plan comptable a été modifié entre-temps. Actualisez la page avant de recommencer.",
    ACCOUNTING_SETUP_INPUT_INVALID: "Vérifiez les informations de configuration comptable puis réessayez.",
    FINANCE_DUPLICATE: "Une donnée identique existe déjà dans cette entreprise."
  },
  en: {
    PAYMENT_ALLOCATION_EXCEEDS_UNALLOCATED: "The allocated amount exceeds the remaining available payment amount.",
    FINANCE_PERIOD_CLOSED: "This finance period is closed. Choose an open period or request an authorized reopening.",
    SELF_APPROVAL_FORBIDDEN: "Another authorized person must approve this operation.",
    FINANCIAL_CLOSE_SELF_APPROVAL_FORBIDDEN: "Another authorized person must approve this close.",
    FINANCIAL_CLOSE_SELF_CLOSE_FORBIDDEN: "Another authorized person must finalize this close.",
    THREE_WAY_MATCH_VARIANCE_UNRESOLVED: "The invoice still has variances against the purchase order or receipt.",
    POSTING_MAPPING_MISSING: "A required accounting account has not been configured for this operation yet.",
    ACCOUNT_MAPPING_NOT_FOUND: "A required accounting account is missing from the company configuration.",
    FINANCE_EXCHANGE_RATE_REQUIRED: "No applicable exchange rate is available for this date. Add a rate and try again.",
    FINANCE_EXCHANGE_RATE_INVALID: "The exchange rate must be greater than zero.",
    FINANCE_EXCHANGE_RATE_PAIR_INVALID: "Choose two different currencies for this exchange rate.",
    FINANCE_EXCHANGE_RATE_ACTIVE_VERSION_EXISTS: "An active rate already exists for this currency pair and date. Deactivate it before publishing a correction.",
    DUPLICATE_POSTING_ATTEMPT: "This operation has already been posted. No duplicate entry was created.",
    POSTING_BATCH_ALREADY_EXISTS: "This operation has already been processed. The existing entry was preserved.",
    JOURNAL_ENTRY_UNBALANCED: "Total debits must equal total credits before posting.",
    REGULATORY_STATEMENT_PERIOD_INVALID: "The selected financial statement period is invalid.",
    REGULATORY_STATEMENT_TYPE_NOT_SUPPORTED: "This financial statement is not available for the active chart of accounts.",
    CHART_TEMPLATE_UPGRADE_REQUIRES_CONTROLLED_MIGRATION: "This new version requires review before it can be applied. Review the impact analysis, then approve the migration.",
    CHART_OF_ACCOUNTS_REVISION_CONFLICT: "The chart of accounts changed in the meantime. Refresh the page before trying again.",
    ACCOUNTING_SETUP_INPUT_INVALID: "Review the accounting setup information and try again.",
    FINANCE_DUPLICATE: "An identical record already exists in this company."
  }
};

export function financeClientLocale(preferred?: FinanceLocale): FinanceLocale {
  if (preferred) return preferred;
  if (typeof document !== "undefined" && document.documentElement.lang.toLowerCase().startsWith("en")) return "en";
  return "fr";
}

export function financeStatusLabel(status: string, locale: FinanceLocale = "fr") {
  return STATUS_LABELS[locale][status] || (locale === "fr" ? "Statut à vérifier" : "Status to review");
}

export function financeMetricLabel(key: string, locale: FinanceLocale = "fr") {
  return METRIC_LABELS[locale][key] || (locale === "fr" ? "Indicateur financier" : "Finance metric");
}

export function financeEnumLabel(value: string, locale: FinanceLocale = "fr") {
  return ENUM_LABELS[locale][value] || (locale === "fr" ? "Valeur métier à vérifier" : "Business value to review");
}

export function financeStatusTone(status: string): StatusBadgeTone {
  if (/REJECTED|CANCELLED|VOID|FAILED|OVERDUE|DISPUTED|LOCKED|BLOCKED/i.test(status)) return "danger";
  if (/SUBMITTED|PENDING|IN_REVIEW|PARTIALLY|SOFT_CLOSED|CLOSING|UNALLOCATED|UNMATCHED/i.test(status)) return "warning";
  if (/APPROVED|ISSUED|POSTED|PAID|CONFIRMED|ALLOCATED|RECONCILED|VALIDATED|CLOSED|COMPLETED|EXECUTED|ACTIVE|IMPORTED|READY|PUBLISHED|MATCHED/i.test(status)) return "success";
  if (/OPEN|DRAFT|PREPARED|IN_PROGRESS|PLANNED|REOPENED/i.test(status)) return "info";
  return "neutral";
}

export function financeMoney(value: unknown, currencyCode = "USD", locale: FinanceLocale = "fr") {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric)) return locale === "fr" ? "Montant indisponible" : "Amount unavailable";
  try { return new Intl.NumberFormat(locale === "fr" ? "fr-FR" : "en-US", { style: "currency", currency: currencyCode, maximumFractionDigits: 2 }).format(numeric); }
  catch { return `${numeric.toFixed(2)} ${currencyCode}`; }
}

export function financeDate(value: unknown, locale: FinanceLocale = "fr") {
  if (!value) return locale === "fr" ? "Non précisée" : "Not specified";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return locale === "fr" ? "Date à vérifier" : "Date to review";
  return new Intl.DateTimeFormat(locale === "fr" ? "fr-FR" : "en-GB", { dateStyle: "medium" }).format(date);
}

function extractFinanceErrorCode(error: unknown): string | null {
  const candidates: string[] = [];
  if (error instanceof Error && error.message) candidates.push(error.message);
  if (typeof error === "string") candidates.push(error);
  if (error && typeof error === "object") {
    const value = error as { code?: unknown; error?: unknown; message?: unknown };
    for (const candidate of [value.code, value.error, value.message]) if (typeof candidate === "string") candidates.push(candidate);
  }
  for (const candidate of candidates) {
    const direct = candidate.trim();
    if (/^[A-Z][A-Z0-9_]+$/.test(direct)) return direct;
    const known = Object.keys(FINANCE_ERROR_MESSAGES.fr).find((code) => candidate.includes(code));
    if (known) return known;
    const token = candidate.match(/\b[A-Z][A-Z0-9_]{5,}\b/)?.[0];
    if (token) return token;
  }
  return null;
}

export function financeErrorMessage(error: unknown, locale?: FinanceLocale, fallback?: string) {
  const resolvedLocale = financeClientLocale(locale);
  const code = extractFinanceErrorCode(error);
  if (code && FINANCE_ERROR_MESSAGES[resolvedLocale][code]) return FINANCE_ERROR_MESSAGES[resolvedLocale][code];
  if (code?.includes("REVISION_CONFLICT") || code?.endsWith("_CONFLICT")) return resolvedLocale === "fr" ? "Cette donnée a changé entre-temps. Actualisez la page avant de réessayer." : "This record changed in the meantime. Refresh the page before trying again.";
  if (code?.includes("SELF_APPROVAL_FORBIDDEN")) return resolvedLocale === "fr" ? "Une autre personne autorisée doit valider cette opération." : "Another authorized person must validate this operation.";
  if (code?.includes("PERIOD_CLOSED") || code?.includes("PERIOD_LOCKED")) return resolvedLocale === "fr" ? "La période choisie est fermée. Utilisez une période ouverte ou demandez une réouverture autorisée." : "The selected period is closed. Use an open period or request an authorized reopening.";
  if (code?.includes("MAPPING") && (code.includes("MISSING") || code.includes("NOT_FOUND"))) return resolvedLocale === "fr" ? "La configuration comptable de cette opération est incomplète. Complétez les comptes associés puis réessayez." : "The accounting setup for this operation is incomplete. Complete the related accounts and try again.";
  if (code?.endsWith("_NOT_FOUND")) return resolvedLocale === "fr" ? "L’élément financier demandé est introuvable ou n’est plus disponible." : "The requested finance record could not be found or is no longer available.";
  if (code?.includes("NOT_POSTABLE") || code?.includes("NOT_ELIGIBLE")) return resolvedLocale === "fr" ? "Cette opération n’est pas encore dans un état permettant sa comptabilisation." : "This operation is not yet in a state that allows posting.";
  if (code?.includes("REQUIRED")) return resolvedLocale === "fr" ? "Une information ou une configuration requise manque pour terminer cette opération." : "Required information or configuration is missing to complete this operation.";
  if (code?.includes("FORBIDDEN") || code === "FORBIDDEN" || code === "UNAUTHORIZED") return resolvedLocale === "fr" ? "Vous ne disposez pas de l’autorisation nécessaire pour cette action." : "You do not have the permission required for this action.";
  if (code?.includes("INVALID") || code === "INVALID_PAYLOAD") return resolvedLocale === "fr" ? "Certaines informations saisies sont à corriger avant de continuer." : "Some entered information must be corrected before continuing.";
  if (fallback) return fallback;
  return resolvedLocale === "fr" ? "L’opération financière n’a pas pu être terminée. Vérifiez les informations puis réessayez." : "The finance operation could not be completed. Review the information and try again.";
}

export function safeFinanceError(error: unknown, fallback?: string, locale?: FinanceLocale) {
  return financeErrorMessage(error, locale, fallback);
}
