import { getEnterpriseModuleDefinition, normalizeEnterpriseModuleCode } from "@/lib/enterprise/module-registry";
import { prisma } from "@/lib/prisma";

export type EnterpriseGuidedCapabilityAction = "read" | "submit" | "write" | "approve" | "manage";
export type EnterpriseGuidedCapability = { moduleCode: string; actions: EnterpriseGuidedCapabilityAction[] };

const permissionSuffixByAction: Record<EnterpriseGuidedCapabilityAction, string> = {
  read: "view",
  submit: "create",
  write: "update",
  approve: "approve",
  manage: "manage",
};

export async function deriveTenantPermissionsFromCapabilities({
  organizationId,
  capabilities,
}: {
  organizationId: string;
  capabilities: EnterpriseGuidedCapability[];
}) {
  const tenantModules = await prisma.enterpriseModule.findMany({
    where: { organizationId, isEnabled: true },
    select: { moduleCode: true },
  });
  const enabledCodes = new Set(tenantModules.map((module) => normalizeEnterpriseModuleCode(module.moduleCode)));
  const moduleCodes: string[] = [];
  const permissions: string[] = [];

  for (const capability of capabilities) {
    const canonicalCode = normalizeEnterpriseModuleCode(capability.moduleCode);
    const definition = getEnterpriseModuleDefinition(canonicalCode);
    if (!definition || !enabledCodes.has(canonicalCode) || definition.routeKind === "ADMIN_SECTION" || definition.accessPolicy === "EXPLICIT_DENY") {
      const error = new Error("MODULE_NOT_ALLOWED");
      Object.assign(error, { code: "MODULE_NOT_ALLOWED", moduleCode: canonicalCode });
      throw error;
    }
    if (!definition.permissionPrefixes.length) {
      const error = new Error("MODULE_HAS_NO_DELEGABLE_PERMISSIONS");
      Object.assign(error, { code: "MODULE_HAS_NO_DELEGABLE_PERMISSIONS", moduleCode: canonicalCode });
      throw error;
    }
    moduleCodes.push(canonicalCode);
    for (const action of capability.actions) {
      const suffix = permissionSuffixByAction[action];
      for (const prefix of definition.permissionPrefixes) permissions.push(`${prefix}${suffix}`);
    }
  }

  return {
    modules: Array.from(new Set(moduleCodes)),
    permissions: Array.from(new Set(permissions)),
  };
}
