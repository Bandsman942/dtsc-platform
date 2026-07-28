import { NextResponse } from "next/server";
import { UserStatus } from "@prisma/client";
import { getSession } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { getWebPushConfigurationState } from "@/lib/push/config";
import { isAllowedPushEndpoint } from "@/lib/push/endpoint";
import { pushSubscriptionDeleteSchema } from "@/lib/push/validators";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

export async function POST(req: Request) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) {
    await writeApiLog({ request: req, statusCode: 403, startedAt });
    return NextResponse.json({ error: "Cross-origin request blocked" }, { status: 403 });
  }

  const limiter = await rateLimit(getRateLimitKey(req, "push:subscription:current"), 60, 15 * 60 * 1000);
  if (!limiter.ok) {
    await writeApiLog({ request: req, statusCode: 429, startedAt });
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, status: true, pushNotificationsEnabled: true },
  });
  if (!user || user.status !== UserStatus.ACTIVE) {
    await writeApiLog({ request: req, statusCode: 401, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = pushSubscriptionDeleteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !isAllowedPushEndpoint(parsed.data?.endpoint || "")) {
    await writeApiLog({ request: req, statusCode: 400, userId: user.id, startedAt });
    return NextResponse.json({ error: "Invalid push subscription" }, { status: 400 });
  }

  const subscription = await prisma.pushSubscription.findFirst({
    where: { userId: user.id, endpoint: parsed.data.endpoint },
    select: { id: true },
  });
  const configuration = getWebPushConfigurationState();

  await writeApiLog({ request: req, statusCode: 200, userId: user.id, startedAt });
  return NextResponse.json({
    configured: configuration.configured,
    configurationIssue: configuration.issue,
    enabled: user.pushNotificationsEnabled,
    registered: Boolean(subscription),
  });
}
