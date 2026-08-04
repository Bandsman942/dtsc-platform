export type ContextualGuideStep = {
  title: string;
  description: string;
  actions?: string[];
  cautions?: string[];
};

export type ContextualUserGuide = {
  code: string;
  title: string;
  summary: string;
  audience: string;
  updatedAt: string;
  capabilities: string[];
  steps: ContextualGuideStep[];
  limitations?: string[];
};

export const ITERATION04_USER_GUIDES = {
  CALENDAR: {
    code: "CALENDAR",
    title: "Guide du calendrier interne",
    summary: "Organiser son agenda, consulter les disponibilités, inviter des participants, traiter les conflits et suivre les événements dont on est responsable ou participant accepté.",
    audience: "Collaborateurs DTSC et membres actifs des entreprises clientes",
    updatedAt: "2026-08-04",
    capabilities: [
      "Vue personnelle des événements créés, dirigés ou acceptés",
      "Vue d'équipe autorisée selon les responsabilités",
      "Filtres de disponibilités par période, date précise, département et collaborateur",
      "Détection des conflits du responsable et de chaque participant invité",
      "Invitation avec acceptation ou refus avant synchronisation dans le calendrier du participant",
      "CRUD des événements dont l'utilisateur est le créateur responsable",
      "Checklists calculant automatiquement la progression",
      "Commentaires, mentions et historique des dates de création et de modification",
      "Réservation de ressources et suggestions locales de créneaux",
      "Synchronisation externe bloquée proprement tant que la configuration n'est pas disponible",
    ],
    steps: [
      {
        title: "Explorer les disponibilités",
        description: "Ouvrez l'aperçu des disponibilités puis utilisez le rail de période et le rail des départements.",
        actions: [
          "Choisir Aujourd'hui, Cette semaine, Ce mois, Cette année ou Date précise",
          "Sélectionner un département ou Tous les départements",
          "Passer de la vue liste à la synthèse par collaborateur ou par statut",
          "Vérifier les créneaux, exceptions, absences, télétravail et chevauchements",
        ],
      },
      {
        title: "Créer un événement",
        description: "Le créateur reste toujours responsable. Les autres collaborateurs sont ajoutés comme participants invités.",
        actions: [
          "Renseigner le titre, le type, la période, le lieu et la priorité",
          "Sélectionner les participants à inviter",
          "Ajouter une checklist de choses à réaliser",
          "Examiner les conflits détectés avant d'enregistrer",
        ],
        cautions: ["Il n'est pas possible d'imposer un autre collaborateur comme responsable de l'événement."],
      },
      {
        title: "Répondre à une invitation",
        description: "Une invitation en attente ne s'ajoute pas encore au calendrier personnel du participant.",
        actions: [
          "Ouvrir la section Invitations",
          "Consulter les horaires et les conflits éventuels",
          "Accepter pour synchroniser l'événement dans son calendrier",
          "Refuser sans modifier le calendrier du créateur",
        ],
      },
      {
        title: "Modifier ou annuler",
        description: "Seul le créateur responsable peut modifier ou annuler l'événement.",
        actions: [
          "Ouvrir les détails",
          "Modifier les informations, les participants ou la checklist",
          "Contrôler la date de création et la date de dernière modification",
          "Annuler avec confirmation lorsque l'événement ne doit plus avoir lieu",
        ],
      },
    ],
    limitations: [
      "Les fournisseurs de calendriers externes exigent des variables d'environnement et des consentements OAuth. Le bouton reste désactivé avec une explication tant que ces éléments ne sont pas configurés.",
      "Les suggestions automatiques utilisent d'abord les disponibilités internes. Les moteurs externes ne sont pas appelés sans configuration valide.",
    ],
  },
  DTSC_ACTIVITIES: {
    code: "DTSC_ACTIVITIES",
    title: "Guide Activités DTSC",
    summary: "Consulter, exécuter et commenter les tâches, opérations, demandes, réunions, rapports et prestations qui concernent le collaborateur connecté.",
    audience: "Collaborateurs internes DTSC",
    updatedAt: "2026-08-04",
    capabilities: [
      "Listes et vues Kanban pour les objets dont le statut évolue",
      "Changement de statut réservé au destinataire explicite ou au responsable",
      "Checklists calculant automatiquement la progression",
      "Commentaires CRUD, réponses et mentions cliquables",
      "CRUD des événements créés par le collaborateur",
      "Historique des prestations ouvrable en détail",
      "Soumission d'une période passée uniquement avec permission individuelle explicite",
      "Affichage des dates de création et de dernière modification",
    ],
    steps: [
      {
        title: "Trouver une activité",
        description: "Utilisez la recherche, la période et le mode Liste/Kanban.",
        actions: [
          "Filtrer par texte, statut, responsable ou période",
          "Ouvrir une carte pour afficher son détail complet",
          "Utiliser le Kanban pour comprendre les éléments à faire, en cours, bloqués et terminés",
        ],
      },
      {
        title: "Faire avancer une opération",
        description: "Le serveur vérifie que vous êtes le destinataire ou le responsable avant toute transition.",
        actions: [
          "Cocher les éléments réellement accomplis dans la checklist",
          "Laisser le système recalculer la progression",
          "Ajouter un commentaire ou signaler un blocage",
          "Changer le statut uniquement lorsqu'une transition est autorisée",
        ],
      },
      {
        title: "Mentionner un collaborateur",
        description: "Tapez @ puis choisissez une personne autorisée dans le contexte de l'activité.",
        actions: [
          "Cliquer sur la mention pour ouvrir les actions professionnelles",
          "Afficher le profil professionnel",
          "Ouvrir ou démarrer une conversation",
          "Consulter le calendrier autorisé ou préparer une invitation à un événement",
        ],
      },
      {
        title: "Consulter les prestations",
        description: "Chaque ligne historique est ouvrable et affiche les entrées, les commentaires de validation, les révisions et les durées.",
        actions: [
          "Ouvrir une semaine passée",
          "Contrôler les prestations déclarées et validées",
          "Soumettre une semaine passée seulement si la permission nominative est active",
        ],
      },
    ],
  },
  ENTERPRISE_ACTIVITIES: {
    code: "ENTERPRISE_ACTIVITIES",
    title: "Guide Activités entreprise",
    summary: "Gérer les activités opérationnelles de l'entreprise active sans sortir de son périmètre multi-tenant.",
    audience: "Membres actifs d'une entreprise cliente",
    updatedAt: "2026-08-04",
    capabilities: [
      "Tâches et opérations tenant-scoped",
      "Vues Liste et Kanban",
      "Progression calculée depuis les checklists et sous-tâches",
      "Commentaires et mentions professionnelles",
      "Transitions réservées au responsable, au destinataire ou au rôle explicitement autorisé",
      "Deep links vers l'objet précis après contrôle d'accès",
    ],
    steps: [
      {
        title: "Choisir le contexte",
        description: "Vérifiez toujours le nom de l'entreprise affiché dans l'en-tête avant de créer ou modifier une activité.",
      },
      {
        title: "Créer et assigner",
        description: "Créez l'activité, choisissez un responsable actif de la même entreprise et ajoutez une checklist mesurable.",
      },
      {
        title: "Exécuter et commenter",
        description: "Le responsable coche les éléments réalisés, répond aux commentaires et demande une validation lorsque le processus l'exige.",
      },
    ],
  },
  TASKS_OPERATIONS: {
    code: "TASKS_OPERATIONS",
    title: "Guide Tâches et opérations",
    summary: "Planifier, assigner, exécuter et suivre les tâches et opérations avec checklists, blocages, dépendances et filtres sauvegardés.",
    audience: "Collaborateurs et responsables opérationnels autorisés",
    updatedAt: "2026-08-04",
    capabilities: [
      "Vue Liste et Kanban",
      "Checklists, sous-tâches et progression calculée",
      "Dépendances et détection de cycles",
      "Blocages, résolution et commentaires",
      "Filtres sauvegardés",
      "Transitions réservées au responsable ou au destinataire",
    ],
    steps: [
      { title: "Créer", description: "Définissez le résultat attendu, le responsable, l'échéance, la priorité et la checklist." },
      { title: "Exécuter", description: "Cochez les éléments réalisés et documentez les blocages au lieu de saisir un pourcentage arbitraire." },
      { title: "Clôturer", description: "La clôture n'est disponible qu'une fois les conditions métier et les permissions remplies." },
    ],
  },
  INTERNAL_REQUESTS: {
    code: "INTERNAL_REQUESTS",
    title: "Guide Demandes internes",
    summary: "Formuler, prendre en charge, répondre, résoudre, clôturer et rouvrir une demande interne avec historique complet.",
    audience: "Demandeurs, destinataires et responsables autorisés",
    updatedAt: "2026-08-04",
    capabilities: [
      "Vue Liste et Kanban",
      "Prise en charge par le destinataire",
      "Réponses, commentaires et pièces jointes privées",
      "Résolution, clôture et réouverture auditées",
      "SLA configurables lorsque l'administrateur les active",
    ],
    steps: [
      { title: "Soumettre", description: "Décrivez la demande, choisissez le destinataire, la priorité et l'échéance attendue." },
      { title: "Traiter", description: "Le destinataire explicite prend en charge, répond et fait avancer le statut." },
      { title: "Clôturer", description: "Le demandeur ou le responsable autorisé vérifie la réponse avant clôture." },
    ],
  },
  VALIDATIONS: {
    code: "VALIDATIONS",
    title: "Guide Validations",
    summary: "Soumettre une version, décider, demander une correction, resoumettre et déléguer dans un circuit audité.",
    audience: "Soumissionnaires, validateurs et délégués autorisés",
    updatedAt: "2026-08-04",
    capabilities: [
      "Versions de soumission et snapshots",
      "Approbation, refus ou correction motivée",
      "Resoumission avec nouvelle version",
      "Délégation contrôlée",
      "Interdiction de l'auto-approbation",
    ],
    steps: [
      { title: "Soumettre", description: "Vérifiez l'objet, les documents et le validateur avant de créer une version." },
      { title: "Décider", description: "Le validateur ouvre le snapshot et enregistre une décision motivée." },
      { title: "Corriger", description: "Le soumissionnaire traite la demande de correction puis crée une nouvelle version." },
    ],
  },
  MEETINGS: {
    code: "MEETINGS",
    title: "Guide Réunions",
    summary: "Préparer l'ordre du jour, inviter les participants, publier le compte rendu et transformer les décisions en tâches.",
    audience: "Organisateurs, participants et responsables de compte rendu",
    updatedAt: "2026-08-04",
    capabilities: [
      "Ordre du jour persistant",
      "Invitations et participation contrôlée",
      "Appels audio et vidéo selon les capacités disponibles",
      "Versions de compte rendu",
      "Décisions et tâches de suivi liées",
    ],
    steps: [
      { title: "Préparer", description: "Renseignez l'ordre du jour, les participants et les objectifs de la réunion." },
      { title: "Tenir", description: "Utilisez les commentaires ou l'appel configuré et consignez les décisions." },
      { title: "Publier", description: "Publiez une version du compte rendu et créez les tâches de suivi nécessaires." },
    ],
  },
  WORKFLOWS: {
    code: "WORKFLOWS",
    title: "Guide Workflows",
    summary: "Lancer et exécuter des processus versionnés avec transitions, conditions serveur, idempotence et historique.",
    audience: "Concepteurs et acteurs de workflows autorisés",
    updatedAt: "2026-08-04",
    capabilities: [
      "Définitions versionnées",
      "Instances et transitions auditées",
      "Conditions serveur allow-listées",
      "Idempotence, retries et événements",
      "Deep link vers l'instance précise",
    ],
    steps: [
      { title: "Choisir une définition", description: "Utilisez uniquement une version active et compatible avec le contexte de l'entreprise." },
      { title: "Démarrer", description: "Renseignez les acteurs et les objets sources nécessaires." },
      { title: "Exécuter", description: "Chaque acteur ne voit que les transitions qu'il est autorisé à déclencher." },
    ],
  },
  DOCUMENTS: {
    code: "DOCUMENTS",
    title: "Guide Documents",
    summary: "Téléverser, versionner, prévisualiser, relier et partager des documents privés selon les permissions de l'entreprise.",
    audience: "Utilisateurs autorisés du module Documents",
    updatedAt: "2026-08-04",
    capabilities: [
      "Upload privé avec validation MIME et taille",
      "Versions et historique",
      "Liens vers plusieurs objets sans dupliquer le fichier",
      "Téléchargements audités",
      "Indexation avancée et comparaison visuelle désactivées proprement sans configuration",
    ],
    steps: [
      { title: "Téléverser", description: "Choisissez un fichier autorisé, un titre lisible et la confidentialité appropriée." },
      { title: "Versionner", description: "Ajoutez une nouvelle version plutôt que de remplacer silencieusement l'historique." },
      { title: "Relier", description: "Associez le document aux tâches, demandes, validations ou réunions concernées." },
      { title: "Comparer", description: "La comparaison visuelle n'est disponible que si le fournisseur et le stockage nécessaires sont configurés." },
    ],
  },
  ADMIN_RBAC: {
    code: "ADMIN_RBAC",
    title: "Guide Permissions individuelles DTSC",
    summary: "Accorder un acte précis à un collaborateur sans modifier son rôle global ni son poste officiel.",
    audience: "Administrateurs DTSC",
    updatedAt: "2026-08-04",
    capabilities: [
      "Catalogue fermé de permissions individuelles",
      "Effet ALLOW ou DENY",
      "Motif obligatoire",
      "Expiration facultative",
      "Révocation et audit",
      "Accès nominatif à une section Administration ou à un acte métier précis",
    ],
    steps: [
      { title: "Choisir le collaborateur", description: "Le collaborateur doit avoir un dossier RH actif et un compte DTSC actif." },
      { title: "Choisir la permission", description: "Sélectionnez un acte du catalogue ; aucun code libre n'est accepté." },
      { title: "Justifier et limiter", description: "Renseignez le motif et, si nécessaire, une date d'expiration." },
      { title: "Révoquer", description: "Retirez la permission dès que le besoin métier disparaît ; la révocation reste auditée." },
    ],
  },
} satisfies Record<string, ContextualUserGuide>;

export type Iteration04GuideCode = keyof typeof ITERATION04_USER_GUIDES;

export function getIteration04UserGuide(code: string | null | undefined) {
  if (!code) return null;
  return ITERATION04_USER_GUIDES[code as Iteration04GuideCode] || null;
}

export const ENTERPRISE_MODULE_GUIDE_MAP: Record<string, Iteration04GuideCode> = {
  TASKS_OPERATIONS: "TASKS_OPERATIONS",
  INTERNAL_REQUESTS: "INTERNAL_REQUESTS",
  VALIDATIONS: "VALIDATIONS",
  MEETINGS: "MEETINGS",
  WORKFLOWS: "WORKFLOWS",
  DOCUMENTS: "DOCUMENTS",
};
