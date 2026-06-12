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
  return {membership,canViewSensitive:has("health.laboratory.view_sensitive"),canCreate:has("health.laboratory.create_request"),canUpdate:has("health.laboratory.update_request"),canCancel:has("health.laboratory.cancel_request"),canCollect:has("health.laboratory.collect_sample"),canEnterResult:has("health.laboratory.enter_result"),canValidate:has("health.laboratory.validate_result"),canCorrect:has("health.laboratory.correct_validated_result"),canTransmit:has("health.laboratory.transmit_result"),canManageCatalog:has("health.laboratory.manage_catalog")};
}
