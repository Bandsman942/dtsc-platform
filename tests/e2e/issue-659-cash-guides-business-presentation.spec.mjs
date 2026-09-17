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
let cashAccount;
let cashSession;
let approval;

async function signIn(page, email, password, next) {
  if (!password) throw new Error("Hotfix #659 browser acceptance requires E2E passwords from CI.");
  const response = await page.context().request.post(`${baseUrl}/api/auth/sign-in`, {
    data: { email, password, organizationId, next },
    headers: { origin: baseUrl, referer: `${baseUrl}/auth/sign-in` },
  });
  const body = await response.json().catch(() => null);
  expect(response.ok(), `Sign-in failed for ${email}: ${JSON.stringify(body)}`).toBeTruthy();
}

async function post(page, path, data) {
  const response = await page.context().request.post(`${baseUrl}${path}`, {
    data,
    headers: { origin: baseUrl, referer: `${baseUrl}/enterprise-modules/FINANCE_CASH` },
  });
  return { response, body: await response.json().catch(() => null) };
}

async function assertNoGlobalOverflow(page, width) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, `Hotfix #659 must not overflow globally at ${width}px`).toBeLessThanOrEqual(2);
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
      moduleCategory: "HOTFIX_659_E2E",
      isEnabled: true,
      isCore: false,
      requiresPlanLevel: "BUSINESS",
      sortOrder: 950 + index,
    },
  });
}

test.describe.serial("Hotfix #659 cash validation, canonical guides and business labels", () => {
  test.beforeAll(async () => {
    adminUser = await prisma.user.findUnique({ where: { email: adminEmail } });
    approverUser = await prisma.user.findUnique({ where: { email: approverEmail } });
    if (!adminUser || !approverUser) throw new Error("Hotfix #659 requires the canonical ERP E2E users.");

    await prisma.user.update({ where: { id: adminUser.id }, data: { locale: "fr" } });
    await prisma.user.update({ where: { id: approverUser.id }, data: { locale: "en" } });

    await prisma.organizationMember.upsert({
      where: { organizationId_userId: { organizationId, userId: approverUser.id } },
      update: { role: "ADMIN_ENTERPRISE", status: "ACTIVE", joinedAt: new Date(), removedAt: null },
      create: {
        id: "e2e-659-approver-membership",
        organizationId,
        userId: approverUser.id,
        role: "ADMIN_ENTERPRISE",
        status: "ACTIVE",
        joinedAt: new Date(),
      },
    });

    for (const [index, moduleCode] of ["FINANCE_TREASURY", "FINANCE_CASH", "VALIDATIONS"].entries()) {
      await enableModule(moduleCode, index);
    }

    const ledger = await prisma.enterpriseLedgerAccount.findFirst({
      where: { organizationId, code: "SHOP2-CASH", isActive: true, archivedAt: null },
    });
    const site = await prisma.enterpriseSite.findFirst({
      where: { organizationId, code: "SHOP2-E2E-SITE", status: "ACTIVE", archivedAt: null },
    });
    if (!ledger || !site) throw new Error("Hotfix #659 requires the Shop 2 behavioral cash fixture.");

    const suffix = String(Date.now()).slice(-8);
    cashAccount = await prisma.enterpriseFinancialAccount.create({
      data: {
        organizationId,
        code: `H659-${suffix}`,
        name: `Hotfix 659 cash ${suffix}`,
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
  });

  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test("French light-mode cashier closes through an assigned approver with responsive physical counting", async ({ browser }) => {
    const context = await browser.newContext({ baseURL: baseUrl, viewport: { width: 390, height: 844 } });
    await context.addInitScript(() => localStorage.setItem("theme", "light"));
    const page = await context.newPage();
    await signIn(page, adminEmail, adminPassword, "/enterprise-modules/FINANCE_CASH");

    const candidates = await page.context().request.get(
      `${baseUrl}/api/enterprise/${organizationId}/approval-candidates?moduleCode=FINANCE_CASH`,
      { headers: { origin: baseUrl, referer: `${baseUrl}/enterprise-modules/FINANCE_CASH` } },
    );
    expect(candidates.ok(), await candidates.text()).toBeTruthy();
    const candidateBody = await candidates.json();
    expect(candidateBody.candidates.some((item) => item.userId === approverUser.id && item.isRequester === false)).toBe(true);

    const opened = await post(page, `/api/enterprise/${organizationId}/cash-sessions`, {
      financialAccountId: cashAccount.id,
      openingAmount: "100",
    });
    expect(opened.response.ok(), JSON.stringify(opened.body)).toBeTruthy();
    cashSession = opened.body?.session || opened.body;
    expect(cashSession?.id).toBeTruthy();

    await page.goto(`/enterprise-modules/FINANCE_CASH?cashSessionId=${cashSession.id}`);
    await expect(page.getByText(String(cashSession.number), { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Clôturer la caisse" }).click();
    await expect(page.getByText("Assistant de clôture de caisse", { exact: true })).toBeVisible();

    for (const width of [320, 360, 375, 390, 414, 768, 1024]) {
      await page.setViewportSize({ width, height: width < 600 ? 844 : 900 });
      await expect(page.getByRole("combobox", { name: "Validation indépendante" })).toBeVisible();
      await expect(page.getByLabel("Quantité 100 USD")).toBeVisible();
      await assertNoGlobalOverflow(page, width);
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByLabel("Quantité 100 USD").fill("1");
    const approverSelect = page.getByRole("combobox", { name: "Validation indépendante" });
    await expect(approverSelect).toContainText("Utilisateur ERP E2E");
    await approverSelect.selectOption(approverUser.id);
    await approverSelect.focus();
    expect(await page.evaluate(() => document.activeElement?.getAttribute("name"))).toBe("approverUserId");

    await page.getByRole("button", { name: "Soumettre la clôture" }).click();
    await expect(page.getByRole("status")).toContainText("La clôture est soumise à validation indépendante.");

    const persistedSession = await prisma.enterpriseCashSession.findUniqueOrThrow({ where: { id: cashSession.id } });
    expect(persistedSession.status).toBe("PENDING_VALIDATION");
    expect(Number(persistedSession.countedClosingAmount)).toBeCloseTo(100, 6);

    approval = await prisma.enterpriseApproval.findFirstOrThrow({
      where: {
        organizationId,
        targetEntityType: "EnterpriseCashSession",
        targetEntityId: cashSession.id,
        approverUserId: approverUser.id,
        status: "PENDING",
      },
      orderBy: { requestedAt: "desc" },
    });
    const notification = await prisma.notification.findFirst({
      where: { userId: approverUser.id, type: "ENTERPRISE_APPROVAL" },
      orderBy: { createdAt: "desc" },
    });
    expect(notification, "Assigned approver must receive a persisted approval notification").toBeTruthy();

    await context.close();
  });

  test("English dark-mode approval queue uses business wording and never exposes backend target types", async ({ browser }) => {
    expect(approval?.id).toBeTruthy();
    const context = await browser.newContext({ baseURL: baseUrl, viewport: { width: 1440, height: 1000 } });
    await context.addInitScript(() => localStorage.setItem("theme", "dark"));
    const page = await context.newPage();
    await signIn(page, approverEmail, approverPassword, `/enterprise-modules/VALIDATIONS?approval=${approval.id}`);

    await page.goto(`/enterprise-modules/VALIDATIONS?approval=${approval.id}`);
    await expect(page.getByText("Cash close", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("EnterpriseCashSession", { exact: true })).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText("EnterpriseSalesCreditNoteApproval");
    await expect(page.locator("html")).toHaveClass(/dark/);
    await assertNoGlobalOverflow(page, 1440);

    await context.close();
  });
});
