import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { AiToolRuntimeContext } from "@/lib/ai/tools/types";

const ADMIN_ROLES = new Set(["OWNER", "ADMIN_ENTREPRISE", "ADMIN_ENTERPRISE"]);

function permissionList(value: Prisma.JsonValue | null | undefined) {
  if (Array.isArray(value)) return value.filter((entry): entry is string => typeof entry === "string");
  if (value && typeof value === "object") {
    const permissions = (value as Record<string, unknown>).permissions;
    if (Array.isArray(permissions)) return permissions.filter((entry): entry is string => typeof entry === "string");
  }
  return [];
}

export async function authorizeMcpRequiredPermissions(input: { requiredPermissions: string[]; context: AiToolRuntimeContext }) {
  if (!input.requiredPermissions.length) return { allowed: true as const };
  const organizationId = input.context.organizationId || input.context.session.activeOrganizationId || null;
  if (input.context.session.activeContext !== "ORGANIZATION" || !organizationId || input.context.session.activeOrganizationId !== organizationId) {
    return { allowed: false as const, reasonCode: "MCP_PERMISSION_ORGANIZATION_REQUIRED" };
  }

  const membership = await prisma.organizationMember.findFirst({
    where: { userId: input.context.userId, organizationId, status: "ACTIVE", removedAt: null },
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
  if (!membership) return { allowed: false as const, reasonCode: "MCP_PERMISSION_MEMBERSHIP_REQUIRED" };
  if (ADMIN_ROLES.has(membership.role)) return { allowed: true as const };

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

  const granted = new Set([
    ...permissionList(position?.permissionsJson),
    ...membership.organizationRoleAssignments.flatMap((assignment) => permissionList(assignment.role.permissionsJson)),
  ]);
  if (granted.has("enterprise.admin.manage")) return { allowed: true as const };
  const missing = input.requiredPermissions.filter((permission) => !granted.has(permission));
  if (missing.length) return { allowed: false as const, reasonCode: "MCP_REQUIRED_PERMISSION_DENIED", missingPermissions: missing };
  return { allowed: true as const };
}
