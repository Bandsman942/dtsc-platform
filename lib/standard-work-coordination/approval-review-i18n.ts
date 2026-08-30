const reviewLabels = {
  fr: {
    prepare: "Préparer la revue",
    prepareHelp: "Créez la version immuable à relire avant toute décision finale.",
    snapshot: "Version soumise à relire",
    reviewed: "Version relue",
    reviewRequired: "La décision finale est disponible après préparation et lecture de la version soumise.",
    fields: {
      title: "Titre",
      description: "Description",
      status: "Statut",
      priority: "Priorité",
      requestType: "Type de demande",
      reference: "Référence",
      revision: "Révision métier",
      startAt: "Début",
      dueAt: "Échéance",
      endAt: "Fin",
      locationMode: "Mode",
      currency: "Devise",
      amount: "Montant",
      totalAmount: "Montant total",
      sourceAmount: "Montant source",
      sourceCurrencyCode: "Devise source",
      targetAmount: "Montant cible",
      targetCurrencyCode: "Devise cible",
      updatedAt: "Dernière modification",
    },
  },
  en: {
    prepare: "Prepare review",
    prepareHelp: "Create the immutable submitted version to review before any final decision.",
    snapshot: "Submitted version to review",
    reviewed: "Reviewed version",
    reviewRequired: "A final decision becomes available after preparing and reviewing the submitted version.",
    fields: {
      title: "Title",
      description: "Description",
      status: "Status",
      priority: "Priority",
      requestType: "Request type",
      reference: "Reference",
      revision: "Business revision",
      startAt: "Start",
      dueAt: "Due date",
      endAt: "End",
      locationMode: "Mode",
      currency: "Currency",
      amount: "Amount",
      totalAmount: "Total amount",
      sourceAmount: "Source amount",
      sourceCurrencyCode: "Source currency",
      targetAmount: "Target amount",
      targetCurrencyCode: "Target currency",
      updatedAt: "Last update",
    },
  },
} as const;

export function approvalReviewLabel(locale: string | null | undefined, key: "prepare" | "prepareHelp" | "snapshot" | "reviewed" | "reviewRequired") {
  return reviewLabels[locale === "en" ? "en" : "fr"][key];
}

export function approvalSnapshotFieldLabel(locale: string | null | undefined, field: string) {
  const dictionary = reviewLabels[locale === "en" ? "en" : "fr"].fields as Record<string, string>;
  return dictionary[field] || field;
}
