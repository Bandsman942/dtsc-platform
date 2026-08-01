import type { SaasPlanCode } from "@/lib/billing/plans";

export type OrganizationUsageLimits = {
  maxUsers: number;
  maxStorageMb: number;
  maxMonthlyCallMinutes: number;
  maxActiveModules: number;
  maxDocuments: number;
  maxEnterpriseAiMonthlyMessages: number;
  maxEnterpriseAiKnowledgeSources: number;
  maxEnterpriseAiStorageMb: number;
  enterpriseAiReadToolsEnabled: boolean;
  enterpriseAiActionDraftsEnabled: boolean;
  supportLevel: "standard" | "priority" | "dedicated";
};

export const SAAS_PLAN_LIMITS: Record<SaasPlanCode, OrganizationUsageLimits> = {
  STARTER: {
    maxUsers: 10,
    maxStorageMb: 5_120,
    maxMonthlyCallMinutes: 300,
    maxActiveModules: 12,
    maxDocuments: 1_000,
    maxEnterpriseAiMonthlyMessages: 1_000,
    maxEnterpriseAiKnowledgeSources: 50,
    maxEnterpriseAiStorageMb: 1_024,
    enterpriseAiReadToolsEnabled: true,
    enterpriseAiActionDraftsEnabled: false,
    supportLevel: "standard",
  },
  BUSINESS: {
    maxUsers: 50,
    maxStorageMb: 51_200,
    maxMonthlyCallMinutes: 3_000,
    maxActiveModules: 60,
    maxDocuments: 20_000,
    maxEnterpriseAiMonthlyMessages: 10_000,
    maxEnterpriseAiKnowledgeSources: 500,
    maxEnterpriseAiStorageMb: 20_480,
    enterpriseAiReadToolsEnabled: true,
    enterpriseAiActionDraftsEnabled: true,
    supportLevel: "priority",
  },
  ENTERPRISE: {
    maxUsers: 500,
    maxStorageMb: 512_000,
    maxMonthlyCallMinutes: 30_000,
    maxActiveModules: 250,
    maxDocuments: 250_000,
    maxEnterpriseAiMonthlyMessages: 100_000,
    maxEnterpriseAiKnowledgeSources: 10_000,
    maxEnterpriseAiStorageMb: 204_800,
    enterpriseAiReadToolsEnabled: true,
    enterpriseAiActionDraftsEnabled: true,
    supportLevel: "dedicated",
  },
};

export function getPlanUsageLimits(planCode: SaasPlanCode): OrganizationUsageLimits {
  return SAAS_PLAN_LIMITS[planCode];
}
