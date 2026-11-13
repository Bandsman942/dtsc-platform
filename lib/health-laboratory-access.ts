import { canAccessEnterpriseModule, ENTERPRISE_MANAGER_ROLES, requireEnterpriseMembership } from "@/lib/enterprise-sector-templates";
import { getHealthStaffMedicalPermissions } from "@/lib/health-staff-access";
import type { SessionPayload } from "@/lib/session";

export async function getHealthLaboratoryAccess({session,organizationId,action}:{session:SessionPayload;organizationId:string;action:"read"|"submit"|"write"|"manage"}) {
  const membership=await requireEnterpriseMembership(session,organizationId);
  if(!membership||membership.organization.sectorCode!=="HEALTH_CARE")return null;
  if(!(await canAccessEnterpriseModule(session.userId,organizationId,"LABORATORY",action)))return null;
  const permissions=await getHealthStaffMedicalPermissions(session.userId,organizationId);
  const manager=ENTERPRISE_MANAGER_ROLES.has(membership.role);
  const has=(permission:string)=>manager||permissions.includes(permission);
  // Clinical/laboratory execution and result reading require an active staff
  // assignment permission; enterprise manager status is administrative only.
  return {membership,
    canViewSensitive:permissions.includes("health.laboratory.view_sensitive"),
    canCreate:permissions.includes("health.laboratory.create_request"),
    canUpdate:permissions.includes("health.laboratory.update_request"),
    canCancel:permissions.includes("health.laboratory.cancel_request"),
    canCollect:permissions.includes("health.laboratory.collect_sample"),
    canEnterResult:permissions.includes("health.laboratory.enter_result"),
    canValidate:permissions.includes("health.laboratory.validate_result"),
    canCorrect:permissions.includes("health.laboratory.correct_validated_result"),
    canTransmit:permissions.includes("health.laboratory.transmit_result"),
    canManageCatalog:has("health.laboratory.manage_catalog")};
}
