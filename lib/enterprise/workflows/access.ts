import { Prisma } from "@prisma/client";
import { ENTERPRISE_ADMIN_ROLES, ENTERPRISE_MANAGER_ROLES } from "@/lib/enterprise-sector-templates";
import type { SessionPayload } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export type WorkflowPermission = "read" | "create" | "edit" | "publish" | "retire" | "start" | "view_runs" | "retry" | "cancel";

function permissions(value: Prisma.JsonValue | null | undefined) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function grants(list: string[], permission: WorkflowPermission) {
  return list.includes("enterprise.admin.manage") || list.includes("enterprise.workflows.manage") || list.includes(`enterprise.workflows.${permission}`);
}

export async function getEnterpriseWorkflowAccess(session: SessionPayload, organizationId: string) {
  if (session.activeContext !== "ORGANIZATION" || session.activeOrganizationId !== organizationId) return null;
  const membership = await prisma.organizationMember.findFirst({
    where: { organizationId, userId: session.userId, status: "ACTIVE", removedAt: null, organization: { organizationType: "CLIENT", status: "ACTIVE", deletedAt: null } },
    select: { role: true, positionId: true, positionCode: true },
  });
  if (!membership) return null;
  const position = membership.positionId || membership.positionCode ? await prisma.enterprisePosition.findFirst({ where: { organizationId, isActive: true, OR: [...(membership.positionId ? [{ id: membership.positionId }] : []), ...(membership.positionCode ? [{ positionCode: membership.positionCode }] : [])] }, select: { permissionsJson: true } }) : null;
  const list = permissions(position?.permissionsJson);
  const admin = ENTERPRISE_ADMIN_ROLES.has(membership.role);
  const manager = ENTERPRISE_MANAGER_ROLES.has(membership.role);
  return {
    membership,
    canRead: true,
    canCreateDraft: admin || grants(list, "create"),
    canEditDraft: admin || grants(list, "edit"),
    canPublish: admin || grants(list, "publish"),
    canRetire: admin || grants(list, "retire"),
    canStartManual: manager || grants(list, "start"),
    canViewAllRuns: manager || grants(list, "view_runs"),
    canRetry: admin || grants(list, "retry"),
    canCancel: admin || grants(list, "cancel"),
  };
}
