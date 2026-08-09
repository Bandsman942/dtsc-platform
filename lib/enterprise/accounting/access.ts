import { requireEnterpriseMembership } from "@/lib/enterprise-sector-templates";
import { resolveEnterpriseModuleCapabilities, type EnterpriseModuleCapabilities } from "@/lib/enterprise/module-access";
import type { SessionPayload } from "@/lib/session";
import {
  FINANCE_PERMISSION_PREFIX_BY_MODULE,
  type EnterpriseFinanceAction,
  type EnterpriseFinanceModuleCode,
} from "@/lib/enterprise/accounting/constants";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";
import { ensureCanonicalFinanceModulesForOrganization } from "@/lib/enterprise/finance-modules";

function financeActionAllowed(capabilities: EnterpriseModuleCapabilities, action: EnterpriseFinanceAction) {
  if (action === "view" || action === "export") return capabilities.canRead;
  if (action === "create") return capabilities.canCreate;
  if (action === "submit") return capabilities.canSubmit;
  if (action === "update" || action === "pay") return capabilities.canWrite;
  if (action === "review" || action === "approve") return capabilities.canApprove;
  if (action === "view_sensitive") return capabilities.canApprove || capabilities.canManage;
  return capabilities.canManage;
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

  await ensureCanonicalFinanceModulesForOrganization({ organizationId });

  const capabilities = await resolveEnterpriseModuleCapabilities({
    userId: session.userId,
    organizationId,
    moduleCode,
  });
  if (!financeActionAllowed(capabilities, action)) return null;

  const permissionPrefix = FINANCE_PERMISSION_PREFIX_BY_MODULE[moduleCode];
  const canSeeAll = capabilities.canApprove || capabilities.canManage;

  return {
    membership,
    capabilities,
    moduleCode,
    action,
    permissionKey: `${permissionPrefix}${action}`,
    canSeeAll,
    canManage: capabilities.canManage,
    canCreate: capabilities.canCreate,
    canWrite: capabilities.canWrite,
    canApprove: capabilities.canApprove,
    canViewSensitive: canSeeAll,
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
