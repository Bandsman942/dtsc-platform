export type ConditionalFeatureStatus = {
  code: string;
  configured: boolean;
  available: boolean;
  mode: "LOCAL" | "EXTERNAL" | "DISABLED";
  message: string;
};

function hasAllEnvironmentVariables(names: string[]) {
  return names.every((name) => Boolean(process.env[name]?.trim()));
}

export function getExternalCalendarFeatureStatus(): ConditionalFeatureStatus {
  const googleConfigured = hasAllEnvironmentVariables(["GOOGLE_CALENDAR_CLIENT_ID", "GOOGLE_CALENDAR_CLIENT_SECRET"]);
  const microsoftConfigured = hasAllEnvironmentVariables(["MICROSOFT_CALENDAR_CLIENT_ID", "MICROSOFT_CALENDAR_CLIENT_SECRET", "MICROSOFT_CALENDAR_TENANT_ID"]);
  const configured = googleConfigured || microsoftConfigured;
  return {
    code: "EXTERNAL_CALENDAR_SYNC",
    configured,
    available: configured,
    mode: configured ? "EXTERNAL" : "DISABLED",
    message: configured
      ? "Un fournisseur de calendrier externe est configuré. Chaque utilisateur doit encore accorder son consentement avant synchronisation."
      : "La synchronisation externe est désactivée tant qu'aucun fournisseur OAuth n'est configuré en Production.",
  };
}

export function getSlotSuggestionFeatureStatus(): ConditionalFeatureStatus {
  return {
    code: "CALENDAR_SLOT_SUGGESTIONS",
    configured: true,
    available: true,
    mode: "LOCAL",
    message: "Les suggestions utilisent les disponibilités et conflits internes autorisés. Aucun fournisseur externe n'est requis.",
  };
}

export function getDocumentIndexFeatureStatus(): ConditionalFeatureStatus {
  const provider = process.env.DOCUMENT_INDEX_PROVIDER?.trim();
  const configured = Boolean(provider && hasAllEnvironmentVariables(["DOCUMENT_INDEX_ENDPOINT", "DOCUMENT_INDEX_API_KEY"]));
  return {
    code: "DOCUMENT_ADVANCED_INDEX",
    configured,
    available: configured,
    mode: configured ? "EXTERNAL" : "DISABLED",
    message: configured
      ? "Le fournisseur d'indexation documentaire avancée est configuré."
      : "L'indexation avancée reste désactivée sans fournisseur, endpoint et clé serveur configurés.",
  };
}

export function getDocumentVisualComparisonFeatureStatus(): ConditionalFeatureStatus {
  const provider = process.env.DOCUMENT_VISUAL_DIFF_PROVIDER?.trim();
  const configured = Boolean(provider && hasAllEnvironmentVariables(["DOCUMENT_VISUAL_DIFF_ENDPOINT", "DOCUMENT_VISUAL_DIFF_API_KEY"]));
  return {
    code: "DOCUMENT_VISUAL_COMPARISON",
    configured,
    available: configured,
    mode: configured ? "EXTERNAL" : "DISABLED",
    message: configured
      ? "Le fournisseur de comparaison visuelle est configuré."
      : "La comparaison visuelle de versions reste désactivée sans fournisseur externe configuré.",
  };
}

export function getTechnicalDebtFeatureStatuses() {
  return {
    externalCalendar: getExternalCalendarFeatureStatus(),
    slotSuggestions: getSlotSuggestionFeatureStatus(),
    documentIndex: getDocumentIndexFeatureStatus(),
    visualComparison: getDocumentVisualComparisonFeatureStatus(),
    resourceBooking: {
      code: "CALENDAR_RESOURCE_BOOKING",
      configured: true,
      available: true,
      mode: "LOCAL",
      message: "La réservation de ressources utilise le moteur interne et empêche les chevauchements actifs.",
    } satisfies ConditionalFeatureStatus,
    advancedSla: {
      code: "OPERATIONAL_ADVANCED_SLA",
      configured: true,
      available: true,
      mode: "LOCAL",
      message: "Les politiques SLA et leurs instances sont évaluées dans le moteur opérationnel interne.",
    } satisfies ConditionalFeatureStatus,
  };
}
