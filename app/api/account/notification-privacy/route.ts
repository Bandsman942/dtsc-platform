import { NextResponse } from "next/server";
import { UserStatus } from "@prisma/client";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";
import {
  getUserPushNotificationContentMode,
  updateUserPushNotificationContentMode,
} from "@/lib/session-preference";

const schema = z.object({
  mode: z.enum(["PRIVATE", "DETAILED"]),
}).strict();

export async function POST(req: Request) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) {
    await writeApiLog({ request: req, statusCode: 403, startedAt });
    return NextResponse.json({ error: "Cross-origin request blocked", code: "NOTIFICATION_PRIVACY_ORIGIN_REJECTED" }, { status: 403 });
  }

  const limiter = await rateLimit(getRateLimitKey(req, "account:notification-privacy"), 20, 15 * 60 * 1000);
  if (!limiter.ok) {
    await writeApiLog({ request: req, statusCode: 429, startedAt });
    return NextResponse.json({ error: "Too many requests", code: "NOTIFICATION_PRIVACY_RATE_LIMITED" }, { status: 429 });
  }

  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized", code: "SESSION_EXPIRED" }, { status: 401 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Invalid notification privacy preference", code: "NOTIFICATION_PRIVACY_INVALID" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, status: true },
  });
  if (!user || user.status !== UserStatus.ACTIVE) {
    await writeApiLog({ request: req, statusCode: 401, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Unauthorized", code: "SESSION_USER_INACTIVE" }, { status: 401 });
  }

  const previous = await getUserPushNotificationContentMode(user.id);
  const next = parsed.data.mode;
  try {
    await updateUserPushNotificationContentMode(user.id, next);
  } catch (error) {
    console.error("Notification privacy preference persistence failed", {
      userId: user.id,
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    await writeApiLog({ request: req, statusCode: 503, userId: user.id, startedAt, metadata: { code: "NOTIFICATION_PRIVACY_STORAGE_UNAVAILABLE" } });
    return NextResponse.json({ error: "Preference storage unavailable", code: "NOTIFICATION_PRIVACY_STORAGE_UNAVAILABLE", mode: previous }, { status: 503 });
  }

  if (previous !== next) {
    await writeAuditLog({
      userId: user.id,
      action: "ACCOUNT_NOTIFICATION_PRIVACY_UPDATE",
      entity: "User",
      entityId: user.id,
      request: req,
      metadata: { previousMode: previous, mode: next },
    });
  }

  await writeApiLog({ request: req, statusCode: 200, userId: user.id, startedAt });
  return NextResponse.json({ ok: true, mode: next });
}
