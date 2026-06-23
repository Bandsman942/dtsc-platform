import type { UserRole } from "@prisma/client";

export const promotionalBannerSurfaces = [
  { id: "CHATBOT", label: "Chatbot général" },
  { id: "ENTERPRISE_AI", label: "IA Assistant Entreprise" },
  { id: "COLLABORATORS", label: "Mes collaborateurs" },
  { id: "ANNOUNCEMENTS", label: "Annonces" },
] as const;

export type PromotionalBannerSurface = (typeof promotionalBannerSurfaces)[number]["id"];

export type PromotionalBannerForClient = {
  id: string;
  title: string;
  description: string;
  surfaces: PromotionalBannerSurface[];
  ctaLabel: string | null;
  ctaUrl: string | null;
  priority: number;
};

const validSurfaceIds = new Set(promotionalBannerSurfaces.map((surface) => surface.id));
const validRoleIds = new Set(["ADMIN", "MANAGER", "CLIENT", "SUPPORT"]);

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export function normalizeBannerSurfaces(value: unknown): PromotionalBannerSurface[] {
  const values = stringArray(value).filter((item): item is PromotionalBannerSurface => validSurfaceIds.has(item as PromotionalBannerSurface));
  return values.length ? [...new Set(values)] : ["CHATBOT", "ENTERPRISE_AI", "COLLABORATORS", "ANNOUNCEMENTS"];
}

export function normalizeBannerRoles(value: unknown): UserRole[] {
  return [...new Set(stringArray(value).filter((item): item is UserRole => validRoleIds.has(item)))];
}
