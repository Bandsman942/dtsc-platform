import { prisma } from "@/lib/prisma";
import { resolveSessionIdleTimeoutMinutes } from "@/lib/session-policy";
import type { SessionIdleTimeoutMinutes } from "@/lib/session-config";

export async function getUserSessionIdleTimeoutMinutes(userId: string): Promise<SessionIdleTimeoutMinutes> {
  try {
    const preference = await prisma.userSessionPreference.findUnique({
      where: { userId },
      select: { sessionIdleTimeoutMinutes: true },
    });
    return resolveSessionIdleTimeoutMinutes(preference?.sessionIdleTimeoutMinutes);
  } catch {
    // Session preference storage is secondary to authentication availability.
    // Fail closed to the documented server default rather than breaking sign-in.
    return resolveSessionIdleTimeoutMinutes(undefined);
  }
}

export async function updateUserSessionIdleTimeoutMinutes(userId: string, idleTimeoutMinutes: SessionIdleTimeoutMinutes) {
  await prisma.userSessionPreference.upsert({
    where: { userId },
    update: { sessionIdleTimeoutMinutes: idleTimeoutMinutes },
    create: { userId, sessionIdleTimeoutMinutes: idleTimeoutMinutes },
  });
}
