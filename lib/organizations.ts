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

export function getDefaultContextForRole(): OrganizationContext {
  return {
    activeContext: "GLOBAL_CLIENT",
    activeOrganizationId: null,
    activeOrganizationName: null,
    activeOrganizationRole: null,
  };
}

export async function resolveDefaultOrganizationContext(user: Pick<User, "id" | "role">): Promise<OrganizationContext> {
  const dtscMembership = await prisma.organizationMember.findFirst({
    where: {
      userId: user.id,
      organizationId: DTSC_INTERNAL_ORGANIZATION_ID,
      status: "ACTIVE",
      removedAt: null,
      organization: { status: "ACTIVE", deletedAt: null, organizationType: "DTSC_INTERNAL" },
    },
    include: {
      organization: { select: { id: true, name: true } },
    },
  });

  if (dtscMembership) {
    return {
      activeContext: "DTSC_INTERNAL",
      activeOrganizationId: dtscMembership.organization.id,
      activeOrganizationName: dtscMembership.organization.name,
      activeOrganizationRole: dtscMembership.role,
    };
  }

  return getDefaultContextForRole();
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
    return resolveDefaultOrganizationContext(user);
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

export function isDtscInternalSession(session: Pick<SessionPayload, "activeContext" | "activeOrganizationId"> | null | undefined) {
  return session?.activeContext === "DTSC_INTERNAL" && session.activeOrganizationId === DTSC_INTERNAL_ORGANIZATION_ID;
}

export function getActiveOrganizationId(session: Pick<SessionPayload, "activeContext" | "activeOrganizationId"> | null | undefined) {
  if ((session?.activeContext === "ORGANIZATION" || session?.activeContext === "DTSC_INTERNAL") && session.activeOrganizationId) {
    return session.activeOrganizationId;
  }

  return null;
}

export function isOrganizationScopedSession(session: Pick<SessionPayload, "activeContext" | "activeOrganizationId"> | null | undefined) {
  return Boolean(getActiveOrganizationId(session));
}

export async function hasActiveOrganizationSubscription(organizationId: string | null | undefined) {
  if (!organizationId || organizationId === DTSC_INTERNAL_ORGANIZATION_ID) {
    return true;
  }

  const now = new Date();
  const subscription = await prisma.organizationSubscription.findFirst({
    where: {
      organizationId,
      status: "ACTIVE",
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    select: { id: true },
    orderBy: { updatedAt: "desc" },
  });

  return Boolean(subscription);
}

export function canManageClientOrganizations(role: UserRole) {
  return role === UserRole.ADMIN || role === UserRole.MANAGER;
}

export function canAccessOrganizationAdministration(role: string | null | undefined) {
  return role === "OWNER" || role === "ADMIN_ENTREPRISE" || role === "MANAGER";
}
