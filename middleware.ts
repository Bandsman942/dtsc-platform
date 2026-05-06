import { NextResponse, type NextRequest } from "next/server";
import { SESSION_MAX_AGE_SECONDS } from "@/lib/session-config";
import { createSessionToken, SESSION_COOKIE, verifySessionToken } from "@/lib/session";

const privateRoutes = ["/dashboard", "/chat", "/billing", "/documents", "/profile", "/settings", "/support", "/notifications", "/announcements"];
const adminRoutes = ["/admin"];

function isPathMatch(pathname: string, routes: string[]) {
  return routes.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const secret = process.env.AUTH_SECRET;
  const session = secret ? await verifySessionToken(token, secret) : null;

  if (isPathMatch(pathname, [...privateRoutes, ...adminRoutes]) && !session) {
    const signInUrl = new URL("/auth/sign-in", request.url);
    signInUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(signInUrl);
  }

  if (isPathMatch(pathname, adminRoutes) && session?.role !== "ADMIN") {
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
    "/documents/:path*",
    "/profile/:path*",
    "/settings/:path*",
    "/support/:path*",
    "/notifications/:path*",
    "/announcements/:path*",
    "/admin/:path*",
    "/auth/sign-in",
    "/auth/sign-up",
  ],
};
