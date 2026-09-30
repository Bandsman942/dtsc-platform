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
  ADMISSIONS: {
    title: "Admissions",
    purpose: "Gérer les candidatures, leur étude, la décision et la conversion contrôlée vers une inscription sans créer de compte DTSC automatiquement.",
    prerequisites: [
      "Structure académique active avec une année et un campus.",
      "Permission Admissions en lecture/écriture ; la décision exige la permission d’approbation.",
    ],
    steps: [
      "Créez un dossier candidat avec l’année, le campus et les références académiques visées.",
      "Soumettez le dossier puis démarrez son étude.",
      "Acceptez, refusez ou placez le dossier en liste d’attente selon vos permissions.",
      "Après acceptation, créez l’inscription et l’affectation initiale ; l’opération est idempotente.",
      "Les pièces justificatives restent des Documents communs privés reliés au dossier.",
    ],
    workflow: [
      "Brouillon → Soumis → En étude → Accepté / Refusé / Liste d’attente.",
      "Accepté → Inscrit ; un même dossier ne crée pas deux étudiants ou deux inscriptions.",
    ],
    controls: [
      "Toutes les références académiques sont revalidées dans la même entreprise.",
      "Une décision est historisée ; elle n’est pas écrasée silencieusement.",
      "Aucune admission ne crée automatiquement User ou OrganizationMember.",
    ],
    troubleshooting: [
      "Inscription refusée : le dossier doit être accepté et utiliser des références académiques encore actives.",
      "Conflit de version : actualisez le dossier avant de reprendre l’action.",
    ],
    relatedModules: [
      { code: "ACADEMIC_STRUCTURE", label: "Structure académique", reason: "Fournir année, campus, programme, niveau et classe." },
      { code: "STUDENTS", label: "Étudiants", reason: "Consulter l’étudiant et l’inscription créés." },
      { code: "DOCUMENTS", label: "Documents", reason: "Conserver les pièces justificatives privées." },
    ],
  },
  STUDENTS: {
    title: "Étudiants",
    purpose: "Consulter le registre étudiant et gérer inscriptions, affectations, transferts, retraits et historique sans supprimer les données académiques.",
    prerequisites: [
      "Module Admissions actif.",
      "Permission Étudiants adaptée à la consultation ou à la modification.",
    ],
    steps: [
      "Recherchez un étudiant par nom ou numéro.",
      "Consultez son inscription récente et son affectation actuelle.",
      "Transférez-le vers un autre campus, programme, niveau ou classe : l’ancienne affectation est clôturée et conservée.",
      "Retirez ou terminez une inscription lorsque le parcours l’exige.",
      "Réactivez une inscription retirée avec une nouvelle affectation si le processus métier l’autorise.",
      "Liez les tuteurs autorisés au dossier étudiant.",
    ],
    workflow: ["Inscription active → Transfert / Retrait / Fin ; chaque transition crée un historique."],
    controls: [
      "Un transfert ne réécrit jamais l’ancien placement.",
      "Un étudiant peut exister sans compte DTSC.",
      "Les liens User et tiers sont validés dans la même entreprise avant sauvegarde.",
    ],
    troubleshooting: [
      "Classe refusée : elle ne correspond pas à l’année, au campus ou au niveau de l’inscription.",
      "Action absente : votre fonction ne possède pas la permission d’écriture requise.",
    ],
    relatedModules: [
      { code: "ADMISSIONS", label: "Admissions", reason: "Créer les étudiants à partir des dossiers acceptés." },
      { code: "GUARDIANS", label: "Parents & tuteurs", reason: "Gérer les responsables liés à l’étudiant." },
      { code: "ACADEMIC_STRUCTURE", label: "Structure académique", reason: "Fournir les affectations académiques." },
    ],
  },
  GUARDIANS: {
    title: "Parents & tuteurs",
    purpose: "Gérer les responsables liés aux étudiants sans transformer automatiquement ces personnes en membres de l’entreprise.",
    prerequisites: [
      "Module Étudiants actif.",
      "Permission Parents & tuteurs adaptée à l’action.",
    ],
    steps: [
      "Créez le profil du tuteur avec ses coordonnées utiles.",
      "Reliez-le à un étudiant et choisissez le type de relation.",
      "Indiquez s’il est principal, tuteur légal, contact facturation ou destinataire de notifications.",
      "Un lien éventuel vers un compte DTSC ou un tiers canonique reste explicite et tenant-scoped.",
    ],
    workflow: ["Tuteur actif → relation étudiant effective → relation historisée/archivée si elle prend fin."],
    controls: [
      "Le lien vers un User ne crée aucun membership.",
      "Le lien vers EnterpriseBusinessParty doit appartenir à la même entreprise.",
      "Un tuteur ne donne jamais accès aux données d’un autre étudiant sans relation autorisée.",
    ],
    troubleshooting: [
      "Compte refusé : le compte DTSC sélectionné n’est pas membre actif de cette entreprise.",
      "Tiers refusé : le tiers n’appartient pas à l’entreprise ou est archivé.",
    ],
    relatedModules: [
      { code: "STUDENTS", label: "Étudiants", reason: "Définir les étudiants liés au tuteur." },
      { code: "DOCUMENTS", label: "Documents", reason: "Conserver les justificatifs privés si nécessaire." },
    ],
  },
};
