"use client";

import { useAppLocale } from "@/components/i18n/locale-provider";
import { translateProfessionalErp, type ProfessionalErpKey as BaseProfessionalErpKey } from "@/lib/i18n";

export type ProfessionalErpLocale = "fr" | "en";
type ProfessionalErpSupplementKey =
  | "common.loadFailed"
  | "common.loading"
  | "common.page"
  | "common.previous"
  | "common.next"
  | "common.submitting"
  | "common.saving"
  | "inventory.rejectionReasonRequired"
  | "inventory.pendingAdjustments"
  | "inventory.tabAdjustments"
  | "inventory.adjustmentSection"
  | "inventory.adjustmentDescription"
  | "inventory.adjustmentsAria"
  | "inventory.adjustmentActions"
  | "inventory.noAdjustment"
  | "inventory.noAdjustmentDescription"
  | "inventory.reviewApprove"
  | "inventory.reviewReject"
  | "inventory.decisionReviewDescription"
  | "inventory.transferKind"
  | "inventory.countKind"
  | "inventory.adjustmentKind"
  | "inventory.rejectionReason"
  | "inventory.decisionComment";
type ProfessionalErpAliasKey =
  | "assets.plannedAt"
  | "assets.dueAt"
  | "assets.occurredAt";
export type ProfessionalErpKey = BaseProfessionalErpKey | ProfessionalErpSupplementKey | ProfessionalErpAliasKey;

export function useProfessionalErpLocale(): ProfessionalErpLocale {
  const locale = useAppLocale();
  return locale === "en" ? "en" : "fr";
}

const approvalMessages = {
  fr: {
    SELF_APPROVAL_FORBIDDEN: "Vous ne pouvez pas vous choisir comme approbateur. Sélectionnez une autre personne autorisée.",
    APPROVER_NOT_MEMBER: "Cette personne n’est pas un membre actif de cette entreprise et ne peut pas être choisie comme approbateur.",
    APPROVER_PERMISSION_DENIED: "Cette personne n’a pas le droit d’approuver dans ce module. Choisissez un approbateur autorisé.",
    APPROVER_ELIGIBILITY_CHECK_FAILED: "Impossible de vérifier les droits de cet approbateur. Réessayez avant d’envoyer la demande.",
  },
  en: {
    SELF_APPROVAL_FORBIDDEN: "You cannot select yourself as approver. Choose another authorized person.",
    APPROVER_NOT_MEMBER: "This person is not an active member of this organization and cannot be selected as approver.",
    APPROVER_PERMISSION_DENIED: "This person does not have approval rights in this module. Choose an authorized approver.",
    APPROVER_ELIGIBILITY_CHECK_FAILED: "The approver’s permissions could not be verified. Try again before submitting the request.",
  },
} as const;

const professionalSupplements: Record<ProfessionalErpLocale, Record<ProfessionalErpSupplementKey, string>> = {
  fr: {
    "common.loadFailed": "Impossible de charger les données.",
    "common.loading": "Chargement…",
    "common.page": "Page {{current}} sur {{total}}",
    "common.previous": "Précédent",
    "common.next": "Suivant",
    "common.submitting": "Envoi…",
    "common.saving": "Enregistrement…",
    "inventory.rejectionReasonRequired": "Un motif est obligatoire pour rejeter l’opération.",
    "inventory.pendingAdjustments": "Ajustements en attente",
    "inventory.tabAdjustments": "Ajustements",
    "inventory.adjustmentSection": "Ajustements de stock contrôlés",
    "inventory.adjustmentDescription": "Chaque ajustement est revu indépendamment avant de modifier le journal de stock.",
    "inventory.adjustmentsAria": "Ajustements de stock",
    "inventory.adjustmentActions": "Actions de l’ajustement",
    "inventory.noAdjustment": "Aucun ajustement",
    "inventory.noAdjustmentDescription": "Les ajustements de stock contrôlés apparaîtront ici.",
    "inventory.reviewApprove": "Revoir et approuver",
    "inventory.reviewReject": "Revoir et rejeter",
    "inventory.decisionReviewDescription": "Vérifiez l’opération avant d’enregistrer votre décision indépendante.",
    "inventory.transferKind": "Transfert de stock",
    "inventory.countKind": "Inventaire",
    "inventory.adjustmentKind": "Ajustement de stock",
    "inventory.rejectionReason": "Motif du rejet",
    "inventory.decisionComment": "Commentaire de décision",
  },
  en: {
    "common.loadFailed": "Unable to load data.",
    "common.loading": "Loading…",
    "common.page": "Page {{current}} of {{total}}",
    "common.previous": "Previous",
    "common.next": "Next",
    "common.submitting": "Submitting…",
    "common.saving": "Saving…",
    "inventory.rejectionReasonRequired": "A rejection reason is required.",
    "inventory.pendingAdjustments": "Pending adjustments",
    "inventory.tabAdjustments": "Adjustments",
    "inventory.adjustmentSection": "Controlled stock adjustments",
    "inventory.adjustmentDescription": "Every adjustment is independently reviewed before the stock journal is changed.",
    "inventory.adjustmentsAria": "Stock adjustments",
    "inventory.adjustmentActions": "Adjustment actions",
    "inventory.noAdjustment": "No adjustment",
    "inventory.noAdjustmentDescription": "Controlled stock adjustments will appear here.",
    "inventory.reviewApprove": "Review and approve",
    "inventory.reviewReject": "Review and reject",
    "inventory.decisionReviewDescription": "Check the operation before recording your independent decision.",
    "inventory.transferKind": "Stock transfer",
    "inventory.countKind": "Inventory count",
    "inventory.adjustmentKind": "Stock adjustment",
    "inventory.rejectionReason": "Rejection reason",
    "inventory.decisionComment": "Decision comment",
  },
};

const professionalAliases: Record<ProfessionalErpAliasKey, BaseProfessionalErpKey> = {
  "assets.plannedAt": "assets.plannedDate",
  "assets.dueAt": "assets.dueDate",
  "assets.occurredAt": "assets.incidentDate",
};

const siteTypeSupplements = {
  fr: {
    ESTABLISHMENT: "Établissement",
    CENTER: "Centre",
    DEPOT: "Dépôt",
    FIELD_SITE: "Site terrain",
  },
  en: {
    ESTABLISHMENT: "Establishment",
    CENTER: "Center",
    DEPOT: "Depot",
    FIELD_SITE: "Field site",
  },
} as const;

const projectStatusSupplements = {
  fr: {
    APPROVED: "Approuvé",
    RESOLVED: "Résolu",
  },
  en: {
    APPROVED: "Approved",
    RESOLVED: "Resolved",
  },
} as const;

export type ProfessionalErpApprovalMessageCode = keyof typeof approvalMessages.fr;

export function professionalErpApprovalMessage(locale: ProfessionalErpLocale, code: string | null | undefined) {
  const key = code as ProfessionalErpApprovalMessageCode;
  return approvalMessages[locale][key] || approvalMessages[locale].APPROVER_ELIGIBILITY_CHECK_FAILED;
}

export function professionalErpT(locale: ProfessionalErpLocale, key: ProfessionalErpKey, values?: Record<string, string | number>) {
  const alias = professionalAliases[key as ProfessionalErpAliasKey];
  let text = alias
    ? translateProfessionalErp(locale, alias)
    : key in professionalSupplements[locale]
      ? professionalSupplements[locale][key as ProfessionalErpSupplementKey]
      : translateProfessionalErp(locale, key as BaseProfessionalErpKey);
  if (!values) return text;
  for (const [name, value] of Object.entries(values)) text = text.replaceAll(`{{${name}}}`, String(value));
  return text;
}

export function professionalErpEnumLabel(
  locale: ProfessionalErpLocale,
  group:
    | "role"
    | "identityStatus"
    | "partyType"
    | "status"
    | "opportunityStage"
    | "leadStatus"
    | "source"
    | "contractType"
    | "approvalStatus"
    | "renewalMode"
    | "itemType"
    | "priceType"
    | "unitCategory"
    | "inventoryStatus"
    | "countType"
    | "adjustmentType"
    | "siteStatus"
    | "siteType"
    | "warehouseType"
    | "locationType"
    | "projectStatus"
    | "projectType"
    | "projectRole"
    | "riskLevel"
    | "priority"
    | "assetStatus"
    | "assetCondition"
    | "maintenanceType"
    | "employmentContractStatus"
    | "employmentContractType"
    | "payFrequency"
    | "employmentStatus"
    | "employmentType"
    | "timeStatus"
    | "leaveType"
    | "payrollStatus",
  value: string,
) {
  if (group === "siteType") {
    const supplemented = siteTypeSupplements[locale][value as keyof typeof siteTypeSupplements.fr];
    if (supplemented) return supplemented;
  }
  if (group === "projectStatus") {
    const supplemented = projectStatusSupplements[locale][value as keyof typeof projectStatusSupplements.fr];
    if (supplemented) return supplemented;
  }
  const key = `${group}.${value}` as BaseProfessionalErpKey;
  const localized = translateProfessionalErp(locale, key);
  return localized || professionalErpT(locale, "common.valueToReview");
}

export function professionalErpMoney(value: string | number | null | undefined, currency: string | null | undefined, locale: ProfessionalErpLocale) {
  if (value === null || value === undefined || value === "") return professionalErpT(locale, "common.amountToDefine");
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return professionalErpT(locale, "common.amountToDefine");
  try {
    return new Intl.NumberFormat(locale === "en" ? "en-US" : "fr-FR", { style: "currency", currency: currency || "USD", maximumFractionDigits: 2 }).format(numeric);
  } catch {
    return `${numeric.toFixed(2)} ${currency || "USD"}`;
  }
}

export function professionalErpNumber(value: string | number | null | undefined, locale: ProfessionalErpLocale, maximumFractionDigits = 3) {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric)) return "0";
  return new Intl.NumberFormat(locale === "en" ? "en-US" : "fr-FR", { maximumFractionDigits }).format(numeric);
}

export function professionalErpDate(value: string | null | undefined, locale: ProfessionalErpLocale) {
  if (!value) return professionalErpT(locale, "common.notScheduled");
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return professionalErpT(locale, "common.notScheduled");
  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "fr-FR", { dateStyle: "medium" }).format(date);
}

export function professionalErpDateTime(value: string | null | undefined, locale: ProfessionalErpLocale) {
  if (!value) return professionalErpT(locale, "common.notScheduled");
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return professionalErpT(locale, "common.notScheduled");
  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(date);
}
