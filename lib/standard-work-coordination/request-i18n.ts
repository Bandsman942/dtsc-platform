import { REQUEST_TYPES } from "@/lib/enterprise/core-v2/constants";

const requestTypeLabels = {
  fr: {
    GENERAL: "Demande générale",
    INFORMATION: "Demande d’information",
    DOCUMENT: "Demande de document",
    VALIDATION: "Demande de validation",
    PURCHASE_REQUEST: "Demande d’achat",
    SUPPORT: "Demande d’assistance",
    ACTION: "Action à réaliser",
    MEETING: "Demande de réunion",
    FOLLOW_UP: "Demande de suivi",
    OTHER: "Autre demande",
  },
  en: {
    GENERAL: "General request",
    INFORMATION: "Information request",
    DOCUMENT: "Document request",
    VALIDATION: "Approval request",
    PURCHASE_REQUEST: "Purchase request",
    SUPPORT: "Support request",
    ACTION: "Action request",
    MEETING: "Meeting request",
    FOLLOW_UP: "Follow-up request",
    OTHER: "Other request",
  },
} as const;

export function requestTypeLabel(locale: string | null | undefined, requestType: string) {
  const dictionary = requestTypeLabels[locale === "en" ? "en" : "fr"];
  return dictionary[requestType as keyof typeof dictionary] || requestType;
}

export function requestTypeChoices(locale: string | null | undefined) {
  return REQUEST_TYPES.map((id) => ({ id, label: requestTypeLabel(locale, id) }));
}
