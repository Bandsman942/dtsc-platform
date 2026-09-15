import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { executeAiTool } from "@/lib/ai/tools/execute";
import type { SessionPayload } from "@/lib/session";

const prisma = new PrismaClient();
const organizationId = process.env.E2E_ORGANIZATION_ID || "e2e-erp-professional-org";
const adminEmail = (process.env.E2E_ADMIN_EMAIL || "erp-admin@example.test").toLowerCase();
const toolCode = "ERP_GAMING_PERFORMANCE_READ";

async function setModuleEnabled(moduleCode: string, isEnabled: boolean) {
  const row = await prisma.enterpriseModule.findUnique({
    where: { organizationId_moduleCode: { organizationId, moduleCode } },
    select: { id: true },
  });
  expect(row, `OWNER_E2E #645 requires module row ${moduleCode}`).toBeTruthy();
  await prisma.enterpriseModule.update({ where: { id: row!.id }, data: { isEnabled } });
}

test.afterAll(async () => {
  await prisma.$disconnect();
});

test("Issue #645 DTSC AI respecte le Tool Gateway autorisé puis refusé", async () => {
  const [admin, organization, membership] = await Promise.all([
    prisma.user.findUnique({ where: { email: adminEmail }, select: { id: true, email: true, name: true, role: true } }),
    prisma.organization.findUnique({ where: { id: organizationId }, select: { id: true, name: true, sectorCode: true } }),
    prisma.organizationMember.findFirst({
      where: { organizationId, user: { email: adminEmail }, status: "ACTIVE", removedAt: null },
      select: { role: true },
    }),
  ]);

  expect(admin, "OWNER_E2E #645 requires the authenticated ERP seed").toBeTruthy();
  expect(organization, "OWNER_E2E #645 requires the authenticated ERP tenant").toBeTruthy();
  expect(membership, "OWNER_E2E #645 requires an active tenant membership").toBeTruthy();
  expect(organization!.sectorCode).toBe("HOSPITALITY_EVENTS");

  const session: SessionPayload = {
    userId: admin!.id,
    email: admin!.email,
    name: admin!.name || "Admin ERP E2E",
    role: admin!.role,
    activeContext: "ORGANIZATION",
    activeOrganizationId: organizationId,
    activeOrganizationName: organization!.name,
    activeOrganizationRole: membership!.role,
    exp: Math.floor(Date.now() / 1000) + 3600,
  };

  await setModuleEnabled("GAMING_DASHBOARD", true);
  const allowed = await executeAiTool({
    toolCode,
    args: { periodDays: 30 },
    context: {
      session,
      userId: admin!.id,
      organizationId,
      assistantCode: "ENTERPRISE_GENERAL",
      conversationId: null,
      turnId: `owner-e2e-645-ai-allowed-${Date.now()}`,
    },
  });

  expect(allowed.ok, `${allowed.status}:${allowed.reasonCode || ""}`).toBeTruthy();
  expect(allowed.status).toBe("SUCCESS");
  const result = allowed.result as {
    data?: {
      observationPolicy?: string;
      sourceAccess?: { gamingDashboard?: boolean; assetsMaintenance?: boolean; financeReceivables?: boolean };
      financialByCurrency?: Array<{ currency?: string }> | null;
      limitations?: string[];
    };
  };
  expect(result.data?.observationPolicy).toBe("FACTUAL_OBSERVATIONS_ONLY_NO_CAUSAL_INFERENCE");
  expect(result.data?.sourceAccess?.gamingDashboard).toBe(true);
  expect(result.data?.limitations?.some((item) => item.includes("jamais additionnés"))).toBe(true);

  if (Array.isArray(result.data?.financialByCurrency)) {
    const currencies = result.data.financialByCurrency.map((row) => row.currency).filter(Boolean);
    expect(new Set(currencies).size).toBe(currencies.length);
  }

  await setModuleEnabled("GAMING_DASHBOARD", false);
  try {
    const denied = await executeAiTool({
      toolCode,
      args: { periodDays: 30 },
      context: {
        session,
        userId: admin!.id,
        organizationId,
        assistantCode: "ENTERPRISE_GENERAL",
        conversationId: null,
        turnId: `owner-e2e-645-ai-denied-${Date.now()}`,
      },
    });
    expect(denied.ok).toBe(false);
    expect(denied.status).toBe("DENIED");
    expect(denied.reasonCode).toBe("MODULE_NOT_ALLOWED");
  } finally {
    await setModuleEnabled("GAMING_DASHBOARD", true);
  }
});
