import { UserRole, type User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { SessionPayload } from "@/lib/session";

export const DTSC_INTERNAL_ORGANIZATION_ID = "dtsc-internal";

export type OrganizationContext = {
  activeContext: "GLOBAL_CLIENT" | "COMMUNITY" | "DTSC_INTERNAL" | "ORGANIZATION";
  activeOrganizationId: string | null;
  activeOrganizationName: string | null;
  activeOrganizationRole: string | null;
};

export function getDefaultContextForRole(role: UserRole): OrganizationContext {
  if (role === UserRole.ADMIN || role === UserRole.MANAGER || role === UserRole.SUPPORT) {
    return {
      activeContext: "DTSC_INTERNAL",
      activeOrganizationId: DTSC_INTERNAL_ORGANIZATION_ID,
      activeOrganizationName: "DTSC Internal",
      activeOrganizationRole: "DTSC",
    };
  }

  return {
    activeContext: "GLOBAL_CLIENT",
    activeOrganizationId: null,
    activeOrganizationName: null,
    activeOrganizationRole: null,
  };
}

export async function getAccessibleOrganizationsForEmail(email: string) {
  return prisma.organizationMember.findMany({
    where: {
      status: "ACTIVE",
      user: { email: email.toLowerCase(), status: "ACTIVE" },
      organization: { status: "ACTIVE", deletedAt: null },
    },
    select: {
      role: true,
      organization: {
        select: { id: true, name: true, slug: true, logoUrl: true, status: true, organizationType: true },
      },
    },
    orderBy: { organization: { name: "asc" } },
    take: 20,
  });
}

export async function resolveOrganizationLoginContext(user: Pick<User, "id" | "role">, organizationId?: string | null): Promise<OrganizationContext> {
  if (!organizationId) {
    return getDefaultContextForRole(user.role);
  }

  const membership = await prisma.organizationMember.findFirst({
    where: {
      userId: user.id,
      organizationId,
      status: "ACTIVE",
      removedAt: null,
      organization: { status: "ACTIVE", deletedAt: null },
    },
    include: {
      organization: { select: { id: true, name: true, status: true, organizationType: true } },
    },
  });

  if (!membership) {
    throw new Error("ORGANIZATION_ACCESS_DENIED");
  }

  return {
    activeContext: membership.organization.organizationType === "DTSC_INTERNAL" ? "DTSC_INTERNAL" : "ORGANIZATION",
    activeOrganizationId: membership.organization.id,
    activeOrganizationName: membership.organization.name,
    activeOrganizationRole: membership.role,
  };
}

export async function requireActiveOrganizationMembership(session: SessionPayload, organizationId: string) {
  const membership = await prisma.organizationMember.findFirst({
    where: {
      userId: session.userId,
      organizationId,
      status: "ACTIVE",
      removedAt: null,
      organization: { status: "ACTIVE", deletedAt: null },
    },
    include: { organization: true },
  });

  return membership;
}

export function isDtscPlatformRole(role: UserRole) {
  return role === UserRole.ADMIN || role === UserRole.MANAGER || role === UserRole.SUPPORT;
}

export function canManageClientOrganizations(role: UserRole) {
  return role === UserRole.ADMIN || role === UserRole.MANAGER;
}

export function canAccessOrganizationAdministration(role: string | null | undefined) {
  return role === "OWNER" || role === "ADMIN_ENTREPRISE" || role === "MANAGER";
}
