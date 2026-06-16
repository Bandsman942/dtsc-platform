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
    maxUsers: 5,
    maxStorageMb: 1024,
    maxMonthlyCallMinutes: 120,
    maxActiveModules: 8,
    maxDocuments: 100,
    maxEnterpriseAiMonthlyMessages: 300,
    maxEnterpriseAiKnowledgeSources: 20,
    maxEnterpriseAiStorageMb: 256,
    enterpriseAiReadToolsEnabled: true,
    enterpriseAiActionDraftsEnabled: false,
    supportLevel: "standard",
  },
  BUSINESS: {
    maxUsers: 25,
    maxStorageMb: 10_240,
    maxMonthlyCallMinutes: 1_200,
    maxActiveModules: 24,
    maxDocuments: 2_000,
    maxEnterpriseAiMonthlyMessages: 3_000,
    maxEnterpriseAiKnowledgeSources: 200,
    maxEnterpriseAiStorageMb: 5_120,
    enterpriseAiReadToolsEnabled: true,
    enterpriseAiActionDraftsEnabled: true,
    supportLevel: "priority",
  },
  ENTERPRISE: {
    maxUsers: 250,
    maxStorageMb: 102_400,
    maxMonthlyCallMinutes: 12_000,
    maxActiveModules: 100,
    maxDocuments: 50_000,
    maxEnterpriseAiMonthlyMessages: 30_000,
    maxEnterpriseAiKnowledgeSources: 2_000,
    maxEnterpriseAiStorageMb: 51_200,
    enterpriseAiReadToolsEnabled: true,
    enterpriseAiActionDraftsEnabled: true,
    supportLevel: "dedicated",
  },
};

export function getPlanUsageLimits(planCode: SaasPlanCode): OrganizationUsageLimits {
  return SAAS_PLAN_LIMITS[planCode];
}
