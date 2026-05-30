export type HostType = "public" | "app" | "console" | "account" | "support" | "local" | "unknown";

const productionDefaults: Record<Exclude<HostType, "local" | "unknown">, string> = {
  public: "https://dtsc-platform.com",
  app: "https://app.dtsc-platform.com",
  console: "https://console.dtsc-platform.com",
  account: "https://account.dtsc-platform.com",
  support: "https://support.dtsc-platform.com",
};

function normalizeBaseUrl(value: string | undefined, fallback: string) {
  const candidate = (value || "").trim() || (process.env.NODE_ENV === "production" ? fallback : "");
  return candidate.replace(/\/+$/, "");
}

function normalizePath(path = "/") {
  if (!path) {
    return "/";
  }
  return path.startsWith("/") ? path : `/${path}`;
}

function hostnameFromUrl(value: string) {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function normalizeHost(host: string | null | undefined) {
  const value = (host || "").trim().toLowerCase();
  if (!value) {
    return "";
  }
  if (value === "::1") {
    return value;
  }
  if (value.startsWith("[")) {
    const closingBracketIndex = value.indexOf("]");
    return closingBracketIndex > 0 ? value.slice(1, closingBracketIndex) : value;
  }
  return value.split(":")[0] || "";
}

export function getPublicBaseUrl() {
  return normalizeBaseUrl(process.env.NEXT_PUBLIC_PUBLIC_URL, productionDefaults.public);
}

export function getAppBaseUrl() {
  return normalizeBaseUrl(process.env.NEXT_PUBLIC_APP_URL, productionDefaults.app);
}

export function getConsoleBaseUrl() {
  return normalizeBaseUrl(process.env.NEXT_PUBLIC_CONSOLE_URL, productionDefaults.console);
}

export function getAccountBaseUrl() {
  return normalizeBaseUrl(process.env.NEXT_PUBLIC_ACCOUNT_URL, productionDefaults.account);
}

export function getSupportBaseUrl() {
  return normalizeBaseUrl(process.env.NEXT_PUBLIC_SUPPORT_URL, productionDefaults.support);
}

export function getAuthCookieDomain() {
  const domain = (process.env.AUTH_COOKIE_DOMAIN || "").trim();
  return domain || undefined;
}

export function getCurrentHostType(host: string | null | undefined): HostType {
  const currentHost = normalizeHost(host);
  if (!currentHost) {
    return "unknown";
  }
  if (currentHost === "localhost" || currentHost === "127.0.0.1" || currentHost === "::1") {
    return "local";
  }

  const publicHost = hostnameFromUrl(getPublicBaseUrl());
  const appHost = hostnameFromUrl(getAppBaseUrl());
  const consoleHost = hostnameFromUrl(getConsoleBaseUrl());
  const accountHost = hostnameFromUrl(getAccountBaseUrl());
  const supportHost = hostnameFromUrl(getSupportBaseUrl());

  if (currentHost === publicHost || currentHost === `www.${publicHost}`) {
    return "public";
  }
  if (currentHost === appHost) {
    return "app";
  }
  if (currentHost === consoleHost) {
    return "console";
  }
  if (currentHost === accountHost) {
    return "account";
  }
  if (currentHost === supportHost) {
    return "support";
  }
  return "unknown";
}

export function buildUrlForHostType(type: HostType, path = "/") {
  const normalizedPath = normalizePath(path);
  const baseUrl =
    type === "public" ? getPublicBaseUrl()
    : type === "app" ? getAppBaseUrl()
    : type === "console" ? getConsoleBaseUrl()
    : type === "account" ? getAccountBaseUrl()
    : type === "support" ? getSupportBaseUrl()
    : "";

  return baseUrl ? `${baseUrl}${normalizedPath}` : normalizedPath;
}

function withNextParam(url: string, next?: string | null) {
  if (!next) {
    return url;
  }
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}next=${encodeURIComponent(next)}`;
}

export function getSignInUrl(next?: string | null) {
  return withNextParam(buildUrlForHostType("account", "/auth/sign-in"), next);
}

export function getDashboardUrl() {
  return buildUrlForHostType("app", "/dashboard");
}

export function getConsoleUrl(path = "/admin") {
  return buildUrlForHostType("console", path);
}

export function getSupportUrl(path = "/support") {
  return buildUrlForHostType("support", path);
}

export function getPublicUrl(path = "/") {
  return buildUrlForHostType("public", path);
}

export function getProductBranding(hostType: HostType) {
  if (hostType === "console") {
    return "Console DTSC";
  }
  if (hostType === "account") {
    return "Compte DTSC";
  }
  if (hostType === "support") {
    return "Support DTSC";
  }
  if (hostType === "app") {
    return "Espace SaaS";
  }
  return "DTSC Platform";
}
