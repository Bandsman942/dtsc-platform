import { canAccessEnterpriseModule, ENTERPRISE_MANAGER_ROLES, requireEnterpriseMembership } from "@/lib/enterprise-sector-templates";
import type { SessionPayload } from "@/lib/session";
import {
  FINANCE_PERMISSION_PREFIX_BY_MODULE,
  type EnterpriseFinanceAction,
  type EnterpriseFinanceModuleCode,
} from "@/lib/enterprise/accounting/constants";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";
import { ensureCanonicalFinanceModulesForOrganization } from "@/lib/enterprise/finance-modules";

const READ_ACTIONS = new Set<EnterpriseFinanceAction>(["view", "view_sensitive", "export"]);
const WRITE_ACTIONS = new Set<EnterpriseFinanceAction>(["create", "update", "submit", "pay"]);

function canonicalAccessAction(action: EnterpriseFinanceAction) {
  if (READ_ACTIONS.has(action)) return "read" as const;
  if (WRITE_ACTIONS.has(action)) return "submit" as const;
  return "manage" as const;
}

export async function getEnterpriseAccountingAccess({
  session,
  organizationId,
  moduleCode,
  action,
}: {
  session: SessionPayload;
  organizationId: string;
  moduleCode: EnterpriseFinanceModuleCode;
  action: EnterpriseFinanceAction;
}) {
  const membership = await requireEnterpriseMembership(session, organizationId);
  if (!membership) return null;
  if (membership.role === "GUEST" && !READ_ACTIONS.has(action)) return null;

  await ensureCanonicalFinanceModulesForOrganization({ organizationId });

  const canonicalAction = canonicalAccessAction(action);
  const moduleAllowed = await canAccessEnterpriseModule(session.userId, organizationId, moduleCode, canonicalAction);
  if (!moduleAllowed) return null;

  const isManager = ENTERPRISE_MANAGER_ROLES.has(membership.role);
  const permissionPrefix = FINANCE_PERMISSION_PREFIX_BY_MODULE[moduleCode];
  const explicitActionAllowed = isManager || await canAccessEnterpriseModule(session.userId, organizationId, moduleCode, canonicalAction);
  if (!explicitActionAllowed) return null;

  return {
    membership,
    moduleCode,
    action,
    permissionKey: `${permissionPrefix}${action}`,
    canSeeAll: isManager || action === "view_sensitive",
    canManage: isManager || canonicalAction === "manage",
    canCreate: membership.role !== "GUEST" && (isManager || canonicalAction !== "read"),
    canViewSensitive: isManager || action === "view_sensitive",
  };
}

export function assertIndependentActor({
  actorUserId,
  relatedUserIds,
  errorCode,
}: {
  actorUserId: string;
  relatedUserIds: Array<string | null | undefined>;
  errorCode: string;
}) {
  if (relatedUserIds.some((value) => value === actorUserId)) {
    throw new EnterpriseAccountingError(errorCode, 409);
  }
}
