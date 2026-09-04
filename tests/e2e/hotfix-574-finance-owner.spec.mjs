import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const baseUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const organizationId = process.env.E2E_ORGANIZATION_ID || "e2e-erp-professional-org";
const adminEmail = process.env.E2E_ADMIN_EMAIL || "erp-admin@example.test";
const adminPassword = process.env.E2E_ADMIN_PASSWORD || "E2eAdmin2026!";
const suffix = Date.now();
const budgetTitle = `OWNER E2E Budget 574 ${suffix}`;
const expenseTitle = `OWNER E2E Dépense 574 ${suffix}`;
const reportTitle = `OWNER E2E Rapport 574 ${suffix}`;

async function enableModule(moduleCode, sortOrder) {
  await prisma.enterpriseModule.upsert({
    where: { organizationId_moduleCode: { organizationId, moduleCode } },
    update: { isEnabled: true },
    create: {
      organizationId,
      moduleCode,
      labelFr: moduleCode,
      labelEn: moduleCode,
      moduleCategory: "E2E",
      isEnabled: true,
      isCore: true,
      requiresPlanLevel: moduleCode === "REPORTS" ? "STARTER" : "BUSINESS",
      sortOrder,
    },
  });
}

async function signIn(page, next) {
  const response = await page.context().request.post(`${baseUrl}/api/auth/sign-in`, {
    data: { email: adminEmail, password: adminPassword, organizationId, next },
    headers: { origin: baseUrl, referer: `${baseUrl}/auth/sign-in` },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
}

async function setNamedControl(container, name, value) {
  const control = container.locator(`[name="${name}"]`).first();
  await expect(control).toBeVisible();
  const tagName = await control.evaluate((element) => element.tagName);
  if (tagName === "SELECT") await control.selectOption(value);
  else await control.fill(value);
}

async function assertHealthyMobilePage(page, pageErrors) {
  await expect(page.getByText("Application error: a client-side exception has occurred")).toHaveCount(0);
  expect(pageErrors).toEqual([]);
  const viewport = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(
    viewport.scrollWidth - viewport.clientWidth,
    `Débordement horizontal détecté à 390 px: ${JSON.stringify(viewport)}`,
  ).toBeLessThanOrEqual(2);
}

async function openAuthenticatedMobilePage(browser, path) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await signIn(page, path);
  return { context, page, pageErrors };
}

test.describe.serial("Hotfix #574 — OWNER_E2E Finance budgets, overview and reports", () => {
  test.beforeAll(async () => {
    const admin = await prisma.user.findUnique({ where: { email: adminEmail } });
    if (!admin) throw new Error("Hotfix #574 OWNER_E2E requires the canonical ERP authenticated seed.");

    await enableModule("FINANCE_BUDGETS", 940);
    await enableModule("FINANCE_OVERVIEW", 941);
    await enableModule("REPORTS", 942);
  });

  test.afterAll(async () => {
    await prisma.enterpriseReport.deleteMany({ where: { organizationId, title: { startsWith: "OWNER E2E Rapport 574" } } }).catch(() => undefined);
    await prisma.enterpriseExpense.deleteMany({ where: { organizationId, title: { startsWith: "OWNER E2E Dépense 574" } } }).catch(() => undefined);
    await prisma.enterpriseBudget.deleteMany({ where: { organizationId, title: { startsWith: "OWNER E2E Budget 574" } } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  test("FINANCE_OVERVIEW uses the authoritative server summary and stays usable on mobile", async ({ browser }) => {
    const { context, page, pageErrors } = await openAuthenticatedMobilePage(browser, "/enterprise-modules/FINANCE_OVERVIEW");
    try {
      const summaryPromise = page.waitForResponse((response) =>
        response.url().includes(`/api/enterprise/${organizationId}/finance/overview-summary`) &&
        response.request().method() === "GET",
      );
      await page.goto(`${baseUrl}/enterprise-modules/FINANCE_OVERVIEW`);
      const summaryResponse = await summaryPromise;
      expect(summaryResponse.ok(), await summaryResponse.text()).toBeTruthy();
      const summary = await summaryResponse.json();
      for (const metric of [
        "openReceivables",
        "openPayables",
        "unallocatedPayments",
        "openCashSessions",
        "pendingReconciliations",
        "invoicesToPost",
        "pendingApprovals",
      ]) {
        expect(Number.isFinite(summary[metric]), `Résumé Finance invalide pour ${metric}: ${JSON.stringify(summary)}`).toBeTruthy();
      }

      await expect(page.getByText(/Vue d’ensemble financière|Finance overview/i).first()).toBeVisible();
      await expect(page.getByText(/pageSize=100|lastErrorMessage|FINANCE_OVERVIEW_SUMMARY_FAILED/i)).toHaveCount(0);
      await assertHealthyMobilePage(page, pageErrors);
    } finally {
      await context.close();
    }
  });

  test("FINANCE_BUDGETS creates a budget and an expense through the guided mobile forms", async ({ browser }) => {
    const { context, page, pageErrors } = await openAuthenticatedMobilePage(browser, "/enterprise-modules/FINANCE_BUDGETS");
    try {
      const budgetsPromise = page.waitForResponse((response) => response.url().includes(`/api/enterprise/${organizationId}/budgets?`) && response.request().method() === "GET");
      const expensesPromise = page.waitForResponse((response) => response.url().includes(`/api/enterprise/${organizationId}/expenses?`) && response.request().method() === "GET");
      await page.goto(`${baseUrl}/enterprise-modules/FINANCE_BUDGETS`);
      expect((await budgetsPromise).ok()).toBeTruthy();
      expect((await expensesPromise).ok()).toBeTruthy();

      await page.getByRole("button", { name: /Nouveau budget|New budget/i }).click();
      const budgetDialog = page.getByRole("dialog").last();
      await expect(budgetDialog).toBeVisible();
      await setNamedControl(budgetDialog, "title", budgetTitle);
      await setNamedControl(budgetDialog, "periodStart", "2026-01-01");
      await setNamedControl(budgetDialog, "periodEnd", "2026-12-31");
      await setNamedControl(budgetDialog, "currency", "USD");
      const lineName = budgetDialog.getByPlaceholder(/Nom de ligne|Line name/i).first();
      await lineName.fill("Ligne de recette OWNER_E2E");
      const lineEditor = lineName.locator("xpath=ancestor::div[contains(@class, 'rounded-xl')][1]");
      await lineEditor.locator('input[type="number"]').first().fill("1000");

      const createBudgetPromise = page.waitForResponse((response) =>
        response.url().endsWith(`/api/enterprise/${organizationId}/budgets`) && response.request().method() === "POST",
      );
      await budgetDialog.getByRole("button", { name: /Créer le brouillon|Create draft/i }).click();
      const createBudgetResponse = await createBudgetPromise;
      expect(createBudgetResponse.ok(), await createBudgetResponse.text()).toBeTruthy();
      await expect(page.getByText(budgetTitle, { exact: false }).first()).toBeVisible();

      await page.getByRole("button", { name: /Nouvelle dépense|New expense/i }).click();
      const expenseDialog = page.getByRole("dialog").last();
      await expect(expenseDialog).toBeVisible();
      await setNamedControl(expenseDialog, "title", expenseTitle);
      await setNamedControl(expenseDialog, "expenseDate", "2026-09-04");
      await setNamedControl(expenseDialog, "category", "Recette propriétaire");
      await setNamedControl(expenseDialog, "amount", "125.50");
      await setNamedControl(expenseDialog, "currency", "USD");

      const createExpensePromise = page.waitForResponse((response) =>
        response.url().endsWith(`/api/enterprise/${organizationId}/expenses`) && response.request().method() === "POST",
      );
      await expenseDialog.getByRole("button", { name: /Créer le brouillon|Create draft/i }).click();
      const createExpenseResponse = await createExpensePromise;
      expect(createExpenseResponse.ok(), await createExpenseResponse.text()).toBeTruthy();
      await expect(page.getByText(expenseTitle, { exact: false }).first()).toBeVisible();

      expect(await prisma.enterpriseBudget.count({ where: { organizationId, title: budgetTitle, status: "DRAFT" } })).toBe(1);
      expect(await prisma.enterpriseExpense.count({ where: { organizationId, title: expenseTitle, status: "DRAFT", currency: "USD" } })).toBe(1);
      await assertHealthyMobilePage(page, pageErrors);
    } finally {
      await context.close();
    }
  });

  test("REPORTS generates a real immutable Finance snapshot from the stabilized sources", async ({ browser }) => {
    const { context, page, pageErrors } = await openAuthenticatedMobilePage(browser, "/enterprise-modules/REPORTS");
    try {
      const reportsPromise = page.waitForResponse((response) => response.url().includes(`/api/enterprise/${organizationId}/reports?`) && response.request().method() === "GET");
      const catalogPromise = page.waitForResponse((response) => response.url().includes(`/api/enterprise/${organizationId}/reports/catalog`) && response.request().method() === "GET");
      await page.goto(`${baseUrl}/enterprise-modules/REPORTS`);
      expect((await reportsPromise).ok()).toBeTruthy();
      expect((await catalogPromise).ok()).toBeTruthy();

      await page.getByRole("button", { name: /Générer un rapport|Generate report/i }).click();
      const reportDialog = page.getByRole("dialog").last();
      await expect(reportDialog).toBeVisible();
      await setNamedControl(reportDialog, "title", reportTitle);
      await setNamedControl(reportDialog, "reportType", "BUDGET_VS_ACTUAL");
      await setNamedControl(reportDialog, "currency", "USD");
      await setNamedControl(reportDialog, "periodStart", "2026-01-01");
      await setNamedControl(reportDialog, "periodEnd", "2026-12-31");

      const generatePromise = page.waitForResponse((response) =>
        response.url().endsWith(`/api/enterprise/${organizationId}/reports/generate`) && response.request().method() === "POST",
      );
      await reportDialog.getByRole("button", { name: /Générer le snapshot|Generate snapshot/i }).click();
      const generateResponse = await generatePromise;
      expect(generateResponse.ok(), await generateResponse.text()).toBeTruthy();
      await expect(page.getByText(reportTitle, { exact: false }).first()).toBeVisible();

      const stored = await prisma.enterpriseReport.findFirst({ where: { organizationId, title: reportTitle } });
      expect(stored).toBeTruthy();
      expect(stored.status).toBe("GENERATED");
      expect(stored.schemaVersion).toBeGreaterThanOrEqual(1);
      expect(stored.snapshotJson).toBeTruthy();
      await assertHealthyMobilePage(page, pageErrors);
    } finally {
      await context.close();
    }
  });
});
