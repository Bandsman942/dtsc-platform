import { canAccessEnterpriseModule } from "@/lib/enterprise-sector-templates";
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
  limits: NonNullable<Awaited<ReturnType<typeof getOrganizationEntitlements>>>["limits"];
  assistantId: string;
  canChat: boolean;
  canUploadSources: boolean;
  canManageSources: boolean;
  canManageSettings: boolean;
  canViewUsage: boolean;
  canUseReadTools: boolean;
  canUseActionDrafts: boolean;
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

  const allowed = await canAccessEnterpriseModule(session.userId, organizationId, ENTERPRISE_AI_MODULE_CODE, enterpriseActionFor(action));
  if (!allowed) {
    return null;
  }

  const [membership, organization, entitlements, assistant, settings] = await Promise.all([
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
    getOrganizationEntitlements(organizationId),
    ensureEnterpriseAiAssistant(organizationId, session.userId),
    prisma.enterpriseAiSetting.findUnique({ where: { organizationId } }),
  ]);

  if (!membership || !organization || !entitlements || !assistant || (settings?.enabled === false && action !== "settings")) {
    return null;
  }

  const manager = isManagerRole(membership.role);
  const admin = isAdminRole(membership.role);
  const settingAllowsReadTools = settings?.allowReadTools !== false;
  const settingAllowsActionDrafts = settings?.allowActionDrafts !== false;

  return {
    organizationId,
    organizationName: organization.name,
    sectorCode: organization.sectorCode,
    role: membership.role,
    planCode: entitlements.planCode,
    limits: entitlements.limits,
    assistantId: assistant.id,
    canChat: true,
    canUploadSources: manager && settings?.allowKnowledgeUpload !== false,
    canManageSources: manager,
    canManageSettings: admin,
    canViewUsage: manager,
    canUseReadTools: entitlements.limits.enterpriseAiReadToolsEnabled && settingAllowsReadTools,
    canUseActionDrafts: entitlements.limits.enterpriseAiActionDraftsEnabled && settingAllowsActionDrafts && manager,
  };
}
