import type { SaasPlanCode } from "@/lib/billing/plans";

export type OrganizationUsageLimits = {
  maxUsers: number;
  maxStorageMb: number;
  maxMonthlyCallMinutes: number;
  maxActiveModules: number;
  maxDocuments: number;
  supportLevel: "standard" | "priority" | "dedicated";
};

export const SAAS_PLAN_LIMITS: Record<SaasPlanCode, OrganizationUsageLimits> = {
  STARTER: {
    maxUsers: 5,
    maxStorageMb: 1024,
    maxMonthlyCallMinutes: 120,
    maxActiveModules: 8,
    maxDocuments: 100,
    supportLevel: "standard",
  },
  BUSINESS: {
    maxUsers: 25,
    maxStorageMb: 10_240,
    maxMonthlyCallMinutes: 1_200,
    maxActiveModules: 24,
    maxDocuments: 2_000,
    supportLevel: "priority",
  },
  ENTERPRISE: {
    maxUsers: 250,
    maxStorageMb: 102_400,
    maxMonthlyCallMinutes: 12_000,
    maxActiveModules: 100,
    maxDocuments: 50_000,
    supportLevel: "dedicated",
  },
};

export function getPlanUsageLimits(planCode: SaasPlanCode): OrganizationUsageLimits {
  return SAAS_PLAN_LIMITS[planCode];
}
