import type { UserRole } from "@prisma/client";
import { planMeetsRequirement, type SaasPlanCode } from "@/lib/billing/plans";
import {
  getStandardModuleDefinition,
  type StandardModuleAccessPolicy,
  type StandardModuleDefinition,
} from "@/lib/modules/standard-module-registry";

export type StandardModuleCapability =
  | "canView"
  | "canCreate"
  | "canUpdate"
  | "canDelete"
  | "canArchive"
  | "canRestore"
  | "canInvite"
  | "canComment"
  | "canModerate"
  | "canUpload"
  | "canDownload"
  | "canExport"
  | "canCall"
  | "canConfigure"
  | "canManage"
  | "canSubmit"
  | "canApprove"
  | "canReject"
  | "canRetry";

export type StandardModuleAccessDecision = {
  allowed: boolean;
  reasonCode: string;
  messageFr: string;
  canonicalModuleCode: string | null;
  requiredPlan?: SaasPlanCode | null;
  missingDependencies?: string[];
  capabilities?: Record<StandardModuleCapability, boolean>;
};

export type StandardModuleAccessInput = {
  moduleCode: string;
  action?: StandardModuleCapability;
  authenticated: boolean;
  role?: UserRole | null;
  activeContext?: "DTSC_INTERNAL" | "ORGANIZATION" | "GLOBAL_CLIENT" | "COMMUNITY" | null;
  activeOrganizationId?: string | null;
  hasActiveMembership?: boolean;
  positionCode?: string | null;
  permissions?: Iterable<string>;
  planCode?: SaasPlanCode | null;
  subscriptionActive?: boolean;
  satisfiedDependencies?: Iterable<string>;
  isOwner?: boolean;
};

const ALL_CAPABILITIES: StandardModuleCapability[] = [
  "canView", "canCreate", "canUpdate", "canDelete", "canArchive", "canRestore",
  "canInvite", "canComment", "canModerate", "canUpload", "canDownload", "canExport",
  "canCall", "canConfigure", "canManage", "canSubmit", "canApprove", "canReject", "canRetry",
];

function denied(definition: StandardModuleDefinition | null, reasonCode: string, messageFr: string, extra?: Partial<StandardModuleAccessDecision>): StandardModuleAccessDecision {
  return {
    allowed: false,
    reasonCode,
    messageFr,
    canonicalModuleCode: definition?.code || null,
    capabilities: Object.fromEntries(ALL_CAPABILITIES.map((capability) => [capability, false])) as Record<StandardModuleCapability, boolean>,
    ...extra,
  };
}

function hasPermission(definition: StandardModuleDefinition, permissions: Set<string>, capability: StandardModuleCapability) {
  if (!definition.permissionPrefixes.length) return capability === "canView";
  const suffixes = new Set([
    "*",
    capability.replace(/^can/, "").toUpperCase(),
    capability === "canView" ? "VIEW" : "",
    capability === "canManage" ? "MANAGE" : "",
  ].filter(Boolean));
  return definition.permissionPrefixes.some((prefix) =>
    permissions.has(prefix)
    || Array.from(suffixes).some((suffix) => permissions.has(`${prefix}_${suffix}`) || permissions.has(`${prefix}:${suffix.toLowerCase()}`)),
  );
}

function policyAllows(policy: StandardModuleAccessPolicy, input: StandardModuleAccessInput) {
  if (policy === "PUBLIC") return true;
  if (policy === "EXPLICIT_DENY") return false;
  if (!input.authenticated) return false;
  if (policy === "AUTHENTICATED") return true;
  if (policy === "ORGANIZATION_MEMBERSHIP") {
    return input.activeContext === "ORGANIZATION" && Boolean(input.activeOrganizationId && input.hasActiveMembership);
  }
  if (policy === "POSITION_PERMISSION") {
    if (input.activeContext === "DTSC_INTERNAL") return Boolean(input.positionCode || input.role === "ADMIN");
    return input.activeContext === "ORGANIZATION"
      && Boolean(input.activeOrganizationId && input.hasActiveMembership && input.positionCode);
  }
  if (policy === "GLOBAL_ROLE") return input.role === "ADMIN" || input.role === "SUPPORT" || input.role === "MANAGER";
  if (policy === "ADMIN_BLOCK") {
    if (input.activeContext === "DTSC_INTERNAL") return input.role === "ADMIN" || Boolean(input.positionCode);
    return input.activeContext === "ORGANIZATION"
      && Boolean(input.activeOrganizationId && input.hasActiveMembership && (input.isOwner || input.positionCode));
  }
  return false;
}

export function resolveStandardModuleAccess(input: StandardModuleAccessInput): StandardModuleAccessDecision {
  const definition = getStandardModuleDefinition(input.moduleCode);
  if (!definition) return denied(null, "STANDARD_MODULE_UNKNOWN", "Ce module standard n’est pas reconnu.");
  if (definition.implementationStatus === "HIDDEN" || definition.implementationStatus === "RETIRED") {
    return denied(definition, "STANDARD_MODULE_NOT_VISIBLE", "Ce module n’est pas disponible dans la navigation.");
  }
  if (definition.implementationStatus === "PLANNED") {
    return denied(definition, "STANDARD_MODULE_PLANNED", "Ce module est planifié mais n’est pas encore opérationnel.");
  }
  if (definition.implementationStatus === "DEPRECATED") {
    return denied(definition, "STANDARD_MODULE_DEPRECATED", "Ce module a été remplacé par une surface plus récente.");
  }
  if (!policyAllows(definition.accessPolicy, input)) {
    return denied(definition, input.authenticated ? "STANDARD_MODULE_FORBIDDEN" : "STANDARD_MODULE_AUTHENTICATION_REQUIRED", input.authenticated
      ? "Vous n’avez pas l’autorisation d’accéder à ce module."
      : "Connectez-vous pour accéder à ce module.");
  }
  if (definition.requiresActiveSubscription && input.subscriptionActive === false) {
    return denied(definition, "STANDARD_MODULE_SUBSCRIPTION_INACTIVE", "L’abonnement de l’entreprise doit être actif pour ouvrir ce module.", { requiredPlan: definition.minimumPlan });
  }
  if (definition.minimumPlan && (!input.planCode || !planMeetsRequirement(input.planCode, definition.minimumPlan))) {
    return denied(definition, "STANDARD_MODULE_PLAN_INSUFFICIENT", "Le plan actuel ne permet pas d’utiliser ce module.", { requiredPlan: definition.minimumPlan });
  }
  const satisfiedDependencies = new Set(input.satisfiedDependencies || []);
  const missingDependencies = definition.dependencies.filter((dependency) => !satisfiedDependencies.has(dependency));
  if (missingDependencies.length) {
    return denied(definition, "STANDARD_MODULE_DEPENDENCY_MISSING", "Une dépendance obligatoire doit être activée avant ce module.", { missingDependencies });
  }

  const permissions = new Set(input.permissions || []);
  const capabilities = Object.fromEntries(ALL_CAPABILITIES.map((capability) => [capability, hasPermission(definition, permissions, capability)])) as Record<StandardModuleCapability, boolean>;
  capabilities.canView = true;
  if (definition.accessPolicy === "PUBLIC" || definition.accessPolicy === "AUTHENTICATED" || definition.accessPolicy === "ORGANIZATION_MEMBERSHIP") {
    capabilities.canComment = true;
  }
  if (input.role === "ADMIN" && input.activeContext === "DTSC_INTERNAL") {
    for (const capability of ALL_CAPABILITIES) capabilities[capability] = true;
  }
  if (input.isOwner && input.activeContext === "ORGANIZATION" && input.hasActiveMembership) {
    for (const capability of ALL_CAPABILITIES) capabilities[capability] = true;
  }

  const requestedAction = input.action || "canView";
  if (!capabilities[requestedAction]) {
    return denied(definition, "STANDARD_MODULE_CAPABILITY_DENIED", "Cette action n’est pas autorisée dans ce module.", { capabilities });
  }

  return {
    allowed: true,
    reasonCode: "STANDARD_MODULE_ALLOWED",
    messageFr: "Accès autorisé.",
    canonicalModuleCode: definition.code,
    requiredPlan: definition.minimumPlan,
    missingDependencies: [],
    capabilities,
  };
}
