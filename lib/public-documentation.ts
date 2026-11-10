// Publicly curated summaries. Canonical functional guides remain in their existing registries.
// Never expose internal runbooks or assume application APIs are public partner contracts.
export type DocumentationAudience = "users" | "developers";
export type DocumentationLanguage = "fr" | "en";
export type DocumentationCopy = { title: string; summary: string; steps: string[]; notice: string };
export type DocumentationEntry = {
  slug: string;
  audience: DocumentationAudience;
  group: "bases" | "compte" | "collaboration" | "erp" | "dev";
  source: string;
  fr: DocumentationCopy;
  en: DocumentationCopy;
};

export const PUBLIC_DOCUMENTATION: DocumentationEntry[] = [
  {
    "slug": "bien-demarrer",
    "audience": "users",
    "group": "bases",
    "source": "docs/user-guides/DASHBOARD.md",
    "fr": {
      "title": "Bien démarrer sur DTSC Platform",
      "summary": "Créer son compte, entrer dans son espace et trouver le bon point de départ.",
      "steps": [
        "Ouvrez le site officiel DTSC puis choisissez l’inscription ou la connexion.",
        "Connectez-vous depuis l’espace Compte. Selon votre accès, vous retrouverez votre espace personnel ou une entreprise déjà rejointe.",
        "Ouvrez le Tableau de bord et repérez les actions attendues, les notifications et le statut de votre abonnement.",
        "Pour une opération d’entreprise, sélectionnez d’abord l’organisation autorisée puis le module disponible pour votre rôle."
      ],
      "notice": "Les écrans et possibilités varient selon le compte, le plan, les autorisations et les modules réellement activés."
    },
    "en": {
      "title": "Get started with DTSC Platform",
      "summary": "Create an account, reach your workspace and find your starting point.",
      "steps": [
        "Open the official DTSC website and choose sign-up or sign-in.",
        "Sign in through the Account area. Depending on access, you will reach your personal workspace or an organization you have joined.",
        "Open the Dashboard and review pending actions, notifications and subscription status.",
        "For company operations, first select an authorized organization and then a module available to your role."
      ],
      "notice": "Screens and capabilities depend on your account, plan, permissions and enabled modules."
    }
  },
  {
    "slug": "espaces-organisations",
    "audience": "users",
    "group": "bases",
    "source": "docs/user-guides/COMPANY_ACCOUNT.md",
    "fr": {
      "title": "Comptes, entreprises et contextes",
      "summary": "Comprendre la différence entre espace personnel et entreprise cliente.",
      "steps": [
        "Un compte personnel est distinct de l’organisation pour laquelle vous travaillez.",
        "Une organisation apparaît dans votre sélecteur après une adhésion active autorisée.",
        "Vérifiez toujours le nom de l’espace actif avant d’enregistrer un objet métier.",
        "Si une entreprise n’apparaît pas, vérifiez votre invitation et demandez à son administrateur de confirmer votre accès."
      ],
      "notice": "Une relation professionnelle ou une fiche de contact n’accorde pas automatiquement un accès aux données d’entreprise."
    },
    "en": {
      "title": "Accounts and organizations",
      "summary": "Understand the difference between personal and company workspaces.",
      "steps": [
        "Your personal account is separate from each organization you work with.",
        "An organization appears in your context switcher after authorized, active membership.",
        "Always verify the active workspace before saving a business record.",
        "If an organization is missing, check your invitation and ask its administrator to review access."
      ],
      "notice": "A professional relationship or contact profile does not automatically grant access to company data."
    }
  },
  {
    "slug": "tableau-de-bord",
    "audience": "users",
    "group": "bases",
    "source": "docs/user-guides/DASHBOARD.md",
    "fr": {
      "title": "Lire son tableau de bord",
      "summary": "Repérer ses actions, notifications, organisations et limites.",
      "steps": [
        "Vérifiez le contexte actif dans l’en-tête.",
        "Consultez les actions importantes et suivez les liens vers les objets auxquels vous avez accès.",
        "Lisez le statut de l’abonnement et les limites du contexte sélectionné.",
        "Sur mobile, faites défiler les rangées d’indicateurs horizontalement si nécessaire."
      ],
      "notice": "Les compteurs sont filtrés selon vos droits et peuvent varier selon le contexte."
    },
    "en": {
      "title": "Understand your dashboard",
      "summary": "Find pending actions, notifications, organizations and limits.",
      "steps": [
        "Check the active context in the header.",
        "Review important actions and follow links to records you are allowed to view.",
        "Read the subscription status and usage limits for the selected context.",
        "On mobile, swipe horizontal metric rows when needed."
      ],
      "notice": "Metrics respect permissions and may differ between contexts."
    }
  },
  {
    "slug": "invitations-collaborateurs",
    "audience": "users",
    "group": "collaboration",
    "source": "docs/user-guides/INVITATIONS.md",
    "fr": {
      "title": "Invitations et collaborateurs",
      "summary": "Rejoindre une entreprise ou collaborer avec les personnes autorisées.",
      "steps": [
        "Ouvrez les invitations depuis votre compte personnel ou une notification.",
        "Vérifiez l’organisation, la personne qui vous invite et le rôle proposé.",
        "Acceptez ou refusez l’invitation. L’acceptation seule ne garantit pas tous les droits métiers.",
        "Après l’adhésion, sélectionnez l’organisation puis utilisez les fonctions auxquelles vous êtes autorisé."
      ],
      "notice": "Les droits restent contrôlés par le serveur ; l’ajout à un groupe ne confère pas un accès ERP."
    },
    "en": {
      "title": "Invitations and collaborators",
      "summary": "Join an organization and collaborate with authorized people.",
      "steps": [
        "Open invitations from your personal account or notifications.",
        "Check the organization, inviter and proposed role.",
        "Accept or decline. Membership does not grant all business permissions.",
        "After joining, switch to the organization and use features allowed for your role."
      ],
      "notice": "Permissions are enforced server-side. Group membership does not grant ERP access."
    }
  },
  {
    "slug": "abonnement-limites",
    "audience": "users",
    "group": "compte",
    "source": "docs/user-guides/BILLING.md",
    "fr": {
      "title": "Abonnement, factures et limites",
      "summary": "Consulter l’offre appliquée sans confondre SaaS et comptabilité ERP.",
      "steps": [
        "Ouvrez Abonnement dans le contexte voulu : compte personnel ou organisation active.",
        "Lisez le nom du plan, son statut, ses dates et ses limites effectivement affichées.",
        "Consultez les factures SaaS et les possibilités de renouvellement réellement proposées.",
        "Pour un renouvellement manuel, suivez la procédure affichée ou contactez le support."
      ],
      "notice": "Les prix, plafonds et moyens de paiement peuvent évoluer ; la page Tarifs et l’abonnement actif font foi."
    },
    "en": {
      "title": "Subscription, invoices and limits",
      "summary": "View your plan without confusing SaaS billing with ERP accounting.",
      "steps": [
        "Open Billing in the relevant personal or organizational context.",
        "Review the actual plan name, status, dates and displayed limits.",
        "Consult SaaS invoices and available renewal options.",
        "For manual renewal, follow the on-screen process or contact support."
      ],
      "notice": "Pricing, quotas and payment options may change; the current Plans page and active subscription are authoritative."
    }
  },
  {
    "slug": "collaboration",
    "audience": "users",
    "group": "collaboration",
    "source": "docs/user-guides/GROUP_CONVERSATIONS.md",
    "fr": {
      "title": "Messages, groupes et réunions",
      "summary": "Collaborer en tenant compte des invitations et des autorisations.",
      "steps": [
        "Ouvrez Mes collaborateurs ou la conversation autorisée.",
        "Vérifiez les membres et le contexte avant de partager un message ou un document.",
        "Utilisez les réunions ou appels uniquement lorsqu’ils sont disponibles et configurés.",
        "Pour une demande métier, privilégiez les tâches, demandes et validations plutôt qu’un simple message informel."
      ],
      "notice": "La disponibilité des appels, fichiers et fonctions temps réel dépend du navigateur et des services configurés."
    },
    "en": {
      "title": "Messages, groups and meetings",
      "summary": "Collaborate while respecting invitations and permissions.",
      "steps": [
        "Open your collaborators or an authorized conversation.",
        "Check participants and context before sending messages or files.",
        "Use meetings or calls only when available and configured.",
        "For formal business decisions, use tasks, requests and approvals instead of relying only on chat."
      ],
      "notice": "Calls, files and real-time features depend on browser support and configured services."
    }
  },
  {
    "slug": "finances-entreprise",
    "audience": "users",
    "group": "erp",
    "source": "docs/ERP_FINAL_USER_GUIDE.md",
    "fr": {
      "title": "Comprendre le flux financier ERP",
      "summary": "Budget, dépense, facture, paiement, trésorerie et comptabilité n’ont pas le même rôle.",
      "steps": [
        "Configurez les comptes et les paramètres financiers autorisés de l’entreprise.",
        "Établissez et faites approuver un budget avant les dépenses soumises à contrôle budgétaire.",
        "Enregistrez la dépense ou la facture dans son module métier avec les liens et justificatifs requis.",
        "Traitez séparément les validations, paiements, allocations et mouvements de trésorerie.",
        "Consultez la comptabilité et les rapports lorsque les modules et règles de comptabilisation sont activés."
      ],
      "notice": "Une dépense approuvée n’est pas nécessairement payée. Les impacts comptables suivent le workflow applicable."
    },
    "en": {
      "title": "Understand the ERP finance workflow",
      "summary": "Budgets, expenses, invoices, payments, cash and accounting have distinct roles.",
      "steps": [
        "Set up authorized company finance accounts and settings.",
        "Create and approve a budget before expenses requiring budget control.",
        "Record the expense or invoice in its business module with required references and evidence.",
        "Handle approvals, payments, allocations and treasury movements as separate steps.",
        "Review accounting and reports when the corresponding modules and posting rules are enabled."
      ],
      "notice": "An approved expense is not necessarily paid. Accounting effects follow the applicable workflow."
    }
  },
  {
    "slug": "retail-multi-boutiques",
    "audience": "users",
    "group": "erp",
    "source": "docs/HOTFIX_RETAIL_GUIDED_MULTISTORE_2026.md",
    "fr": {
      "title": "Commerce RETAIL et plusieurs boutiques",
      "summary": "Organiser les points de vente, gérants, articles et caisses d’une entreprise.",
      "steps": [
        "Choisissez l’entreprise de commerce autorisée et ouvrez son administration.",
        "Créez et configurez les boutiques ou sites selon les fonctions activées.",
        "Affectez les collaborateurs et leurs rôles aux boutiques concernées.",
        "Renseignez les articles, stocks et paramètres de caisse, puis vérifiez les prérequis de vente.",
        "Utilisez le POS de la boutique appropriée et contrôlez factures, encaissements et clôtures."
      ],
      "notice": "Les opérations Mobile Money, télécom et caisse nécessitent leurs autorisations et leur configuration métier propres."
    },
    "en": {
      "title": "RETAIL and multiple stores",
      "summary": "Organize points of sale, store managers, inventory and cash sessions.",
      "steps": [
        "Select an authorized retail organization and open its administration.",
        "Set up stores or sites using the enabled configuration features.",
        "Assign collaborators and roles to the relevant stores.",
        "Configure products, inventory and cash prerequisites before selling.",
        "Use the correct store POS and review invoices, collections and daily close."
      ],
      "notice": "Mobile Money, telco and cash operations require separate permissions and business configuration."
    }
  },
  {
    "slug": "aide-support",
    "audience": "users",
    "group": "compte",
    "source": "docs/user-guides/NOTIFICATIONS.md",
    "fr": {
      "title": "Trouver de l’aide et signaler un problème",
      "summary": "Utiliser les guides contextuels et contacter le support sans divulguer d’informations sensibles.",
      "steps": [
        "Commencez par le guide affiché dans le module concerné.",
        "Vérifiez le contexte d’entreprise actif, vos permissions et la connexion Internet.",
        "Depuis Support, créez une demande avec une description reproductible du problème.",
        "Suivez votre ticket et ses échanges dans l’espace Support autorisé."
      ],
      "notice": "Ne transmettez jamais de mot de passe, clé API, code MFA, donnée médicale ou bancaire sensible dans un ticket."
    },
    "en": {
      "title": "Get help and report an issue",
      "summary": "Use contextual guides and contact support safely.",
      "steps": [
        "Start with the guide available in the relevant module.",
        "Check your active organization, permissions and network connection.",
        "Open Support and create a ticket with reproducible steps.",
        "Follow updates to your ticket in the authorized Support area."
      ],
      "notice": "Never share passwords, API keys, MFA codes, medical or sensitive banking data in support tickets."
    }
  },
  {
    "slug": "developpeurs-introduction",
    "audience": "developers",
    "group": "dev",
    "source": "docs/TECHNICAL_DOCUMENTATION.md",
    "fr": {
      "title": "Comprendre les intégrations DTSC",
      "summary": "Une introduction à l’écosystème, sans accès automatique aux API privées.",
      "steps": [
        "DTSC Platform fonctionne avec un site public, un espace Compte, un SaaS, une Console et un Support.",
        "Les données métiers d’entreprise sont isolées par organisation, abonnement et droits.",
        "Les routes API utilisées par l’application ne sont pas, par leur seule existence, des API publiques partenaires.",
        "Une intégration future exigera un contrat documenté, des identifiants dédiés, des permissions et des environnements certifiés."
      ],
      "notice": "Statut : aperçu développeur. Aucun programme d’accès API externe n’est annoncé comme ouvert."
    },
    "en": {
      "title": "Introduction to DTSC integrations",
      "summary": "Explore the ecosystem without assuming access to private APIs.",
      "steps": [
        "DTSC Platform includes a public site, Account, SaaS application, Console and Support.",
        "Company data is isolated by organization, subscription and permissions.",
        "Internal application API routes are not automatically public partner APIs.",
        "Future integrations will require documented contracts, dedicated credentials, permissions and certified environments."
      ],
      "notice": "Status: developer overview. No external API access program is claimed to be open."
    }
  },
  {
    "slug": "developpeurs-securite",
    "audience": "developers",
    "group": "dev",
    "source": "docs/ERP_COMMON_DOMAIN_SECURITY.md",
    "fr": {
      "title": "Principes de sécurité pour les futures API",
      "summary": "Authentification, isolation par organisation, droits et prévention des doublons.",
      "steps": [
        "Chaque requête devra être authentifiée selon un mécanisme d’intégration officiellement documenté.",
        "Le contexte d’organisation et les droits seront vérifiés côté serveur.",
        "Les entrées seront validées et les usages soumis à quotas et journalisation appropriés.",
        "Les opérations financières ou mutantes critiques utiliseront des mécanismes d’idempotence et de traçabilité."
      ],
      "notice": "Ce document explique des principes ; il ne définit pas de clé, de scope ni de méthode d’authentification déjà délivrable."
    },
    "en": {
      "title": "Security principles for future APIs",
      "summary": "Authentication, tenant isolation, permissions and duplicate prevention.",
      "steps": [
        "Requests must use a formally documented integration authentication mechanism.",
        "Organization scope and permissions will be checked server-side.",
        "Inputs will be validated with appropriate quotas and audit logging.",
        "Sensitive or financial mutations will require idempotency and traceability safeguards."
      ],
      "notice": "This describes principles, not currently issued keys, scopes or a live authentication method."
    }
  },
  {
    "slug": "api-feuille-de-route",
    "audience": "developers",
    "group": "dev",
    "source": "docs/ERP_COMMON_DOMAIN_API.md",
    "fr": {
      "title": "API publique : statut et feuille de route",
      "summary": "Ce qui doit être certifié avant d’ouvrir une API aux partenaires.",
      "steps": [
        "Identifier les domaines réellement éligibles à une API externe et leurs propriétaires métiers.",
        "Publier un contrat OpenAPI versionné qui décrit chaque ressource, méthode, permissions, erreurs et limites.",
        "Prévoir des identifiants d’intégration propres aux partenaires, rotation, révocation et sandbox.",
        "Valider quotas, idempotence, webhooks éventuels, documentation et E2E de sécurité.",
        "N’annoncer la disponibilité qu’après validation en Production par DTSC."
      ],
      "notice": "En préparation. Aucun endpoint partenaire, token de test ou bac à sable public n’est déclaré disponible."
    },
    "en": {
      "title": "Public API: status and roadmap",
      "summary": "What must be certified before partner API access is launched.",
      "steps": [
        "Select domains eligible for external API access and assign business owners.",
        "Publish a versioned OpenAPI contract for resources, methods, permissions, errors and limits.",
        "Provide partner credentials with rotation, revocation and a sandbox.",
        "Validate rate limits, idempotency, possible webhooks, documentation and security E2E.",
        "Announce availability only after DTSC production certification."
      ],
      "notice": "Planned. No partner endpoint, test token or public sandbox is claimed to be available."
    }
  }
];

export function getPublicDocumentation(slug: string | undefined) {
  return PUBLIC_DOCUMENTATION.find((entry) => entry.slug === slug) || null;
}
