import { canAccessEnterpriseModule, ENTERPRISE_MANAGER_ROLES, requireEnterpriseMembership } from "@/lib/enterprise-sector-templates";
import { canEnterpriseRoleUseCoreAction } from "@/lib/enterprise/enterprise-core-permissions";
import type { SessionPayload } from "@/lib/session";

export async function getEnterpriseCoreAccess({
  session,
  organizationId,
  moduleCode,
  action,
}: {
  session: SessionPayload;
  organizationId: string;
  moduleCode: string;
  action: "read" | "submit" | "write" | "manage";
}) {
  const membership = await requireEnterpriseMembership(session, organizationId);
  if (!membership) return null;
  if (!canEnterpriseRoleUseCoreAction(membership.role, action)) return null;
  const allowed = await canAccessEnterpriseModule(session.userId, organizationId, moduleCode, action);
  if (!allowed) return null;
  return {
    membership,
    canSeeAll: ENTERPRISE_MANAGER_ROLES.has(membership.role),
    canManage: ENTERPRISE_MANAGER_ROLES.has(membership.role),
  };
}
