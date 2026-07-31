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

function financeActionTemplate(input: {
  code: string;
  nameFr: string;
  nameEn: string;
  descriptionFr: string;
  descriptionEn: string;
  entityType: WorkflowEntityType;
  eventType: string;
  actions: Array<{ code: string; name: string; action: string }>;
  targetUrl: string;
}): EnterpriseWorkflowTemplate {
  const actionSteps = input.actions.map((item, index) => ({
    code: item.code,
    name: item.name,
    stepType: "DOMAIN_ACTION" as const,
    position: index + 2,
    configuration: { action: item.action, commentTemplate: "Action exécutée par {{workflow.name}} sur {{entity.reference}}." },
  }));
  const notifyPosition = actionSteps.length + 2;
  const rejectPosition = notifyPosition + 1;
  const successPosition = rejectPosition + 1;
  const rejectedPosition = successPosition + 1;
  const firstAction = actionSteps[0]?.code || "NOTIFY_APPROVED";
  const transitions: WorkflowVersionInput["transitions"] = [
    { fromStepCode: "START", toStepCode: "APPROVAL", outcome: "DEFAULT", priority: 0 },
    { fromStepCode: "APPROVAL", toStepCode: firstAction, outcome: "APPROVED", priority: 0 },
    { fromStepCode: "APPROVAL", toStepCode: "NOTIFY_REJECTED", outcome: "REJECTED", priority: 0 },
    { fromStepCode: "APPROVAL", toStepCode: "NOTIFY_REJECTED", outcome: "CANCELLED", priority: 1 },
  ];
  for (let index = 0; index < actionSteps.length; index += 1) {
    transitions.push({
      fromStepCode: actionSteps[index].code,
      toStepCode: actionSteps[index + 1]?.code || "NOTIFY_APPROVED",
      outcome: "DEFAULT",
      priority: 0,
    });
  }
  transitions.push(
    { fromStepCode: "NOTIFY_APPROVED", toStepCode: "END_SUCCESS", outcome: "DEFAULT", priority: 0 },
    { fromStepCode: "NOTIFY_REJECTED", toStepCode: "END_REJECTED", outcome: "DEFAULT", priority: 0 },
  );
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
        { code: "APPROVAL", name: "Validation financière indépendante", stepType: "CREATE_APPROVAL", position: 1, configuration: { assignment: { strategy: "SPECIFIC_ROLE", role: "MANAGER" }, titleTemplate: "Valider {{entity.reference}}" } },
        ...actionSteps,
        { code: "NOTIFY_APPROVED", name: "Notifier la réussite", stepType: "NOTIFICATION", position: notifyPosition, configuration: { recipient: { strategy: "ENTITY_CREATOR" }, titleTemplate: "Traitement financier terminé", bodyTemplate: "{{entity.reference}} a été traité par {{workflow.name}}.", targetUrl: input.targetUrl } },
        { code: "NOTIFY_REJECTED", name: "Notifier le rejet", stepType: "NOTIFICATION", position: rejectPosition, configuration: { recipient: { strategy: "ENTITY_CREATOR" }, titleTemplate: "Traitement financier rejeté", bodyTemplate: "{{entity.reference}} a été rejeté.", targetUrl: input.targetUrl } },
        { code: "END_SUCCESS", name: "Terminé", stepType: "END", position: successPosition, configuration: { outcome: "COMPLETED" } },
        { code: "END_REJECTED", name: "Terminé sur rejet", stepType: "END", position: rejectedPosition, configuration: { outcome: "REJECTED" } },
      ],
      transitions,
      configuration: { templateStatus: "DRAFT", separationOfDutiesRequired: true },
    },
  };
}

const financeTemplates: EnterpriseWorkflowTemplate[] = [
  financeActionTemplate({
    code: "SUPPLIER_INVOICE_REVIEW_APPROVAL_POSTING",
    nameFr: "Facture fournisseur — revue, approbation et comptabilisation",
    nameEn: "Supplier invoice — review, approval and posting",
    descriptionFr: "Soumet une facture fournisseur à une validation indépendante avant approbation et comptabilisation.",
    descriptionEn: "Routes a supplier invoice through independent review before approval and posting.",
    entityType: "EnterpriseSupplierInvoice",
    eventType: "SUPPLIER_INVOICE_SUBMIT",
    actions: [
      { code: "REVIEW", name: "Revue financière", action: "REVIEW" },
      { code: "APPROVE", name: "Approuver", action: "APPROVE" },
      { code: "POST", name: "Comptabiliser", action: "POST" },
    ],
    targetUrl: "/enterprise-modules/FINANCE_PAYABLES",
  }),
  financeActionTemplate({
    code: "SUPPLIER_PAYMENT_APPROVAL_CONFIRMATION",
    nameFr: "Paiement fournisseur — approbation et confirmation",
    nameEn: "Supplier payment — approval and confirmation",
    descriptionFr: "Fait approuver puis confirmer un paiement fournisseur avant rapprochement.",
    descriptionEn: "Approves and confirms a supplier payment before reconciliation.",
    entityType: "EnterprisePayment",
    eventType: "PAYMENT_SUBMIT",
    actions: [
      { code: "APPROVE", name: "Approuver", action: "APPROVE" },
      { code: "CONFIRM", name: "Confirmer", action: "CONFIRM" },
    ],
    targetUrl: "/enterprise-modules/FINANCE_PAYMENTS",
  }),
  financeActionTemplate({
    code: "CASH_SESSION_INDEPENDENT_CLOSE",
    nameFr: "Clôture de caisse indépendante",
    nameEn: "Independent cash close",
    descriptionFr: "Soumet une clôture de caisse à un validateur différent du caissier.",
    descriptionEn: "Routes a cash close to a validator other than the cashier.",
    entityType: "EnterpriseCashSession",
    eventType: "CASH_SESSION_SUBMITTED",
    actions: [{ code: "VALIDATE", name: "Valider la clôture", action: "VALIDATE" }],
    targetUrl: "/enterprise-modules/FINANCE_CASH",
  }),
  financeActionTemplate({
    code: "MANUAL_JOURNAL_APPROVAL_POSTING",
    nameFr: "Écriture manuelle — approbation et comptabilisation",
    nameEn: "Manual journal — approval and posting",
    descriptionFr: "Sépare la préparation, l’approbation et la comptabilisation d’une écriture manuelle.",
    descriptionEn: "Separates preparation, approval and posting of a manual journal entry.",
    entityType: "EnterpriseJournalEntry",
    eventType: "JOURNAL_ENTRY_SUBMIT",
    actions: [
      { code: "APPROVE", name: "Approuver", action: "APPROVE" },
      { code: "POST", name: "Comptabiliser", action: "POST" },
    ],
    targetUrl: "/enterprise-modules/FINANCE_ACCOUNTING",
  }),
  financeActionTemplate({
    code: "FISCAL_PERIOD_CLOSE_REVIEW",
    nameFr: "Clôture de période — checklist et validation",
    nameEn: "Period close — checklist and approval",
    descriptionFr: "Organise la revue indépendante d’une période préparée pour clôture. La fermeture finale reste effectuée par le service de clôture dédié.",
    descriptionEn: "Organizes independent review of a period prepared for close. Final closing remains delegated to the dedicated close service.",
    entityType: "EnterpriseFiscalPeriod",
    eventType: "FINANCIAL_CLOSE_PREPARED",
    actions: [],
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
