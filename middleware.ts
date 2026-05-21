import { NextResponse, type NextRequest } from "next/server";
import { SESSION_MAX_AGE_SECONDS } from "@/lib/session-config";
import { createSessionToken, SESSION_COOKIE, verifySessionToken } from "@/lib/session";

const privateRoutes = ["/dashboard", "/chat", "/billing", "/company", "/calendar", "/documents", "/activities", "/collaborators", "/profile", "/settings", "/support", "/notifications", "/announcements"];
const adminRoutes = ["/admin"];
const externalWebhookRoutes = ["/api/billing/maishapay/callback", "/api/webhooks/zoho/outgoing-mail"];
const safeMethods = ["GET", "HEAD", "OPTIONS"];

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

  if (isPathMatch(pathname, adminRoutes) && session?.role === "CLIENT") {
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
