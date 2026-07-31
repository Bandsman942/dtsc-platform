import { resolveEnterpriseModuleAccess, type EnterpriseModuleAction } from "@/lib/enterprise/module-access";
import type { SessionPayload } from "@/lib/session";

export async function getEnterpriseCommonDomainAccess({
  session,
  organizationId,
  moduleCode,
  action = "read",
}: {
  session: SessionPayload;
  organizationId: string;
  moduleCode: string;
  action?: EnterpriseModuleAction;
}) {
  const decision = await resolveEnterpriseModuleAccess({
    userId: session.userId,
    organizationId,
    moduleCode,
    action,
  });
  if (!decision.allowed) return null;
  return {
    decision,
    canManage: action === "manage" || (await resolveEnterpriseModuleAccess({
      userId: session.userId,
      organizationId,
      moduleCode,
      action: "manage",
    })).allowed,
  };
}
