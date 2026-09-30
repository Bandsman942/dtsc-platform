import { resolveSaasPlanCode } from "@/lib/billing/plans";
import { reconcileOrganizationModulesWithSubscription } from "@/lib/enterprise/module-subscription-reconciliation";
import { requireEnv } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { createSessionToken, SESSION_COOKIE } from "@/lib/session";

const ORGANIZATIONS = [
  { id: "scale7-load-org-a", slug: "scale7-load-org-a", name: "SCALE-7 Synthetic Load A" },
  { id: "scale7-load-org-b", slug: "scale7-load-org-b", name: "SCALE-7 Synthetic Load B" },
] as const;

const MAX_IDENTITIES = 500;
const SYNTHETIC_PASSWORD_HASH = "scale7-oidc-only";
const SYNTHETIC_EMAIL_DOMAIN = "scale7.invalid";
const TARGETS = new Set([500, 1000, 2500, 5000]);

function identityCountForTarget(targetVus: number) {
  return Math.min(MAX_IDENTITIES, Math.max(50, Math.ceil(targetVus / 10)));
}

function syntheticUser(index: number) {
  const serial = String(index + 1).padStart(3, "0");
  return {
    id: `scale7-load-user-${serial}`,
    email: `scale7-load-${serial}@${SYNTHETIC_EMAIL_DOMAIN}`,
    name: `SCALE-7 Synthetic Identity ${serial}`,
  };
}

async function enterprisePlanId() {
  const plans = await prisma.billingPlan.findMany({
    where: { isActive: true, audience: { in: ["ORGANIZATION", "BOTH"] } },
    select: { id: true, slug: true, name: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  return plans.find((plan) => resolveSaasPlanCode(plan) === "ENTERPRISE")?.id || null;
}

async function ensureSyntheticOrganizations(planId: string) {
  for (const organization of ORGANIZATIONS) {
    await prisma.organization.upsert({
      where: { id: organization.id },
      update: {
        name: organization.name,
        slug: organization.slug,
        status: "ACTIVE",
        organizationType: "CLIENT",
        sectorCode: "COMMERCE_RETAIL",
        timezone: "Africa/Kinshasa",
        deletedAt: null,
        settingsJson: { syntheticLoadTest: "SCALE7", customerData: false },
      },
      create: {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        status: "ACTIVE",
        organizationType: "CLIENT",
        sectorCode: "COMMERCE_RETAIL",
        timezone: "Africa/Kinshasa",
        settingsJson: { syntheticLoadTest: "SCALE7", customerData: false },
      },
    });

    await prisma.organizationSubscription.upsert({
      where: { id: `scale7-load-subscription-${organization.id.at(-1)}` },
      update: {
        organizationId: organization.id,
        planId,
        status: "ACTIVE",
        startedAt: new Date(Date.now() - 86_400_000),
        expiresAt: new Date(Date.now() + 7 * 86_400_000),
      },
      create: {
        id: `scale7-load-subscription-${organization.id.at(-1)}`,
        organizationId: organization.id,
        planId,
        status: "ACTIVE",
        startedAt: new Date(Date.now() - 86_400_000),
        expiresAt: new Date(Date.now() + 7 * 86_400_000),
      },
    });

    await reconcileOrganizationModulesWithSubscription(organization.id);
  }
}

async function ensureSyntheticIdentities() {
  const users = Array.from({ length: MAX_IDENTITIES }, (_, index) => syntheticUser(index));
  await prisma.user.createMany({
    data: users.map((user) => ({
      ...user,
      passwordHash: SYNTHETIC_PASSWORD_HASH,
      role: "CLIENT",
      status: "ACTIVE",
      locale: "fr",
      timezone: "Africa/Kinshasa",
      startPage: "/dashboard",
      dailyMessageLimit: 1000,
      dailyTokenLimit: 1_000_000,
    })),
    skipDuplicates: true,
  });
  await prisma.user.updateMany({
    where: { id: { in: users.map((user) => user.id) } },
    data: {
      status: "ACTIVE",
      dailyMessageLimit: 1000,
      dailyTokenLimit: 1_000_000,
      startPage: "/dashboard",
    },
  });

  await prisma.organizationMember.createMany({
    data: users.map((user, index) => {
      const organization = ORGANIZATIONS[index % ORGANIZATIONS.length];
      return {
        organizationId: organization.id,
        userId: user.id,
        role: "OWNER",
        status: "ACTIVE",
        joinedAt: new Date(),
      };
    }),
    skipDuplicates: true,
  });

  await prisma.organizationMember.updateMany({
    where: {
      userId: { in: users.map((user) => user.id) },
      organizationId: { in: ORGANIZATIONS.map((organization) => organization.id) },
    },
    data: { role: "OWNER", status: "ACTIVE", removedAt: null },
  });

  return users;
}

export async function buildScale7SyntheticAuthPool(targetVus: number) {
  if (!TARGETS.has(targetVus)) throw new Error("SCALE7_TARGET_INVALID");

  const planId = await enterprisePlanId();
  if (!planId) throw new Error("SCALE7_ENTERPRISE_PLAN_REQUIRED");

  await ensureSyntheticOrganizations(planId);
  const users = await ensureSyntheticIdentities();
  const identityCount = identityCountForTarget(targetVus);
  const selectedUsers = users.slice(0, identityCount);
  const secret = requireEnv("AUTH_SECRET");

  const cookiesByOrganization = new Map<string, string[]>(
    ORGANIZATIONS.map((organization) => [organization.id, []]),
  );

  for (const [index, user] of selectedUsers.entries()) {
    const organization = ORGANIZATIONS[index % ORGANIZATIONS.length];
    const created = await createSessionToken(
      {
        userId: user.id,
        email: user.email,
        name: user.name,
        role: "CLIENT",
        activeContext: "ORGANIZATION",
        activeOrganizationId: organization.id,
        activeOrganizationName: organization.name,
        activeOrganizationRole: "OWNER",
      },
      secret,
      { idleTimeoutMinutes: 60 },
    );
    if (!created) throw new Error("SCALE7_SESSION_CREATION_FAILED");
    cookiesByOrganization.get(organization.id)?.push(`${SESSION_COOKIE}=${created.token}`);
  }

  return {
    aiPath: "/api/chat/v2",
    aiPayload: { content: "Réponds uniquement par OK.", useKnowledge: false },
    tenants: ORGANIZATIONS.map((organization, index) => {
      const foreign = ORGANIZATIONS[(index + 1) % ORGANIZATIONS.length];
      return {
        organizationId: organization.id,
        enterpriseReadPath: `/api/enterprise/${organization.id}/business-context`,
        shopReadPath: `/api/enterprise/${organization.id}/retail/sales?page=1&pageSize=5`,
        collaborationReadPath: `/api/enterprise/${organization.id}/tasks?page=1&pageSize=5`,
        isolationProbePath: `/api/enterprise/${foreign.id}/business-context`,
        sessionCookies: cookiesByOrganization.get(organization.id) || [],
      };
    }),
  };
}
