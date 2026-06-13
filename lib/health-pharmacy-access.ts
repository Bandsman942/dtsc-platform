import { canAccessEnterpriseModule, ENTERPRISE_MANAGER_ROLES, requireEnterpriseMembership } from "@/lib/enterprise-sector-templates";
import { getHealthStaffMedicalPermissions } from "@/lib/health-staff-access";
import type { SessionPayload } from "@/lib/session";

export async function getHealthPharmacyAccess({session,organizationId,action}:{session:SessionPayload;organizationId:string;action:"read"|"submit"|"write"|"manage"}){
  const membership=await requireEnterpriseMembership(session,organizationId);if(!membership||membership.organization.sectorCode!=="HEALTH_CARE")return null;
  if(!(await canAccessEnterpriseModule(session.userId,organizationId,"INTERNAL_PHARMACY",action)))return null;
  const permissions=await getHealthStaffMedicalPermissions(session.userId,organizationId),manager=ENTERPRISE_MANAGER_ROLES.has(membership.role),has=(permission:string)=>manager||permissions.includes(permission);
  return {membership,canViewSensitive:permissions.includes("health.pharmacy.view_sensitive"),canCreate:has("health.pharmacy.create_product"),canUpdate:has("health.pharmacy.update_product"),canArchive:has("health.pharmacy.archive_product"),canManageBatches:has("health.pharmacy.manage_batches"),canStockEntry:has("health.pharmacy.stock_entry"),canStockExit:has("health.pharmacy.stock_exit"),canDispense:has("health.pharmacy.dispense"),canAdjust:has("health.pharmacy.adjust_stock"),canAuthorizeSensitive:permissions.includes("health.pharmacy.authorize_sensitive_exit"),canViewMovements:has("health.pharmacy.view_movements")};
}
