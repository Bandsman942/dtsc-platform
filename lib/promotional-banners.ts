import type { Prisma, UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizeBannerRoles, normalizeBannerSurfaces, type PromotionalBannerForClient } from "@/lib/promotional-banner-shared";

export function serializePromotionalBanner(banner: {
  id: string;
  title: string;
  description: string;
  surfacesJson: Prisma.JsonValue;
  ctaLabel: string | null;
  ctaUrl: string | null;
  priority: number;
}): PromotionalBannerForClient {
  return {
    id: banner.id,
    title: banner.title,
    description: banner.description,
    surfaces: normalizeBannerSurfaces(banner.surfacesJson),
    ctaLabel: banner.ctaLabel,
    ctaUrl: banner.ctaUrl,
    priority: banner.priority,
  };
}

export function roleMatchesPromotionalBanner(role: UserRole, includeRoles: unknown, excludeRoles: unknown) {
  const included = normalizeBannerRoles(includeRoles);
  const excluded = normalizeBannerRoles(excludeRoles);
  if (excluded.includes(role)) {
    return false;
  }
  return !included.length || included.includes(role);
}

export async function getVisiblePromotionalBannersForUser(userId: string, role: UserRole) {
  const now = new Date();
  const banners = await prisma.promotionalBanner.findMany({
    where: {
      status: "ACTIVE",
      archivedAt: null,
      OR: [{ startsAt: null }, { startsAt: { lte: now } }],
      AND: [{ OR: [{ endsAt: null }, { endsAt: { gte: now } }] }],
      dismissals: { none: { userId } },
    },
    orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
    take: 10,
  });

  return banners
    .filter((banner) => roleMatchesPromotionalBanner(role, banner.includeRoles, banner.excludeRoles))
    .map(serializePromotionalBanner);
}
