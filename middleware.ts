import { NextResponse, type NextRequest } from "next/server";
import { buildUrlForHostType, getAuthCookieDomain, getCurrentHostType, getDashboardUrl, getSignInUrl, type HostType } from "@/lib/domains";
import { resolvePostLoginRedirect } from "@/lib/post-login-redirect";
import { SESSION_MAX_AGE_SECONDS } from "@/lib/session-config";
import { createSessionToken, SESSION_COOKIE, verifySessionToken } from "@/lib/session";

const privateRoutes = ["/dashboard", "/chat", "/billing", "/company", "/calendar", "/documents", "/activities", "/enterprise-admin", "/enterprise-activities", "/enterprise-modules", "/collaborators", "/profile", "/settings", "/support", "/notifications", "/announcements"];
const adminRoutes = ["/admin"];
const dtscInternalRoutes = ["/admin", "/activities"];
const dtscInternalApiRoutes = ["/api/admin", "/api/activities"];
const externalWebhookRoutes = ["/api/billing/maishapay/callback", "/api/webhooks/zoho/outgoing-mail"];
const safeMethods = ["GET", "HEAD", "OPTIONS"];
const DTSC_INTERNAL_ORGANIZATION_ID = "dtsc-internal";
const authRoutes = ["/auth/sign-in", "/auth/sign-up"];
const appOnlyRedirectRoutes = ["/dashboard", "/chat", "/billing", "/company", "/calendar", "/documents", "/enterprise-admin", "/enterprise-activities", "/enterprise-modules", "/collaborators", "/profile", "/settings", "/notifications", "/announcements"];
const staticAssetPrefixes = ["/_next/", "/icons/"];
const staticAssetPaths = ["/favicon.ico", "/manifest.webmanifest", "/offline", "/offline.html", "/sw.js", "/robots.txt", "/sitemap.xml"];

function isPathMatch(pathname: string, routes: string[]) {
  return routes.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

function isStaticAsset(pathname: string) {
  return staticAssetPaths.includes(pathname) ||
    staticAssetPrefixes.some((prefix) => pathname.startsWith(prefix)) ||
    (/\/[^/]+\.[a-zA-Z0-9]{2,8}$/.test(pathname) && !pathname.startsWith("/api/"));
}

function isAllowedOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) {
    return true;
  }

  return origin === request.nextUrl.origin;
}

function hasDtscInternalContext(session: Awaited<ReturnType<typeof verifySessionToken>>) {
  return session?.activeContext === "DTSC_INTERNAL" && session.activeOrganizationId === DTSC_INTERNAL_ORGANIZATION_ID;
}

function requestPathWithSearch(request: NextRequest) {
  return `${request.nextUrl.pathname}${request.nextUrl.search}`;
}

function absoluteCurrentUrl(request: NextRequest) {
  return request.nextUrl.toString();
}

function redirectToHost(request: NextRequest, hostType: HostType, path = "/") {
  return NextResponse.redirect(new URL(buildUrlForHostType(hostType, path), request.url));
}

function redirectToSignIn(request: NextRequest, nextTarget = requestPathWithSearch(request)) {
  return NextResponse.redirect(new URL(getSignInUrl(nextTarget), request.url));
}

function routeHostForPrivatePath(pathname: string): HostType {
  if (isPathMatch(pathname, adminRoutes)) {
    return "console";
  }
  if (pathname === "/support" || pathname.startsWith("/support/")) {
    return "support";
  }
  return "app";
}

function applyHostRouting(request: NextRequest, session: Awaited<ReturnType<typeof verifySessionToken>>, hostType: HostType) {
  const { pathname } = request.nextUrl;
  if (hostType === "local" || hostType === "unknown") {
    return null;
  }

  if (hostType === "public") {
    // Public keeps marketing pages only; product routes move to their owning host.
    if (isPathMatch(pathname, authRoutes)) {
      return redirectToHost(request, "account", requestPathWithSearch(request));
    }
    if (isPathMatch(pathname, [...privateRoutes, ...adminRoutes])) {
      return redirectToHost(request, routeHostForPrivatePath(pathname), requestPathWithSearch(request));
    }
    return null;
  }

  if (hostType === "app") {
    // The SaaS host must not expose the DTSC console or support paths directly.
    if (pathname === "/") {
      return session ? redirectToHost(request, "app", "/dashboard") : redirectToSignIn(request, "/dashboard");
    }
    if (isPathMatch(pathname, authRoutes)) {
      return redirectToHost(request, "account", requestPathWithSearch(request));
    }
    if (isPathMatch(pathname, adminRoutes)) {
      return redirectToHost(request, "console", requestPathWithSearch(request));
    }
    if (pathname === "/support" || pathname.startsWith("/support/")) {
      return redirectToHost(request, "support", requestPathWithSearch(request));
    }
    return null;
  }

  if (hostType === "console") {
    // Console protects /admin, while SaaS and support paths remain navigable via SSO.
    if (pathname === "/") {
      return redirectToHost(request, "console", "/admin");
    }
    if (isPathMatch(pathname, authRoutes)) {
      return redirectToHost(request, "account", requestPathWithSearch(request));
    }
    if (pathname === "/support" || pathname.startsWith("/support/")) {
      return redirectToHost(request, "support", requestPathWithSearch(request));
    }
    if (isPathMatch(pathname, appOnlyRedirectRoutes) || pathname === "/activities" || pathname.startsWith("/activities/")) {
      return redirectToHost(request, "app", requestPathWithSearch(request));
    }
    if (!isPathMatch(pathname, adminRoutes)) {
      return redirectToHost(request, "console", "/admin");
    }
    if (!session) {
      return redirectToSignIn(request, absoluteCurrentUrl(request));
    }
    if (!hasDtscInternalContext(session)) {
      return redirectToHost(request, "app", "/dashboard");
    }
    return null;
  }

  if (hostType === "account") {
    // Account owns authentication; signed-in users leave it through a trusted next target.
    if (pathname === "/") {
      return redirectToHost(request, "account", "/auth/sign-in");
    }
    if (isPathMatch(pathname, authRoutes)) {
      if (session) {
        return NextResponse.redirect(new URL(resolvePostLoginRedirect({
          next: request.nextUrl.searchParams.get("next"),
          context: session.activeContext,
        }), request.url));
      }
      return null;
    }
    return redirectToHost(request, routeHostForPrivatePath(pathname), requestPathWithSearch(request));
  }

  if (hostType === "support") {
    // Support protects tickets and delegates app/console routes to the right host.
    if (pathname === "/") {
      return redirectToHost(request, "support", "/support");
    }
    if (isPathMatch(pathname, authRoutes)) {
      return redirectToHost(request, "account", requestPathWithSearch(request));
    }
    if (pathname === "/support" || pathname.startsWith("/support/")) {
      return session ? null : redirectToSignIn(request, absoluteCurrentUrl(request));
    }
    if (isPathMatch(pathname, adminRoutes)) {
      return redirectToHost(request, "console", requestPathWithSearch(request));
    }
    if (isPathMatch(pathname, appOnlyRedirectRoutes) || pathname === "/activities") {
      return redirectToHost(request, "app", requestPathWithSearch(request));
    }
  }

  return null;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (request.headers.has("x-middleware-subrequest")) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const isMutatingApiRequest = pathname.startsWith("/api/") && !safeMethods.includes(request.method);
  if (isMutatingApiRequest && !isPathMatch(pathname, externalWebhookRoutes) && !isAllowedOrigin(request)) {
    return NextResponse.json({ error: "Cross-origin request blocked" }, { status: 403 });
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const secret = process.env.AUTH_SECRET;
  const session = secret ? await verifySessionToken(token, secret) : null;
  const hostType = getCurrentHostType(request.headers.get("host"));

  // API routes are never host-rewritten; only auth/RBAC guards run here.
  if (pathname.startsWith("/api/")) {
    if (isPathMatch(pathname, dtscInternalApiRoutes)) {
      if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      if (!hasDtscInternalContext(session)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }
    return NextResponse.next();
  }

  if (isStaticAsset(pathname)) {
    return NextResponse.next();
  }

  const hostRoutingResponse = applyHostRouting(request, session, hostType);
  if (hostRoutingResponse) {
    return hostRoutingResponse;
  }

  if (isPathMatch(pathname, [...privateRoutes, ...adminRoutes]) && !session) {
    return redirectToSignIn(request);
  }

  if (isPathMatch(pathname, dtscInternalRoutes) && !hasDtscInternalContext(session)) {
    return NextResponse.redirect(new URL(getDashboardUrl(), request.url));
  }

  if ((pathname === "/auth/sign-in" || pathname === "/auth/sign-up") && session) {
    return NextResponse.redirect(new URL(resolvePostLoginRedirect({
      next: request.nextUrl.searchParams.get("next"),
      context: session.activeContext,
    }), request.url));
  }

  const response = NextResponse.next();
  if (session && isPathMatch(pathname, [...privateRoutes, ...adminRoutes]) && secret) {
    // Refresh the shared SSO cookie without changing its context payload.
    const tokenValue = await createSessionToken(
      {
        userId: session.userId,
        email: session.email,
        name: session.name,
        role: session.role,
        activeContext: session.activeContext,
        activeOrganizationId: session.activeOrganizationId || null,
        activeOrganizationName: session.activeOrganizationName || null,
        activeOrganizationRole: session.activeOrganizationRole || null,
      },
      secret
    );
    const cookieDomain = getAuthCookieDomain();
    response.cookies.set(SESSION_COOKIE, tokenValue, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: SESSION_MAX_AGE_SECONDS,
      ...(cookieDomain ? { domain: cookieDomain } : {}),
    });
  }

  return response;
}

export const config = {
  matcher: [
    "/",
    "/dashboard/:path*",
    "/chat/:path*",
    "/billing/:path*",
    "/company/:path*",
    "/calendar/:path*",
    "/documents/:path*",
    "/activities/:path*",
    "/enterprise-admin/:path*",
    "/enterprise-activities/:path*",
    "/enterprise-modules/:path*",
    "/collaborators/:path*",
    "/profile/:path*",
    "/settings/:path*",
    "/support/:path*",
    "/notifications/:path*",
    "/announcements/:path*",
    "/admin/:path*",
    "/api/:path*",
    "/auth/sign-in",
    "/auth/sign-up",
  ],
};
