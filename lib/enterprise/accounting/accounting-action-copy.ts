export function getAccountingActionCopy(locale: string | null | undefined) {
  const fr = locale !== "en";
  return fr ? {
    editItem: "Modifier",
    deleteItem: "Supprimer",
    deactivateJournal: "Désactiver le journal",
    activateJournal: "Réactiver le journal",
    deleteTitle: "Confirmer la suppression",
    deleteDescription: "La suppression n’est possible que pour un élément encore inutilisé. Si l’élément appartient déjà à l’historique comptable, le système refusera l’action et indiquera l’alternative sûre.",
    deleteConfirm: "Supprimer définitivement",
    updated: "Les modifications ont été enregistrées.",
    deleted: "L’élément a été supprimé.",
    statusChanged: "Le statut du journal a été mis à jour.",
    backToList: "Retour à la liste",
    selectedChartHelp: "C’est le plan actuellement actif pour les opérations comptables de l’entreprise.",
    editNotAllowed: "Cet élément n’est plus modifiable directement car il participe déjà à l’historique comptable.",
    journalActive: "Journal actif",
  } : {
    editItem: "Edit",
    deleteItem: "Delete",
    deactivateJournal: "Deactivate journal",
    activateJournal: "Reactivate journal",
    deleteTitle: "Confirm deletion",
    deleteDescription: "Deletion is only allowed for an unused item. If the item already belongs to accounting history, the system will block the action and explain the safe alternative.",
    deleteConfirm: "Delete permanently",
    updated: "Changes were saved.",
    deleted: "The item was deleted.",
    statusChanged: "The journal status was updated.",
    backToList: "Back to list",
    selectedChartHelp: "This is the chart currently active for the company’s accounting operations.",
    editNotAllowed: "This item can no longer be edited directly because it already belongs to accounting history.",
    journalActive: "Active journal",
  };
}
