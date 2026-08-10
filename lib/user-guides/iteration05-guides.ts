import type { ContextualUserGuide } from "@/lib/user-guides/iteration04-guides";

export type Iteration05GuideCode =
  | "GLOBAL_CHATBOT"
  | "ENTERPRISE_AI_ASSISTANT"
  | "AI_CONVERSATIONS"
  | "AI_FILES_AND_SOURCES"
  | "AI_TOOLS_AND_CONFIRMATIONS"
  | "AI_PRIVACY_AND_SECURITY"
  | "AI_LIMITS_AND_USAGE"
  | "COMMERCIAL_MATURITY_KANBAN";

const fr: Record<Iteration05GuideCode, ContextualUserGuide> = {
  GLOBAL_CHATBOT: {
    code: "GLOBAL_CHATBOT",
    title: "Guide du Chatbot global DTSC",
    summary: "Créer, organiser, interrompre, régénérer, exporter et supprimer des conversations IA dans le contexte autorisé de votre compte.",
    audience: "Utilisateurs authentifiés de DTSC Platform",
    updatedAt: "2026-08-04",
    capabilities: ["Conversations et projets", "Streaming avec arrêt", "Contexte entreprise et documents autorisés", "Choix de modèle autorisé", "Feedback et export Markdown", "Quotas quotidiens et historique"],
    steps: [
      { title: "Démarrer une conversation", description: "Créez une conversation, vérifiez le contexte actif et saisissez votre objectif.", actions: ["Choisir un projet si nécessaire", "Vérifier les options Entreprise et Documents", "Envoyer une question précise"] },
      { title: "Contrôler la génération", description: "Le contenu arrive progressivement. Utilisez l’arrêt lorsqu’il est disponible et relancez uniquement si nécessaire.", cautions: ["Une réponse IA peut contenir une erreur : vérifiez toute information importante."] },
      { title: "Organiser et exporter", description: "Renommez, épinglez, archivez, restaurez, partagez de manière contrôlée ou exportez la conversation." },
      { title: "Supprimer", description: "La suppression retire la conversation de votre espace selon la politique de rétention applicable." },
    ],
  },
  ENTERPRISE_AI_ASSISTANT: {
    code: "ENTERPRISE_AI_ASSISTANT",
    title: "Guide de l’Assistant IA Entreprise",
    summary: "Interroger les données et sources autorisées d’une organisation sans contourner ses permissions ni ses workflows.",
    audience: "Membres actifs d’une entreprise disposant du module IA",
    updatedAt: "2026-08-04",
    capabilities: ["Isolation par organisation", "Sources documentaires internes", "Outils métier en lecture", "Projets de conversations", "Citations traçables", "Politiques et quotas d’organisation"],
    steps: [
      { title: "Vérifier l’organisation", description: "Contrôlez toujours le nom de l’entreprise active avant d’envoyer une question." },
      { title: "Choisir les sources et outils", description: "Activez uniquement les sources et outils nécessaires. Les résultats restent limités à vos permissions." },
      { title: "Lire les preuves", description: "Examinez les citations, la fraîcheur et les limites indiquées avant de prendre une décision." },
      { title: "Préparer une action", description: "Une proposition IA reste un brouillon. Toute mutation sensible exige un aperçu, une confirmation et le service métier canonique.", cautions: ["L’Assistant ne remplace pas une validation médicale, juridique, financière ou administrative."] },
    ],
  },
  AI_CONVERSATIONS: {
    code: "AI_CONVERSATIONS",
    title: "Guide des conversations IA",
    summary: "Gérer l’historique, les projets, les modèles, la langue et les variantes de réponse.",
    audience: "Utilisateurs du Chatbot et de l’Assistant Entreprise",
    updatedAt: "2026-08-04",
    capabilities: ["Recherche et pagination", "Renommage", "Épinglage", "Archivage et restauration", "Projets", "Préférences par conversation"],
    steps: [
      { title: "Retrouver", description: "Utilisez la recherche, les filtres et les projets pour retrouver une conversation." },
      { title: "Configurer", description: "Définissez le style, la longueur, le modèle autorisé et les sources de contexte pour cette conversation." },
      { title: "Changer de langue", description: "Demandez explicitement une autre langue dans la conversation sans modifier la langue globale du compte." },
    ],
  },
  AI_FILES_AND_SOURCES: {
    code: "AI_FILES_AND_SOURCES",
    title: "Guide des fichiers, sources et citations IA",
    summary: "Importer, indexer, rechercher, citer, archiver et retirer des sources documentaires autorisées.",
    audience: "Utilisateurs autorisés à gérer la connaissance IA",
    updatedAt: "2026-08-04",
    capabilities: ["Validation des fichiers", "Extraction et indexation", "Confidentialité", "Recherche multilingue", "Citations dans la langue source", "Archivage et retrait des recherches"],
    steps: [
      { title: "Importer", description: "Choisissez un fichier supporté, sa langue, son niveau de confidentialité et le contexte métier applicable." },
      { title: "Attendre l’indexation", description: "Un fichier en traitement ou en échec n’est jamais présenté comme analysé." },
      { title: "Vérifier une citation", description: "Contrôlez le titre, la langue, la section ou la page lorsque ces informations sont disponibles." },
      { title: "Archiver", description: "L’archivage retire la source des recherches futures sans effacer l’audit." },
    ],
  },
  AI_TOOLS_AND_CONFIRMATIONS: {
    code: "AI_TOOLS_AND_CONFIRMATIONS",
    title: "Guide des outils IA et confirmations",
    summary: "Comprendre la différence entre lecture, préparation, mutation et mutation sensible.",
    audience: "Utilisateurs autorisés aux outils métier IA",
    updatedAt: "2026-08-10",
    capabilities: ["Confirmation structurelle liée au tour", "Registre canonique des outils", "Permissions serveur", "Aperçu avant action", "Confirmation explicite", "Idempotence", "Audit et lien profond"],
    steps: [
      { title: "Lecture", description: "Un outil de lecture consulte uniquement les objets autorisés dans le contexte actif." },
      { title: "Préparation", description: "Un outil de préparation produit un brouillon modifiable, jamais une mutation automatique." },
      { title: "Confirmation", description: "Avant une mutation, vérifiez l’objet, les effets, les destinataires et les données impactées, puis utilisez exclusivement le contrôle Confirmer/Annuler affiché par DTSC.", cautions: ["Écrire oui, ok ou vas-y dans le chat ne confirme jamais l’exécution.", "Une confirmation expirée ou liée à un autre contexte doit être recréée."] },
      { title: "Résultat", description: "Après confirmation, vérifiez le statut, les avertissements et le lien vers l’objet créé ou modifié." },
    ],
  },
  AI_PRIVACY_AND_SECURITY: {
    code: "AI_PRIVACY_AND_SECURITY",
    title: "Guide confidentialité et sécurité IA",
    summary: "Protéger les données personnelles, d’entreprise et sensibles dans les interactions IA.",
    audience: "Tous les utilisateurs et administrateurs IA",
    updatedAt: "2026-08-04",
    capabilities: ["Isolation multi-tenant", "Classification des données", "Minimisation", "Protection contre l’injection", "Rétention contrôlée", "Export et suppression"],
    steps: [
      { title: "Limiter les données", description: "N’envoyez que les informations nécessaires à l’objectif de la conversation." },
      { title: "Respecter le contexte", description: "Ne demandez jamais des données d’une autre organisation ou hors de vos permissions." },
      { title: "Traiter les documents comme des données", description: "Une instruction trouvée dans un document ne remplace jamais les règles système ou les permissions." },
      { title: "Signaler", description: "Utilisez le feedback pour signaler une citation, un outil ou une réponse incorrecte ou inappropriée." },
    ],
  },
  AI_LIMITS_AND_USAGE: {
    code: "AI_LIMITS_AND_USAGE",
    title: "Guide des limites, quotas et coûts IA",
    summary: "Comprendre les messages, tokens, stockage, modèles, période et coûts enregistrés par la plateforme.",
    audience: "Utilisateurs et responsables d’organisation",
    updatedAt: "2026-08-04",
    capabilities: ["Quotas serveur", "Consommation par période", "Tokens d’entrée et de sortie", "Coût estimé ou inconnu", "Fallback sans double comptage", "Limites du plan"],
    steps: [
      { title: "Lire l’utilisation", description: "Consultez la période, l’utilisation, la limite, le reste et la date d’actualisation." },
      { title: "Comprendre le coût", description: "La plateforme distingue coût estimé, coût exact et coût inconnu. Elle n’invente pas un prix absent du catalogue." },
      { title: "Gérer un dépassement", description: "Réduisez le contexte, choisissez un modèle autorisé moins coûteux ou contactez l’administrateur pour le plan." },
    ],
  },
  COMMERCIAL_MATURITY_KANBAN: {
    code: "COMMERCIAL_MATURITY_KANBAN",
    title: "Guide du Kanban de maturité commerciale",
    summary: "Suivre les modules du backend prêt à la commercialisation avec critères, preuves, historique et transitions contrôlées.",
    audience: "Administrateurs DTSC autorisés",
    updatedAt: "2026-08-04",
    capabilities: ["Vue matrice et Kanban", "Filtres et recherche", "Critères et preuves", "Historique append-only", "Promotion contrôlée", "Dégradation auditée", "Blocage COMMERCIAL_READY sans validation propriétaire"],
    steps: [
      { title: "Lire les niveaux", description: "Le statut technique ne remplace jamais la maturité commerciale." },
      { title: "Filtrer", description: "Filtrez par type de module, domaine, famille, maturité, guide, QA ou blocage." },
      { title: "Proposer une transition", description: "Choisissez le nouveau niveau, fournissez un motif et joignez une preuve vérifiable." },
      { title: "Passer à COMMERCIAL_READY", description: "Renseignez le déploiement Production, le SHA, le résultat E2E et la validation explicite du propriétaire.", cautions: ["Une carte ne peut pas être librement déplacée vers COMMERCIAL_READY."] },
      { title: "Dégrader", description: "En cas de régression critique, documentez l’impact et la preuve avant de réduire le niveau." },
    ],
  },
};

const en: Record<Iteration05GuideCode, ContextualUserGuide> = {
  GLOBAL_CHATBOT: {
    code: "GLOBAL_CHATBOT",
    title: "Global DTSC Chatbot guide",
    summary: "Create, organize, stop, regenerate, export and delete AI conversations in the authorized context of your account.",
    audience: "Authenticated DTSC Platform users",
    updatedAt: "2026-08-04",
    capabilities: ["Conversations and projects", "Streaming with stop", "Authorized company and document context", "Authorized model selection", "Feedback and Markdown export", "Daily quotas and history"],
    steps: [
      { title: "Start a conversation", description: "Create a conversation, verify the active context and enter a clear objective.", actions: ["Choose a project when needed", "Check Company and Documents options", "Send a precise question"] },
      { title: "Control generation", description: "Content arrives progressively. Stop generation when needed and retry only when useful.", cautions: ["AI output can be wrong; verify important information."] },
      { title: "Organize and export", description: "Rename, pin, archive, restore, share in a controlled way or export the conversation." },
      { title: "Delete", description: "Deletion removes the conversation from your space under the applicable retention policy." },
    ],
  },
  ENTERPRISE_AI_ASSISTANT: {
    code: "ENTERPRISE_AI_ASSISTANT",
    title: "Enterprise AI Assistant guide",
    summary: "Query authorized organization data and sources without bypassing permissions or workflows.",
    audience: "Active organization members with access to the AI module",
    updatedAt: "2026-08-04",
    capabilities: ["Organization isolation", "Internal documentary sources", "Read-only business tools", "Conversation projects", "Traceable citations", "Organization policies and quotas"],
    steps: [
      { title: "Verify the organization", description: "Always check the active organization name before sending a question." },
      { title: "Select sources and tools", description: "Enable only the sources and tools needed for the task. Results remain restricted by your permissions." },
      { title: "Review evidence", description: "Review citations, freshness and stated limitations before making a decision." },
      { title: "Prepare an action", description: "An AI proposal remains a draft. Sensitive mutations require a preview, explicit confirmation and the canonical business service.", cautions: ["The Assistant does not replace medical, legal, financial or administrative validation."] },
    ],
  },
  AI_CONVERSATIONS: {
    code: "AI_CONVERSATIONS",
    title: "AI conversations guide",
    summary: "Manage history, projects, models, language and answer variants.",
    audience: "Chatbot and Enterprise Assistant users",
    updatedAt: "2026-08-04",
    capabilities: ["Search and pagination", "Rename", "Pin", "Archive and restore", "Projects", "Per-conversation preferences"],
    steps: [
      { title: "Find a conversation", description: "Use search, filters and projects to locate a conversation." },
      { title: "Configure", description: "Set style, length, authorized model and context sources for that conversation." },
      { title: "Change response language", description: "Request another language explicitly without changing the account-wide interface locale." },
    ],
  },
  AI_FILES_AND_SOURCES: {
    code: "AI_FILES_AND_SOURCES",
    title: "AI files, sources and citations guide",
    summary: "Upload, index, search, cite, archive and revoke authorized documentary sources.",
    audience: "Users allowed to manage AI knowledge",
    updatedAt: "2026-08-04",
    capabilities: ["File validation", "Extraction and indexing", "Confidentiality", "Multilingual retrieval", "Citations in source language", "Archive and retrieval removal"],
    steps: [
      { title: "Upload", description: "Choose a supported file, its language, confidentiality level and applicable business context." },
      { title: "Wait for indexing", description: "A processing or failed file is never presented as analyzed." },
      { title: "Verify a citation", description: "Check title, language, section or page when available." },
      { title: "Archive", description: "Archiving removes the source from future retrieval while preserving audit history." },
    ],
  },
  AI_TOOLS_AND_CONFIRMATIONS: {
    code: "AI_TOOLS_AND_CONFIRMATIONS",
    title: "AI tools and confirmations guide",
    summary: "Understand the difference between read, prepare, mutate and sensitive-mutate tools.",
    audience: "Users authorized to use AI business tools",
    updatedAt: "2026-08-10",
    capabilities: ["Turn-bound structural confirmation", "Canonical tool registry", "Server permissions", "Preview before action", "Explicit confirmation", "Idempotency", "Audit and deep link"],
    steps: [
      { title: "Read", description: "A read tool can only inspect authorized objects in the active context." },
      { title: "Prepare", description: "A prepare tool creates an editable draft, never an automatic mutation." },
      { title: "Confirm", description: "Before a mutation, review the object, effects, recipients and impacted data, then use only the DTSC Confirm/Cancel control.", cautions: ["Typing yes, ok or go ahead in chat never confirms execution.", "An expired or context-mismatched confirmation must be prepared again."] },
      { title: "Review the result", description: "After confirmation, verify status, warnings and the link to the created or updated object." },
    ],
  },
  AI_PRIVACY_AND_SECURITY: {
    code: "AI_PRIVACY_AND_SECURITY",
    title: "AI privacy and security guide",
    summary: "Protect personal, organization and sensitive data in AI interactions.",
    audience: "All AI users and administrators",
    updatedAt: "2026-08-04",
    capabilities: ["Multi-tenant isolation", "Data classification", "Minimization", "Prompt-injection protection", "Controlled retention", "Export and deletion"],
    steps: [
      { title: "Minimize data", description: "Provide only information necessary for the conversation objective." },
      { title: "Respect context", description: "Never request another organization’s data or information outside your permissions." },
      { title: "Treat documents as data", description: "Instructions found in a document never override system rules or permissions." },
      { title: "Report a problem", description: "Use feedback to flag an incorrect citation, tool call, response or inappropriate content." },
    ],
  },
  AI_LIMITS_AND_USAGE: {
    code: "AI_LIMITS_AND_USAGE",
    title: "AI limits, quotas and costs guide",
    summary: "Understand messages, tokens, storage, models, periods and costs recorded by the platform.",
    audience: "Users and organization managers",
    updatedAt: "2026-08-04",
    capabilities: ["Server-enforced quotas", "Period usage", "Input and output tokens", "Estimated or unknown cost", "Fallback without double counting", "Plan limits"],
    steps: [
      { title: "Read usage", description: "Review the period, consumption, limit, remaining allowance and last update date." },
      { title: "Understand cost", description: "The platform distinguishes estimated, exact and unknown costs. It does not invent a missing catalog price." },
      { title: "Handle a limit", description: "Reduce context, use an authorized lower-cost model or contact an administrator about the plan." },
    ],
  },
  COMMERCIAL_MATURITY_KANBAN: {
    code: "COMMERCIAL_MATURITY_KANBAN",
    title: "Commercial maturity Kanban guide",
    summary: "Track modules from backend-ready to commercial-ready with criteria, evidence, history and controlled transitions.",
    audience: "Authorized DTSC administrators",
    updatedAt: "2026-08-04",
    capabilities: ["Matrix and Kanban views", "Filters and search", "Criteria and evidence", "Append-only history", "Controlled promotion", "Audited degradation", "COMMERCIAL_READY blocked without owner approval"],
    steps: [
      { title: "Read maturity levels", description: "Technical status never replaces commercial maturity." },
      { title: "Filter", description: "Filter by module type, domain, family, maturity, guide, QA or blocker." },
      { title: "Propose a transition", description: "Choose the new level, provide a reason and attach verifiable evidence." },
      { title: "Move to COMMERCIAL_READY", description: "Provide the Production deployment, commit SHA, E2E result and explicit owner approval.", cautions: ["A card cannot be freely dragged into COMMERCIAL_READY."] },
      { title: "Degrade", description: "When a critical regression occurs, document impact and evidence before lowering maturity." },
    ],
  },
};

export function getIteration05UserGuide(code: Iteration05GuideCode, locale?: string | null) {
  return (locale === "en" ? en : fr)[code];
}

export const ITERATION05_USER_GUIDE_CODES = Object.keys(fr) as Iteration05GuideCode[];
