"use client";

import type { StatusBadgeTone } from "@/components/workspace/status-badge";

export type FinanceLocale = "fr" | "en";

const STATUS_LABELS: Record<FinanceLocale, Record<string, string>> = {
  fr: {
    DRAFT: "Brouillon",
    SUBMITTED: "Soumis",
    IN_REVIEW: "En revue",
    PENDING_REVIEW: "En attente de revue",
    REVIEWED: "Revu",
    PENDING_APPROVAL: "En attente de validation",
    APPROVED: "Approuvé",
    ISSUED: "Émis",
    POSTED: "Comptabilisé",
    PARTIALLY_PAID: "Partiellement payé",
    PAID: "Payé",
    OVERDUE: "En retard",
    DISPUTED: "En litige",
    WRITTEN_OFF: "Passé en irrécouvrable",
    CANCELLED: "Annulé",
    VOID: "Invalidé",
    VOIDED: "Invalidé",
    CREDIT_NOTE: "Avoir",
    REJECTED: "Refusé",
    RETURNED: "Renvoyé pour correction",
    CONFIRMED: "Confirmé",
    PARTIALLY_ALLOCATED: "Partiellement affecté",
    ALLOCATED: "Affecté",
    UNALLOCATED: "Non affecté",
    RECONCILED: "Rapproché",
    UNRECONCILED: "Non rapproché",
    REVERSED: "Contrepassé",
    ACTIVE: "Actif",
    INACTIVE: "Inactif",
    SUSPENDED: "Suspendu",
    OPEN: "Ouverte",
    CLOSING: "Clôture en préparation",
    PENDING_VALIDATION: "En attente de validation",
    VALIDATED: "Validée",
    SOFT_CLOSED: "Clôture provisoire",
    CLOSED: "Fermé",
    LOCKED: "Verrouillé",
    PREPARED: "Préparé",
    IN_PROGRESS: "En cours",
    COMPLETED: "Terminé",
    EXECUTED: "Exécuté",
    FAILED: "Échec",
    IMPORTED: "Importé"
  },
  en: {
    DRAFT: "Draft",
    SUBMITTED: "Submitted",
    IN_REVIEW: "In review",
    PENDING_REVIEW: "Pending review",
    REVIEWED: "Reviewed",
    PENDING_APPROVAL: "Pending approval",
    APPROVED: "Approved",
    ISSUED: "Issued",
    POSTED: "Posted",
    PARTIALLY_PAID: "Partially paid",
    PAID: "Paid",
    OVERDUE: "Overdue",
    DISPUTED: "Disputed",
    WRITTEN_OFF: "Written off",
    CANCELLED: "Cancelled",
    VOID: "Voided",
    VOIDED: "Voided",
    CREDIT_NOTE: "Credit note",
    REJECTED: "Rejected",
    RETURNED: "Returned for correction",
    CONFIRMED: "Confirmed",
    PARTIALLY_ALLOCATED: "Partially allocated",
    ALLOCATED: "Allocated",
    UNALLOCATED: "Unallocated",
    RECONCILED: "Reconciled",
    UNRECONCILED: "Unreconciled",
    REVERSED: "Reversed",
    ACTIVE: "Active",
    INACTIVE: "Inactive",
    SUSPENDED: "Suspended",
    OPEN: "Open",
    CLOSING: "Closing",
    PENDING_VALIDATION: "Pending validation",
    VALIDATED: "Validated",
    SOFT_CLOSED: "Soft closed",
    CLOSED: "Closed",
    LOCKED: "Locked",
    PREPARED: "Prepared",
    IN_PROGRESS: "In progress",
    COMPLETED: "Completed",
    EXECUTED: "Executed",
    FAILED: "Failed",
    IMPORTED: "Imported"
  }
};

const METRIC_LABELS: Record<FinanceLocale, Record<string, string>> = {
  fr: {
    hasFunctionalCurrency: "Devise configurée",
    hasFiscalYear: "Exercice actif",
    hasOpenPeriod: "Période ouverte",
    hasChartOfAccounts: "Plan comptable disponible",
    hasSalesJournal: "Journal des ventes configuré",
    hasPurchaseJournal: "Journal des achats configuré",
    hasFinancialAccount: "Compte bancaire ou caisse disponible",
    hasTaxConfiguration: "Règles de taxes configurées",
    ledgerReady: "Comptabilisation prête",
    openReceivables: "Créances ouvertes",
    overdueReceivables: "Créances en retard",
    openPayables: "Dettes ouvertes",
    overduePayables: "Dettes en retard",
    unallocatedPayments: "Paiements non affectés",
    availableTreasury: "Trésorerie disponible",
    openCashSessions: "Caisses ouvertes",
    pendingReconciliations: "Rapprochements en attente",
    invoicesToPost: "Factures non comptabilisées",
    pendingApprovals: "Opérations à valider"
  },
  en: {
    hasFunctionalCurrency: "Functional currency configured",
    hasFiscalYear: "Active fiscal year",
    hasOpenPeriod: "Open period",
    hasChartOfAccounts: "Chart of accounts available",
    hasSalesJournal: "Sales journal configured",
    hasPurchaseJournal: "Purchase journal configured",
    hasFinancialAccount: "Bank or cash account available",
    hasTaxConfiguration: "Tax rules configured",
    ledgerReady: "Posting ready",
    openReceivables: "Open receivables",
    overdueReceivables: "Overdue receivables",
    openPayables: "Open payables",
    overduePayables: "Overdue payables",
    unallocatedPayments: "Unallocated payments",
    availableTreasury: "Available treasury",
    openCashSessions: "Open cash sessions",
    pendingReconciliations: "Pending reconciliations",
    invoicesToPost: "Invoices not posted",
    pendingApprovals: "Operations awaiting approval"
  }
};

const ENUM_LABELS: Record<FinanceLocale, Record<string, string>> = {
  fr: {
    WEIGHTED_AVERAGE: "Coût moyen pondéré",
    FIFO: "Premier entré, premier sorti",
    CASH: "Caisse",
    BANK: "Compte bancaire",
    MOBILE_MONEY: "Portefeuille électronique",
    CLEARING: "Compte de transit",
    INBOUND: "Encaissement",
    OUTBOUND: "Décaissement",
    CUSTOMER_PAYMENT: "Encaissement client",
    SUPPLIER_PAYMENT: "Paiement fournisseur",
    CUSTOMER_REFUND: "Remboursement client",
    SUPPLIER_REFUND: "Remboursement fournisseur",
    PAYROLL_PAYMENT: "Paiement de paie",
    EXPENSE_REIMBURSEMENT: "Remboursement de dépense",
    TAX_PAYMENT: "Paiement fiscal",
    REFUND: "Remboursement",
    OTHER: "Autre paiement",
    BANK_TRANSFER: "Virement bancaire",
    CARD: "Carte",
    CHEQUE: "Chèque",
    CREDIT: "Crédit"
  },
  en: {
    WEIGHTED_AVERAGE: "Weighted average",
    FIFO: "First in, first out",
    CASH: "Cash",
    BANK: "Bank account",
    MOBILE_MONEY: "Electronic wallet",
    CLEARING: "Clearing account",
    INBOUND: "Receipt",
    OUTBOUND: "Disbursement",
    CUSTOMER_PAYMENT: "Customer receipt",
    SUPPLIER_PAYMENT: "Supplier payment",
    CUSTOMER_REFUND: "Customer refund",
    SUPPLIER_REFUND: "Supplier refund",
    PAYROLL_PAYMENT: "Payroll payment",
    EXPENSE_REIMBURSEMENT: "Expense reimbursement",
    TAX_PAYMENT: "Tax payment",
    REFUND: "Refund",
    OTHER: "Other payment",
    BANK_TRANSFER: "Bank transfer",
    CARD: "Card",
    CHEQUE: "Cheque",
    CREDIT: "Credit"
  }
};

export const FINANCE_ERROR_MESSAGES = {
  fr: {
    PAYMENT_ALLOCATION_EXCEEDS_UNALLOCATED: "Le montant affecté dépasse la partie encore disponible de ce paiement.",
    FINANCE_PERIOD_CLOSED: "Cette période financière est fermée. Aucune nouvelle opération ne peut y être enregistrée.",
    SELF_APPROVAL_FORBIDDEN: "Une autre personne autorisée doit approuver cette opération.",
    THREE_WAY_MATCH_VARIANCE_UNRESOLVED: "La facture présente encore des écarts avec la commande ou la réception."
  },
  en: {
    PAYMENT_ALLOCATION_EXCEEDS_UNALLOCATED: "The allocated amount exceeds the remaining available payment amount.",
    FINANCE_PERIOD_CLOSED: "This finance period is closed. No new operation can be recorded in it.",
    SELF_APPROVAL_FORBIDDEN: "Another authorized person must approve this operation.",
    THREE_WAY_MATCH_VARIANCE_UNRESOLVED: "The invoice still has variances against the purchase order or receipt."
  }
} as const;

export function financeStatusLabel(status: string, locale: FinanceLocale = "fr") {
  return STATUS_LABELS[locale][status] || (locale === "fr" ? "Statut à vérifier" : "Status to review");
}

export function financeMetricLabel(key: string, locale: FinanceLocale = "fr") {
  return METRIC_LABELS[locale][key] || (locale === "fr" ? "Indicateur financier" : "Finance metric");
}

export function financeEnumLabel(value: string, locale: FinanceLocale = "fr") {
  return ENUM_LABELS[locale][value] || value;
}

export function financeStatusTone(status: string): StatusBadgeTone {
  if (/REJECTED|CANCELLED|VOID|FAILED|OVERDUE|DISPUTED|LOCKED/i.test(status)) return "danger";
  if (/SUBMITTED|PENDING|IN_REVIEW|PARTIALLY|SOFT_CLOSED|CLOSING|UNALLOCATED/i.test(status)) return "warning";
  if (/APPROVED|ISSUED|POSTED|PAID|CONFIRMED|ALLOCATED|RECONCILED|VALIDATED|CLOSED|COMPLETED|EXECUTED|ACTIVE|IMPORTED/i.test(status)) return "success";
  if (/OPEN|DRAFT|PREPARED|IN_PROGRESS/i.test(status)) return "info";
  return "neutral";
}

export function financeMoney(value: unknown, currencyCode = "USD", locale: FinanceLocale = "fr") {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric)) return locale === "fr" ? "Montant indisponible" : "Amount unavailable";
  try {
    return new Intl.NumberFormat(locale === "fr" ? "fr-FR" : "en-US", {
      style: "currency",
      currency: currencyCode,
      maximumFractionDigits: 2
    }).format(numeric);
  } catch {
    return `${numeric.toFixed(2)} ${currencyCode}`;
  }
}

export function financeDate(value: unknown, locale: FinanceLocale = "fr") {
  if (!value) return locale === "fr" ? "Non précisée" : "Not specified";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return locale === "fr" ? "Date invalide" : "Invalid date";
  return new Intl.DateTimeFormat(locale === "fr" ? "fr-FR" : "en-GB", { dateStyle: "medium" }).format(date);
}

export function safeFinanceError(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}
