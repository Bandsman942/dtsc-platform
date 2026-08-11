import { MCP_SERVER_REGISTRY, isMcpOAuthPlatformConfigured } from "@/lib/ai/mcp/registry";
import { hasRequiredMcpOAuthScopes } from "@/lib/ai/mcp/oauth-scopes";
import { listMcpOAuthConnectionGrants } from "@/lib/ai/mcp/oauth-store";

export type ConnectedAppCode =
  | "GMAIL"
  | "GOOGLE_CALENDAR"
  | "NOTION"
  | "GITHUB"
  | "LINEAR"
  | "ATLASSIAN"
  | "STRIPE";

export type ConnectedAppCatalogEntry = {
  code: ConnectedAppCode;
  name: string;
  category: "COMMUNICATION" | "CALENDAR" | "KNOWLEDGE" | "DEVELOPMENT" | "PROJECTS" | "FINANCE";
  descriptionFr: string;
  descriptionEn: string;
  capabilitiesFr: string[];
  capabilitiesEn: string[];
  maturity: "OFFICIAL" | "OFFICIAL_PREVIEW";
  authExperience: "OAUTH_USER" | "OAUTH_OR_TOKEN";
  serverMatch: RegExp;
};

export const CONNECTED_APP_CATALOG: ConnectedAppCatalogEntry[] = [
  { code: "GMAIL", name: "Gmail", category: "COMMUNICATION", descriptionFr: "Retrouver et exploiter les e-mails autorisés depuis l’assistant DTSC.", descriptionEn: "Find and use authorized email context from the DTSC assistant.", capabilitiesFr: ["Rechercher des e-mails", "Préparer des réponses", "Résumer une conversation"], capabilitiesEn: ["Search email", "Draft replies", "Summarize threads"], maturity: "OFFICIAL_PREVIEW", authExperience: "OAUTH_USER", serverMatch: /(gmail|google.*mail)/i },
  { code: "GOOGLE_CALENDAR", name: "Google Calendar", category: "CALENDAR", descriptionFr: "Consulter le calendrier autorisé et préparer des actions à confirmer.", descriptionEn: "Read the authorized calendar and prepare actions for confirmation.", capabilitiesFr: ["Voir les événements", "Vérifier les disponibilités", "Préparer un rendez-vous"], capabilitiesEn: ["View events", "Check availability", "Prepare a meeting"], maturity: "OFFICIAL_PREVIEW", authExperience: "OAUTH_USER", serverMatch: /(calendar|google.*calendar)/i },
  { code: "NOTION", name: "Notion", category: "KNOWLEDGE", descriptionFr: "Interroger les pages et espaces Notion auxquels le compte connecté a accès.", descriptionEn: "Use pages and workspaces available to the connected Notion account.", capabilitiesFr: ["Rechercher des pages", "Résumer des contenus", "Préparer des mises à jour"], capabilitiesEn: ["Search pages", "Summarize content", "Prepare updates"], maturity: "OFFICIAL", authExperience: "OAUTH_USER", serverMatch: /notion/i },
  { code: "GITHUB", name: "GitHub", category: "DEVELOPMENT", descriptionFr: "Aider sur les dépôts, issues et pull requests dans la limite des droits GitHub du compte.", descriptionEn: "Work with repositories, issues and pull requests within the account’s GitHub permissions.", capabilitiesFr: ["Lire les dépôts", "Analyser issues et PR", "Suivre le travail technique"], capabilitiesEn: ["Read repositories", "Analyze issues and PRs", "Track engineering work"], maturity: "OFFICIAL", authExperience: "OAUTH_OR_TOKEN", serverMatch: /github/i },
  { code: "LINEAR", name: "Linear", category: "PROJECTS", descriptionFr: "Relier les issues, projets et commentaires Linear au contexte de travail DTSC.", descriptionEn: "Bring Linear issues, projects and comments into DTSC work context.", capabilitiesFr: ["Rechercher des issues", "Suivre les projets", "Préparer des mises à jour"], capabilitiesEn: ["Search issues", "Track projects", "Prepare updates"], maturity: "OFFICIAL", authExperience: "OAUTH_OR_TOKEN", serverMatch: /linear/i },
  { code: "ATLASSIAN", name: "Jira & Confluence", category: "PROJECTS", descriptionFr: "Utiliser les contenus Jira et Confluence autorisés via l’infrastructure MCP officielle Atlassian.", descriptionEn: "Use authorized Jira and Confluence content through Atlassian’s official MCP infrastructure.", capabilitiesFr: ["Rechercher Jira", "Lire Confluence", "Préparer du travail à confirmer"], capabilitiesEn: ["Search Jira", "Read Confluence", "Prepare work for confirmation"], maturity: "OFFICIAL", authExperience: "OAUTH_USER", serverMatch: /(atlassian|jira|confluence)/i },
  { code: "STRIPE", name: "Stripe", category: "FINANCE", descriptionFr: "Consulter des informations Stripe autorisées avec des garde-fous renforcés pour les données financières.", descriptionEn: "Use authorized Stripe information with stronger financial-data safeguards.", capabilitiesFr: ["Consulter le compte", "Lire des objets autorisés", "Préparer des actions avec confirmation"], capabilitiesEn: ["Read account context", "Read authorized objects", "Prepare confirmed actions"], maturity: "OFFICIAL_PREVIEW", authExperience: "OAUTH_OR_TOKEN", serverMatch: /stripe/i },
];

export async function listConnectedAppsForUser(input: { locale: string | null | undefined; userId: string; organizationId: string | null }) {
  const en = input.locale === "en";
  const connectionGrants = input.organizationId
    ? await listMcpOAuthConnectionGrants({ userId: input.userId, organizationId: input.organizationId })
    : new Map<string, Set<string>>();

  return CONNECTED_APP_CATALOG.map((app) => {
    const configuredServers = MCP_SERVER_REGISTRY.filter((server) => app.serverMatch.test(`${server.code} ${server.label} ${server.endpoint}`));
    const certifiedServers = configuredServers.filter((server) => server.status === "CERTIFIED");
    const oauthServer = certifiedServers.find((server) => server.authMode === "OAUTH_USER") || null;
    const grantedScopes = oauthServer ? connectionGrants.get(oauthServer.code) || null : null;
    const connectionExists = Boolean(grantedScopes);
    const scopeCoverageCurrent = Boolean(oauthServer && grantedScopes && hasRequiredMcpOAuthScopes(grantedScopes, oauthServer.oauthScopes));
    const connected = connectionExists && scopeCoverageCurrent;
    const reauthorizationRequired = connectionExists && !scopeCoverageCurrent;
    const platformConfigured = Boolean(oauthServer && isMcpOAuthPlatformConfigured(oauthServer));
    const availability = connected
      ? "CONNECTED" as const
      : reauthorizationRequired && platformConfigured
        ? "REAUTHORIZATION_REQUIRED" as const
        : oauthServer && platformConfigured
          ? "READY_TO_CONNECT" as const
          : oauthServer
            ? "PLATFORM_SETUP_REQUIRED" as const
            : certifiedServers.length
              ? "CERTIFIED_BY_DTSC" as const
              : "REQUIRES_DTSC_CERTIFICATION" as const;
    return {
      code: app.code,
      name: app.name,
      category: app.category,
      description: en ? app.descriptionEn : app.descriptionFr,
      capabilities: en ? app.capabilitiesEn : app.capabilitiesFr,
      maturity: app.maturity,
      authExperience: app.authExperience,
      availability,
      serverCode: oauthServer?.code || null,
      scopes: oauthServer?.oauthScopes || [],
    };
  });
}
