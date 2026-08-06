import {
  buildUrlForHostType,
  getAccountBaseUrl,
  getAppBaseUrl,
  getConsoleBaseUrl,
  getPublicBaseUrl,
  getSupportBaseUrl,
  type HostType,
} from "@/lib/domains";

export type DtscProductCode = "PUBLIC" | "ACCOUNT" | "APP" | "CONSOLE" | "SUPPORT";
export type DtscProductStatus = "ACTIVE" | "LIMITED" | "PLANNED" | "HIDDEN";

export type DtscProductDefinition = {
  code: DtscProductCode;
  hostType: Exclude<HostType, "local" | "unknown">;
  label: { fr: string; en: string };
  description: { fr: string; en: string };
  route: string;
  icon: "globe" | "shield" | "workspace" | "console" | "support";
  accent: string;
  requiresAuthentication: boolean;
  requiresDtscInternal: boolean;
  visible: boolean;
  status: DtscProductStatus;
  pwa: "enabled" | "limited" | "disabled";
};

export const DTSC_PRODUCT_REGISTRY: readonly DtscProductDefinition[] = [
  {
    code: "PUBLIC",
    hostType: "public",
    label: { fr: "Site public", en: "Public website" },
    description: { fr: "Découverte, confiance et conversion", en: "Discovery, trust and conversion" },
    route: "/",
    icon: "globe",
    accent: "#0057b8",
    requiresAuthentication: false,
    requiresDtscInternal: false,
    visible: true,
    status: "ACTIVE",
    pwa: "enabled",
  },
  {
    code: "ACCOUNT",
    hostType: "account",
    label: { fr: "Compte", en: "Account" },
    description: { fr: "Identité, sécurité et accès", en: "Identity, security and access" },
    route: "/auth/sign-in",
    icon: "shield",
    accent: "#00a8e8",
    requiresAuthentication: false,
    requiresDtscInternal: false,
    visible: true,
    status: "ACTIVE",
    pwa: "disabled",
  },
  {
    code: "APP",
    hostType: "app",
    label: { fr: "Espace SaaS", en: "SaaS workspace" },
    description: { fr: "Productivité et travail", en: "Productivity and work" },
    route: "/dashboard",
    icon: "workspace",
    accent: "#0057b8",
    requiresAuthentication: true,
    requiresDtscInternal: false,
    visible: true,
    status: "ACTIVE",
    pwa: "enabled",
  },
  {
    code: "CONSOLE",
    hostType: "console",
    label: { fr: "Console DTSC", en: "DTSC Console" },
    description: { fr: "Gouvernance et pilotage", en: "Governance and oversight" },
    route: "/admin",
    icon: "console",
    accent: "#4154c8",
    requiresAuthentication: true,
    requiresDtscInternal: true,
    visible: true,
    status: "ACTIVE",
    pwa: "disabled",
  },
  {
    code: "SUPPORT",
    hostType: "support",
    label: { fr: "Support", en: "Support" },
    description: { fr: "Assistance et résolution", en: "Assistance and resolution" },
    route: "/support",
    icon: "support",
    accent: "#16875a",
    requiresAuthentication: false,
    requiresDtscInternal: false,
    visible: true,
    status: "ACTIVE",
    pwa: "limited",
  },
] as const;

export const PLANNED_DTSC_PRODUCTS = ["DOCS", "STATUS", "ACADEMY", "PARTNERS", "COMMUNITY", "DEVELOPERS"] as const;

export function normalizeProductHostType(hostType: HostType): DtscProductDefinition["hostType"] {
  if (hostType === "account" || hostType === "app" || hostType === "console" || hostType === "support") {
    return hostType;
  }
  return "public";
}

export function getProductDefinition(hostType: HostType) {
  const normalized = normalizeProductHostType(hostType);
  return DTSC_PRODUCT_REGISTRY.find((product) => product.hostType === normalized) || DTSC_PRODUCT_REGISTRY[0];
}

export function getProductHref(product: DtscProductDefinition) {
  return buildUrlForHostType(product.hostType, product.route);
}

export function getProductBaseUrl(hostType: HostType) {
  const normalized = normalizeProductHostType(hostType);
  const value =
    normalized === "app" ? getAppBaseUrl()
    : normalized === "console" ? getConsoleBaseUrl()
    : normalized === "account" ? getAccountBaseUrl()
    : normalized === "support" ? getSupportBaseUrl()
    : getPublicBaseUrl();
  return value || "https://dtsc-platform.com";
}

export function getVisibleProductDefinitions(options: {
  authenticated?: boolean;
  isDtscInternal?: boolean;
}) {
  const { authenticated = true, isDtscInternal = false } = options;
  return DTSC_PRODUCT_REGISTRY.filter((product) => {
    if (!product.visible || product.status === "HIDDEN" || product.status === "PLANNED") return false;
    if (product.requiresDtscInternal && !isDtscInternal) return false;
    if (product.requiresAuthentication && !authenticated && product.code !== "APP") return false;
    return true;
  });
}
