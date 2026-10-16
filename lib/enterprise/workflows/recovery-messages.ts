const messages = {
  fr: {
    INVALID_WORKFLOW_VERSION_PAYLOAD: "Impossible d’enregistrer : vérifiez la configuration des étapes et des transitions.",
    WORKFLOW_DRAFT_CONFLICT: "Le brouillon a changé depuis son ouverture. Rechargez la dernière version avant d’enregistrer.",
    PUBLISHED_WORKFLOW_IMMUTABLE: "Une version publiée ne peut plus être modifiée. Créez une nouvelle version brouillon.",
    WORKFLOW_ASSIGNEE_NOT_FOUND: "Aucun collaborateur actif ne correspond à cette affectation. Choisissez un validateur ou un rôle éligible.",
    WORKFLOW_APPROVER_MODULE_DENIED: "Le validateur sélectionné ne possède pas le droit d’approuver les opérations de ce module ERP.",
    WORKFLOW_SELF_APPROVAL_BLOCKED: "Le demandeur ne peut pas approuver sa propre opération. Choisissez un autre validateur autorisé.",
    WORKFLOW_APPROVAL_CONFLICT: "Une validation existe déjà avec un autre validateur. Conservez le validateur désigné dans l’objet ERP.",
    WORKFLOW_SOURCE_MODULE_ACCESS_DENIED: "Votre poste ou abonnement ne permet pas de modifier ce workflow pour son module métier.",
    WORKFLOW_SOURCE_ACCESS_DENIED: "Vous n’avez pas le droit de soumettre des objets dans ce module ERP.",
    WORKFLOW_NOT_PUBLISHED: "Publiez d’abord une version du workflow.",
    WORKFLOW_MANUAL_START_UNAVAILABLE: "Le lancement manuel n’est pas activé pour ce workflow.",
    WORKFLOW_INTERNAL_ERROR: "Une erreur technique a empêché cette opération. Réessayez ou contactez le support.",
    WORKFLOW_ACTION_RECONCILIATION_REQUIRED: "Le résultat de cette action doit être vérifié avant toute reprise. Consultez son historique ou contactez un responsable.",
    WORKFLOW_EXECUTION_LEASE_LOST: "Cette exécution a changé. Actualisez pour consulter son état.",
    ENTERPRISE_WORKFLOW_STEP_RECOVERED: "Reprise de l’étape après interruption, avec contrôle des actions déjà effectuées.",
  },
  en: {
    INVALID_WORKFLOW_VERSION_PAYLOAD: "Cannot save: check the step and transition configuration.",
    WORKFLOW_DRAFT_CONFLICT: "This draft changed after it was opened. Reload its latest version before saving.",
    PUBLISHED_WORKFLOW_IMMUTABLE: "A published version cannot be edited. Create a new draft version.",
    WORKFLOW_ASSIGNEE_NOT_FOUND: "No active member matches this assignment. Select an eligible approver or role.",
    WORKFLOW_APPROVER_MODULE_DENIED: "The selected approver does not have approval permission for this ERP module.",
    WORKFLOW_SELF_APPROVAL_BLOCKED: "The requester cannot approve their own operation. Choose another authorized approver.",
    WORKFLOW_APPROVAL_CONFLICT: "An approval already exists with another approver. Use the designated ERP approver.",
    WORKFLOW_SOURCE_MODULE_ACCESS_DENIED: "Your position or subscription does not allow editing a workflow for this business module.",
    WORKFLOW_SOURCE_ACCESS_DENIED: "You cannot submit records in this ERP module.",
    WORKFLOW_NOT_PUBLISHED: "Publish a workflow version first.",
    WORKFLOW_MANUAL_START_UNAVAILABLE: "Manual start is not enabled for this workflow.",
    WORKFLOW_INTERNAL_ERROR: "A technical error prevented this operation. Try again or contact support.",
    WORKFLOW_ACTION_RECONCILIATION_REQUIRED: "The result of this action must be verified before resuming. Check its history or contact an authorized manager.",
    WORKFLOW_EXECUTION_LEASE_LOST: "This execution has changed. Refresh to view its current state.",
    ENTERPRISE_WORKFLOW_STEP_RECOVERED: "The step resumed after an interruption, checking actions already performed.",
  },
} as const;

export function getWorkflowRecoveryMessage(code: string | null | undefined, locale?: string | null): string | undefined {
  const key = code === "ENTERPRISE_WORKFLOW_RECONCILIATION_REQUIRED" ? "WORKFLOW_ACTION_RECONCILIATION_REQUIRED" : code;
  const copy = locale === "en" ? messages.en : messages.fr;
  return key && Object.prototype.hasOwnProperty.call(copy, key) ? copy[key as keyof typeof copy] : undefined;
}


/** Localize Zod field paths without leaking raw English validator messages. */
export function getWorkflowValidationFieldMessage(
  issues: readonly { path: readonly PropertyKey[] }[],
  locale: string | null | undefined,
  stepNames: readonly string[] = [],
) {
  const en = locale === "en";
  const first = issues[0];
  if (!first) return en ? "Invalid workflow configuration." : "La configuration du workflow est invalide.";
  const path = first.path.map(String);
  const stepIndex = path[0] === "steps" ? Number(path[1]) : -1;
  const step = Number.isInteger(stepIndex) && stepIndex >= 0 ? stepNames[stepIndex] : undefined;
  const fields: Record<string, [string, string]> = {
    configuration: ["configuration", "settings"], assignment: ["affectation", "assignment"],
    strategy: ["stratégie", "strategy"], role: ["rôle", "role"],
    userId: ["validateur", "approver"], departmentId: ["département", "department"],
    transitions: ["transitions", "transitions"], steps: ["étapes", "steps"],
    outcome: ["résultat", "outcome"], priority: ["priorité", "priority"],
    titleTemplate: ["titre", "title"], recipient: ["destinataire", "recipient"],
  };
  const fieldKey = path.filter((part) => !/^\d+$/.test(part)).slice(-1)[0];
  const field = fields[fieldKey]?.[en ? 1 : 0] || (en ? "field" : "champ");
  return step
    ? (en ? `Step “${step}”: invalid ${field}. Check its structured settings before saving.`
      : `Étape « ${step} » : ${field} invalide. Corrigez ses paramètres avant d’enregistrer.`)
    : (en ? `Invalid workflow ${field}. Check the editor before saving.`
      : `Workflow : ${field} invalide. Vérifiez l’éditeur avant d’enregistrer.`);
}
