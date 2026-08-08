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

export async function getRetailCustomerPaymentPermissions(userId: string, organizationId: string) {
  const permissions = [
    "enterprise.retail.customer.read",
    "enterprise.retail.customer.create",
    "enterprise.retail.customer.manage",
    "enterprise.retail.loyalty.manage",
    "enterprise.retail.loyalty.redeem",
    "enterprise.retail.stored_value.issue",
    "enterprise.retail.stored_value.redeem",
    "enterprise.retail.stored_value.refund",
    "enterprise.retail.payments.manage",
    "enterprise.retail.payments.refund",
    "enterprise.retail.providers.manage",
    "enterprise.retail.providers.reconcile",
    "enterprise.retail.devices.manage",
  ] as const;
  const checks = await Promise.all(permissions.map((permission) => hasRetailPermission(userId, organizationId, permission)));
  return {
    canReadCustomers: checks[0],
    canCreateCustomers: checks[1],
    canManageCustomers: checks[2],
    canManageLoyalty: checks[3],
    canRedeemLoyalty: checks[4],
    canIssueStoredValue: checks[5],
    canRedeemStoredValue: checks[6],
    canRefundStoredValue: checks[7],
    canManagePayments: checks[8],
    canRefundPayments: checks[9],
    canManageProviders: checks[10],
    canReconcileProviders: checks[11],
    canManageDevices: checks[12],
  };
}
