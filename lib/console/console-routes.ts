import type { AdminBlockId } from "@/lib/admin-access";

export const CONSOLE_SECTION_IDS = [
  "overview",
  "module-maturity",
  "access",
  "platform-settings",
  "promotions",
  "content",
  "users",
  "organizations",
  "subscriptions",
  "support",
  "visits",
  "security-audit",
  "hr-cfo",
  "sco",
  "coo",
  "ceo",
  "mpo",
  "cto",
  "legal",
] as const;

export type ConsoleSectionId = (typeof CONSOLE_SECTION_IDS)[number];

export const CONSOLE_SECTION_GROUPS = [
  { id: "governance", labelFr: "Pilotage et gouvernance", labelEn: "Steering and governance", descriptionFr: "Vue consolidée, maturité, acquisition et contrôle.", descriptionEn: "Consolidated view, maturity, acquisition and control." },
  { id: "customers", labelFr: "Clients, revenus et service", labelEn: "Customers, revenue and service", descriptionFr: "Entreprises clientes, abonnements et support.", descriptionEn: "Client organizations, subscriptions and support." },
  { id: "identity", labelFr: "Identités et accès", labelEn: "Identity and access", descriptionFr: "Comptes, capacités, permissions et sécurité.", descriptionEn: "Accounts, capabilities, permissions and security." },
  { id: "engagement", labelFr: "Contenus et engagement", labelEn: "Content and engagement", descriptionFr: "Publications, promotions et communication publique.", descriptionEn: "Publications, promotions and public communication." },
  { id: "platform", labelFr: "Plateforme et technologie", labelEn: "Platform and technology", descriptionFr: "Configuration, feature flags et pilotage technique.", descriptionEn: "Configuration, feature flags and technical steering." },
  { id: "internal", labelFr: "Opérations internes DTSC", labelEn: "DTSC internal operations", descriptionFr: "Responsabilités métier rattachées aux postes officiels.", descriptionEn: "Business responsibilities attached to official positions." },
] as const;

export type ConsoleSectionGroupId = (typeof CONSOLE_SECTION_GROUPS)[number]["id"];

export const CONSOLE_SECTION_GROUP: Record<ConsoleSectionId, ConsoleSectionGroupId> = {
  overview: "governance",
  "module-maturity": "governance",
  visits: "governance",
  "security-audit": "governance",
  organizations: "customers",
  subscriptions: "customers",
  support: "customers",
  users: "identity",
  access: "identity",
  content: "engagement",
  promotions: "engagement",
  "platform-settings": "platform",
  cto: "platform",
  "hr-cfo": "internal",
  sco: "internal",
  coo: "internal",
  ceo: "internal",
  mpo: "internal",
  legal: "internal",
};

const CANONICAL_SECTION_SET = new Set<string>(CONSOLE_SECTION_IDS);

export const CONSOLE_SECTION_ALIASES: Record<string, ConsoleSectionId> = {
  "": "overview",
  admin: "overview",
  overview: "overview",
  erpreadiness: "module-maturity",
  "erp-readiness": "module-maturity",
  modulematurity: "module-maturity",
  "module-maturity": "module-maturity",
  access: "access",
  settings: "platform-settings",
  platformsettings: "platform-settings",
  "platform-settings": "platform-settings",
  promotions: "promotions",
  publications: "content",
  content: "content",
  users: "users",
  clientorganizations: "organizations",
  organizations: "organizations",
  billing: "subscriptions",
  subscriptions: "subscriptions",
  activity: "support",
  support: "support",
  visits: "visits",
  audits: "security-audit",
  security: "security-audit",
  securityaudit: "security-audit",
  "security-audit": "security-audit",
  hrcfo: "hr-cfo",
  "hr-cfo": "hr-cfo",
  sco: "sco",
  coo: "coo",
  ceo: "ceo",
  mpo: "mpo",
  cto: "cto",
  la: "legal",
  legal: "legal",
};

export const CONSOLE_SECTION_ADMIN_BLOCK: Record<ConsoleSectionId, AdminBlockId | null> = {
  overview: "overview",
  "module-maturity": "overview",
  access: null,
  "platform-settings": "settings",
  promotions: "promotions",
  content: "publications",
  users: "users",
  organizations: "clientOrganizations",
  subscriptions: "billing",
  support: "activity",
  visits: "visits",
  "security-audit": "audits",
  "hr-cfo": "hrCfo",
  sco: "sco",
  coo: "coo",
  ceo: "ceo",
  mpo: "mpo",
  cto: "cto",
  legal: "la",
};

export const CONSOLE_SECTION_MODULE_CODE: Record<ConsoleSectionId, string> = {
  overview: "CONSOLE_OVERVIEW",
  "module-maturity": "CONSOLE_MODULE_MATURITY",
  access: "CONSOLE_RBAC",
  "platform-settings": "CONSOLE_PLATFORM_SETTINGS",
  promotions: "CONSOLE_CONTENT",
  content: "CONSOLE_CONTENT",
  users: "CONSOLE_USERS",
  organizations: "CONSOLE_CLIENT_ENTERPRISES",
  subscriptions: "CONSOLE_SUBSCRIPTIONS",
  support: "CONSOLE_SUPPORT",
  visits: "CONSOLE_VISITS",
  "security-audit": "CONSOLE_SECURITY_AUDIT",
  "hr-cfo": "DTSC_HR_CFO",
  sco: "DTSC_SCO",
  coo: "DTSC_COO",
  ceo: "DTSC_CEO",
  mpo: "DTSC_MPO",
  cto: "DTSC_CTO",
  legal: "DTSC_LEGAL",
};

function normalizeSectionKey(value: string | null | undefined) {
  return String(value || "")
    .trim()
    .replace(/^\/+|\/+$/g, "")
    .replace(/^admin\//i, "")
    .replace(/[\s_]+/g, "-")
    .toLowerCase();
}

export function isConsoleSectionId(value: string | null | undefined): value is ConsoleSectionId {
  return CANONICAL_SECTION_SET.has(normalizeSectionKey(value));
}

export function resolveConsoleSection(value: string | null | undefined): {
  section: ConsoleSectionId;
  input: string;
  aliasUsed: boolean;
  known: boolean;
} {
  const normalized = normalizeSectionKey(value);
  const direct = CANONICAL_SECTION_SET.has(normalized) ? (normalized as ConsoleSectionId) : null;
  if (direct) {
    return { section: direct, input: normalized, aliasUsed: false, known: true };
  }

  const compact = normalized.replace(/-/g, "");
  const alias = CONSOLE_SECTION_ALIASES[normalized] || CONSOLE_SECTION_ALIASES[compact];
  if (alias) {
    return { section: alias, input: normalized, aliasUsed: normalized !== alias, known: true };
  }

  return { section: "overview", input: normalized, aliasUsed: false, known: false };
}

export function getConsoleSectionPath(section: ConsoleSectionId) {
  return section === "overview" ? "/admin" : `/admin/${section}`;
}

export function getConsoleSectionHref(section: ConsoleSectionId, params?: URLSearchParams | Record<string, string | number | null | undefined>) {
  const search = params instanceof URLSearchParams ? new URLSearchParams(params) : new URLSearchParams();
  if (params && !(params instanceof URLSearchParams)) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && String(value).length > 0) {
        search.set(key, String(value));
      }
    }
  }
  search.delete("section");
  const query = search.toString();
  return `${getConsoleSectionPath(section)}${query ? `?${query}` : ""}`;
}

export function getConsoleLegacyAliases(section: ConsoleSectionId) {
  return Object.entries(CONSOLE_SECTION_ALIASES)
    .filter(([alias, target]) => target === section && alias && alias !== section)
    .map(([alias]) => alias);
}
