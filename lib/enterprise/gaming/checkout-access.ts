import { resolveEnterpriseModuleCapabilities } from "@/lib/enterprise/module-access";

export type CheckoutDependencyAction = "read" | "create" | "write" | "submit" | "approve" | "post" | "manage";

function allowed(capabilities: Awaited<ReturnType<typeof resolveEnterpriseModuleCapabilities>>, action: CheckoutDependencyAction) {
  if (action === "read") return capabilities.canRead;
  if (action === "create") return capabilities.canCreate;
  if (action === "write") return capabilities.canWrite;
  if (action === "submit") return capabilities.canSubmit;
  if (action === "approve") return capabilities.canApprove;
  if (action === "post") return capabilities.canPost;
  return capabilities.canManage;
}

export async function hasEnterpriseModuleActions(
  userId: string,
  organizationId: string,
  requirements: Array<{ moduleCode: string; action: CheckoutDependencyAction }>,
) {
  const moduleCodes = Array.from(new Set(requirements.map((item) => item.moduleCode)));
  const entries = await Promise.all(moduleCodes.map(async (moduleCode) => [moduleCode, await resolveEnterpriseModuleCapabilities({ userId, organizationId, moduleCode })] as const));
  const byCode = new Map(entries);
  return requirements.every((requirement) => {
    const capabilities = byCode.get(requirement.moduleCode);
    return capabilities ? allowed(capabilities, requirement.action) : false;
  });
}
