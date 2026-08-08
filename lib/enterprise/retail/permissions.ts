import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const ENTERPRISE_ADMIN_ROLES = new Set(["OWNER", "ADMIN_ENTREPRISE", "ADMIN_ENTERPRISE"]);

function permissionList(value: Prisma.JsonValue | null | undefined) {
  if (Array.isArray(value)) return value.filter((permission): permission is string => typeof permission === "string");
  if (value && typeof value === "object") {
    const possiblePermissions = (value as Record<string, unknown>).permissions;
    if (Array.isArray(possiblePermissions)) return possiblePermissions.filter((permission): permission is string => typeof permission === "string");
  }
  return [];
}

export async function hasRetailPermission(userId: string, organizationId: string, permission: string) {
  const membership = await prisma.organizationMember.findFirst({
    where: { userId, organizationId, status: "ACTIVE", removedAt: null },
    select: {
      role: true,
      positionId: true,
      positionCode: true,
      organizationRoleAssignments: {
        where: { revokedAt: null, role: { isActive: true, archivedAt: null } },
        select: { role: { select: { permissionsJson: true } } },
      },
    },
  });
  if (!membership) return false;
  if (ENTERPRISE_ADMIN_ROLES.has(membership.role)) return true;

  const position = membership.positionId || membership.positionCode
    ? await prisma.enterprisePosition.findFirst({
        where: {
          organizationId,
          isActive: true,
          OR: [
            ...(membership.positionId ? [{ id: membership.positionId }] : []),
            ...(membership.positionCode ? [{ positionCode: membership.positionCode }] : []),
          ],
        },
        select: { permissionsJson: true },
      })
    : null;

  const permissions = new Set([
    ...permissionList(position?.permissionsJson),
    ...membership.organizationRoleAssignments.flatMap((assignment) => permissionList(assignment.role.permissionsJson)),
  ]);
  return permissions.has("enterprise.admin.manage") || permissions.has(permission);
}

export async function getRetailCommercialPermissions(userId: string, organizationId: string) {
  const checks = await Promise.all([
    hasRetailPermission(userId, organizationId, "enterprise.retail.pos.pricing.manage"),
    hasRetailPermission(userId, organizationId, "enterprise.retail.pos.price_override.manage"),
    hasRetailPermission(userId, organizationId, "enterprise.retail.pos.discount_override.manage"),
    hasRetailPermission(userId, organizationId, "enterprise.retail.pos.tax_override.manage"),
    hasRetailPermission(userId, organizationId, "enterprise.retail.pos.promotions.manage"),
    hasRetailPermission(userId, organizationId, "enterprise.retail.pos.returns.create"),
    hasRetailPermission(userId, organizationId, "enterprise.retail.pos.refunds.manage"),
  ]);
  return {
    canManagePricing: checks[0],
    canOverridePrice: checks[1],
    canOverrideDiscount: checks[2],
    canOverrideTax: checks[3],
    canManagePromotions: checks[4],
    canCreateReturns: checks[5],
    canManageRefunds: checks[6],
  };
}
