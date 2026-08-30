import enterpriseProcurementFr from "@/locales/enterprise-procurement.fr.json";
import enterpriseProcurementEn from "@/locales/enterprise-procurement.en.json";
import {
  translateEnterpriseCore,
  type EnterpriseCoreKey as BaseEnterpriseCoreKey,
} from "@/lib/i18n";

type EnterpriseProcurementCoreKey = keyof typeof enterpriseProcurementFr;
type EnterpriseCoordinationSupplementKey = "meetings.action.reason" | "meetings.action.reason.required";
export type EnterpriseCoreKey = BaseEnterpriseCoreKey | EnterpriseProcurementCoreKey | EnterpriseCoordinationSupplementKey;

const procurementFragments = {
  fr: enterpriseProcurementFr,
  en: enterpriseProcurementEn,
} as const;

const coordinationSupplements: Record<"fr" | "en", Record<EnterpriseCoordinationSupplementKey, string>> = {
  fr: {
    "meetings.action.reason": "Motif professionnel",
    "meetings.action.reason.required": "Un motif professionnel d’au moins 3 caractères est obligatoire.",
  },
  en: {
    "meetings.action.reason": "Professional reason",
    "meetings.action.reason.required": "A professional reason of at least 3 characters is required.",
  },
};

export function enterpriseCoreT(
  locale: string | null | undefined,
  key: EnterpriseCoreKey,
  vars?: Record<string, string | number>,
) {
  const normalizedLocale = locale === "en" ? "en" : "fr";
  const procurementDictionary = procurementFragments[normalizedLocale];
  const procurementTemplate = procurementDictionary[key as EnterpriseProcurementCoreKey];
  const supplementalTemplate = coordinationSupplements[normalizedLocale][key as EnterpriseCoordinationSupplementKey];
  const template = typeof procurementTemplate === "string"
    ? procurementTemplate
    : typeof supplementalTemplate === "string"
      ? supplementalTemplate
      : translateEnterpriseCore(locale, key as BaseEnterpriseCoreKey);
  if (!vars) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_match, name: string) => String(vars[name] ?? ""));
}

export function enterpriseCoreIntlLocale(locale: string | null | undefined) {
  return locale === "en" ? "en-US" : "fr-FR";
}
