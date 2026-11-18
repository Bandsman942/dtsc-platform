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
  const bank2 = await prisma.enterpriseFinancialAccount.upsert({
    where: { organizationId_code: { organizationId, code: "SHOP2-E2E-FINANCE-BANK2" } },
    update: { name: "Shop 2 Finance test bank 2", accountType: "BANK", siteId: site.id,
      currencyCode, ledgerAccountId: bankTemplate.ledgerAccountId, status: "ACTIVE", archivedAt: null,
      openingBalance: 0, operationalBalance: 0, reconciledBalance: 0, availableBalance: 0 },
    create: { organizationId, code: "SHOP2-E2E-FINANCE-BANK2", name: "Shop 2 Finance test bank 2",
      accountType: "BANK", siteId: site.id, currencyCode, ledgerAccountId: bankTemplate.ledgerAccountId,
      status: "ACTIVE", openingBalance: 0, operationalBalance: 0, reconciledBalance: 0, availableBalance: 0 },
  });
  return { owner, cashier, settler, site, warehouse, product, inventory, bank, bank2, currencyCode };
}

test("#1042 real Finance settlement and five-actor credit, refund and inventory return", async ({ browser }) => {
  // #1187 adds two independent cancellation flows and the FX invoice journal
  // to the same serializable PostgreSQL scenario. Keep the timeout local.
  test.setTimeout(240_000);
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
        financialAccountId: index === 0 ? fixture.bank.id : fixture.bank2.id,
        methodType: "BANK_TRANSFER", amount: amount.toFixed(2),
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
      // Finance confirmation now allocates the POS invoice inside the same
      // serializable transaction. The legacy manual endpoint is idempotent and
      // must not create a second allocation or treasury movement.
      const canonicalAllocations = await prisma.enterprisePaymentAllocation.findMany({
        where: { organizationId, paymentId },
      });
      expect(canonicalAllocations).toHaveLength(1);
      expect(canonicalAllocations[0].amount.equals(amount)).toBe(true);
      expect(await prisma.enterpriseTreasuryTransaction.count({ where: { organizationId, paymentId } })).toBe(1);
      const allocated = await post(context.cashier,
        `${base}/retail/invoices/${invoiceId}/payments/${paymentId}/allocate`);
      expect(allocated.status, JSON.stringify(allocated.body)).toBe(200);
      expect(allocated.body.idempotent).toBe(true);
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
    const payoutLegs = await prisma.enterpriseRetailInvoiceReturnRefundLeg.findMany({
      where: { organizationId, returnRequestId: returnId }, include: { refundPayment: true },
    });
    expect(payoutLegs).toHaveLength(2);
    expect(new Set(payoutLegs.map((leg) => leg.financialAccountId))).toEqual(new Set([fixture.bank.id, fixture.bank2.id]));
    expect(payoutLegs.reduce((total, leg) => total.plus(leg.amount), new Prisma.Decimal(0)).equals(total)).toBe(true);
    expect(payoutLegs.some((leg) => leg.refundPaymentId === refundId)).toBe(true);
    const credit = await prisma.enterpriseSalesCreditNote.findUniqueOrThrow({ where: { id: creditId } });
    await ensureStepUp(context.owner, ownerPassword);
    for (const leg of payoutLegs) {
      const approveRefund = await post(context.owner, `${base}/payments/${leg.refundPaymentId}/transition`, {
        action: "APPROVE", revision: leg.refundPayment.revision,
      });
      expect(approveRefund.status, JSON.stringify(approveRefund.body)).toBe(200);
    }
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
    const payoutStatuses = await prisma.enterprisePayment.findMany({
      where: { organizationId, id: { in: payoutLegs.map((leg) => leg.refundPaymentId) } },
      select: { status: true, amount: true, financialAccountId: true },
    });
    expect(payoutStatuses).toHaveLength(2);
    expect(payoutStatuses.every((entry) => entry.status === "CONFIRMED")).toBe(true);
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
    // #1187: Real PostgreSQL + HTTP acceptance in the same isolated CI DB.
    // These operations test accounting/allocations, not just in-memory Decimal.
    async function exerciseUnfulfilledCredit({ partlyPaid }) {
      const invoiceCreated = await post(context.cashier, base + "/retail/invoices", {
        idempotencyKey: `retail-1187-${partlyPaid ? "part" : "unpaid"}-invoice-${Date.now()}`,
        siteId: fixture.site.id, warehouseId: fixture.warehouse.id,
        currencyCode: fixture.currencyCode,
        lines: [{ catalogItemId: fixture.product.id, quantity: 1 }],
      });
      expect(invoiceCreated.status, JSON.stringify(invoiceCreated.body)).toBe(201);
      const id = invoiceCreated.body.invoice.id;
      const submitted = await post(context.cashier, `${base}/retail/invoices/${id}/transition`, {
        action: "SUBMIT", revision: invoiceCreated.body.invoice.revision, approverUserId: fixture.owner.id,
      });
      expect(submitted.status, JSON.stringify(submitted.body)).toBe(200);
      const approved = await post(context.owner, `${base}/sales-invoices/${id}/transition`, {
        action: "APPROVE", revision: submitted.body.invoice.revision,
      });
      expect(approved.status, JSON.stringify(approved.body)).toBe(200);
      const issued = await post(context.owner, `${base}/sales-invoices/${id}/transition`, {
        action: "ISSUE", revision: approved.body.invoice.revision,
      });
      expect(issued.status, JSON.stringify(issued.body)).toBe(200);
      const grandTotal = new Prisma.Decimal(issued.body.invoice.grandTotal);
      const partialAmount = grandTotal.div(2).toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
      if (partlyPaid) {
        const paymentDraft = await post(context.cashier, `${base}/retail/invoices/${id}/payments`, {
          idempotencyKey: `retail-1187-part-payment-${Date.now()}`,
          financialAccountId: fixture.bank.id, methodType: "BANK_TRANSFER",
          amount: partialAmount.toFixed(2),
        });
        expect(paymentDraft.status, JSON.stringify(paymentDraft.body)).toBe(201);
        const paymentId = paymentDraft.body.payment.id;
        const paymentSubmitted = await post(context.cashier, `${base}/retail/invoices/${id}/payments/${paymentId}/transition`, {
          action: "SUBMIT", revision: paymentDraft.body.payment.revision, approverUserId: fixture.owner.id,
        });
        expect(paymentSubmitted.status, JSON.stringify(paymentSubmitted.body)).toBe(200);
        const paymentApproved = await post(context.owner, `${base}/payments/${paymentId}/transition`, {
          action: "APPROVE", revision: paymentSubmitted.body.payment.revision,
        });
        expect(paymentApproved.status, JSON.stringify(paymentApproved.body)).toBe(200);
        const confirmed = await post(context.settler, `${base}/payments/${paymentId}/transition`, {
          action: "CONFIRM", revision: paymentApproved.body.payment.revision,
        });
        expect(confirmed.status, JSON.stringify(confirmed.body)).toBe(200);
      }
      const invoiceBefore = await prisma.enterpriseSalesInvoice.findUniqueOrThrow({ where: { id } });
      expect(invoiceBefore.status).toBe(partlyPaid ? "PARTIALLY_PAID" : "ISSUED");
      const checkout = await prisma.enterpriseRetailInvoiceCheckout.findFirstOrThrow({
        where: { organizationId, salesInvoiceId: id }, include: { lines: true },
      });
      expect(checkout.stockPostedAt).toBeNull();
      const amountBefore = await prisma.enterpriseInventoryBalance.findFirstOrThrow({
        where: { organizationId, warehouseId: fixture.warehouse.id,
          inventoryItemId: fixture.inventory.id, storageLocationId: null, stockLotId: null },
      });
      const returnPath = `${base}/retail/invoices/${id}/returns`;
      const requested = await post(context.cashier, returnPath, {
        idempotencyKey: `retail-1187-${partlyPaid ? "part" : "zero"}-credit-${Date.now()}`,
        approverUserId: fixture.owner.id,
        reason: "Customer order cancelled before any physical delivery",
        lines: [{ checkoutLineId: checkout.lines[0].id, quantity: "1", stockDisposition: "UNDELIVERED_CREDIT" }],
      });
      expect(requested.status, JSON.stringify(requested.body)).toBe(201);
      const rPath = `${returnPath}/${requested.body.request.id}`;
      const inspected = await post(context.inspector, `${rPath}/inspection`, {
        revision: requested.body.request.revision, receivedAndInspected: true,
        notes: "Independently verified that the merchandise was never delivered to the customer",
      });
      expect(inspected.status, JSON.stringify(inspected.body)).toBe(200);
      const decided = await post(context.owner, `${rPath}/decision`, {
        revision: inspected.body.request.revision, decision: "APPROVE",
      });
      expect(decided.status, JSON.stringify(decided.body)).toBe(200);
      const prepared = await post(context.preparer, `${rPath}/prepare`, {
        revision: decided.body.request.revision, financeApproverUserId: fixture.owner.id,
      });
      expect(prepared.status, JSON.stringify(prepared.body)).toBe(201);
      const req = prepared.body.request;
      expect(req.status).toBe("FINANCE_PENDING");
      expect(new Prisma.Decimal(req.refundAmount).equals(grandTotal)).toBe(true);
      expect(new Prisma.Decimal(req.refundPayoutAmount).equals(partlyPaid ? partialAmount : 0)).toBe(true);
      const legs = await prisma.enterpriseRetailInvoiceReturnRefundLeg.findMany({
        where: { organizationId, returnRequestId: req.id }, include: { refundPayment: true },
      });
      // The canonical return engine creates a separate leg table only when
      // refunding to multiple accounts. A single-account payout is linked by
      // request.refundPaymentId, and a credit-only return has neither.
      expect(legs).toHaveLength(0);
      expect(Boolean(req.refundPaymentId)).toBe(partlyPaid);
      const refundPayment = req.refundPaymentId
        ? await prisma.enterprisePayment.findUniqueOrThrow({ where: { id: req.refundPaymentId } })
        : null;
      const credit = await prisma.enterpriseSalesCreditNote.findUniqueOrThrow({ where: { id: req.salesCreditNoteId } });
      if (refundPayment) {
        const paymentApproval = await post(context.owner, `${base}/payments/${refundPayment.id}/transition`, {
          action: "APPROVE", revision: refundPayment.revision,
        });
        expect(paymentApproval.status, JSON.stringify(paymentApproval.body)).toBe(200);
      }
      const creditApproval = await post(context.owner, `${base}/sales-credit-notes/${credit.id}/transition`, {
        action: "APPROVE", revision: credit.revision,
      });
      expect(creditApproval.status, JSON.stringify(creditApproval.body)).toBe(200);
      const settlementData = { revision: req.revision, reason: "Verified pre-delivery cancellation and canonical credit" };
      const settled = await post(context.returnSettler, `${rPath}/settle`, settlementData);
      expect(settled.status, JSON.stringify(settled.body)).toBe(200);
      expect(settled.body.request.status).toBe("COMPLETED");
      const replay = await post(context.returnSettler, `${rPath}/settle`, settlementData);
      expect(replay.status, JSON.stringify(replay.body)).toBe(200);
      expect(replay.body.idempotent).toBe(true);
      const invoiceAfter = await prisma.enterpriseSalesInvoice.findUniqueOrThrow({ where: { id } });
      expect(invoiceAfter.status).toBe("CREDIT_NOTE");
      expect(invoiceAfter.outstandingAmount.isZero()).toBe(true);
      const entries = await prisma.enterpriseStockMovement.findMany({
        where: { organizationId, sourceEntityType: "EnterpriseRetailInvoiceReturnRequest",
          sourceEntityId: req.id },
      });
      expect(entries).toHaveLength(0);
      expect(await prisma.enterpriseStockMovement.count({
        where: { organizationId, sourceEntityType: "EnterpriseSalesInvoice", sourceEntityId: id,
          movementType: "SALE_FULFILLMENT" },
      })).toBe(0);
      const after = await prisma.enterpriseInventoryBalance.findFirstOrThrow({
        where: { organizationId, warehouseId: fixture.warehouse.id,
          inventoryItemId: fixture.inventory.id, storageLocationId: null, stockLotId: null },
      });
      expect(after.quantityOnHand.equals(amountBefore.quantityOnHand)).toBe(true);
      const refundTransactions = await prisma.enterpriseTreasuryTransaction.findMany({
        where: { organizationId, paymentId: { in: refundPayment ? [refundPayment.id] : [] } },
      });
      expect(refundTransactions).toHaveLength(partlyPaid ? 1 : 0);
      if (partlyPaid) {
        expect(refundTransactions[0].amount.equals(partialAmount)).toBe(true);
        expect(refundPayment?.financialAccountId).toBe(fixture.bank.id);
      }
    }
    await exerciseUnfulfilledCredit({ partlyPaid: false });
    await exerciseUnfulfilledCredit({ partlyPaid: true });
    // #1190 + #1191 joint acceptance: Finance rate, mixed catalog currencies,
    // one invoice currency, and durable per-line FX evidence in PostgreSQL.
    const functional = fixture.currencyCode;
    const foreign = functional === "CDF" ? "USD" : "CDF";
    const serviceItems = [];
    for (const { code, currency, unit } of [
      { code: "SHOP2-E2E-FX-FUNCTIONAL", currency: functional, unit: 20 },
      { code: "SHOP2-E2E-FX-FOREIGN", currency: foreign, unit: 10 },
    ]) {
      const item = await prisma.enterpriseCatalogItem.upsert({
        where: { organizationId_code: { organizationId, code } },
        update: { status: "ACTIVE", archivedAt: null, itemType: "SERVICE",
          currency, trackInventory: false, taxable: false, indicativeSalePrice: unit },
        create: { organizationId, code, sku: code,
          name: "FX E2E service " + code, normalizedName: ("fx e2e service " + code).toLowerCase(),
          itemType: "SERVICE", unitOfMeasureId: fixture.product.unitOfMeasureId,
          currency, trackInventory: false, taxable: false, indicativeSalePrice: unit,
          createdByUserId: fixture.owner.id },
      });
      serviceItems.push(item);
    }
    const activeRate = await prisma.enterpriseExchangeRate.create({
      data: { organizationId, sourceCurrencyCode: foreign,
        targetCurrencyCode: functional, rate: new Prisma.Decimal("2.5"),
        rateDate: new Date(Date.now() - 120000), source: "RETAIL_1187_REAL_E2E",
        status: "ACTIVE", createdByUserId: fixture.owner.id },
    });
    const quote = await post(context.cashier, base + "/retail/invoice-fx-preview", {
      siteId: fixture.site.id, currencyCode: functional,
      channelCode: "POS", invoiceCheckout: true,
      lines: serviceItems.map((item) => ({ catalogItemId: item.id, quantity: 1 })),
    });
    expect(quote.status, JSON.stringify(quote.body)).toBe(200);
    expect(quote.body.currencyCode).toBe(functional);
    expect(new Prisma.Decimal(quote.body.grandTotal).equals(45)).toBe(true);
    const convertedLine = quote.body.lines.find((line) => line.catalogItemId === serviceItems[1].id);
    expect(convertedLine).toBeTruthy();
    expect(convertedLine.invoiceFx.sourceCurrencyCode).toBe(foreign);
    expect(convertedLine.invoiceFx.targetCurrencyCode).toBe(functional);
    expect(new Prisma.Decimal(convertedLine.invoiceFx.rate).equals("2.5")).toBe(true);
    expect(convertedLine.invoiceFx.rateId).toBe(activeRate.id);
    const mixedCreated = await post(context.cashier, base + "/retail/invoices", {
      idempotencyKey: `shop2-fx-mixed-${Date.now()}`,
      siteId: fixture.site.id, warehouseId: fixture.warehouse.id,
      currencyCode: functional,
      lines: serviceItems.map((item) => ({ catalogItemId: item.id, quantity: 1 })),
    });
    expect(mixedCreated.status, JSON.stringify(mixedCreated.body)).toBe(201);
    const mixedId = mixedCreated.body.invoice.id;
    const mixedInvoice = await prisma.enterpriseSalesInvoice.findUniqueOrThrow({
      where: { id: mixedId }, include: { items: true },
    });
    expect(mixedInvoice.currencyCode).toBe(functional);
    expect(mixedInvoice.grandTotal.equals(45)).toBe(true);
    const foreignItem = mixedInvoice.items.find((item) => item.catalogItemId === serviceItems[1].id);
    expect(foreignItem).toBeTruthy();
    const snapshot = await prisma.enterpriseExchangeRateSnapshot.findFirst({
      where: { organizationId, sourceEntityType: "EnterpriseSalesInvoiceItem",
        sourceEntityId: foreignItem.id, sourceCurrencyCode: foreign,
        targetCurrencyCode: functional },
    });
    expect(snapshot).toBeTruthy();
    expect(snapshot.rate.equals("2.5")).toBe(true);
    expect(snapshot.source).toContain(activeRate.id);
    const mixedSubmitted = await post(context.cashier, `${base}/retail/invoices/${mixedId}/transition`, {
      action: "SUBMIT", revision: mixedCreated.body.invoice.revision,
      approverUserId: fixture.owner.id,
    });
    expect(mixedSubmitted.status, JSON.stringify(mixedSubmitted.body)).toBe(200);
    const mixedApproved = await post(context.owner, `${base}/sales-invoices/${mixedId}/transition`, {
      action: "APPROVE", revision: mixedSubmitted.body.invoice.revision,
    });
    expect(mixedApproved.status, JSON.stringify(mixedApproved.body)).toBe(200);
    const mixedIssued = await post(context.owner, `${base}/sales-invoices/${mixedId}/transition`, {
      action: "ISSUE", revision: mixedApproved.body.invoice.revision,
    });
    expect(mixedIssued.status, JSON.stringify(mixedIssued.body)).toBe(200);
    const fxLedger = await prisma.enterpriseJournalEntry.findFirstOrThrow({
      where: { organizationId, sourceEntityType: "EnterpriseSalesInvoice",
        sourceEntityId: mixedId, status: "POSTED" },
      include: { lines: true },
    });
    expect(fxLedger.lines.length).toBeGreaterThan(0);
    expect(fxLedger.lines.every((line) => line.siteId === fixture.site.id)).toBe(true);
    expect(fxLedger.totalDebit.equals(fxLedger.totalCredit)).toBe(true);

    // #1212: a unique financial line across two physical batches, then
    // independently inspect and return ONLY the second batch.
    const batchKey = "SHOP2-LOT1212-" + crypto.randomUUID().slice(0, 12);
    const batchProduct = await prisma.enterpriseCatalogItem.create({ data: {
      organizationId, code: batchKey, sku: batchKey, name: "E2E multi-batch product " + batchKey,
      normalizedName: batchKey.toLowerCase(), itemType: "PRODUCT", unitOfMeasureId: fixture.product.unitOfMeasureId,
      indicativeSalePrice: 20, indicativeCost: 7, currency: fixture.currencyCode, taxable: false, trackInventory: true, createdByUserId: fixture.owner.id,
    } });
    const batchInventory = await prisma.enterpriseInventoryItem.create({ data: { organizationId, catalogItemId: batchProduct.id, lotTracking: true, expiryTracking: true, createdByUserId: fixture.owner.id } });
    const batches = [];
    for (const [suffix, units, days] of [["EARLY", 2, 45], ["LATE", 3, 90]]) {
      const expiryDate = new Date(Date.now() + days * 86400000); expiryDate.setUTCHours(0,0,0,0);
      const lot = await prisma.enterpriseStockLot.create({ data: { organizationId, inventoryItemId: batchInventory.id, warehouseId: fixture.warehouse.id, lotNumber: suffix, expiryDate, createdByUserId: fixture.owner.id } });
      const balance = await prisma.enterpriseInventoryBalance.create({ data: { organizationId, inventoryItemId: batchInventory.id, warehouseId: fixture.warehouse.id, stockLotId: lot.id, quantityOnHand: units } });
      const movement = await prisma.enterpriseStockMovement.create({ data: { organizationId, inventoryItemId: batchInventory.id, warehouseId: fixture.warehouse.id, stockLotId: lot.id, movementType: "OPENING_BALANCE", direction: "IN", quantity: units, balanceAfter: units, idempotencyKey: batchKey + ":" + suffix, createdByUserId: fixture.owner.id } });
      await prisma.enterpriseInventoryCostLayer.create({ data: { organizationId, inventoryItemId: batchInventory.id, warehouseId: fixture.warehouse.id, sourceMovementId: movement.id, valuationMethod: "WEIGHTED_AVERAGE", quantity: units, remainingQuantity: units, unitCost: 7, totalCost: 7*units, currencyCode: fixture.currencyCode, effectiveAt: new Date() } });
      batches.push({ lot, balance });
    }
    const batchPayload = { idempotencyKey: batchKey + "-invoice", siteId: fixture.site.id, warehouseId: fixture.warehouse.id, currencyCode: fixture.currencyCode, lines: [{ catalogItemId: batchProduct.id, quantity: 4 }] };
    const batchInvoice = await post(context.cashier, base + "/retail/invoices", batchPayload);
    expect(batchInvoice.status, JSON.stringify(batchInvoice.body)).toBe(201);
    const bi = batchInvoice.body.invoice.id;
    expect(batchInvoice.body.invoice.items).toHaveLength(1);
    expect(new Prisma.Decimal(batchInvoice.body.invoice.grandTotal).equals(80)).toBe(true);
    const batchCheckout = await prisma.enterpriseRetailInvoiceCheckout.findFirstOrThrow({ where: { organizationId, salesInvoiceId: bi }, include: { lines: true } });
    expect(batchCheckout.lines).toHaveLength(1);
    expect(batchCheckout.lines[0].lotAllocations).toEqual([{stockLotId:batches[0].lot.id,quantity:"2"},{stockLotId:batches[1].lot.id,quantity:"2"}]);
    const batchReplay = await post(context.cashier, base + "/retail/invoices", batchPayload);
    expect(batchReplay.status).toBe(200);
    expect(batchReplay.body.invoice.id).toBe(bi);
    const oversold = await post(context.cashier, base + "/retail/invoices", { ...batchPayload, idempotencyKey:batchKey+"-oversold", lines:[{catalogItemId:batchProduct.id,quantity:2}] });
    expect(oversold.status,JSON.stringify(oversold.body)).toBe(409);
    const batchStock = async index => (await prisma.enterpriseInventoryBalance.findUniqueOrThrow({where:{id:batches[index].balance.id}})).quantityOnHand;
    expect((await batchStock(0)).equals(2)).toBe(true);
    expect((await batchStock(1)).equals(3)).toBe(true);
    const bs = await post(context.cashier, `${base}/retail/invoices/${bi}/transition`, {action:"SUBMIT",revision:batchInvoice.body.invoice.revision,approverUserId:fixture.owner.id});
    expect(bs.status,JSON.stringify(bs.body)).toBe(200);
    const ba = await post(context.owner,`${base}/sales-invoices/${bi}/transition`,{action:"APPROVE",revision:bs.body.invoice.revision});
    expect(ba.status,JSON.stringify(ba.body)).toBe(200);
    const bp = await post(context.owner,`${base}/sales-invoices/${bi}/transition`,{action:"ISSUE",revision:ba.body.invoice.revision});
    expect(bp.status,JSON.stringify(bp.body)).toBe(200);
    const payment = await post(context.cashier,`${base}/retail/invoices/${bi}/payments`,{idempotencyKey:batchKey+"-payment",financialAccountId:fixture.bank.id,methodType:"BANK_TRANSFER",amount:"80.00"});
    expect(payment.status,JSON.stringify(payment.body)).toBe(201);
    const paymentId = payment.body.payment.id;
    const ps = await post(context.cashier,`${base}/retail/invoices/${bi}/payments/${paymentId}/transition`,{action:"SUBMIT",revision:payment.body.payment.revision,approverUserId:fixture.owner.id});
    expect(ps.status,JSON.stringify(ps.body)).toBe(200);
    await ensureStepUp(context.owner,ownerPassword);
    const pa = await post(context.owner,`${base}/payments/${paymentId}/transition`,{action:"APPROVE",revision:ps.body.payment.revision});
    expect(pa.status,JSON.stringify(pa.body)).toBe(200);
    await ensureStepUp(context.settler,cashierPassword);
    const pc = await post(context.settler,`${base}/payments/${paymentId}/transition`,{action:"CONFIRM",revision:pa.body.payment.revision});
    expect(pc.status,JSON.stringify(pc.body)).toBe(200);
    const issues = await prisma.enterpriseStockMovement.findMany({where:{organizationId,sourceEntityType:"EnterpriseSalesInvoice",sourceEntityId:bi,movementType:"SALE_FULFILLMENT"}});
    expect(issues).toHaveLength(2);
    expect(issues.every(row=>row.sourceLineId===batchCheckout.lines[0].invoiceItemId)).toBe(true);
    expect(issues.map(row=>[row.stockLotId,Number(row.quantity)]).sort()).toEqual([[batches[0].lot.id,2],[batches[1].lot.id,2]].sort());
    expect((await batchStock(0)).isZero()).toBe(true);
    expect((await batchStock(1)).equals(1)).toBe(true);
    const costs = await prisma.enterpriseInventoryAccountingEvent.findMany({where:{organizationId,stockMovementId:{in:issues.map(row=>row.id)},status:"POSTED"}});
    expect(costs).toHaveLength(2);
    expect(costs.reduce((sum,row)=>sum.plus(row.totalCost),new Prisma.Decimal(0)).equals(28)).toBe(true);
    const rbase = `${base}/retail/invoices/${bi}/returns`;
    const listed = await context.cashier.request.get(rbase);
    expect(listed.status()).toBe(200);
    const choices = (await listed.json()).batchOptions[batchCheckout.lines[0].id];
    expect(choices.map(row=>[row.lotNumber,row.quantityAvailable]).sort()).toEqual([["EARLY","2"],["LATE","2"]]);
    const returnPayload = {idempotencyKey:batchKey+"-return",approverUserId:fixture.owner.id,reason:"Return physically identified late batch",lines:[{checkoutLineId:batchCheckout.lines[0].id,quantity:"1",stockDisposition:"RESTOCK"}]};
    const unidentified = await post(context.cashier,rbase,returnPayload);
    expect(unidentified.status).toBe(409);
    const rr = await post(context.cashier,rbase,{...returnPayload,lines:[{...returnPayload.lines[0],lotAllocations:[{stockLotId:batches[1].lot.id,quantity:"1"}]}]});
    expect(rr.status,JSON.stringify(rr.body)).toBe(201);
    const rp = rbase+"/"+rr.body.request.id;
    const inspectionPayload = {revision:rr.body.request.revision,receivedAndInspected:true,notes:"The late batch was physically received and verified"};
    const unverified = await post(context.inspector,rp+"/inspection",inspectionPayload);
    expect(unverified.status).toBe(409);
    const ri = await post(context.inspector,rp+"/inspection",{...inspectionPayload,confirmedBatchSelection:true});
    expect(ri.status,JSON.stringify(ri.body)).toBe(200);
    const rd = await post(context.owner,rp+"/decision",{decision:"APPROVE",revision:ri.body.request.revision});
    expect(rd.status,JSON.stringify(rd.body)).toBe(200);
    const rf = await post(context.preparer,rp+"/prepare",{revision:rd.body.request.revision});
    expect(rf.status,JSON.stringify(rf.body)).toBe(201);
    const refund = await prisma.enterprisePayment.findUniqueOrThrow({where:{id:rf.body.request.refundPaymentId}});
    const batchCredit = await prisma.enterpriseSalesCreditNote.findUniqueOrThrow({where:{id:rf.body.request.salesCreditNoteId}});
    await ensureStepUp(context.owner,ownerPassword);
    const approvedRefund = await post(context.owner,`${base}/payments/${refund.id}/transition`,{action:"APPROVE",revision:refund.revision});
    expect(approvedRefund.status,JSON.stringify(approvedRefund.body)).toBe(200);
    const approvedCredit = await post(context.owner,`${base}/sales-credit-notes/${batchCredit.id}/transition`,{action:"APPROVE",revision:batchCredit.revision});
    expect(approvedCredit.status,JSON.stringify(approvedCredit.body)).toBe(200);
    await ensureStepUp(context.returnSettler,cashierPassword);
    const settlePayload = {revision:rf.body.request.revision,reason:"Verified batch return and Finance approval"};
    const done = await post(context.returnSettler,rp+"/settle",settlePayload);
    expect(done.status,JSON.stringify(done.body)).toBe(200);
    expect(done.body.request.status).toBe("COMPLETED");
    const restored = await prisma.enterpriseStockMovement.findMany({where:{organizationId,sourceEntityType:"EnterpriseRetailInvoiceReturnRequest",sourceEntityId:rr.body.request.id,movementType:"RETURN_IN"}});
    expect(restored).toHaveLength(1);
    expect(restored[0].stockLotId).toBe(batches[1].lot.id);
    expect((await batchStock(0)).isZero()).toBe(true);
    expect((await batchStock(1)).equals(2)).toBe(true);
    const restoredCost = await prisma.enterpriseInventoryAccountingEvent.findFirstOrThrow({where:{organizationId,stockMovementId:restored[0].id,status:"POSTED"}});
    expect(restoredCost.totalCost.equals(7)).toBe(true);
    expect((await post(context.returnSettler,rp+"/settle",settlePayload)).body.idempotent).toBe(true);
    expect((await batchStock(1)).equals(2)).toBe(true);

    // #1212 approved write-off, with separate expense posting.
    const qualityPath=base+"/inventory/lots";
    const patchLot=async (context,data)=>{
      const res=await context.request.patch(qualityPath,{data,headers:{origin:baseUrl,referer:`${baseUrl}/enterprise-modules/INVENTORY_LOGISTICS`}});
      return {status:res.status(),body:await res.json().catch(()=>null)};
    };
    const qualityBefore=await prisma.enterpriseStockLot.findUniqueOrThrow({where:{id:batches[1].lot.id}});
    const quarantine=await patchLot(context.owner,{id:qualityBefore.id,revision:qualityBefore.revision,status:"QUARANTINED",qualityReason:"E2E found damaged packaging in late lot"});
    expect(quarantine.status,JSON.stringify(quarantine.body)).toBe(200);
    expect((await batchStock(1)).equals(2)).toBe(true);
    const selfRelease=await patchLot(context.owner,{id:qualityBefore.id,revision:quarantine.body.revision,status:"AVAILABLE",qualityReason:"E2E prohibited self-release"});
    expect(selfRelease.status,JSON.stringify(selfRelease.body)).toBe(403);
    const releasedQuality=await patchLot(context.settler,{id:qualityBefore.id,revision:quarantine.body.revision,status:"AVAILABLE",qualityReason:"Independent quality review before subsequent damage"});
    expect(releasedQuality.status,JSON.stringify(releasedQuality.body)).toBe(200);
    const finalQuarantine=await patchLot(context.owner,{id:qualityBefore.id,revision:releasedQuality.body.revision,status:"QUARANTINED",qualityReason:"Damaged packaging identified before destruction"});
    expect(finalQuarantine.status,JSON.stringify(finalQuarantine.body)).toBe(200);
    const lossPayload={inventoryItemId:batchInventory.id,warehouseId:fixture.warehouse.id,stockLotId:batches[1].lot.id,adjustmentType:"OUT",lossReason:"DAMAGE",quantity:1,reason:"E2E independent destruction of damaged batch",approverUserId:fixture.settler.id,idempotencyKey:batchKey+"-loss"};
    const lossesPath=base+"/stock-adjustments";
    const self=await post(context.owner,lossesPath,{...lossPayload,approverUserId:fixture.owner.id,idempotencyKey:batchKey+"-self-loss"});
    expect(self.status,JSON.stringify(self.body)).toBe(403);
    const notIsolated=await post(context.owner,lossesPath,{...lossPayload,stockLotId:batches[0].lot.id,idempotencyKey:batchKey+"-available-loss"});
    expect(notIsolated.status,JSON.stringify(notIsolated.body)).toBe(409);
    const loss=await post(context.owner,lossesPath,lossPayload);
    expect(loss.status,JSON.stringify(loss.body)).toBe(201);
    expect(loss.body.adjustment.status).toBe("PENDING_APPROVAL");
    const lossReplay=await post(context.owner,lossesPath,lossPayload);
    expect(lossReplay.status,JSON.stringify(lossReplay.body)).toBe(201);
    expect(lossReplay.body.adjustment.id).toBe(loss.body.adjustment.id);
    expect((await batchStock(1)).equals(2)).toBe(true);
    const lossDecision=lossesPath+"/"+loss.body.adjustment.id+"/decision";
    const incorrectApprover=await post(context.owner,lossDecision,{decision:"APPROVE",revision:loss.body.adjustment.revision});
    expect(incorrectApprover.status).toBe(403);
    const approvedLoss=await post(context.settler,lossDecision,{decision:"APPROVE",revision:loss.body.adjustment.revision});
    expect(approvedLoss.status,JSON.stringify(approvedLoss.body)).toBe(200);
    expect(approvedLoss.body.adjustment.status).toBe("COMPLETED");
    expect((await batchStock(1)).equals(1)).toBe(true);
    const lostMovements=await prisma.enterpriseStockMovement.findMany({where:{organizationId,sourceEntityType:"EnterpriseStockAdjustment",sourceEntityId:loss.body.adjustment.id,movementType:"LOT_WRITE_OFF"}});
    expect(lostMovements).toHaveLength(1);
    const lostCost=await prisma.enterpriseInventoryAccountingEvent.findFirstOrThrow({where:{organizationId,stockMovementId:lostMovements[0].id,eventType:"LOSS"}});
    expect(lostCost.totalCost.equals(7)).toBe(true);
    expect(lostCost.status).toBe("POSTED");
    const lossEntry=await prisma.enterpriseJournalEntry.findUniqueOrThrow({where:{id:lostCost.journalEntryId},include:{lines:true}});
    expect(lossEntry.totalDebit.equals(lossEntry.totalCredit)).toBe(true);
    expect(lossEntry.totalDebit.equals(7)).toBe(true);
    const mappingRows=await prisma.enterpriseAccountMapping.findMany({where:{organizationId,mappingKey:{in:["OPERATING_EXPENSE","INVENTORY","COST_OF_SALES"]},isActive:true,chart:{status:"ACTIVE"}}});
    const expenseMapping=mappingRows.find(row=>row.mappingKey==="OPERATING_EXPENSE");
    const inventoryMapping=mappingRows.find(row=>row.mappingKey==="INVENTORY");
    expect(expenseMapping).toBeTruthy();
    expect(inventoryMapping).toBeTruthy();
    expect(lossEntry.lines.some(row=>row.ledgerAccountId===expenseMapping.ledgerAccountId && row.debit.equals(7))).toBe(true);
    expect(lossEntry.lines.some(row=>row.ledgerAccountId===inventoryMapping.ledgerAccountId && row.credit.equals(7))).toBe(true);
    expect(lossEntry.lines.every(row=>row.siteId===fixture.site.id)).toBe(true);
    const secondDecision=await post(context.settler,lossDecision,{decision:"APPROVE",revision:loss.body.adjustment.revision});
    expect(secondDecision.status).toBeGreaterThanOrEqual(400);
    expect((await batchStock(1)).equals(1)).toBe(true);
    expect(await prisma.enterpriseStockMovement.count({where:{organizationId,sourceEntityType:"EnterpriseStockAdjustment",sourceEntityId:loss.body.adjustment.id}})).toBe(1);

    // Recall the same batch identity across warehouses without removing stock.
    const duplicateWarehouse=await prisma.enterpriseWarehouse.create({data:{organizationId,siteId:fixture.site.id,code:batchKey+"-W2",name:"Recall E2E warehouse 2",warehouseType:"STORE",createdByUserId:fixture.owner.id}});
    const spareWarehouse=await prisma.enterpriseWarehouse.create({data:{organizationId,siteId:fixture.site.id,code:batchKey+"-W3",name:"Recall E2E warehouse 3",warehouseType:"STORE",createdByUserId:fixture.owner.id}});
    const duplicateLot=await prisma.enterpriseStockLot.create({data:{organizationId,inventoryItemId:batchInventory.id,warehouseId:duplicateWarehouse.id,lotNumber:batches[1].lot.lotNumber,expiryDate:batches[1].lot.expiryDate,createdByUserId:fixture.owner.id}});
    const duplicateBalance=await prisma.enterpriseInventoryBalance.create({data:{organizationId,inventoryItemId:batchInventory.id,warehouseId:duplicateWarehouse.id,stockLotId:duplicateLot.id,quantityOnHand:1}});
    const duplicateMovement=await prisma.enterpriseStockMovement.create({data:{organizationId,inventoryItemId:batchInventory.id,warehouseId:duplicateWarehouse.id,stockLotId:duplicateLot.id,movementType:"OPENING_BALANCE",direction:"IN",quantity:1,balanceAfter:1,idempotencyKey:batchKey+"-recall-copy-opening",createdByUserId:fixture.owner.id}});
    const activeRetailConfig=await prisma.enterpriseRetailConfiguration.findUniqueOrThrow({where:{organizationId}});
    await prisma.enterpriseRetailConfiguration.update({where:{organizationId},data:{settingsJson:{...activeRetailConfig.settingsJson,inventoryPolicy:{...activeRetailConfig.settingsJson?.inventoryPolicy,transferReception:"CONFIRMED"}}}});
    const transferPath=base+"/stock-transfers";
    const transit=await post(context.owner,transferPath,{sourceWarehouseId:duplicateWarehouse.id,destinationWarehouseId:spareWarehouse.id,approverUserId:fixture.settler.id,lines:[{inventoryItemId:batchInventory.id,stockLotId:duplicateLot.id,quantity:1}]});
    expect(transit.status,JSON.stringify(transit.body)).toBe(201);
    const dispatch=await post(context.settler,transferPath+"/"+transit.body.transfer.id+"/decision",{decision:"APPROVE",revision:transit.body.transfer.revision});
    expect(dispatch.status,JSON.stringify(dispatch.body)).toBe(200);
    expect(dispatch.body.transfer.status).toBe("IN_TRANSIT");
    expect((await prisma.enterpriseInventoryBalance.findUniqueOrThrow({where:{id:duplicateBalance.id}})).quantityOnHand.isZero()).toBe(true);
    expect(await prisma.enterpriseStockLot.count({where:{organizationId,inventoryItemId:batchInventory.id,warehouseId:spareWarehouse.id}})).toBe(0);
    const recallBefore=await prisma.enterpriseStockLot.findUniqueOrThrow({where:{id:qualityBefore.id}});
    const recall=await patchLot(context.owner,{id:recallBefore.id,revision:recallBefore.revision,recall:true,qualityReason:"Supplier recall of identical batch across warehouses"});
    expect(recall.status,JSON.stringify(recall.body)).toBe(200);
    expect(recall.body.affectedLots).toBe(2);
    expect(recall.body.recallReference).toMatch(/^RECALL-/);
    const recalled=await prisma.enterpriseStockLot.findMany({where:{organizationId,id:{in:[recallBefore.id,duplicateLot.id]}}});
    expect(recalled.every(row=>row.status==="QUARANTINED"&&row.recallReference===recall.body.recallReference)).toBe(true);
    expect((await batchStock(1)).equals(1)).toBe(true);
    expect((await prisma.enterpriseInventoryBalance.findUniqueOrThrow({where:{id:duplicateBalance.id}})).quantityOnHand.isZero()).toBe(true);
    const forbiddenRelease=await patchLot(context.settler,{id:recallBefore.id,revision:recall.body.revision,status:"AVAILABLE",qualityReason:"A recalled batch cannot be released"});
    expect(forbiddenRelease.status,JSON.stringify(forbiddenRelease.body)).toBe(409);
    const recreate=await post(context.owner,qualityPath,{inventoryItemId:batchInventory.id,warehouseId:spareWarehouse.id,lotNumber:duplicateLot.lotNumber,productionDate:null,expiryDate:duplicateLot.expiryDate.toISOString().slice(0,10),notes:null});
    expect(recreate.status,JSON.stringify(recreate.body)).toBe(409);
    await expect(prisma.enterpriseStockLot.create({data:{organizationId,inventoryItemId:batchInventory.id,warehouseId:spareWarehouse.id,lotNumber:duplicateLot.lotNumber,expiryDate:duplicateLot.expiryDate,createdByUserId:fixture.owner.id}})).rejects.toThrow();
    const receiptPath=transferPath+"/"+transit.body.transfer.id+"/receive";
    const received=await post(context.owner,receiptPath,{revision:dispatch.body.transfer.revision,comment:"Recalled batch received into physically segregated zone"});
    expect(received.status,JSON.stringify(received.body)).toBe(200);
    expect(received.body.transfer.status).toBe("COMPLETED");
    const receivedLot=await prisma.enterpriseStockLot.findFirstOrThrow({where:{organizationId,inventoryItemId:batchInventory.id,warehouseId:spareWarehouse.id,lotNumber:duplicateLot.lotNumber}});
    expect(receivedLot.status).toBe("QUARANTINED");
    expect(receivedLot.recallReference).toBe(recall.body.recallReference);
    const receivedBalance=await prisma.enterpriseInventoryBalance.findFirstOrThrow({where:{organizationId,warehouseId:spareWarehouse.id,stockLotId:receivedLot.id}});
    expect(receivedBalance.quantityOnHand.equals(1)).toBe(true);
    const replayReceipt=await post(context.owner,receiptPath,{revision:dispatch.body.transfer.revision,comment:"Replay"});
    expect(replayReceipt.status).toBe(409);
    expect(await prisma.enterpriseStockMovement.count({where:{organizationId,sourceEntityId:transit.body.transfer.id,movementType:"TRANSFER_IN"}})).toBe(1);
    const traceRes=await context.owner.request.get(qualityPath+"?view=trace&lotId="+encodeURIComponent(recallBefore.id));
    expect(traceRes.status()).toBe(200);
    const trace=await traceRes.json();
    expect(trace.lot.recallReference).toBe(recall.body.recallReference);
    expect(trace.items.some(row=>row.id===duplicateMovement.id)).toBe(true);
    expect(trace.items.some(row=>row.movementType==="TRANSFER_IN"&&row.stockLot.recallReference===recall.body.recallReference)).toBe(true);
    expect(trace.items.some(row=>row.movementType==="LOT_WRITE_OFF")).toBe(true);
    expect(trace.items.some(row=>row.movementType==="SALE_FULFILLMENT")).toBe(true);
    expect(trace.items.some(row=>row.movementType==="RETURN_IN")).toBe(true);
    expect(trace.items.every(row=>row.stockLot.lotNumber===duplicateLot.lotNumber)).toBe(true);


  } finally {
    if (originalSettings !== undefined) await prisma.enterpriseRetailConfiguration.update({
      where: { organizationId }, data: { settingsJson: originalSettings === null ? Prisma.DbNull : originalSettings,
        revision: { increment: 1 } },
    });
    await Promise.all(Object.values(context).map((browserContext) => browserContext.close()));
    await prisma.$disconnect();
  }
});
