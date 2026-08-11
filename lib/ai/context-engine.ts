import { createHash } from "node:crypto";
import { resolveAssistantProfile, type AssistantProfile } from "@/lib/ai/assistant-registry";
import type { AiContextCode, AiDataClassification } from "@/lib/ai/types";
import { getCanonicalAiUsageLimits } from "@/lib/billing/ai-usage-limits";
import { listNavigableEnterpriseModules, resolveEnterpriseModuleAccess } from "@/lib/enterprise/module-access";
import { DTSC_INTERNAL_ORGANIZATION_ID } from "@/lib/organizations";
import { prisma } from "@/lib/prisma";

export type AiExecutionContext = {
  userId: string;
  contextCode: AiContextCode;
  profile: AssistantProfile;
  profileResolution: "REQUESTED" | "INFERRED" | "FALLBACK";
  organization: { id: string; name: string; sectorCode: string | null } | null;
  membership: { role: string; positionCode: string | null } | null;
  planCode: string;
  activeModuleCodes: string[];
  requestedModuleCode: string | null;
  canReadClinicalData: boolean;
  contextVersion: string;
  defaultDataClassifications: AiDataClassification[];
};

export class AiExecutionContextError extends Error {
  constructor(public readonly reasonCode: "ORGANIZATION_CONTEXT_REQUIRED" | "ORGANIZATION_ACCESS_DENIED" | "MODULE_CONTEXT_FORBIDDEN") {
    super(reasonCode);
    this.name = "AiExecutionContextError";
  }
}

function shortHash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 20);
}

function defaultClassifications(profile: AssistantProfile, organizationScoped: boolean): AiDataClassification[] {
  if (organizationScoped) return ["CONFIDENTIAL"];
  if (profile.code === "DTSC_GENERAL") return ["INTERNAL"];
  return ["CONFIDENTIAL"];
}

export async function buildAiExecutionContext({
  userId,
  contextCode,
  organizationId,
  requestedAssistantCode,
  requestedModuleCode,
}: {
  userId: string;
  contextCode: AiContextCode;
  organizationId?: string | null;
  requestedAssistantCode?: string | null;
  requestedModuleCode?: string | null;
}): Promise<AiExecutionContext> {
  const organizationScoped = ["DTSC_INTERNAL", "ORGANIZATION", "PROJECT", "MODULE", "OBJECT"].includes(contextCode);
  if (organizationScoped && !organizationId) throw new AiExecutionContextError("ORGANIZATION_CONTEXT_REQUIRED");

  // The internal tenant is a first-class security context. Never let the stable
  // dtsc-internal organization fall through the CLIENT organization branch.
  if (organizationId === DTSC_INTERNAL_ORGANIZATION_ID && contextCode !== "DTSC_INTERNAL") {
    throw new AiExecutionContextError("ORGANIZATION_ACCESS_DENIED");
  }

  if (contextCode === "DTSC_INTERNAL") {
    if (organizationId !== DTSC_INTERNAL_ORGANIZATION_ID) {
      throw new AiExecutionContextError("ORGANIZATION_ACCESS_DENIED");
    }
    if (requestedModuleCode) throw new AiExecutionContextError("MODULE_CONTEXT_FORBIDDEN");

    const [membership, usageLimits] = await Promise.all([
      prisma.organizationMember.findFirst({
        where: {
          userId,
          organizationId: DTSC_INTERNAL_ORGANIZATION_ID,
          status: "ACTIVE",
          removedAt: null,
          organization: { status: "ACTIVE", deletedAt: null, organizationType: "DTSC_INTERNAL" },
        },
        select: {
          role: true,
          positionCode: true,
          organization: { select: { id: true, name: true, sectorCode: true, updatedAt: true } },
        },
      }),
      getCanonicalAiUsageLimits({ userId, organizationId: DTSC_INTERNAL_ORGANIZATION_ID }),
    ]);

    if (!membership) throw new AiExecutionContextError("ORGANIZATION_ACCESS_DENIED");

    const profile = resolveAssistantProfile({ context: "DTSC_INTERNAL", requestedCode: requestedAssistantCode });
    const requestedResolved = requestedAssistantCode && profile.code === requestedAssistantCode;
    const contextVersion = shortHash({
      organizationId: DTSC_INTERNAL_ORGANIZATION_ID,
      organizationUpdatedAt: membership.organization.updatedAt.toISOString(),
      role: membership.role,
      positionCode: membership.positionCode,
      planCode: "ENTERPRISE",
      profileCode: profile.code,
      profileVersion: profile.version,
    });

    return {
      userId,
      contextCode: "DTSC_INTERNAL",
      profile,
      profileResolution: requestedResolved ? "REQUESTED" : requestedAssistantCode ? "FALLBACK" : "INFERRED",
      organization: {
        id: membership.organization.id,
        name: membership.organization.name,
        sectorCode: membership.organization.sectorCode,
      },
      membership: { role: membership.role, positionCode: membership.positionCode },
      planCode: usageLimits.planCode === "ENTERPRISE" ? usageLimits.planCode : "ENTERPRISE",
      activeModuleCodes: [],
      requestedModuleCode: null,
      canReadClinicalData: false,
      contextVersion,
      defaultDataClassifications: defaultClassifications(profile, true),
    };
  }

  if (!organizationId) {
    const profile = resolveAssistantProfile({ context: contextCode, requestedCode: requestedAssistantCode });
    const requestedResolved = requestedAssistantCode && profile.code === requestedAssistantCode;
    const plan = await getCanonicalAiUsageLimits({ userId, organizationId: null });
    return {
      userId,
      contextCode,
      profile,
      profileResolution: requestedResolved ? "REQUESTED" : requestedAssistantCode ? "FALLBACK" : "INFERRED",
      organization: null,
      membership: null,
      planCode: plan.planCode,
      activeModuleCodes: [],
      requestedModuleCode: null,
      canReadClinicalData: false,
      contextVersion: shortHash({ contextCode, profile: profile.code, profileVersion: profile.version, plan: plan.planCode }),
      defaultDataClassifications: defaultClassifications(profile, false),
    };
  }

  const [membership, navigableModules, usageLimits, aiSetting, latestModule] = await Promise.all([
    prisma.organizationMember.findFirst({
      where: {
        userId,
        organizationId,
        status: "ACTIVE",
        removedAt: null,
        organization: { status: "ACTIVE", deletedAt: null, organizationType: "CLIENT" },
      },
      select: {
        role: true,
        positionCode: true,
        organization: { select: { id: true, name: true, sectorCode: true, updatedAt: true } },
      },
    }),
    listNavigableEnterpriseModules({ userId, organizationId, action: "read" }),
    getCanonicalAiUsageLimits({ userId, organizationId }),
    prisma.enterpriseAiSetting.findUnique({ where: { organizationId }, select: { updatedAt: true } }),
    prisma.enterpriseModule.findFirst({ where: { organizationId }, orderBy: { updatedAt: "desc" }, select: { updatedAt: true } }),
  ]);

  if (!membership) throw new AiExecutionContextError("ORGANIZATION_ACCESS_DENIED");

  let canonicalRequestedModule: string | null = null;
  if (requestedModuleCode) {
    const moduleDecision = await resolveEnterpriseModuleAccess({ userId, organizationId, moduleCode: requestedModuleCode, action: "read" });
    if (!moduleDecision.allowed || !moduleDecision.canonicalCode) throw new AiExecutionContextError("MODULE_CONTEXT_FORBIDDEN");
    canonicalRequestedModule = moduleDecision.canonicalCode;
  }

  const sectorCode = membership.organization.sectorCode;
  const profile = resolveAssistantProfile({ context: contextCode, sectorCode, moduleCode: canonicalRequestedModule, requestedCode: requestedAssistantCode });
  const requestedResolved = requestedAssistantCode && profile.code === requestedAssistantCode;
  const activeModuleCodes = Array.from(new Set(navigableModules.map((entry) => entry.canonicalCode).filter((code): code is string => Boolean(code)))).sort();

  const clinicalAccess = sectorCode === "HEALTH_CARE"
    ? await resolveEnterpriseModuleAccess({ userId, organizationId, moduleCode: "MEDICAL_RECORDS", action: "read" }).catch(() => null)
    : null;
  const canReadClinicalData = Boolean(clinicalAccess?.allowed);

  const contextVersion = shortHash({
    organizationId,
    organizationUpdatedAt: membership.organization.updatedAt.toISOString(),
    aiSettingUpdatedAt: aiSetting?.updatedAt.toISOString() || null,
    latestModuleUpdatedAt: latestModule?.updatedAt.toISOString() || null,
    role: membership.role,
    positionCode: membership.positionCode,
    planCode: usageLimits.planCode,
    activeModuleCodes,
    profileCode: profile.code,
    profileVersion: profile.version,
    requestedModuleCode: canonicalRequestedModule,
    canReadClinicalData,
  });

  return {
    userId,
    contextCode,
    profile,
    profileResolution: requestedResolved ? "REQUESTED" : requestedAssistantCode ? "FALLBACK" : "INFERRED",
    organization: { id: membership.organization.id, name: membership.organization.name, sectorCode },
    membership: { role: membership.role, positionCode: membership.positionCode },
    planCode: usageLimits.planCode,
    activeModuleCodes,
    requestedModuleCode: canonicalRequestedModule,
    canReadClinicalData,
    contextVersion,
    defaultDataClassifications: defaultClassifications(profile, true),
  };
}
