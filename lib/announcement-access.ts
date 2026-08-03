import type { Prisma } from "@prisma/client";
import type { SessionPayload } from "@/lib/session";
import { getActiveOrganizationId, isDtscInternalSession } from "@/lib/organizations";
import { prisma } from "@/lib/prisma";

export const GLOBAL_ANNOUNCEMENT_SCOPES = ["GLOBAL_PUBLIC", "GLOBAL_PRIVATE", "COMMUNITY", "DTSC_OFFICIAL"] as const;

export function announcementVisibilityWhere(session: Pick<SessionPayload, "activeContext" | "activeOrganizationId">): Prisma.AnnouncementWhereInput {
  if (isDtscInternalSession(session)) return { deletedAt: null };
  const organizationId = getActiveOrganizationId(session);
  return {
    deletedAt: null,
    moderationStatus: "PUBLISHED",
    status: { not: "DRAFT" },
    OR: [
      { scope: { in: [...GLOBAL_ANNOUNCEMENT_SCOPES] } },
      ...(organizationId ? [{ scope: "ORGANIZATION_ONLY", organizationId }] : []),
    ],
  };
}

export function canReadAnnouncement(
  announcement: { scope: string; organizationId: string | null; moderationStatus: string; status: string; deletedAt: Date | null },
  session: Pick<SessionPayload, "activeContext" | "activeOrganizationId">
) {
  if (announcement.deletedAt) return false;
  if (isDtscInternalSession(session)) return true;
  if (announcement.moderationStatus !== "PUBLISHED" || announcement.status === "DRAFT") return false;
  if ((GLOBAL_ANNOUNCEMENT_SCOPES as readonly string[]).includes(announcement.scope)) return true;
  const organizationId = getActiveOrganizationId(session);
  return announcement.scope === "ORGANIZATION_ONLY" && Boolean(organizationId && announcement.organizationId === organizationId);
}

export function resolveAnnouncementScope(
  requestedScope: string | undefined,
  session: Pick<SessionPayload, "activeContext" | "activeOrganizationId">
) {
  const organizationId = getActiveOrganizationId(session);
  if (isDtscInternalSession(session)) {
    const scope = requestedScope && ["GLOBAL_PUBLIC", "GLOBAL_PRIVATE", "COMMUNITY", "DTSC_OFFICIAL", "ORGANIZATION_ONLY"].includes(requestedScope)
      ? requestedScope
      : "DTSC_OFFICIAL";
    return { scope, organizationId: scope === "ORGANIZATION_ONLY" ? organizationId : null };
  }
  if (organizationId) return { scope: "ORGANIZATION_ONLY", organizationId };
  return { scope: "COMMUNITY", organizationId: null };
}

export async function canModerateAnnouncement(
  session: Pick<SessionPayload, "userId" | "role" | "activeContext" | "activeOrganizationId">,
  announcement: { authorId: string; organizationId: string | null }
) {
  if (announcement.authorId === session.userId) return true;
  if (isDtscInternalSession(session) && ["ADMIN", "SUPPORT"].includes(session.role)) return true;
  if (!announcement.organizationId || getActiveOrganizationId(session) !== announcement.organizationId) return false;
  const member = await prisma.organizationMember.findFirst({
    where: { organizationId: announcement.organizationId, userId: session.userId, status: "ACTIVE", removedAt: null },
    select: { role: true },
  });
  return member?.role === "OWNER" || member?.role === "ADMIN";
}
