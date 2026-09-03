import { canAccessEnterpriseModule } from "@/lib/enterprise-sector-templates";
import { listNavigableEnterpriseModules } from "@/lib/enterprise/module-access";
import { getEnterpriseModuleDefinition } from "@/lib/enterprise/module-registry";
import { getOrganizationEntitlements } from "@/lib/billing/entitlements";
import { prisma } from "@/lib/prisma";
import type { SessionPayload } from "@/lib/session";

export const ENTERPRISE_AI_MODULE_CODE = "AI_ASSISTANT";

const ENTERPRISE_AI_MANAGER_ROLES = new Set(["OWNER", "ADMIN_ENTREPRISE", "ADMIN_ENTERPRISE", "MANAGER"]);
const ENTERPRISE_AI_ADMIN_ROLES = new Set(["OWNER", "ADMIN_ENTREPRISE", "ADMIN_ENTERPRISE"]);

export type EnterpriseAiAccessAction = "chat" | "read" | "source_create" | "source_manage" | "settings" | "usage";

export type EnterpriseAiAccess = {
  organizationId: string;
  organizationName: string;
  sectorCode: string | null;
  role: string;
  planCode: string;
  offerName: string;
  subscriptionStatus: string;
  dailyMessageLimit: number;
  dailyTokenLimit: number;
  maxKnowledgeSources: number;
  limits: NonNullable<Awaited<ReturnType<typeof getOrganizationEntitlements>>>["limits"];
  assistantId: string;
  canChat: boolean;
  canUploadSources: boolean;
  canManageSources: boolean;
  canManageSettings: boolean;
  canViewUsage: boolean;
  canUseReadTools: boolean;
  canUseActionDrafts: boolean;
  accessibleModuleCodes: string[];
};

function enterpriseActionFor(action: EnterpriseAiAccessAction) {
  if (action === "settings" || action === "source_manage") return "manage" as const;
  if (action === "source_create") return "write" as const;
  return "read" as const;
}

function isManagerRole(role: string) {
  return ENTERPRISE_AI_MANAGER_ROLES.has(role);
}

function isAdminRole(role: string) {
  return ENTERPRISE_AI_ADMIN_ROLES.has(role);
}

async function provisionEssentialAiModuleIfMissing(
  organizationId: string,
  entitlements: NonNullable<Awaited<ReturnType<typeof getOrganizationEntitlements>>>,
) {
  if (!entitlements.subscriptionActive || entitlements.planCode !== "STARTER") return;
  const definition = getEnterpriseModuleDefinition(ENTERPRISE_AI_MODULE_CODE);
  if (!definition || definition.minimumPlan !== "STARTER") return;

  const current = await prisma.enterpriseModule.findUnique({
    where: { organizationId_moduleCode: { organizationId, moduleCode: ENTERPRISE_AI_MODULE_CODE } },
    select: { id: true },
  });
  // A row that already exists is authoritative for tenant enablement. In
  // particular, never turn a deliberately disabled module back on from a read path.
  if (current) return;

  await prisma.enterpriseModule.create({
    data: {
      organizationId,
      sectorId: null,
      moduleCode: definition.code,
      labelFr: definition.labelFr,
      labelEn: definition.labelEn,
      descriptionFr: definition.descriptionFr,
      descriptionEn: definition.descriptionEn,
      moduleCategory: definition.domain,
      icon: definition.iconKey,
      isEnabled: true,
      isCore: true,
      sourceTemplateId: null,
      requiresPlanLevel: definition.minimumPlan,
      sortOrder: definition.navigationOrder,
    },
  }).catch((error) => {
    // Concurrent first access can race on the organization/module unique key.
    // Re-read instead of broadening the write or mutating an existing tenant row.
    return prisma.enterpriseModule.findUnique({
      where: { organizationId_moduleCode: { organizationId, moduleCode: ENTERPRISE_AI_MODULE_CODE } },
      select: { id: true },
    }).then((row) => {
      if (!row) throw error;
      return row;
    });
  });
}

export async function ensureEnterpriseAiAssistant(organizationId: string, userId?: string | null) {
  const organization = await prisma.organization.findFirst({
    where: { id: organizationId, status: "ACTIVE", deletedAt: null, organizationType: "CLIENT" },
    select: { id: true, sectorCode: true },
  });
  if (!organization) return null;

  const assistant = await prisma.enterpriseAiAssistant.upsert({
    where: { organizationId_moduleCode: { organizationId, moduleCode: ENTERPRISE_AI_MODULE_CODE } },
    create: {
      organizationId,
      sectorCode: organization.sectorCode,
      moduleCode: ENTERPRISE_AI_MODULE_CODE,
      createdById: userId || null,
    },
    update: {
      sectorCode: organization.sectorCode,
      status: "ACTIVE",
    },
    select: { id: true },
  });

  await prisma.enterpriseAiSetting.upsert({
    where: { organizationId },
    create: { organizationId, updatedById: userId || null },
    update: {},
  });

  return assistant;
}

export async function getEnterpriseAiAccess(session: SessionPayload, organizationId: string, action: EnterpriseAiAccessAction): Promise<EnterpriseAiAccess | null> {
  if (session.activeContext !== "ORGANIZATION" || session.activeOrganizationId !== organizationId) {
    return null;
  }

  const entitlements = await getOrganizationEntitlements(organizationId);
  if (!entitlements || entitlements.isDtscInternal) return null;
  await provisionEssentialAiModuleIfMissing(organizationId, entitlements);

  const allowed = await canAccessEnterpriseModule(session.userId, organizationId, ENTERPRISE_AI_MODULE_CODE, enterpriseActionFor(action));
  if (!allowed) {
    return null;
  }

  const [membership, organization, assistant, settings] = await Promise.all([
    prisma.organizationMember.findFirst({
      where: {
        organizationId,
        userId: session.userId,
        status: "ACTIVE",
        removedAt: null,
        user: { status: "ACTIVE" },
        organization: { status: "ACTIVE", deletedAt: null, organizationType: "CLIENT" },
      },
      select: { role: true },
    }),
    prisma.organization.findFirst({
      where: { id: organizationId, status: "ACTIVE", deletedAt: null, organizationType: "CLIENT" },
      select: { id: true, name: true, sectorCode: true },
    }),
    ensureEnterpriseAiAssistant(organizationId, session.userId),
    prisma.enterpriseAiSetting.findUnique({ where: { organizationId } }),
  ]);

  if (!membership || !organization || !assistant || (settings?.enabled === false && action !== "settings")) {
    return null;
  }

  const manager = isManagerRole(membership.role);
  const admin = isAdminRole(membership.role);
  const settingAllowsReadTools = settings?.allowReadTools !== false;
  const settingAllowsActionDrafts = settings?.allowActionDrafts !== false;
  const navigableModules = action === "chat"
    ? await listNavigableEnterpriseModules({
        organizationId,
        userId: session.userId,
        action: "read",
      })
    : [];
  const accessibleModuleCodes = navigableModules.flatMap((decision) =>
    decision.definition ? [decision.definition.code] : [],
  );

  return {
    organizationId,
    organizationName: organization.name,
    sectorCode: organization.sectorCode,
    role: membership.role,
    planCode: entitlements.planCode,
    offerName: entitlements.offerName || "Aucune offre organisation active",
    subscriptionStatus: entitlements.subscriptionStatus,
    dailyMessageLimit: entitlements.dailyMessageLimit,
    dailyTokenLimit: entitlements.dailyTokenLimit,
    maxKnowledgeSources: entitlements.maxDocuments,
    limits: entitlements.limits,
    assistantId: assistant.id,
    canChat: true,
    canUploadSources: manager && settings?.allowKnowledgeUpload !== false,
    canManageSources: manager,
    canManageSettings: admin,
    canViewUsage: manager,
    canUseReadTools: entitlements.limits.enterpriseAiReadToolsEnabled && settingAllowsReadTools,
    canUseActionDrafts: entitlements.limits.enterpriseAiActionDraftsEnabled && settingAllowsActionDrafts && manager,
    accessibleModuleCodes,
  };
}
