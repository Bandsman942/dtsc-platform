import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const baseUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const organizationId = process.env.E2E_ORGANIZATION_ID || "e2e-erp-professional-org";
const adminEmail = process.env.E2E_ADMIN_EMAIL || "erp-admin@example.test";
const adminPassword = process.env.E2E_ADMIN_PASSWORD || "E2eAdmin2026!";
let originalProfileCode = "RETAIL_CORE";
let originalCountry = null;

async function signIn(page) {
  const response = await page.context().request.post(`${baseUrl}/api/auth/sign-in`, {
    data: { email: adminEmail, password: adminPassword, organizationId, next: "/enterprise-modules/RETAIL_POS" },
    headers: { origin: baseUrl, referer: `${baseUrl}/auth/sign-in` },
  });
  const body = await response.json().catch(() => null);
  expect(response.ok(), `Shop final coherence sign-in failed: ${JSON.stringify(body)}`).toBeTruthy();
}

async function setLocale(locale) {
  const user = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!user) throw new Error(`Missing E2E admin ${adminEmail}`);
  await prisma.user.update({ where: { id: user.id }, data: { locale } });
}

async function prepareOperatorModules() {
  const user = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!user) throw new Error(`Missing E2E admin ${adminEmail}`);
  const [configuration, organization] = await Promise.all([
    prisma.enterpriseRetailConfiguration.findUnique({ where: { organizationId } }),
    prisma.organization.findUnique({ where: { id: organizationId }, select: { country: true } }),
  ]);
  if (!configuration) throw new Error(`Missing Retail configuration for ${organizationId}`);
  if (!organization) throw new Error(`Missing organization ${organizationId}`);
  originalProfileCode = configuration.profileCode;
  originalCountry = organization.country;

  await prisma.enterpriseRetailConfiguration.update({
    where: { organizationId },
    data: { profileCode: "RETAIL_CORE" },
  });
  await prisma.organization.update({
    where: { id: organizationId },
    data: { country: "CD" },
  });

  for (const [moduleCode, labelFr, labelEn, isCore, isEnabled] of [
    ["FINANCE_TREASURY", "Trésorerie", "Treasury", true, true],
    ["MOBILE_MONEY_AGENCY", "Agence Mobile Money", "Mobile Money agency", false, false],
    ["TELCO_TOPUPS", "Recharges Télécom", "Telecom top-ups", false, false],
  ]) {
    await prisma.enterpriseModule.upsert({
      where: { organizationId_moduleCode: { organizationId, moduleCode } },
      update: { isEnabled },
      create: {
        organizationId,
        moduleCode,
        labelFr,
        labelEn,
        moduleCategory: "SHOP2_E2E",
        isEnabled,
        isCore,
        requiresPlanLevel: "BUSINESS",
        sortOrder: 940,
      },
    });
  }
}

async function activateOperatorModule(page, moduleCode) {
  const enterpriseModule = await prisma.enterpriseModule.findUnique({
    where: { organizationId_moduleCode: { organizationId, moduleCode } },
    select: { id: true },
  });
  if (!enterpriseModule) throw new Error(`Missing E2E module ${moduleCode}`);
  const response = await page.context().request.patch(
    `${baseUrl}/api/enterprise/${organizationId}/modules/${enterpriseModule.id}`,
    {
      data: { isEnabled: true, activateDependencies: true },
      headers: { origin: baseUrl, referer: `${baseUrl}/enterprise-admin` },
    },
  );
  const body = await response.json().catch(() => null);
  expect(response.ok(), `${moduleCode} activation failed: ${JSON.stringify(body)}`).toBeTruthy();
}

async function restoreFixture() {
  await prisma.enterpriseRetailConfiguration.update({
    where: { organizationId },
    data: { profileCode: originalProfileCode },
  });
  await prisma.organization.update({
    where: { id: organizationId },
    data: { country: originalCountry },
  });
  await setLocale("fr");
}

async function assertNoHorizontalOverflow(page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
  expect(overflow, `Unexpected horizontal overflow at ${await page.evaluate(() => window.innerWidth)}px`).toBe(false);
}

async function assertNoRawRetailLanguage(page) {
  const text = await page.locator("body").innerText();
  for (const forbidden of [
    "provider float",
    "supplier float",
    "float de l’opérateur",
    "float fournisseur",
    "Provider reference",
    "Configured non-cash account",
    "Compte non-cash configuré",
    "provider-side operations",
    "Recherchez les articles côté serveur",
    "Search products on the server",
  ]) {
    expect(text).not.toContain(forbidden);
  }
}

test.describe.serial("Shop 2.0 final product coherence", () => {
  test.beforeAll(async () => {
    await prepareOperatorModules();
  });

  test.afterAll(async () => {
    await restoreFixture();
    await prisma.$disconnect();
  });

  test("cross-device FR/EN Retail surfaces respect product language and access contracts", async ({ page }) => {
    await setLocale("fr");
    await signIn(page);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/enterprise-modules/RETAIL_POS");
    await expect(page.getByText("Vente comptoir", { exact: true })).toBeVisible();
    await expect(page.getByText("Continuer dans l’ERP", { exact: true }).first()).toBeVisible();
    await assertNoRawRetailLanguage(page);
    await assertNoHorizontalOverflow(page);

    await activateOperatorModule(page, "MOBILE_MONEY_AGENCY");
    await activateOperatorModule(page, "TELCO_TOPUPS");

    const retailConfiguration = await prisma.enterpriseRetailConfiguration.findUnique({
      where: { organizationId },
      select: { profileCode: true },
    });
    expect(retailConfiguration?.profileCode).toBe("RETAIL_CORE");

    const mobileMoneyConfigResponse = await page.context().request.get(
      `${baseUrl}/api/enterprise/${organizationId}/retail/mobile-money/accounts`,
    );
    const mobileMoneyConfig = await mobileMoneyConfigResponse.json().catch(() => null);
    expect(mobileMoneyConfigResponse.ok(), `Mobile Money configuration failed: ${JSON.stringify(mobileMoneyConfig)}`).toBeTruthy();
    expect(mobileMoneyConfig?.requiredCurrencies).toEqual(["CDF", "USD"]);
    expect((mobileMoneyConfig?.providers || []).map((provider) => provider.providerCode).sort()).toEqual([
      "AFRIMONEY",
      "AIRTEL_MONEY",
      "MPESA",
      "ORANGE_MONEY",
    ]);

    await page.goto("/enterprise-modules/MOBILE_MONEY_AGENCY");
    await expect(page.getByText("Opération Mobile Money", { exact: true })).toBeVisible();
    await expect(page.getByText("Continuer dans l’ERP", { exact: true }).first()).toBeVisible();
    await page.getByRole("button", { name: "Configuration" }).click();
    for (const label of ["M-Pesa", "Orange Money", "Airtel Money", "Afrimoney"]) {
      await expect(page.getByText(label, { exact: true })).toBeVisible();
    }
    await expect(page.getByText("CDF", { exact: true })).toHaveCount(4);
    await expect(page.getByText("USD", { exact: true })).toHaveCount(4);
    await assertNoRawRetailLanguage(page);
    for (const raw of ["MOBILE_MONEY", "DEPOSIT", "WITHDRAWAL", "CLEARING"]) {
      await expect(page.getByText(raw, { exact: true })).toHaveCount(0);
    }
    await assertNoHorizontalOverflow(page);

    await setLocale("en");
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/enterprise-modules/TELCO_TOPUPS");
    await expect(page.getByText("Airtime / bundle", { exact: true })).toBeVisible();
    await assertNoRawRetailLanguage(page);
    await page.getByRole("button", { name: "Reports" }).click();
    await expect(page.getByText("Operational balances", { exact: true })).toBeVisible();
    for (const raw of ["CASH", "MOBILE_MONEY", "CLEARING", "CARD_CLEARING"]) {
      await expect(page.getByText(raw, { exact: true })).toHaveCount(0);
    }
    await assertNoHorizontalOverflow(page);
  });
});
