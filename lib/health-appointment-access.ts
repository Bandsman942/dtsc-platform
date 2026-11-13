import { canAccessEnterpriseModule, ENTERPRISE_MANAGER_ROLES, requireEnterpriseMembership } from "@/lib/enterprise-sector-templates";
import type { SessionPayload } from "@/lib/session";
import { getHealthStaffMedicalPermissions } from "@/lib/health-staff-access";

export async function getHealthAppointmentAccess({ session, organizationId, action }: { session: SessionPayload; organizationId: string; action: "read" | "submit" | "write" | "manage" }) {
  const membership = await requireEnterpriseMembership(session, organizationId);
  if (!membership || membership.organization.sectorCode !== "HEALTH_CARE") return null;
  if (!(await canAccessEnterpriseModule(session.userId, organizationId, "APPOINTMENTS", action))) return null;
  const canManage = ENTERPRISE_MANAGER_ROLES.has(membership.role);
  const clinicalPermissions = await getHealthStaffMedicalPermissions(session.userId, organizationId);
  const clinicalAccess = clinicalPermissions.includes("health.consultations.view_sensitive");
  return {
    membership,
    canCreate: membership.role !== "GUEST",
    canUpdate: canManage,
    canTransition: canManage,
    canCancel: canManage,
    canConvert: clinicalAccess,
    canViewSensitive: clinicalAccess,
  };
}
