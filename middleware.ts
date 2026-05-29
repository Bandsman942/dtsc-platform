import { NextResponse, type NextRequest } from "next/server";
import { SESSION_MAX_AGE_SECONDS } from "@/lib/session-config";
import { createSessionToken, SESSION_COOKIE, verifySessionToken } from "@/lib/session";

const privateRoutes = ["/dashboard", "/chat", "/billing", "/company", "/calendar", "/documents", "/activities", "/enterprise-admin", "/enterprise-activities", "/collaborators", "/profile", "/settings", "/support", "/notifications", "/announcements"];
const adminRoutes = ["/admin"];
const dtscInternalRoutes = ["/admin", "/calendar", "/activities"];
const dtscInternalApiRoutes = ["/api/admin", "/api/calendar", "/api/activities"];
const organizationBlockedRoutes = ["/dashboard", "/chat", "/company", "/documents", "/settings", "/notifications"];
const organizationBlockedApiRoutes = ["/api/chat", "/api/conversations", "/api/company", "/api/documents", "/api/notifications"];
const externalWebhookRoutes = ["/api/billing/maishapay/callback", "/api/webhooks/zoho/outgoing-mail"];
const safeMethods = ["GET", "HEAD", "OPTIONS"];
const DTSC_INTERNAL_ORGANIZATION_ID = "dtsc-internal";

function isPathMatch(pathname: string, routes: string[]) {
  return routes.some((route) => pathname === route || pathname.startsWith(`${route}/`));
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

function hasOrganizationContext(session: Awaited<ReturnType<typeof verifySessionToken>>) {
  return session?.activeContext === "ORGANIZATION" && Boolean(session.activeOrganizationId);
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

  if (isPathMatch(pathname, [...privateRoutes, ...adminRoutes]) && !session) {
    const signInUrl = new URL("/auth/sign-in", request.url);
    signInUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(signInUrl);
  }

  if (hasOrganizationContext(session) && isPathMatch(pathname, organizationBlockedApiRoutes)) {
    return NextResponse.json(
      {
        error: "Forbidden",
        message: "Ce module global n'est pas disponible dans un espace entreprise.",
      },
      { status: 403 }
    );
  }

  if (hasOrganizationContext(session) && isPathMatch(pathname, organizationBlockedRoutes)) {
    return NextResponse.redirect(new URL("/enterprise-activities", request.url));
  }

  if (isPathMatch(pathname, dtscInternalApiRoutes)) {
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!hasDtscInternalContext(session)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  if (isPathMatch(pathname, dtscInternalRoutes) && !hasDtscInternalContext(session)) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if ((pathname === "/auth/sign-in" || pathname === "/auth/sign-up") && session) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  const response = NextResponse.next();
  if (session && isPathMatch(pathname, [...privateRoutes, ...adminRoutes]) && secret) {
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
    response.cookies.set(SESSION_COOKIE, tokenValue, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: SESSION_MAX_AGE_SECONDS,
    });
  }

  return response;
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/chat/:path*",
    "/billing/:path*",
    "/company/:path*",
    "/calendar/:path*",
    "/documents/:path*",
    "/activities/:path*",
    "/enterprise-admin/:path*",
    "/enterprise-activities/:path*",
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
