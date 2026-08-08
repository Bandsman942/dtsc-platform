import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const baseUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const organizationId = process.env.E2E_ORGANIZATION_ID || "e2e-erp-professional-org";
const adminEmail = process.env.E2E_ADMIN_EMAIL || "erp-admin@example.test";
const adminPassword = process.env.E2E_ADMIN_PASSWORD || "E2eAdmin2026!";
const approverEmail = process.env.E2E_USER_EMAIL || "erp-user@example.test";
const approverPassword = process.env.E2E_USER_PASSWORD || "E2eUser2026!";

const fixture = {
  siteId: "",
  warehouseId: "",
  catalogItemId: "",
  inventoryItemId: "",
  cashAccountId: "",
  refundBankAccountId: "",
  currencyCode: "USD",
};

function asNumber(value) {
  return Number(value?.toString?.() ?? value ?? 0);
}

function expectBalanced(entry, label) {
  const debit = entry.lines.reduce((sum, line) => sum + asNumber(line.debit), 0);
  const credit = entry.lines.reduce((sum, line) => sum + asNumber(line.credit), 0);
  expect(Math.abs(debit - credit), `${label}: debits and credits must balance`).toBeLessThan(0.00001);
  expect(debit, `${label}: journal entry must contain value`).toBeGreaterThan(0);
}

async function loadFixture() {
  const [site, warehouse, product, bank, cash] = await Promise.all([
    prisma.enterpriseSite.findFirst({ where: { organizationId, code: "SHOP2-E2E-SITE", status: "ACTIVE", archivedAt: null } }),
    prisma.enterpriseWarehouse.findFirst({ where: { organizationId, code: "SHOP2-E2E-WH", status: "ACTIVE", archivedAt: null } }),
    prisma.enterpriseCatalogItem.findFirst({ where: { organizationId, code: "SHOP2-COMMERCIAL-SKU", status: "ACTIVE", archivedAt: null } }),
    prisma.enterpriseFinancialAccount.findFirst({ where: { organizationId, code: "SHOP2-E2E-BANK", status: "ACTIVE", archivedAt: null } }),
    prisma.enterpriseFinancialAccount.findFirst({ where: { organizationId, code: "SHOP2-E2E-CASH", status: "ACTIVE", archivedAt: null } }),
  ]);
  if (!site || !warehouse || !product || !bank || !cash) throw new Error("Shop 2 commercial E2E fixture is incomplete");
  const inventoryItem = await prisma.enterpriseInventoryItem.findFirst({ where: { organizationId, catalogItemId: product.id, status: "ACTIVE", archivedAt: null } });
  if (!inventoryItem) throw new Error("Shop 2 commercial E2E inventory item is missing");
  fixture.siteId = site.id;
  fixture.warehouseId = warehouse.id;
  fixture.catalogItemId = product.id;
  fixture.inventoryItemId = inventoryItem.id;
  fixture.cashAccountId = cash.id;
  fixture.refundBankAccountId = bank.id;
}

async function signIn(page, email, password) {
  await page.goto(`/auth/sign-in?next=${encodeURIComponent("/enterprise-modules/RETAIL_POS")}`);
  const emailInput = page.locator('input[name="email"], input[type="email"]').first();
  const passwordInput = page.locator('input[name="password"], input[type="password"]').first();
  const loadContextButton = page.getByRole("button", { name: /^Charger$/i });
  await expect(emailInput).toBeEditable();
  await emailInput.fill(email);
  await passwordInput.fill(password);
  const lookupPromise = page.waitForResponse((response) => response.url().endsWith("/api/auth/organizations") && response.request().method() === "POST", { timeout: 15_000 });
  await loadContextButton.click();
  const lookup = await lookupPromise;
  expect(lookup.ok(), `Organization context lookup failed for ${email}`).toBeTruthy();
  const organizationSelect = page.locator('select[name="organizationId"]');
  await expect(organizationSelect.locator(`option[value="${organizationId}"]`)).toHaveCount(1);
  await organizationSelect.selectOption(organizationId);
  await page.getByRole("button", { name: /^Se connecter$/i }).click();
  await page.waitForURL((url) => !url.pathname.includes("/auth/sign-in"), { timeout: 30_000 });
}

async function apiJson(response) {
  const body = await response.json().catch(() => null);
  return { response, body };
}

async function apiGet(page, path) {
  return apiJson(await page.context().request.get(path));
}

async function apiPost(page, path, data) {
  return apiJson(await page.context().request.post(path, {
    data,
    headers: { origin: baseUrl, referer: `${baseUrl}/enterprise-modules/RETAIL_POS` },
  }));
}

async function ensureOpenTill(page) {
  const dashboard = await apiGet(page, `/api/enterprise/${organizationId}/retail/dashboard?moduleCode=RETAIL_POS`);
  expect(dashboard.response.ok(), JSON.stringify(dashboard.body)).toBeTruthy();
  if (dashboard.body?.cashSession?.status === "OPEN") return dashboard.body.cashSession;
  const opened = await apiPost(page, `/api/enterprise/${organizationId}/retail/cash-sessions`, { financialAccountId: fixture.cashAccountId, openingAmount: 1000 });
  expect(opened.response.ok(), JSON.stringify(opened.body)).toBeTruthy();
  return opened.body?.session || opened.body;
}

async function getJournalEntry(id) {
  return prisma.enterpriseJournalEntry.findUnique({ where: { id }, include: { lines: true } });
}

test.describe.serial("Shop 2.0 commercial engine acceptance", () => {
  test.beforeAll(async () => {
    await loadFixture();
  });

  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test("canonical TTC pricing, VAT, promotion and partial return are server-authoritative", async ({ browser }) => {
    const adminContext = await browser.newContext({ baseURL: baseUrl });
    const adminPage = await adminContext.newPage();
    await signIn(adminPage, adminEmail, adminPassword);
    await ensureOpenTill(adminPage);

    const preview = await apiPost(adminPage, `/api/enterprise/${organizationId}/retail/pricing/preview`, {
      siteId: fixture.siteId,
      currencyCode: fixture.currencyCode,
      channelCode: "POS",
      lines: [{ catalogItemId: fixture.catalogItemId, quantity: 2 }],
    });
    expect(preview.response.ok(), JSON.stringify(preview.body)).toBeTruthy();
    expect(asNumber(preview.body?.subtotal)).toBeCloseTo(200, 5);
    expect(asNumber(preview.body?.discountTotal)).toBeCloseTo(20, 5);
    expect(asNumber(preview.body?.customerDiscountTotal)).toBeCloseTo(23.2, 5);
    expect(asNumber(preview.body?.taxTotal)).toBeCloseTo(28.8, 5);
    expect(asNumber(preview.body?.grandTotal)).toBeCloseTo(208.8, 5);
    expect(preview.body?.lines?.[0]?.resolvedUnitPrice).toBe("116.000000");
    expect(preview.body?.lines?.[0]?.taxIncluded).toBe(true);
    expect(preview.body?.lines?.[0]?.promotions?.some((promotion) => promotion.code === "SHOP2-E2E-10PCT")).toBe(true);

    const beforeStock = await prisma.enterpriseInventoryBalance.findFirstOrThrow({
      where: { organizationId, inventoryItemId: fixture.inventoryItemId, warehouseId: fixture.warehouseId, storageLocationId: null, stockLotId: null },
    });
    const beforeBank = await prisma.enterpriseFinancialAccount.findUniqueOrThrow({ where: { id: fixture.refundBankAccountId } });

    const sale = await apiPost(adminPage, `/api/enterprise/${organizationId}/retail/sales`, {
      siteId: fixture.siteId,
      warehouseId: fixture.warehouseId,
      storageLocationId: null,
      currencyCode: fixture.currencyCode,
      idempotencyKey: `shop2-commercial-sale-${Date.now()}`,
      lines: [{
        catalogItemId: fixture.catalogItemId,
        inventoryItemId: fixture.inventoryItemId,
        quantity: 2,
        // Deliberately stale/browser values: the server must replace them with canonical pricing, promotion and tax.
        unitPrice: 116,
        discountAmount: 0,
        taxAmount: 0,
      }],
      tenders: [{ methodType: "CASH", financialAccountId: fixture.cashAccountId, amount: 208.8, reference: "SHOP2-COMMERCIAL-E2E" }],
    });
    expect(sale.response.status(), JSON.stringify(sale.body)).toBe(201);
    expect(asNumber(sale.body?.sale?.subtotal)).toBeCloseTo(200, 5);
    expect(asNumber(sale.body?.sale?.discountTotal)).toBeCloseTo(20, 5);
    expect(asNumber(sale.body?.sale?.taxTotal)).toBeCloseTo(28.8, 5);
    expect(asNumber(sale.body?.sale?.grandTotal)).toBeCloseTo(208.8, 5);
    expect(sale.body?.commercial?.promotionCount).toBe(1);
    expect(sale.body?.commercial?.overrideApplied).toBe(false);

    const saleId = sale.body.sale.id;
    const saleLineId = sale.body.sale.lines[0].id;
    const decision = await prisma.enterpriseRetailPricingDecision.findFirstOrThrow({ where: { organizationId, saleId, catalogItemId: fixture.catalogItemId } });
    expect(asNumber(decision.baseUnitPrice)).toBeCloseTo(116, 5);
    expect(asNumber(decision.resolvedUnitPrice)).toBeCloseTo(116, 5);
    expect(asNumber(decision.discountAmount)).toBeCloseTo(23.2, 5);
    expect(asNumber(decision.taxRate)).toBeCloseTo(0.16, 5);
    expect(asNumber(decision.taxAmount)).toBeCloseTo(28.8, 5);
    expect(asNumber(decision.lineTotal)).toBeCloseTo(208.8, 5);
    expect(decision.taxIncluded).toBe(true);
    const redemption = await prisma.enterpriseRetailPromotionRedemption.findFirstOrThrow({ where: { organizationId, saleId } });
    expect(asNumber(redemption.discountAmount)).toBeCloseTo(23.2, 5);

    const saleEntry = await getJournalEntry(sale.body.accounting.saleJournalEntryId);
    expect(saleEntry).toBeTruthy();
    expectBalanced(saleEntry, "Retail commercial sale");
    expect(sale.body.accounting.inventoryPostings.length).toBe(1);
    const cogsEntry = await getJournalEntry(sale.body.accounting.inventoryPostings[0].journalEntryId);
    expect(cogsEntry).toBeTruthy();
    expectBalanced(cogsEntry, "Retail commercial COGS");

    const afterSaleStock = await prisma.enterpriseInventoryBalance.findFirstOrThrow({
      where: { organizationId, inventoryItemId: fixture.inventoryItemId, warehouseId: fixture.warehouseId, storageLocationId: null, stockLotId: null },
    });
    expect(asNumber(afterSaleStock.quantityOnHand)).toBeCloseTo(asNumber(beforeStock.quantityOnHand) - 2, 5);

    const requested = await apiPost(adminPage, `/api/enterprise/${organizationId}/retail/sales/${saleId}/returns`, {
      returnType: "RETURN",
      reason: "Retour partiel Shop 2 comportemental",
      refundMethod: "BANK_TRANSFER",
      refundFinancialAccountId: fixture.refundBankAccountId,
      idempotencyKey: `shop2-commercial-return-${Date.now()}`,
      lines: [{ saleLineId, quantity: 1, productCondition: "SELLABLE", stockDisposition: "RESTOCK" }],
    });
    expect(requested.response.status(), JSON.stringify(requested.body)).toBe(201);
    expect(requested.body?.retailReturn?.status).toBe("PENDING_APPROVAL");
    expect(asNumber(requested.body?.retailReturn?.grandTotal)).toBeCloseTo(104.4, 5);

    const selfApproval = await apiPost(adminPage, `/api/enterprise/${organizationId}/retail/returns/${requested.body.retailReturn.id}/decision`, {
      revision: requested.body.retailReturn.revision,
      decision: "APPROVE",
      refundFinancialAccountId: fixture.refundBankAccountId,
      refundReference: "SHOP2-SELF-APPROVAL-MUST-FAIL",
    });
    expect(selfApproval.response.status(), JSON.stringify(selfApproval.body)).toBe(403);
    expect(selfApproval.body?.error).toBe("RETAIL_RETURN_SELF_APPROVAL_FORBIDDEN");

    const approverContext = await browser.newContext({ baseURL: baseUrl });
    const approverPage = await approverContext.newPage();
    await signIn(approverPage, approverEmail, approverPassword);
    const approved = await apiPost(approverPage, `/api/enterprise/${organizationId}/retail/returns/${requested.body.retailReturn.id}/decision`, {
      revision: requested.body.retailReturn.revision,
      decision: "APPROVE",
      refundFinancialAccountId: fixture.refundBankAccountId,
      refundReference: "SHOP2-PARTIAL-RETURN-E2E",
    });
    expect(approved.response.ok(), JSON.stringify(approved.body)).toBeTruthy();
    expect(approved.body?.retailReturn?.status).toBe("COMPLETED");
    expect(approved.body?.accounting?.returnJournalEntryId).toBeTruthy();
    expect(approved.body?.accounting?.inventoryReturnPostings?.length).toBe(1);

    const returnEntry = await getJournalEntry(approved.body.accounting.returnJournalEntryId);
    expect(returnEntry).toBeTruthy();
    expectBalanced(returnEntry, "Retail partial return refund");
    const inventoryReturnEntry = await getJournalEntry(approved.body.accounting.inventoryReturnPostings[0].journalEntryId);
    expect(inventoryReturnEntry).toBeTruthy();
    expectBalanced(inventoryReturnEntry, "Retail partial return inventory");

    const afterReturnStock = await prisma.enterpriseInventoryBalance.findFirstOrThrow({
      where: { organizationId, inventoryItemId: fixture.inventoryItemId, warehouseId: fixture.warehouseId, storageLocationId: null, stockLotId: null },
    });
    expect(asNumber(afterReturnStock.quantityOnHand)).toBeCloseTo(asNumber(beforeStock.quantityOnHand) - 1, 5);
    const afterBank = await prisma.enterpriseFinancialAccount.findUniqueOrThrow({ where: { id: fixture.refundBankAccountId } });
    expect(asNumber(afterBank.operationalBalance)).toBeCloseTo(asNumber(beforeBank.operationalBalance) - 104.4, 5);
    const refund = await prisma.enterpriseRetailRefund.findFirstOrThrow({ where: { organizationId, returnId: requested.body.retailReturn.id } });
    expect(refund.methodType).toBe("BANK_TRANSFER");
    expect(asNumber(refund.amount)).toBeCloseTo(104.4, 5);

    const duplicateReturn = await apiPost(adminPage, `/api/enterprise/${organizationId}/retail/sales/${saleId}/returns`, {
      returnType: "RETURN",
      reason: "La seconde unité reste seule disponible",
      refundMethod: "BANK_TRANSFER",
      refundFinancialAccountId: fixture.refundBankAccountId,
      idempotencyKey: `shop2-commercial-return-excess-${Date.now()}`,
      lines: [{ saleLineId, quantity: 2, productCondition: "SELLABLE", stockDisposition: "RESTOCK" }],
    });
    expect(duplicateReturn.response.status(), JSON.stringify(duplicateReturn.body)).toBe(409);
    expect(duplicateReturn.body?.error).toBe("RETAIL_RETURN_QUANTITY_EXCEEDED");

    await approverContext.close();
    await adminContext.close();
  });
});
