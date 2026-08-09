import { resolveEnterpriseModuleAccess } from "@/lib/enterprise/module-access";

export type EnterpriseModuleCapabilities = {
  canRead: boolean;
  canSubmit: boolean;
  canWrite: boolean;
  canManage: boolean;
};

export async function resolveEnterpriseModuleCapabilities({
  userId,
  organizationId,
  moduleCode,
}: {
  userId: string;
  organizationId: string;
  moduleCode: string;
}): Promise<EnterpriseModuleCapabilities> {
  const [read, submit, write, manage] = await Promise.all([
    resolveEnterpriseModuleAccess({ userId, organizationId, moduleCode, action: "read" }),
    resolveEnterpriseModuleAccess({ userId, organizationId, moduleCode, action: "submit" }),
    resolveEnterpriseModuleAccess({ userId, organizationId, moduleCode, action: "write" }),
    resolveEnterpriseModuleAccess({ userId, organizationId, moduleCode, action: "manage" }),
  ]);
  return {
    canRead: read.allowed,
    canSubmit: submit.allowed,
    canWrite: write.allowed,
    canManage: manage.allowed,
  };
}
