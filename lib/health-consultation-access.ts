import { canAccessEnterpriseModule, ENTERPRISE_MANAGER_ROLES, requireEnterpriseMembership } from "@/lib/enterprise-sector-templates";
import type { SessionPayload } from "@/lib/session";

export async function getHealthConsultationAccess({ session, organizationId, action }: { session: SessionPayload; organizationId: string; action: "read" | "submit" | "write" | "manage" }) {
  const membership = await requireEnterpriseMembership(session, organizationId);
  if (!membership || membership.organization.sectorCode !== "HEALTH_CARE") return null;
  if (!(await canAccessEnterpriseModule(session.userId, organizationId, "CONSULTATIONS", action))) return null;
  const canManage = ENTERPRISE_MANAGER_ROLES.has(membership.role);
  return {
    membership,
    canCreate: canManage,
    canUpdate: canManage,
    canClose: canManage,
    canReopen: canManage,
    canCancel: canManage,
    canViewSensitive: canManage,
  };
}
