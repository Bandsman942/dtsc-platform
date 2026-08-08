import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const baseUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const organizationId = process.env.E2E_ORGANIZATION_ID || "e2e-erp-professional-org";
const adminEmail = process.env.E2E_ADMIN_EMAIL || "erp-admin@example.test";
const adminPassword = process.env.E2E_ADMIN_PASSWORD || "E2eAdmin2026!";

function asNumber(value) {
  return Number(value?.toString?.() ?? value ?? 0);
}

async function readJson(response) {
  const body = await response.json().catch(() => null);
  return { response, body };
}

async function post(page, path, data) {
  return readJson(await page.context().request.post(path, { data, headers: { origin: baseUrl, referer: `${baseUrl}/enterprise-modules/RETAIL_POS` } }));
}

async function get(page, path) {
  return readJson(await page.context().request.get(path));
}

async function del(page, path) {
  return readJson(await page.context().request.delete(path, { headers: { origin: baseUrl, referer: `${baseUrl}/enterprise-modules/RETAIL_POS` } }));
}

async function signIn(page) {
  await page.goto(`/auth/sign-in?next=${encodeURIComponent("/enterprise-modules/RETAIL_POS")}`);
  const emailInput = page.locator('input[name="email"], input[type="email"]').first();
  const passwordInput = page.locator('input[name="password"], input[type="password"]').first();
  const loadContextButton = page.getByRole("button", { name: /^Charger$/i });
  await expect(emailInput).toBeEditable();
  await emailInput.fill(adminEmail);
  await passwordInput.fill(adminPassword);
  const lookupPromise = page.waitForResponse((response) => response.url().endsWith("/api/auth/organizations") && response.request().method() === "POST", { timeout: 15_000 });
  await loadContextButton.click();
  expect((await lookupPromise).ok()).toBeTruthy();
  const select = page.locator('select[name="organizationId"]');
  await expect(select.locator(`option[value="${organizationId}"]`)).toHaveCount(1);
  await select.selectOption(organizationId);
  await page.getByRole("button", { name: /^Se connecter$/i }).click();
  await page.waitForURL((url) => !url.pathname.includes("/auth/sign-in"), { timeout: 30_000 });
}

async function ensureOpenTill(page, cashAccountId) {
  const dashboard = await get(page, `/api/enterprise/${organizationId}/retail/dashboard?moduleCode=RETAIL_POS`);
  expect(dashboard.response.ok(), JSON.stringify(dashboard.body)).toBeTruthy();
  if (dashboard.body?.cashSession?.status === "OPEN") return dashboard.body.cashSession;
  const opened = await post(page, `/api/enterprise/${organizationId}/retail/cash-sessions`, { financialAccountId: cashAccountId, openingAmount: 1000 });
  expect(opened.response.ok(), JSON.stringify(opened.body)).toBeTruthy();
  return opened.body?.session || opened.body;
}

test.describe.serial("Shop 2.0 customer, loyalty, stored value and payment acceptance", () => {
  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test("attaches canonical CRM customer to POS and protects balances under concurrency", async ({ browser }) => {
    const context = await browser.newContext({ baseURL: baseUrl });
    const page = await context.newPage();
    await signIn(page);

    const customer = await prisma.enterpriseBusinessParty.findFirst({
      where: { organizationId, status: "ACTIVE", archivedAt: null, roles: { some: { roleCode: "CUSTOMER", status: "ACTIVE", archivedAt: null } } },
      orderBy: { createdAt: "asc" },
    });
    expect(customer, "E2E tenant needs a canonical CUSTOMER business party").toBeTruthy();

    const customerSearch = await get(page, `/api/enterprise/${organizationId}/retail/customers?search=${encodeURIComponent(customer.legalName.slice(0, 8))}&pageSize=10`);
    expect(customerSearch.response.ok(), JSON.stringify(customerSearch.body)).toBeTruthy();
    expect(customerSearch.body.items.some((item) => item.id === customer.id)).toBe(true);

    const selected = await post(page, `/api/enterprise/${organizationId}/retail/active-customer`, { customerBusinessPartyId: customer.id });
    expect(selected.response.ok(), JSON.stringify(selected.body)).toBeTruthy();
    const active = await get(page, `/api/enterprise/${organizationId}/retail/active-customer`);
    expect(active.body?.customer?.id).toBe(customer.id);

    const programCreate = await post(page, `/api/enterprise/${organizationId}/retail/loyalty/programs`, {
      code: "SHOP2-I3-E2E",
      nameFr: "Fidélité Shop 2 I3",
      nameEn: "Shop 2 I3 Loyalty",
      currencyCode: "USD",
      earnPointsPerCurrencyUnit: 1,
      redeemValuePerPoint: 0.01,
      minimumRedeemPoints: 10,
      status: "ACTIVE",
      settingsJson: { autoEarn: true },
    });
    expect(programCreate.response.ok(), JSON.stringify(programCreate.body)).toBeTruthy();
    const programId = programCreate.body.program.id;

    const [site, warehouse, product, inventoryItem, cashAccount] = await Promise.all([
      prisma.enterpriseSite.findFirst({ where: { organizationId, code: "SHOP2-E2E-SITE", status: "ACTIVE", archivedAt: null } }),
      prisma.enterpriseWarehouse.findFirst({ where: { organizationId, code: "SHOP2-E2E-WH", status: "ACTIVE", archivedAt: null } }),
      prisma.enterpriseCatalogItem.findFirst({ where: { organizationId, code: "SHOP2-COMMERCIAL-SKU", status: "ACTIVE", archivedAt: null } }),
      prisma.enterpriseInventoryItem.findFirst({ where: { organizationId, catalogItem: { code: "SHOP2-COMMERCIAL-SKU" }, status: "ACTIVE", archivedAt: null } }),
      prisma.enterpriseFinancialAccount.findFirst({ where: { organizationId, code: "SHOP2-E2E-CASH", status: "ACTIVE", archivedAt: null } }),
    ]);
    if (!site || !warehouse || !product || !inventoryItem || !cashAccount) throw new Error("Shop 2 iteration 3 E2E fixture incomplete");
    await ensureOpenTill(page, cashAccount.id);

    const preview = await post(page, `/api/enterprise/${organizationId}/retail/pricing/preview`, {
      siteId: site.id,
      customerBusinessPartyId: customer.id,
      currencyCode: "USD",
      channelCode: "POS",
      lines: [{ catalogItemId: product.id, quantity: 1 }],
    });
    expect(preview.response.ok(), JSON.stringify(preview.body)).toBeTruthy();
    const total = asNumber(preview.body.grandTotal);
    expect(total).toBeGreaterThan(0);

    const sale = await post(page, `/api/enterprise/${organizationId}/retail/sales`, {
      siteId: site.id,
      warehouseId: warehouse.id,
      storageLocationId: null,
      currencyCode: "USD",
      idempotencyKey: `shop2-i3-sale-${Date.now()}`,
      lines: [{ catalogItemId: product.id, inventoryItemId: inventoryItem.id, quantity: 1, unitPrice: 1, discountAmount: 0, taxAmount: 0 }],
      tenders: [{ methodType: "CASH", financialAccountId: cashAccount.id, amount: total, reference: "SHOP2-I3-E2E" }],
    });
    expect(sale.response.status(), JSON.stringify(sale.body)).toBe(201);
    expect(sale.body.sale.customerBusinessPartyId).toBe(customer.id);
    expect(sale.body.loyalty.applied.length).toBeGreaterThan(0);

    const loyaltyAccount = await prisma.enterpriseRetailLoyaltyAccount.findFirstOrThrow({ where: { organizationId, programId, customerBusinessPartyId: customer.id } });
    expect(asNumber(loyaltyAccount.pointsBalance)).toBeCloseTo(total, 5);
    const redeemEach = Math.max(10, Math.floor(total * 0.75 * 100) / 100);
    const [loyaltyA, loyaltyB] = await Promise.all([
      post(page, `/api/enterprise/${organizationId}/retail/loyalty/redeem`, { programId, customerBusinessPartyId: customer.id, points: redeemEach, currencyCode: "USD", reason: "Concurrent A", idempotencyKey: `shop2-i3-loyalty-a-${Date.now()}` }),
      post(page, `/api/enterprise/${organizationId}/retail/loyalty/redeem`, { programId, customerBusinessPartyId: customer.id, points: redeemEach, currencyCode: "USD", reason: "Concurrent B", idempotencyKey: `shop2-i3-loyalty-b-${Date.now()}` }),
    ]);
    expect([loyaltyA.response.status(), loyaltyB.response.status()].sort((a, b) => a - b)).toEqual([200, 409]);
    const loyaltyAfter = await prisma.enterpriseRetailLoyaltyAccount.findFirstOrThrow({ where: { id: loyaltyAccount.id } });
    expect(asNumber(loyaltyAfter.pointsBalance)).toBeGreaterThanOrEqual(0);

    const issueKey = `shop2-i3-gift-${Date.now()}`;
    const issued = await post(page, `/api/enterprise/${organizationId}/retail/stored-value`, { accountType: "GIFT_CARD", customerBusinessPartyId: customer.id, currencyCode: "USD", initialValue: 100, idempotencyKey: issueKey });
    expect(issued.response.status(), JSON.stringify(issued.body)).toBe(201);
    expect(issued.body.code).toMatch(/^DTSC-/);
    const giftCode = issued.body.code;
    const replayIssue = await post(page, `/api/enterprise/${organizationId}/retail/stored-value`, { accountType: "GIFT_CARD", customerBusinessPartyId: customer.id, currencyCode: "USD", initialValue: 100, idempotencyKey: issueKey });
    expect(replayIssue.response.status()).toBe(200);
    expect(replayIssue.body.code).toBeNull();
    expect(replayIssue.body.account.id).toBe(issued.body.account.id);

    const [giftA, giftB] = await Promise.all([
      post(page, `/api/enterprise/${organizationId}/retail/stored-value/redeem`, { code: giftCode, amount: 80, currencyCode: "USD", reason: "Concurrent A", idempotencyKey: `shop2-i3-gift-a-${Date.now()}` }),
      post(page, `/api/enterprise/${organizationId}/retail/stored-value/redeem`, { code: giftCode, amount: 80, currencyCode: "USD", reason: "Concurrent B", idempotencyKey: `shop2-i3-gift-b-${Date.now()}` }),
    ]);
    expect([giftA.response.status(), giftB.response.status()].sort((a, b) => a - b)).toEqual([200, 409]);
    const giftAfter = await prisma.enterpriseRetailStoredValueAccount.findFirstOrThrow({ where: { id: issued.body.account.id } });
    expect(asNumber(giftAfter.balance)).toBeCloseTo(20, 5);

    const paymentKey = `shop2-i3-payment-${Date.now()}`;
    const payment = await post(page, `/api/enterprise/${organizationId}/retail/payments`, { methodType: "CARD", currencyCode: "USD", amount: 10, clientReference: `I3-${Date.now()}`, idempotencyKey: paymentKey });
    expect(payment.response.status(), JSON.stringify(payment.body)).toBe(201);
    const replayPayment = await post(page, `/api/enterprise/${organizationId}/retail/payments`, { methodType: "CARD", currencyCode: "USD", amount: 10, clientReference: payment.body.payment.clientReference, idempotencyKey: paymentKey });
    expect(replayPayment.response.status()).toBe(200);
    expect(replayPayment.body.payment.id).toBe(payment.body.payment.id);

    const captured = await post(page, `/api/enterprise/${organizationId}/retail/payments/${payment.body.payment.id}`, { revision: payment.body.payment.revision, status: "CAPTURED", providerReference: "SHOP2-I3-CAPTURED" });
    expect(captured.response.ok(), JSON.stringify(captured.body)).toBeTruthy();
    const invalidTransition = await post(page, `/api/enterprise/${organizationId}/retail/payments/${payment.body.payment.id}`, { revision: captured.body.payment.revision, status: "AUTHORIZED", providerReference: "SHOP2-I3-INVALID" });
    expect(invalidTransition.response.status()).toBe(409);
    expect(invalidTransition.body.error).toBe("RETAIL_PAYMENT_TRANSITION_INVALID");

    const crossTenant = await get(page, `/api/enterprise/not-this-tenant/retail/customers?search=${encodeURIComponent(customer.legalName)}`);
    expect([401, 403, 404]).toContain(crossTenant.response.status());

    const cleared = await del(page, `/api/enterprise/${organizationId}/retail/active-customer`);
    expect(cleared.response.ok()).toBeTruthy();
    await context.close();
  });
});
