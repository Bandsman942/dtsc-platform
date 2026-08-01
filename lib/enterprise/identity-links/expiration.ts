import { notifyUser, notifyUsers } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";

const EXPIRABLE_STATUSES = ["INVITATION_PENDING", "USER_CONSENT_REQUIRED"] as const;

export async function expireEnterpriseIdentityInvitations({ batchSize = 100 }: { batchSize?: number } = {}) {
  const boundedBatch = Math.max(1, Math.min(Math.trunc(batchSize), 250));
  const now = new Date();
  const candidates = await prisma.enterpriseIdentityLink.findMany({
    where: { status: { in: [...EXPIRABLE_STATUSES] }, expiresAt: { lte: now } },
    orderBy: [{ expiresAt: "asc" }, { createdAt: "asc" }],
    take: boundedBatch,
    select: { id: true, organizationId: true, userId: true, initiatedByUserId: true, status: true, revision: true },
  });

  let expired = 0;
  let skipped = 0;
  const notifications: Array<Promise<unknown>> = [];
  for (const candidate of candidates) {
    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.enterpriseIdentityLink.updateMany({
        where: { id: candidate.id, status: candidate.status, revision: candidate.revision, expiresAt: { lte: now } },
        data: { status: "EXPIRED", revision: { increment: 1 }, invitationTokenDigest: null },
      });
      if (updated.count !== 1) return false;
      await tx.enterpriseIdentityLinkEvent.create({
        data: {
          organizationId: candidate.organizationId,
          identityLinkId: candidate.id,
          eventType: "IDENTITY_LINK_EXPIRED",
          fromStatus: candidate.status,
          toStatus: "EXPIRED",
          metadataJson: { automatic: true },
        },
      });
      return true;
    });
    if (!result) {
      skipped += 1;
      continue;
    }
    expired += 1;
    if (candidate.userId) {
      notifications.push(notifyUser({
        userId: candidate.userId,
        organizationId: candidate.organizationId,
        title: "Invitation de liaison expirée",
        body: "Cette invitation n’est plus utilisable. Une nouvelle invitation sera nécessaire.",
        type: "INFO",
        targetUrl: `/enterprise-links?link=${encodeURIComponent(candidate.id)}&section=consent`,
        idempotencyKey: `identity-expired-user:${candidate.id}`,
      }));
    }
    const admins = await prisma.organizationMember.findMany({
      where: { organizationId: candidate.organizationId, status: "ACTIVE", removedAt: null, role: { in: ["OWNER", "ADMIN_ENTREPRISE", "ADMIN_ENTERPRISE"] } },
      select: { userId: true },
      take: 50,
    });
    notifications.push(notifyUsers({
      userIds: [...new Set([candidate.initiatedByUserId, ...admins.map((item) => item.userId)])],
      organizationId: candidate.organizationId,
      title: "Invitation DTSC expirée",
      body: "Une invitation de liaison non traitée est arrivée à expiration.",
      type: "INFO",
      targetUrl: `/enterprise-identity-admin?link=${encodeURIComponent(candidate.id)}&section=relations`,
    }));
  }
  await Promise.allSettled(notifications);
  return { examined: candidates.length, expired, skipped, hasMore: candidates.length === boundedBatch };
}
