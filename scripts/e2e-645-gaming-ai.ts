import { PrismaClient } from "@prisma/client";
import { executeAiTool } from "@/lib/ai/tools/execute";
import type { SessionPayload } from "@/lib/session";

const prisma = new PrismaClient();
const organizationId = process.env.E2E_ORGANIZATION_ID || "e2e-erp-professional-org";
const adminEmail = (process.env.E2E_ADMIN_EMAIL || "erp-admin@example.test").toLowerCase();
const toolCode = "ERP_GAMING_PERFORMANCE_READ";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function enableModule(moduleCode: string, enabled: boolean) {
  const row = await prisma.enterpriseModule.findUnique({
    where: { organizationId_moduleCode: { organizationId, moduleCode } },
    select: { id: true },
  });
  assert(row, `OWNER_E2E #645 requires module row ${moduleCode}`);
  await prisma.enterpriseModule.update({ where: { id: row.id }, data: { isEnabled: enabled } });
}

async function main() {
  const [admin, organization, membership] = await Promise.all([
    prisma.user.findUnique({ where: { email: adminEmail }, select: { id: true, email: true, name: true, role: true } }),
    prisma.organization.findUnique({ where: { id: organizationId }, select: { id: true, name: true, sectorCode: true } }),
    prisma.organizationMember.findFirst({ where: { organizationId, user: { email: adminEmail }, status: "ACTIVE", removedAt: null }, select: { role: true } }),
  ]);
  assert(admin && organization && membership, "OWNER_E2E #645 requires the authenticated ERP seed and active membership");
  assert(organization.sectorCode === "HOSPITALITY_EVENTS", "OWNER_E2E #645 requires HOSPITALITY_EVENTS configured by the browser acceptance");

  const session: SessionPayload = {
    userId: admin.id,
    email: admin.email,
    name: admin.name || "Admin ERP E2E",
    role: admin.role,
    activeContext: "ORGANIZATION",
    activeOrganizationId: organizationId,
    activeOrganizationName: organization.name,
    activeOrganizationRole: membership.role,
    exp: Math.floor(Date.now() / 1000) + 3600,
  };

  await enableModule("GAMING_DASHBOARD", true);
  const allowed = await executeAiTool({
    toolCode,
    args: { periodDays: 30 },
    context: {
      session,
      userId: admin.id,
      organizationId,
      assistantCode: "ENTERPRISE_GENERAL",
      conversationId: null,
      turnId: `owner-e2e-645-ai-allowed-${Date.now()}`,
    },
  });
  assert(allowed.ok && allowed.status === "SUCCESS", `OWNER_E2E #645 expected AI success, got ${allowed.status}:${allowed.reasonCode || ""}`);
  const result = allowed.result as {
    data?: {
      observationPolicy?: string;
      sourceAccess?: { gamingDashboard?: boolean; assetsMaintenance?: boolean; financeReceivables?: boolean };
      financialByCurrency?: Array<{ currency?: string }> | null;
      limitations?: string[];
    };
  };
  assert(result.data?.observationPolicy === "FACTUAL_OBSERVATIONS_ONLY_NO_CAUSAL_INFERENCE", "OWNER_E2E #645 AI must enforce factual observation policy");
  assert(result.data?.sourceAccess?.gamingDashboard === true, "OWNER_E2E #645 AI must read Gaming only through authorized dashboard access");
  assert(Array.isArray(result.data?.limitations) && result.data.limitations.some((item) => item.includes("jamais additionnés")), "OWNER_E2E #645 AI must expose the no implicit FX aggregation limitation");
  if (Array.isArray(result.data?.financialByCurrency)) {
    const currencies = result.data.financialByCurrency.map((row) => row.currency).filter(Boolean);
    assert(new Set(currencies).size === currencies.length, "OWNER_E2E #645 AI finance output must remain separated by currency");
  }

  await enableModule("GAMING_DASHBOARD", false);
  try {
    const denied = await executeAiTool({
      toolCode,
      args: { periodDays: 30 },
      context: {
        session,
        userId: admin.id,
        organizationId,
        assistantCode: "ENTERPRISE_GENERAL",
        conversationId: null,
        turnId: `owner-e2e-645-ai-denied-${Date.now()}`,
      },
    });
    assert(!denied.ok && denied.status === "DENIED" && denied.reasonCode === "MODULE_NOT_ALLOWED", `OWNER_E2E #645 expected MODULE_NOT_ALLOWED, got ${denied.status}:${denied.reasonCode || ""}`);
  } finally {
    await enableModule("GAMING_DASHBOARD", true);
  }

  console.log("PASS OWNER_E2E #645 DTSC AI allowed/denied through canonical Tool Gateway");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
