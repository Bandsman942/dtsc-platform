import { UserRole, UserStatus } from "@prisma/client";
import { DTSC_INTERNAL_ORGANIZATION_ID } from "@/lib/organizations";
import { prisma } from "@/lib/prisma";

/**
 * Keep the multi-tenant DTSC membership aligned with the canonical HR record.
 * Internal routes require both an active HrcfoEmployee and an ACTIVE membership
 * in the dtsc-internal organization.
 */
export async function syncDtscInternalMembershipForEmployee(userId: string, employeeStatus: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, status: true },
  });

  if (!user || user.role === UserRole.CLIENT) {
    throw new Error("Le collaborateur DTSC doit être lié à un compte interne valide.");
  }

  const existing = await prisma.organizationMember.findUnique({
    where: {
      organizationId_userId: {
        organizationId: DTSC_INTERNAL_ORGANIZATION_ID,
        userId,
      },
    },
    select: { joinedAt: true },
  });

  const isActive = employeeStatus !== "EXITED" && user.status === UserStatus.ACTIVE;
  const now = new Date();

  return prisma.organizationMember.upsert({
    where: {
      organizationId_userId: {
        organizationId: DTSC_INTERNAL_ORGANIZATION_ID,
        userId,
      },
    },
    update: {
      role: user.role,
      status: isActive ? "ACTIVE" : "SUSPENDED",
      joinedAt: isActive ? existing?.joinedAt || now : existing?.joinedAt || null,
      removedAt: isActive ? null : now,
    },
    create: {
      organizationId: DTSC_INTERNAL_ORGANIZATION_ID,
      userId,
      role: user.role,
      status: isActive ? "ACTIVE" : "SUSPENDED",
      joinedAt: isActive ? now : null,
      removedAt: isActive ? null : now,
    },
  });
}
