import { resolveEnterpriseModuleAccess } from "@/lib/enterprise/module-access";

export async function requireEnterpriseGovernanceAccess(userId: string, organizationId: string) {
  const decision = await resolveEnterpriseModuleAccess({ userId, organizationId, moduleCode: "ADMIN_DASHBOARD", action: "manage" });
  return decision.allowed ? decision : null;
}
