import { NextResponse } from "next/server";
import { UserStatus } from "@prisma/client";
import { z } from "zod";
import { getSession, setSessionCookie } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";
import {
  getUserSessionIdleTimeoutMinutes,
  updateUserSessionIdleTimeoutMinutes,
} from "@/lib/session-preference";
import { sessionWarningSeconds } from "@/lib/session-policy";

const sessionPolicySchema = z.object({
  sessionIdleTimeoutMinutes: z.union([
    z.literal(15),
    z.literal(30),
    z.literal(60),
    z.literal(240),
    z.literal(480),
    z.literal(1440),
    z.literal(10080),
    z.literal(43200),
  ]),
}).strict();

export async function POST(req: Request) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) {
    await writeApiLog({ request: req, statusCode: 403, startedAt });
    return NextResponse.json({ error: "Cross-origin request blocked" }, { status: 403 });
  }

  const limiter = await rateLimit(getRateLimitKey(req, "account:session-policy"), 20, 15 * 60 * 1000);
  if (!limiter.ok) {
    await writeApiLog({ request: req, statusCode: 429, startedAt });
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = sessionPolicySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Invalid session policy" }, { status: 400 });
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
    await writeApiLog({ request: req, statusCode: 401, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const previousValue = await getUserSessionIdleTimeoutMinutes(user.id);
  const nextValue = parsed.data.sessionIdleTimeoutMinutes;
  if (previousValue !== nextValue) {
    await updateUserSessionIdleTimeoutMinutes(user.id, nextValue);
    await writeAuditLog({
      userId: user.id,
      action: "ACCOUNT_SESSION_POLICY_UPDATE",
      entity: "User",
      entityId: user.id,
      request: req,
      metadata: { previousIdleTimeoutMinutes: previousValue, idleTimeoutMinutes: nextValue },
    });
  }

  const renewed = await setSessionCookie(
    {
      ...user,
      sessionIdleTimeoutMinutes: nextValue,
      activeContext: session.activeContext,
      activeOrganizationId: session.activeOrganizationId || null,
      activeOrganizationName: session.activeOrganizationName || null,
      activeOrganizationRole: session.activeOrganizationRole || null,
    },
    { previousSession: session }
  );

  if (!renewed) {
    await writeApiLog({ request: req, statusCode: 401, userId: user.id, startedAt });
    return NextResponse.json({ error: "Absolute session lifetime reached" }, { status: 401 });
  }

  await writeApiLog({ request: req, statusCode: 200, userId: user.id, startedAt });
  return NextResponse.json({
    ok: true,
    idleTimeoutMinutes: renewed.idleTimeoutMinutes,
    expiresAt: new Date(renewed.exp * 1000).toISOString(),
    absoluteExpiresAt: renewed.absoluteExp ? new Date(renewed.absoluteExp * 1000).toISOString() : null,
    warningSeconds: sessionWarningSeconds(renewed.idleTimeoutMinutes),
  });
}
