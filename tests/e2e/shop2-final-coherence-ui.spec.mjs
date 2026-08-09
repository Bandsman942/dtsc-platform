import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const baseUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const organizationId = process.env.E2E_ORGANIZATION_ID || "e2e-erp-professional-org";
const adminEmail = process.env.E2E_ADMIN_EMAIL || "erp-admin@example.test";
const adminPassword = process.env.E2E_ADMIN_PASSWORD || "E2eAdmin2026!";

async function signIn(page, next = "/enterprise-modules/RETAIL_POS") {
  const response = await page.context().request.post(`${baseUrl}/api/auth/sign-in`, {
    data: { email: adminEmail, password: adminPassword, organizationId, next },
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

async function enableOperatorModules() {
  const user = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!user) throw new Error(`Missing E2E admin ${adminEmail}`);
  for (const [moduleCode, labelFr, labelEn] of [
    ["MOBILE_MONEY_AGENCY", "Agence Mobile Money", "Mobile Money agency"],
    ["TELCO_TOPUPS", "Recharges Télécom", "Telecom top-ups"],
  ]) {
    await prisma.enterpriseModule.upsert({
      where: { organizationId_moduleCode: { organizationId, moduleCode } },
      update: { isEnabled: true },
      create: {
        organizationId,
        moduleCode,
        labelFr,
        labelEn,
        moduleCategory: "SHOP2_E2E",
        isEnabled: true,
        isCore: false,
        requiresPlanLevel: "BUSINESS",
        sortOrder: 940,
      },
    });
  }
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
    await enableOperatorModules();
  });

  test.afterAll(async () => {
    await setLocale("fr");
    await prisma.$disconnect();
  });

  test("FR mobile: POS and ERP continuity are business-facing", async ({ page }) => {
    await setLocale("fr");
    await signIn(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/enterprise-modules/RETAIL_POS");
    await expect(page.getByText("Vente comptoir", { exact: true })).toBeVisible();
    await expect(page.getByText("Continuer dans l’ERP", { exact: true }).first()).toBeVisible();
    await assertNoRawRetailLanguage(page);
    await assertNoHorizontalOverflow(page);
  });

  test("FR tablet: Mobile Money uses operator labels and safe navigation", async ({ page }) => {
    await setLocale("fr");
    await signIn(page, "/enterprise-modules/MOBILE_MONEY_AGENCY");
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto("/enterprise-modules/MOBILE_MONEY_AGENCY");
    await expect(page.getByText("Opération Mobile Money", { exact: true })).toBeVisible();
    await expect(page.getByText("Continuer dans l’ERP", { exact: true }).first()).toBeVisible();
    await assertNoRawRetailLanguage(page);
    for (const raw of ["MOBILE_MONEY", "DEPOSIT", "WITHDRAWAL", "CLEARING"]) {
      await expect(page.getByText(raw, { exact: true })).toHaveCount(0);
    }
    await assertNoHorizontalOverflow(page);
  });

  test("EN desktop: Telco is customer-facing and reports translate account types", async ({ page }) => {
    await setLocale("en");
    await signIn(page, "/enterprise-modules/TELCO_TOPUPS");
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
