import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
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
  const updated = await prisma.$executeRaw(Prisma.sql`
    UPDATE "AiToolConfirmation"
    SET "status" = 'CANCELLED', "cancelledAt" = CURRENT_TIMESTAMP, "argumentsJson" = NULL, "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = ${parsed.data.confirmationId}
      AND "userId" = ${session.userId}
      AND ("organizationId" IS NOT DISTINCT FROM ${organizationId})
      AND "status" = 'PENDING'
      AND "expiresAt" > CURRENT_TIMESTAMP
  `);
  if (!updated) return NextResponse.json({ error: "CONFIRMATION_NOT_FOUND_OR_EXPIRED" }, { status: 404 });

  const now = new Date();
  await prisma.aiAgentRun.updateMany({
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
    },
  });

  return NextResponse.json({ ok: true, status: "CANCELLED" });
}
