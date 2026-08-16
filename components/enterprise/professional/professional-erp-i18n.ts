"use client";

import { useAppLocale } from "@/components/i18n/locale-provider";
import { translateProfessionalErp, type ProfessionalErpKey } from "@/lib/i18n";

export type ProfessionalErpLocale = "fr" | "en";

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

export type ProfessionalErpApprovalMessageCode = keyof typeof approvalMessages.fr;

export function professionalErpApprovalMessage(
  locale: ProfessionalErpLocale,
  code: string | null | undefined,
) {
  const key = code as ProfessionalErpApprovalMessageCode;
  return approvalMessages[locale][key] || approvalMessages[locale].APPROVER_ELIGIBILITY_CHECK_FAILED;
}

export function professionalErpT(
  locale: ProfessionalErpLocale,
  key: ProfessionalErpKey,
  values?: Record<string, string | number>,
) {
  let text = translateProfessionalErp(locale, key);
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
  const key = `${group}.${value}` as ProfessionalErpKey;
  const localized = translateProfessionalErp(locale, key);
  return localized || professionalErpT(locale, "common.valueToReview");
}

export function professionalErpMoney(
  value: string | number | null | undefined,
  currency: string | null | undefined,
  locale: ProfessionalErpLocale,
) {
  if (value === null || value === undefined || value === "") return professionalErpT(locale, "common.amountToDefine");
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return professionalErpT(locale, "common.amountToDefine");
  try {
    return new Intl.NumberFormat(locale === "en" ? "en-US" : "fr-FR", {
      style: "currency",
      currency: currency || "USD",
      maximumFractionDigits: 2,
    }).format(numeric);
  } catch {
    return `${numeric.toFixed(2)} ${currency || "USD"}`;
  }
}

export function professionalErpNumber(
  value: string | number | null | undefined,
  locale: ProfessionalErpLocale,
  maximumFractionDigits = 3,
) {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric)) return "0";
  return new Intl.NumberFormat(locale === "en" ? "en-US" : "fr-FR", { maximumFractionDigits }).format(numeric);
}

export function professionalErpDate(
  value: string | null | undefined,
  locale: ProfessionalErpLocale,
) {
  if (!value) return professionalErpT(locale, "common.notScheduled");
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return professionalErpT(locale, "common.notScheduled");
  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "fr-FR", { dateStyle: "medium" }).format(date);
}

export function professionalErpDateTime(
  value: string | null | undefined,
  locale: ProfessionalErpLocale,
) {
  if (!value) return professionalErpT(locale, "common.notScheduled");
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return professionalErpT(locale, "common.notScheduled");
  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(date);
}