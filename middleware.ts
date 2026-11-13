import { NextResponse, type NextRequest } from "next/server";
import { buildUrlForHostType, getAuthCookieDomain, getCurrentHostType, getDashboardUrl, getSignInUrl, type HostType } from "@/lib/domains";
import { isSameOriginRequest } from "@/lib/request-security";
import { SESSION_HEARTBEAT_THROTTLE_MS } from "@/lib/session-config";
import { shouldUseSecureSessionCookie } from "@/lib/session-cookie-security";
import { sessionCookieMaxAgeSeconds } from "@/lib/session-policy";
import { createSessionToken, SESSION_COOKIE, verifySessionToken } from "@/lib/session";

const privateRoutes = ["/dashboard", "/chat", "/billing", "/company", "/calendar", "/documents", "/activities", "/enterprise-admin", "/enterprise-insurance", "/enterprise-activities", "/enterprise-invitations", "/enterprise-modules", "/collaborators", "/profile", "/settings", "/support", "/notifications", "/announcements"];
const adminRoutes = ["/admin"];
const dtscInternalRoutes = ["/admin", "/activities"];
const dtscInternalApiRoutes = ["/api/admin", "/api/activities"];
const scale7OidcDelegatedAdminApiRoute = "/api/admin/scalability/observability";
const externalWebhookRoutes = ["/api/billing/maishapay/callback", "/api/webhooks/zoho/outgoing-mail"];
const safeMethods = ["GET", "HEAD", "OPTIONS"];
const DTSC_INTERNAL_ORGANIZATION_ID = "dtsc-internal";
const authRoutes = ["/auth/sign-in", "/auth/sign-up"];
const appOnlyRedirectRoutes = ["/dashboard", "/chat", "/billing", "/company", "/calendar", "/documents", "/enterprise-admin", "/enterprise-insurance", "/enterprise-activities", "/enterprise-invitations", "/enterprise-modules", "/collaborators", "/profile", "/settings", "/notifications", "/announcements"];
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

  // Docs is public and isolated: it never inherits the app/console routing surface.
  if (hostType === "docs") {
    if (pathname === "/") {
      const target = new URL("/documentation", request.url);
      target.search = request.nextUrl.search;
      return NextResponse.rewrite(target);
    }
    if (pathname === "/documentation") {
      return null;
    }
    return redirectToHost(request, "docs", "/");
  }

  if (hostType === "public") {
    if (isPathMatch(pathname, authRoutes)) {
      return redirectToHost(request, "account", requestPathWithSearch(request));
    }
    if (isPathMatch(pathname, [...privateRoutes, ...adminRoutes])) {
      return redirectToHost(request, routeHostForPrivatePath(pathname), requestPathWithSearch(request));
    }
    return null;
  }

  if (hostType === "app") {
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
    if (pathname === "/") {
      return redirectToHost(request, "account", "/auth/sign-in");
    }
    if (isPathMatch(pathname, authRoutes)) {
      // Do not infer current authentication from an Edge-verified cookie.
      // Account pages revalidate revocation, membership and MFA via getSession()
      // before optionally forwarding an already authenticated visitor.
      return null;
    }
    return redirectToHost(request, routeHostForPrivatePath(pathname), requestPathWithSearch(request));
  }

  if (hostType === "support") {
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
  if (isMutatingApiRequest && !isPathMatch(pathname, externalWebhookRoutes) && !isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Cross-origin request blocked" }, { status: 403 });
  }

  const hostType = getCurrentHostType(request.headers.get("host"));
  // Docs is a public read-only surface: do not verify or renew sessions for its static assets.
  if (hostType === "docs" && isStaticAsset(pathname)) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const secret = process.env.AUTH_SECRET;
  const session = secret ? await verifySessionToken(token, secret) : null;

  if (pathname.startsWith("/api/")) {
    // No internal or partner API is exposed through the documentation hostname.
    if (hostType === "docs") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const delegatesScale7OidcToHandler = pathname === scale7OidcDelegatedAdminApiRoute
      && request.headers.get("authorization")?.startsWith("Bearer ");
    if (isPathMatch(pathname, dtscInternalApiRoutes) && !delegatesScale7OidcToHandler) {
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

  const response = NextResponse.next();
  const nowSeconds = Math.floor(Date.now() / 1000);
  const canRenewSignedPolicy = Boolean(
    session?.authTime &&
    session.absoluteExp &&
    session.idleTimeoutMinutes &&
    (!session.issuedAt || (nowSeconds - session.issuedAt) * 1000 >= SESSION_HEARTBEAT_THROTTLE_MS)
  );

  if (session && canRenewSignedPolicy && isPathMatch(pathname, [...privateRoutes, ...adminRoutes]) && secret) {
    const created = await createSessionToken(
      {
        userId: session.userId,
        sessionId: session.sessionId,
        mfaVerifiedAt: session.mfaVerifiedAt,
        email: session.email,
        name: session.name,
        role: session.role,
        activeContext: session.activeContext,
        activeOrganizationId: session.activeOrganizationId || null,
        activeOrganizationName: session.activeOrganizationName || null,
        activeOrganizationRole: session.activeOrganizationRole || null,
      },
      secret,
      {
        idleTimeoutMinutes: session.idleTimeoutMinutes,
        previous: { authTime: session.authTime, absoluteExp: session.absoluteExp },
        nowSeconds,
      }
    );

    if (created) {
      const cookieDomain = getAuthCookieDomain();
      response.cookies.set(SESSION_COOKIE, created.token, {
        httpOnly: true,
        sameSite: "lax",
        secure: shouldUseSecureSessionCookie(),
        path: "/",
        maxAge: sessionCookieMaxAgeSeconds(created.session.exp, nowSeconds),
        ...(cookieDomain ? { domain: cookieDomain } : {}),
      });
    }
  }

  return response;
}

// Keep these patterns static: Next.js compiles each separate matcher to Vercel
// routing entries. A single named-group matcher replaces the individual
// prefix entries without changing the original protected route coverage.
export const config = {
  matcher: [
    { source: "/:path*", has: [{ type: "host", value: "docs.dtsc-platform.com" }] },
    "/",
    "/:surface(dashboard|chat|billing|company|calendar|documents|activities|enterprise-admin|enterprise-insurance|enterprise-activities|enterprise-invitations|enterprise-modules|collaborators|profile|settings|support|notifications|announcements|admin|api)/:path*",
    "/auth/:action(sign-in|sign-up)",
  ],
};
