const fr = {
  ariaLabel: "Validation d’action IA",
  title: "Validation requise",
  description: "L’IA DTSC a préparé une action métier. Rien ne sera modifié tant que vous ne la confirmez pas ici.",
  priority: "Priorité",
  reject: "Refuser",
  approve: "Confirmer",
  confirmSuccess: "Action confirmée et exécutée.",
  confirmError: "Impossible de confirmer cette action. Réessayez depuis la conversation.",
  rejectSuccess: "Action refusée.",
  rejectError: "Impossible de refuser cette action. Réessayez depuis la conversation.",
};

const en = {
  ariaLabel: "AI action approval",
  title: "Approval required",
  description: "DTSC AI prepared a business action. Nothing will be changed until you approve it here.",
  priority: "Priority",
  reject: "Reject",
  approve: "Approve",
  confirmSuccess: "Action approved and executed.",
  confirmError: "Unable to confirm this action. Try again from the conversation.",
  rejectSuccess: "Action rejected.",
  rejectError: "Unable to reject this action. Try again from the conversation.",
};

export function getEnterpriseAiToolConfirmationCopy(locale?: string | null) {
  return String(locale || "fr").toLowerCase().startsWith("en") ? en : fr;
}
