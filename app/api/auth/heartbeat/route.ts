import { NextResponse } from "next/server";
import { UserStatus } from "@prisma/client";
import { clearSessionCookie, getSession, setSessionCookie } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";
import { getUserSessionIdleTimeoutMinutes } from "@/lib/session-preference";
import { sessionWarningSeconds } from "@/lib/session-policy";

export async function POST(req: Request) {
  if (!isSameOriginRequest(req)) {
    return NextResponse.json({ error: "Cross-origin request blocked" }, { status: 403 });
  }

  const limiter = await rateLimit(getRateLimitKey(req, "auth:heartbeat"), 120, 15 * 60 * 1000);
  if (!limiter.ok) {
    return NextResponse.json({ error: "Too many heartbeat requests" }, { status: 429 });
  }

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Session expired" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      status: true,
    },
  });

  if (!user || user.status !== UserStatus.ACTIVE) {
    await clearSessionCookie();
    return NextResponse.json({ error: "Session unavailable" }, { status: 401 });
  }

  const sessionIdleTimeoutMinutes = await getUserSessionIdleTimeoutMinutes(user.id);
  const renewed = await setSessionCookie(
    {
      ...user,
      sessionIdleTimeoutMinutes,
      activeContext: session.activeContext,
      activeOrganizationId: session.activeOrganizationId || null,
      activeOrganizationName: session.activeOrganizationName || null,
      activeOrganizationRole: session.activeOrganizationRole || null,
    },
    { previousSession: session }
  );

  if (!renewed) {
    return NextResponse.json({ error: "Absolute session lifetime reached" }, { status: 401 });
  }

  return NextResponse.json({
    ok: true,
    expiresAt: new Date(renewed.exp * 1000).toISOString(),
    idleTimeoutMinutes: renewed.idleTimeoutMinutes,
    absoluteExpiresAt: renewed.absoluteExp ? new Date(renewed.absoluteExp * 1000).toISOString() : null,
    warningSeconds: sessionWarningSeconds(renewed.idleTimeoutMinutes),
  });
}
