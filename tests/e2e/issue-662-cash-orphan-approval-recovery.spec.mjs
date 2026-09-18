import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const baseUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const organizationId = process.env.E2E_ORGANIZATION_ID || "e2e-erp-professional-org";
const adminEmail = (process.env.E2E_ADMIN_EMAIL || "erp-admin@example.test").toLowerCase();
const approverEmail = (process.env.E2E_USER_EMAIL || "erp-user@example.test").toLowerCase();
const adminPassword = process.env.E2E_ADMIN_PASSWORD;
const approverPassword = process.env.E2E_USER_PASSWORD;

let adminUser;
let approverUser;
let orphanAccount;
let orphanSession;
let dailyAccount;
let dailySession;

async function signIn(page, email, password, next) {
  if (!password) throw new Error("Hotfix #662 browser acceptance requires E2E passwords from CI.");
  const response = await page.context().request.post(`${baseUrl}/api/auth/sign-in`, {
    data: { email, password, organizationId, next },
    headers: { origin: baseUrl, referer: `${baseUrl}/auth/sign-in` },
  });
  const body = await response.json().catch(() => null);
  expect(response.ok(), `Sign-in failed for ${email}: ${JSON.stringify(body)}`).toBeTruthy();
}

async function post(page, path, data, referer = "/enterprise-modules/FINANCE_CASH") {
  const response = await page.context().request.post(`${baseUrl}${path}`, {
    data,
    headers: { origin: baseUrl, referer: `${baseUrl}${referer}` },
  });
  return { response, body: await response.json().catch(() => null) };
}

async function assertNoGlobalOverflow(page, width) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, `Hotfix #662 must not overflow globally at ${width}px`).toBeLessThanOrEqual(2);
}

async function enableModule(moduleCode, index) {
  await prisma.enterpriseModule.upsert({
    where: { organizationId_moduleCode: { organizationId, moduleCode } },
    update: { isEnabled: true },
    create: {
      organizationId,
      moduleCode,
      labelFr: moduleCode,
      labelEn: moduleCode,
      moduleCategory: "HOTFIX_662_E2E",
      isEnabled: true,
      isCore: false,
      requiresPlanLevel: "BUSINESS",
      sortOrder: 980 + index,
    },
  });
}

test.describe.serial("Hotfix #662 orphan cash approval recovery", () => {
  test.beforeAll(async () => {
    adminUser = await prisma.user.findUnique({ where: { email: adminEmail } });
    approverUser = await prisma.user.findUnique({ where: { email: approverEmail } });
    if (!adminUser || !approverUser) throw new Error("Hotfix #662 requires the canonical ERP E2E users.");

    await prisma.user.update({ where: { id: adminUser.id }, data: { locale: "fr" } });
    await prisma.user.update({ where: { id: approverUser.id }, data: { locale: "fr" } });
    await prisma.organizationMember.upsert({
      where: { organizationId_userId: { organizationId, userId: approverUser.id } },
      update: { role: "ADMIN_ENTERPRISE", status: "ACTIVE", joinedAt: new Date(), removedAt: null },
      create: {
        id: "e2e-662-approver-membership",
        organizationId,
        userId: approverUser.id,
        role: "ADMIN_ENTERPRISE",
        status: "ACTIVE",
        joinedAt: new Date(),
      },
    });

    for (const [index, moduleCode] of [
      "CRM_CUSTOMERS",
      "CATALOG",
      "SITES_WAREHOUSES",
      "INVENTORY_LOGISTICS",
      "RETAIL_POS",
      "RETAIL_DAILY_CLOSE",
      "SALES_QUOTES_ORDERS",
      "SUPPLIERS_PURCHASES",
      "FINANCE_OVERVIEW",
      "FINANCE_RECEIVABLES",
      "FINANCE_PAYABLES",
      "FINANCE_TREASURY",
      "FINANCE_PAYMENTS",
      "FINANCE_CASH",
      "VALIDATIONS",
    ].entries()) {
      await enableModule(moduleCode, index);
    }

    const ledger = await prisma.enterpriseLedgerAccount.findFirst({
      where: { organizationId, code: "SHOP2-CASH", isActive: true, archivedAt: null },
    });
    const site = await prisma.enterpriseSite.findFirst({
      where: { organizationId, code: "SHOP2-E2E-SITE", status: "ACTIVE", archivedAt: null },
    });
    if (!ledger || !site) throw new Error("Hotfix #662 requires the Shop 2 behavioral cash fixture.");

    const suffix = String(Date.now()).slice(-8);
    orphanAccount = await prisma.enterpriseFinancialAccount.create({
      data: {
        organizationId,
        code: `H662-OR-${suffix}`,
        name: `Hotfix 662 orphan ${suffix}`,
        accountType: "CASH",
        currencyCode: "USD",
        openingBalance: 100,
        operationalBalance: 100,
        reconciledBalance: 100,
        availableBalance: 100,
        ledgerAccountId: ledger.id,
        siteId: site.id,
        responsibleUserId: adminUser.id,
        status: "ACTIVE",
      },
    });
    orphanSession = await prisma.enterpriseCashSession.create({
      data: {
        organizationId,
        number: `H662-ORPHAN-${suffix}`,
        financialAccountId: orphanAccount.id,
        cashierUserId: adminUser.id,
        siteId: site.id,
        status: "PENDING_VALIDATION",
        openingAmount: 100,
        expectedClosingAmount: 100,
        countedClosingAmount: 100,
        discrepancyAmount: 0,
        submittedAt: new Date(),
      },
    });
    await prisma.enterpriseCashCount.create({
      data: {
        organizationId,
        cashSessionId: orphanSession.id,
        denomination: 100,
        quantity: 1,
        amount: 100,
        countedByUserId: adminUser.id,
      },
    });

    dailyAccount = await prisma.enterpriseFinancialAccount.create({
      data: {
        organizationId,
        code: `H662-DAY-${suffix}`,
        name: `Hotfix 662 daily ${suffix}`,
        accountType: "CASH",
        currencyCode: "USD",
        openingBalance: 100,
        operationalBalance: 100,
        reconciledBalance: 100,
        availableBalance: 100,
        ledgerAccountId: ledger.id,
        siteId: site.id,
        responsibleUserId: adminUser.id,
        status: "ACTIVE",
      },
    });
    dailySession = await prisma.enterpriseCashSession.create({
      data: {
        organizationId,
        number: `H662-DAILY-${suffix}`,
        financialAccountId: dailyAccount.id,
        cashierUserId: adminUser.id,
        siteId: site.id,
        status: "OPEN",
        openingAmount: 100,
      },
    });
  });

  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test("manager assigns a real approver to an orphan close without changing its cash count", async ({ browser }) => {
    const context = await browser.newContext({ baseURL: baseUrl, viewport: { width: 390, height: 844 } });
    await context.addInitScript(() => localStorage.setItem("theme", "dark"));
    const page = await context.newPage();
    await signIn(page, adminEmail, adminPassword, `/enterprise-modules/FINANCE_CASH?cashSessionId=${orphanSession.id}`);

    await page.goto(`/enterprise-modules/FINANCE_CASH?cashSessionId=${orphanSession.id}`);
    await expect(page.getByText(orphanSession.number, { exact: true })).toBeVisible();

    for (const width of [320, 360, 375, 390, 414, 768, 1024]) {
      await page.setViewportSize({ width, height: width < 600 ? 844 : 900 });
      await expect(page.getByRole("button", { name: "Affecter un validateur" })).toBeVisible();
      await assertNoGlobalOverflow(page, width);
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Affecter un validateur" }).click();
    const select = page.getByRole("combobox", { name: "Validation indépendante" });
    await expect(select).toBeVisible();
    await expect(select).toContainText("Utilisateur ERP E2E");
    await select.selectOption(approverUser.id);
    await page.getByRole("button", { name: "Confirmer l’affectation" }).click();
    await expect(page.getByRole("status")).toContainText("Le validateur a été affecté");

    const approval = await prisma.enterpriseApproval.findFirstOrThrow({
      where: {
        organizationId,
        targetEntityType: "EnterpriseCashSession",
        targetEntityId: orphanSession.id,
        requestedByUserId: adminUser.id,
        approverUserId: approverUser.id,
        status: "PENDING",
        archivedAt: null,
      },
    });
    expect(approval).toBeTruthy();

    const persistedSession = await prisma.enterpriseCashSession.findUniqueOrThrow({ where: { id: orphanSession.id } });
    expect(persistedSession.status).toBe("PENDING_VALIDATION");
    expect(Number(persistedSession.expectedClosingAmount)).toBeCloseTo(100, 6);
    expect(Number(persistedSession.countedClosingAmount)).toBeCloseTo(100, 6);
    expect(Number(persistedSession.discrepancyAmount)).toBeCloseTo(0, 6);
    const count = await prisma.enterpriseCashCount.findFirstOrThrow({ where: { organizationId, cashSessionId: orphanSession.id } });
    expect(Number(count.denomination)).toBeCloseTo(100, 6);
    expect(count.quantity).toBe(1);

    const notification = await prisma.notification.findFirst({
      where: { organizationId, userId: approverUser.id, type: "ENTERPRISE_APPROVAL" },
      orderBy: { createdAt: "desc" },
    });
    expect(notification?.targetUrl).toContain(`approval=${approval.id}`);
    await context.close();
  });

  test("assigned approver closes the recovered till and the same cash account can be opened again", async ({ browser }) => {
    const context = await browser.newContext({ baseURL: baseUrl, viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await signIn(page, approverEmail, approverPassword, `/enterprise-modules/FINANCE_CASH?cashSessionId=${orphanSession.id}`);
    await page.goto(`/enterprise-modules/FINANCE_CASH?cashSessionId=${orphanSession.id}`);

    await expect(page.getByRole("button", { name: "Valider la clôture" })).toBeVisible();
    await page.getByRole("button", { name: "Valider la clôture" }).click();
    await page.getByRole("combobox", { name: "Décision" }).selectOption("true");
    await page.getByRole("button", { name: "Enregistrer la décision" }).click();
    await expect(page.getByRole("status")).toContainText("décision");

    const closed = await prisma.enterpriseCashSession.findUniqueOrThrow({ where: { id: orphanSession.id } });
    expect(closed.status).toBe("CLOSED");

    await context.close();

    const reopenContext = await browser.newContext({ baseURL: baseUrl, viewport: { width: 390, height: 844 } });
    const reopenPage = await reopenContext.newPage();
    await signIn(reopenPage, adminEmail, adminPassword, "/enterprise-modules/FINANCE_CASH");
    const reopened = await post(reopenPage, `/api/enterprise/${organizationId}/cash-sessions`, {
      financialAccountId: orphanAccount.id,
      openingAmount: "100",
    });
    expect(reopened.response.ok(), JSON.stringify(reopened.body)).toBeTruthy();
    expect(reopened.body?.session?.status).toBe("OPEN");
    await reopenContext.close();
  });

  test("new Shop daily cash close creates its assigned EnterpriseApproval before pending validation", async ({ browser }) => {
    const context = await browser.newContext({ baseURL: baseUrl, viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await signIn(page, adminEmail, adminPassword, "/enterprise-modules/RETAIL_DAILY_CLOSE");

    await page.goto("/enterprise-modules/RETAIL_DAILY_CLOSE");
    await page.getByRole("button", { name: /Soumettre la clôture journalière/ }).click();
    await expect(page.getByRole("combobox", { name: "Validation indépendante des caisses" })).toBeVisible();

    const created = await post(
      page,
      `/api/enterprise/${organizationId}/retail/daily-close`,
      {
        businessDate: new Date().toISOString(),
        notes: "Hotfix #662 assigned close",
        approverUserId: approverUser.id,
        idempotencyKey: `hotfix-662-daily-close-${Date.now()}`,
        lines: [{
          financialAccountId: dailyAccount.id,
          accountType: "CASH",
          declaredBalance: 100,
          varianceReason: null,
          denominations: [{ denomination: 100, quantity: 1 }],
        }],
      },
      "/enterprise-modules/RETAIL_DAILY_CLOSE",
    );
    expect(created.response.ok(), JSON.stringify(created.body)).toBeTruthy();

    const linkedLine = await prisma.enterpriseRetailDailyCloseLine.findFirstOrThrow({
      where: { organizationId, dailyCloseId: created.body.close.id, cashSessionId: dailySession.id },
    });
    expect(linkedLine.cashSessionId).toBe(dailySession.id);

    const session = await prisma.enterpriseCashSession.findUniqueOrThrow({ where: { id: dailySession.id } });
    expect(session.status).toBe("PENDING_VALIDATION");
    const approval = await prisma.enterpriseApproval.findFirstOrThrow({
      where: {
        organizationId,
        targetEntityType: "EnterpriseCashSession",
        targetEntityId: dailySession.id,
        approverUserId: approverUser.id,
        status: "PENDING",
        archivedAt: null,
      },
    });
    expect(approval.requestedByUserId).toBe(adminUser.id);
    await assertNoGlobalOverflow(page, 390);
    await context.close();
  });
});
