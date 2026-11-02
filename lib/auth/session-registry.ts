import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import type { SessionPayload } from "@/lib/session";

export function newSessionId() {
  return randomUUID();
}

export async function registerAuthSession(session: SessionPayload) {
  if (!session.sessionId) throw new Error("Auth session ID required");
  const agent = (await headers()).get("user-agent")?.trim().slice(0, 240) || null;
  await prisma.authSession.create({
    data: {
      id: session.sessionId,
      userId: session.userId,
      userAgent: agent,
      absoluteExpiresAt: new Date((session.absoluteExp || session.exp) * 1000),
    },
  });
}

/** Database is the authority for revocation. Failure means no authenticated access. */
export async function isAuthSessionActive(session: SessionPayload): Promise<boolean> {
  // Membership and active-account status are part of authentication, not merely
  // UI permissions: a signed organization context must never outlive removal.
  const organizationId = session.activeOrganizationId;
  if ((session.activeContext === "DTSC_INTERNAL" || session.activeContext === "ORGANIZATION") && !organizationId) {
    return false;
  }
  const [user, membership] = await Promise.all([
    prisma.user.findUnique({ where: { id: session.userId }, select: { status: true } }),
    organizationId ? prisma.organizationMember.findFirst({
      where: {
        userId: session.userId, organizationId,
        status: "ACTIVE", removedAt: null,
        organization: { status: "ACTIVE", deletedAt: null },
      },
      select: { id: true },
    }) : Promise.resolve(null),
  ]);
  if (!user || user.status !== "ACTIVE" || (organizationId && !membership)) return false;
  if (session.sessionId) {
    const record = await prisma.authSession.findFirst({
      where: {
        id: session.sessionId,
        userId: session.userId,
        revokedAt: null,
        absoluteExpiresAt: { gt: new Date() },
      },
      select: { id: true },
    });
    return Boolean(record);
  }

  // Compatibility: previously issued signed cookies remain valid until their
  // original absolute expiry, unless explicitly invalidated. No new login may
  // create legacy sessions after AUTH-03 is delivered.
  const policy = await prisma.userSessionPreference.findUnique({
    where: { userId: session.userId },
    select: { legacySessionsInvalidBefore: true },
  });
  if (policy?.legacySessionsInvalidBefore) {
    const authenticatedAtMs = session.authTime ? session.authTime * 1000 : 0;
    if (authenticatedAtMs <= policy.legacySessionsInvalidBefore.getTime()) return false;
  }
  return true;
}

export async function touchRegisteredSession(session: SessionPayload): Promise<boolean> {
  if (!session.sessionId) return true;
  const updated = await prisma.authSession.updateMany({
    where: {
      id: session.sessionId,
      userId: session.userId,
      revokedAt: null,
      absoluteExpiresAt: { gt: new Date() },
    },
    data: { lastSeenAt: new Date() },
  });
  return updated.count === 1;
}

export async function revokeOneSession(userId: string, sessionId: string, reason: string) {
  const changed = await prisma.authSession.updateMany({
    where: { id: sessionId, userId, revokedAt: null },
    data: { revokedAt: new Date(), revokeReason: reason },
  });
  return changed.count;
}

export async function revokeOtherSessions(userId: string, exceptSessionId: string | null) {
  const now = new Date();
  const [revoked, policy] = await prisma.$transaction([
    prisma.authSession.updateMany({
      where: {
        userId,
        revokedAt: null,
        ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}),
      },
      data: { revokedAt: now, revokeReason: "USER_REVOKED_OTHER_SESSIONS" },
    }),
    prisma.userSessionPreference.upsert({
      where: { userId },
      create: { userId, legacySessionsInvalidBefore: now },
      update: { legacySessionsInvalidBefore: now },
      select: { userId: true },
    }),
  ]);
  void policy;
  return revoked.count;
}
