import { Prisma } from "@prisma/client";
import { ENTERPRISE_ADMIN_ROLES } from "@/lib/enterprise-sector-templates";
import { resolveEnterpriseModuleAccess } from "@/lib/enterprise/module-access";
import type { SessionPayload } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export type WorkflowPermission = "read" | "create" | "edit" | "publish" | "retire" | "start" | "view_runs" | "retry" | "cancel";

function permissions(value: Prisma.JsonValue | null | undefined): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  if (value && typeof value === "object") {
    const nested = (value as Record<string, unknown>).permissions;
    if (Array.isArray(nested)) return nested.filter((item): item is string => typeof item === "string");
  }
  return [];
}

function grants(list: string[], permission: WorkflowPermission) {
  return list.includes("enterprise.admin.manage") || list.includes("enterprise.workflows.manage") || list.includes(`enterprise.workflows.${permission}`);
}

/**
 * Resolves workflow RBAC exclusively from the active client tenant, its live
 * organization membership and the canonical module/plan entitlement. A global
 * session role (including DTSC ADMIN) is never a tenant authorization.
 * MANAGER has no implicit administrative or organization-wide run access.
 */
export async function getEnterpriseWorkflowAccess(session: SessionPayload, organizationId: string) {
  if (session.activeContext !== "ORGANIZATION" || session.activeOrganizationId !== organizationId) return null;
  const membership = await prisma.organizationMember.findFirst({
    where: { organizationId, userId: session.userId, status: "ACTIVE", removedAt: null, organization: { organizationType: "CLIENT", status: "ACTIVE", deletedAt: null } },
    select: {
      role: true, positionId: true, positionCode: true,
      organizationRoleAssignments: {
        where: { revokedAt: null, role: { isActive: true, archivedAt: null } },
        select: { role: { select: { permissionsJson: true } } },
      },
    },
  });
  if (!membership) return null;

  const [position, moduleDecision] = await Promise.all([
    membership.positionId || membership.positionCode
      ? prisma.enterprisePosition.findFirst({
          where: { organizationId, isActive: true, OR: [
            ...(membership.positionId ? [{ id: membership.positionId }] : []),
            ...(membership.positionCode ? [{ positionCode: membership.positionCode }] : []),
          ] },
          select: { permissionsJson: true },
        })
      : Promise.resolve(null),
    resolveEnterpriseModuleAccess({ userId: session.userId, organizationId, moduleCode: "WORKFLOWS", action: "read" }),
  ]);
  if (!moduleDecision.allowed) return null;

  const list = [...new Set([
    ...permissions(position?.permissionsJson),
    ...membership.organizationRoleAssignments.flatMap((item) => permissions(item.role.permissionsJson)),
  ])];
  const admin = ENTERPRISE_ADMIN_ROLES.has(membership.role);
  const allow = (permission: WorkflowPermission) => admin || grants(list, permission);
  return {
    membership: { role: membership.role, positionId: membership.positionId, positionCode: membership.positionCode },
    canRead: true,
    canCreateDraft: allow("create"),
    canEditDraft: allow("edit"),
    canPublish: allow("publish"),
    canRetire: allow("retire"),
    canStartManual: allow("start"),
    canViewAllRuns: allow("view_runs"),
    canRetry: allow("retry"),
    canCancel: allow("cancel"),
  };
}
