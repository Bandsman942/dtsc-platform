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
          "La transformation numérique ne commence pas par l'achat d'un logiciel: elle commence par la clarté sur ce que l'entreprise veut mesurer. Une organisation qui ne suit pas ses ventes, ses stocks, ses délais, ses clients, ses incidents ou ses coûts avec rigueur prend des décisions lentes et souvent contradictoires. DTSC propose une approche progressive: cartographier les données disponibles, identifier les décisions critiques, nettoyer les sources prioritaires, puis construire des tableaux de bord utiles aux équipes.",
        bullets: ["Identifier les données déjà disponibles", "Relier les indicateurs aux décisions métier", "Réduire les doubles saisies et les fichiers isolés", "Mettre en place un suivi régulier et compréhensible"],
      },
      {
        heading: "Ce que DTSC apporte aux dirigeants",
        text:
          "DTSC combine conseil business, analyse de données et exécution technologique. L'objectif n'est pas de produire des rapports décoratifs, mais d'équiper les dirigeants avec des indicateurs lisibles: chiffre d'affaires, marges, satisfaction client, activité opérationnelle, productivité, risques, anomalies et opportunités commerciales. Le cabinet accompagne aussi la montée en compétence des équipes pour que les dashboards restent utilisés après le projet.",
        bullets: ["Diagnostic data et maturité numérique", "KPI exécutifs et opérationnels", "Automatisation du reporting", "Formation des équipes internes"],
      },
      {
        heading: "Une approche adaptée aux réalités locales",
        text:
          "Dans les PME et institutions de services, les données peuvent être incomplètes, hétérogènes ou collectées dans des conditions très variables. DTSC privilégie donc des solutions robustes, compréhensibles et évolutives. Un premier projet peut commencer par un fichier structuré, un dashboard Power BI, un formulaire de collecte ou une application métier simple, puis évoluer vers une plateforme plus complète.",
        bullets: ["Démarrage par cas d'usage prioritaire", "Architecture compatible avec l'évolution SaaS", "Documentation des définitions métier", "Accompagnement humain et validation continue"],
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
          "Les tableaux de bord DTSC peuvent couvrir la performance commerciale, la trésorerie, les stocks, la fraude, le marketing, la productivité, la gestion médicale, les tickets clients ou le suivi des projets. L'approche premium consiste à créer des vues différentes pour les dirigeants, les managers et les équipes opérationnelles, afin que chacun accède au bon niveau de détail.",
        bullets: ["Reporting exécutif pour la direction", "Vues opérationnelles pour les équipes", "Alertes sur anomalies et seuils critiques", "Suivi des tendances dans le temps"],
      },
      {
        heading: "Gouvernance et adoption",
        text:
          "La BI échoue souvent lorsque les équipes ne comprennent pas les chiffres ou ne font pas confiance aux sources. DTSC intègre la gouvernance dès le départ: dictionnaire d'indicateurs, documentation, formation, rituels de revue et amélioration continue. Le tableau de bord devient un outil de management, pas seulement un livrable technique.",
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
      "DTSC positionne l'IA comme un levier d'assistance, d'automatisation et d'amélioration de la qualité de service. Le chatbot DTSC illustre cette approche: il qualifie les besoins, reformule les demandes, explique les services et recommande une escalade humaine lorsqu'une décision commerciale, technique ou stratégique est nécessaire. Cette philosophie évite les promesses irréalistes et installe une relation de confiance avec les clients.",
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
          "Un projet IA doit commencer par une question métier précise: réduire le temps de réponse, trier des demandes, détecter des anomalies, générer des synthèses, assister les équipes commerciales ou automatiser des documents. DTSC aide à choisir les cas d'usage où l'IA crée un gain réel sans complexité excessive.",
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
      "DTSC cible les assurances, cliniques, pharmacies et PME: des organisations où la donnée, la visibilité et l'automatisation peuvent produire des gains rapides.",
    narrative:
      "Le marché africain présente encore de fortes différences de maturité numérique, mais aussi une opportunité majeure pour les organisations capables de structurer leurs informations et d'améliorer leur service. DTSC concentre son accompagnement sur les secteurs où les opérations sont fréquentes, les données nombreuses et les décisions quotidiennes importantes. Le cabinet propose ainsi des solutions concrètes: reporting, applications métier, automatisation, assistance IA, marketing digital et accompagnement des équipes.",
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
          "Les assurances ont besoin d'une vision claire sur les portefeuilles, les sinistres, les ventes, les renouvellements et les anomalies. DTSC peut aider à construire des dashboards de pilotage, des outils de suivi commercial, des analyses de fraude potentielle et des indicateurs de performance par produit, canal ou équipe.",
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
          "Les PME ont souvent besoin de solutions rapides, abordables et adaptées: visibilité marketing, formulaires de collecte, automatisation administrative, tableaux de bord financiers, applications métier et support client. DTSC les accompagne avec une logique progressive qui évite les projets trop lourds.",
        bullets: ["Marketing digital et acquisition", "Applications métier légères", "Automatisation administrative", "Reporting dirigeant"],
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
      "DTSC - Data and Tech Solutions Consulting - est un cabinet basé à Kinshasa dont la mission est d'aider les entreprises à améliorer leur performance, réduire leurs coûts et accroître leur visibilité grâce aux technologies. Les présentes conditions expliquent les règles d'utilisation de la plateforme. Elles ne remplacent pas un contrat commercial signé avec DTSC; lorsqu'une prestation, un devis, un cadrage ou une obligation spécifique est nécessaire, la validation humaine de l'équipe DTSC demeure obligatoire.",
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
          "L'utilisateur s'engage à fournir des informations exactes lors de son inscription et à conserver la confidentialité de ses identifiants. Les comptes sont personnels, rattachés à un rôle et peuvent être limités, suspendus ou désactivés en cas d'usage abusif, de tentative d'accès non autorisé ou de non-respect des règles de sécurité.",
        bullets: ["Compte personnel et non transférable", "Mot de passe confidentiel", "Rôles ADMIN, MANAGER, SUPPORT et CLIENT", "Suspension possible en cas d'abus"],
      },
      {
        heading: "Utilisation du chatbot",
        text:
          "Le chatbot DTSC aide à comprendre les services, clarifier un besoin et préparer un échange avec l'équipe. Il ne constitue pas une décision contractuelle, médicale, financière, juridique ou stratégique. Les réponses peuvent comporter des limites et doivent être validées par un interlocuteur DTSC lorsque la demande engage une prestation, un budget, une décision sensible ou un diagnostic spécialisé.",
        bullets: ["Assistant de qualification et d'orientation", "Aucune promesse automatique de prestation", "Escalade possible vers un ticket", "Limites d'usage configurables par administrateur"],
      },
      {
        heading: "Contenus, annonces et support",
        text:
          "Les annonces, commentaires, tickets et messages doivent rester professionnels, utiles et respectueux. DTSC peut modérer ou retirer un contenu qui perturbe la plateforme, expose des informations confidentielles, contient des propos illicites ou porte atteinte aux droits d'autrui. Les délais de modification des publications peuvent être configurés par l'administrateur.",
        bullets: ["Publication professionnelle requise", "Modération possible", "Confidentialité des tickets", "Fenêtre de modification paramétrable"],
      },
      {
        heading: "Modules internes HR & CFO / SCO",
        text:
          "Les modules internes de gestion RH, financière, achats, stocks, actifs, biens matériels, logistique et coordination COO sont réservés aux utilisateurs habilités. Les informations saisies doivent être exactes, nécessaires au travail, proportionnées et traitées avec confidentialité. Les collaborateurs, responsables, fournisseurs, comptes, budgets, transactions, paies, inventaires, équipements, tâches, blocages, réunions, rapports et workflows peuvent être reliés entre eux pour renforcer la cohérence opérationnelle. Les actions sensibles peuvent être journalisées afin d'assurer le contrôle interne, l'audit et la traçabilité.",
        bullets: ["Accès réservé par rôle", "Données internes confidentielles", "Référentiels collaborateurs, fournisseurs et biens matériels", "Paie et activités visibles uniquement selon habilitation", "Exactitude et proportionnalité", "Traçabilité des actions sensibles"],
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
      "La présente politique est rédigée en cohérence avec les principes du RGPD: transparence, limitation des finalités, minimisation des données, sécurité, droits des personnes et responsabilité du responsable de traitement. Elle est adaptée au contexte DTSC: conseil numérique, data, IA, automatisation, support client, comptes utilisateurs et conversations avec le chatbot. Elle doit être complétée par les informations légales propres à DTSC lorsque la structure juridique, l'adresse administrative ou les contacts officiels de protection des données seront finalisés.",
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
          "La plateforme peut traiter les informations de compte, les coordonnées professionnelles, le rôle utilisateur, les paramètres de sécurité, les préférences privées du compte, les conversations chatbot, les tickets support, les annonces, les commentaires, les notifications, les journaux d'usage IA, les données techniques nécessaires au fonctionnement, les statistiques de visites des pages publiques et, pour les utilisateurs autorisés, des données internes de gestion HR & CFO, SCO ou COO comme dossiers RH, responsables hiérarchiques, KPIs, départements, comptes, budgets, transactions, paies, bulletins de paie, factures, fournisseurs, achats, biens matériels, stocks, actifs, opérations logistiques, tâches internes, réunions, blocages, workflows partagés, rapports, commentaires opérationnels et pièces justificatives stockées côté serveur.",
        bullets: ["Identité et coordonnées professionnelles", "Préférences privées de compte et d'interface", "Messages, tickets et conversations", "Données internes HR & CFO / SCO / COO selon habilitation", "Suivi de paie et bulletins limités au collaborateur concerné", "Rôles, statuts et limites d'usage", "Journaux techniques et statistiques de visite"],
      },
      {
        heading: "Finalités du traitement",
        text:
          "Les données sont utilisées pour fournir l'accès à la plateforme, authentifier les utilisateurs, sécuriser les comptes, traiter les demandes support, afficher l'historique des conversations, mesurer l'usage IA, améliorer l'expérience utilisateur, administrer les rôles, préparer les échanges commerciaux ou techniques avec DTSC et piloter les opérations internes autorisées comme les ressources humaines, comptes financiers, budgets, transactions, paies, achats, fournisseurs, biens matériels, stocks, actifs, logistique, coordination COO, tâches, réunions, blocages et rapports.",
        bullets: ["Authentification et gestion des accès", "Support et suivi client", "Historique chatbot et continuité de service", "Pilotage administratif HR & CFO / SCO / COO", "Sécurité et audit"],
      },
      {
        heading: "Sécurité et confidentialité",
        text:
          "DTSC applique une séparation entre les clés API serveur et le frontend, utilise des sessions sécurisées, conserve les mots de passe sous forme hachée et protège les routes privées par rôle. Les accès administratifs doivent être limités aux personnes habilitées. Les mesures de sécurité doivent évoluer avec le niveau de risque, conformément aux principes de sécurité du traitement prévus par le RGPD.",
        bullets: ["Mots de passe hachés", "Clés API non exposées au client", "Contrôle d'accès RBAC", "Journalisation et limitation d'usage"],
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
          "La plateforme peut s'appuyer sur des services techniques comme l'hébergement Vercel, la base Neon PostgreSQL et l'API OpenAI côté serveur. Ces prestataires interviennent pour l'hébergement, la persistance des données, l'inférence IA ou la sécurité applicative. DTSC doit veiller à sélectionner des prestataires présentant des garanties appropriées et à documenter les traitements lorsque le cadre juridique l'exige.",
        bullets: ["Hébergement cloud", "Base de données PostgreSQL", "Traitement IA côté serveur", "Documentation des garanties prestataires"],
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
          "Le cookie de session sécurisé permet à un utilisateur connecté d'accéder à son espace privé sans ressaisir ses identifiants à chaque page. Il est HTTP-only, signé côté serveur et nécessaire à l'authentification. Sans ce cookie, les modules privés comme le dashboard, le chatbot, l'entreprise, le support ou l'administration ne peuvent pas fonctionner correctement.",
        bullets: ["Session authentifiée", "Protection HTTP-only", "Accès aux routes privées", "Expiration de session pour sécurité"],
      },
      {
        heading: "Préférences locales et PWA",
        text:
          "Certaines préférences peuvent être conservées localement dans le navigateur: thème clair/sombre, choix de reporter l'installation PWA, notifications visibles déjà affichées ou réglages d'interface. D'autres préférences privées peuvent être enregistrées sur le compte utilisateur pour retrouver la page de démarrage, la densité d'affichage, la langue, le fuseau horaire, le format de date, les synthèses email et les préférences de réponse IA après reconnexion. Ces informations améliorent l'expérience sans être utilisées pour du ciblage publicitaire. La PWA peut aussi mettre en cache des fichiers statiques afin de charger l'interface plus vite, mais elle ne cache pas les pages privées ni les réponses API contenant des données utilisateur.",
        bullets: ["Thème et confort visuel", "Préférences privées persistées", "Invitation PWA mémorisée", "Pas de cache API privée", "Page hors ligne sans données personnelles"],
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
