import enterpriseProcurementFr from "@/locales/enterprise-procurement.fr.json";
import enterpriseProcurementEn from "@/locales/enterprise-procurement.en.json";
import enterpriseSupplierOnboardingFr from "@/locales/enterprise-supplier-onboarding.fr.json";
import enterpriseSupplierOnboardingEn from "@/locales/enterprise-supplier-onboarding.en.json";
import { translateEnterpriseCore, type EnterpriseCoreKey as BaseEnterpriseCoreKey } from "@/lib/i18n";

type EnterpriseProcurementCoreKey = keyof typeof enterpriseProcurementFr;
type EnterpriseSupplierOnboardingKey = keyof typeof enterpriseSupplierOnboardingFr;
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
  | "reports.generationLeaveHint"
  | "reports.schedule.title"
  | "reports.schedule.description"
  | "reports.schedule.new"
  | "reports.schedule.loadFailed"
  | "reports.schedule.created"
  | "reports.schedule.updated"
  | "reports.schedule.active"
  | "reports.schedule.paused"
  | "reports.schedule.nextRun"
  | "reports.schedule.lastRun"
  | "reports.schedule.pause"
  | "reports.schedule.resume"
  | "reports.schedule.archive"
  | "reports.schedule.empty"
  | "reports.schedule.emptyDescription"
  | "reports.schedule.formDescription"
  | "reports.schedule.name"
  | "reports.schedule.frequency"
  | "reports.schedule.timeZone"
  | "reports.schedule.hour"
  | "reports.schedule.minute"
  | "reports.schedule.dayOfWeek"
  | "reports.schedule.dayOfMonth"
  | "reports.schedule.scope"
  | "reports.schedule.periodMode"
  | "reports.schedule.department"
  | "reports.schedule.supplier"
  | "reports.schedule.budget"
  | "reports.schedule.delivery"
  | "reports.schedule.archiveAlways"
  | "reports.schedule.email"
  | "reports.schedule.emailUnavailable"
  | "reports.schedule.recipients"
  | "reports.schedule.recipientsPlaceholder"
  | "reports.schedule.create"
  | "reports.schedule.frequency.DAILY"
  | "reports.schedule.frequency.WEEKLY"
  | "reports.schedule.frequency.MONTHLY"
  | "reports.schedule.period.PREVIOUS_MONTH"
  | "reports.schedule.period.CURRENT_MONTH"
  | "reports.schedule.period.LAST_7_DAYS"
  | "reports.schedule.period.LAST_30_DAYS"
  | "reports.schedule.period.ALL_AVAILABLE"
  | "reports.schedule.period.CUSTOM"
  | "reports.schedule.weekday.0"
  | "reports.schedule.weekday.1"
  | "reports.schedule.weekday.2"
  | "reports.schedule.weekday.3"
  | "reports.schedule.weekday.4"
  | "reports.schedule.weekday.5"
  | "reports.schedule.weekday.6";
export type EnterpriseCoreKey = BaseEnterpriseCoreKey | EnterpriseProcurementCoreKey | EnterpriseSupplierOnboardingKey | EnterpriseCoordinationSupplementKey;

const procurementFragments = { fr: enterpriseProcurementFr, en: enterpriseProcurementEn } as const;
const supplierOnboardingFragments = { fr: enterpriseSupplierOnboardingFr, en: enterpriseSupplierOnboardingEn } as const;

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
    "reports.schedule.title": "Rapports planifiés",
    "reports.schedule.description": "Générez et archivez automatiquement les rapports récurrents sans recréer les filtres à chaque période.",
    "reports.schedule.new": "Nouvelle planification",
    "reports.schedule.loadFailed": "Les planifications de rapports n’ont pas pu être chargées.",
    "reports.schedule.created": "La planification du rapport a été créée.",
    "reports.schedule.updated": "La planification du rapport a été mise à jour.",
    "reports.schedule.active": "Active",
    "reports.schedule.paused": "En pause",
    "reports.schedule.nextRun": "Prochaine exécution",
    "reports.schedule.lastRun": "Dernière livraison",
    "reports.schedule.pause": "Mettre en pause",
    "reports.schedule.resume": "Reprendre",
    "reports.schedule.archive": "Archiver",
    "reports.schedule.empty": "Aucun rapport planifié",
    "reports.schedule.emptyDescription": "Créez une planification pour automatiser un rapport récurrent et conserver son historique.",
    "reports.schedule.formDescription": "Choisissez le rapport, sa périodicité, son périmètre et ses destinations autorisées.",
    "reports.schedule.name": "Nom de la planification",
    "reports.schedule.frequency": "Fréquence",
    "reports.schedule.timeZone": "Fuseau horaire",
    "reports.schedule.hour": "Heure",
    "reports.schedule.minute": "Minute",
    "reports.schedule.dayOfWeek": "Jour de la semaine",
    "reports.schedule.dayOfMonth": "Jour du mois",
    "reports.schedule.scope": "Périmètre récurrent",
    "reports.schedule.periodMode": "Période du rapport",
    "reports.schedule.department": "Département",
    "reports.schedule.supplier": "Fournisseur",
    "reports.schedule.budget": "Budget",
    "reports.schedule.delivery": "Distribution",
    "reports.schedule.archiveAlways": "Chaque exécution est toujours archivée dans DTSC Platform. L’e-mail est une destination supplémentaire.",
    "reports.schedule.email": "Envoyer également par e-mail",
    "reports.schedule.emailUnavailable": "La messagerie sortante DTSC n’est pas configurée pour cette destination. L’archivage interne reste disponible.",
    "reports.schedule.recipients": "Destinataires e-mail",
    "reports.schedule.recipientsPlaceholder": "finance@entreprise.com; direction@entreprise.com",
    "reports.schedule.create": "Créer la planification",
    "reports.schedule.frequency.DAILY": "Chaque jour",
    "reports.schedule.frequency.WEEKLY": "Chaque semaine",
    "reports.schedule.frequency.MONTHLY": "Chaque mois",
    "reports.schedule.period.PREVIOUS_MONTH": "Mois précédent",
    "reports.schedule.period.CURRENT_MONTH": "Mois en cours jusqu’à l’exécution",
    "reports.schedule.period.LAST_7_DAYS": "7 derniers jours",
    "reports.schedule.period.LAST_30_DAYS": "30 derniers jours",
    "reports.schedule.period.ALL_AVAILABLE": "Toutes les données disponibles",
    "reports.schedule.period.CUSTOM": "Période fixe personnalisée",
    "reports.schedule.weekday.0": "Dimanche",
    "reports.schedule.weekday.1": "Lundi",
    "reports.schedule.weekday.2": "Mardi",
    "reports.schedule.weekday.3": "Mercredi",
    "reports.schedule.weekday.4": "Jeudi",
    "reports.schedule.weekday.5": "Vendredi",
    "reports.schedule.weekday.6": "Samedi",
  },
  en: {
    "meetings.action.reason": "Professional reason",
    "meetings.action.reason.required": "A professional reason of at least 3 characters is required.",
    "common.save": "Save",
    "approvals.target.stockTransfer": "Stock transfer",
    "approvals.target.inventoryCount": "Physical inventory",
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
    "reports.schedule.title": "Scheduled reports",
    "reports.schedule.description": "Generate and archive recurring reports automatically without rebuilding the same filters each period.",
    "reports.schedule.new": "New schedule",
    "reports.schedule.loadFailed": "Report schedules could not be loaded.",
    "reports.schedule.created": "The report schedule was created.",
    "reports.schedule.updated": "The report schedule was updated.",
    "reports.schedule.active": "Active",
    "reports.schedule.paused": "Paused",
    "reports.schedule.nextRun": "Next run",
    "reports.schedule.lastRun": "Last delivery",
    "reports.schedule.pause": "Pause",
    "reports.schedule.resume": "Resume",
    "reports.schedule.archive": "Archive",
    "reports.schedule.empty": "No scheduled report",
    "reports.schedule.emptyDescription": "Create a schedule to automate a recurring report and retain its history.",
    "reports.schedule.formDescription": "Choose the report, recurrence, scope and authorized destinations.",
    "reports.schedule.name": "Schedule name",
    "reports.schedule.frequency": "Frequency",
    "reports.schedule.timeZone": "Time zone",
    "reports.schedule.hour": "Hour",
    "reports.schedule.minute": "Minute",
    "reports.schedule.dayOfWeek": "Day of week",
    "reports.schedule.dayOfMonth": "Day of month",
    "reports.schedule.scope": "Recurring scope",
    "reports.schedule.periodMode": "Report period",
    "reports.schedule.department": "Department",
    "reports.schedule.supplier": "Supplier",
    "reports.schedule.budget": "Budget",
    "reports.schedule.delivery": "Distribution",
    "reports.schedule.archiveAlways": "Every run is always archived in DTSC Platform. Email is an additional destination.",
    "reports.schedule.email": "Also send by email",
    "reports.schedule.emailUnavailable": "DTSC outbound email is not configured for this destination. Internal archiving remains available.",
    "reports.schedule.recipients": "Email recipients",
    "reports.schedule.recipientsPlaceholder": "finance@company.com; management@company.com",
    "reports.schedule.create": "Create schedule",
    "reports.schedule.frequency.DAILY": "Daily",
    "reports.schedule.frequency.WEEKLY": "Weekly",
    "reports.schedule.frequency.MONTHLY": "Monthly",
    "reports.schedule.period.PREVIOUS_MONTH": "Previous month",
    "reports.schedule.period.CURRENT_MONTH": "Current month through run date",
    "reports.schedule.period.LAST_7_DAYS": "Last 7 days",
    "reports.schedule.period.LAST_30_DAYS": "Last 30 days",
    "reports.schedule.period.ALL_AVAILABLE": "All available data",
    "reports.schedule.period.CUSTOM": "Fixed custom period",
    "reports.schedule.weekday.0": "Sunday",
    "reports.schedule.weekday.1": "Monday",
    "reports.schedule.weekday.2": "Tuesday",
    "reports.schedule.weekday.3": "Wednesday",
    "reports.schedule.weekday.4": "Thursday",
    "reports.schedule.weekday.5": "Friday",
    "reports.schedule.weekday.6": "Saturday",
  },
};

export function enterpriseCoreT(locale: string | null | undefined, key: EnterpriseCoreKey, vars?: Record<string, string | number>) {
  const normalizedLocale = locale === "en" ? "en" : "fr";
  const procurementDictionary = procurementFragments[normalizedLocale];
  const supplierOnboardingDictionary = supplierOnboardingFragments[normalizedLocale];
  const procurementTemplate = procurementDictionary[key as EnterpriseProcurementCoreKey];
  const supplierOnboardingTemplate = supplierOnboardingDictionary[key as EnterpriseSupplierOnboardingKey];
  const supplementalTemplate = coordinationSupplements[normalizedLocale][key as EnterpriseCoordinationSupplementKey];
  const template = typeof procurementTemplate === "string"
    ? procurementTemplate
    : typeof supplierOnboardingTemplate === "string"
      ? supplierOnboardingTemplate
      : typeof supplementalTemplate === "string"
        ? supplementalTemplate
        : translateEnterpriseCore(locale, key as BaseEnterpriseCoreKey);
  if (!vars) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_match, name: string) => String(vars[name] ?? ""));
}

export function enterpriseCoreIntlLocale(locale: string | null | undefined) { return locale === "en" ? "en-US" : "fr-FR"; }
