import {
  buildUrlForHostType,
  getConsoleUrl,
  getCurrentHostType,
  getDashboardUrl,
  getPublicUrl,
  getSupportUrl,
} from "@/lib/domains";

export type PostLoginContext = "DTSC_INTERNAL" | "ORGANIZATION" | "GLOBAL_CLIENT" | "COMMUNITY" | null | undefined;

type ResolvePostLoginRedirectInput = {
  next?: string | null;
  context?: PostLoginContext;
  userStartPage?: string | null;
};

const appProductPaths = [
  "/dashboard",
  "/chat",
  "/billing",
  "/company",
  "/documents",
  "/calendar",
  "/enterprise-admin",
  "/enterprise-activities",
  "/collaborators",
  "/activities",
  "/profile",
  "/settings",
  "/notifications",
  "/announcements",
];

const publicProductPaths = [
  "/",
  "/services",
  "/solutions",
  "/secteurs",
  "/projets",
  "/a-propos",
  "/ressources",
  "/contact",
  "/conditions-utilisation",
  "/politique-confidentialite",
  "/politique-cookies",
  "/offline",
];

function matchesPath(pathname: string, prefixes: string[]) {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function withSearchAndHash(url: URL) {
  return `${url.pathname}${url.search}${url.hash}`;
}

function isAuthPath(pathname: string) {
  return pathname === "/auth/sign-in" || pathname === "/auth/sign-up";
}

function resolveInternalPath(pathWithOptionalSearch: string) {
  const parsedPath = new URL(pathWithOptionalSearch, "https://dtsc.local");
  const path = withSearchAndHash(parsedPath);

  if (isAuthPath(parsedPath.pathname)) {
    return null;
  }
  if (parsedPath.pathname === "/admin" || parsedPath.pathname.startsWith("/admin/")) {
    return getConsoleUrl(path);
  }
  if (parsedPath.pathname === "/support" || parsedPath.pathname.startsWith("/support/")) {
    return getSupportUrl(path);
  }
  if (matchesPath(parsedPath.pathname, appProductPaths)) {
    return buildUrlForHostType("app", path);
  }
  if (matchesPath(parsedPath.pathname, publicProductPaths)) {
    return getPublicUrl(path);
  }

  return null;
}

export function resolveTrustedInternalRedirect(target?: string | null) {
  const candidate = (target || "").trim();
  if (!candidate) {
    return null;
  }

  if (candidate.startsWith("//")) {
    return null;
  }

  if (candidate.startsWith("/")) {
    return resolveInternalPath(candidate);
  }

  try {
    const parsed = new URL(candidate);
    const hostType = getCurrentHostType(parsed.host);
    if (hostType === "unknown") {
      return null;
    }
    if (hostType === "local" && process.env.NODE_ENV === "production") {
      return null;
    }
    return resolveInternalPath(withSearchAndHash(parsed));
  } catch {
    return null;
  }
}

export function resolvePostLoginRedirect({ next, context, userStartPage }: ResolvePostLoginRedirectInput) {
  const trustedNext = resolveTrustedInternalRedirect(next);
  if (trustedNext) {
    return trustedNext;
  }

  if (context !== "DTSC_INTERNAL") {
    const trustedStartPage = resolveTrustedInternalRedirect(userStartPage);
    if (trustedStartPage) {
      return trustedStartPage;
    }
  }

  if (context === "DTSC_INTERNAL") {
    return getConsoleUrl("/admin");
  }

  return getDashboardUrl();
}
