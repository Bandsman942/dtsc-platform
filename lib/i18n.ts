import fr from "@/locales/fr.json";
import en from "@/locales/en.json";
import enterpriseProcurementFr from "@/locales/enterprise-procurement.fr.json";
import enterpriseProcurementEn from "@/locales/enterprise-procurement.en.json";
import enterpriseFinanceFr from "@/locales/enterprise-finance.fr.json";
import enterpriseFinanceEn from "@/locales/enterprise-finance.en.json";
import enterpriseCoreFr from "@/locales/enterprise-core.fr.json";
import enterpriseCoreEn from "@/locales/enterprise-core.en.json";
import professionalErpFr from "@/locales/professional-erp.fr.json";
import professionalErpEn from "@/locales/professional-erp.en.json";
import professionalErpCommercialFr from "@/locales/professional-erp-commercial.fr.json";
import professionalErpCommercialEn from "@/locales/professional-erp-commercial.en.json";
import professionalErpCatalogFr from "@/locales/professional-erp-catalog.fr.json";
import professionalErpCatalogEn from "@/locales/professional-erp-catalog.en.json";
import professionalErpSalesFr from "@/locales/professional-erp-sales.fr.json";
import professionalErpSalesEn from "@/locales/professional-erp-sales.en.json";
import professionalErpOperationsFr from "@/locales/professional-erp-operations.fr.json";
import professionalErpOperationsEn from "@/locales/professional-erp-operations.en.json";
import professionalErpPeopleFr from "@/locales/professional-erp-people.fr.json";
import professionalErpPeopleEn from "@/locales/professional-erp-people.en.json";
import sharedWorkFr from "@/locales/shared-work.fr.json";
import sharedWorkEn from "@/locales/shared-work.en.json";
import collaborationExperienceFr from "@/locales/collaboration-experience.fr.json";
import collaborationExperienceEn from "@/locales/collaboration-experience.en.json";
import activitiesFr from "@/locales/activities.fr.json";
import activitiesEn from "@/locales/activities.en.json";
import calendarScheduleFr from "@/locales/calendar-schedule.fr.json";
import calendarScheduleEn from "@/locales/calendar-schedule.en.json";
import calendarWorkspaceFr from "@/locales/calendar-workspace.fr.json";
import calendarWorkspaceEn from "@/locales/calendar-workspace.en.json";

type Dictionary = typeof fr;
type Locale = "fr" | "en";
const dictionaries: Record<Locale, Dictionary> = { fr, en: en as Dictionary };

const workspaceGeneralizationDictionaries = {
  fr: {
    trackedItems: "Éléments suivis", activeItems: "Éléments actifs", attentionItems: "Priorités à traiter", recommendedFlow: "Flux recommandé", recommendedFlowDescription: "Repères opérationnels du module, sans créer de couche de carte supplémentaire.", volumeOverview: "Lecture rapide des volumes", volumeOverviewDescription: "Répartition des éléments visibles après application de la période.", noActiveFilter: "Aucun filtre actif", start: "Début", end: "Fin", reset: "Réinitialiser", registers: "registres", newItem: "Nouveau", noResult: "Aucun résultat", noResultDescription: "Aucun élément ne correspond à cette recherche.", noContent: "Aucun contenu", edit: "Modifier", delete: "Supprimer", downloadFile: "Télécharger le fichier", confirmDelete: "Supprimer cet élément", cancel: "Annuler", saveChanges: "Enregistrer les modifications", companyIndicators: "Indicateurs entreprise", activeCollaborators: "Collaborateurs actifs", activeDepartments: "Départements actifs", openRequests: "Demandes ouvertes", upcomingMeetings: "Réunions à venir", configure: "Configurer", openActivities: "Ouvrir les activités", currentCompanyData: "Données actuelles de l'entreprise", accessResponsibilities: "Accès et responsabilités", availableActions: "Actions disponibles", enterpriseAdministration: "Administration entreprise", enterpriseContext: "Contexte entreprise", enterpriseContextDescription: "Abonnement, secteur et capacités réellement actives pour cette organisation.", administrationIndicators: "Indicateurs administration entreprise", configurationGovernance: "Configuration et gouvernance", recentRequests: "Demandes récentes", healthModules: "Santé — sous-modules métier", healthModulesDescription: "Le shell Santé adopte le workspace DTSC sans modifier les workflows cliniques ni leurs permissions.", pharmacySector: "Secteur pharmacie", pharmacyTitle: "Pilotage pharmacie", pharmacyDescription: "Accédez aux produits, lots, stocks, réceptions, ventes, prescriptions, achats, caisse, qualité, documents et paramètres sans empiler des cartes de navigation.", submodules: "Sous-modules", pharmacyDashboard: "Tableau de bord pharmacie", pharmacyDashboardDescription: "Lecture compacte des signaux opérationnels prioritaires.", pharmacyIndicators: "Indicateurs pharmacie", details: "Voir détail", archive: "Archiver", open: "Ouvrir", commonFoundation: "Socle commun", currentContext: "Contexte actif", toProcess: "À traiter", scheduled: "Planifiées",
  },
  en: {
    trackedItems: "Tracked items", activeItems: "Active items", attentionItems: "Items requiring attention", recommendedFlow: "Recommended flow", recommendedFlowDescription: "Operational module guidance without adding another decorative card layer.", volumeOverview: "Volume overview", volumeOverviewDescription: "Distribution of visible items after the period filter is applied.", noActiveFilter: "No active filter", start: "Start", end: "End", reset: "Reset", registers: "registers", newItem: "New", noResult: "No results", noResultDescription: "No item matches this search.", noContent: "No content", edit: "Edit", delete: "Delete", downloadFile: "Download file", confirmDelete: "Delete this item", cancel: "Cancel", saveChanges: "Save changes", companyIndicators: "Company indicators", activeCollaborators: "Active collaborators", activeDepartments: "Active departments", openRequests: "Open requests", upcomingMeetings: "Upcoming meetings", configure: "Configure", openActivities: "Open activities", currentCompanyData: "Current company data", accessResponsibilities: "Access and responsibilities", availableActions: "Available actions", enterpriseAdministration: "Enterprise administration", enterpriseContext: "Enterprise context", enterpriseContextDescription: "Subscription, sector and capabilities currently active for this organization.", administrationIndicators: "Enterprise administration indicators", configurationGovernance: "Configuration and governance", recentRequests: "Recent requests", healthModules: "Health — business submodules", healthModulesDescription: "The Health shell adopts the DTSC workspace without changing clinical workflows or permissions.", pharmacySector: "Pharmacy sector", pharmacyTitle: "Pharmacy operations", pharmacyDescription: "Access products, batches, inventory, receipts, sales, prescriptions, purchases, cash, quality, documents and settings without nested navigation cards.", submodules: "Submodules", pharmacyDashboard: "Pharmacy dashboard", pharmacyDashboardDescription: "Compact view of priority operational signals.", pharmacyIndicators: "Pharmacy indicators", details: "View details", archive: "Archive", open: "Open", commonFoundation: "Common foundation", currentContext: "Current context", toProcess: "To process", scheduled: "Scheduled",
  },
} as const;

const enterpriseProcurementDictionaries = { fr: enterpriseProcurementFr, en: enterpriseProcurementEn } as const;
const enterpriseFinanceDictionaries = { fr: enterpriseFinanceFr, en: enterpriseFinanceEn } as const;
const enterpriseCoreDictionaries = { fr: enterpriseCoreFr, en: enterpriseCoreEn } as const;
const professionalErpDictionaries = {
  fr: { ...professionalErpFr, ...professionalErpCommercialFr, ...professionalErpCatalogFr, ...professionalErpSalesFr, ...professionalErpOperationsFr, ...professionalErpPeopleFr },
  en: { ...professionalErpEn, ...professionalErpCommercialEn, ...professionalErpCatalogEn, ...professionalErpSalesEn, ...professionalErpOperationsEn, ...professionalErpPeopleEn },
} as const;
const sharedWorkDictionaries = { fr: sharedWorkFr, en: sharedWorkEn } as const;
const collaborationExperienceDictionaries = { fr: collaborationExperienceFr, en: collaborationExperienceEn } as const;
const activitiesDictionaries = { fr: activitiesFr, en: activitiesEn } as const;
const calendarScheduleDictionaries = { fr: calendarScheduleFr, en: calendarScheduleEn } as const;
const calendarWorkspaceDictionaries = { fr: calendarWorkspaceFr, en: calendarWorkspaceEn } as const;
export type WorkspaceGeneralizationKey = keyof typeof workspaceGeneralizationDictionaries.fr;
export type EnterpriseProcurementKey = keyof typeof enterpriseProcurementDictionaries.fr;
export type EnterpriseFinanceKey = keyof typeof enterpriseFinanceDictionaries.fr;
export type EnterpriseCoreKey = keyof typeof enterpriseCoreDictionaries.fr;
export type ProfessionalErpKey = keyof typeof professionalErpDictionaries.fr;
export type SharedWorkKey = keyof typeof sharedWorkDictionaries.fr;
export type CollaborationExperienceKey = keyof typeof collaborationExperienceDictionaries.fr;
export type ActivitiesKey = keyof typeof activitiesDictionaries.fr;
export type CalendarScheduleKey = keyof typeof calendarScheduleDictionaries.fr;
export type CalendarWorkspaceKey = keyof typeof calendarWorkspaceDictionaries.fr;

export function getDictionary(locale?: string | null) { return dictionaries[locale === "en" ? "en" : "fr"]; }
export function translate(locale: string | null | undefined, key: string) { const dictionary = getDictionary(locale); const localized = key.split(".").reduce<unknown>((current, part) => current && typeof current === "object" && part in current ? (current as Record<string, unknown>)[part] : undefined, dictionary); if (typeof localized === "string") return localized; const fallback = key.split(".").reduce<unknown>((current, part) => current && typeof current === "object" && part in current ? (current as Record<string, unknown>)[part] : undefined, fr); return typeof fallback === "string" ? fallback : key; }
export function translateWorkspaceGeneralization(locale: string | null | undefined, key: WorkspaceGeneralizationKey) { const dictionary = workspaceGeneralizationDictionaries[locale === "en" ? "en" : "fr"]; return dictionary[key] || workspaceGeneralizationDictionaries.fr[key]; }
export function translateEnterpriseProcurement(locale: string | null | undefined, key: EnterpriseProcurementKey) { const dictionary = enterpriseProcurementDictionaries[locale === "en" ? "en" : "fr"]; return dictionary[key] || enterpriseProcurementDictionaries.fr[key]; }
export function translateEnterpriseFinance(locale: string | null | undefined, key: EnterpriseFinanceKey) { const dictionary = enterpriseFinanceDictionaries[locale === "en" ? "en" : "fr"]; return dictionary[key] || enterpriseFinanceDictionaries.fr[key]; }
export function translateEnterpriseCore(locale: string | null | undefined, key: EnterpriseCoreKey) { const dictionary = enterpriseCoreDictionaries[locale === "en" ? "en" : "fr"]; return dictionary[key] || enterpriseCoreDictionaries.fr[key]; }
export function translateProfessionalErp(locale: string | null | undefined, key: ProfessionalErpKey) { const dictionary = professionalErpDictionaries[locale === "en" ? "en" : "fr"]; return dictionary[key] || professionalErpDictionaries.fr[key]; }
export function translateSharedWork(locale: string | null | undefined, key: SharedWorkKey) { const dictionary = sharedWorkDictionaries[locale === "en" ? "en" : "fr"]; return dictionary[key] || sharedWorkDictionaries.fr[key]; }
export function translateCollaborationExperience(locale: string | null | undefined, key: CollaborationExperienceKey) { const dictionary = collaborationExperienceDictionaries[locale === "en" ? "en" : "fr"]; return dictionary[key] || collaborationExperienceDictionaries.fr[key]; }
export function translateActivities(locale: string | null | undefined, key: ActivitiesKey) { const dictionary = activitiesDictionaries[locale === "en" ? "en" : "fr"]; return dictionary[key] || activitiesDictionaries.fr[key]; }
export function translateCalendarSchedule(locale: string | null | undefined, key: CalendarScheduleKey) { const dictionary = calendarScheduleDictionaries[locale === "en" ? "en" : "fr"]; return dictionary[key] || calendarScheduleDictionaries.fr[key]; }
export function translateCalendarWorkspace(locale: string | null | undefined, key: CalendarWorkspaceKey) { const dictionary = calendarWorkspaceDictionaries[locale === "en" ? "en" : "fr"]; return dictionary[key] || calendarWorkspaceDictionaries.fr[key]; }