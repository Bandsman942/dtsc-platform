import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const baseUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const organizationId = process.env.E2E_ORGANIZATION_ID || "e2e-erp-professional-org";
const adminEmail = process.env.E2E_ADMIN_EMAIL || "erp-admin@example.test";
const adminPassword = process.env.E2E_ADMIN_PASSWORD || "E2eAdmin2026!";
const outsiderEmail = process.env.E2E_USER_EMAIL || "erp-user@example.test";
const outsiderPassword = process.env.E2E_USER_PASSWORD || "E2eUser2026!";
const accountingPath = "/enterprise-modules/FINANCE_ACCOUNTING";

let adminUserId = "";
let chartId = "";

async function signIn(page, { email = adminEmail, password = adminPassword, organization = organizationId } = {}) {
  const payload = { email, password, next: accountingPath };
  if (organization) payload.organizationId = organization;
  const response = await page.context().request.post(`${baseUrl}/api/auth/sign-in`, {
    data: payload,
    headers: { origin: baseUrl, referer: `${baseUrl}/auth/sign-in` },
  });
  const body = await response.json().catch(() => null);
  expect(response.ok(), `Accounting acceptance sign-in failed: ${JSON.stringify(body)}`).toBeTruthy();
  return body;
}

async function apiJson(response) {
  const body = await response.json().catch(() => null);
  return { response, body };
}

async function apiGet(page, path) {
  return apiJson(await page.context().request.get(`${baseUrl}${path}`));
}

async function apiPost(page, path, data, referer = accountingPath) {
  return apiJson(await page.context().request.post(`${baseUrl}${path}`, {
    data,
    headers: { origin: baseUrl, referer: `${baseUrl}${referer}` },
  }));
}

async function apiPatch(page, path, data, referer = accountingPath) {
  return apiJson(await page.context().request.patch(`${baseUrl}${path}`, {
    data,
    headers: { origin: baseUrl, referer: `${baseUrl}${referer}` },
  }));
}

async function setupPayload(page) {
  const result = await apiGet(page, `/api/enterprise/${organizationId}/accounting-setup${chartId ? `?chartId=${encodeURIComponent(chartId)}` : ""}`);
  expect(result.response.ok(), JSON.stringify(result.body)).toBeTruthy();
  return result.body;
}

function blockerCodes(payload) {
  return new Set((payload?.readiness?.blockers || []).map((item) => item.code));
}

test.describe.serial("Accounting onboarding and production-readiness UX", () => {
  test.beforeAll(async () => {
    const admin = await prisma.user.findUnique({ where: { email: adminEmail } });
    if (!admin) throw new Error(`Accounting E2E requires seeded admin ${adminEmail}`);
    adminUserId = admin.id;
    const organization = await prisma.organization.findUnique({ where: { id: organizationId } });
    if (!organization) throw new Error(`Accounting E2E requires seeded organization ${organizationId}`);
    const existingCharts = await prisma.enterpriseChartOfAccounts.count({ where: { organizationId } });
    if (existingCharts !== 0) throw new Error("Accounting E2E requires a clean accounting chart state");
  });

  test.afterAll(async () => {
    if (adminUserId) await prisma.user.update({ where: { id: adminUserId }, data: { locale: "fr" } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  test("FR mobile onboarding goes from blocked readiness to explicit activation", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page);
    await page.goto(accountingPath);
    await page.waitForURL((url) => url.pathname === accountingPath, { timeout: 30_000 });

    const onboarding = page.locator('section[aria-labelledby="accounting-onboarding-title"]');
    await expect(onboarding.getByText("Mise en service comptable")).toBeVisible();
    await expect(onboarding.getByText(/SYSCOHADA 2017 v0\.1\.0 est fonctionnel mais non officiel/i)).toBeVisible();
    await expect(onboarding.getByText("Aucun plan pour l’instant")).toBeVisible();

    await onboarding.getByLabel("Code", { exact: true }).fill("SYS17");
    await onboarding.getByLabel("Nom français").fill("Plan SYSCOHADA E2E");
    await onboarding.getByLabel("Nom anglais").fill("SYSCOHADA E2E chart");
    await onboarding.getByRole("button", { name: "Créer le plan" }).click();
    await expect(onboarding.getByText(/Plan créé/i)).toBeVisible();

    let setup = await setupPayload(page);
    chartId = setup.selectedChartId;
    expect(chartId).toBeTruthy();
    expect(setup.ready).toBeFalsy();

    await onboarding.getByRole("button", { name: "Adopter le template" }).click();
    await expect(onboarding.getByText(/Template adopté/i)).toBeVisible();
    await onboarding.getByRole("button", { name: "Installer les journaux recommandés" }).click();
    await expect(onboarding.getByText(/Journaux recommandés vérifiés/i)).toBeVisible();

    setup = await setupPayload(page);
    const before = blockerCodes(setup);
    expect(before.has("FUNCTIONAL_CURRENCY_REQUIRED")).toBeTruthy();
    expect(before.has("OPEN_FISCAL_PERIOD_REQUIRED")).toBeTruthy();
    expect(setup.charts.find((chart) => chart.id === chartId)?.templateCode).toBe("OHADA_SYSCOHADA@0.1.0");

    const finance = await apiPatch(page, `/api/enterprise/${organizationId}/finance/configuration`, {
      functionalCurrencyCode: "XAF",
      presentationCurrencyCode: "XAF",
      inventoryValuationMethod: "WEIGHTED_AVERAGE",
      reconciliationTolerance: "0.01",
      defaultAccountsJson: { acceptance: "configured" },
      automaticPostingEnabled: false,
    });
    expect(finance.response.ok(), JSON.stringify(finance.body)).toBeTruthy();

    const fiscalYear = await apiPost(page, `/api/enterprise/${organizationId}/fiscal-years`, {
      code: "FY2026-E2E",
      startDate: "2026-01-01T00:00:00.000Z",
      endDate: "2026-12-31T23:59:59.999Z",
    });
    expect(fiscalYear.response.status(), JSON.stringify(fiscalYear.body)).toBe(201);
    const fiscalYearId = fiscalYear.body?.year?.id;
    expect(fiscalYearId).toBeTruthy();

    const period = await apiPost(page, `/api/enterprise/${organizationId}/fiscal-periods`, {
      fiscalYearId,
      code: "2026-08-E2E",
      startDate: "2026-08-01T00:00:00.000Z",
      endDate: "2026-08-31T23:59:59.999Z",
    });
    expect(period.response.status(), JSON.stringify(period.body)).toBe(201);

    await page.reload();
    await expect(onboarding.getByText("Prêt à activer")).toBeVisible();
    const activate = onboarding.getByRole("button", { name: "Activer la comptabilité" });
    await expect(activate).toBeEnabled();
    await activate.click();
    await expect(onboarding.getByText(/Plan comptable activé/i)).toBeVisible();

    setup = await setupPayload(page);
    expect(setup.ready).toBeTruthy();
    expect(setup.charts.find((chart) => chart.id === chartId)?.status).toBe("ACTIVE");
    expect(setup.regulatorySupport.supported).toBeFalsy();
    expect(setup.regulatorySupport.reasonCode).toBe("REGULATORY_STATEMENT_MAPPING_NOT_VALIDATED");
    expect(setup.templates.find((template) => template.reference === "OHADA_SYSCOHADA@0.1.0")?.productionReadiness.ready).toBeFalsy();

    const accounts = await apiGet(page, `/api/enterprise/${organizationId}/ledger-accounts?search=701&page=1&pageSize=20`);
    expect(accounts.response.ok(), JSON.stringify(accounts.body)).toBeTruthy();
    const parent = (accounts.body?.items || []).find((item) => item.code === "701");
    expect(parent).toBeTruthy();
    const custom = await apiPost(page, `/api/enterprise/${organizationId}/ledger-accounts`, {
      chartId,
      parentId: parent.id,
      code: "70191",
      nameFr: "Ventes E2E personnalisées",
      nameEn: "Custom E2E sales",
      accountType: "REVENUE",
      accountSubtype: "REVENUE",
      isControlAccount: false,
      isSystemAccount: false,
      allowDirectPosting: true,
    });
    expect(custom.response.status(), JSON.stringify(custom.body)).toBe(201);
    expect(custom.body?.account?.parentId).toBe(parent.id);
    expect(custom.body?.account?.isSystemAccount).toBeFalsy();

    const trialBalance = await apiGet(page, `/api/enterprise/${organizationId}/accounting-professional?view=trial-balance&page=1&pageSize=100`);
    expect(trialBalance.response.ok(), JSON.stringify(trialBalance.body)).toBeTruthy();
    const debit = (trialBalance.body?.items || []).reduce((total, item) => total + Number(item.debit || 0), 0);
    const credit = (trialBalance.body?.items || []).reduce((total, item) => total + Number(item.credit || 0), 0);
    expect(Math.abs(debit - credit)).toBeLessThan(0.00001);

    const regulatory = await apiGet(page, `/api/enterprise/${organizationId}/regulatory-statements`);
    expect(regulatory.response.ok(), JSON.stringify(regulatory.body)).toBeTruthy();
    expect(regulatory.body?.support?.supported).toBeFalsy();
    expect(regulatory.body?.support?.reasonCode).toBe("REGULATORY_STATEMENT_MAPPING_NOT_VALIDATED");
  });

  test("server RBAC rejects a non-member instead of leaking accounting data", async ({ page }) => {
    await page.context().clearCookies();
    await signIn(page, { email: outsiderEmail, password: outsiderPassword, organization: null });
    const response = await page.context().request.get(`${baseUrl}/api/enterprise/${organizationId}/accounting-setup`);
    expect([403, 404]).toContain(response.status());
  });

  test("English tablet onboarding remains responsive and keeps the governance warning", async ({ page }) => {
    await prisma.user.update({ where: { id: adminUserId }, data: { locale: "en" } });
    await page.setViewportSize({ width: 768, height: 1024 });
    await signIn(page);
    await page.goto(accountingPath);
    const onboarding = page.locator('section[aria-labelledby="accounting-onboarding-title"]');
    await expect(onboarding.getByText("Accounting onboarding")).toBeVisible();
    await expect(onboarding.getByText("Configure, validate, then activate")).toBeVisible();
    await expect(onboarding.getByText(/functional but unofficial/i)).toBeVisible();
    const box = await onboarding.boundingBox();
    expect(box).toBeTruthy();
    expect(box.width).toBeLessThanOrEqual(768);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBeTruthy();
  });
});
