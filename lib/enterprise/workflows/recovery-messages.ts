const messages = {
  fr: {
    WORKFLOW_ACTION_RECONCILIATION_REQUIRED: "Le résultat de cette action doit être vérifié avant toute reprise. Consultez son historique ou contactez un responsable.",
    WORKFLOW_EXECUTION_LEASE_LOST: "Cette exécution a changé. Actualisez pour consulter son état.",
    ENTERPRISE_WORKFLOW_STEP_RECOVERED: "Reprise de l’étape après interruption, avec contrôle des actions déjà effectuées.",
  },
  en: {
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
