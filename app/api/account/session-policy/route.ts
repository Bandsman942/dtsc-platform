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
import { resolveSessionIdleTimeoutMinutes, sessionWarningSeconds } from "@/lib/session-policy";

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
    return NextResponse.json({ error: "Cross-origin request blocked", code: "SESSION_POLICY_ORIGIN_REJECTED" }, { status: 403 });
  }

  const limiter = await rateLimit(getRateLimitKey(req, "account:session-policy"), 20, 15 * 60 * 1000);
  if (!limiter.ok) {
    await writeApiLog({ request: req, statusCode: 429, startedAt });
    return NextResponse.json(
      { error: "Too many requests", code: "SESSION_POLICY_RATE_LIMITED", resetAt: new Date(limiter.resetAt).toISOString() },
      { status: 429 }
    );
  }

  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized", code: "SESSION_EXPIRED" }, { status: 401 });
  }

  const parsed = sessionPolicySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Invalid session policy", code: "SESSION_POLICY_INVALID" }, { status: 400 });
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
    return NextResponse.json({ error: "Unauthorized", code: "SESSION_USER_INACTIVE" }, { status: 401 });
  }

  const storedValue = await getUserSessionIdleTimeoutMinutes(user.id);
  const currentValue = resolveSessionIdleTimeoutMinutes(session.idleTimeoutMinutes ?? storedValue);
  const nextValue = parsed.data.sessionIdleTimeoutMinutes;

  if (currentValue !== nextValue) {
    try {
      await updateUserSessionIdleTimeoutMinutes(user.id, nextValue);
    } catch (error) {
      console.error("Session policy persistence failed", {
        userId: user.id,
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
      await writeApiLog({
        request: req,
        statusCode: 503,
        userId: user.id,
        startedAt,
        metadata: { code: "SESSION_POLICY_STORAGE_UNAVAILABLE" },
      });
      return NextResponse.json(
        {
          error: "Session preference storage is temporarily unavailable",
          code: "SESSION_POLICY_STORAGE_UNAVAILABLE",
          idleTimeoutMinutes: currentValue,
        },
        { status: 503 }
      );
    }

    await writeAuditLog({
      userId: user.id,
      action: "ACCOUNT_SESSION_POLICY_UPDATE",
      entity: "User",
      entityId: user.id,
      request: req,
      metadata: { previousIdleTimeoutMinutes: currentValue, idleTimeoutMinutes: nextValue },
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
    return NextResponse.json(
      { error: "Absolute session lifetime reached", code: "SESSION_ABSOLUTE_EXPIRED" },
      { status: 401 }
    );
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
