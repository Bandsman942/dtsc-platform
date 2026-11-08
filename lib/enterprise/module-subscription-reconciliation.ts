import { Prisma } from "@prisma/client";
import { planMeetsRequirement, resolveSaasPlanCode, type SaasPlanCode } from "@/lib/billing/plans";
import {
  getEnterpriseModuleDefinition,
  isEnterpriseModuleImplemented,
  isEnterpriseModuleSectorCompatible,
  isEnterpriseModuleBusinessSubtypeCompatible,
  listEnterpriseModuleDefinitions,
  normalizeEnterpriseModuleCode,
  type EnterpriseModuleDefinition,
} from "@/lib/enterprise/module-registry";
import { compareEnterpriseModuleDefinitions } from "@/lib/enterprise/module-order";
import { syncRetailOperatorProvidersTx } from "@/lib/enterprise/retail/provisioning";
import {
  isRetailOptionalExtensionModule,
  retailExtensionShouldBeEnabled,
  withRetailExtensionPreference,
} from "@/lib/enterprise/retail/extension-policy";
import { prisma } from "@/lib/prisma";

export class EnterpriseModuleConfigurationError extends Error {
  status: number;
  code: string;
  details: string[];

  constructor(code: string, message: string, status = 409, details: string[] = []) {
    super(message);
    this.name = "EnterpriseModuleConfigurationError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

type ModuleContext = {
  organization: {
    id: string;
    status: string;
    organizationType: string;
    sectorCode: string | null;
  };
  planCode: SaasPlanCode;
  subscriptionActive: boolean;
  tenantModules: Array<{ id: string; moduleCode: string; isEnabled: boolean }>;
  businessSubtypeCode: string | null;
  retailSettings: Prisma.JsonValue | null;
};

function isCurrentSubscriptionActive(subscription?: {
  status?: string | null;
  expiresAt?: Date | null;
  trialEndsAt?: Date | null;
} | null) {
  if (!subscription || (subscription.status !== "ACTIVE" && subscription.status !== "TRIAL")) return false;
  const now = Date.now();
  if (subscription.expiresAt && subscription.expiresAt.getTime() < now) return false;
  if (subscription.status === "TRIAL" && subscription.trialEndsAt && subscription.trialEndsAt.getTime() < now) return false;
  return true;
}

async function getModuleContext(organizationId: string): Promise<ModuleContext> {
  const organization = await prisma.organization.findFirst({
    where: { id: organizationId, deletedAt: null },
    select: {
      id: true,
      status: true,
      organizationType: true,
      sectorCode: true,
      enterpriseModules: { select: { id: true, moduleCode: true, isEnabled: true } },
      subscriptions: {
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
        take: 1,
        include: { plan: { select: { slug: true, name: true } } },
      },
    },
  });
  if (!organization || organization.organizationType !== "CLIENT") {
    throw new EnterpriseModuleConfigurationError(
      "ORGANIZATION_NOT_AVAILABLE",
      "L’entreprise sélectionnée est introuvable ou ne peut pas recevoir de modules ERP.",
      404,
    );
  }
  const [retailConfiguration, selection] = await Promise.all([
    organization.sectorCode === "COMMERCE_RETAIL"
      ? prisma.enterpriseRetailConfiguration.findUnique({ where: { organizationId }, select: { settingsJson: true } })
      : Promise.resolve(null),
    prisma.enterpriseBusinessSubtypeSelection.findUnique({
      where: { organizationId },
      select: { sectorCode: true, businessSubtypeCode: true },
    }),
  ]);
  const subscription = organization.subscriptions[0] || null;
  return {
    organization: {
      id: organization.id,
      status: organization.status,
      organizationType: organization.organizationType,
      sectorCode: organization.sectorCode,
    },
    planCode: resolveSaasPlanCode(subscription?.plan),
    subscriptionActive: isCurrentSubscriptionActive(subscription),
    tenantModules: organization.enterpriseModules,
    businessSubtypeCode: selection?.sectorCode === organization.sectorCode ? selection.businessSubtypeCode : null,
    retailSettings: retailConfiguration?.settingsJson ?? null,
  };
}

function commercialAvailability(definition: EnterpriseModuleDefinition, context: ModuleContext) {
  if (context.organization.status !== "ACTIVE") {
    return "L’espace entreprise doit être actif avant d’ouvrir ce module.";
  }
  if (!isEnterpriseModuleImplemented(definition.code) || definition.routeKind === "HIDDEN") {
    return "Ce module n’est pas encore proposé dans DTSC Platform.";
  }
  if (!isEnterpriseModuleSectorCompatible(definition, context.organization.sectorCode)) {
    return "Ce module ne correspond pas au secteur de l’entreprise sélectionnée.";
  }
  if (!isEnterpriseModuleBusinessSubtypeCompatible(definition, context.businessSubtypeCode)) {
    return "Ce module n'est pas compatible avec le sous-secteur sélectionné.";
  }
  if (!planMeetsRequirement(context.planCode, definition.minimumPlan)) {
    return `Ce module nécessite une offre supérieure à l’abonnement actuel.`;
  }
  if (definition.requiresActiveSubscription && !context.subscriptionActive) {
    return "Un abonnement actif est nécessaire pour utiliser ce module.";
  }
  return null;
}

function collectDependencyDefinitions(moduleCode: string) {
  const collected = new Map<string, EnterpriseModuleDefinition>();
  const visiting = new Set<string>();

  function visit(code: string) {
    const canonicalCode = normalizeEnterpriseModuleCode(code);
    if (collected.has(canonicalCode)) return;
    if (visiting.has(canonicalCode)) {
      throw new EnterpriseModuleConfigurationError(
        "MODULE_DEPENDENCY_CYCLE",
        "Une dépendance circulaire empêche l’activation automatique des modules.",
      );
    }
    const definition = getEnterpriseModuleDefinition(canonicalCode);
    if (!definition) {
      throw new EnterpriseModuleConfigurationError(
        "UNKNOWN_MODULE_DEPENDENCY",
        "Une dépendance de module n’existe plus dans le catalogue DTSC.",
      );
    }
    visiting.add(canonicalCode);
    for (const dependencyCode of definition.dependencies) visit(dependencyCode);
    visiting.delete(canonicalCode);
    collected.set(canonicalCode, definition);
  }

  visit(moduleCode);
  return Array.from(collected.values()).sort(compareEnterpriseModuleDefinitions);
}

function moduleWriteData(definition: EnterpriseModuleDefinition, organizationId: string, isEnabled: boolean) {
  return {
    organizationId,
    sectorId: null,
    moduleCode: definition.code,
    labelFr: definition.labelFr,
    labelEn: definition.labelEn,
    descriptionFr: definition.descriptionFr,
    descriptionEn: definition.descriptionEn,
    moduleCategory: definition.domain,
    icon: definition.iconKey,
    isEnabled,
    isCore: !isRetailOptionalExtensionModule(definition.code) && (definition.routeKind === "DEDICATED_CORE" || definition.routeKind === "AI_SERVICE"),
    sourceTemplateId: null,
    requiresPlanLevel: definition.minimumPlan,
    sortOrder: definition.navigationOrder,
  };
}

/** Atomic policy intent alongside the existing EnterpriseModule projection; no second module catalogue. */
async function persistRetailExtensionChoice(
  tx: Prisma.TransactionClient,
  organizationId: string,
  moduleCode: string,
  enabled: boolean,
) {
  if (!isRetailOptionalExtensionModule(moduleCode)) return;
  await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseRetailConfiguration" WHERE "organizationId" = ${organizationId} FOR UPDATE`);
  const configuration = await tx.enterpriseRetailConfiguration.findUnique({
    where: { organizationId },
    select: { settingsJson: true },
  });
  if (!configuration) {
    throw new EnterpriseModuleConfigurationError("RETAIL_CONFIGURATION_REQUIRED", "Configurez d'abord le commerce de détail avant d'activer ses extensions.", 409);
  }
  if (!enabled) {
    const sourceEntityType = moduleCode === "MOBILE_MONEY_AGENCY" ? "PENDING_MOBILE_MONEY" : "PENDING_TELCO_TOPUP";
    const inFlight = await tx.enterpriseRetailProviderOperation.count({
      where: { organizationId, sourceEntityType, status: { in: ["INITIATED", "PENDING_PROVIDER", "UNKNOWN"] } },
    });
    if (inFlight) {
      throw new EnterpriseModuleConfigurationError("RETAIL_EXTENSION_PENDING_OPERATIONS", "Réconciliez les opérations opérateur en cours avant de désactiver ce service.", 409);
    }
  }
  await tx.enterpriseRetailConfiguration.update({
    where: { organizationId },
    data: {
      settingsJson: withRetailExtensionPreference(configuration.settingsJson, moduleCode, enabled),
      revision: { increment: 1 },
    },
  });
}

export async function activateEnterpriseModule({
  organizationId,
  moduleCode,
  activateDependencies,
}: {
  organizationId: string;
  moduleCode: string;
  activateDependencies: boolean;
}) {
  const context = await getModuleContext(organizationId);
  const definitions = collectDependencyDefinitions(moduleCode);
  const requestedDefinition = definitions.find((definition) => definition.code === normalizeEnterpriseModuleCode(moduleCode));
  if (!requestedDefinition) {
    throw new EnterpriseModuleConfigurationError("UNKNOWN_MODULE", "Le module demandé est introuvable.", 404);
  }

  const unavailable = definitions
    .map((definition) => ({ definition, reason: commercialAvailability(definition, context) }))
    .filter((item): item is { definition: EnterpriseModuleDefinition; reason: string } => Boolean(item.reason));
  if (unavailable.length) {
    throw new EnterpriseModuleConfigurationError(
      "MODULE_NOT_INCLUDED_IN_SUBSCRIPTION",
      `L’abonnement actuel ne permet pas d’activer ${requestedDefinition.labelFr}.`,
      402,
      unavailable.map((item) => `${item.definition.labelFr} : ${item.reason}`),
    );
  }

  const enabledCodes = new Set(
    context.tenantModules
      .filter((tenantModule) => tenantModule.isEnabled)
      .map((tenantModule) => normalizeEnterpriseModuleCode(tenantModule.moduleCode)),
  );
  const inactiveDependencies = definitions.filter(
    (definition) => definition.code !== requestedDefinition.code && !enabledCodes.has(definition.code),
  );
  if (inactiveDependencies.length && !activateDependencies) {
    throw new EnterpriseModuleConfigurationError(
      "MODULE_DEPENDENCIES_REQUIRED",
      `Activez d’abord les prérequis de ${requestedDefinition.labelFr}.`,
      409,
      inactiveDependencies.map((definition) => definition.labelFr),
    );
  }

  const definitionsToEnable = activateDependencies ? definitions : [requestedDefinition];
  await prisma.$transaction(async (tx) => {
    for (const definition of definitionsToEnable) {
      const data = moduleWriteData(definition, organizationId, true);
      await tx.enterpriseModule.upsert({
        where: { organizationId_moduleCode: { organizationId, moduleCode: definition.code } },
        update: {
          labelFr: data.labelFr,
          labelEn: data.labelEn,
          descriptionFr: data.descriptionFr,
          descriptionEn: data.descriptionEn,
          moduleCategory: data.moduleCategory,
          icon: data.icon,
          isEnabled: true,
          isCore: data.isCore,
          requiresPlanLevel: data.requiresPlanLevel,
          sortOrder: data.sortOrder,
        },
        create: data,
      });
    }
    await persistRetailExtensionChoice(tx, organizationId, requestedDefinition.code, true);
    await syncRetailOperatorProvidersTx(tx, organizationId);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  return {
    requestedModule: requestedDefinition.code,
    activatedModules: definitionsToEnable.map((definition) => definition.code),
    recommendedIntegrations: [...(requestedDefinition.recommendedIntegrations || [])],
  };
}

export async function disableEnterpriseModule({ organizationId, moduleCode }: { organizationId: string; moduleCode: string }) {
  const context = await getModuleContext(organizationId);
  const canonicalCode = normalizeEnterpriseModuleCode(moduleCode);
  const activeDependents = listEnterpriseModuleDefinitions({ statuses: ["ACTIVE", "BETA"] })
    .filter((definition) => definition.dependencies.map(normalizeEnterpriseModuleCode).includes(canonicalCode))
    .filter((definition) => context.tenantModules.some(
      (tenantModule) => tenantModule.isEnabled && normalizeEnterpriseModuleCode(tenantModule.moduleCode) === definition.code,
    ));
  if (activeDependents.length) {
    throw new EnterpriseModuleConfigurationError(
      "ACTIVE_DEPENDENTS",
      "Ce module reste nécessaire au fonctionnement d’autres services actifs.",
      409,
      activeDependents.map((definition) => definition.labelFr),
    );
  }
  await prisma.$transaction(async (tx) => {
    await persistRetailExtensionChoice(tx, organizationId, canonicalCode, false);
    await tx.enterpriseModule.updateMany({
      where: { organizationId, moduleCode: { in: [moduleCode, canonicalCode] } },
      data: { isEnabled: false },
    });
    await syncRetailOperatorProvidersTx(tx, organizationId);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  return { disabledModule: canonicalCode };
}

export async function reconcileOrganizationModulesWithSubscription(organizationId: string) {
  const context = await getModuleContext(organizationId);
  const definitions = listEnterpriseModuleDefinitions({
    statuses: ["ACTIVE", "BETA"],
    sectorCode: context.organization.sectorCode,
  })
    .filter((definition) => definition.routeKind !== "ADMIN_SECTION" && definition.routeKind !== "HIDDEN")
    .sort(compareEnterpriseModuleDefinitions);

  const eligibleCodes = new Set(
    definitions
      .filter((definition) => !commercialAvailability(definition, context))
      .filter((definition) => retailExtensionShouldBeEnabled(
        context.retailSettings,
        definition.code,
        context.tenantModules.some((row) => normalizeEnterpriseModuleCode(row.moduleCode) === definition.code && row.isEnabled),
      ))
      .map((definition) => definition.code),
  );
  let changed = true;
  while (changed) {
    changed = false;
    for (const definition of definitions) {
      if (!eligibleCodes.has(definition.code)) continue;
      if (definition.dependencies.some((dependencyCode) => !eligibleCodes.has(normalizeEnterpriseModuleCode(dependencyCode)))) {
        eligibleCodes.delete(definition.code);
        changed = true;
      }
    }
  }

  const canonicalCodes = new Set(definitions.map((definition) => definition.code));
  const rowsToDisable = context.tenantModules
    .filter((tenantModule) => {
      const canonicalCode = normalizeEnterpriseModuleCode(tenantModule.moduleCode);
      const definition = getEnterpriseModuleDefinition(canonicalCode);
      return (
        tenantModule.isEnabled &&
        (!definition ||
          tenantModule.moduleCode !== canonicalCode ||
          !canonicalCodes.has(canonicalCode) ||
          !eligibleCodes.has(canonicalCode))
      );
    })
    .map((tenantModule) => tenantModule.id);

  await prisma.$transaction(async (tx) => {
    for (const definition of definitions) {
      const data = moduleWriteData(definition, organizationId, eligibleCodes.has(definition.code));
      await tx.enterpriseModule.upsert({
        where: { organizationId_moduleCode: { organizationId, moduleCode: definition.code } },
        update: {
          labelFr: data.labelFr,
          labelEn: data.labelEn,
          descriptionFr: data.descriptionFr,
          descriptionEn: data.descriptionEn,
          moduleCategory: data.moduleCategory,
          icon: data.icon,
          isEnabled: data.isEnabled,
          isCore: data.isCore,
          requiresPlanLevel: data.requiresPlanLevel,
          sortOrder: data.sortOrder,
        },
        create: data,
      });
    }
    await tx.enterpriseModule.updateMany({
      where: { id: { in: rowsToDisable } },
      data: { isEnabled: false },
    });
    await syncRetailOperatorProvidersTx(tx, organizationId);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  return {
    planCode: context.planCode,
    subscriptionActive: context.subscriptionActive,
    enabledModuleCodes: Array.from(eligibleCodes),
    disabledLegacyOrExcludedRows: rowsToDisable.length,
  };
}
