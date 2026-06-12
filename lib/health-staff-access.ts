import { canAccessEnterpriseModule, ENTERPRISE_MANAGER_ROLES, requireEnterpriseMembership } from "@/lib/enterprise-sector-templates";
import { prisma } from "@/lib/prisma";
import type { SessionPayload } from "@/lib/session";

function permissions(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export async function getHealthStaffAccess({ session, organizationId, action }: { session: SessionPayload; organizationId: string; action: "read" | "submit" | "write" | "manage" }) {
  const membership = await requireEnterpriseMembership(session, organizationId);
  if (!membership || membership.organization.sectorCode !== "HEALTH_CARE") return null;
  if (!(await canAccessEnterpriseModule(session.userId, organizationId, "CARE_TEAM", action))) return null;
  const assignment = await prisma.healthStaffAssignment.findFirst({ where: { organizationId, userId: session.userId, status: "ACTIVE" }, select: { id: true, permissionsJson: true } });
  const staffPermissions = permissions(assignment?.permissionsJson);
  const canManage = ENTERPRISE_MANAGER_ROLES.has(membership.role);
  return {
    membership,
    assignment,
    canCreate: canManage || staffPermissions.includes("health.staff.create"),
    canUpdate: canManage || staffPermissions.includes("health.staff.update"),
    canSuspend: canManage || staffPermissions.includes("health.staff.suspend"),
    canArchive: canManage || staffPermissions.includes("health.staff.archive"),
    canManageAvailability: canManage || staffPermissions.includes("health.staff.manage_availability"),
    canManagePermissions: canManage || staffPermissions.includes("health.staff.manage_permissions"),
    canManageSpecialties: canManage || staffPermissions.includes("health.staff.manage_specialties"),
    canViewPermissions: canManage || staffPermissions.includes("health.staff.view_permissions"),
    canViewActivity: canManage || staffPermissions.includes("health.staff.view_activity"),
  };
}

export async function getHealthStaffMedicalPermissions(userId: string, organizationId: string) {
  const assignment = await prisma.healthStaffAssignment.findFirst({ where: { organizationId, userId, status: "ACTIVE" }, select: { permissionsJson: true } });
  return permissions(assignment?.permissionsJson);
}
