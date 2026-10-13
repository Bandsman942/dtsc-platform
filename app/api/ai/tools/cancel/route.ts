import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

const schema = z.object({ confirmationId: z.string().uuid() }).strict();

export async function POST(req: Request) {
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `ai-tool-cancel:${session.userId}`), 60, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });

  const organizationId = session.activeContext === "ORGANIZATION" ? session.activeOrganizationId || null : null;
  // Approval invalidation and Agent state change are one operation: a
  // cancelled confirmation cannot outlive its rejected run.
  const cancelled = await prisma.$transaction(async (tx) => {
    const now = new Date();
    const updated = await tx.aiToolConfirmation.updateMany({
      where: {
        id: parsed.data.confirmationId,
        userId: session.userId,
        organizationId,
        status: "PENDING",
        expiresAt: { gt: now },
      },
      data: {
        status: "CANCELLED",
        cancelledAt: now,
        argumentsJson: Prisma.DbNull,
        updatedAt: now,
      },
    });
    if (updated.count !== 1) return false;
    await tx.aiAgentRun.updateMany({
      where: {
        pendingConfirmationId: parsed.data.confirmationId,
        userId: session.userId,
        organizationId,
        status: { in: ["WAITING_CONFIRMATION", "READY_TO_RESUME"] },
      },
      data: {
        status: "CANCELLED",
        reasonCode: "CONFIRMATION_CANCELLED",
        pendingConfirmationId: null,
        cancelRequestedAt: now,
        cancelledAt: now,
        completedAt: now,
      },
    });
    return true;
  });
  if (!cancelled) return NextResponse.json({ error: "CONFIRMATION_NOT_FOUND_OR_EXPIRED" }, { status: 404 });

  return NextResponse.json({ ok: true, status: "CANCELLED" });
}
