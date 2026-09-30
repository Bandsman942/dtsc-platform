import { UserRole, UserStatus } from "@prisma/client";
import { ensureBillingPlans } from "@/lib/billing";
import { getEnterpriseModuleDefinition } from "@/lib/enterprise/module-registry";
import { prisma } from "@/lib/prisma";
import { createSessionToken, SESSION_COOKIE } from "@/lib/session";
import { requireEnv } from "@/lib/env";

const SYNTHETIC_ORGS = [
  { id: "scale7-synthetic-org-a", slug: "scale7-synthetic-a", name: "DTSC SCALE-7 Synthetic A" },
  { id: "scale7-synthetic-org-b", slug: "scale7-synthetic-b", name: "DTSC SCALE-7 Synthetic B" },
] as const;

const BASE_MODULES = ["TASKS_OPERATIONS", "RETAIL_POS", "AI_ASSISTANT"] as const;

function identityCountForStage(targetVus: number) {
  // The AI workload is real. Keep per-user request volume well below the
  // enterprise AI route limit so SCALE-7 measures platform capacity rather
  // than an artificial single-user throttle.
  return Math.max(50, Math.ceil(targetVus / 10));
}

function requiredModuleCodes() {
  const result = new Set<string>();
  const visit = (code: string) => {
    if (result.has(code)) return;
    const definition = getEnterpriseModuleDefinition(code);
    if (!definition) throw new Error(`SCALE7_MODULE_MISSING:${code}`);
    result.add(definition.code);
    for (const dependency of definition.dependencies) visit(dependency);
  };
  for (const code of BASE_MODULES) visit(code);
  return [...result];
}

async function ensureSyntheticOrganization(org: typeof SYNTHETIC_ORGS[number]) {
  await prisma.organization.upsert({
    where: { id: org.id },
    update: {
      name: org.name,
      slug: org.slug,
      status: "ACTIVE",
      organizationType: "CLIENT",
      sector: "Commerce retail synthétique SCALE-7",
      sectorCode: "COMMERCE_RETAIL",
      industry: "Synthetic load testing",
      country: "CD",
      city: "Kinshasa",
      timezone: "Africa/Kinshasa",
      deletedAt: null,
      notes: "SCALE-7 SYNTHETIC LOAD TEST ONLY — NO CUSTOMER DATA",
      settingsJson: { scale7Synthetic: true },
    },
    create: {
      id: org.id,
      name: org.name,
      slug: org.slug,
      status: "ACTIVE",
      organizationType: "CLIENT",
      sector: "Commerce retail synthétique SCALE-7",
      sectorCode: "COMMERCE_RETAIL",
      industry: "Synthetic load testing",
      country: "CD",
      city: "Kinshasa",
      timezone: "Africa/Kinshasa",
      notes: "SCALE-7 SYNTHETIC LOAD TEST ONLY — NO CUSTOMER DATA",
      settingsJson: { scale7Synthetic: true },
    },
  });

  const modules = requiredModuleCodes();
  for (const moduleCode of modules) {
    const definition = getEnterpriseModuleDefinition(moduleCode);
    if (!definition) throw new Error(`SCALE7_MODULE_MISSING:${moduleCode}`);
    await prisma.enterpriseModule.upsert({
      where: { organizationId_moduleCode: { organizationId: org.id, moduleCode: definition.code } },
      update: {
        labelFr: definition.labelFr,
        labelEn: definition.labelEn,
        descriptionFr: definition.descriptionFr,
        descriptionEn: definition.descriptionEn,
        moduleCategory: definition.domain,
        icon: definition.iconKey,
        isEnabled: true,
        isCore: definition.code === "TASKS_OPERATIONS" || definition.code === "AI_ASSISTANT",
        requiresPlanLevel: definition.minimumPlan,
        sortOrder: definition.navigationOrder,
      },
      create: {
        organizationId: org.id,
        moduleCode: definition.code,
        labelFr: definition.labelFr,
        labelEn: definition.labelEn,
        descriptionFr: definition.descriptionFr,
        descriptionEn: definition.descriptionEn,
        moduleCategory: definition.domain,
        icon: definition.iconKey,
        isEnabled: true,
        isCore: definition.code === "TASKS_OPERATIONS" || definition.code === "AI_ASSISTANT",
        requiresPlanLevel: definition.minimumPlan,
        sortOrder: definition.navigationOrder,
      },
    });
  }

  await prisma.organizationSubscription.updateMany({
    where: { organizationId: org.id, status: { in: ["ACTIVE", "TRIAL"] }, planId: { not: "org-premium" } },
    data: { status: "CANCELLED" },
  });
  const premium = await prisma.organizationSubscription.findFirst({
    where: { organizationId: org.id, planId: "org-premium" },
    orderBy: { updatedAt: "desc" },
    select: { id: true },
  });
  if (premium) {
    await prisma.organizationSubscription.update({
      where: { id: premium.id },
      data: { status: "ACTIVE", startedAt: new Date(), expiresAt: null, trialEndsAt: null },
    });
  } else {
    await prisma.organizationSubscription.create({
      data: { organizationId: org.id, planId: "org-premium", status: "ACTIVE", startedAt: new Date() },
    });
  }
}

function syntheticIdentity(targetVus: number, orgKey: "a" | "b", index: number) {
  const padded = String(index + 1).padStart(4, "0");
  return {
    id: `scale7-${targetVus}-${orgKey}-${padded}`,
    email: `scale7-${targetVus}-${orgKey}-${padded}@synthetic.invalid`,
    name: `SCALE-7 ${targetVus} ${orgKey.toUpperCase()} ${padded}`,
  };
}

export async function provisionScale7SyntheticAuthPool(targetVus: number) {
  if (![500, 1000, 2500, 5000].includes(targetVus)) throw new Error("SCALE7_STAGE_INVALID");

  await ensureBillingPlans();
  await Promise.all(SYNTHETIC_ORGS.map((org) => ensureSyntheticOrganization(org)));

  const totalIdentities = identityCountForStage(targetVus);
  const perOrg = Math.ceil(totalIdentities / SYNTHETIC_ORGS.length);
  const authSecret = requireEnv("AUTH_SECRET");
  const tenants = [];

  for (let orgIndex = 0; orgIndex < SYNTHETIC_ORGS.length; orgIndex += 1) {
    const org = SYNTHETIC_ORGS[orgIndex];
    const orgKey = orgIndex === 0 ? "a" : "b";
    const desiredCount = Math.min(perOrg, totalIdentities - orgIndex * perOrg);
    const identities = Array.from({ length: desiredCount }, (_, index) => syntheticIdentity(targetVus, orgKey, index));

    await prisma.user.createMany({
      data: identities.map((identity) => ({
        id: identity.id,
        name: identity.name,
        email: identity.email,
        passwordHash: "SCALE7_SYNTHETIC_LOGIN_DISABLED",
        role: UserRole.CLIENT,
        status: UserStatus.ACTIVE,
        companyName: org.name,
        locale: "fr",
        timezone: "Africa/Kinshasa",
        dailyMessageLimit: 10_000,
        dailyTokenLimit: 30_000_000,
      })),
      skipDuplicates: true,
    });
    await prisma.user.updateMany({
      where: { id: { in: identities.map((identity) => identity.id) } },
      data: {
        status: UserStatus.ACTIVE,
        companyName: org.name,
        dailyMessageLimit: 10_000,
        dailyTokenLimit: 30_000_000,
      },
    });

    await prisma.organizationMember.createMany({
      data: identities.map((identity) => ({
        organizationId: org.id,
        userId: identity.id,
        role: "ADMIN_ENTERPRISE",
        status: "ACTIVE",
        joinedAt: new Date(),
      })),
      skipDuplicates: true,
    });
    await prisma.organizationMember.updateMany({
      where: { organizationId: org.id, userId: { in: identities.map((identity) => identity.id) } },
      data: { role: "ADMIN_ENTERPRISE", status: "ACTIVE", removedAt: null, joinedAt: new Date() },
    });
    await prisma.organization.update({
      where: { id: org.id },
      data: { ownerUserId: identities[0]?.id || null },
    });

    const sessionCookies: string[] = [];
    for (const identity of identities) {
      const created = await createSessionToken(
        {
          userId: identity.id,
          email: identity.email,
          name: identity.name,
          role: UserRole.CLIENT,
          activeContext: "ORGANIZATION",
          activeOrganizationId: org.id,
          activeOrganizationName: org.name,
          activeOrganizationRole: "ADMIN_ENTERPRISE",
        },
        authSecret,
        { idleTimeoutMinutes: 120 },
      );
      if (!created) throw new Error("SCALE7_SESSION_MINT_FAILED");
      sessionCookies.push(`${SESSION_COOKIE}=${created.token}`);
    }

    const foreignOrg = SYNTHETIC_ORGS[(orgIndex + 1) % SYNTHETIC_ORGS.length];
    tenants.push({
      organizationId: org.id,
      enterpriseReadPath: `/api/enterprise/${org.id}/tasks?page=1&pageSize=5`,
      shopReadPath: `/api/enterprise/${org.id}/retail/products/search?page=1&pageSize=5`,
      collaborationReadPath: "/api/collaborators/groups",
      isolationProbePath: `/api/enterprise/${foreignOrg.id}/tasks?page=1&pageSize=5`,
      aiPayload: {
        organizationId: org.id,
        content: "Réponds uniquement par OK.",
        useKnowledge: false,
        useTools: false,
        reasoningEffort: "AUTO",
      },
      sessionCookies,
    });
  }

  return {
    contract: "SCALE7_SYNTHETIC_AUTH_V1",
    targetVus,
    tenantCount: tenants.length,
    identityCount: tenants.reduce((sum, tenant) => sum + tenant.sessionCookies.length, 0),
    authContexts: {
      aiPath: "/api/enterprise/ai/chat",
      tenants,
    },
  };
}
