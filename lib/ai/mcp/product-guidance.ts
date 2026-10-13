import type { listConnectedAppsForUser } from "@/lib/ai/mcp/app-catalog";

/**
 * Product guidance, not an entitlement or an MCP execution permission.
 * The actual applications page rechecks session and OAuth state on navigation.
 */
export const CONNECTED_APPS_PRODUCT_PATH = "/ai/apps";

type AppAvailability = Awaited<ReturnType<typeof listConnectedAppsForUser>>[number]["availability"];

const AVAILABILITY_MEANINGS: Record<AppAvailability, { fr: string; en: string }> = {
  ORGANIZATION_REQUIRED: {
    fr: "Ce serveur exige une organisation active ; aucune connexion personnelle n'est proposée.",
    en: "This server requires an active organization; no personal connection is offered.",
  },
  CONNECTED: {
    fr: "Autorisation OAuth enregistrée avec les permissions demandées ; cela ne prouve pas qu'un outil MCP soit utilisable.",
    en: "OAuth authorization recorded with the required scopes; this does not prove any MCP tool is usable.",
  },
  REAUTHORIZATION_REQUIRED: {
    fr: "Autorisation à renouveler avant toute utilisation.",
    en: "Authorization must be renewed before use.",
  },
  READY_TO_CONNECT: {
    fr: "Connexion OAuth proposée par DTSC ; le compte n'est pas encore autorisé.",
    en: "DTSC offers an OAuth connection; this account has not authorized it yet.",
  },
  PLATFORM_SETUP_REQUIRED: {
    fr: "Configuration de connexion à finaliser par DTSC.",
    en: "DTSC must finish configuring the connection.",
  },
  CERTIFIED_BY_DTSC: {
    fr: "Serveur certifié ; aucun parcours OAuth personnel disponible dans la configuration actuelle.",
    en: "Certified server; no personal OAuth flow is available in the current configuration.",
  },
  REQUIRES_DTSC_CERTIFICATION: {
    fr: "Application présentée au catalogue, mais serveur MCP non certifié dans la configuration actuelle.",
    en: "Application listed in the catalog, but no MCP server is certified in the current configuration.",
  },
};

export type ConnectedAppNextAction = "SELECT_ORGANIZATION" | "VERIFY_REMOTE_READ" | "REAUTHORIZE" | "AUTHORIZE" | "CONTACT_DTSC" | "NOT_AVAILABLE";

const AVAILABILITY_NEXT_ACTION: Record<AppAvailability, ConnectedAppNextAction> = {
  ORGANIZATION_REQUIRED: "SELECT_ORGANIZATION",
  CONNECTED: "VERIFY_REMOTE_READ",
  REAUTHORIZATION_REQUIRED: "REAUTHORIZE",
  READY_TO_CONNECT: "AUTHORIZE",
  PLATFORM_SETUP_REQUIRED: "CONTACT_DTSC",
  CERTIFIED_BY_DTSC: "CONTACT_DTSC",
  REQUIRES_DTSC_CERTIFICATION: "NOT_AVAILABLE",
};

/**
 * Product-only guidance. Every actual click and READ call remains governed by
 * the authenticated application, Tool Gateway and current entitlement.
 */
export function getConnectedAppGuidance(availability: AppAvailability, locale: string) {
  return {
    nextAction: AVAILABILITY_NEXT_ACTION[availability],
    explanation: AVAILABILITY_MEANINGS[availability][locale === "en" ? "en" : "fr"],
  };
}

export function buildConnectedAppsProductInstruction(locale: string) {
  if (locale === "en") {
    return [
      "VERIFIED DTSC CONNECTED APPLICATIONS HELP:",
      "MCP means Model Context Protocol. Never expand it as Managed Cloud Provider.",
      `The verified user-facing destination is [Connected applications](${CONNECTED_APPS_PRODUCT_PATH}); never invent another route such as /#/applications.`,
      "This page lists a catalog of candidate integrations, not a promise that a specific provider, OAuth flow, remote service or tool is operational.",
      "Distinguish catalog listing, DTSC certification, provider setup, OAuth authorization, required scopes, approved tool binding and successful tool execution.",
      "A connected OAuth account does not prove that a certified READ tool is enabled or reachable. Never present tool use or resource access as already performed without an authorized tool result.",
      "Personal OAuth works for certified GLOBAL-scope servers; TENANT-only servers require an active organization. Never use a personal grant for an enterprise tool.",
      "Describe plan, pricing and effective permissions only from authorized current subscription/context data. Never assume the user's plan from the conversation or catalog.",
      "If real connection state is unavailable, explicitly ask the user to consult Connected applications rather than invent a status.",
    ].join("\n");
  }
  return [
    "AIDE VÉRIFIÉE DTSC — APPLICATIONS CONNECTÉES :",
    "MCP signifie Model Context Protocol (protocole de contexte de modèle), jamais Managed Cloud Provider.",
    `La destination réelle est [Applications connectées](${CONNECTED_APPS_PRODUCT_PATH}) ; n'invente aucun autre chemin tel que /#/applications.`,
    "La page présente un catalogue d'intégrations potentielles, pas une preuve qu'un fournisseur, OAuth, un serveur distant ou un outil est opérationnel.",
    "Distingue la présence au catalogue, la certification DTSC, la configuration fournisseur, l'autorisation OAuth, les permissions accordées, le binding d'outil approuvé et l'exécution réelle.",
    "Une autorisation OAuth connectée ne prouve pas qu'un outil MCP READ soit activé ou joignable. Ne prétends jamais avoir lu une ressource sans résultat d'outil autorisé.",
    "OAuth personnel fonctionne pour les serveurs certifiés GLOBAL ; les serveurs TENANT exigent une organisation active. Une connexion personnelle ne doit jamais autoriser les outils entreprise.",
    "N'annonce le plan, les prix et les droits effectifs qu'à partir du contexte commercial actuellement vérifié et autorisé ; ne déduis jamais le plan du dialogue ou du catalogue.",
    "Si l'état réel d'une connexion n'est pas disponible, invite explicitement à consulter Applications connectées plutôt que d'inventer un statut.",
  ].join("\n");
}

/**
 * Only metadata that the current user can already see in /ai/apps.
 * No token, resource content, provider payload or cross-tenant connection is read.
 * A telemetry/DB outage must never make the chatbot claim an integration is ready.
 */
export async function buildConnectedAppsAvailabilityContext(input: {
  userId: string;
  organizationId: string | null;
  locale: string;
}): Promise<string> {
  const en = input.locale === "en";
  try {
    const { listConnectedAppsForUser: loadApps } = await import("@/lib/ai/mcp/app-catalog");
    const apps = await loadApps(input);
    const lines = apps.map((app) => {
      const meaning = AVAILABILITY_MEANINGS[app.availability][en ? "en" : "fr"];
      return `- ${app.name}: ${meaning}`;
    });
    const scope = input.organizationId
      ? (en ? "Current user and active organization only." : "Utilisateur courant et organisation active uniquement.")
      : (en
        ? "No active organization. Only GLOBAL-scope servers can connect personally; inspect each application status."
        : "Aucune organisation active. Seuls les connecteurs GLOBAL peuvent être connectés personnellement ; vérifie chaque statut.");
    return [
      en ? "CONNECTED APPLICATIONS — CURRENT USER METADATA (not a tool execution result):" : "APPLICATIONS CONNECTÉES — MÉTADONNÉES DE L'UTILISATEUR (pas un résultat d'outil) :",
      scope,
      ...lines,
    ].join("\n");
  } catch {
    return en
      ? "Connected-application status could not be checked. Do not invent a connected or operational state. Refer to Connected applications."
      : "L'état des applications connectées n'a pas pu être vérifié. N'invente pas de connexion ou d'état opérationnel. Oriente vers Applications connectées.";
  }
}
