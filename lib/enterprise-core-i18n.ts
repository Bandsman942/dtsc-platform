import enterpriseProcurementFr from "@/locales/enterprise-procurement.fr.json";
import enterpriseProcurementEn from "@/locales/enterprise-procurement.en.json";
import { translateEnterpriseCore, type EnterpriseCoreKey as BaseEnterpriseCoreKey } from "@/lib/i18n";

type EnterpriseProcurementCoreKey = keyof typeof enterpriseProcurementFr;
type EnterpriseCoordinationSupplementKey =
  | "meetings.action.reason"
  | "meetings.action.reason.required"
  | "common.save"
  | "approvals.target.stockTransfer"
  | "approvals.target.inventoryCount"
  | "approvals.target.stockAdjustment"
  | "documents.editTitle"
  | "documents.archiveReview"
  | "documents.archiveReason"
  | "documents.archiveReasonHelp"
  | "documents.sourceUnavailable";
export type EnterpriseCoreKey = BaseEnterpriseCoreKey | EnterpriseProcurementCoreKey | EnterpriseCoordinationSupplementKey;

const procurementFragments = { fr: enterpriseProcurementFr, en: enterpriseProcurementEn } as const;

const coordinationSupplements: Record<"fr" | "en", Record<EnterpriseCoordinationSupplementKey, string>> = {
  fr: {
    "meetings.action.reason": "Motif professionnel",
    "meetings.action.reason.required": "Un motif professionnel d’au moins 3 caractères est obligatoire.",
    "common.save": "Enregistrer",
    "approvals.target.stockTransfer": "Transfert de stock",
    "approvals.target.inventoryCount": "Inventaire physique",
    "approvals.target.stockAdjustment": "Ajustement de stock",
    "documents.editTitle": "Modifier le document",
    "documents.archiveReview": "Vérifiez le document avant de l’archiver. Le fichier et son historique restent conservés.",
    "documents.archiveReason": "Motif professionnel",
    "documents.archiveReasonHelp": "Expliquez brièvement pourquoi ce document doit être retiré des documents actifs.",
    "documents.sourceUnavailable": "La source de ce document ne possède pas de module canonique reconnu. Le document n’a pas été créé.",
  },
  en: {
    "meetings.action.reason": "Professional reason",
    "meetings.action.reason.required": "A professional reason of at least 3 characters is required.",
    "common.save": "Save",
    "approvals.target.stockTransfer": "Stock transfer",
    "approvals.target.inventoryCount": "Inventory count",
    "approvals.target.stockAdjustment": "Stock adjustment",
    "documents.editTitle": "Edit document",
    "documents.archiveReview": "Review the document before archiving it. The file and its history remain preserved.",
    "documents.archiveReason": "Business reason",
    "documents.archiveReasonHelp": "Briefly explain why this document should be removed from active documents.",
    "documents.sourceUnavailable": "This document source has no recognized canonical module. The document was not created.",
  },
};

export function enterpriseCoreT(locale: string | null | undefined, key: EnterpriseCoreKey, vars?: Record<string, string | number>) {
  const normalizedLocale = locale === "en" ? "en" : "fr";
  const procurementDictionary = procurementFragments[normalizedLocale];
  const procurementTemplate = procurementDictionary[key as EnterpriseProcurementCoreKey];
  const supplementalTemplate = coordinationSupplements[normalizedLocale][key as EnterpriseCoordinationSupplementKey];
  const template = typeof procurementTemplate === "string" ? procurementTemplate : typeof supplementalTemplate === "string" ? supplementalTemplate : translateEnterpriseCore(locale, key as BaseEnterpriseCoreKey);
  if (!vars) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_match, name: string) => String(vars[name] ?? ""));
}

export function enterpriseCoreIntlLocale(locale: string | null | undefined) { return locale === "en" ? "en-US" : "fr-FR"; }