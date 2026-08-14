import enterpriseProcurementFr from "@/locales/enterprise-procurement.fr.json";
import enterpriseProcurementEn from "@/locales/enterprise-procurement.en.json";
import {
  translateEnterpriseCore,
  type EnterpriseCoreKey as BaseEnterpriseCoreKey,
} from "@/lib/i18n";

type EnterpriseProcurementCoreKey = keyof typeof enterpriseProcurementFr;
export type EnterpriseCoreKey = BaseEnterpriseCoreKey | EnterpriseProcurementCoreKey;

const procurementFragments = {
  fr: enterpriseProcurementFr,
  en: enterpriseProcurementEn,
} as const;

export function enterpriseCoreT(
  locale: string | null | undefined,
  key: EnterpriseCoreKey,
  vars?: Record<string, string | number>,
) {
  const procurementDictionary = procurementFragments[locale === "en" ? "en" : "fr"];
  const procurementTemplate = procurementDictionary[key as EnterpriseProcurementCoreKey];
  const template = typeof procurementTemplate === "string"
    ? procurementTemplate
    : translateEnterpriseCore(locale, key as BaseEnterpriseCoreKey);
  if (!vars) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_match, name: string) => String(vars[name] ?? ""));
}

export function enterpriseCoreIntlLocale(locale: string | null | undefined) {
  return locale === "en" ? "en-US" : "fr-FR";
}
