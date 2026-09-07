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
  | "documents.sourceUnavailable"
  | "reports.actionFailed"
  | "reports.loadFailed"
  | "reports.generationStatusTitle"
  | "reports.generationQueued"
  | "reports.generationProcessing"
  | "reports.generationRetrying"
  | "reports.generationReady"
  | "reports.generationFailed"
  | "reports.generationLeaveHint";
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
    "reports.actionFailed": "Cette action n’a pas pu être terminée. Vérifiez les informations puis réessayez.",
    "reports.loadFailed": "Le rapport n’a pas pu être chargé. Actualisez la liste puis réessayez.",
    "reports.generationStatusTitle": "Génération du rapport",
    "reports.generationQueued": "Rapport placé en attente de génération.",
    "reports.generationProcessing": "Génération du rapport en cours.",
    "reports.generationRetrying": "La génération reprend automatiquement après une interruption temporaire.",
    "reports.generationReady": "Le rapport est prêt.",
    "reports.generationFailed": "La génération du rapport a échoué. Vérifiez les paramètres puis réessayez.",
    "reports.generationLeaveHint": "Vous pouvez quitter ce module et revenir plus tard : le suivi sera conservé.",
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
    "reports.actionFailed": "This action could not be completed. Check the information and try again.",
    "reports.loadFailed": "The report could not be loaded. Refresh the list and try again.",
    "reports.generationStatusTitle": "Report generation",
    "reports.generationQueued": "The report is queued for generation.",
    "reports.generationProcessing": "The report is being generated.",
    "reports.generationRetrying": "Generation will resume automatically after a temporary interruption.",
    "reports.generationReady": "The report is ready.",
    "reports.generationFailed": "Report generation failed. Check the parameters and try again.",
    "reports.generationLeaveHint": "You can leave this module and return later; progress tracking will be preserved.",
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
