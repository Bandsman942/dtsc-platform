import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { resolveSessionIdleTimeoutMinutes } from "@/lib/session-policy";
import type { SessionIdleTimeoutMinutes } from "@/lib/session-config";

type SessionPreferenceRow = { sessionIdleTimeoutMinutes: number };

export async function getUserSessionIdleTimeoutMinutes(userId: string): Promise<SessionIdleTimeoutMinutes> {
  const rows = await prisma.$queryRaw<SessionPreferenceRow[]>(Prisma.sql`
    SELECT "sessionIdleTimeoutMinutes"
    FROM "User"
    WHERE "id" = ${userId}
    LIMIT 1
  `);
  return resolveSessionIdleTimeoutMinutes(rows[0]?.sessionIdleTimeoutMinutes);
}

export async function updateUserSessionIdleTimeoutMinutes(userId: string, idleTimeoutMinutes: SessionIdleTimeoutMinutes) {
  await prisma.$executeRaw(Prisma.sql`
    UPDATE "User"
    SET "sessionIdleTimeoutMinutes" = ${idleTimeoutMinutes}, "updatedAt" = NOW()
    WHERE "id" = ${userId}
  `);
}
