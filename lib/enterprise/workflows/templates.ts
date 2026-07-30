import type { WorkflowVersionInput } from "@/lib/enterprise/workflows/validators";

export type EnterpriseWorkflowTemplate = {
  code: string;
  nameFr: string;
  nameEn: string;
  descriptionFr: string;
  descriptionEn: string;
  triggerEntityType: "EnterpriseRequest" | "EnterprisePurchase" | "EnterpriseBudget" | "EnterpriseExpense";
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

export const ENTERPRISE_WORKFLOW_TEMPLATES: readonly EnterpriseWorkflowTemplate[] = [
  requestTemplate,
  approvalTemplate({ code: "PURCHASE_APPROVAL", nameFr: "Validation d’achat", nameEn: "Purchase approval", descriptionFr: "Validation séquentielle d’un achat et notification de l’acheteur.", descriptionEn: "Sequential purchase approval and buyer notification.", entityType: "EnterprisePurchase", eventType: "ENTERPRISE_PURCHASE_SUBMITTED", targetUrl: "/enterprise-modules/SUPPLIERS_PURCHASES" }),
  approvalTemplate({ code: "BUDGET_APPROVAL", nameFr: "Validation de budget", nameEn: "Budget approval", descriptionFr: "Validation d’un budget et notification de son créateur.", descriptionEn: "Budget approval and creator notification.", entityType: "EnterpriseBudget", eventType: "ENTERPRISE_BUDGET_SUBMITTED", targetUrl: "/enterprise-modules/FINANCE_BUDGETS" }),
  approvalTemplate({ code: "EXPENSE_APPROVAL", nameFr: "Validation de dépense", nameEn: "Expense approval", descriptionFr: "Validation d’une dépense et notification du demandeur.", descriptionEn: "Expense approval and requester notification.", entityType: "EnterpriseExpense", eventType: "ENTERPRISE_EXPENSE_SUBMITTED", targetUrl: "/enterprise-modules/FINANCE_BUDGETS" }),
];

export function getEnterpriseWorkflowTemplate(code: string) {
  return ENTERPRISE_WORKFLOW_TEMPLATES.find((template) => template.code === code) || null;
}
