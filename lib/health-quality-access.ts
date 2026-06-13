import { canAccessEnterpriseModule, ENTERPRISE_MANAGER_ROLES, requireEnterpriseMembership } from "@/lib/enterprise-sector-templates";
import { getHealthStaffMedicalPermissions } from "@/lib/health-staff-access";
import type { SessionPayload } from "@/lib/session";

export async function getHealthQualityAccess({ session, organizationId, action }: { session: SessionPayload; organizationId: string; action: "read" | "submit" | "write" | "manage" }) {
  const membership = await requireEnterpriseMembership(session, organizationId);
  if (!membership || membership.organization.sectorCode !== "HEALTH_CARE" || !(await canAccessEnterpriseModule(session.userId, organizationId, "QUALITY_INCIDENTS", action))) return null;
  const permissions = await getHealthStaffMedicalPermissions(session.userId, organizationId);
  const manager = ENTERPRISE_MANAGER_ROLES.has(membership.role);
  const has = (permission: string) => manager || permissions.includes(permission);
  return {
    membership,
    canViewAll: has("health.quality.view"),
    canViewSensitive: permissions.includes("health.quality.view_sensitive"),
    canViewConfidential: permissions.includes("health.quality.view_confidential_incidents"),
    canCreate: has("health.quality.create_incident"),
    canUpdate: has("health.quality.update_incident"),
    canQualify: has("health.quality.qualify_incident"),
    canAssign: has("health.quality.assign_incident"),
    canInvestigate: has("health.quality.investigate_incident"),
    canClose: has("health.quality.close_incident"),
    canReopen: has("health.quality.reopen_incident"),
    canArchive: has("health.quality.archive_incident"),
    canManageActions: has("health.quality.manage_corrective_actions"),
    canValidateActions: has("health.quality.validate_corrective_actions"),
    canViewReports: has("health.quality.view_reports"),
  };
}
