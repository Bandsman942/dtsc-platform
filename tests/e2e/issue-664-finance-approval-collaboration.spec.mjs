import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const baseUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const organizationId = process.env.E2E_ORGANIZATION_ID || "e2e-erp-professional-org";
const adminEmail = (process.env.E2E_ADMIN_EMAIL || "erp-admin@example.test").toLowerCase();
const approverEmail = (process.env.E2E_USER_EMAIL || "erp-user@example.test").toLowerCase();
const approverPassword = process.env.E2E_USER_PASSWORD;

let adminUser;
let approverUser;
let account;
let session;
let approval;

async function enableModule(moduleCode, sortOrder) {
  await prisma.enterpriseModule.upsert({
    where: { organizationId_moduleCode: { organizationId, moduleCode } },
    update: { isEnabled: true },
    create: {
      organizationId,
      moduleCode,
      labelFr: moduleCode,
      labelEn: moduleCode,
      moduleCategory: "HOTFIX_664_E2E",
      isEnabled: true,
      isCore: false,
      requiresPlanLevel: "BUSINESS",
      sortOrder,
    },
  });
}

async function signIn(page, email, password, next) {
  if (!password) throw new Error("Hotfix #664 browser acceptance requires E2E passwords from CI.");
  const response = await page.context().request.post(`${baseUrl}/api/auth/sign-in`, {
    data: { email, password, organizationId, next },
    headers: { origin: baseUrl, referer: `${baseUrl}/auth/sign-in` },
  });
  const body = await response.json().catch(() => null);
  expect(response.ok(), `Sign-in failed for ${email}: ${JSON.stringify(body)}`).toBeTruthy();
}

async function assertNoGlobalOverflow(page, width) {
  await page.waitForLoadState("domcontentloaded");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, `Hotfix #664 must not overflow globally at ${width}px`).toBeLessThanOrEqual(2);
}

test.describe.serial("Hotfix #664 Finance approval and collaboration", () => {
  test.beforeAll(async () => {
    adminUser = await prisma.user.findUnique({ where: { email: adminEmail } });
    approverUser = await prisma.user.findUnique({ where: { email: approverEmail } });
    if (!adminUser || !approverUser) throw new Error("Hotfix #664 requires the canonical ERP E2E users.");

    await prisma.user.update({ where: { id: adminUser.id }, data: { locale: "fr" } });
    await prisma.user.update({ where: { id: approverUser.id }, data: { locale: "fr" } });
    await prisma.organizationMember.upsert({
      where: { organizationId_userId: { organizationId, userId: approverUser.id } },
      update: { role: "ADMIN_ENTERPRISE", status: "ACTIVE", joinedAt: new Date(), removedAt: null },
      create: {
        id: "e2e-664-approver-membership",
        organizationId,
        userId: approverUser.id,
        role: "ADMIN_ENTERPRISE",
        status: "ACTIVE",
        joinedAt: new Date(),
      },
    });

    await enableModule("FINANCE_CASH", 1064);
    await enableModule("DOCUMENTS", 1065);
    await enableModule("VALIDATIONS", 1066);

    const ledger = await prisma.enterpriseLedgerAccount.findFirst({
      where: { organizationId, code: "SHOP2-CASH", isActive: true, archivedAt: null },
    });
    const site = await prisma.enterpriseSite.findFirst({
      where: { organizationId, code: "SHOP2-E2E-SITE", status: "ACTIVE", archivedAt: null },
    });
    if (!ledger || !site) throw new Error("Hotfix #664 requires the canonical Shop 2 cash fixtures.");

    const suffix = String(Date.now()).slice(-8);
    account = await prisma.enterpriseFinancialAccount.create({
      data: {
        organizationId,
        code: `H664-${suffix}`,
        name: `Hotfix 664 collaboration ${suffix}`,
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
    session = await prisma.enterpriseCashSession.create({
      data: {
        organizationId,
        number: `H664-CASH-${suffix}`,
        financialAccountId: account.id,
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
    approval = await prisma.enterpriseApproval.create({
      data: {
        organizationId,
        targetEntityType: "EnterpriseCashSession",
        targetEntityId: session.id,
        requestedByUserId: adminUser.id,
        approverUserId: approverUser.id,
        status: "PENDING",
      },
    });
  });

  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test("short approval comment, precise rejection error and shared collaboration work on mobile", async ({ browser }) => {
    const context = await browser.newContext({ baseURL: baseUrl, viewport: { width: 390, height: 844 } });
    await context.addInitScript(() => localStorage.setItem("theme", "dark"));
    const page = await context.newPage();
    await signIn(page, approverEmail, approverPassword, `/enterprise-modules/FINANCE_CASH?cashSessionId=${session.id}`);

    const invalidResponse = await page.context().request.post(
      `${baseUrl}/api/enterprise/${organizationId}/cash-sessions/${session.id}/validate`,
      {
        data: { approve: false, reason: "Ok", revision: session.revision },
        headers: { origin: baseUrl, referer: `${baseUrl}/enterprise-modules/FINANCE_CASH?cashSessionId=${session.id}` },
      },
    );
    expect(invalidResponse.status()).toBe(400);
    const invalidBody = await invalidResponse.json();
    expect(invalidBody.error).toBe("FINANCE_DECISION_REASON_TOO_SHORT");
    expect(invalidBody.message).toMatch(/4 caractères|4 characters/i);
    expect(invalidBody.details?.fieldErrors?.[0]?.field).toBe("reason");

    await page.goto(`/enterprise-modules/FINANCE_CASH?cashSessionId=${session.id}`);
    await expect(page.getByText(session.number, { exact: true })).toBeVisible();
    await expect(page.getByText("Documents et collaboration", { exact: true })).toBeVisible();

    for (const width of [320, 360, 375, 390, 414, 768, 1024]) {
      await page.setViewportSize({ width, height: width < 600 ? 844 : 900 });
      await assertNoGlobalOverflow(page, width);
    }
    await page.setViewportSize({ width: 390, height: 844 });

    await page.getByText("Documents financiers", { exact: true }).click();
    const viewDocuments = page.getByRole("link", { name: "Voir les documents" });
    const addDocument = page.getByRole("link", { name: "Ajouter un document" });
    await expect(viewDocuments).toBeVisible();
    await expect(addDocument).toBeVisible();
    await expect(viewDocuments).toHaveAttribute("href", new RegExp(`sourceEntityType=EnterpriseCashSession.*sourceEntityId=${session.id}`));
    await expect(addDocument).toHaveAttribute("href", /action=upload/);

    const conversationToggle = page.getByRole("button", { name: /Conversation financière/ });
    await conversationToggle.click();
    const composer = page.locator('textarea[name="content"]');
    await expect(composer).toBeVisible();
    await composer.fill("Conversation E2E #664\nDeuxième ligne.");
    await page.getByRole("button", { name: /Publier le commentaire/ }).click();
    await expect(page.getByText("Conversation E2E #664", { exact: false })).toBeVisible();
    await expect(conversationToggle).toHaveAttribute("aria-expanded", "true");
    await conversationToggle.click();
    await expect(conversationToggle).toHaveAttribute("aria-expanded", "false");
    await conversationToggle.click();
    await expect(page.getByText("Conversation E2E #664", { exact: false })).toBeVisible();

    await page.getByRole("button", { name: "Valider la clôture" }).click();
    const decision = page.getByRole("combobox", { name: "Décision" });
    const reason = page.locator('textarea[name="reason"]');
    await decision.selectOption("false");
    await reason.fill("Ok");
    expect(await reason.evaluate((element) => element.checkValidity())).toBeFalsy();
    await expect(page.getByText(/au moins 4 caractères/i)).toBeVisible();

    await decision.selectOption("true");
    await reason.fill("Ok");
    expect(await reason.evaluate((element) => element.checkValidity())).toBeTruthy();

    const approvePromise = page.waitForResponse((response) =>
      response.url().endsWith(`/api/enterprise/${organizationId}/cash-sessions/${session.id}/validate`)
      && response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Enregistrer la décision" }).click();
    const approveResponse = await approvePromise;
    expect(approveResponse.ok(), await approveResponse.text()).toBeTruthy();

    const persistedSession = await prisma.enterpriseCashSession.findUniqueOrThrow({ where: { id: session.id } });
    const persistedApproval = await prisma.enterpriseApproval.findUniqueOrThrow({ where: { id: approval.id } });
    expect(persistedSession.status).toBe("CLOSED");
    expect(persistedApproval.status).toBe("APPROVED");
    expect(persistedApproval.decisionComment).toBe("Ok");

    await context.close();
  });
});
