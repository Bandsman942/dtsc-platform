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

  const canAdminister = action === "manage" || manageDecision.allowed;
  const canWrite = action === "write" || action === "manage" || writeDecision.allowed || canAdminister;

  return {
    decision,
    canWrite,
    canAdminister,
    // Historical collection routes expose `canManage` to decide whether CRUD
    // actions are visible. Preserve that contract as "can mutate"; sensitive
    // administration still uses the explicit manage decision server-side.
    canManage: canWrite,
  };
}
