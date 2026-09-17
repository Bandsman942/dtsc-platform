import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const baseUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const organizationId = process.env.E2E_ORGANIZATION_ID || "e2e-erp-professional-org";
const adminEmail = process.env.E2E_ADMIN_EMAIL || "erp-admin@example.test";
const adminPassword = process.env.E2E_ADMIN_PASSWORD || "E2eAdmin2026!";
const dtscOrganizationId = "dtsc-internal";
let internalContext;
let internalPage;
let organizationContext;
let organizationPage;

async function prepareAccess() {
  const admin = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!admin) throw new Error("Issue #657 requires the canonical ERP professional E2E seed.");
  await prisma.user.update({ where: { id: admin.id }, data: { role: "ADMIN", status: "ACTIVE", locale: "fr" } });
  await prisma.organization.upsert({
    where: { id: dtscOrganizationId },
    update: { name: "DTSC", status: "ACTIVE", organizationType: "DTSC_INTERNAL", deletedAt: null },
    create: {
      id: dtscOrganizationId,
      name: "DTSC",
      slug: "dtsc-internal",
      status: "ACTIVE",
      organizationType: "DTSC_INTERNAL",
      timezone: "Africa/Kinshasa",
      createdByDtscUserId: admin.id,
    },
  });
  await prisma.organizationMember.upsert({
    where: { organizationId_userId: { organizationId: dtscOrganizationId, userId: admin.id } },
    update: { role: "OWNER", status: "ACTIVE", removedAt: null, joinedAt: new Date() },
    create: { organizationId: dtscOrganizationId, userId: admin.id, role: "OWNER", status: "ACTIVE", joinedAt: new Date() },
  });
  await prisma.organizationMember.updateMany({
    where: { organizationId, userId: admin.id },
    data: { role: "OWNER", status: "ACTIVE", removedAt: null },
  });
}

async function signIn(context, workspaceId, next) {
  const response = await context.request.post(`${baseUrl}/api/auth/sign-in`, {
    data: { email: adminEmail, password: adminPassword, organizationId: workspaceId, next },
    headers: { origin: baseUrl, referer: `${baseUrl}/auth/sign-in` },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
}

async function openCreateCompany(page) {
  await page.goto(`${baseUrl}/admin/organizations`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Créer l'entreprise cliente", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByLabel("Secteur d'activité", { exact: true })).toBeVisible();
}

async function assertNoGlobalOverflow(page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

test.describe.serial("Issue #657 ERP navigation and workspace hotfix", () => {
  test.beforeAll(async ({ browser }) => {
    await prepareAccess();
    internalContext = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "dark" });
    internalPage = await internalContext.newPage();
    await signIn(internalContext, dtscOrganizationId, "/admin/organizations");

    organizationContext = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "dark" });
    organizationPage = await organizationContext.newPage();
    await signIn(organizationContext, organizationId, "/modules?group=ORGANIZATION_ERP");
  });

  test.afterAll(async () => {
    await internalContext?.close();
    await organizationContext?.close();
    await prisma.$disconnect();
  });

  test("Administration DTSC exposes Manufacturing and Hospitality without search and keeps active subtypes", async () => {
    await openCreateCompany(internalPage);

    const manufacturing = internalPage.getByRole("button", { name: /Industrie \/ production/ });
    const hospitality = internalPage.getByRole("button", { name: /Hôtellerie \/ restauration \/ événementiel/ });
    await expect(manufacturing).toHaveCount(1);
    await expect(hospitality).toHaveCount(1);

    await manufacturing.scrollIntoViewIfNeeded();
    await manufacturing.click();
    const subtype = internalPage.locator('[data-dtsc-reference-combobox="businessSubtypeCode"] select');
    await expect(subtype).toBeVisible();
    await expect(subtype.locator('option[value="TAILORING_APPAREL"]')).toHaveCount(1);

    await internalPage.getByLabel("Secteur d'activité", { exact: true }).fill("");
    await hospitality.scrollIntoViewIfNeeded();
    await hospitality.click();
    await expect(subtype.locator('option[value="GAMING_LOUNGE"]')).toHaveCount(1);
    await assertNoGlobalOverflow(internalPage);
  });

  for (const width of [320, 360, 375, 390, 414]) {
    test(`create-company sector selector remains usable at ${width}px`, async () => {
      await internalPage.setViewportSize({ width, height: 844 });
      await openCreateCompany(internalPage);
      await expect(internalPage.getByRole("button", { name: /Industrie \/ production/ })).toHaveCount(1);
      await expect(internalPage.getByRole("button", { name: /Hôtellerie \/ restauration \/ événementiel/ })).toHaveCount(1);
      await assertNoGlobalOverflow(internalPage);
    });
  }

  test("Company & ERP exposes one catalog entry instead of a second detailed ERP catalog", async () => {
    await organizationPage.setViewportSize({ width: 390, height: 844 });
    await organizationPage.goto(`${baseUrl}/modules?group=ORGANIZATION_ERP`, { waitUntil: "networkidle" });
    await expect(organizationPage.getByRole("heading", { name: "Entreprise & ERP" })).toBeVisible();
    const workspaceGroup = organizationPage.getByRole("button", { name: /Espaces entreprise · \d+/ });
    await expect(workspaceGroup).toBeVisible();
    await expect(organizationPage.getByRole("button", { name: /^Opérations ·/ })).toHaveCount(0);
    await expect(organizationPage.getByRole("button", { name: /^Ventes & relation client ·/ })).toHaveCount(0);

    await workspaceGroup.click();
    await expect(organizationPage.getByText("Modules ERP", { exact: true })).toBeVisible();
    const catalogLink = organizationPage.locator('a[href="/enterprise-modules"]');
    await expect(catalogLink).toHaveCount(1);
    await catalogLink.click();
    await expect(organizationPage).toHaveURL(/\/enterprise-modules$/);
    await expect(organizationPage.getByRole("heading", { name: "Modules ERP" })).toBeVisible();
    await assertNoGlobalOverflow(organizationPage);
  });

  test("desktop light English keeps the same canonical ERP catalog", async ({ browser }) => {
    const admin = await prisma.user.findUnique({ where: { email: adminEmail } });
    if (!admin) throw new Error("Missing E2E admin");
    await prisma.user.update({ where: { id: admin.id }, data: { locale: "en" } });
    const englishContext = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: "light" });
    try {
      const englishPage = await englishContext.newPage();
      await signIn(englishContext, organizationId, "/modules?group=ORGANIZATION_ERP");
      await englishPage.goto(`${baseUrl}/modules?group=ORGANIZATION_ERP`, { waitUntil: "networkidle" });
      const workspaceGroup = englishPage.getByRole("button", { name: /Company workspaces · \d+/ });
      await expect(workspaceGroup).toBeVisible();
      await workspaceGroup.click();
      await expect(englishPage.getByText("ERP modules", { exact: true })).toBeVisible();
      await expect(englishPage.getByRole("button", { name: /^Operations ·/ })).toHaveCount(0);
      await assertNoGlobalOverflow(englishPage);
      await englishPage.locator('a[href="/enterprise-modules"]').click();
      await expect(englishPage.getByRole("heading", { name: "ERP modules" })).toBeVisible();
    } finally {
      await englishContext.close();
      await prisma.user.update({ where: { id: admin.id }, data: { locale: "fr" } });
    }
  });
});
