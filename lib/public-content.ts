export type PublicPageSection = {
  heading: string;
  text: string;
  bullets: string[];
};

export type PublicPageContent = {
  title: string;
  eyebrow: string;
  intro: string;
  narrative: string;
  imageAlt: string;
  highlights: Array<{ label: string; value: string }>;
  sections: PublicPageSection[];
};

export const sources = [
  { label: "IFC, Digital Opportunities in African Businesses (2024)", href: "https://www.ifc.org/en/pressroom/2024/ifc-report-shows-digitalization-holds-immense-promise-economic-potential-for-african-businesses-of-all-sizes" },
  { label: "World Bank, Digital Transformation Drives Development in Africa", href: "https://www.worldbank.org/en/results/2024/01/18/digital-transformation-drives-development-in-afe-afw-africa.print" },
  { label: "OECD, Data-Driven Innovation", href: "https://www.oecd.org/en/publications/data-driven-innovation_9789264229358-en.html" },
  { label: "OECD, Business innovation statistics and indicators", href: "https://www.oecd.org/en/data/datasets/business-innovation-statistics-and-indicators.html" },
];

export const legalSources = [
  { label: "Règlement (UE) 2016/679 - RGPD, texte officiel EUR-Lex", href: "https://eur-lex.europa.eu/legal-content/EN-FR/TXT/?uri=CELEX%3A32016R0679" },
  { label: "Comité européen de la protection des données - Guidelines on transparency", href: "https://www.edpb.europa.eu/our-work-tools/our-documents/article-29-working-party-guidelines-transparency-under-regulation_en" },
  { label: "CNIL - RGPD: comprendre et agir", href: "https://www.cnil.fr/fr/reglement-europeen-protection-donnees" },
  { label: "CNIL - Les règles à suivre pour les cookies", href: "https://www.cnil.fr/fr/cookies-et-autres-traceurs/regles/cookies" },
  { label: "CNIL - Questions-réponses cookies et autres traceurs", href: "https://www.cnil.fr/fr/cookies-et-autres-traceurs/regles/cookies/FAQ" },
];

export const publicPages: Record<string, PublicPageContent> = {
  data: {
    eyebrow: "Culture data",
    title: "Data en Afrique",
    intro:
      "La donnée devient un actif stratégique pour les entreprises africaines: elle permet de comprendre les clients, réduire les gaspillages, fiabiliser les décisions et créer une gouvernance plus lisible.",
    narrative:
      "Beaucoup d'organisations disposent déjà d'informations utiles, mais elles restent dispersées dans des fichiers, des conversations, des outils non connectés ou des processus manuels. DTSC aide les dirigeants à transformer cette matière brute en indicateurs exploitables, en actions concrètes et en décisions plus fiables. À Kinshasa et plus largement en Afrique, cette approche est particulièrement importante pour les assurances, cliniques, pharmacies et PME, où la visibilité sur les opérations influence directement la qualité de service, la maîtrise des coûts et la croissance.",
    imageAlt: "Carte visuelle des flux data DTSC",
    highlights: [
      { label: "Priorité", value: "Structurer" },
      { label: "Impact", value: "Décider" },
      { label: "Méthode", value: "Mesurer" },
    ],
    sections: [
      {
        heading: "Pourquoi la data devient urgente",
        text:
          "Le levier Data & BI ne commence pas par l'achat d'un logiciel: il commence par la clarté sur ce que l'entreprise veut mesurer. Une organisation qui ne suit pas ses ventes, ses stocks, ses délais, ses clients, ses incidents ou ses coûts avec rigueur prend des décisions lentes et souvent contradictoires. DTSC propose une approche progressive: cartographier les données disponibles, identifier les décisions critiques, nettoyer les sources prioritaires, puis construire des tableaux de bord utiles aux équipes.",
        bullets: ["Identifier les données déjà disponibles", "Relier les indicateurs aux décisions métier", "Réduire les doubles saisies et les fichiers isolés", "Mettre en place un suivi régulier et compréhensible"],
      },
      {
        heading: "Ce que DTSC apporte aux dirigeants",
        text:
          "DTSC rattache le pilotage des données aux 7 leviers numériques, avec un focus Data & BI pour les indicateurs lisibles: chiffre d'affaires, marges, satisfaction client, activité opérationnelle, productivité, risques, anomalies et opportunités commerciales. Le cabinet accompagne aussi la montée en compétence des équipes pour que les dashboards restent utilisés après le projet.",
        bullets: ["Diagnostic Data & BI", "KPI exécutifs et opérationnels", "Reporting rattaché au pilotage", "Formation des équipes internes"],
      },
      {
        heading: "Une approche adaptée aux réalités locales",
        text:
          "Dans les PME et institutions de services, les données peuvent être incomplètes, hétérogènes ou collectées dans des conditions très variables. DTSC privilégie donc des cas d'usage robustes, compréhensibles et évolutifs. Un premier projet peut commencer par un fichier structuré, un dashboard Power BI, un formulaire de collecte ou une application web simple, chacun rattaché au levier approprié.",
        bullets: ["Démarrage par cas d'usage prioritaire", "Exemples rattachés aux leviers", "Documentation des définitions métier", "Accompagnement humain et validation continue"],
      },
    ],
  },
  bi: {
    eyebrow: "Pilotage & performance",
    title: "BI, KPI et reporting",
    intro:
      "Un tableau de bord professionnel ne se limite pas à afficher des chiffres: il relie stratégie, opérations et décisions quotidiennes avec des indicateurs fiables.",
    narrative:
      "La Business Intelligence permet aux dirigeants de sortir du pilotage intuitif et de créer une discipline de suivi. Pour DTSC, un bon dashboard doit répondre à trois questions: que se passe-t-il, pourquoi cela se passe-t-il, et quelle action doit être prise. Les KPI ne sont pas choisis pour remplir un écran, mais pour éclairer une décision: réduire un coût, prioriser une agence, améliorer un service, détecter une anomalie, suivre une campagne ou mesurer la productivité.",
    imageAlt: "Dashboard BI premium DTSC",
    highlights: [
      { label: "KPI", value: "Actionnables" },
      { label: "Reporting", value: "Automatisé" },
      { label: "Direction", value: "Alignée" },
    ],
    sections: [
      {
        heading: "Construire des KPI utiles",
        text:
          "Un KPI utile est compréhensible, mesurable, fiable, mis à jour à une fréquence connue et rattaché à un responsable. DTSC formalise les définitions pour éviter les débats récurrents sur les chiffres. Par exemple, une vente, un client actif, un sinistre traité, une rupture de stock ou une consultation facturée doivent avoir une définition commune entre les équipes.",
        bullets: ["Définition métier de chaque indicateur", "Source de données documentée", "Fréquence de mise à jour connue", "Responsable identifié pour chaque KPI"],
      },
      {
        heading: "Cas d'usage prioritaires",
        text:
          "Les tableaux de bord DTSC sont des exemples du levier Data & BI. Ils peuvent couvrir la performance commerciale, la trésorerie, les stocks, la fraude, le marketing, la productivité, la gestion médicale, les tickets clients ou le suivi des projets. L'approche premium consiste à créer des vues différentes pour les dirigeants, les managers et les équipes opérationnelles, afin que chacun accède au bon niveau de détail.",
        bullets: ["Reporting exécutif pour la direction", "Vues opérationnelles pour les équipes", "Alertes sur anomalies et seuils critiques", "Suivi des tendances dans le temps"],
      },
      {
        heading: "Gouvernance et adoption",
        text:
          "La BI échoue souvent lorsque les équipes ne comprennent pas les chiffres ou ne font pas confiance aux sources. DTSC intègre la gouvernance dès le départ: dictionnaire d'indicateurs, documentation, formations, rituels de revue et amélioration continue. Le tableau de bord devient un outil de management, pas seulement un livrable technique.",
        bullets: ["Dictionnaire KPI", "Formation à la lecture des dashboards", "Rituels de revue de performance", "Maintenance et évolution progressive"],
      },
    ],
  },
  ai: {
    eyebrow: "IA responsable",
    title: "IA en entreprise",
    intro:
      "L'intelligence artificielle devient utile lorsqu'elle est reliée à un processus métier clair, à des données maîtrisées et à une validation humaine pour les décisions sensibles.",
    narrative:
      "DTSC positionne l'IA comme l'un de ses 7 leviers numériques officiels. Le chatbot DTSC illustre cette approche: il qualifie les besoins, reformule les demandes, explique les leviers et recommande une escalade humaine lorsqu'une décision commerciale, technique ou stratégique est nécessaire. Cette philosophie évite les promesses irréalistes et installe une relation de confiance avec les clients.",
    imageAlt: "Interface IA DTSC pour entreprises",
    highlights: [
      { label: "Usage", value: "Assisté" },
      { label: "Risque", value: "Contrôlé" },
      { label: "Humain", value: "Validé" },
    ],
    sections: [
      {
        heading: "Commencer par le problème métier",
        text:
          "Un cas d'usage IA doit commencer par une question métier précise: réduire le temps de réponse, trier des demandes, détecter des anomalies, générer des synthèses, assister les équipes commerciales ou automatiser intelligemment des documents. DTSC aide à choisir les exemples où le levier Intelligence artificielle crée un gain réel sans complexité excessive.",
        bullets: ["Qualification automatique des demandes", "Synthèse et analyse documentaire", "Support client assisté", "Aide à la décision avec validation humaine"],
      },
      {
        heading: "Base documentaire contextualisée",
        text:
          "La plateforme est pensée pour exploiter progressivement une base documentaire DTSC. Cette évolution permet au chatbot de répondre à partir de documents validés: offres, procédures, FAQ, politiques, supports de formation ou documentation technique. Le système doit toutefois rester contrôlé: contenus autorisés, permissions respectées et informations sensibles protégées.",
        bullets: ["Base documentaire interne", "Recherche sémantique contrôlée", "Réponses sourcées", "Permissions par rôle utilisateur"],
      },
      {
        heading: "Responsabilité, sécurité et limites",
        text:
          "L'IA ne doit pas remplacer les décisions humaines lorsqu'une demande engage un contrat, une prestation, un diagnostic critique ou une stratégie d'entreprise. DTSC prévoit des tickets, des escalades et une validation par l'équipe. Cette posture est essentielle pour maintenir la qualité, la confiance et la conformité.",
        bullets: ["Pas de promesse commerciale automatique", "Escalade vers un ticket support", "Journalisation de l'usage", "Limites de messages et tokens configurables"],
      },
    ],
  },
  sectors: {
    eyebrow: "Marchés cibles",
    title: "Secteurs accompagnés",
    intro:
      "DTSC cible les assurances, cliniques, pharmacies et PME: des organisations où les 7 leviers numériques peuvent produire des gains rapides.",
    narrative:
      "Le marché africain présente encore de fortes différences de maturité numérique, mais aussi une opportunité majeure pour les organisations capables de structurer leurs informations et d'améliorer leur service. DTSC adapte ses 7 leviers aux secteurs où les opérations sont fréquentes, les données nombreuses et les décisions quotidiennes importantes: Data & BI, Intelligence artificielle, Solutions digitales, Audit & optimisation, Formations, Marketing digital et Imprimerie numérique.",
    imageAlt: "Secteurs professionnels accompagnés par DTSC",
    highlights: [
      { label: "Santé", value: "Cliniques" },
      { label: "Finance", value: "Assurances" },
      { label: "Croissance", value: "PME" },
    ],
    sections: [
      {
        heading: "Assurances",
        text:
          "Les assurances ont besoin d'une vision claire sur les portefeuilles, les sinistres, les ventes, les renouvellements et les anomalies. DTSC applique surtout les leviers Data & BI, Audit & optimisation, Solutions digitales et Marketing digital pour construire des dashboards de pilotage, des outils de suivi commercial et des indicateurs de performance par produit, canal ou équipe.",
        bullets: ["Suivi portefeuille et renouvellements", "Analyse sinistres et anomalies", "Performance commerciale", "Segmentation clients"],
      },
      {
        heading: "Cliniques et pharmacies",
        text:
          "Dans la santé, l'enjeu est double: améliorer l'organisation interne et renforcer la qualité de service. Les cliniques peuvent suivre l'activité, les files d'attente, la facturation, les indicateurs médicaux et la disponibilité des ressources. Les pharmacies peuvent mieux gérer les stocks, les ruptures, les ventes, les marges et les commandes.",
        bullets: ["Suivi activité et facturation", "Gestion stocks et ruptures", "Tableaux de bord médicaux", "Optimisation des coûts"],
      },
      {
        heading: "PME et organisations en croissance",
        text:
          "Les PME ont souvent besoin d'exemples rapides, abordables et adaptés: visibilité marketing, formulaires de collecte, workflows numériques, tableaux de bord financiers, applications web et support client. DTSC les rattache aux leviers Marketing digital, Solutions digitales, Data & BI, Intelligence artificielle ou Audit & optimisation selon le gain recherché.",
        bullets: ["Marketing digital et acquisition", "Applications web comme Solutions digitales", "Workflows numériques", "Reporting dirigeant dans Data & BI"],
      },
    ],
  },
};

export const legalPages: Record<string, PublicPageContent> = {
  terms: {
    eyebrow: "Conditions et politiques",
    title: "Conditions d'utilisation",
    intro:
      "Ces conditions encadrent l'accès aux pages publiques, à l'espace client, au chatbot, aux modules support, annonces et notifications de la plateforme DTSC.",
    narrative:
      "DTSC - Data and Tech Solutions Consulting - est un cabinet basé à Kinshasa dont la mission est d'aider les entreprises à améliorer leur performance, réduire leurs coûts et accroître leur visibilité grâce aux 7 leviers numériques officiels. Les présentes conditions expliquent les règles d'utilisation de la plateforme. Elles ne remplacent pas un contrat commercial signé avec DTSC; lorsqu'une prestation, un devis, un cadrage ou une obligation spécifique est nécessaire, la validation humaine de l'équipe DTSC demeure obligatoire.",
    imageAlt: "Cadre contractuel DTSC",
    highlights: [
      { label: "Usage", value: "Professionnel" },
      { label: "Validation", value: "Humaine" },
      { label: "Sécurité", value: "Prioritaire" },
    ],
    sections: [
      {
        heading: "Accès à la plateforme",
        text:
          "L'utilisateur s'engage à fournir des informations exactes lors de son inscription et à conserver la confidentialité de ses identifiants. Les comptes sont personnels, rattachés à un rôle et peuvent être limités, suspendus ou désactivés en cas d'usage abusif, de tentative d'accès non autorisé ou de non-respect des règles de sécurité. La plateforme peut présenter des espaces séparés par sous-domaines officiels pour le site public, l'application SaaS, le compte, la console DTSC et le support; ces espaces restent soumis à la même session sécurisée et aux mêmes contrôles d'accès. Lorsque l'utilisateur choisit une entreprise à la connexion, l'accès à cet espace privé exige un rattachement actif à cette organisation; le rôle global DTSC ne donne pas automatiquement accès aux données internes privées d'une entreprise cliente.",
        bullets: ["Compte personnel et non transférable", "Mot de passe confidentiel", "Espaces officiels séparables par sous-domaines", "Rôles globaux et rôles d'organisation séparés", "Entreprise à la connexion uniquement si membership actif", "Suspension possible en cas d'abus"],
      },
      {
        heading: "Utilisation du chatbot",
        text:
          "Le chatbot DTSC aide à comprendre les 7 leviers, clarifier un besoin et préparer un échange avec l'équipe. Dans l'espace privé, il peut aussi aider à formuler un message à DTSC ou un ticket support, puis déclencher l'envoi ou la création uniquement après confirmation explicite de l'utilisateur. Il ne constitue pas une décision contractuelle, médicale, financière, juridique ou stratégique. Les réponses peuvent comporter des limites et doivent être validées par un interlocuteur DTSC lorsque la demande engage une prestation, un budget, une décision sensible ou un diagnostic spécialisé.",
        bullets: ["Assistant de qualification et d'orientation", "Aucune promesse automatique de prestation", "Escalade possible vers un ticket", "Limites d'usage configurables par administrateur"],
      },
      {
        heading: "Contenus, annonces et support",
        text:
          "Les annonces, commentaires, tickets, groupes Mes collaborateurs et messages doivent rester professionnels, utiles et respectueux. DTSC peut modérer, archiver, signaler ou retirer un contenu qui perturbe la plateforme, expose des informations confidentielles, contient des propos illicites ou porte atteinte aux droits d'autrui. Les annonces peuvent être globales, communautaires ou limitées à une entreprise selon leur portée. Les groupes Mes collaborateurs peuvent être internes à une organisation ou transversaux entre utilisateurs de plusieurs entreprises, mais l'accès aux échanges exige une invitation acceptée ou un membership actif du groupe. Les tickets support partagent avec DTSC uniquement les informations volontairement transmises dans le ticket; ils ne donnent pas accès aux autres données internes de l'entreprise cliente.",
        bullets: ["Publication professionnelle requise", "Portée globale, communautaire ou organisationnelle", "Modération et signalement possibles", "Tickets support limités aux informations volontairement partagées", "Partage chatbot volontaire", "Mentions limitées aux personnes autorisées", "Fenêtre de modification paramétrable"],
      },
      {
        heading: "Modules internes HR & CFO / SCO / COO / CEO / MPO / CTO / LA",
        text:
          "Les modules internes de gestion RH, financière, achats, stocks, actifs, biens matériels, logistique, coordination COO, supervision CEO, projets MPO, technologie CTO, conseil juridique LA et calendrier interne sont réservés aux utilisateurs habilités. Les sections métier sensibles exigent le poste officiel correspondant dans le dossier RH, sauf administrateur. Pour les entreprises clientes, les modules sectoriels, postes, départements, workflows et blocs Activités sont générés dans l'organisation concernée et restent soumis au membership actif, aux permissions et au plan d'abonnement. Les sous-modules sectoriels activés, par exemple patients suivis, rendez-vous ou incidents qualité pour une structure de santé, doivent rester exacts, nécessaires, proportionnés et traités avec confidentialité dans l'organisation concernée. Les collaborateurs, postes officiels, responsables, fournisseurs, comptes, budgets, transactions, paies, inventaires, équipements, projets, livrables, incidents techniques, dossiers juridiques, contrats, risques de conformité, documents officiels, litiges, tâches, blocages, réunions, groupes de réunion, appels audio/vidéo, disponibilités, absences, missions, conflits de planning, rapports, demandes directes entre collaborateurs, workflows, objectifs et journaux de supervision peuvent être reliés entre eux pour renforcer la cohérence opérationnelle. Lorsqu'un objectif, un suivi, une réunion COO, une demande collaborateur, un besoin matériel, un projet, une tâche technique ou une demande juridique vise un collaborateur, il peut apparaître dans son espace Activités DTSC ou dans son calendrier interne avec commentaires et notifications ciblées. Les actions sensibles peuvent être journalisées afin d'assurer le contrôle interne, l'audit et la traçabilité.",
        bullets: ["Accès réservé par rôle et poste officiel", "Données internes et juridiques confidentielles", "Référentiels collaborateurs, postes, fournisseurs et biens matériels", "Paie, projets, technologie, juridique, calendrier et activités visibles uniquement selon habilitation", "Formulaires collaborateur synchronisés avec COO et LA", "Exactitude et proportionnalité", "Traçabilité des actions sensibles"],
      },
      {
        heading: "Disponibilité, évolution et responsabilité",
        text:
          "DTSC fournit une plateforme en évolution continue. Des interruptions temporaires peuvent être nécessaires pour la maintenance, la sécurité, l'amélioration fonctionnelle ou la résolution d'incidents. DTSC s'efforce de maintenir un service fiable, mais l'utilisateur reste responsable de ses décisions et de la vérification des informations critiques.",
        bullets: ["Maintenance possible", "Améliorations continues", "Responsabilité de vérification côté utilisateur", "Validation humaine pour les engagements importants"],
      },
    ],
  },
  privacy: {
    eyebrow: "Protection des données",
    title: "Politique de confidentialité",
    intro:
      "Cette politique explique comment DTSC collecte, utilise, protège et conserve les données personnelles traitées dans le cadre de la plateforme.",
    narrative:
      "La présente politique est rédigée en cohérence avec les principes du RGPD: transparence, limitation des finalités, minimisation des données, sécurité, droits des personnes et responsabilité du responsable de traitement. Elle est adaptée au contexte DTSC: 7 leviers numériques officiels, support client, comptes utilisateurs et conversations avec le chatbot. Elle doit être complétée par les informations légales propres à DTSC lorsque la structure juridique, l'adresse administrative ou les contacts officiels de protection des données seront finalisés.",
    imageAlt: "Protection des données DTSC",
    highlights: [
      { label: "Principe", value: "Minimisation" },
      { label: "Droits", value: "Accès" },
      { label: "Sécurité", value: "Contrôle" },
    ],
    sections: [
      {
        heading: "Données collectées",
        text:
          "La plateforme peut traiter les informations de compte, les coordonnées professionnelles, le rôle utilisateur, le poste officiel du dossier RH, les paramètres de sécurité, les préférences privées du compte, les préférences d'appels audio/vidéo, les conversations chatbot avec dates/heures affichées selon les préférences, les partages volontaires de copies/snapshots de conversations dans des groupes autorisés, les messages de contact ou tickets support déclenchés depuis le chatbot privé après confirmation, les échanges avec l'agent IA public, les tickets support, les annonces, transferts, signalements, commentaires, mentions, notifications, groupes Mes collaborateurs, invitations, membres, messages de groupe, sessions d'appels audio/vidéo, participants connectés, événements d'appel, durée des appels, disponibilités, événements calendrier, absences, congés, missions, télétravail, présence sur site, conflits de planning, journaux d'audit de groupe, journaux d'usage IA, données techniques nécessaires au fonctionnement, statistiques de visites des pages publiques, informations de prospects inscrits newsletter ou qualifiés par l'agent IA public et, pour les utilisateurs autorisés, des données internes de gestion HR & CFO, SCO, COO, CEO, MPO, CTO ou LA comme dossiers RH, responsables hiérarchiques, KPIs, départements, postes, comptes, budgets, transactions, paies, bulletins de paie, factures, fournisseurs, achats, biens matériels, stocks, actifs, opérations logistiques, projets, livrables, besoins matériels, incidents techniques, déploiements, dossiers juridiques, contrats, modèles juridiques, documents officiels, litiges, risques de conformité, tâches internes, demandes directes entre collaborateurs, réunions, blocages, workflows partagés, rapports, objectifs assignés, journaux de supervision, commentaires opérationnels ou juridiques entre personnes concernées, données sectorielles d'entreprise comme patients suivis, rendez-vous ou incidents qualité lorsque le secteur santé est activé, et pièces justificatives stockées côté serveur.",
        bullets: ["Identité et coordonnées professionnelles", "Préférences privées de compte, langue, fuseau horaire, format de date et appels", "Messages, tickets, conversations et partages chatbot volontaires", "Groupes Mes collaborateurs, invitations, messages, mentions et appels", "Disponibilités, événements calendrier, absences, missions et conflits de planning selon habilitation", "Prospects newsletter et prospects qualifiés par agent IA", "Données internes HR & CFO / SCO / COO / CEO / MPO / CTO / LA selon habilitation", "Données sectorielles d'entreprise selon secteur et membership actif", "Suivi de paie et bulletins limités au collaborateur concerné", "Documents juridiques confidentiels limités aux personnes habilitées", "Rôles, postes, statuts et limites d'usage", "Journaux techniques, audit de groupe, événements d'appel, durées d'appel et statistiques de visite"],
      },
      {
        heading: "Finalités du traitement",
        text:
          "Les données sont utilisées pour fournir l'accès à la plateforme, authentifier les utilisateurs, sécuriser les comptes, traiter les demandes support, afficher l'historique des conversations, partager volontairement des conversations chatbot dans des groupes autorisés, mesurer l'usage IA, améliorer l'expérience utilisateur, appliquer les préférences privées de langue, fuseau horaire, format de date et appels, administrer les rôles et postes, préparer les échanges commerciaux ou techniques avec DTSC, envoyer un message à DTSC ou créer un ticket depuis le chatbot privé après confirmation explicite, qualifier les inscrits newsletter ou prospects issus de l'agent IA public avec action explicite avant conversion en utilisateur et piloter les opérations internes autorisées comme les ressources humaines, comptes financiers, budgets, transactions, paies, achats, fournisseurs, biens matériels, stocks, actifs, logistique, coordination COO, calendrier interne, disponibilité des équipes, projets MPO, technologie CTO, dossiers juridiques LA, contrats, conformité, litiges, tâches, demandes directes entre collaborateurs, réunions, blocages, rapports, objectifs et supervision CEO. Les notifications, mentions, alertes calendrier, alertes d'appel et commentaires liés aux groupes, objectifs, suivis, réunions, demandes collaboratives, achats, projets, besoins matériels, incidents ou demandes juridiques servent à informer uniquement les collaborateurs concernés et les responsables autorisés.",
        bullets: ["Authentification et gestion des accès", "Support et suivi client", "Historique chatbot, préférences de date et continuité de service", "Groupes, invitations, mentions et partage chatbot volontaire", "Calendrier interne et disponibilité des équipes", "Qualification newsletter, agent IA public et conversion explicite", "Pilotage administratif HR & CFO / SCO / COO / CEO / MPO / CTO / LA", "Sécurité et audit"],
      },
      {
        heading: "Sécurité et confidentialité",
        text:
          "DTSC applique une séparation entre les clés API serveur et le frontend, utilise des sessions sécurisées, conserve les mots de passe sous forme hachée et protège les routes privées par rôle. La plateforme est préparée pour séparer le site public, l'espace SaaS, la console DTSC, le compte et le support sur des sous-domaines officiels tout en conservant un cookie de session HTTP-only signé, partageable entre ces sous-domaines uniquement si le domaine de cookie est configuré côté serveur. Dans le modèle multi-entreprises, les données internes d'une entreprise cliente doivent être isolées par organisation et accessibles uniquement aux membres actifs autorisés. En contexte entreprise, l'abonnement, les annonces et le profil restent communs au compte; les modules comme Dashboard, Chatbot, Entreprise, Documents, Paramètres, Notifications, Support, Calendrier interne et Mes collaborateurs restent visibles avec des données filtrées par le contexte actif et l'organisation concernée. Les groupes transversaux Mes collaborateurs peuvent proposer une recherche limitée d'utilisateurs actifs afin d'envoyer une invitation, mais les messages restent invisibles sans acceptation. Les calendriers d'entreprise stockent événements et disponibilités avec `organizationId` afin d'éviter tout mélange entre DTSC et clients. Les secteurs, modules, postes et workflows d'une entreprise servent à adapter l'expérience SaaS et ne donnent pas à DTSC un accès au contenu privé de cette entreprise. L'espace interne DTSC est lui-même une organisation dédiée: seuls les collaborateurs DTSC rattachés à un dossier RH actif peuvent y accéder. DTSC administre la plateforme, les abonnements et le support, mais ne consulte pas les modules internes privés des clients sans rattachement explicite à l'organisation concernée.",
        bullets: ["Mots de passe hachés", "Clés API non exposées au client", "Cookie de session HTTP-only compatible sous-domaines officiels", "Contrôle d'accès RBAC et membership actif", "Tenant DTSC réservé aux collaborateurs liés", "Isolation des données par organisation", "Journalisation et limitation d'usage"],
      },
      {
        heading: "Droits des utilisateurs",
        text:
          "Selon le cadre applicable, les personnes concernées peuvent demander l'accès, la rectification, l'effacement, la limitation, l'opposition ou la portabilité de leurs données. Certaines demandes peuvent être limitées lorsqu'une conservation est nécessaire pour la sécurité, la preuve, l'exécution d'un contrat ou une obligation légale. DTSC doit répondre dans un délai raisonnable et vérifier l'identité du demandeur.",
        bullets: ["Accès aux données", "Rectification des informations", "Suppression ou limitation lorsque possible", "Opposition et portabilité selon le cadre applicable"],
      },
      {
        heading: "Sous-traitants et transferts",
        text:
          "La plateforme peut s'appuyer sur des services techniques comme l'hébergement cloud, la base de données PostgreSQL, l'API IA côté serveur, un service sécurisé d'appels audio/vidéo lorsque cette option est configurée et le fournisseur email configuré. Ces prestataires interviennent pour l'hébergement, la persistance des données, l'inférence IA, les appels collaboratifs, les notifications commerciales ou la sécurité applicative. DTSC doit veiller à sélectionner des prestataires présentant des garanties appropriées et à documenter les traitements lorsque le cadre juridique l'exige.",
        bullets: ["Hébergement cloud", "Base de données PostgreSQL", "Traitement IA côté serveur", "Service sécurisé d'appels audio/vidéo si configuré", "Notification email des prospects qualifiés", "Documentation des garanties prestataires"],
      },
    ],
  },
  cookies: {
    eyebrow: "Cookies et préférences",
    title: "Politique des cookies",
    intro:
      "Cette page explique les cookies, traceurs et stockages locaux utilisés par DTSC Platform pour faire fonctionner le site public, l'espace client et la PWA.",
    narrative:
      "DTSC Platform privilégie une approche sobre: aucun cookie publicitaire n'est nécessaire au fonctionnement actuel. Les traceurs strictement nécessaires servent à maintenir la session, la sécurité, les préférences d'interface et l'expérience PWA. Les statistiques de visites publiques sont enregistrées côté serveur pour mesurer l'impact du site, sans profilage publicitaire ni revente de données. Cette politique s'inspire des recommandations CNIL: information claire, refus aussi simple que l'acceptation pour les traceurs non essentiels, et possibilité de modifier ses choix.",
    imageAlt: "Préférences cookies DTSC",
    highlights: [
      { label: "Publicité", value: "Aucune" },
      { label: "Session", value: "Essentielle" },
      { label: "Choix", value: "Modifiable" },
    ],
    sections: [
      {
        heading: "Cookies strictement nécessaires",
        text:
          "Le cookie de session sécurisé permet à un utilisateur connecté d'accéder à son espace privé sans ressaisir ses identifiants à chaque page. Il est HTTP-only, signé côté serveur et nécessaire à l'authentification, au contexte actif d'entreprise et au contrôle des accès par rôle, poste officiel RH, membership actif et appartenance aux objets. Quand les sous-domaines officiels DTSC sont activés, ce cookie peut être configuré côté serveur sur le domaine parent afin de fonctionner entre l'espace compte, l'espace SaaS, la console et le support sans exposer le contenu du cookie au JavaScript client. Sans ce cookie, les modules privés comme le dashboard, le chatbot, l'entreprise, les activités collaborateur, le support ou l'administration ne peuvent pas fonctionner correctement.",
        bullets: ["Session authentifiée", "Contexte actif d'entreprise", "Protection HTTP-only", "Partage contrôlé entre sous-domaines officiels", "Accès aux routes privées", "Contrôle d'accès aux activités et sections sensibles", "Expiration de session pour sécurité"],
      },
      {
        heading: "Préférences locales et PWA",
        text:
          "Certaines préférences peuvent être conservées localement dans le navigateur: thème clair/sombre, choix de reporter l'installation PWA, notifications visibles déjà affichées ou réglages d'interface. D'autres préférences privées peuvent être enregistrées sur le compte utilisateur pour retrouver la page de démarrage, la densité d'affichage, la langue, le fuseau horaire, le format de date, les synthèses email, les préférences de réponse IA et les réglages d'appel après reconnexion. La session peut aussi conserver le contexte d'entreprise actif afin d'appliquer les modules sectoriels et l'isolation par organisation. Ces préférences servent aussi à afficher correctement l'heure des messages chatbot, commentaires, notifications, alertes d'appel et messages de groupe. Ces informations améliorent l'expérience sans être utilisées pour du ciblage publicitaire. La PWA peut aussi mettre en cache des fichiers statiques afin de charger l'interface plus vite, mais elle ne cache pas les pages privées ni les réponses API contenant des données utilisateur.",
        bullets: ["Thème et confort visuel", "Préférences privées persistées", "Heures des messages selon le fuseau horaire utilisateur", "Invitation PWA mémorisée", "Pas de cache API privée", "Page hors ligne sans données personnelles"],
      },
      {
        heading: "Mesure d'audience et sécurité",
        text:
          "Les visites des pages publiques peuvent être comptabilisées côté serveur afin d'aider l'administrateur à suivre l'intérêt pour les contenus DTSC. Les journaux techniques peuvent aussi contenir l'adresse IP, l'agent utilisateur, la route appelée, le statut HTTP et la durée de traitement pour la sécurité, le diagnostic et la lutte contre les abus. Ces données ne servent pas à créer des profils publicitaires.",
        bullets: ["Statistiques publiques agrégées", "Logs API critiques", "Détection d'erreurs et d'abus", "Aucune publicité ciblée"],
      },
      {
        heading: "Cookies non essentiels et contrôle utilisateur",
        text:
          "Si DTSC ajoute plus tard des outils non essentiels comme analytics tiers, marketing, pixels sociaux, chat externe ou mesure publicitaire, ils devront être présentés clairement et soumis à un choix explicite lorsque le cadre applicable l'exige. Le refus devra rester aussi simple que l'acceptation, et l'utilisateur devra pouvoir revenir sur son choix.",
        bullets: ["Information avant dépôt", "Consentement explicite si nécessaire", "Refus simple", "Retrait possible"],
      },
      {
        heading: "Gérer ou supprimer les cookies",
        text:
          "L'utilisateur peut supprimer les cookies et données locales depuis les paramètres de son navigateur. Sur mobile, cette option se trouve généralement dans les paramètres du navigateur, rubrique confidentialité ou données de site. La suppression peut déconnecter l'utilisateur, réinitialiser le thème ou faire réapparaître certains messages d'information.",
        bullets: ["Suppression depuis le navigateur", "Déconnexion possible", "Réinitialisation de préférences", "Nouvelle connexion nécessaire"],
      },
    ],
  },
};
