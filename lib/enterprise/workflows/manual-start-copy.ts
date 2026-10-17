/**
 * Client-only, domain-owned FR/EN copy for the workflow manual starter.
 * The server is authoritative for source type, permissions and navigation URL.
 */
const entityLabels: Record<string, readonly [string, string]> = {
  EnterpriseTask: ["Tâche", "Task"],
  EnterpriseRequest: ["Demande", "Request"],
  EnterpriseMeeting: ["Réunion", "Meeting"],
  EnterprisePurchase: ["Achat", "Purchase"],
  EnterpriseBudget: ["Budget", "Budget"],
  EnterpriseExpense: ["Dépense", "Expense"],
  EnterpriseReport: ["Rapport", "Report"],
  EnterpriseSalesInvoice: ["Facture client", "Sales invoice"],
  EnterpriseSalesCreditNote: ["Avoir client", "Sales credit note"],
  EnterpriseSupplierInvoice: ["Facture fournisseur", "Supplier invoice"],
  EnterpriseSupplierCreditNote: ["Avoir fournisseur", "Supplier credit note"],
  EnterprisePayment: ["Paiement fournisseur", "Supplier payment"],
  EnterpriseCashSession: ["Clôture de caisse", "Cash closure"],
  EnterpriseJournalEntry: ["Écriture comptable", "Journal entry"],
  EnterpriseFiscalPeriod: ["Période comptable", "Fiscal period"],
  EnterpriseFinancialClose: ["Clôture financière", "Financial close"],
  EnterpriseReconciliationSession: ["Rapprochement bancaire", "Reconciliation"],
  EnterpriseAssetDepreciationSchedule: ["Amortissement des actifs", "Asset depreciation"],
};

const moduleLinks: Record<string, readonly [string, string]> = {
  EnterpriseBudget: ["Ouvrir Budgets et dépenses", "Open Budgets and Expenses"],
  EnterpriseExpense: ["Ouvrir Budgets et dépenses pour créer une dépense", "Open Budgets and Expenses to create an expense"],
  EnterpriseSupplierInvoice: ["Ouvrir Factures fournisseurs", "Open Supplier Invoices"],
  EnterprisePayment: ["Ouvrir Paiements", "Open Payments"],
  EnterpriseCashSession: ["Ouvrir Caisse", "Open Cash"],
  EnterpriseJournalEntry: ["Ouvrir Comptabilité", "Open Accounting"],
  EnterpriseFinancialClose: ["Ouvrir Clôture financière", "Open Financial Close"],
};

export type WorkflowManualEmptyReason = "NO_RECORDS" | "NO_ELIGIBLE_RECORDS" | "NO_VISIBLE_RECORDS" | null;

export function workflowManualEntityLabel(entityType: string | null | undefined, en: boolean) {
  if (!entityType) return en ? "Business record" : "Objet métier";
  return entityLabels[entityType]?.[en ? 1 : 0] || (en ? "Business record" : "Objet métier");
}

export function workflowManualModuleLinkLabel(entityType: string | null | undefined, en: boolean) {
  return moduleLinks[entityType || ""]?.[en ? 1 : 0] || (en ? "Open the source module" : "Ouvrir le module métier");
}

export function workflowManualEmptyMessage(
  entityType: string | null | undefined,
  reason: WorkflowManualEmptyReason,
  en: boolean,
) {
  if (reason === "NO_VISIBLE_RECORDS") {
    return en
      ? "No eligible record is visible to your account. Check your role, source module access, or ask a supervisor."
      : "Aucun objet admissible n’est accessible avec vos droits. Vérifiez votre rôle, l’accès au module métier ou contactez un responsable.";
  }
  if (reason === "NO_RECORDS") {
    return en
      ? "No matching business record has been created in this company. Open the source module to prepare one."
      : "Aucun objet métier correspondant n’a été créé dans cette entreprise. Ouvrez le module concerné pour en préparer un.";
  }
  if (reason === "NO_ELIGIBLE_RECORDS") {
    if (entityType === "EnterpriseCashSession") {
      return en
        ? "There is no cash closure ready for this workflow. Open Cash, then submit a cash closure for independent review."
        : "Aucune clôture de caisse n’est prête pour ce workflow. Ouvrez Caisse, puis soumettez une clôture à la validation indépendante.";
    }
    return en
      ? "Business records exist, but none is in a status eligible for this workflow. Prepare or submit the record in its ERP module."
      : "Des objets métier existent, mais aucun n’est dans un état admissible pour ce workflow. Préparez ou soumettez l’objet dans son module ERP.";
  }
  return en ? "No eligible record is available for this workflow." : "Aucun objet métier admissible n’est disponible pour ce workflow.";
}

const manualStatusLabels: Record<string, readonly [string, string]> = {
  DRAFT: ["Brouillon", "Draft"],
  PREPARING: ["En préparation", "Preparing"],
  CORRECTION_REQUESTED: ["Correction demandée", "Correction requested"],
  SUBMITTED: ["Soumis", "Submitted"],
  PENDING: ["En attente", "Pending"],
  PENDING_REVIEW: ["En attente de revue", "Awaiting review"],
  PENDING_APPROVAL: ["En attente d’approbation", "Awaiting approval"],
  PENDING_VALIDATION: ["En attente de validation", "Awaiting validation"],
  APPROVED: ["Approuvé", "Approved"],
  CLOSED: ["Clôturé", "Closed"],
  REJECTED: ["Rejeté", "Rejected"],
  OPEN: ["Ouvert", "Open"],
};

export function workflowManualStatusLabel(status: string | null | undefined, en: boolean) {
  return manualStatusLabels[status || ""]?.[en ? 1 : 0] || (en ? "Current status" : "Statut actuel");
}
