import { canAccessEnterpriseModule, ENTERPRISE_MANAGER_ROLES, requireEnterpriseMembership } from "@/lib/enterprise-sector-templates";
import type { SessionPayload } from "@/lib/session";
import { getHealthStaffMedicalPermissions } from "@/lib/health-staff-access";

export async function getHealthPatientAccess({
  session,
  organizationId,
  action,
}: {
  session: SessionPayload;
  organizationId: string;
  action: "read" | "submit" | "write" | "manage";
}) {
  const membership = await requireEnterpriseMembership(session, organizationId);
  if (!membership || membership.organization.sectorCode !== "HEALTH_CARE") return null;
  if (!(await canAccessEnterpriseModule(session.userId, organizationId, "PATIENTS", action))) return null;
  const canManage = ENTERPRISE_MANAGER_ROLES.has(membership.role);
  const medicalPermissions = await getHealthStaffMedicalPermissions(session.userId, organizationId);
  const canViewSensitive = medicalPermissions.includes("health.medical_records.view_sensitive") || medicalPermissions.includes("health.consultations.view_sensitive");
  return {
    membership,
    canCreate: membership.role !== "GUEST",
    canUpdate: canManage,
    canArchive: canManage,
    canViewSensitive,
  };
}
