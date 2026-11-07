import { expect, test } from "@playwright/test";
import { pbkdf2Sync, randomBytes } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const baseUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const organizationId = process.env.E2E_ORGANIZATION_ID || "e2e-erp-professional-org";
const ownerEmail = process.env.E2E_ADMIN_EMAIL || "erp-admin@example.test";
const ownerPassword = process.env.E2E_ADMIN_PASSWORD || "E2eAdmin2026!";
const cashierEmail = process.env.E2E_USER_EMAIL || "erp-user@example.test";
const cashierPassword = process.env.E2E_USER_PASSWORD || "E2eUser2026!";
const settlerEmail = "shop2-e2e-finance-settler@example.test";

function testPasswordHash(password) {
  const salt = randomBytes(16).toString("base64url");
  return `pbkdf2:210000:${salt}:${pbkdf2Sync(password, salt, 210000, 32, "sha256").toString("base64url")}`;
}

async function signIn(context, email, password) {
  const response = await context.request.post(`${baseUrl}/api/auth/sign-in`, {
    data: { email, password, organizationId, next: "/enterprise-modules/RETAIL_POS" },
    headers: { origin: baseUrl, referer: `${baseUrl}/auth/sign-in` },
  });
  expect(response.status(), `Sign-in ${email}: ${await response.text()}`).toBe(200);
}

async function post(context, path, data = {}) {
  const response = await context.request.post(path, {
    data, headers: { origin: baseUrl, referer: `${baseUrl}/enterprise-modules/RETAIL_POS` },
  });
  return { status: response.status(), body: await response.json().catch(() => null) };
}

async function ensureStepUp(context, password) {
  const verified = await context.request.get(`${baseUrl}/api/auth/step-up`);
  expect(verified.status()).toBe(200);
  if ((await verified.json()).verified) return;
  const result = await post(context, `${baseUrl}/api/auth/step-up`, { password });
  expect(result.status, JSON.stringify(result.body)).toBe(200);
}

async function financeFixture() {
  const owner = await prisma.user.findUniqueOrThrow({ where: { email: ownerEmail } });
  const cashier = await prisma.user.findUniqueOrThrow({ where: { email: cashierEmail } });
  const settler = await prisma.user.upsert({
    where: { email: settlerEmail },
    update: { name: "Retail Finance E2E Settler", passwordHash: testPasswordHash(cashierPassword), role: "CLIENT", status: "ACTIVE" },
    create: { name: "Retail Finance E2E Settler", email: settlerEmail,
      passwordHash: testPasswordHash(cashierPassword), role: "CLIENT", status: "ACTIVE", locale: "fr" },
  });
  const site = await prisma.enterpriseSite.upsert({
    where: { organizationId_code: { organizationId, code: "SHOP2-E2E-SITE-FINANCE" } },
    update: { name: "Shop 2 E2E Finance Store", status: "ACTIVE", archivedAt: null },
    create: { organizationId, code: "SHOP2-E2E-SITE-FINANCE", name: "Shop 2 E2E Finance Store",
      siteType: "STORE", countryCode: "CD", timezone: "Africa/Kinshasa", status: "ACTIVE", createdByUserId: owner.id },
  });
  const warehouse = await prisma.enterpriseWarehouse.upsert({
    where: { organizationId_code: { organizationId, code: "SHOP2-E2E-WH-FINANCE" } },
    update: { siteId: site.id, name: "Shop 2 E2E Finance Warehouse", status: "ACTIVE", archivedAt: null },
    create: { organizationId, siteId: site.id, code: "SHOP2-E2E-WH-FINANCE", name: "Shop 2 E2E Finance Warehouse",
      warehouseType: "STORE", status: "ACTIVE", createdByUserId: owner.id },
  });
  const position = await prisma.enterprisePosition.upsert({
    where: { organizationId_positionCode: { organizationId, positionCode: "SHOP2-E2E-FINANCE-CASHIER" } },
    update: { permissionsJson: ["enterprise.retail.pos.view", "enterprise.retail.pos.create"], isActive: true },
    create: { organizationId, positionCode: "SHOP2-E2E-FINANCE-CASHIER",
      labelFr: "Facturier-caissier de recette", labelEn: "E2E invoicer-cashier",
      permissionsJson: ["enterprise.retail.pos.view", "enterprise.retail.pos.create"], isActive: true },
  });
  await prisma.organizationMember.upsert({
    where: { organizationId_userId: { organizationId, userId: cashier.id } },
    update: { role: "MEMBER", status: "ACTIVE", removedAt: null,
      positionId: position.id, positionCode: position.positionCode },
    create: { organizationId, userId: cashier.id, role: "MEMBER", status: "ACTIVE",
      positionId: position.id, positionCode: position.positionCode, joinedAt: new Date() },
  });
  await prisma.organizationMember.upsert({
    where: { organizationId_userId: { organizationId, userId: settler.id } },
    update: { role: "ADMIN_ENTREPRISE", status: "ACTIVE", removedAt: null },
    create: { organizationId, userId: settler.id, role: "ADMIN_ENTREPRISE", status: "ACTIVE", joinedAt: new Date() },
  });
  await prisma.enterpriseRetailSiteAssignment.upsert({
    where: { organizationId_siteId_userId: { organizationId, siteId: site.id, userId: cashier.id } },
    // Return requests have their own explicit permission; collection alone
    // must never grant a cashier the right to reverse a sale.
    update: { roleCode: "CASHIER", permissionsJson: ["VIEW_SALES", "PREPARE_INVOICE", "COLLECT_PAYMENT", "REQUEST_INVOICE_RETURN"], isActive: true },
    create: { organizationId, siteId: site.id, userId: cashier.id, roleCode: "CASHIER",
      permissionsJson: ["VIEW_SALES", "PREPARE_INVOICE", "COLLECT_PAYMENT", "REQUEST_INVOICE_RETURN"], isActive: true, createdByUserId: owner.id },
  });
  const baseCatalog = await prisma.enterpriseCatalogItem.findFirstOrThrow({
    where: { organizationId, code: "SHOP2-E2E-SKU", status: "ACTIVE" },
  });
  const currencyCode = (await prisma.enterpriseFinanceConfiguration.findUniqueOrThrow({
    where: { organizationId }, select: { functionalCurrencyCode: true },
  })).functionalCurrencyCode;
  const product = await prisma.enterpriseCatalogItem.upsert({
    where: { organizationId_code: { organizationId, code: "SHOP2-E2E-FINANCE-SKU" } },
    update: { status: "ACTIVE", archivedAt: null, currency: currencyCode, trackInventory: true,
      taxable: false, indicativeSalePrice: 20 },
    create: { organizationId, code: "SHOP2-E2E-FINANCE-SKU", sku: "SHOP2-E2E-FINANCE-SKU",
      name: "Shop 2 Finance checkout item", normalizedName: "shop 2 finance checkout item", itemType: "PRODUCT",
      unitOfMeasureId: baseCatalog.unitOfMeasureId, indicativeSalePrice: 20, indicativeCost: 7,
      currency: currencyCode, taxable: false, trackInventory: true, createdByUserId: owner.id },
  });
  const inventory = await prisma.enterpriseInventoryItem.upsert({
    where: { organizationId_catalogItemId: { organizationId, catalogItemId: product.id } },
    update: { status: "ACTIVE", archivedAt: null, allowNegativeStock: false },
    create: { organizationId, catalogItemId: product.id, status: "ACTIVE",
      allowNegativeStock: false, createdByUserId: owner.id },
  });
  const balance = await prisma.enterpriseInventoryBalance.findFirst({
    where: { organizationId, warehouseId: warehouse.id, inventoryItemId: inventory.id,
      storageLocationId: null, stockLotId: null },
  });
  if (balance) await prisma.enterpriseInventoryBalance.update({ where: { id: balance.id },
    data: { quantityOnHand: 5, quantityReserved: 0 } });
  else await prisma.enterpriseInventoryBalance.create({ data: {
    organizationId, warehouseId: warehouse.id, inventoryItemId: inventory.id,
    quantityOnHand: 5, quantityReserved: 0,
  } });
  const stockKey = `shop2-finance-opening:${inventory.id}:${warehouse.id}`;
  const movement = await prisma.enterpriseStockMovement.findFirst({
    where: { organizationId, idempotencyKey: stockKey },
  }) || await prisma.enterpriseStockMovement.create({ data: {
    organizationId, inventoryItemId: inventory.id, warehouseId: warehouse.id,
    movementType: "OPENING_BALANCE", direction: "IN", quantity: 5, balanceAfter: 5,
    idempotencyKey: stockKey, reason: "Independent Finance lifecycle E2E stock", createdByUserId: owner.id,
  } });
  await prisma.enterpriseInventoryCostLayer.upsert({
    where: { organizationId_sourceMovementId: { organizationId, sourceMovementId: movement.id } },
    update: { remainingQuantity: 5, quantity: 5, unitCost: 7, totalCost: 35, currencyCode },
    create: { organizationId, inventoryItemId: inventory.id, warehouseId: warehouse.id,
      sourceMovementId: movement.id, valuationMethod: "WEIGHTED_AVERAGE", quantity: 5,
      remainingQuantity: 5, unitCost: 7, totalCost: 35, currencyCode, effectiveAt: new Date() },
  });
  const bankTemplate = await prisma.enterpriseFinancialAccount.findFirstOrThrow({
    where: { organizationId, code: "SHOP2-E2E-BANK", accountType: "BANK", status: "ACTIVE" },
  });
  const bank = await prisma.enterpriseFinancialAccount.upsert({
    where: { organizationId_code: { organizationId, code: "SHOP2-E2E-FINANCE-BANK" } },
    update: { name: "Shop 2 Finance test bank", accountType: "BANK", siteId: site.id,
      currencyCode, ledgerAccountId: bankTemplate.ledgerAccountId, status: "ACTIVE", archivedAt: null,
      openingBalance: 0, operationalBalance: 0, reconciledBalance: 0, availableBalance: 0 },
    create: { organizationId, code: "SHOP2-E2E-FINANCE-BANK", name: "Shop 2 Finance test bank",
      accountType: "BANK", siteId: site.id, currencyCode, ledgerAccountId: bankTemplate.ledgerAccountId,
      status: "ACTIVE", openingBalance: 0, operationalBalance: 0, reconciledBalance: 0, availableBalance: 0 },
  });
  return { owner, cashier, settler, site, warehouse, product, inventory, bank, currencyCode };
}

test("#1042 real Finance settlement and five-actor credit, refund and inventory return", async ({ browser }) => {
  if (process.env.CI !== "true" || !/\/dtsc_shop2_behavioral(?:\?|$)/.test(process.env.DATABASE_URL || "")) {
    throw new Error("RETAIL_1042_FINANCE_LIFECYCLE_REQUIRES_EPHEMERAL_CI_DATABASE");
  }
  const context = {
    cashier: await browser.newContext({ baseURL: baseUrl }),
    owner: await browser.newContext({ baseURL: baseUrl }),
    settler: await browser.newContext({ baseURL: baseUrl }),
  };
  let originalSettings;
  try {
    const fixture = await financeFixture();
    const config = await prisma.enterpriseRetailConfiguration.findUniqueOrThrow({ where: { organizationId } });
    originalSettings = config.settingsJson;
    await prisma.enterpriseRetailConfiguration.update({ where: { organizationId }, data: {
      settingsJson: { ...(originalSettings && typeof originalSettings === "object" && !Array.isArray(originalSettings) ? originalSettings : {}),
        invoiceCheckoutEnabled: true, siteStaffIsolationEnabled: true }, revision: { increment: 1 },
    } });
    await Promise.all([
      signIn(context.cashier, cashierEmail, cashierPassword),
      signIn(context.owner, ownerEmail, ownerPassword),
      signIn(context.settler, settlerEmail, cashierPassword),
    ]);
    const base = `/api/enterprise/${organizationId}`;
    const create = await post(context.cashier, base + "/retail/invoices", {
      idempotencyKey: `retail-1042-3actors-invoice-${Date.now()}`, siteId: fixture.site.id,
      warehouseId: fixture.warehouse.id, currencyCode: fixture.currencyCode,
      lines: [{ catalogItemId: fixture.product.id, quantity: 1 }],
    });
    expect(create.status, JSON.stringify(create.body)).toBe(201);
    const invoiceId = create.body.invoice.id;
    const submitted = await post(context.cashier, `${base}/retail/invoices/${invoiceId}/transition`, {
      action: "SUBMIT", revision: create.body.invoice.revision, approverUserId: fixture.owner.id,
    });
    expect(submitted.status, JSON.stringify(submitted.body)).toBe(200);
    expect(submitted.body.invoice.status).toBe("PENDING_APPROVAL");
    const approved = await post(context.owner, `${base}/sales-invoices/${invoiceId}/transition`, {
      action: "APPROVE", revision: submitted.body.invoice.revision,
    });
    expect(approved.status, JSON.stringify(approved.body)).toBe(200);
    const issued = await post(context.owner, `${base}/sales-invoices/${invoiceId}/transition`, {
      action: "ISSUE", revision: approved.body.invoice.revision,
    });
    expect(issued.status, JSON.stringify(issued.body)).toBe(200);
    expect(issued.body.invoice.status).toBe("ISSUED");
    const salesEntry = await prisma.enterpriseJournalEntry.findFirstOrThrow({
      where: { organizationId, sourceEntityType: "EnterpriseSalesInvoice", sourceEntityId: invoiceId, status: "POSTED" },
      include: { lines: true },
    });
    expect(salesEntry.lines.length).toBeGreaterThan(0);
    expect(salesEntry.lines.every((line) => line.siteId === fixture.site.id),
      "A Retail sales invoice must carry its store on every posted ledger line").toBe(true);

    const total = new Prisma.Decimal(issued.body.invoice.grandTotal);
    const partial = total.div(2).toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
    expect(partial.greaterThan(0) && partial.lessThan(total)).toBe(true);
    const amounts = [partial, total.minus(partial)];
    for (let index = 0; index < amounts.length; index += 1) {
      const amount = amounts[index];
      const prepared = await post(context.cashier, `${base}/retail/invoices/${invoiceId}/payments`, {
        idempotencyKey: `retail-1042-3actors-payment-${index}-${Date.now()}`,
        financialAccountId: fixture.bank.id, methodType: "BANK_TRANSFER", amount: amount.toFixed(2),
      });
      expect(prepared.status, JSON.stringify(prepared.body)).toBe(201);
      const paymentId = prepared.body.payment.id;
      const submittedPayment = await post(context.cashier,
        `${base}/retail/invoices/${invoiceId}/payments/${paymentId}/transition`, {
          action: "SUBMIT", revision: prepared.body.payment.revision, approverUserId: fixture.owner.id,
        });
      expect(submittedPayment.status, JSON.stringify(submittedPayment.body)).toBe(200);
      await ensureStepUp(context.owner, ownerPassword);
      const approvedPayment = await post(context.owner, `${base}/payments/${paymentId}/transition`, {
        action: "APPROVE", revision: submittedPayment.body.payment.revision,
      });
      expect(approvedPayment.status, JSON.stringify(approvedPayment.body)).toBe(200);
      await ensureStepUp(context.settler, cashierPassword);
      const confirmed = await post(context.settler, `${base}/payments/${paymentId}/transition`, {
        action: "CONFIRM", revision: approvedPayment.body.payment.revision,
      });
      expect(confirmed.status, JSON.stringify(confirmed.body)).toBe(200);
      const allocated = await post(context.cashier,
        `${base}/retail/invoices/${invoiceId}/payments/${paymentId}/allocate`);
      expect(allocated.status, JSON.stringify(allocated.body)).toBe(201);
      const replay = await post(context.cashier,
        `${base}/retail/invoices/${invoiceId}/payments/${paymentId}/allocate`);
      expect(replay.status, JSON.stringify(replay.body)).toBe(200);
      expect(replay.body.idempotent).toBe(true);
      const invoice = await prisma.enterpriseSalesInvoice.findUniqueOrThrow({ where: { id: invoiceId } });
      const checkout = await prisma.enterpriseRetailInvoiceCheckout.findFirstOrThrow({
        where: { organizationId, salesInvoiceId: invoiceId },
      });
      const movements = await prisma.enterpriseStockMovement.findMany({
        where: { organizationId, sourceEntityType: "EnterpriseSalesInvoice", sourceEntityId: invoiceId,
          movementType: "SALE_FULFILLMENT" },
      });
      if (index === 0) {
        expect(invoice.status).toBe("PARTIALLY_PAID");
        expect(checkout.stockPostedAt).toBeNull();
        expect(movements).toHaveLength(0);
      } else {
        expect(invoice.status).toBe("PAID");
        expect(invoice.outstandingAmount.isZero()).toBe(true);
        expect(checkout.stockPostedAt).not.toBeNull();
        expect(movements).toHaveLength(1);
        expect(new Prisma.Decimal(movements[0].quantity).equals(1)).toBe(true);
        const valuation = await prisma.enterpriseInventoryAccountingEvent.findFirst({
          where: { organizationId, stockMovementId: movements[0].id, status: "POSTED" },
        });
        expect(valuation?.journalEntryId).toBeTruthy();
        const inventoryEntry = await prisma.enterpriseJournalEntry.findUniqueOrThrow({
          where: { id: valuation.journalEntryId }, include: { lines: true },
        });
        expect(inventoryEntry.lines.length).toBeGreaterThan(0);
        expect(inventoryEntry.lines.every((line) => line.siteId === fixture.site.id),
          "Retail COGS and inventory must be posted under the store that owns the stock").toBe(true);
        const balance = await prisma.enterpriseInventoryBalance.findFirstOrThrow({
          where: { organizationId, warehouseId: fixture.warehouse.id, inventoryItemId: fixture.inventory.id,
            storageLocationId: null, stockLotId: null },
        });
        expect(balance.quantityOnHand.equals(4)).toBe(true);
      }
    }

    const readPostedStorePnl = async () => {
      const from = new Date(Date.now() - 86_400_000).toISOString();
      const to = new Date(Date.now() + 86_400_000).toISOString();
      const response = await context.owner.request.get(`${base}/retail/site-overview?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
      expect(response.status()).toBe(200);
      const payload = await response.json();
      expect(payload.financeMarginCertified).toBe(false);
      const row = payload.items.find((item) => item.id === fixture.site.id)?.postedLedger
        ?.find((item) => item.currencyCode === fixture.currencyCode);
      expect(row, "The finance store must expose its posted-ledger, provisional P&L rows").toBeTruthy();
      return row;
    };
    const beforeReturnPnl = await readPostedStorePnl();
    expect(new Prisma.Decimal(beforeReturnPnl.revenue).equals(total)).toBe(true);
    expect(new Prisma.Decimal(beforeReturnPnl.costOfSales).equals(7),
      `The store COGS mapping must recognize ledger accounts without a populated subtype: ${JSON.stringify(beforeReturnPnl)}`).toBe(true);

    // A return is not a cashier's automatic reversal: request, physical
    // inspection, independent approval, Finance preparation and settlement
    // are five different real users, all authenticated over HTTP.
    const inspectorEmail = "shop2-e2e-return-inspector@example.test";
    const preparerEmail = "shop2-e2e-return-preparer@example.test";
    const returnSettlerEmail = "shop2-e2e-return-settler@example.test";
    for (const [email, role] of [[inspectorEmail, "Inspector"], [preparerEmail, "Finance Preparer"],
      [returnSettlerEmail, "Refund Settler"]]) {
      const actor = await prisma.user.upsert({
        where: { email },
        update: { name: `Retail E2E ${role}`, passwordHash: testPasswordHash(cashierPassword), role: "CLIENT", status: "ACTIVE" },
        create: { email, name: `Retail E2E ${role}`, passwordHash: testPasswordHash(cashierPassword), role: "CLIENT", status: "ACTIVE", locale: "fr" },
      });
      await prisma.organizationMember.upsert({
        where: { organizationId_userId: { organizationId, userId: actor.id } },
        update: { role: "ADMIN_ENTREPRISE", status: "ACTIVE", removedAt: null },
        create: { organizationId, userId: actor.id, role: "ADMIN_ENTREPRISE", status: "ACTIVE", joinedAt: new Date() },
      });
    }
    context.inspector = await browser.newContext({ baseURL: baseUrl });
    context.preparer = await browser.newContext({ baseURL: baseUrl });
    context.returnSettler = await browser.newContext({ baseURL: baseUrl });
    await Promise.all([
      signIn(context.inspector, inspectorEmail, cashierPassword),
      signIn(context.preparer, preparerEmail, cashierPassword),
      signIn(context.returnSettler, returnSettlerEmail, cashierPassword),
    ]);
    const checkout = await prisma.enterpriseRetailInvoiceCheckout.findFirstOrThrow({
      where: { organizationId, salesInvoiceId: invoiceId },
      include: { lines: true },
    });
    expect(checkout.lines).toHaveLength(1);
    const returnsPath = `${base}/retail/invoices/${invoiceId}/returns`;
    const request = await post(context.cashier, returnsPath, {
      idempotencyKey: `shop2-five-actor-return-${Date.now()}`,
      approverUserId: fixture.owner.id,
      reason: "Customer returned inspected item for refund",
      lines: [{ checkoutLineId: checkout.lines[0].id, quantity: "1", stockDisposition: "RESTOCK" }],
    });
    expect(request.status, JSON.stringify(request.body)).toBe(201);
    const returnId = request.body.request.id;
    const returnPath = `${returnsPath}/${returnId}`;
    const initialReturnStock = await prisma.enterpriseInventoryBalance.findFirstOrThrow({
      where: { organizationId, warehouseId: fixture.warehouse.id, inventoryItemId: fixture.inventory.id,
        storageLocationId: null, stockLotId: null },
    });
    expect(initialReturnStock.quantityOnHand.equals(4)).toBe(true);
    const inspection = await post(context.inspector, `${returnPath}/inspection`, {
      revision: request.body.request.revision, receivedAndInspected: true,
      notes: "Physical goods received and verified with matching serial number",
    });
    expect(inspection.status, JSON.stringify(inspection.body)).toBe(200);
    const decided = await post(context.owner, `${returnPath}/decision`, {
      decision: "APPROVE", revision: inspection.body.request.revision,
    });
    expect(decided.status, JSON.stringify(decided.body)).toBe(200);
    const preparedRefund = await post(context.preparer, `${returnPath}/prepare`, {
      revision: decided.body.request.revision,
    });
    expect(preparedRefund.status, JSON.stringify(preparedRefund.body)).toBe(201);
    expect(preparedRefund.body.request.status).toBe("FINANCE_PENDING");
    const refundId = preparedRefund.body.request.refundPaymentId;
    const creditId = preparedRefund.body.request.salesCreditNoteId;
    const refund = await prisma.enterprisePayment.findUniqueOrThrow({ where: { id: refundId } });
    const credit = await prisma.enterpriseSalesCreditNote.findUniqueOrThrow({ where: { id: creditId } });
    await ensureStepUp(context.owner, ownerPassword);
    const approveRefund = await post(context.owner, `${base}/payments/${refundId}/transition`, {
      action: "APPROVE", revision: refund.revision,
    });
    expect(approveRefund.status, JSON.stringify(approveRefund.body)).toBe(200);
    const approveCredit = await post(context.owner, `${base}/sales-credit-notes/${creditId}/transition`, {
      action: "APPROVE", revision: credit.revision,
    });
    expect(approveCredit.status, JSON.stringify(approveCredit.body)).toBe(200);
    const beforeSettlement = await prisma.enterpriseStockMovement.count({
      where: { organizationId, sourceEntityType: "EnterpriseRetailInvoiceReturnRequest",
        sourceEntityId: returnId, movementType: "RETURN_IN" },
    });
    expect(beforeSettlement).toBe(0);
    const settlementPayload = {
      revision: preparedRefund.body.request.revision,
      reason: "Returned item verified; refund approved and financial reversal settled",
    };
    const deniedWithoutStepUp = await post(context.returnSettler, `${returnPath}/settle`, settlementPayload);
    expect(deniedWithoutStepUp.status, JSON.stringify(deniedWithoutStepUp.body)).toBe(428);
    expect(deniedWithoutStepUp.body.reasonCode).toBe("STEP_UP_REQUIRED");
    await ensureStepUp(context.returnSettler, cashierPassword);
    const settled = await post(context.returnSettler, `${returnPath}/settle`, settlementPayload);
    expect(settled.status, JSON.stringify(settled.body)).toBe(200);
    expect(settled.body.request.status).toBe("COMPLETED");
    const replay = await post(context.returnSettler, `${returnPath}/settle`, settlementPayload);
    expect(replay.status, JSON.stringify(replay.body)).toBe(200);
    expect(replay.body.idempotent).toBe(true);
    const returnMovements = await prisma.enterpriseStockMovement.findMany({
      where: { organizationId, sourceEntityType: "EnterpriseRetailInvoiceReturnRequest",
        sourceEntityId: returnId, movementType: "RETURN_IN" },
    });
    expect(returnMovements).toHaveLength(1);
    const returnValuation = await prisma.enterpriseInventoryAccountingEvent.findFirstOrThrow({
      where: { organizationId, stockMovementId: returnMovements[0].id, status: "POSTED" },
    });
    expect(returnValuation.journalEntryId).toBeTruthy();
    const returnEntry = await prisma.enterpriseJournalEntry.findUniqueOrThrow({
      where: { id: returnValuation.journalEntryId }, include: { lines: true },
    });
    expect(returnEntry.lines.length).toBeGreaterThan(0);
    expect(returnEntry.lines.every((line) => line.siteId === fixture.site.id),
      "Return valuation and COGS reversal must preserve the original store").toBe(true);
    const afterReturn = await prisma.enterpriseInventoryBalance.findFirstOrThrow({
      where: { organizationId, warehouseId: fixture.warehouse.id, inventoryItemId: fixture.inventory.id,
        storageLocationId: null, stockLotId: null },
    });
    expect(afterReturn.quantityOnHand.equals(5)).toBe(true);
    const creditedInvoice = await prisma.enterpriseSalesInvoice.findUniqueOrThrow({ where: { id: invoiceId } });
    expect(creditedInvoice.status).toBe("CREDIT_NOTE");
    const afterReturnPnl = await readPostedStorePnl();
    expect(new Prisma.Decimal(afterReturnPnl.revenue).isZero()).toBe(true);
    expect(new Prisma.Decimal(afterReturnPnl.costOfSales).isZero()).toBe(true);
  } finally {
    if (originalSettings !== undefined) await prisma.enterpriseRetailConfiguration.update({
      where: { organizationId }, data: { settingsJson: originalSettings === null ? Prisma.DbNull : originalSettings,
        revision: { increment: 1 } },
    });
    await Promise.all(Object.values(context).map((browserContext) => browserContext.close()));
    await prisma.$disconnect();
  }
});
