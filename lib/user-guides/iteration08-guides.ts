import type { ContextualUserGuide } from "@/lib/user-guides/iteration04-guides";

export const ITERATION08_GUIDE_CODES = [
  "PUBLIC_SITE", "PUBLIC_NAVIGATION", "PUBLIC_SEARCH", "PUBLIC_SERVICES", "PUBLIC_SOLUTIONS", "PUBLIC_SECTORS", "PUBLIC_PROJECTS", "PUBLIC_RESOURCES", "PUBLIC_CONTACT", "PUBLIC_AI_ASSISTANT",
  "ACCOUNT_SIGN_IN", "ACCOUNT_SIGN_UP", "ACCOUNT_EMAIL_VERIFICATION", "ACCOUNT_PASSWORD_RECOVERY", "ACCOUNT_CONTEXT_SELECTION",
  "SUPPORT", "SUPPORT_TICKETS", "SUPPORT_COMMENTS", "SUPPORT_SLA", "PRODUCT_NAVIGATION", "PWA_INSTALLATION", "SESSION_AND_LOGOUT", "PRIVACY_AND_COOKIES",
] as const;

export type Iteration08GuideCode = (typeof ITERATION08_GUIDE_CODES)[number];

type Locale = "fr" | "en";

const labels: Record<Iteration08GuideCode, { fr: string; en: string }> = {
  PUBLIC_SITE: { fr: "Site public DTSC", en: "DTSC public website" },
  PUBLIC_NAVIGATION: { fr: "Navigation publique", en: "Public navigation" },
  PUBLIC_SEARCH: { fr: "Recherche publique", en: "Public search" },
  PUBLIC_SERVICES: { fr: "Services et sept leviers", en: "Services and seven levers" },
  PUBLIC_SOLUTIONS: { fr: "Solutions DTSC", en: "DTSC solutions" },
  PUBLIC_SECTORS: { fr: "Secteurs accompagnés", en: "Supported sectors" },
  PUBLIC_PROJECTS: { fr: "Projets et niveaux de preuve", en: "Projects and evidence levels" },
  PUBLIC_RESOURCES: { fr: "Ressources et publications", en: "Resources and publications" },
  PUBLIC_CONTACT: { fr: "Contact et qualification", en: "Contact and qualification" },
  PUBLIC_AI_ASSISTANT: { fr: "Assistant IA public", en: "Public AI assistant" },
  ACCOUNT_SIGN_IN: { fr: "Connexion Account", en: "Account sign-in" },
  ACCOUNT_SIGN_UP: { fr: "Inscription Account", en: "Account sign-up" },
  ACCOUNT_EMAIL_VERIFICATION: { fr: "Vérification email", en: "Email verification" },
  ACCOUNT_PASSWORD_RECOVERY: { fr: "Récupération du mot de passe", en: "Password recovery" },
  ACCOUNT_CONTEXT_SELECTION: { fr: "Choix du contexte", en: "Context selection" },
  SUPPORT: { fr: "Produit Support DTSC", en: "DTSC Support product" },
  SUPPORT_TICKETS: { fr: "Tickets Support", en: "Support tickets" },
  SUPPORT_COMMENTS: { fr: "Commentaires Support", en: "Support comments" },
  SUPPORT_SLA: { fr: "SLA et priorités", en: "SLA and priorities" },
  PRODUCT_NAVIGATION: { fr: "Navigation interproduits", en: "Cross-product navigation" },
  PWA_INSTALLATION: { fr: "Installation PWA", en: "PWA installation" },
  SESSION_AND_LOGOUT: { fr: "Session et déconnexion", en: "Session and sign-out" },
  PRIVACY_AND_COOKIES: { fr: "Confidentialité et cookies", en: "Privacy and cookies" },
};

function buildGuide(code: Iteration08GuideCode, locale: Locale): ContextualUserGuide {
  const title = labels[code][locale];
  const english = locale === "en";
  return {
    code,
    title,
    summary: english
      ? `Use ${title} safely and understand its real scope in the DTSC ecosystem.`
      : `Utiliser ${title} en sécurité et comprendre son périmètre réel dans l’écosystème DTSC.`,
    audience: english ? "DTSC visitors, users and authorized managers" : "Visiteurs, utilisateurs DTSC et gestionnaires autorisés",
    updatedAt: "2026-08-06",
    capabilities: english
      ? ["Responsive and keyboard-accessible journey", "Host-aware product separation", "French and English presentation", "No automatic commercial validation"]
      : ["Parcours responsive et accessible au clavier", "Séparation des produits selon le sous-domaine", "Présentation française et anglaise", "Aucune validation commerciale automatique"],
    steps: [
      {
        title: english ? "Open the right product" : "Ouvrir le bon produit",
        description: english ? "Use the product switcher or the contextual link. DTSC preserves only trusted return URLs." : "Utilisez le sélecteur de produits ou le lien contextuel. DTSC conserve uniquement les URLs de retour fiables.",
        actions: english ? ["Check the active product", "Use the visible navigation", "Sign in when a private action requires it"] : ["Vérifier le produit actif", "Utiliser la navigation visible", "Se connecter lorsqu’une action privée l’exige"],
      },
      {
        title: english ? "Complete the action" : "Réaliser l’action",
        description: english ? "Follow field labels, validation messages and status feedback. Sensitive actions are checked by the server." : "Suivez les libellés, validations et retours de statut. Les actions sensibles sont vérifiées par le serveur.",
        actions: english ? ["Enter only necessary data", "Review the target context", "Confirm the result"] : ["Saisir uniquement les données nécessaires", "Vérifier le contexte cible", "Confirmer le résultat"],
      },
      {
        title: english ? "Get help or sign out" : "Obtenir de l’aide ou se déconnecter",
        description: english ? "Open Support for a traceable request. Sign-out removes the shared DTSC session cookie." : "Ouvrez Support pour une demande traçable. La déconnexion supprime le cookie de session DTSC partagé.",
        actions: english ? ["Open the native guide", "Create a Support ticket if needed", "Sign out from any authenticated product"] : ["Ouvrir le guide natif", "Créer un ticket Support si nécessaire", "Se déconnecter depuis tout produit authentifié"],
      },
    ],
    limitations: english
      ? ["Manual owner E2E validation remains mandatory before COMMERCIAL_READY.", "Editorial content is not automatically translated without review."]
      : ["La validation E2E manuelle du propriétaire reste obligatoire avant COMMERCIAL_READY.", "Le contenu éditorial n’est pas traduit automatiquement sans validation."],
  };
}

export const ITERATION08_USER_GUIDES = Object.fromEntries(
  ITERATION08_GUIDE_CODES.map((code) => [code, { fr: buildGuide(code, "fr"), en: buildGuide(code, "en") }]),
) as Record<Iteration08GuideCode, Record<Locale, ContextualUserGuide>>;

export function getIteration08UserGuide(code: Iteration08GuideCode, locale: Locale = "fr") {
  return ITERATION08_USER_GUIDES[code][locale];
}
