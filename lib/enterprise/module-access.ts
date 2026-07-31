import type { Prisma } from "@prisma/client";
import { getOrganizationEntitlements } from "@/lib/billing/entitlements";
import {
  getEnterpriseModuleDefinition,
  isEnterpriseModuleImplemented,
  isEnterpriseModuleNavigable,
  isEnterpriseModuleSectorCompatible,
  normalizeEnterpriseModuleCode,
  type EnterpriseModuleDefinition,
} from "@/lib/enterprise/module-registry";
import { prisma } from "@/lib/prisma";

export type EnterpriseModuleAction = "read" | "submit" | "write" | "manage";

export type EnterpriseModuleAccessCode =
  | "OK"
  | "UNKNOWN_MODULE"
  | "MODULE_NOT_IMPLEMENTED"
  | "NO_ACTIVE_MEMBERSHIP"
  | "ORGANIZATION_INACTIVE"
  | "ORGANIZATION_NOT_CLIENT"
  | "SECTOR_INCOMPATIBLE"
  | "TENANT_MODULE_MISSING"
  | "TENANT_MODULE_DISABLED"
  | "DEPENDENCY_INACTIVE"
  | "ENTITLEMENT_DENIED"
  | "PERMISSION_DENIED";

export type EnterpriseModuleAccessDecision = {
  allowed: boolean;
  code: EnterpriseModuleAccessCode;
  message: string;
  canonicalCode: string | null;
  definition: EnterpriseModuleDefinition | null;
  tenantModuleId: string | null;
  tenantModuleCode: string | null;
  dependencyCode?: string;
};

type EnterpriseAccessSnapshot = {
  organizationId: string;
  sectorCode: string | null;
  role: string;
  permissions: string[];
  enabledCanonicalCodes: Set<string>;
  tenantModuleByCanonicalCode: Map<string, { id: string; moduleCode: string; isEnabled: boolean }>;
  entitlementByCanonicalCode: Map<string, { allowed: boolean; message: string }>;
};

const ENTERPRISE_ADMIN_ROLES = new Set(["OWNER", "ADMIN_ENTREPRISE", "ADMIN_ENTERPRISE"]);

function denied(
  code: EnterpriseModuleAccessCode,
  message: string,
  definition: EnterpriseModuleDefinition | null,
  tenantModule?: { id: string; moduleCode: string } | null,
  dependencyCode?: string,
): EnterpriseModuleAccessDecision {
  return {
    allowed: false,
    code,
    message,
    canonicalCode: definition?.code || null,
    definition,
    tenantModuleId: tenantModule?.id || null,
    tenantModuleCode: tenantModule?.moduleCode || null,
    dependencyCode,
  };
}

function permissionList(value: Prisma.JsonValue | null | undefined) {
  if (Array.isArray(value)) {
    return value.filter((permission): permission is string => typeof permission === "string");
  }
  if (value && typeof value === "object") {
    const possiblePermissions = (value as Record<string, unknown>).permissions;
    if (Array.isArray(possiblePermissions)) {
      return possiblePermissions.filter((permission): permission is string => typeof permission === "string");
    }
  }
  return [];
}

function permissionMatchesAction(permission: string, action: EnterpriseModuleAction) {
  if (action === "read") {
    return permission.endsWith(".view") || permission.endsWith(".read") || permission.endsWith(".chat") || permission.includes(".view_");
  }
  if (action === "submit") {
    return permission.endsWith(".create") || permission.endsWith(".submit") || permission.endsWith(".chat") || permission.endsWith(".dispense");
  }
  if (action === "write") {
    return permission.endsWith(".create") || permission.endsWith(".update") || permission.endsWith(".validate") || permission.endsWith(".manage") || permission.endsWith(".dispense");
  }
  return permission.endsWith(".manage") || permission.endsWith(".update") || permission.endsWith(".validate");
}

function roleAllowsAction(role: string, action: EnterpriseModuleAction) {
  if (ENTERPRISE_ADMIN_ROLES.has(role)) {
    return true;
  }
  if (role === "MANAGER") {
    return action !== "manage";
  }
  if (role === "MEMBER") {
    return action === "read" || action === "submit";
  }
  if (role === "GUEST") {
    return action === "read";
  }
  return action === "read" || action === "submit";
}

function permissionsAllowAction(
  definition: EnterpriseModuleDefinition,
  permissions: string[],
  action: EnterpriseModuleAction,
) {
  if (permissions.includes("enterprise.admin.manage")) {
    return true;
  }
  if (!definition.permissionPrefixes.length) {
    return definition.accessPolicy === "MEMBERSHIP";
  }
  const relevantPermissions = permissions.filter((permission) =>
    definition.permissionPrefixes.some((prefix) => permission.startsWith(prefix)),
  );
  return relevantPermissions.some((permission) => permissionMatchesAction(permission, action));
}

async function getEnterpriseAccessSnapshot(userId: string, organizationId: string): Promise<EnterpriseAccessSnapshot | null> {
  const [membership, tenantModules, entitlements] = await Promise.all([
    prisma.organizationMember.findFirst({
      where: {
        userId,
        organizationId,
        status: "ACTIVE",
        removedAt: null,
      },
      select: {
        role: true,
        positionId: true,
        positionCode: true,
        organization: {
          select: {
            id: true,
            status: true,
            deletedAt: true,
            organizationType: true,
            sectorCode: true,
          },
        },
      },
    }),
    prisma.enterpriseModule.findMany({
      where: { organizationId },
      select: { id: true, moduleCode: true, isEnabled: true },
    }),
    getOrganizationEntitlements(organizationId),
  ]);

  if (!membership || membership.organization.deletedAt || membership.organization.status !== "ACTIVE" || membership.organization.organizationType !== "CLIENT") {
    return null;
  }

  const position = membership.positionId || membership.positionCode
    ? await prisma.enterprisePosition.findFirst({
        where: {
          organizationId,
          isActive: true,
          OR: [
            ...(membership.positionId ? [{ id: membership.positionId }] : []),
            ...(membership.positionCode ? [{ positionCode: membership.positionCode }] : []),
          ],
        },
        select: { permissionsJson: true },
      })
    : null;

  const tenantModuleByCanonicalCode = new Map<string, { id: string; moduleCode: string; isEnabled: boolean }>();
  const enabledCanonicalCodes = new Set<string>();
  for (const tenantModule of tenantModules) {
    const canonicalCode = normalizeEnterpriseModuleCode(tenantModule.moduleCode);
    const current = tenantModuleByCanonicalCode.get(canonicalCode);
    if (!current || tenantModule.moduleCode === canonicalCode) {
      tenantModuleByCanonicalCode.set(canonicalCode, tenantModule);
    }
    if (tenantModule.isEnabled) {
      enabledCanonicalCodes.add(canonicalCode);
    }
  }

  const entitlementByCanonicalCode = new Map<string, { allowed: boolean; message: string }>();
  for (const entitlement of entitlements?.modules || []) {
    const canonicalCode = normalizeEnterpriseModuleCode(entitlement.moduleCode);
    const current = entitlementByCanonicalCode.get(canonicalCode);
    if (!current || entitlement.moduleCode === canonicalCode) {
      entitlementByCanonicalCode.set(canonicalCode, {
        allowed: entitlement.allowed,
        message: entitlement.message,
      });
    }
  }

  return {
    organizationId,
    sectorCode: membership.organization.sectorCode,
    role: membership.role,
    permissions: permissionList(position?.permissionsJson),
    enabledCanonicalCodes,
    tenantModuleByCanonicalCode,
    entitlementByCanonicalCode,
  };
}

function resolveFromSnapshot(
  snapshot: EnterpriseAccessSnapshot,
  moduleCode: string,
  action: EnterpriseModuleAction,
): EnterpriseModuleAccessDecision {
  const definition = getEnterpriseModuleDefinition(moduleCode);
  if (!definition) {
    return denied("UNKNOWN_MODULE", "Ce code module n’est pas enregistré dans le registre canonique.", null);
  }
  if (!isEnterpriseModuleImplemented(definition.code)) {
    return denied("MODULE_NOT_IMPLEMENTED", "Ce module n’est pas encore disponible dans DTSC Platform.", definition);
  }
  if (!isEnterpriseModuleSectorCompatible(definition, snapshot.sectorCode)) {
    return denied("SECTOR_INCOMPATIBLE", "Ce module n’est pas compatible avec le secteur de l’entreprise active.", definition);
  }
  if (definition.accessPolicy === "EXPLICIT_DENY") {
    return denied("MODULE_NOT_IMPLEMENTED", "Ce module est volontairement masqué.", definition);
  }

  if (definition.routeKind === "ADMIN_SECTION") {
    const adminAllowed = ENTERPRISE_ADMIN_ROLES.has(snapshot.role) || snapshot.permissions.includes("enterprise.admin.manage") || snapshot.permissions.includes("enterprise.admin.members.manage");
    if (!adminAllowed) {
      return denied("PERMISSION_DENIED", "L’administration entreprise exige une autorisation explicite.", definition);
    }
    return {
      allowed: true,
      code: "OK",
      message: "Accès autorisé.",
      canonicalCode: definition.code,
      definition,
      tenantModuleId: null,
      tenantModuleCode: null,
    };
  }

  const tenantModule = snapshot.tenantModuleByCanonicalCode.get(definition.code) || null;
  if (!tenantModule) {
    return denied("TENANT_MODULE_MISSING", "Ce module n’est pas configuré pour l’entreprise active.", definition);
  }
  if (!tenantModule.isEnabled) {
    return denied("TENANT_MODULE_DISABLED", "Ce module est désactivé pour l’entreprise active.", definition, tenantModule);
  }

  for (const dependencyCode of definition.dependencies) {
    if (!snapshot.enabledCanonicalCodes.has(normalizeEnterpriseModuleCode(dependencyCode))) {
      return denied(
        "DEPENDENCY_INACTIVE",
        `La dépendance ${dependencyCode} doit être active avant d’ouvrir ce module.`,
        definition,
        tenantModule,
        dependencyCode,
      );
    }
  }

  const entitlement = snapshot.entitlementByCanonicalCode.get(definition.code);
  if (!entitlement?.allowed) {
    return denied(
      "ENTITLEMENT_DENIED",
      entitlement?.message || "Le plan ou l’abonnement actif ne permet pas d’utiliser ce module.",
      definition,
      tenantModule,
    );
  }

  if (ENTERPRISE_ADMIN_ROLES.has(snapshot.role)) {
    return {
      allowed: true,
      code: "OK",
      message: "Accès autorisé.",
      canonicalCode: definition.code,
      definition,
      tenantModuleId: tenantModule.id,
      tenantModuleCode: tenantModule.moduleCode,
    };
  }

  const allowed = snapshot.permissions.length
    ? permissionsAllowAction(definition, snapshot.permissions, action)
    : roleAllowsAction(snapshot.role, action);
  if (!allowed) {
    return denied("PERMISSION_DENIED", "Votre poste ou votre rôle ne permet pas cette action.", definition, tenantModule);
  }

  return {
    allowed: true,
    code: "OK",
    message: "Accès autorisé.",
    canonicalCode: definition.code,
    definition,
    tenantModuleId: tenantModule.id,
    tenantModuleCode: tenantModule.moduleCode,
  };
}

export async function resolveEnterpriseModuleAccess({
  userId,
  organizationId,
  moduleCode,
  action = "read",
}: {
  userId: string;
  organizationId: string;
  moduleCode: string;
  action?: EnterpriseModuleAction;
}) {
  const definition = getEnterpriseModuleDefinition(moduleCode);
  if (!definition) {
    return denied("UNKNOWN_MODULE", "Ce code module n’est pas enregistré dans le registre canonique.", null);
  }
  const snapshot = await getEnterpriseAccessSnapshot(userId, organizationId);
  if (!snapshot) {
    return denied("NO_ACTIVE_MEMBERSHIP", "Aucun membership actif n’autorise cet accès.", definition);
  }
  return resolveFromSnapshot(snapshot, moduleCode, action);
}

export async function listNavigableEnterpriseModules({
  userId,
  organizationId,
  action = "read",
}: {
  userId: string;
  organizationId: string;
  action?: EnterpriseModuleAction;
}) {
  const snapshot = await getEnterpriseAccessSnapshot(userId, organizationId);
  if (!snapshot) {
    return [];
  }

  return Array.from(snapshot.tenantModuleByCanonicalCode.keys())
    .map((canonicalCode) => resolveFromSnapshot(snapshot, canonicalCode, action))
    .filter((decision) => decision.allowed && decision.definition && isEnterpriseModuleNavigable(decision.definition))
    .sort((left, right) => {
      const leftDefinition = left.definition as EnterpriseModuleDefinition;
      const rightDefinition = right.definition as EnterpriseModuleDefinition;
      return leftDefinition.navigationGroup.localeCompare(rightDefinition.navigationGroup) || leftDefinition.navigationOrder - rightDefinition.navigationOrder;
    });
}

export async function listEnterpriseModuleConfigurationIssues(organizationId: string) {
  const organization = await prisma.organization.findFirst({
    where: { id: organizationId, deletedAt: null },
    select: {
      sectorCode: true,
      enterpriseModules: {
        select: { id: true, moduleCode: true, isEnabled: true },
      },
    },
  });
  if (!organization) {
    return [{ code: "ORGANIZATION_NOT_FOUND", severity: "ERROR", message: "Organisation introuvable." }];
  }

  const enabledCanonicalCodes = new Set(
    organization.enterpriseModules
      .filter((tenantModule) => tenantModule.isEnabled)
      .map((tenantModule) => normalizeEnterpriseModuleCode(tenantModule.moduleCode)),
  );
  const issues: Array<{ code: string; severity: "WARNING" | "ERROR"; moduleCode?: string; message: string }> = [];

  for (const tenantModule of organization.enterpriseModules) {
    const definition = getEnterpriseModuleDefinition(tenantModule.moduleCode);
    if (!definition) {
      issues.push({
        code: "UNKNOWN_TENANT_MODULE",
        severity: tenantModule.isEnabled ? "ERROR" : "WARNING",
        moduleCode: tenantModule.moduleCode,
        message: `Le module tenant ${tenantModule.moduleCode} est absent du registre canonique.`,
      });
      continue;
    }
    if (tenantModule.isEnabled && !isEnterpriseModuleImplemented(definition.code)) {
      issues.push({
        code: "ACTIVE_NOT_IMPLEMENTED",
        severity: "ERROR",
        moduleCode: tenantModule.moduleCode,
        message: `${tenantModule.moduleCode} est actif en base mais ${definition.implementationStatus} dans le registre.`,
      });
    }
    if (tenantModule.isEnabled && !isEnterpriseModuleSectorCompatible(definition, organization.sectorCode)) {
      issues.push({
        code: "SECTOR_INCOMPATIBLE",
        severity: "ERROR",
        moduleCode: tenantModule.moduleCode,
        message: `${tenantModule.moduleCode} est incompatible avec le secteur ${organization.sectorCode || "non renseigné"}.`,
      });
    }
    for (const dependencyCode of definition.dependencies) {
      if (tenantModule.isEnabled && !enabledCanonicalCodes.has(dependencyCode)) {
        issues.push({
          code: "DEPENDENCY_INACTIVE",
          severity: "ERROR",
          moduleCode: tenantModule.moduleCode,
          message: `${tenantModule.moduleCode} dépend de ${dependencyCode}, actuellement inactif.`,
        });
      }
    }
  }

  return issues;
}
