import { NextResponse } from "next/server";
import { UserStatus } from "@prisma/client";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { getPublicWebPushVapidKey, isWebPushConfigured } from "@/lib/push/config";
import { pushSubscriptionCreateSchema, pushSubscriptionDeleteSchema } from "@/lib/push/validators";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

async function getActiveUser(sessionUserId: string) {
  return prisma.user.findUnique({
    where: { id: sessionUserId },
    select: { id: true, status: true, pushNotificationsEnabled: true },
  });
}

export async function GET(req: Request) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await getActiveUser(session.userId);
  if (!user || user.status !== UserStatus.ACTIVE) {
    await writeApiLog({ request: req, statusCode: 401, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const activeSubscriptionCount = await prisma.pushSubscription.count({
    where: { userId: user.id, revokedAt: null },
  });
  await writeApiLog({ request: req, statusCode: 200, userId: user.id, startedAt });
  return NextResponse.json({
    configured: isWebPushConfigured(),
    enabled: user.pushNotificationsEnabled,
    activeSubscriptionCount,
    vapidPublicKey: getPublicWebPushVapidKey(),
  });
}

export async function POST(req: Request) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) {
    await writeApiLog({ request: req, statusCode: 403, startedAt });
    return NextResponse.json({ error: "Cross-origin request blocked" }, { status: 403 });
  }

  const limiter = await rateLimit(getRateLimitKey(req, "push:subscription:create"), 20, 15 * 60 * 1000);
  if (!limiter.ok) {
    await writeApiLog({ request: req, statusCode: 429, startedAt });
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = await getActiveUser(session.userId);
  if (!user || user.status !== UserStatus.ACTIVE) {
    await writeApiLog({ request: req, statusCode: 401, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = pushSubscriptionCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    await writeApiLog({ request: req, statusCode: 400, userId: user.id, startedAt });
    return NextResponse.json({ error: "Invalid push subscription" }, { status: 400 });
  }

  const subscription = await prisma.pushSubscription.upsert({
    where: { endpoint: parsed.data.endpoint },
    update: {
      userId: user.id,
      p256dh: parsed.data.keys.p256dh,
      auth: parsed.data.keys.auth,
      userAgent: req.headers.get("user-agent")?.slice(0, 500) || null,
      deviceLabel: parsed.data.deviceLabel || null,
      revokedAt: null,
      lastUsedAt: new Date(),
    },
    create: {
      userId: user.id,
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.keys.p256dh,
      auth: parsed.data.keys.auth,
      userAgent: req.headers.get("user-agent")?.slice(0, 500) || null,
      deviceLabel: parsed.data.deviceLabel || null,
      lastUsedAt: new Date(),
    },
    select: { id: true },
  });

  if (!user.pushNotificationsEnabled) {
    await prisma.user.update({ where: { id: user.id }, data: { pushNotificationsEnabled: true } });
  }
  await writeAuditLog({
    userId: user.id,
    action: "ACCOUNT_PUSH_SUBSCRIPTION_UPSERT",
    entity: "PushSubscription",
    entityId: subscription.id,
    request: req,
    metadata: { source: "settings", endpointStored: true },
  });
  await writeApiLog({ request: req, statusCode: 200, userId: user.id, startedAt });
  return NextResponse.json({ ok: true, subscriptionId: subscription.id });
}

export async function DELETE(req: Request) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) {
    await writeApiLog({ request: req, statusCode: 403, startedAt });
    return NextResponse.json({ error: "Cross-origin request blocked" }, { status: 403 });
  }

  const limiter = await rateLimit(getRateLimitKey(req, "push:subscription:delete"), 30, 15 * 60 * 1000);
  if (!limiter.ok) {
    await writeApiLog({ request: req, statusCode: 429, startedAt });
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = await getActiveUser(session.userId);
  if (!user || user.status !== UserStatus.ACTIVE) {
    await writeApiLog({ request: req, statusCode: 401, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = pushSubscriptionDeleteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    await writeApiLog({ request: req, statusCode: 400, userId: user.id, startedAt });
    return NextResponse.json({ error: "Invalid push subscription" }, { status: 400 });
  }

  const existing = await prisma.pushSubscription.findFirst({
    where: { endpoint: parsed.data.endpoint, userId: user.id },
    select: { id: true },
  });
  if (existing) {
    await prisma.pushSubscription.update({
      where: { id: existing.id },
      data: { revokedAt: new Date() },
    });
    await writeAuditLog({
      userId: user.id,
      action: "ACCOUNT_PUSH_SUBSCRIPTION_REVOKE",
      entity: "PushSubscription",
      entityId: existing.id,
      request: req,
      metadata: { source: "current_device" },
    });
  }

  await writeApiLog({ request: req, statusCode: 200, userId: user.id, startedAt });
  return NextResponse.json({ ok: true });
}
