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

  const [writeDecision, manageDecision] = await Promise.all([
    action === "write" || action === "manage"
      ? Promise.resolve(decision)
      : resolveEnterpriseModuleAccess({ userId: session.userId, organizationId, moduleCode, action: "write" }),
    action === "manage"
      ? Promise.resolve(decision)
      : resolveEnterpriseModuleAccess({ userId: session.userId, organizationId, moduleCode, action: "manage" }),
  ]);

  const canManage = action === "manage" || manageDecision.allowed;
  const canWrite = action === "write" || action === "manage" || writeDecision.allowed || canManage;

  return {
    decision,
    canWrite,
    canManage,
  };
}
