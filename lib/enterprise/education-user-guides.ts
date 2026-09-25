import type { SectorUserGuide } from "@/lib/enterprise/sector-user-guides";

export const EDUCATION_USER_GUIDES: Record<string, SectorUserGuide> = {
  EDUCATION_SETTINGS: {
    title: "Paramètres Education",
    purpose: "Configurer l’identité académique de l’établissement, son fuseau horaire et les règles de base sans dupliquer l’organisation DTSC.",
    prerequisites: [
      "L’entreprise doit utiliser le secteur Education et disposer du module Paramètres Education.",
      "La modification exige une permission de gestion Education.",
    ],
    steps: [
      "Ouvrez Paramètres Education depuis la navigation de l’entreprise.",
      "Renseignez le type d’établissement, la dénomination officielle, la référence d’agrément et le fuseau horaire.",
      "Créez les campus depuis Structure académique puis choisissez le campus principal.",
      "Enregistrez ; le numéro de révision protège contre les modifications concurrentes.",
    ],
    workflow: ["Non configuré → Configuré → Mise à jour révisionnée."],
    controls: [
      "Le campus principal doit appartenir à l’entreprise active.",
      "Les paramètres Education ne recréent ni l’organisation, ni les membres, ni les rôles globaux.",
    ],
    troubleshooting: [
      "Campus principal absent : créez d’abord un campus dans Structure académique.",
      "Conflit de version : actualisez la page puis reprenez la modification.",
    ],
    relatedModules: [
      { code: "ACADEMIC_STRUCTURE", label: "Structure académique", reason: "Créer les campus, années, niveaux, classes, matières et offres de cours." },
      { code: "ACADEMIC_CALENDAR", label: "Calendrier académique", reason: "Planifier les dates liées à la structure configurée." },
    ],
  },
  ACADEMIC_STRUCTURE: {
    title: "Structure académique",
    purpose: "Construire le référentiel académique canonique : campus, années, périodes, niveaux, départements, programmes, classes, matières et offres de cours.",
    prerequisites: [
      "Paramètres Education actif.",
      "Permission de lecture pour consulter ; permission d’écriture pour créer ou modifier ; permission de gestion pour clôturer ou archiver.",
    ],
    steps: [
      "Suivez l’assistant : paramètres, premier campus, première année, niveaux et matières.",
      "Créez les périodes à l’intérieur de l’année correspondante.",
      "Ajoutez niveaux, départements et programmes selon la structure réelle de l’établissement.",
      "Créez les classes en choisissant la même année, le campus et le niveau.",
      "Créez les matières puis les offres de cours en reliant année, période éventuelle, campus, matière et classe éventuelle.",
      "Utilisez les filtres, la recherche et la pagination pour les listes importantes.",
    ],
    workflow: [
      "Année/période : Brouillon → Active → Clôturée ; une période utilisée reste dans l’historique.",
      "Autres référentiels : Actif/Inactif → Archivé lorsque l’archivage est autorisé.",
    ],
    controls: [
      "Toutes les références sont revalidées dans la même entreprise côté serveur.",
      "Une offre de cours ne peut pas pointer vers une période d’une autre année ou une classe d’un autre campus.",
      "Aucune suppression physique n’est exposée par l’API EDU-1.",
    ],
    troubleshooting: [
      "Référence refusée : actualisez la liste ; elle a pu être archivée ou appartenir à un autre contexte.",
      "Année impossible à archiver : elle est déjà utilisée ; clôturez-la pour préserver l’historique.",
      "Action absente : votre rôle ne dispose pas de la permission requise.",
    ],
    relatedModules: [
      { code: "EDUCATION_SETTINGS", label: "Paramètres Education", reason: "Définir les règles de base et le campus principal." },
      { code: "ACADEMIC_CALENDAR", label: "Calendrier académique", reason: "Utiliser les années, périodes et campus dans la planification." },
    ],
  },
  ACADEMIC_CALENDAR: {
    title: "Calendrier académique",
    purpose: "Planifier les événements académiques par année, période et campus tout en conservant leur historique.",
    prerequisites: [
      "Structure académique active avec au moins une année.",
      "Permission Calendrier Education adaptée à l’action.",
    ],
    steps: [
      "Choisissez Nouvelle entrée.",
      "Sélectionnez l’année, puis éventuellement la période et le campus.",
      "Choisissez le type d’événement, renseignez le titre et les dates.",
      "Enregistrez puis utilisez recherche, statut et pagination pour retrouver les événements.",
    ],
    workflow: ["Actif ↔ Inactif → Archivé selon les permissions disponibles."],
    controls: [
      "L’événement doit se trouver dans les bornes de l’année ; s’il est lié à une période, il doit aussi rester dans ses bornes.",
      "Toutes les références année/période/campus sont tenant-scoped.",
    ],
    troubleshooting: [
      "Période refusée : elle n’appartient pas à l’année choisie.",
      "Dates refusées : vérifiez qu’elles restent dans l’année et la période sélectionnées.",
    ],
    relatedModules: [
      { code: "ACADEMIC_STRUCTURE", label: "Structure académique", reason: "Configurer les années, périodes et campus utilisés par le calendrier." },
      { code: "EDUCATION_SETTINGS", label: "Paramètres Education", reason: "Définir le fuseau horaire et le campus principal." },
    ],
  },
};
