import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const baseUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const organizationId = process.env.E2E_ORGANIZATION_ID || "e2e-erp-professional-org";
const adminEmail = process.env.E2E_ADMIN_EMAIL || "erp-admin@example.test";
const adminPassword = process.env.E2E_ADMIN_PASSWORD || "E2eAdmin2026!";
let context;
let page;

const gamingModules = [
  "GAMING_DASHBOARD", "GAMING_STATIONS", "GAMING_SESSIONS", "GAMING_BOOKINGS", "GAMING_PRICING_PACKAGES",
  "GAMING_CHECKOUT", "GAMING_DAILY_CLOSE", "GAMING_TOURNAMENTS", "GAMING_REPORTS",
];

async function prepareTenant() {
  const admin = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!admin) throw new Error("Issue #646 requires the canonical authenticated ERP seed.");
  await prisma.organization.update({ where: { id: organizationId }, data: { sectorCode: "HOSPITALITY_EVENTS", status: "ACTIVE", deletedAt: null, country: "CD", timezone: "Africa/Kinshasa" } });
  await prisma.organizationMember.updateMany({ where: { organizationId, userId: admin.id }, data: { role: "OWNER", status: "ACTIVE", removedAt: null } });
  await prisma.enterpriseBusinessSubtypeSelection.upsert({
    where: { organizationId },
    update: { sectorCode: "HOSPITALITY_EVENTS", businessSubtypeCode: "GAMING_LOUNGE", selectedByUserId: admin.id, source: "OWNER_E2E_646" },
    create: { organizationId, sectorCode: "HOSPITALITY_EVENTS", businessSubtypeCode: "GAMING_LOUNGE", selectedByUserId: admin.id, source: "OWNER_E2E_646" },
  });
  await prisma.enterpriseGamingConfiguration.upsert({
    where: { organizationId },
    update: { settingsJson: { onboardingVersion: 1 }, updatedByUserId: admin.id },
    create: { organizationId, settingsJson: { onboardingVersion: 1 }, createdByUserId: admin.id },
  });
  for (const [index, moduleCode] of gamingModules.entries()) {
    await prisma.enterpriseModule.upsert({
      where: { organizationId_moduleCode: { organizationId, moduleCode } },
      update: { isEnabled: true, requiresPlanLevel: "BUSINESS" },
      create: { organizationId, moduleCode, labelFr: moduleCode, labelEn: moduleCode, moduleCategory: "E2E", isEnabled: true, isCore: false, requiresPlanLevel: "BUSINESS", sortOrder: 1400 + index },
    });
  }
}

async function signIn() {
  const response = await context.request.post(`${baseUrl}/api/auth/sign-in`, {
    data: { email: adminEmail, password: adminPassword, organizationId, next: "/enterprise-modules/GAMING_DASHBOARD" },
    headers: { origin: baseUrl, referer: `${baseUrl}/auth/sign-in` },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
}

test.describe.serial("Issue #646 Gaming commercial readiness", () => {
  test.beforeAll(async ({ browser }) => {
    await prepareTenant();
    context = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "dark" });
    page = await context.newPage();
    await signIn();
  });

  test.afterAll(async () => {
    await context?.close();
    await prisma.$disconnect();
  });

  test("onboarding API exposes eight canonical readiness steps", async () => {
    const response = await context.request.get(`${baseUrl}/api/enterprise/${organizationId}/gaming/onboarding`, {
      headers: { origin: baseUrl, referer: `${baseUrl}/enterprise-modules/GAMING_DASHBOARD` },
    });
    const body = await response.json();
    expect(response.ok(), JSON.stringify(body)).toBeTruthy();
    expect(body.readiness?.total).toBe(8);
    expect(body.readiness?.items?.map((item) => item.code)).toEqual([
      "IDENTITY_SITE", "STATIONS_ASSETS", "TEAM_PERMISSIONS", "CATALOG_SERVICES", "PRICING", "FINANCE_PAYMENTS", "OPERATIONS", "CLOSE_REPORTING_AI",
    ]);
    expect(body.readiness?.items?.find((item) => item.code === "STATIONS_ASSETS")?.detail?.launchBaseline).toBe(5);
  });

  for (const width of [320, 360, 375, 390, 414]) {
    test(`setup remains usable at ${width}px`, async () => {
      await page.setViewportSize({ width, height: 844 });
      await page.goto(`${baseUrl}/enterprise-modules/GAMING_DASHBOARD`, { waitUntil: "networkidle" });
      await expect(page.locator('[data-testid="gaming-commercial-readiness"]')).toBeVisible();
      await expect(page.getByText("Mise en service Gaming Lounge", { exact: true })).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
    });
  }

  test("desktop keeps readiness and Gaming dashboard together", async () => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`${baseUrl}/enterprise-modules/GAMING_DASHBOARD`, { waitUntil: "networkidle" });
    await expect(page.locator('[data-testid="gaming-commercial-readiness"]')).toBeVisible();
    await expect(page.locator("[data-module-workspace]")).toBeVisible();
  });
});
