import type { WorkflowEntityType } from "@/lib/enterprise/workflows/constants";
import type { WorkflowVersionInput } from "@/lib/enterprise/workflows/validators";

export type EnterpriseWorkflowTemplate = {
  code: string;
  nameFr: string;
  nameEn: string;
  descriptionFr: string;
  descriptionEn: string;
  triggerEntityType: WorkflowEntityType;
  triggerEventType: string;
  version: WorkflowVersionInput;
};

const requestTemplate: EnterpriseWorkflowTemplate = {
  code: "REQUEST_MANAGER_APPROVAL",
  nameFr: "Demande interne avec validation manager",
  nameEn: "Internal request with manager approval",
  descriptionFr: "Valide une demande, crée une tâche après approbation et informe le demandeur.",
  descriptionEn: "Approves a request, creates a task after approval and informs the requester.",
  triggerEntityType: "EnterpriseRequest",
  triggerEventType: "ENTERPRISE_REQUEST_SUBMITTED",
  version: {
    steps: [
      { code: "START", name: "Déclencheur", stepType: "START", position: 0, configuration: {} },
      { code: "MANAGER_APPROVAL", name: "Validation manager", stepType: "CREATE_APPROVAL", position: 1, configuration: { assignment: { strategy: "DEPARTMENT_MANAGER" }, titleTemplate: "Valider {{entity.reference}}" } },
      { code: "CREATE_TASK", name: "Créer la tâche", stepType: "CREATE_TASK", position: 2, configuration: { titleTemplate: "Traiter {{entity.reference}} — {{entity.title}}", descriptionTemplate: "Tâche générée par {{workflow.name}}.", taskType: "TASK", priority: "NORMAL", assignment: { strategy: "PREVIOUS_STEP_ACTOR" } } },
      { code: "NOTIFY_APPROVED", name: "Informer le demandeur", stepType: "NOTIFICATION", position: 3, configuration: { recipient: { strategy: "ENTITY_REQUESTER" }, titleTemplate: "Demande approuvée", bodyTemplate: "Votre demande {{entity.reference}} a été approuvée.", targetUrl: "/enterprise-modules/INTERNAL_REQUESTS" } },
      { code: "NOTIFY_REJECTED", name: "Informer du rejet", stepType: "NOTIFICATION", position: 4, configuration: { recipient: { strategy: "ENTITY_REQUESTER" }, titleTemplate: "Demande rejetée", bodyTemplate: "Votre demande {{entity.reference}} a été rejetée.", targetUrl: "/enterprise-modules/INTERNAL_REQUESTS" } },
      { code: "END_SUCCESS", name: "Terminé", stepType: "END", position: 5, configuration: { outcome: "COMPLETED" } },
      { code: "END_REJECTED", name: "Terminé sur rejet", stepType: "END", position: 6, configuration: { outcome: "REJECTED" } },
    ],
    transitions: [
      { fromStepCode: "START", toStepCode: "MANAGER_APPROVAL", outcome: "DEFAULT", priority: 0 },
      { fromStepCode: "MANAGER_APPROVAL", toStepCode: "CREATE_TASK", outcome: "APPROVED", priority: 0 },
      { fromStepCode: "MANAGER_APPROVAL", toStepCode: "NOTIFY_REJECTED", outcome: "REJECTED", priority: 0 },
      { fromStepCode: "MANAGER_APPROVAL", toStepCode: "NOTIFY_REJECTED", outcome: "CANCELLED", priority: 1 },
      { fromStepCode: "CREATE_TASK", toStepCode: "NOTIFY_APPROVED", outcome: "DEFAULT", priority: 0 },
      { fromStepCode: "NOTIFY_APPROVED", toStepCode: "END_SUCCESS", outcome: "DEFAULT", priority: 0 },
      { fromStepCode: "NOTIFY_REJECTED", toStepCode: "END_REJECTED", outcome: "DEFAULT", priority: 0 },
    ],
  },
};

function approvalTemplate(input: { code: string; nameFr: string; nameEn: string; descriptionFr: string; descriptionEn: string; entityType: "EnterprisePurchase" | "EnterpriseBudget" | "EnterpriseExpense"; eventType: string; targetUrl: string }): EnterpriseWorkflowTemplate {
  return {
    code: input.code,
    nameFr: input.nameFr,
    nameEn: input.nameEn,
    descriptionFr: input.descriptionFr,
    descriptionEn: input.descriptionEn,
    triggerEntityType: input.entityType,
    triggerEventType: input.eventType,
    version: {
      steps: [
        { code: "START", name: "Déclencheur", stepType: "START", position: 0, configuration: {} },
        { code: "APPROVAL", name: "Validation", stepType: "CREATE_APPROVAL", position: 1, configuration: { assignment: { strategy: "DEPARTMENT_MANAGER" }, titleTemplate: "Valider {{entity.reference}}" } },
        { code: "NOTIFY_APPROVED", name: "Notifier l’approbation", stepType: "NOTIFICATION", position: 2, configuration: { recipient: { strategy: "ENTITY_CREATOR" }, titleTemplate: "Validation approuvée", bodyTemplate: "{{entity.reference}} a été approuvé.", targetUrl: input.targetUrl } },
        { code: "NOTIFY_REJECTED", name: "Notifier le rejet", stepType: "NOTIFICATION", position: 3, configuration: { recipient: { strategy: "ENTITY_CREATOR" }, titleTemplate: "Validation rejetée", bodyTemplate: "{{entity.reference}} a été rejeté.", targetUrl: input.targetUrl } },
        { code: "END_SUCCESS", name: "Terminé", stepType: "END", position: 4, configuration: { outcome: "COMPLETED" } },
        { code: "END_REJECTED", name: "Terminé sur rejet", stepType: "END", position: 5, configuration: { outcome: "REJECTED" } },
      ],
      transitions: [
        { fromStepCode: "START", toStepCode: "APPROVAL", outcome: "DEFAULT", priority: 0 },
        { fromStepCode: "APPROVAL", toStepCode: "NOTIFY_APPROVED", outcome: "APPROVED", priority: 0 },
        { fromStepCode: "APPROVAL", toStepCode: "NOTIFY_REJECTED", outcome: "REJECTED", priority: 0 },
        { fromStepCode: "APPROVAL", toStepCode: "NOTIFY_REJECTED", outcome: "CANCELLED", priority: 1 },
        { fromStepCode: "NOTIFY_APPROVED", toStepCode: "END_SUCCESS", outcome: "DEFAULT", priority: 0 },
        { fromStepCode: "NOTIFY_REJECTED", toStepCode: "END_REJECTED", outcome: "DEFAULT", priority: 0 },
      ],
    },
  };
}

/**
 * Financial templates follow pre-existing approvals from dedicated ERP
 * services. They DO NOT create an approval or automatically execute a financial
 * posting, confirmation or closing. Those require the designated human actor.
 */
function canonicalFinanceTemplate(input: {
  code: string;
  nameFr: string;
  nameEn: string;
  descriptionFr: string;
  descriptionEn: string;
  entityType: WorkflowEntityType;
  eventType: string;
  approvalTargets: Array<{ code: string; name: string; target: "EnterpriseSupplierInvoiceReview" | "EnterpriseSupplierInvoiceApproval" | "EnterprisePayment" | "EnterpriseCashSession" | "EnterpriseJournalEntry" | "EnterpriseFinancialClose" }>;
  targetUrl: string;
}): EnterpriseWorkflowTemplate {
  const steps: WorkflowVersionInput["steps"] = [
    { code: "START", name: "Déclencheur", stepType: "START", position: 0, configuration: {} },
    ...input.approvalTargets.map((step, index) => ({
      code: step.code, name: step.name, stepType: "CREATE_APPROVAL" as const, position: index + 1,
      configuration: {
        assignment: { strategy: "DEPARTMENT_MANAGER" as const },
        canonicalApprovalTarget: step.target,
        titleTemplate: "Validation officielle de {{entity.reference}}",
      },
    })),
    { code: "NOTIFY_APPROVED", name: "Notifier la décision", stepType: "NOTIFICATION", position: input.approvalTargets.length + 1,
      configuration: { recipient: { strategy: "ENTITY_CREATOR" }, titleTemplate: "Validation financière terminée",
        bodyTemplate: "{{entity.reference}} est approuvé. Les actions comptables suivantes restent à effectuer dans le module ERP par un utilisateur habilité.",
        targetUrl: input.targetUrl } },
    { code: "NOTIFY_REJECTED", name: "Notifier le rejet", stepType: "NOTIFICATION", position: input.approvalTargets.length + 2,
      configuration: { recipient: { strategy: "ENTITY_CREATOR" }, titleTemplate: "Validation financière rejetée",
        bodyTemplate: "{{entity.reference}} a été rejeté. Consultez son module ERP.", targetUrl: input.targetUrl } },
    { code: "END_SUCCESS", name: "Fin approbation", stepType: "END", position: input.approvalTargets.length + 3,
      configuration: { outcome: "COMPLETED" } },
    { code: "END_REJECTED", name: "Fin sur rejet", stepType: "END", position: input.approvalTargets.length + 4,
      configuration: { outcome: "REJECTED" } },
  ];
  const transitions: WorkflowVersionInput["transitions"] = [
    { fromStepCode: "START", toStepCode: input.approvalTargets[0].code, outcome: "DEFAULT", priority: 0 },
  ];
  for (let i = 0; i < input.approvalTargets.length; i++) {
    const from = input.approvalTargets[i].code;
    const to = input.approvalTargets[i + 1]?.code || "NOTIFY_APPROVED";
    transitions.push(
      { fromStepCode: from, toStepCode: to, outcome: "APPROVED", priority: 0 },
      { fromStepCode: from, toStepCode: "NOTIFY_REJECTED", outcome: "REJECTED", priority: 0 },
      { fromStepCode: from, toStepCode: "NOTIFY_REJECTED", outcome: "CANCELLED", priority: 1 },
    );
  }
  transitions.push(
    { fromStepCode: "NOTIFY_APPROVED", toStepCode: "END_SUCCESS", outcome: "DEFAULT", priority: 0 },
    { fromStepCode: "NOTIFY_REJECTED", toStepCode: "END_REJECTED", outcome: "DEFAULT", priority: 0 },
  );
  return {
    code: input.code, nameFr: input.nameFr, nameEn: input.nameEn,
    descriptionFr: input.descriptionFr, descriptionEn: input.descriptionEn,
    triggerEntityType: input.entityType, triggerEventType: input.eventType,
    version: {
      steps, transitions, configuration: { templateStatus: "DRAFT", separationOfDutiesRequired: true },
    },
  };
}

const financeTemplates: EnterpriseWorkflowTemplate[] = [
  canonicalFinanceTemplate({
    code: "SUPPLIER_INVOICE_REVIEW_APPROVAL_POSTING",
    nameFr: "Facture fournisseur — revue et approbation (comptabilisation dans l’ERP)",
    nameEn: "Supplier invoice — review and approval (posting in ERP)",
    descriptionFr: "Suit deux validations humaines distinctes. La comptabilisation est effectuée dans le module Fournisseurs par son service métier, pas par ce workflow.",
    descriptionEn: "Tracks separate human review and approval. Posting remains a dedicated supplier accounting action.",
    entityType: "EnterpriseSupplierInvoice", eventType: "SUPPLIER_INVOICE_SUBMIT",
    approvalTargets: [
      { code: "REVIEW", name: "Revue fournisseur", target: "EnterpriseSupplierInvoiceReview" },
      { code: "APPROVAL", name: "Validation indépendante", target: "EnterpriseSupplierInvoiceApproval" },
    ], targetUrl: "/enterprise-modules/FINANCE_PAYABLES",
  }),
  canonicalFinanceTemplate({
    code: "SUPPLIER_PAYMENT_APPROVAL_CONFIRMATION",
    nameFr: "Paiement fournisseur — approbation (confirmation dans l’ERP)",
    nameEn: "Supplier payment — approval (confirmation in ERP)",
    descriptionFr: "Suit la validation désignée. La confirmation du paiement exige l’action distincte d’un utilisateur autorisé dans Paiements.",
    descriptionEn: "Tracks designated payment approval. Confirmation requires a separate authorized finance actor.",
    entityType: "EnterprisePayment", eventType: "PAYMENT_SUBMIT",
    approvalTargets: [{ code: "APPROVAL", name: "Valider le paiement", target: "EnterprisePayment" }],
    targetUrl: "/enterprise-modules/FINANCE_PAYMENTS",
  }),
  canonicalFinanceTemplate({
    code: "CASH_SESSION_INDEPENDENT_CLOSE",
    nameFr: "Clôture de caisse — validation indépendante",
    nameEn: "Cash close — independent human validation",
    descriptionFr: "Suit la validation du gérant différent du caissier. La clôture effective reste dans le service Caisse.",
    descriptionEn: "Tracks independent manager approval. Actual cash closing is performed by the cash service.",
    entityType: "EnterpriseCashSession", eventType: "CASH_SESSION_SUBMITTED",
    approvalTargets: [{ code: "APPROVAL", name: "Valider la clôture", target: "EnterpriseCashSession" }],
    targetUrl: "/enterprise-modules/FINANCE_CASH",
  }),
  canonicalFinanceTemplate({
    code: "MANUAL_JOURNAL_APPROVAL_POSTING",
    nameFr: "Écriture manuelle — approbation (comptabilisation dans l’ERP)",
    nameEn: "Manual journal — approval (posting in ERP)",
    descriptionFr: "Suit la validation comptable humaine. Le journal est ensuite comptabilisé dans Comptabilité par son service canonique.",
    descriptionEn: "Tracks independent human journal approval. Posting remains a separate authorized accounting action.",
    entityType: "EnterpriseJournalEntry", eventType: "JOURNAL_ENTRY_SUBMIT",
    approvalTargets: [{ code: "APPROVAL", name: "Approuver l’écriture", target: "EnterpriseJournalEntry" }],
    targetUrl: "/enterprise-modules/FINANCE_ACCOUNTING",
  }),
  canonicalFinanceTemplate({
    code: "FISCAL_PERIOD_CLOSE_REVIEW",
    nameFr: "Clôture de période — revue de la clôture financière",
    nameEn: "Period close — financial close review",
    descriptionFr: "Suit la validation du dossier de clôture financière, et non de la période. La fermeture définitive est une opération ERP distincte.",
    descriptionEn: "Tracks the actual financial-close record approval, not the fiscal period. Final closing remains a separate ERP action.",
    entityType: "EnterpriseFinancialClose", eventType: "FINANCIAL_CLOSE_SUBMITTED",
    approvalTargets: [{ code: "APPROVAL", name: "Approuver la clôture", target: "EnterpriseFinancialClose" }],
    targetUrl: "/enterprise-modules/FINANCE_CLOSE",
  }),
];

export const ENTERPRISE_WORKFLOW_TEMPLATES: readonly EnterpriseWorkflowTemplate[] = [
  requestTemplate,
  approvalTemplate({ code: "PURCHASE_APPROVAL", nameFr: "Validation d’achat", nameEn: "Purchase approval", descriptionFr: "Validation séquentielle d’un achat et notification de l’acheteur.", descriptionEn: "Sequential purchase approval and buyer notification.", entityType: "EnterprisePurchase", eventType: "ENTERPRISE_PURCHASE_SUBMITTED", targetUrl: "/enterprise-modules/SUPPLIERS_PURCHASES" }),
  approvalTemplate({ code: "BUDGET_APPROVAL", nameFr: "Validation de budget", nameEn: "Budget approval", descriptionFr: "Validation d’un budget et notification de son créateur.", descriptionEn: "Budget approval and creator notification.", entityType: "EnterpriseBudget", eventType: "ENTERPRISE_BUDGET_SUBMITTED", targetUrl: "/enterprise-modules/FINANCE_BUDGETS" }),
  approvalTemplate({ code: "EXPENSE_APPROVAL", nameFr: "Validation de dépense", nameEn: "Expense approval", descriptionFr: "Validation d’une dépense et notification du demandeur.", descriptionEn: "Expense approval and requester notification.", entityType: "EnterpriseExpense", eventType: "ENTERPRISE_EXPENSE_SUBMITTED", targetUrl: "/enterprise-modules/FINANCE_BUDGETS" }),
  ...financeTemplates,
];

export function getEnterpriseWorkflowTemplate(code: string) {
  return ENTERPRISE_WORKFLOW_TEMPLATES.find((template) => template.code === code) || null;
}
