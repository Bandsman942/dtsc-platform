import { prisma } from "@/lib/prisma";
import type { SessionContext } from "@/lib/session";

type Context = { activeContext?: SessionContext; activeOrganizationId?: string | null };

export async function getGlobalMfaPolicy() {
  const row = await prisma.appSetting.findUnique({
    where: { id: "global" },
    select: { requireMfaForAllUsers: true, requireMfaForDtscInternal: true },
  });
  return {
    requireMfaForAllUsers: row?.requireMfaForAllUsers ?? false,
    requireMfaForDtscInternal: row?.requireMfaForDtscInternal ?? false,
  };
}

/** Global minima always override less restrictive tenant configuration. */
export async function isMfaRequiredForContext(input: Context): Promise<boolean> {
  const global = await getGlobalMfaPolicy();
  if (global.requireMfaForAllUsers) return true;
  if (global.requireMfaForDtscInternal && input.activeContext === "DTSC_INTERNAL") return true;
  if (input.activeContext === "ORGANIZATION" && input.activeOrganizationId) {
    const policy = await prisma.enterpriseOrganizationSecurityPolicy.findUnique({
      where: { organizationId: input.activeOrganizationId },
      select: { requireMfa: true },
    });
    return Boolean(policy?.requireMfa);
  }
  return false;
}

/**
 * A TOTP factor belongs to the global identity, so removal must be denied if
 * any active membership still requires it. The current workspace alone is insufficient.
 */
export async function isMfaRequiredAnywhere(userId: string): Promise<boolean> {
  const global = await getGlobalMfaPolicy();
  if (global.requireMfaForAllUsers) return true;
  const membership = {
    userId, status: "ACTIVE", removedAt: null,
    organization: { status: "ACTIVE", deletedAt: null },
  };
  if (global.requireMfaForDtscInternal) {
    const internal = await prisma.organizationMember.findFirst({
      where: { ...membership, organization: { ...membership.organization, organizationType: "DTSC_INTERNAL" } },
      select: { id: true },
    });
    if (internal) return true;
  }
  const enforced = await prisma.organizationMember.findFirst({
    where: {
      ...membership,
      organization: { ...membership.organization, enterpriseSecurityPolicy: { is: { requireMfa: true } } },
    },
    select: { id: true },
  });
  return Boolean(enforced);
}
