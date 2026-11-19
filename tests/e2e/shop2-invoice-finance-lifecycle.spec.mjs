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
  test.setTimeout(600_000);
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
    // Accounts are versioned. Resolve the mapping EFFECTIVE on the journal
    // date, not an arbitrary active row from the whole history.
    const effectiveMapping=async mappingKey=>prisma.enterpriseAccountMapping.findFirstOrThrow({
      where:{organizationId,mappingKey,isActive:true,chart:{status:"ACTIVE"},
        OR:[{effectiveFrom:null},{effectiveFrom:{lte:lossEntry.accountingDate}}],
        AND:[{OR:[{effectiveTo:null},{effectiveTo:{gte:lossEntry.accountingDate}}]}]},
      orderBy:[{effectiveFrom:"desc"},{createdAt:"desc"}],
    });
    const expenseMapping=await effectiveMapping("OPERATING_EXPENSE");
    const inventoryMapping=await effectiveMapping("INVENTORY");
    expect(lossEntry.postingEvent).toBe("INVENTORY_LOSS_VALUED");
    expect(lossEntry.lines).toHaveLength(2);
    expect(expenseMapping).toBeTruthy();
    expect(inventoryMapping).toBeTruthy();
    expect(lossEntry.lines.some(row=>row.ledgerAccountId===expenseMapping.ledgerAccountId && row.debit.equals(7))).toBe(true);
    expect(lossEntry.lines.some(row=>row.ledgerAccountId===inventoryMapping.ledgerAccountId && row.credit.equals(7)),JSON.stringify({expectedAccount:inventoryMapping.ledgerAccountId,lines:lossEntry.lines.map(row=>({account:row.ledgerAccountId,debit:row.debit,credit:row.credit}))})).toBe(true);
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
    // A missing inventoryPolicy resolves to the canonical defaults on reads.
    // When persisting an explicit policy, provide every required field.
    const activeSettings = activeRetailConfig.settingsJson ?? {};
    const transferPolicy = {
      expiryMode: "ALLOW", enforceFefo: false, warningDays: 30,
      ...activeSettings.inventoryPolicy, transferReception: "CONFIRMED",
    };
    await prisma.enterpriseRetailConfiguration.update({
      where: { organizationId },
      data: { settingsJson: { ...activeSettings, inventoryPolicy: transferPolicy } },
    });
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
    // Transfer is an asset relocation, not an independent acquisition or sale.
    // Both generic finance actions must reject it before any cost or journal write.
    const transferMovements=await prisma.enterpriseStockMovement.findMany({where:{organizationId,sourceEntityType:"EnterpriseStockTransfer",sourceEntityId:transit.body.transfer.id},orderBy:{id:"asc"}});
    expect(transferMovements).toHaveLength(2);
    const transferLayerScope={organizationId,inventoryItemId:batchInventory.id};
    const transferFinanceSnapshot=async()=>({
      layers:await prisma.enterpriseInventoryCostLayer.findMany({where:transferLayerScope,orderBy:{id:"asc"}}),
      events:await prisma.enterpriseInventoryAccountingEvent.findMany({where:transferLayerScope,orderBy:{id:"asc"}}),
      journals:await prisma.enterpriseJournalEntry.count({where:{organizationId}}),
      balances:await prisma.enterpriseInventoryBalance.findMany({where:transferLayerScope,orderBy:{id:"asc"}}),
    });
    const beforeTransferFinance=await transferFinanceSnapshot();
    for(const movement of transferMovements){
      const receipt=movement.direction==="IN";
      const response=await post(context.owner,base+"/stock-movements/"+movement.id+(receipt?"/value-receipt":"/value-issue"),receipt?{currencyCode:fixture.currencyCode,unitCost:"7"}:{currencyCode:fixture.currencyCode});
      expect(response.status,JSON.stringify(response.body)).toBe(409);
      expect(response.body.error).toBe("INVENTORY_TRANSFER_VALUATION_WORKFLOW_REQUIRED");
    }
    expect(await transferFinanceSnapshot()).toEqual(beforeTransferFinance);

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

    // Non-sellable return: credit/refund, no fictitious stock replenishment,
    // physical custody from the original issue, then independent disposal.
    const isolatedPayload={...returnPayload,idempotencyKey:batchKey+"-custody",reason:"Physically returned recalled batch in quarantine",lines:[{checkoutLineId:batchCheckout.lines[0].id,quantity:"1",stockDisposition:"QUARANTINE",lotAllocations:[{stockLotId:batches[1].lot.id,quantity:"1"}]}]};
    const ir=await post(context.cashier,rbase,isolatedPayload);
    expect(ir.status,JSON.stringify(ir.body)).toBe(201);
    const isolatedPath=rbase+"/"+ir.body.request.id;
    const ii=await post(context.inspector,isolatedPath+"/inspection",{revision:ir.body.request.revision,receivedAndInspected:true,confirmedBatchSelection:true,notes:"Recalled batch physically received and isolated"});
    expect(ii.status,JSON.stringify(ii.body)).toBe(200);
    const idc=await post(context.owner,isolatedPath+"/decision",{decision:"APPROVE",revision:ii.body.request.revision});
    expect(idc.status,JSON.stringify(idc.body)).toBe(200);
    const ip=await post(context.preparer,isolatedPath+"/prepare",{revision:idc.body.request.revision});
    expect(ip.status,JSON.stringify(ip.body)).toBe(201);
    const isolatedRefund=await prisma.enterprisePayment.findUniqueOrThrow({where:{id:ip.body.request.refundPaymentId}});
    const isolatedCredit=await prisma.enterpriseSalesCreditNote.findUniqueOrThrow({where:{id:ip.body.request.salesCreditNoteId}});
    await ensureStepUp(context.owner,ownerPassword);
    expect((await post(context.owner,base+"/payments/"+isolatedRefund.id+"/transition",{action:"APPROVE",revision:isolatedRefund.revision})).status).toBe(200);
    expect((await post(context.owner,base+"/sales-credit-notes/"+isolatedCredit.id+"/transition",{action:"APPROVE",revision:isolatedCredit.revision})).status).toBe(200);
    await ensureStepUp(context.returnSettler,cashierPassword);
    const isolatedSettlePayload={revision:ip.body.request.revision,reason:"Verified physical custody and independent financial approvals"};
    const isettled=await post(context.returnSettler,isolatedPath+"/settle",isolatedSettlePayload);
    expect(isettled.status,JSON.stringify(isettled.body)).toBe(200);
    const custody=await prisma.enterpriseInventoryReturnCustody.findFirstOrThrow({where:{organizationId,returnLine:{returnRequestId:ir.body.request.id}}});
    expect(custody.status).toBe("QUARANTINED");
    expect(custody.quantity.equals(1)).toBe(true);
    expect(custody.originalMovementId).toBe(issues.find(row=>row.stockLotId===batches[1].lot.id).id);
    expect((await batchStock(1)).equals(1)).toBe(true);
    expect(await prisma.enterpriseStockMovement.count({where:{organizationId,sourceEntityType:"EnterpriseRetailInvoiceReturnRequest",sourceEntityId:ir.body.request.id}})).toBe(0);
    expect((await post(context.returnSettler,isolatedPath+"/settle",isolatedSettlePayload)).body.idempotent).toBe(true);
    expect(await prisma.enterpriseInventoryReturnCustody.count({where:{organizationId,returnLine:{returnRequestId:ir.body.request.id}}})).toBe(1);
    const listedCustody=await context.owner.request.get(qualityPath+"?view=custody&search="+encodeURIComponent(batchKey));
    expect(listedCustody.status()).toBe(200);
    expect((await listedCustody.json()).items.some(row=>row.id===custody.id&&row.canRequest)).toBe(true);
    const recoveryProbePath=qualityPath+"?view=custody-recovery&custodyId="+encodeURIComponent(custody.id);
    const recoveryBefore=await context.owner.request.get(recoveryProbePath);
    expect(recoveryBefore.status(),await recoveryBefore.text()).toBe(409);
    expect((await recoveryBefore.json()).error).toBe("INVENTORY_RETURN_RECOVERY_LOT_UNSAFE");
    expect((await prisma.enterpriseInventoryReturnCustody.findUniqueOrThrow({where:{id:custody.id}})).revision).toBe(custody.revision);
    expect((await batchStock(1)).equals(1)).toBe(true);
    const requestedDisposal=await patchLot(context.owner,{custodyId:custody.id,revision:custody.revision,action:"REQUEST_DISPOSAL",reason:"Supplier recall requires safe physical disposal"});
    expect(requestedDisposal.status,JSON.stringify(requestedDisposal.body)).toBe(200);
    const custodyWarehouse=issues.find(row=>row.id===custody.originalMovementId).warehouseId;
    const pendingRegister=qualityPath+"?view=custody&status=DISPOSAL_PENDING&warehouseId="+encodeURIComponent(custodyWarehouse)+"&custodyId="+encodeURIComponent(custody.id);
    const pendingDisposalList=await context.owner.request.get(pendingRegister);
    expect(pendingDisposalList.status()).toBe(200);
    expect((await pendingDisposalList.json()).items.map(row=>row.id)).toEqual([custody.id]);
    const otherCustodyWarehouse=custodyWarehouse===spareWarehouse.id?fixture.warehouse.id:spareWarehouse.id;
    const otherDisposalList=await context.owner.request.get(qualityPath+"?view=custody&status=DISPOSAL_PENDING&warehouseId="+encodeURIComponent(otherCustodyWarehouse)+"&custodyId="+encodeURIComponent(custody.id));
    expect(otherDisposalList.status()).toBe(200);
    expect((await otherDisposalList.json()).items).toEqual([]);
    const disposalPayload={custodyId:custody.id,revision:requestedDisposal.body.revision,action:"CONFIRM_DISPOSAL",reason:"Physical destruction witnessed and recorded in E2E certificate"};
    const selfDisposal=await patchLot(context.owner,disposalPayload);
    expect(selfDisposal.status).toBe(403);
    const attested=await patchLot(context.settler,disposalPayload);
    expect(attested.status,JSON.stringify(attested.body)).toBe(200);
    const disposed=await prisma.enterpriseInventoryReturnCustody.findUniqueOrThrow({where:{id:custody.id}});
    expect(disposed.status).toBe("DISPOSED");
    const completedDisposalList=await context.owner.request.get(pendingRegister);
    expect(completedDisposalList.status()).toBe(200);
    expect((await completedDisposalList.json()).items).toEqual([]);
    expect(disposed.disposedByUserId).toBe(fixture.settler.id);
    expect(disposed.disposalEvidence).toBe(disposalPayload.reason);
    expect((await patchLot(context.settler,disposalPayload)).status).toBe(409);
    expect((await batchStock(1)).equals(1)).toBe(true);

    // #1212 Historical stock: independent approval, no new acquisition,
    // unchanged inventory accounting value, then controlled lot activation.
    const historyKey=batchKey+"-HIST";
    const historicalProduct=await prisma.enterpriseCatalogItem.create({data:{organizationId,code:historyKey,sku:historyKey,name:"E2E legacy stock "+historyKey,normalizedName:historyKey.toLowerCase(),itemType:"PRODUCT",unitOfMeasureId:fixture.product.unitOfMeasureId,indicativeSalePrice:20,indicativeCost:7,currency:fixture.currencyCode,taxable:false,trackInventory:true,createdByUserId:fixture.owner.id}});
    const historicalInventory=await prisma.enterpriseInventoryItem.create({data:{organizationId,catalogItemId:historicalProduct.id,lotTracking:false,expiryTracking:false,createdByUserId:fixture.owner.id}});
    const historicalBalance=await prisma.enterpriseInventoryBalance.create({data:{organizationId,inventoryItemId:historicalInventory.id,warehouseId:fixture.warehouse.id,quantityOnHand:100}});
    const historicalMovement=await prisma.enterpriseStockMovement.create({data:{organizationId,inventoryItemId:historicalInventory.id,warehouseId:fixture.warehouse.id,movementType:"OPENING_BALANCE",direction:"IN",quantity:100,balanceAfter:100,idempotencyKey:historyKey+"-opening",createdByUserId:fixture.owner.id}});
    const historicalLayer=await prisma.enterpriseInventoryCostLayer.create({data:{organizationId,inventoryItemId:historicalInventory.id,warehouseId:fixture.warehouse.id,sourceMovementId:historicalMovement.id,valuationMethod:"WEIGHTED_AVERAGE",quantity:100,remainingQuantity:100,unitCost:7,totalCost:700,currencyCode:fixture.currencyCode,effectiveAt:new Date()}});
    const policyPath=base+"/inventory/item-policy";
    const changePolicy=async ()=>{const response=await context.owner.request.put(policyPath,{data:{inventoryItemId:historicalInventory.id,revision:historicalInventory.revision,minimumQuantity:10,reorderQuantity:25,lotTracking:true,expiryTracking:true},headers:{origin:baseUrl,referer:baseUrl+"/enterprise-modules/INVENTORY_LOGISTICS"}});return {status:response.status(),body:await response.json().catch(()=>null)};};
    const premature=await changePolicy();expect(premature.status,JSON.stringify(premature.body)).toBe(409);
    const allocationPayload={sourceBalanceId:historicalBalance.id,sourceBalanceRevision:historicalBalance.revision,itemRevision:historicalInventory.revision,approverUserId:fixture.settler.id,reason:"Physical historical reconciliation by identified lots",idempotencyKey:historyKey+"-allocation",allocations:[{lotNumber:"HIST-A",productionDate:null,expiryDate:batches[0].lot.expiryDate.toISOString().slice(0,10),quantity:"30"},{lotNumber:"HIST-B",productionDate:null,expiryDate:batches[1].lot.expiryDate.toISOString().slice(0,10),quantity:"70"}]};
    // The common approval workspace is a real prerequisite, not an implicit
    // privilege of a stock approver. Verify fail-closed before enabling it.
    await prisma.enterpriseModule.upsert({
      where: { organizationId_moduleCode: { organizationId, moduleCode: "VALIDATIONS" } },
      update: { isEnabled: false, requiresPlanLevel: "BUSINESS" },
      create: { organizationId, moduleCode: "VALIDATIONS", labelFr: "Validations", labelEn: "Approvals",
        moduleCategory: "OPERATIONS", isEnabled: false, isCore: false, requiresPlanLevel: "BUSINESS", sortOrder: 30 },
    });
    const unavailableApproval = await post(context.owner, policyPath, allocationPayload);
    expect(unavailableApproval.status, JSON.stringify(unavailableApproval.body)).toBe(403);
    expect(unavailableApproval.body.error).toBe("STOCK_RECLASS_VALIDATIONS_REQUIRED");
    expect(await prisma.enterpriseStockLotReclassification.count({ where: { organizationId, sourceBalanceId: historicalBalance.id } })).toBe(0);
    expect((await prisma.enterpriseInventoryBalance.findUniqueOrThrow({ where: { id: historicalBalance.id } })).quantityOnHand.equals(100)).toBe(true);
    await prisma.enterpriseModule.update({
      where: { organizationId_moduleCode: { organizationId, moduleCode: "VALIDATIONS" } },
      data: { isEnabled: true },
    });
    const invalid=await post(context.owner,policyPath,{...allocationPayload,allocations:[{...allocationPayload.allocations[0],quantity:"29"},allocationPayload.allocations[1]]});
    expect(invalid.status,JSON.stringify(invalid.body)).toBe(409);
    const allocatedRequest=await post(context.owner,policyPath,allocationPayload);
    expect(allocatedRequest.status,JSON.stringify(allocatedRequest.body)).toBe(201);
    const allocatedReplay=await post(context.owner,policyPath,allocationPayload);
    expect(allocatedReplay.status,JSON.stringify(allocatedReplay.body)).toBe(200);
    expect(allocatedReplay.body.approvalId).toBe(allocatedRequest.body.approvalId);
    expect((await prisma.enterpriseInventoryBalance.findUniqueOrThrow({where:{id:historicalBalance.id}})).quantityOnHand.equals(100)).toBe(true);
    const allocationApproval=await prisma.enterpriseApproval.findUniqueOrThrow({where:{id:allocatedRequest.body.approvalId}});
    const allocationApprovalPath=base+"/approvals/"+allocationApproval.id+"/actions";
    const review=await post(context.settler,allocationApprovalPath,{action:"PREPARE_REVIEW",revision:allocationApproval.revision});
    expect(review.status,JSON.stringify(review.body)).toBe(200);
    const approveAllocation={action:"APPROVE",revision:allocationApproval.revision,reviewedVersionId:review.body.submissionVersion.id};
    const selfAllocation=await post(context.owner,allocationApprovalPath,approveAllocation);
    expect(selfAllocation.status).toBe(403);
    const allocated=await post(context.settler,allocationApprovalPath,approveAllocation);
    expect(allocated.status,JSON.stringify(allocated.body)).toBe(200);
    const historicalRows=await prisma.enterpriseInventoryBalance.findMany({where:{organizationId,inventoryItemId:historicalInventory.id},include:{stockLot:true}});
    expect(historicalRows.length).toBe(3);
    expect(historicalRows.reduce((sum,row)=>sum.plus(row.quantityOnHand),new Prisma.Decimal(0)).equals(100)).toBe(true);
    expect(historicalRows.find(row=>row.stockLotId===null).quantityOnHand.isZero()).toBe(true);
    expect(historicalRows.filter(row=>row.stockLotId).map(row=>[row.stockLot.lotNumber,Number(row.quantityOnHand)]).sort()).toEqual([["HIST-A",30],["HIST-B",70]]);
    expect(await prisma.enterpriseInventoryCostLayer.count({where:{organizationId,inventoryItemId:historicalInventory.id}})).toBe(1);
    const sameCostLayer=await prisma.enterpriseInventoryCostLayer.findUniqueOrThrow({where:{id:historicalLayer.id}});
    expect(sameCostLayer.remainingQuantity.equals(100)).toBe(true);
    expect(sameCostLayer.totalCost.equals(700)).toBe(true);
    expect(await prisma.enterpriseInventoryAccountingEvent.count({where:{organizationId,inventoryItemId:historicalInventory.id}})).toBe(0);
    const reclassMovements=await prisma.enterpriseStockMovement.findMany({where:{organizationId,inventoryItemId:historicalInventory.id,sourceEntityType:"EnterpriseStockLotReclassification"}});
    expect(reclassMovements).toHaveLength(3);
    expect(reclassMovements.reduce((sum,row)=>sum+(row.direction==="IN"?1:-1)*Number(row.quantity),0)).toBe(0);
    expect((await changePolicy()).status).toBe(200);
    const activeHistory=await prisma.enterpriseInventoryItem.findUniqueOrThrow({where:{id:historicalInventory.id}});
    expect(activeHistory.lotTracking&&activeHistory.expiryTracking).toBe(true);
    const countPath=base+"/inventory-counts";
    const countedA=historicalRows.find(row=>row.stockLot?.lotNumber==="HIST-A");
    const countRequest=await post(context.owner,countPath,{warehouseId:fixture.warehouse.id,countType:"SPOT",approverUserId:fixture.settler.id,lines:[{inventoryItemId:historicalInventory.id,stockLotId:countedA.stockLotId,countedQuantity:30}]});
    expect(countRequest.status,JSON.stringify(countRequest.body)).toBe(201);
    expect(countRequest.body.count.lines).toHaveLength(1);
    expect(countRequest.body.count.lines[0].organizationId).toBe(organizationId);
    expect(Number(countRequest.body.count.lines[0].expectedQuantity)).toBe(30);
    const finishedCount=await post(context.settler,countPath+"/"+countRequest.body.count.id+"/decision",{decision:"APPROVE",revision:countRequest.body.count.revision});
    expect(finishedCount.status,JSON.stringify(finishedCount.body)).toBe(200);
    expect(finishedCount.body.count.status).toBe("COMPLETED");
    expect(await prisma.enterpriseStockMovement.count({where:{organizationId,sourceEntityType:"EnterpriseInventoryCount",sourceEntityId:countRequest.body.count.id}})).toBe(0);


    // Purchase adapter and valuation: rejected recalled batches must roll back
    // the purchase status, canonical receipt, balances and movements together.
    async function orderForPurchase(product,amount,suffix,supplierId){
      const purchase=await prisma.enterprisePurchase.create({data:{organizationId,reference:batchKey+"-"+suffix,title:"Receipt E2E "+suffix,status:"ORDERED",supplierId,requestedByUserId:fixture.owner.id,buyerUserId:fixture.owner.id,currency:fixture.currencyCode,subtotalAmount:7*amount,totalAmount:7*amount,orderedAt:new Date(),createdByUserId:fixture.owner.id,items:{create:{description:product.name,quantity:amount,unit:"UNIT",unitPrice:7,lineSubtotal:7*amount,taxAmount:0,lineTotal:7*amount}}},include:{items:true}});
      await prisma.enterprisePurchaseItemCatalogLink.create({data:{organizationId,purchaseItemId:purchase.items[0].id,catalogItemId:product.id,unitOfMeasureId:product.unitOfMeasureId,expectedItemType:"GOODS"}});
      return purchase;
    }
    const recalledPurchase=await orderForPurchase(batchProduct,1,"RECALLED-PO");
    const recalledReceipt=await post(context.owner,base+"/purchases/"+recalledPurchase.id+"/receive",{revision:recalledPurchase.revision,receivedAt:new Date().toISOString(),warehouseId:fixture.warehouse.id,items:[{purchaseItemId:recalledPurchase.items[0].id,quantityReceived:1}],lotAllocations:[{purchaseItemId:recalledPurchase.items[0].id,batches:[{lotNumber:duplicateLot.lotNumber,productionDate:null,expiryDate:duplicateLot.expiryDate.toISOString().slice(0,10),quantity:1}]}]});
    expect(recalledReceipt.status,JSON.stringify(recalledReceipt.body)).toBe(409);
    expect(recalledReceipt.body.error).toBe("RECEIPT_BATCH_RECALLED");
    expect((await prisma.enterprisePurchase.findUniqueOrThrow({where:{id:recalledPurchase.id}})).status).toBe("ORDERED");
    expect(await prisma.enterprisePurchaseReceipt.count({where:{organizationId,purchaseId:recalledPurchase.id}})).toBe(0);
    // Supplier, buyer and invoice use the canonical Procurement/Finance
    // references, not a synthetic supplier name or a fabricated ledger entry.
    const supplierName="E2E supplier "+historyKey;
    const supplier=await prisma.enterpriseSupplier.create({data:{organizationId,legalName:supplierName,displayName:supplierName,normalizedName:supplierName.toLowerCase(),status:"ACTIVE",createdByUserId:fixture.owner.id}});
    const supplierParty=await prisma.enterpriseBusinessParty.create({data:{organizationId,partyType:"ORGANIZATION",legalName:supplierName,displayName:supplierName,normalizedName:supplierName.toLowerCase(),code:historyKey+"-SUPPLIER",status:"ACTIVE",createdByUserId:fixture.owner.id}});
    await prisma.enterpriseBusinessPartyRole.create({data:{organizationId,businessPartyId:supplierParty.id,roleCode:"SUPPLIER",status:"ACTIVE",createdByUserId:fixture.owner.id}});
    await prisma.enterpriseSupplierPartyLink.create({data:{organizationId,supplierId:supplier.id,businessPartyId:supplierParty.id,createdByUserId:fixture.owner.id}});
    await prisma.enterpriseModule.upsert({where:{organizationId_moduleCode:{organizationId,moduleCode:"FINANCE_PAYABLES"}},update:{isEnabled:true,requiresPlanLevel:"BUSINESS"},create:{organizationId,moduleCode:"FINANCE_PAYABLES",labelFr:"Achats & dettes",labelEn:"Purchases & payables",moduleCategory:"FINANCE",isEnabled:true,isCore:false,requiresPlanLevel:"BUSINESS",sortOrder:30}});
    const normalPurchase=await orderForPurchase(historicalProduct,10,"NORMAL-PO",supplier.id);
    const purchaseReceiptPath=base+"/purchases/"+normalPurchase.id+"/receive";
    const purchasePayload={revision:normalPurchase.revision,receivedAt:new Date().toISOString(),warehouseId:fixture.warehouse.id,items:[{purchaseItemId:normalPurchase.items[0].id,quantityReceived:10}],lotAllocations:[{purchaseItemId:normalPurchase.items[0].id,batches:[{lotNumber:"PURCHASE-A",productionDate:null,expiryDate:allocationPayload.allocations[0].expiryDate,quantity:4},{lotNumber:"PURCHASE-B",productionDate:null,expiryDate:allocationPayload.allocations[1].expiryDate,quantity:6}]}]};
    const wrongReceipt=await post(context.owner,purchaseReceiptPath,{...purchasePayload,lotAllocations:[{...purchasePayload.lotAllocations[0],batches:[{...purchasePayload.lotAllocations[0].batches[0],quantity:3},purchasePayload.lotAllocations[0].batches[1]]}]});
    expect(wrongReceipt.status,JSON.stringify(wrongReceipt.body)).toBe(409);
    expect(await prisma.enterprisePurchaseReceipt.count({where:{organizationId,purchaseId:normalPurchase.id}})).toBe(0);
    const purchaseReceipt=await post(context.owner,purchaseReceiptPath,purchasePayload);
    expect(purchaseReceipt.status,JSON.stringify(purchaseReceipt.body)).toBe(201);
    expect(purchaseReceipt.body.purchase.status).toBe("RECEIVED");
    const movementsReceived=await prisma.enterpriseStockMovement.findMany({where:{organizationId,sourceEntityType:"EnterprisePurchaseReceipt",sourceEntityId:purchaseReceipt.body.receipt.id,movementType:"PURCHASE_RECEIPT"},include:{stockLot:true}});
    expect(movementsReceived.map(row=>[row.stockLot.lotNumber,Number(row.quantity)]).sort()).toEqual([["PURCHASE-A",4],["PURCHASE-B",6]]);
    // Purchase detail must expose every canonical receipt movement, not just
    // the compatibility link to the first batch. Read access never mutates stock.
    const receiptTracePath=base+"/purchases/"+normalPurchase.id+"?view=receipt-lots";
    const firstTrace=await context.owner.request.get(receiptTracePath+"&pageSize=1&page=1");
    expect(firstTrace.status(),await firstTrace.text()).toBe(200);
    const firstTraceBody=await firstTrace.json();
    expect(firstTraceBody.pagination.total).toBe(2);
    expect(firstTraceBody.pagination.pageCount).toBe(2);
    expect(firstTraceBody.items).toHaveLength(1);
    const secondTrace=await context.owner.request.get(receiptTracePath+"&pageSize=1&page=2");
    expect(secondTrace.status(),await secondTrace.text()).toBe(200);
    const secondTraceBody=await secondTrace.json();
    const actualTrace=[...firstTraceBody.items,...secondTraceBody.items];
    expect(actualTrace.map(row=>[row.stockLot.lotNumber,Number(row.quantity)]).sort()).toEqual([["PURCHASE-A",4],["PURCHASE-B",6]]);
    expect(actualTrace.every(row=>row.receiptReference===purchaseReceipt.body.receipt.reference&&row.warehouse.name===fixture.warehouse.name)).toBe(true);
    expect(new Set(actualTrace.map(row=>row.id))).toEqual(new Set(movementsReceived.map(row=>row.id)));
    const searchedTrace=await context.owner.request.get(receiptTracePath+"&search=PURCHASE-B");
    expect(searchedTrace.status(),await searchedTrace.text()).toBe(200);
    expect((await searchedTrace.json()).items.map(row=>row.stockLot.lotNumber)).toEqual(["PURCHASE-B"]);
    const rejectedTrace=await context.owner.request.get(base+"/purchases/"+recalledPurchase.id+"?view=receipt-lots");
    expect(rejectedTrace.status(),await rejectedTrace.text()).toBe(200);
    expect((await rejectedTrace.json()).pagination.total).toBe(0);
    const deniedTrace=await context.cashier.request.get(receiptTracePath);
    expect([403,404]).toContain(deniedTrace.status());
    expect(await prisma.enterpriseStockMovement.count({where:{organizationId,sourceEntityType:"EnterprisePurchaseReceipt",sourceEntityId:purchaseReceipt.body.receipt.id}})).toBe(2);

    await ensureStepUp(context.owner,ownerPassword);
    for(const movement of movementsReceived){
      const valued=await post(context.owner,base+"/stock-movements/"+movement.id+"/value-receipt",{unitCost:"7",currencyCode:fixture.currencyCode});
      expect(valued.status,JSON.stringify(valued.body)).toBe(200);
      expect(valued.body.event.status).toBe("POSTED");
      const repeated=await post(context.owner,base+"/stock-movements/"+movement.id+"/value-receipt",{unitCost:"7",currencyCode:fixture.currencyCode});
      expect(repeated.status,JSON.stringify(repeated.body)).toBe(200);expect(repeated.body.event.id).toBe(valued.body.event.id);
    }
    const receiptValuations=await prisma.enterpriseInventoryAccountingEvent.findMany({where:{organizationId,stockMovementId:{in:movementsReceived.map(row=>row.id)},eventType:"RECEIPT"}});
    expect(receiptValuations).toHaveLength(2);
    expect(receiptValuations.reduce((sum,row)=>sum.plus(row.totalCost),new Prisma.Decimal(0)).equals(70)).toBe(true);
    expect(receiptValuations.every(row=>row.status==="POSTED"&&row.journalEntryId)).toBe(true);
    const receiptBalances=await prisma.enterpriseInventoryBalance.findMany({where:{organizationId,inventoryItemId:historicalInventory.id}});
    expect(receiptBalances.reduce((sum,row)=>sum.plus(row.quantityOnHand),new Prisma.Decimal(0)).equals(110)).toBe(true);

    // Return feasibility is deliberately read-only until the independent
    // dispatch/credit reconciliation workflow is implemented. Check the real
    // original receipt, lot, valuation, posted supplier invoice and ledger.
    const returnedSource=movementsReceived.find(row=>row.stockLot.lotNumber==="PURCHASE-A");
    const returnCheck=base+"/purchases/"+normalPurchase.id+"?view=supplier-return-preflight&movementId="+encodeURIComponent(returnedSource.id);
    const availableCheck=await context.owner.request.get(returnCheck+"&quantity=2",{headers:{"Accept-Language":"fr"}});
    expect(availableCheck.status(),await availableCheck.text()).toBe(409);
    expect((await availableCheck.json()).error).toBe("SUPPLIER_RETURN_ISOLATE_FIRST");
    const isolatedSupplierLot=await patchLot(context.owner,{id:returnedSource.stockLotId,revision:returnedSource.stockLot.revision,status:"QUARANTINED",qualityReason:"E2E supplier return awaiting evidence"});
    expect(isolatedSupplierLot.status,JSON.stringify(isolatedSupplierLot.body)).toBe(200);
    const tooMuch=await context.owner.request.get(returnCheck+"&quantity=5");
    expect(tooMuch.status(),await tooMuch.text()).toBe(409);
    expect((await tooMuch.json()).error).toBe("SUPPLIER_RETURN_QUANTITY_INVALID");
    const invalidPrecision=await context.owner.request.get(returnCheck+"&quantity=1.0001");
    expect(invalidPrecision.status()).toBe(400);
    const missingInvoice=await context.owner.request.get(returnCheck+"&quantity=2");
    expect(missingInvoice.status(),await missingInvoice.text()).toBe(409);
    expect((await missingInvoice.json()).error).toBe("SUPPLIER_RETURN_INVOICE_REQUIRED");
    const wrongPurchase=await context.owner.request.get(base+"/purchases/"+recalledPurchase.id+"?view=supplier-return-preflight&movementId="+encodeURIComponent(returnedSource.id)+"&quantity=2");
    expect(wrongPurchase.status()).toBe(404);
    const unauthorizedPreview=await context.cashier.request.get(returnCheck+"&quantity=2");
    expect([403,404]).toContain(unauthorizedPreview.status());

    // Seed an already approved invoice; posting itself uses the real Finance
    // endpoint, which creates its journal, payable and canonical posting batch.
    const supplierInvoice=await prisma.enterpriseSupplierInvoice.create({data:{
      organizationId,number:historyKey+"-BILL",supplierId:supplier.id,businessPartyId:supplierParty.id,
      purchaseId:normalPurchase.id,purchaseReceiptId:purchaseReceipt.body.receipt.id,status:"APPROVED",
      invoiceDate:new Date(),currencyCode:fixture.currencyCode,subtotal:"70",taxTotal:"0",grandTotal:"70",outstandingAmount:"70",
      approvedAt:new Date(),approvedByUserId:fixture.settler.id,createdByUserId:fixture.owner.id,
      items:{create:{catalogItemId:historicalProduct.id,description:historicalProduct.name,quantity:"10",unitPrice:"7",netAmount:"70",taxAmount:"0",totalAmount:"70"}},
      threeWayMatch:{create:{purchaseId:normalPurchase.id,purchaseReceiptId:purchaseReceipt.body.receipt.id,quantityVariance:0,priceVariance:0,taxVariance:0,currencyMatches:true,supplierMatches:true,withinTolerance:true,status:"MATCHED",checkedAt:new Date()}}
    }});
    await ensureStepUp(context.owner,ownerPassword);
    const postedSupplierInvoice=await post(context.owner,base+"/supplier-invoices/"+supplierInvoice.id+"/transition",{action:"POST",revision:supplierInvoice.revision});
    expect(postedSupplierInvoice.status,JSON.stringify(postedSupplierInvoice.body)).toBe(200);
    const supplierPayable=await prisma.enterprisePayable.findUniqueOrThrow({where:{supplierInvoiceId:supplierInvoice.id}});
    expect(supplierPayable.outstandingAmount.equals(70)).toBe(true);
    const snapshotBeforeCheck={
      movements:await prisma.enterpriseStockMovement.count({where:{organizationId,inventoryItemId:historicalInventory.id}}),
      valuation:await prisma.enterpriseInventoryAccountingEvent.count({where:{organizationId,inventoryItemId:historicalInventory.id}}),
      journals:await prisma.enterpriseJournalEntry.count({where:{organizationId}}),
      adjustments:await prisma.enterpriseStockAdjustment.count({where:{organizationId,inventoryItemId:historicalInventory.id}}),
      credits:await prisma.enterpriseSupplierCreditNote.count({where:{organizationId,supplierInvoiceId:supplierInvoice.id}})
    };
    const validPreview=await context.owner.request.get(returnCheck+"&quantity=2",{headers:{"Accept-Language":"en"}});
    expect(validPreview.status(),await validPreview.text()).toBe(200);
    const validPreviewBody=await validPreview.json();
    expect(validPreviewBody).toMatchObject({eligible:true,readOnly:true,quantity:"2",remaining:"4",unitCost:"7",totalCost:"14",currencyCode:fixture.currencyCode,receiptReference:purchaseReceipt.body.receipt.reference,invoiceReference:supplierInvoice.number});
    const repeatedPreview=await context.owner.request.get(returnCheck+"&quantity=2");
    expect(repeatedPreview.status()).toBe(200);
    expect(await repeatedPreview.json()).toEqual(validPreviewBody);
    expect(await prisma.enterpriseStockMovement.count({where:{organizationId,inventoryItemId:historicalInventory.id}})).toBe(snapshotBeforeCheck.movements);
    expect(await prisma.enterpriseInventoryAccountingEvent.count({where:{organizationId,inventoryItemId:historicalInventory.id}})).toBe(snapshotBeforeCheck.valuation);
    expect(await prisma.enterpriseJournalEntry.count({where:{organizationId}})).toBe(snapshotBeforeCheck.journals);
    expect(await prisma.enterpriseStockAdjustment.count({where:{organizationId,inventoryItemId:historicalInventory.id}})).toBe(snapshotBeforeCheck.adjustments);
    expect(await prisma.enterpriseSupplierCreditNote.count({where:{organizationId,supplierInvoiceId:supplierInvoice.id}})).toBe(snapshotBeforeCheck.credits);
    expect((await prisma.enterprisePayable.findUniqueOrThrow({where:{supplierInvoiceId:supplierInvoice.id}})).outstandingAmount.equals(70)).toBe(true);
    expect((await prisma.enterpriseInventoryBalance.findFirstOrThrow({where:{organizationId,stockLotId:returnedSource.stockLotId}})).quantityOnHand.equals(4)).toBe(true);

    // Formal return application binds the original receipt and accounting
    // proof to a separate independent review; approval is not dispatch.
    const returnCandidates=await context.owner.request.get(base+"/purchases/"+normalPurchase.id+"?view=supplier-return-approvers");
    expect(returnCandidates.status(),await returnCandidates.text()).toBe(200);
    const returnCandidatesBody=await returnCandidates.json();
    expect(returnCandidatesBody.candidates.some(row=>row.userId===fixture.settler.id)).toBe(true);
    expect(returnCandidatesBody.candidates.some(row=>row.userId===fixture.owner.id)).toBe(false);
    const submitReturnPath=base+"/purchases/"+normalPurchase.id+"?action=submit-supplier-return";
    const requestPayload={movementId:returnedSource.id,quantity:"2",reason:"Supplier agreed to review isolated defective units",approverUserId:fixture.settler.id,idempotencyKey:historyKey+"-supplier-return"};
    const selfReturn=await post(context.owner,submitReturnPath,{...requestPayload,approverUserId:fixture.owner.id});
    expect(selfReturn.status,JSON.stringify(selfReturn.body)).toBe(403);
    expect(selfReturn.body.error).toBe("SUPPLIER_RETURN_INDEPENDENT_REQUIRED");
    const cashierReturn=await post(context.cashier,submitReturnPath,requestPayload);
    expect([403,404]).toContain(cashierReturn.status);
    // Withdraw a previously approved but undispatched dossier without rewriting
    // the original independent decision. The invoice slot is then reusable.
    {
      const prior=await post(context.owner,submitReturnPath,{...requestPayload,idempotencyKey:historyKey+"-withdrawal-test"});
      expect(prior.status,JSON.stringify(prior.body)).toBe(201);
      const priorId=prior.body.request.id,priorApprovalId=prior.body.approvalId;
      const priorCoordination=await context.settler.request.get(base+"/approvals/"+priorApprovalId+"/coordination");
      expect(priorCoordination.status()).toBe(200);
      const priorReview=await priorCoordination.json();
      const priorDecision=await post(context.settler,base+"/approvals/"+priorApprovalId+"/actions",{action:"APPROVE",revision:priorReview.approval.revision,reviewedVersionId:priorReview.versions[0].id});
      expect(priorDecision.status,JSON.stringify(priorDecision.body)).toBe(200);
      const priorApproved=await prisma.enterpriseSupplierReturnRequest.findFirstOrThrow({where:{organizationId,id:priorId}});
      const withdrawalPath=base+"/purchases/"+normalPurchase.id+"?action=withdraw-supplier-return";
      const withdrawalPayload={requestId:priorId,revision:priorApproved.revision,reason:"Supplier withdrew authorization before physical handover",confirmUndispatched:true};
      expect((await post(context.settler,withdrawalPath,withdrawalPayload)).status).toBe(403);
      expect((await post(context.owner,withdrawalPath,{...withdrawalPayload,confirmUndispatched:false})).status).toBe(400);
      expect((await post(context.owner,withdrawalPath,{...withdrawalPayload,reason:"short"})).status).toBe(400);
      expect((await post(context.owner,withdrawalPath,{...withdrawalPayload,revision:priorApproved.revision+1})).status).toBe(409);
      const withdrawn=await post(context.owner,withdrawalPath,withdrawalPayload);
      expect(withdrawn.status,JSON.stringify(withdrawn.body)).toBe(200);
      expect(withdrawn.body.request.status).toBe("CANCELLED");
      const replayWithdrawal=await post(context.owner,withdrawalPath,withdrawalPayload);
      expect(replayWithdrawal.status).toBe(200);expect(replayWithdrawal.body.idempotent).toBe(true);
      expect((await post(context.owner,withdrawalPath,{...withdrawalPayload,reason:"Another reason cannot overwrite evidence"})).status).toBe(409);
      const withdrawnRecord=await prisma.enterpriseSupplierReturnRequest.findFirstOrThrow({where:{organizationId,id:priorId}});
      expect(withdrawnRecord.cancelledAfterApprovalByUserId).toBe(fixture.owner.id);
      expect(withdrawnRecord.cancellationReason).toBe(withdrawalPayload.reason);
      expect(withdrawnRecord.decidedAt.getTime()).toBe(priorApproved.decidedAt.getTime());
      expect(withdrawnRecord.dispatchMovementId).toBeNull();
      expect(await prisma.enterpriseApprovalDecision.count({where:{organizationId,approvalId:priorApprovalId,decision:"APPROVE"}})).toBe(1);
      const historicalReview=await context.settler.request.get(base+"/approvals/"+priorApprovalId+"/coordination");
      expect(historicalReview.status()).toBe(200);
      const historicalReviewBody=await historicalReview.json();
      expect(historicalReviewBody.approval.status).toBe("APPROVED");
      expect(historicalReviewBody.supplierReturn).toMatchObject({status:"CANCELLED",cancellationReason:withdrawalPayload.reason});
      expect(historicalReviewBody.versions[0].id).toBe(priorReview.versions[0].id);
      expect((await post(context.owner,base+"/purchases/"+normalPurchase.id+"?action=dispatch-supplier-return",{requestId:priorId,revision:withdrawnRecord.revision,dispatchReference:historyKey+"-CANCELLED"})).status).toBe(409);
      expect(await prisma.enterpriseStockMovement.count({where:{organizationId,inventoryItemId:historicalInventory.id}})).toBe(snapshotBeforeCheck.movements);
      expect(await prisma.enterpriseInventoryAccountingEvent.count({where:{organizationId,inventoryItemId:historicalInventory.id}})).toBe(snapshotBeforeCheck.valuation);
      expect(await prisma.enterpriseJournalEntry.count({where:{organizationId}})).toBe(snapshotBeforeCheck.journals);
      expect((await prisma.enterpriseInventoryBalance.findFirstOrThrow({where:{organizationId,stockLotId:returnedSource.stockLotId}})).quantityOnHand.equals(4)).toBe(true);
      expect((await prisma.enterprisePayable.findUniqueOrThrow({where:{supplierInvoiceId:supplierInvoice.id}})).outstandingAmount.equals(70)).toBe(true);
    }
    const requestReturn=await post(context.owner,submitReturnPath,requestPayload);
    expect(requestReturn.status,JSON.stringify(requestReturn.body)).toBe(201);
    expect(requestReturn.body.request.status).toBe("PENDING_APPROVAL");
    const returnRequestId=requestReturn.body.request.id;
    const supplierApprovalId=requestReturn.body.approvalId;
    const returnRecord=await prisma.enterpriseSupplierReturnRequest.findFirstOrThrow({where:{organizationId,id:returnRequestId}});
    expect(returnRecord.sourceMovementId).toBe(returnedSource.id);
    expect(returnRecord.supplierInvoiceId).toBe(supplierInvoice.id);
    expect(returnRecord.totalCost.equals(14)).toBe(true);
    const replayReturn=await post(context.owner,submitReturnPath,requestPayload);
    expect(replayReturn.status,JSON.stringify(replayReturn.body)).toBe(200);
    expect(replayReturn.body.idempotent).toBe(true);
    expect(replayReturn.body.request.id).toBe(returnRequestId);
    const changedReturn=await post(context.owner,submitReturnPath,{...requestPayload,quantity:"1"});
    expect(changedReturn.status).toBe(409);
    const newReturn=await post(context.owner,submitReturnPath,{...requestPayload,idempotencyKey:historyKey+"-supplier-return-duplicate"});
    expect(newReturn.status,JSON.stringify(newReturn.body)).toBe(409);
    expect(newReturn.body.error).toBe("SUPPLIER_RETURN_ALREADY_OPEN");
    const reviewPath=base+"/approvals/"+supplierApprovalId+"/coordination";
    const reviewDenied=await context.cashier.request.get(reviewPath);
    expect([403,404]).toContain(reviewDenied.status());
    const reviewAllowed=await context.settler.request.get(reviewPath);
    expect(reviewAllowed.status(),await reviewAllowed.text()).toBe(200);
    const reviewBody=await reviewAllowed.json();
    expect(reviewBody.capabilities.canApprove).toBe(true);
    expect(reviewBody.capabilities.canDelegate).toBe(false);
    expect(reviewBody.versions).toHaveLength(1);
    expect(reviewBody.sourceDeepLink).toBe("/enterprise-modules/SUPPLIERS_PURCHASES?purchase="+encodeURIComponent(normalPurchase.id)+"&returnMovement="+encodeURIComponent(returnedSource.id));
    const exactSource=await context.settler.request.get(receiptTracePath+"&movementId="+encodeURIComponent(returnedSource.id));
    expect(exactSource.status(),await exactSource.text()).toBe(200);
    const exactSourceBody=await exactSource.json();
    expect(exactSourceBody.items.map(row=>row.id)).toEqual([returnedSource.id]);
    expect(exactSourceBody.items[0].supplierReturnRequest).toMatchObject({reference:returnRecord.reference,status:"PENDING_APPROVAL",approvalId:supplierApprovalId});
    expect(reviewBody.versions[0].snapshotJson).toMatchObject({reference:returnRecord.reference,lotNumber:"PURCHASE-A",quantity:"2",totalAmount:"14",supplierInvoiceReference:supplierInvoice.number});
    const actionPath=base+"/approvals/"+supplierApprovalId+"/actions";
    const decisionPayload={action:"APPROVE",revision:reviewBody.approval.revision,reviewedVersionId:reviewBody.versions[0].id};
    const attemptedSelfDecision=await post(context.owner,actionPath,decisionPayload);
    expect(attemptedSelfDecision.status).toBe(403);
    const unreviewedReturn=await post(context.settler,actionPath,{action:"APPROVE",revision:reviewBody.approval.revision});
    expect(unreviewedReturn.status).toBe(409);
    const approvedReturn=await post(context.settler,actionPath,decisionPayload);
    expect(approvedReturn.status,JSON.stringify(approvedReturn.body)).toBe(200);
    expect(approvedReturn.body.approval.status).toBe("APPROVED");
    expect((await prisma.enterpriseSupplierReturnRequest.findFirstOrThrow({where:{organizationId,id:returnRequestId}})).status).toBe("APPROVED");
    expect(await prisma.enterpriseApprovalDecision.count({where:{organizationId,approvalId:supplierApprovalId,decision:"APPROVE",actorUserId:fixture.settler.id}})).toBe(1);
    const staleDecision=await post(context.settler,actionPath,decisionPayload);
    expect(staleDecision.status).toBe(409);
    const approvedTrace=await context.owner.request.get(receiptTracePath+"&search=PURCHASE-A");
    expect(approvedTrace.status()).toBe(200);
    expect((await approvedTrace.json()).items[0].supplierReturnRequest).toMatchObject({reference:returnRecord.reference,status:"APPROVED",quantity:"2",approvalId:supplierApprovalId});
    expect(await prisma.enterpriseStockMovement.count({where:{organizationId,inventoryItemId:historicalInventory.id}})).toBe(snapshotBeforeCheck.movements);
    expect(await prisma.enterpriseInventoryAccountingEvent.count({where:{organizationId,inventoryItemId:historicalInventory.id}})).toBe(snapshotBeforeCheck.valuation);
    expect(await prisma.enterpriseJournalEntry.count({where:{organizationId}})).toBe(snapshotBeforeCheck.journals);
    expect(await prisma.enterpriseStockAdjustment.count({where:{organizationId,inventoryItemId:historicalInventory.id}})).toBe(snapshotBeforeCheck.adjustments);
    expect(await prisma.enterpriseSupplierCreditNote.count({where:{organizationId,supplierInvoiceId:supplierInvoice.id}})).toBe(snapshotBeforeCheck.credits);
    expect((await prisma.enterprisePayable.findUniqueOrThrow({where:{supplierInvoiceId:supplierInvoice.id}})).outstandingAmount.equals(70)).toBe(true);
    expect((await prisma.enterpriseInventoryBalance.findFirstOrThrow({where:{organizationId,stockLotId:returnedSource.stockLotId}})).quantityOnHand.equals(4)).toBe(true);

    // Actual HTTP dispatch and Finance credit posting against PostgreSQL.
    // It must not be possible to spend or credit the reserved part of the
    // payable before the linked supplier document has been posted.
    const approvedRecord=await prisma.enterpriseSupplierReturnRequest.findFirstOrThrow({where:{organizationId,id:returnRequestId}});
    const dispatchPath=base+"/purchases/"+normalPurchase.id+"?action=dispatch-supplier-return";
    const dispatchPayload={requestId:returnRequestId,revision:approvedRecord.revision,dispatchReference:historyKey+"-DISPATCH"};
    const noDispatch=await post(context.settler,dispatchPath,dispatchPayload);
    expect(noDispatch.status,JSON.stringify(noDispatch.body)).toBe(403);
    const staleDispatch=await post(context.owner,dispatchPath,{...dispatchPayload,revision:approvedRecord.revision+1});
    expect(staleDispatch.status).toBe(409);
    const sourceLayer=await prisma.enterpriseInventoryCostLayer.findFirstOrThrow({where:{organizationId,id:approvedRecord.originCostLayerId}});
    // A closed fiscal period must roll back even a physically valid dispatch.
    // Change only the ephemeral fixture period, restoring it in finally.
    const returnBusinessContextResponse=await context.owner.request.get(base+"/business-context");
    expect(returnBusinessContextResponse.status()).toBe(200);
    const returnBusinessContext=await returnBusinessContextResponse.json();
    const ledgerDay=new Date(returnBusinessContext.businessDate+"T00:00:00.000Z");
    const returnPeriod=await prisma.enterpriseFiscalPeriod.findFirstOrThrow({where:{organizationId,fiscalYear:{status:"OPEN"},startDate:{lte:ledgerDay},endDate:{gte:ledgerDay}},orderBy:{startDate:"desc"}});
    expect(returnPeriod.status).toBe("OPEN");
    await prisma.enterpriseFiscalPeriod.update({where:{id:returnPeriod.id},data:{status:"CLOSED"}});
    try {
      const closedDispatch=await post(context.owner,dispatchPath,dispatchPayload);
      expect(closedDispatch.status,JSON.stringify(closedDispatch.body)).toBe(409);
      expect((await prisma.enterpriseSupplierReturnRequest.findFirstOrThrow({where:{organizationId,id:returnRequestId}})).status).toBe("APPROVED");
      expect((await prisma.enterpriseInventoryBalance.findFirstOrThrow({where:{organizationId,stockLotId:returnedSource.stockLotId}})).quantityOnHand.equals(4)).toBe(true);
      expect((await prisma.enterpriseInventoryCostLayer.findFirstOrThrow({where:{organizationId,id:sourceLayer.id}})).remainingQuantity.equals(sourceLayer.remainingQuantity)).toBe(true);
      expect(await prisma.enterpriseStockMovement.count({where:{organizationId,sourceEntityType:"EnterpriseSupplierReturnRequest",sourceEntityId:returnRequestId}})).toBe(0);
      expect(await prisma.enterpriseJournalEntry.count({where:{organizationId}})).toBe(snapshotBeforeCheck.journals);
      expect(await prisma.enterpriseInventoryAccountingEvent.count({where:{organizationId,inventoryItemId:historicalInventory.id}})).toBe(snapshotBeforeCheck.valuation);
    } finally {
      await prisma.enterpriseFiscalPeriod.update({where:{id:returnPeriod.id},data:{status:returnPeriod.status}});
    }
    // Competing identical dispatch requests must create one physical movement,
    // regardless of whether the loser gets an idempotent reply or a conflict.
    const dispatchRace=await Promise.all([post(context.owner,dispatchPath,dispatchPayload),post(context.owner,dispatchPath,dispatchPayload)]);
    expect(dispatchRace.every(result=>[200,409].includes(result.status)),JSON.stringify(dispatchRace.map(result=>({status:result.status,body:result.body})))).toBe(true);
    const dispatchResult=dispatchRace.find(result=>result.status===200);
    expect(dispatchResult).toBeTruthy();
    expect(dispatchResult.body.request.status).toBe("DISPATCHED");
    const dispatchedRecord=await prisma.enterpriseSupplierReturnRequest.findFirstOrThrow({where:{organizationId,id:returnRequestId}});
    expect(dispatchedRecord.dispatchReference).toBe(dispatchPayload.dispatchReference);
    expect(dispatchedRecord.dispatchedByUserId).toBe(fixture.owner.id);
    expect((await post(context.owner,base+"/purchases/"+normalPurchase.id+"?action=withdraw-supplier-return",{requestId:returnRequestId,revision:dispatchedRecord.revision,reason:"Cannot withdraw after physical handover",confirmUndispatched:true})).status).toBe(409);
    const dispatchMovement=await prisma.enterpriseStockMovement.findFirstOrThrow({where:{organizationId,id:dispatchedRecord.dispatchMovementId}});
    expect(dispatchMovement.movementType).toBe("SUPPLIER_RETURN_OUT");
    expect(dispatchMovement.direction).toBe("OUT");
    expect(dispatchMovement.quantity.equals(2)).toBe(true);
    expect(dispatchMovement.stockLotId).toBe(returnedSource.stockLotId);
    expect((await prisma.enterpriseInventoryBalance.findFirstOrThrow({where:{organizationId,stockLotId:returnedSource.stockLotId}})).quantityOnHand.equals(2)).toBe(true);
    expect((await prisma.enterpriseInventoryCostLayer.findFirstOrThrow({where:{organizationId,id:sourceLayer.id}})).remainingQuantity.equals(sourceLayer.remainingQuantity.minus(2))).toBe(true);
    const dispatchValue=await prisma.enterpriseInventoryAccountingEvent.findFirstOrThrow({where:{organizationId,id:dispatchedRecord.dispatchAccountingEventId}});
    expect(dispatchValue.eventType).toBe("SUPPLIER_RETURN");
    expect(dispatchValue.status).toBe("POSTED");
    expect(dispatchValue.totalCost.equals(14)).toBe(true);
    const dispatchJournal=await prisma.enterpriseJournalEntry.findFirstOrThrow({where:{organizationId,id:dispatchValue.journalEntryId},include:{lines:true}});
    expect(dispatchJournal.postingEvent).toBe("INVENTORY_SUPPLIER_RETURN_VALUED");
    expect(dispatchJournal.totalDebit.equals(14)).toBe(true);
    expect(dispatchJournal.totalCredit.equals(14)).toBe(true);
    expect(dispatchJournal.lines).toHaveLength(2);
    const replayDispatch=await post(context.owner,dispatchPath,dispatchPayload);
    expect(replayDispatch.status,JSON.stringify(replayDispatch.body)).toBe(200);
    expect(replayDispatch.body.idempotent).toBe(true);
    expect(await prisma.enterpriseStockMovement.count({where:{organizationId,sourceEntityType:"EnterpriseSupplierReturnRequest",sourceEntityId:returnRequestId}})).toBe(1);
    expect((await prisma.enterprisePayable.findUniqueOrThrow({where:{supplierInvoiceId:supplierInvoice.id}})).outstandingAmount.equals(70)).toBe(true);

    const payableDetailUrl=base+"/payables?recordId="+encodeURIComponent(supplierPayable.id);
    const invoiceDetailUrl=base+"/supplier-invoices?recordId="+encodeURIComponent(supplierInvoice.id);
    const heldPayableView=await context.owner.request.get(payableDetailUrl);
    expect(heldPayableView.status(),await heldPayableView.text()).toBe(200);
    expect((await heldPayableView.json()).items[0]).toMatchObject({outstandingAmount:"70",supplierReturnReservedAmount:"14",supplierReturnAllocatableAmount:"56",supplierReturn:{id:returnRequestId,status:"DISPATCHED"}});
    const heldInvoiceView=await context.owner.request.get(invoiceDetailUrl);
    expect(heldInvoiceView.status(),await heldInvoiceView.text()).toBe(200);
    expect((await heldInvoiceView.json()).items[0]).toMatchObject({outstandingAmount:"70",supplierReturnReservedAmount:"14",supplierReturnAllocatableAmount:"56",capabilities:{canCreateCredit:false}});

    // Negative allocation uses a confirmed-payment fixture solely to reach
    // the actual allocation guard; no cash or accounting movement is faked.
    const paymentProbe=await prisma.enterprisePayment.create({data:{
      organizationId,number:historyKey+"-PAYMENT-PROBE",direction:"OUTBOUND",paymentType:"SUPPLIER_PAYMENT",methodType:"BANK_TRANSFER",
      financialAccountId:fixture.bank.id,businessPartyId:supplierParty.id,currencyCode:fixture.currencyCode,amount:70,unallocatedAmount:70,
      paymentDate:new Date(),status:"CONFIRMED",initiatedByUserId:fixture.owner.id,approvedByUserId:fixture.settler.id,confirmedByUserId:fixture.owner.id,confirmedAt:new Date()
    }});
    const overReserved=await post(context.owner,base+"/payments/"+paymentProbe.id+"/allocations",{payableId:supplierPayable.id,amount:"57"});
    expect(overReserved.status,JSON.stringify(overReserved.body)).toBe(409);
    expect(overReserved.body.error).toBe("SUPPLIER_RETURN_PAYABLE_RESERVED");
    expect(await prisma.enterprisePaymentAllocation.count({where:{organizationId,paymentId:paymentProbe.id}})).toBe(0);
    expect((await prisma.enterprisePayment.findUniqueOrThrow({where:{id:paymentProbe.id}})).unallocatedAmount.equals(70)).toBe(true);
    const dispatchTrace=await context.owner.request.get(receiptTracePath+"&movementId="+encodeURIComponent(returnedSource.id));
    expect(dispatchTrace.status(),await dispatchTrace.text()).toBe(200);
    const dispatchBusinessDate=(await dispatchTrace.json()).items[0].supplierReturnRequest.dispatchBusinessDate;
    expect(dispatchBusinessDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const linkedCreditPayload={invoiceId:supplierInvoice.id,supplierReturnId:returnRequestId,supplierCreditReference:historyKey+"-SCN",creditDate:dispatchBusinessDate,reason:"Supplier confirmed credit for physically returned defective units",items:[{sourceInvoiceItemId:approvedRecord.supplierInvoiceItemId,description:historicalProduct.name,quantity:"2",unitPrice:"7"}]};
    const genericPayload={...linkedCreditPayload};delete genericPayload.supplierReturnId;delete genericPayload.supplierCreditReference;
    const genericDenied=await post(context.owner,base+"/supplier-credit-notes",genericPayload);
    expect(genericDenied.status,JSON.stringify(genericDenied.body)).toBe(409);
    const wrongAmount=await post(context.owner,base+"/supplier-credit-notes",{...linkedCreditPayload,items:[{...linkedCreditPayload.items[0],quantity:"1"}]});
    expect(wrongAmount.status).toBe(409);
    // Rejected documentary credit must be correctable without a second
    // dispatch or a release of the payable reserve. The rejection remains
    // visible and the replacement follows the original independent approval.
    const rejectedCreditPayload={...linkedCreditPayload,supplierCreditReference:historyKey+"-SCN-REJECTED",reason:"Initial supplier document requires corrected reference"};
    const rejectedCreditCreated=await post(context.owner,base+"/supplier-credit-notes",rejectedCreditPayload);
    expect(rejectedCreditCreated.status,JSON.stringify(rejectedCreditCreated.body)).toBe(201);
    const rejectedCreditId=rejectedCreditCreated.body.creditNote.id;
    const rejectedCreditPath=base+"/supplier-credit-notes/"+rejectedCreditId;
    const rejectedCreditSubmitted=await post(context.owner,rejectedCreditPath+"/transition",{action:"SUBMIT",revision:rejectedCreditCreated.body.creditNote.revision,approverUserId:fixture.settler.id});
    expect(rejectedCreditSubmitted.status,JSON.stringify(rejectedCreditSubmitted.body)).toBe(200);
    const rejectedCreditResult=await post(context.settler,rejectedCreditPath+"/transition",{action:"REJECT",revision:rejectedCreditSubmitted.body.creditNote.revision,reason:"Supplier document reference must be corrected"});
    expect(rejectedCreditResult.status,JSON.stringify(rejectedCreditResult.body)).toBe(200);
    expect(rejectedCreditResult.body.creditNote.status).toBe("REJECTED");
    const rejectedCreditRevision=rejectedCreditResult.body.creditNote.revision;
    const replacementPayload={...linkedCreditPayload,replacesCreditNoteId:rejectedCreditId,replacesCreditRevision:rejectedCreditRevision};
    const replacementTrace=await context.owner.request.get(receiptTracePath+"&movementId="+encodeURIComponent(returnedSource.id));
    expect(replacementTrace.status()).toBe(200);
    expect((await replacementTrace.json()).items[0].supplierReturnRequest).toMatchObject({status:"DISPATCHED",supplierCreditNoteId:rejectedCreditId,supplierCreditStatus:"REJECTED",supplierCreditRevision:rejectedCreditRevision,canReplaceCredit:true,canCreateCredit:false});
    const journalCountBeforeReplacement=await prisma.enterpriseJournalEntry.count({where:{organizationId}});
    for(const invalidReplacement of [{...replacementPayload,replacesCreditRevision:rejectedCreditRevision+1},{...replacementPayload,supplierCreditReference:rejectedCreditPayload.supplierCreditReference},linkedCreditPayload]){
      const refused=await post(context.owner,base+"/supplier-credit-notes",invalidReplacement);
      expect(refused.status,JSON.stringify(refused.body)).toBe(409);
    }
    const replacementRace=await Promise.all([
      post(context.owner,base+"/supplier-credit-notes",replacementPayload),
      post(context.owner,base+"/supplier-credit-notes",replacementPayload),
    ]);
    expect(replacementRace.every(result=>[201,409].includes(result.status)),JSON.stringify(replacementRace)).toBe(true);
    const createdCredit=replacementRace.find(result=>result.status===201);
    expect(createdCredit).toBeTruthy();
    expect(createdCredit.status,JSON.stringify(createdCredit.body)).toBe(201);
    const supplierReturnCreditId=createdCredit.body.creditNote.id;
    expect(createdCredit.body.creditNote.status).toBe("DRAFT");
    expect(Number(createdCredit.body.creditNote.grandTotal)).toBe(14);
    const replayCredit=await post(context.owner,base+"/supplier-credit-notes",replacementPayload);
    expect(replayCredit.status,JSON.stringify(replayCredit.body)).toBe(201);
    expect(replayCredit.body.creditNote.id).toBe(supplierReturnCreditId);
    expect(await prisma.enterpriseSupplierCreditNote.count({where:{organizationId,supplierInvoiceId:supplierInvoice.id}})).toBe(2);
    const rejectedOriginal=await prisma.enterpriseSupplierCreditNote.findFirstOrThrow({where:{organizationId,id:rejectedCreditId}});
    expect(rejectedOriginal.status).toBe("REJECTED");expect(rejectedOriginal.postedAt).toBeNull();
    expect(rejectedOriginal.reason).toBe(rejectedCreditPayload.reason);
    const replacementProof=await prisma.enterpriseSupplierReturnCreditReplacement.findFirstOrThrow({where:{organizationId,previousCreditNoteId:rejectedCreditId}});
    expect(replacementProof).toMatchObject({returnRequestId,previousCreditRevision:rejectedCreditRevision,previousSupplierReference:rejectedCreditPayload.supplierCreditReference.toUpperCase(),replacementCreditNoteId:supplierReturnCreditId,replacementSupplierReference:linkedCreditPayload.supplierCreditReference.toUpperCase(),replacedByUserId:fixture.owner.id});
    const rejectionApproval=await prisma.enterpriseApproval.findFirstOrThrow({where:{organizationId,id:replacementProof.rejectionApprovalId}});
    expect(rejectionApproval.status).toBe("REJECTED");expect(rejectionApproval.approverUserId).toBe(fixture.settler.id);
    expect(rejectionApproval.decisionComment).toBeTruthy();
    const refusedResubmit=await post(context.owner,rejectedCreditPath+"/transition",{action:"SUBMIT",revision:rejectedOriginal.revision,approverUserId:fixture.settler.id});
    expect(refusedResubmit.status,JSON.stringify(refusedResubmit.body)).toBe(409);
    const rejectedCreditView=await context.owner.request.get(base+"/supplier-credit-notes?recordId="+encodeURIComponent(rejectedCreditId));
    expect(rejectedCreditView.status()).toBe(200);
    expect((await rejectedCreditView.json()).items[0]).toMatchObject({status:"REJECTED",replacementCreditNoteId:supplierReturnCreditId,capabilities:{canSubmit:false}});
    const correctedTrace=await context.owner.request.get(receiptTracePath+"&movementId="+encodeURIComponent(returnedSource.id));
    expect(correctedTrace.status()).toBe(200);
    expect((await correctedTrace.json()).items[0].supplierReturnRequest).toMatchObject({previousCreditNoteId:rejectedCreditId,supplierCreditNoteId:supplierReturnCreditId,canReplaceCredit:false});
    expect(await prisma.enterpriseJournalEntry.count({where:{organizationId}})).toBe(journalCountBeforeReplacement);
    expect(await prisma.enterpriseStockMovement.count({where:{organizationId,sourceEntityType:"EnterpriseSupplierReturnRequest",sourceEntityId:returnRequestId}})).toBe(1);
    expect((await prisma.enterprisePayable.findUniqueOrThrow({where:{supplierInvoiceId:supplierInvoice.id}})).outstandingAmount.equals(70)).toBe(true);
    const stillHeld=await context.owner.request.get(payableDetailUrl);
    expect((await stillHeld.json()).items[0]).toMatchObject({supplierReturnReservedAmount:"14",supplierReturnAllocatableAmount:"56"});
    const creditPath=base+"/supplier-credit-notes/"+supplierReturnCreditId;
    const selfCredit=await post(context.owner,creditPath+"/transition",{action:"SUBMIT",revision:createdCredit.body.creditNote.revision,approverUserId:fixture.owner.id});
    expect(selfCredit.status).toBe(403);
    const submittedCredit=await post(context.owner,creditPath+"/transition",{action:"SUBMIT",revision:createdCredit.body.creditNote.revision,approverUserId:fixture.settler.id});
    expect(submittedCredit.status,JSON.stringify(submittedCredit.body)).toBe(200);
    const earlyPosting=await post(context.owner,creditPath+"/post",{revision:submittedCredit.body.creditNote.revision});
    expect(earlyPosting.status).toBe(409);
    const approvedSupplierReturnCredit=await post(context.settler,creditPath+"/transition",{action:"APPROVE",revision:submittedCredit.body.creditNote.revision});
    expect(approvedSupplierReturnCredit.status,JSON.stringify(approvedSupplierReturnCredit.body)).toBe(200);
    expect((await prisma.enterprisePayable.findUniqueOrThrow({where:{supplierInvoiceId:supplierInvoice.id}})).outstandingAmount.equals(70)).toBe(true);
    const postedCredit=await post(context.owner,creditPath+"/post",{revision:approvedSupplierReturnCredit.body.creditNote.revision});
    expect(postedCredit.status,JSON.stringify(postedCredit.body)).toBe(200);
    expect(postedCredit.body.creditNote.status).toBe("POSTED");
    const reconciliation=await prisma.enterpriseSupplierReturnRequest.findFirstOrThrow({where:{organizationId,id:returnRequestId}});
    expect(reconciliation.status).toBe("RECONCILED");
    expect(reconciliation.supplierCreditNoteId).toBe(supplierReturnCreditId);
    const creditJournal=await prisma.enterpriseJournalEntry.findFirstOrThrow({where:{organizationId,id:reconciliation.creditJournalEntryId},include:{lines:true}});
    expect(creditJournal.postingEvent).toBe("SUPPLIER_CREDIT_NOTE_POSTED");
    expect(creditJournal.totalDebit.equals(14)).toBe(true);
    expect(creditJournal.totalCredit.equals(14)).toBe(true);
    const clearingId=dispatchJournal.lines.find(line=>line.debit.equals(14)).ledgerAccountId;
    expect(creditJournal.lines.some(line=>line.ledgerAccountId===clearingId&&line.credit.equals(14)&&line.debit.isZero())).toBe(true);
    const finalPayable=await prisma.enterprisePayable.findUniqueOrThrow({where:{supplierInvoiceId:supplierInvoice.id}});
    expect(finalPayable.outstandingAmount.equals(56)).toBe(true);
    expect(finalPayable.creditedAmount.equals(14)).toBe(true);
    const matchedPayableView=await context.owner.request.get(payableDetailUrl);
    expect(matchedPayableView.status(),await matchedPayableView.text()).toBe(200);
    expect((await matchedPayableView.json()).items[0]).toMatchObject({outstandingAmount:"56",supplierReturnReservedAmount:"0",supplierReturnAllocatableAmount:"56",supplierReturn:{status:"RECONCILED",supplierCreditNoteId:supplierReturnCreditId}});
    const matchedInvoiceView=await context.owner.request.get(invoiceDetailUrl);
    expect(matchedInvoiceView.status(),await matchedInvoiceView.text()).toBe(200);
    expect((await matchedInvoiceView.json()).items[0]).toMatchObject({outstandingAmount:"56",supplierReturnReservedAmount:"0",supplierReturnAllocatableAmount:"56",capabilities:{canCreateCredit:false}});
    expect(await prisma.enterprisePayableAllocation.count({where:{organizationId,payableId:finalPayable.id,sourceType:"SUPPLIER_CREDIT_NOTE",sourceId:supplierReturnCreditId}})).toBe(1);
    expect((await post(context.owner,creditPath+"/post",{revision:approvedSupplierReturnCredit.body.creditNote.revision})).status).toBe(200);
    expect(await prisma.enterprisePayableAllocation.count({where:{organizationId,payableId:finalPayable.id,sourceType:"SUPPLIER_CREDIT_NOTE",sourceId:supplierReturnCreditId}})).toBe(1);
    expect((await prisma.enterpriseInventoryBalance.findFirstOrThrow({where:{organizationId,stockLotId:returnedSource.stockLotId}})).quantityOnHand.equals(2)).toBe(true);
    const finalTrace=await context.owner.request.get(receiptTracePath+"&search=PURCHASE-A");
    expect(finalTrace.status()).toBe(200);
    expect((await finalTrace.json()).items[0].supplierReturnRequest).toMatchObject({status:"RECONCILED",supplierCreditNoteId:supplierReturnCreditId,canDispatch:false,canCreateCredit:false});

    // The two receipt lots are separate physical origins of one invoice line.
    // Reconcile a second return from B only AFTER A has been credited.
    const siblingSource=movementsReceived.find(row=>row.stockLot.lotNumber==="PURCHASE-B");
    const siblingLot=await prisma.enterpriseStockLot.findUniqueOrThrow({where:{id:siblingSource.stockLotId}});
    const siblingIsolation=await patchLot(context.owner,{id:siblingLot.id,revision:siblingLot.revision,status:"QUARANTINED",qualityReason:"Defective units from second lot of same supplier receipt"});
    expect(siblingIsolation.status,JSON.stringify(siblingIsolation.body)).toBe(200);
    const siblingPreflight=await context.owner.request.get(base+"/purchases/"+normalPurchase.id+"?view=supplier-return-preflight&movementId="+encodeURIComponent(siblingSource.id)+"&quantity=3");
    expect(siblingPreflight.status(),await siblingPreflight.text()).toBe(200);
    expect(await siblingPreflight.json()).toMatchObject({remaining:"6",totalCost:"21",creditTotal:"21"});
    const siblingSubmit=await post(context.owner,submitReturnPath,{movementId:siblingSource.id,quantity:"3",reason:"Second lot return after first credit reconciliation",approverUserId:fixture.settler.id,idempotencyKey:historyKey+"-SIBLING"});
    expect(siblingSubmit.status,JSON.stringify(siblingSubmit.body)).toBe(201);
    const siblingId=siblingSubmit.body.request.id,siblingApprovalId=siblingSubmit.body.approvalId;
    const siblingReview=await context.settler.request.get(base+"/approvals/"+siblingApprovalId+"/coordination");
    expect(siblingReview.status()).toBe(200);
    const siblingReviewBody=await siblingReview.json();
    const siblingApproved=await post(context.settler,base+"/approvals/"+siblingApprovalId+"/actions",{action:"APPROVE",revision:siblingReviewBody.approval.revision,reviewedVersionId:siblingReviewBody.versions[0].id});
    expect(siblingApproved.status,JSON.stringify(siblingApproved.body)).toBe(200);
    const siblingApprovedRecord=await prisma.enterpriseSupplierReturnRequest.findUniqueOrThrow({where:{id:siblingId}});
    expect(siblingApprovedRecord.supplierInvoiceItemId).toBe(reconciliation.supplierInvoiceItemId);
    expect(siblingApprovedRecord.originCostLayerId).not.toBe(reconciliation.originCostLayerId);
    const siblingDispatch=await post(context.owner,dispatchPath,{requestId:siblingId,revision:siblingApprovedRecord.revision,dispatchReference:historyKey+"-SIBLING-SHIP"});
    expect(siblingDispatch.status,JSON.stringify(siblingDispatch.body)).toBe(200);
    const siblingTrace=await context.owner.request.get(receiptTracePath+"&search=PURCHASE-B");
    expect(siblingTrace.status()).toBe(200);
    const siblingCreditDate=(await siblingTrace.json()).items[0].supplierReturnRequest.dispatchBusinessDate;
    const siblingCredit=await post(context.owner,base+"/supplier-credit-notes",{invoiceId:supplierInvoice.id,supplierReturnId:siblingId,supplierCreditReference:historyKey+"-SIBLING-CREDIT",creditDate:siblingCreditDate,reason:"Supplier credit for second receipt lot",items:[{sourceInvoiceItemId:siblingApprovedRecord.supplierInvoiceItemId,description:historicalProduct.name,quantity:"3",unitPrice:"7"}]});
    expect(siblingCredit.status,JSON.stringify(siblingCredit.body)).toBe(201);
    expect(siblingCredit.body.creditNote.grandTotal).toBe("21");
    const siblingCreditPath=base+"/supplier-credit-notes/"+siblingCredit.body.creditNote.id;
    const siblingCreditSubmitted=await post(context.owner,siblingCreditPath+"/transition",{action:"SUBMIT",revision:siblingCredit.body.creditNote.revision,approverUserId:fixture.settler.id});
    expect(siblingCreditSubmitted.status,JSON.stringify(siblingCreditSubmitted.body)).toBe(200);
    const siblingCreditApproved=await post(context.settler,siblingCreditPath+"/transition",{action:"APPROVE",revision:siblingCreditSubmitted.body.creditNote.revision});
    expect(siblingCreditApproved.status,JSON.stringify(siblingCreditApproved.body)).toBe(200);
    const siblingCreditPosted=await post(context.owner,siblingCreditPath+"/post",{revision:siblingCreditApproved.body.creditNote.revision});
    expect(siblingCreditPosted.status,JSON.stringify(siblingCreditPosted.body)).toBe(200);
    const siblingClosed=await prisma.enterpriseSupplierReturnRequest.findUniqueOrThrow({where:{id:siblingId}});
    expect(siblingClosed.status).toBe("RECONCILED");
    expect(siblingClosed.dispatchMovementId).not.toBe(reconciliation.dispatchMovementId);
    expect(siblingClosed.creditJournalEntryId).not.toBe(reconciliation.creditJournalEntryId);
    expect(await prisma.enterpriseSupplierReturnRequest.findUniqueOrThrow({where:{id:returnRequestId}})).toEqual(reconciliation);
    const siblingPayable=await prisma.enterprisePayable.findUniqueOrThrow({where:{id:finalPayable.id}});
    expect(siblingPayable.creditedAmount.equals(35)&&siblingPayable.outstandingAmount.equals(35)).toBe(true);
    expect((await prisma.enterpriseInventoryBalance.findFirstOrThrow({where:{organizationId,stockLotId:siblingSource.stockLotId}})).quantityOnHand.equals(3)).toBe(true);
    expect((await prisma.enterpriseInventoryBalance.findFirstOrThrow({where:{organizationId,stockLotId:returnedSource.stockLotId}})).quantityOnHand.equals(2)).toBe(true);
    const bothTrace=await context.owner.request.get(receiptTracePath);
    expect(bothTrace.status()).toBe(200);
    const bothTraceItems=(await bothTrace.json()).items;
    expect(bothTraceItems.find(row=>row.id===returnedSource.id).supplierReturnHistory.map(row=>row.id)).toEqual([returnRequestId]);
    expect(bothTraceItems.find(row=>row.id===siblingSource.id).supplierReturnHistory.map(row=>row.id)).toEqual([siblingId]);

    // Recover the other, unrecalled batch of the same paid invoice through
    // a genuine inspected customer return; no direct stock/custody fixtures.
    {
      const recoveryReturn=await post(context.cashier,rbase,{...returnPayload,idempotencyKey:batchKey+"-recoverable",reason:"Returned early batch isolated pending repair appraisal",lines:[{checkoutLineId:batchCheckout.lines[0].id,quantity:"2",stockDisposition:"QUARANTINE",lotAllocations:[{stockLotId:batches[0].lot.id,quantity:"2"}]}]});
      expect(recoveryReturn.status,JSON.stringify(recoveryReturn.body)).toBe(201);
      const recoveredReturnPath=rbase+"/"+recoveryReturn.body.request.id;
      const inspected=await post(context.inspector,recoveredReturnPath+"/inspection",{revision:recoveryReturn.body.request.revision,receivedAndInspected:true,confirmedBatchSelection:true,notes:"Early batch inspected and placed in physical quarantine for repair"});
      expect(inspected.status,JSON.stringify(inspected.body)).toBe(200);
      const approved=await post(context.owner,recoveredReturnPath+"/decision",{decision:"APPROVE",revision:inspected.body.request.revision});
      expect(approved.status,JSON.stringify(approved.body)).toBe(200);
      const prepared=await post(context.preparer,recoveredReturnPath+"/prepare",{revision:approved.body.request.revision});
      expect(prepared.status,JSON.stringify(prepared.body)).toBe(201);
      const refundDoc=await prisma.enterprisePayment.findUniqueOrThrow({where:{id:prepared.body.request.refundPaymentId}});
      const creditDoc=await prisma.enterpriseSalesCreditNote.findUniqueOrThrow({where:{id:prepared.body.request.salesCreditNoteId}});
      await ensureStepUp(context.owner,ownerPassword);
      expect((await post(context.owner,base+"/payments/"+refundDoc.id+"/transition",{action:"APPROVE",revision:refundDoc.revision})).status).toBe(200);
      expect((await post(context.owner,base+"/sales-credit-notes/"+creditDoc.id+"/transition",{action:"APPROVE",revision:creditDoc.revision})).status).toBe(200);
      await ensureStepUp(context.returnSettler,cashierPassword);
      const settled=await post(context.returnSettler,recoveredReturnPath+"/settle",{revision:prepared.body.request.revision,reason:"Independent liquidation while safe batch remains isolated"});
      expect(settled.status,JSON.stringify(settled.body)).toBe(200);
      const recoverableCustody=await prisma.enterpriseInventoryReturnCustody.findFirstOrThrow({where:{organizationId,returnLine:{returnRequestId:recoveryReturn.body.request.id}}});
      expect(recoverableCustody.quantity.equals(2)).toBe(true);
      expect(recoverableCustody.status).toBe("QUARANTINED");
      expect((await batchStock(0)).isZero()).toBe(true);
      const previewPath=qualityPath+"?view=custody-recovery&custodyId="+encodeURIComponent(recoverableCustody.id);
      const eligibleResponse=await context.owner.request.get(previewPath);
      expect(eligibleResponse.status(),await eligibleResponse.text()).toBe(200);
      expect(await eligibleResponse.json()).toMatchObject({historicalCostCeiling:"14",quantity:"2",readOnly:true,physicalReleaseAuthorized:false,accountingRecognitionAuthorized:false});
      const candidateResponse=await context.owner.request.get(qualityPath+"?view=custody-recovery-approvers&custodyId="+encodeURIComponent(recoverableCustody.id));
      expect(candidateResponse.status(),await candidateResponse.text()).toBe(200);
      expect((await candidateResponse.json()).candidates.some(row=>row.userId===fixture.settler.id)).toBe(true);
      async function recoveryAction(actor,action,data){
        const response=await actor.request.patch(qualityPath+"?action="+action,{data,headers:{origin:baseUrl,referer:baseUrl+"/enterprise-modules/INVENTORY_LOGISTICS"}});
        return {status:response.status(),body:await response.json().catch(()=>null)};
      }
      const input={custodyId:recoverableCustody.id,custodyRevision:recoverableCustody.revision,estimatedSellingAmount:"18",completionCost:"5",sellingCost:"2",evidenceReference:batchKey+"-REPORT",findings:"Independent physical examination confirms the early batch can be repaired.",confirmedPhysicalInspection:true,approverUserId:fixture.settler.id,idempotencyKey:batchKey+"-ASSESS"};
      expect((await recoveryAction(context.owner,"submit-recovery-assessment",{...input,approverUserId:fixture.owner.id})).status).toBe(403);
      const beforeRecovery={journals:await prisma.enterpriseJournalEntry.count({where:{organizationId}}),credits:await prisma.enterpriseSalesCreditNote.count({where:{organizationId,salesInvoiceId:bi}}),payments:await prisma.enterprisePayment.count({where:{organizationId}})};
      const created=await recoveryAction(context.owner,"submit-recovery-assessment",input);
      expect(created.status,JSON.stringify(created.body)).toBe(201);
      expect(created.body.assessment.proposedRecoveryAmount).toBe("11");
      expect((await recoveryAction(context.owner,"submit-recovery-assessment",input)).body.idempotent).toBe(true);
      const deniedDisposal=await patchLot(context.owner,{custodyId:recoverableCustody.id,revision:recoverableCustody.revision,action:"REQUEST_DISPOSAL",reason:"Conflicting disposal while appraisal is active"});
      expect(deniedDisposal.status).toBe(409);
      expect(deniedDisposal.body.error).toBe("INVENTORY_RETURN_RECOVERY_ACTIVE");
      const reviewPath=base+"/approvals/"+created.body.approvalId;
      const reviewResponse=await context.settler.request.get(reviewPath+"/coordination");
      expect(reviewResponse.status(),await reviewResponse.text()).toBe(200);
      const review=await reviewResponse.json();
      expect(review.versions[0].snapshotJson).toMatchObject({historicalCostCeiling:"14",totalAmount:"11"});
      const reviewed=await post(context.settler,reviewPath+"/actions",{action:"APPROVE",revision:review.approval.revision,reviewedVersionId:review.versions[0].id});
      expect(reviewed.status,JSON.stringify(reviewed.body)).toBe(200);
      const appraised=await prisma.enterpriseInventoryReturnRecoveryAssessment.findFirstOrThrow({where:{organizationId,id:created.body.assessment.id}});
      expect(appraised.status).toBe("APPROVED");
      expect((await batchStock(0)).isZero()).toBe(true);
      expect(await prisma.enterpriseJournalEntry.count({where:{organizationId}})).toBe(beforeRecovery.journals);
      const executeInput={custodyId:recoverableCustody.id,assessmentId:appraised.id,revision:appraised.revision,releaseEvidence:"Final inspection passed; repairs completed and physical release recorded",confirmedSaleableAndRepaired:true};
      expect((await recoveryAction(context.settler,"execute-recovery-assessment",executeInput)).status).toBe(403);
      expect((await recoveryAction(context.owner,"execute-recovery-assessment",{...executeInput,confirmedSaleableAndRepaired:false})).status).toBe(400);
      const period=await prisma.enterpriseFiscalPeriod.findFirstOrThrow({where:{organizationId,id:returnPeriod.id}});
      expect(period.status).toBe("OPEN");
      await prisma.enterpriseFiscalPeriod.update({where:{id:period.id},data:{status:"CLOSED"}});
      try{
        const closed=await recoveryAction(context.owner,"execute-recovery-assessment",executeInput);
        expect(closed.status,JSON.stringify(closed.body)).toBe(409);
        expect((await batchStock(0)).isZero()).toBe(true);
        expect((await prisma.enterpriseInventoryReturnRecoveryAssessment.findFirstOrThrow({where:{organizationId,id:appraised.id}})).status).toBe("APPROVED");
        expect(await prisma.enterpriseJournalEntry.count({where:{organizationId}})).toBe(beforeRecovery.journals);
        expect(await prisma.enterpriseStockMovement.count({where:{organizationId,sourceEntityType:"EnterpriseInventoryReturnRecoveryAssessment",sourceEntityId:appraised.id}})).toBe(0);
      }finally{
        await prisma.enterpriseFiscalPeriod.update({where:{id:period.id},data:{status:period.status}});
      }
      const [firstRecovery,secondRecovery,competingDisposal]=await Promise.all([
        recoveryAction(context.owner,"execute-recovery-assessment",executeInput),
        recoveryAction(context.owner,"execute-recovery-assessment",executeInput),
        patchLot(context.owner,{custodyId:recoverableCustody.id,revision:recoverableCustody.revision,action:"REQUEST_DISPOSAL",reason:"Concurrent destruction must not race an approved recovery"}),
      ]);
      const competing=[firstRecovery,secondRecovery];
      expect(competingDisposal.status,JSON.stringify(competingDisposal.body)).toBe(409);
      expect(["INVENTORY_RETURN_RECOVERY_ACTIVE","INVENTORY_LOT_CONFLICT"]).toContain(competingDisposal.body.error);
      expect(competing.every(result=>[200,409].includes(result.status)),JSON.stringify(competing)).toBe(true);
      const executed=competing.find(result=>result.status===200);
      expect(executed).toBeTruthy();
      expect(executed.body.assessment.status).toBe("EXECUTED");
      expect((await batchStock(0)).equals(2)).toBe(true);
      const completion=await prisma.enterpriseInventoryReturnRecoveryAssessment.findFirstOrThrow({where:{organizationId,id:appraised.id}});
      expect((await prisma.enterpriseInventoryReturnCustody.findFirstOrThrow({where:{organizationId,id:recoverableCustody.id}})).status).toBe("RECOVERED");
      const move=await prisma.enterpriseStockMovement.findFirstOrThrow({where:{organizationId,id:completion.recoveryMovementId}});
      expect(move.movementType).toBe("CUSTODY_RECOVERY_IN");expect(move.quantity.equals(2)).toBe(true);expect(move.stockLotId).toBe(batches[0].lot.id);
      const layer=await prisma.enterpriseInventoryCostLayer.findFirstOrThrow({where:{organizationId,sourceMovementId:move.id}});
      expect(layer.unitCost.equals("5.5")).toBe(true);expect(layer.totalCost.equals(11)).toBe(true);
      const valuation=await prisma.enterpriseInventoryAccountingEvent.findFirstOrThrow({where:{organizationId,id:completion.recoveryAccountingEventId}});
      expect(valuation.status).toBe("POSTED");expect(valuation.totalCost.equals(11)).toBe(true);
      const journal=await prisma.enterpriseJournalEntry.findFirstOrThrow({where:{organizationId,id:completion.recoveryJournalEntryId},include:{lines:true}});
      const originalJournal=await prisma.enterpriseJournalEntry.findFirstOrThrow({where:{organizationId,id:completion.originalIssueJournalId},include:{lines:true}});
      expect(journal.postingEvent).toBe("INVENTORY_CUSTODY_RECOVERY_VALUED");
      expect(journal.totalDebit.equals(11)).toBe(true);expect(journal.totalCredit.equals(11)).toBe(true);
      expect(journal.lines.find(row=>row.debit.equals(11)).ledgerAccountId).toBe(originalJournal.lines.find(row=>row.credit.gt(0)).ledgerAccountId);
      expect(journal.lines.find(row=>row.credit.equals(11)).ledgerAccountId).toBe(originalJournal.lines.find(row=>row.debit.gt(0)).ledgerAccountId);
      const replay=await recoveryAction(context.owner,"execute-recovery-assessment",executeInput);
      expect(replay.status,JSON.stringify(replay.body)).toBe(200);expect(replay.body.idempotent).toBe(true);
      expect((await recoveryAction(context.owner,"withdraw-recovery-assessment",{custodyId:recoverableCustody.id,assessmentId:completion.id,revision:completion.revision,reason:"Cannot withdraw executed recovery",confirmedNotReleased:true})).status).toBe(409);
      expect(await prisma.enterpriseStockMovement.count({where:{organizationId,sourceEntityType:"EnterpriseInventoryReturnRecoveryAssessment",sourceEntityId:completion.id}})).toBe(1);
      expect(await prisma.enterpriseJournalEntry.count({where:{organizationId}})).toBe(beforeRecovery.journals+1);
      expect(await prisma.enterpriseSalesCreditNote.count({where:{organizationId,salesInvoiceId:bi}})).toBe(beforeRecovery.credits);
      expect(await prisma.enterprisePayment.count({where:{organizationId}})).toBe(beforeRecovery.payments);
      expect((await batchStock(0)).equals(2)).toBe(true);
    }

    const alerts=await context.owner.request.get(qualityPath+"?search="+encodeURIComponent(batchKey)+"&expiry=RECALLED&page=1&warehouseId="+encodeURIComponent(spareWarehouse.id));
    expect(alerts.status()).toBe(200);
    const alertBody=await alerts.json();
    expect(alertBody.metrics.recalled).toBe(1);
    expect(alertBody.items.some(row=>row.id===receivedLot.id)).toBe(true);
    expect(alertBody.items.find(row=>row.id===receivedLot.id).warehouse).toMatchObject({id:spareWarehouse.id,code:spareWarehouse.code,name:spareWarehouse.name});
    // Expiry is an inclusive civil date, composable with warehouse, search,
    // quality scope and pagination (the same contract used by exports).
    const recalledLotDate=alertBody.items.find(row=>row.id===receivedLot.id).expiryDate.slice(0,10);
    const dateScope=qualityPath+"?search="+encodeURIComponent(batchKey)+"&expiry=RECALLED&warehouseId="+encodeURIComponent(spareWarehouse.id);
    const exactExpiry=await context.owner.request.get(dateScope+"&expiryFrom="+recalledLotDate+"&expiryTo="+recalledLotDate);
    expect(exactExpiry.status(),await exactExpiry.text()).toBe(200);
    const exactExpiryBody=await exactExpiry.json();
    expect(exactExpiryBody.items.map(row=>row.id)).toEqual([receivedLot.id]);
    expect(exactExpiryBody.pagination.total).toBe(1);
    expect(exactExpiryBody.metrics.recalled).toBe(1);
    const dayBeforeExpiry=new Date(new Date(recalledLotDate+"T00:00:00.000Z").getTime()-86400000).toISOString().slice(0,10);
    const dayAfterExpiry=new Date(new Date(recalledLotDate+"T00:00:00.000Z").getTime()+86400000).toISOString().slice(0,10);
    const earlierExpiry=await context.owner.request.get(dateScope+"&expiryTo="+dayBeforeExpiry);
    expect(earlierExpiry.status()).toBe(200);
    expect((await earlierExpiry.json()).items).toEqual([]);
    const laterExpiry=await context.owner.request.get(dateScope+"&expiryFrom="+dayAfterExpiry);
    expect(laterExpiry.status()).toBe(200);
    expect((await laterExpiry.json()).metrics.recalled).toBe(0);
    for(const invalidDates of ["expiryFrom=2026-02-30","expiryTo=not-a-date","expiryFrom="+dayAfterExpiry+"&expiryTo="+recalledLotDate]){
      const rejectedDates=await context.owner.request.get(dateScope+"&"+invalidDates);
      expect(rejectedDates.status(),await rejectedDates.text()).toBe(400);
      expect((await rejectedDates.json()).error).toBe("INVENTORY_LOT_DATES_INVALID");
    }


    // Daily quality alerts: worker authentication, bounded claim and same-day
    // retries, restricted to authorized admins and neutral push contents.
    const worker="/api/internal/inventory-quality/process?batch=8";
    expect((await context.owner.request.get(worker)).status()).toBe(401);
    const workerHeaders={authorization:`Bearer ${process.env.E2E_CRON_SECRET}`};
    expect(process.env.E2E_CRON_SECRET).toBeTruthy();
    await prisma.enterpriseInventoryQualityScan.upsert({where:{organizationId},update:{nextScanAt:new Date("2000-01-01T00:00:00.000Z"),leaseToken:null,leaseUntil:null},create:{organizationId,nextScanAt:new Date("2000-01-01T00:00:00.000Z")}});
    const firstScan=await context.owner.request.get(worker,{headers:workerHeaders});
    expect(firstScan.status(),await firstScan.text()).toBe(200);
    const targetNotifications={organizationId,type:"ENTERPRISE_INVENTORY_ALERT",userId:fixture.owner.id};
    const notification=await prisma.notification.findFirstOrThrow({where:targetNotifications,orderBy:{createdAt:"desc"}});
    expect(notification.targetUrl).toBe("/enterprise-modules/INVENTORY_LOGISTICS");
    expect(notification.body).not.toContain(batchKey);
    expect(await prisma.notification.count({where:{organizationId,type:"ENTERPRISE_INVENTORY_ALERT",userId:fixture.cashier.id}})).toBe(0);
    const beforeRetry=await prisma.notification.count({where:targetNotifications});
    await prisma.enterpriseInventoryQualityScan.update({where:{organizationId},data:{nextScanAt:new Date("2000-01-01T00:00:00.000Z")}});
    const repeatScan=await context.owner.request.get(worker,{headers:workerHeaders});
    expect(repeatScan.status(),await repeatScan.text()).toBe(200);
    expect(await prisma.notification.count({where:targetNotifications})).toBe(beforeRetry);
    const nextScan=await prisma.enterpriseInventoryQualityScan.findUniqueOrThrow({where:{organizationId}});
    expect(nextScan.leaseToken).toBeNull();
    expect(nextScan.nextScanAt.getTime()).toBeGreaterThan(Date.now());

    // Independent purchases and real three-actor bank payments: race the
    // allocation of a confirmed supplier advance against physical dispatch.
    // No direct payable, payment, allocation, movement or journal fixture.
    for (const scenario of [57,56,64.96,67.2,0,-1,-2]) {
      const repeatedReturn=scenario===-2;
      const paymentAmount=repeatedReturn?48.72:scenario===-1?64.96:scenario;
      const multiTax=scenario===67.2, nonrecoverable=scenario<=0, freshAcquisition=scenario===-1||repeatedReturn;
      const taxed=paymentAmount===64.96||multiTax||nonrecoverable;
      const invoiceGross=multiTax?"84":taxed?"81.2":"70", invoiceVat=multiTax?"14":taxed?"11.2":"0", returnVat=multiTax?"2.8":taxed?"2.24":"0", creditGross=multiTax?"16.8":taxed?"16.24":"14", exactAllocation=repeatedReturn?"48.72":multiTax?"67.2":taxed?"64.96":"56";
      const suffix="PAYMENT-RACE-"+scenario;
      const stockReturnValue=freshAcquisition?"16.24":"14", reservedRecoverable=freshAcquisition?"0":returnVat;
      // The positive nonrecoverable case needs an entirely untouched pool.
      const raceProduct=freshAcquisition?await prisma.enterpriseCatalogItem.create({data:{organizationId,code:historyKey+"-ACQ-"+suffix,sku:historyKey+"-ACQ-"+suffix,name:"E2E isolated acquisition "+historyKey+" "+suffix,normalizedName:(historyKey+"-ACQ-"+suffix).toLowerCase(),itemType:"PRODUCT",unitOfMeasureId:fixture.product.unitOfMeasureId,indicativeSalePrice:20,indicativeCost:7,currency:fixture.currencyCode,taxable:false,trackInventory:true,createdByUserId:fixture.owner.id}}):historicalProduct;
      if(freshAcquisition)await prisma.enterpriseInventoryItem.create({data:{organizationId,catalogItemId:raceProduct.id,lotTracking:true,expiryTracking:true,createdByUserId:fixture.owner.id}});
      const racePurchase=await orderForPurchase(raceProduct,10,suffix,supplier.id);
      // Approved document fixture only: the real posting below generates the
      // ledger and historical INPUT tax line. The test rate is illustrative.
      const invoiceDay=new Date(returnBusinessContext.businessDate+"T00:00:00.000Z");
      let taxCode;const vatSnapshots=[];
      if(taxed){
        taxCode=await prisma.enterpriseTaxCode.create({data:{organizationId,code:historyKey+"-RTV-VAT-"+suffix,nameFr:"TVA recette retour",nameEn:"Return test VAT",category:"VAT",jurisdiction:"CD",taxTreatment:"STANDARD",autoApply:false}});
        vatSnapshots.push({taxCodeId:taxCode.id,rate:"0.16000000",base:"70.000000",amount:"11.200000",jurisdiction:"CD",treatment:"STANDARD",templateVersion:null,evidenceReference:"E2E-RTV-VAT",basisMode:"NET",applicationOrder:0,effectiveAt:invoiceDay.toISOString()});
        if(multiTax){
          const code2=await prisma.enterpriseTaxCode.create({data:{organizationId,code:historyKey+"-RTV-VAT2",nameFr:"Deuxième TVA recette",nameEn:"Second test VAT",category:"VAT",jurisdiction:"CD",taxTreatment:"STANDARD",autoApply:false}});
          vatSnapshots.push({...vatSnapshots[0],taxCodeId:code2.id,rate:"0.04000000",amount:"2.800000",applicationOrder:1});
        }
        await prisma.enterprisePurchaseItem.update({where:{id:racePurchase.items[0].id},data:{taxAmount:invoiceVat,taxRate:multiTax?"20":"16",lineTotal:invoiceGross}});
        await prisma.enterprisePurchase.update({where:{id:racePurchase.id},data:{taxAmount:invoiceVat,totalAmount:invoiceGross}});
      }
      const raceReceipt=await post(context.owner,base+"/purchases/"+racePurchase.id+"/receive",{
        revision:racePurchase.revision,receivedAt:new Date().toISOString(),warehouseId:fixture.warehouse.id,
        items:[{purchaseItemId:racePurchase.items[0].id,quantityReceived:10}],
        lotAllocations:[{purchaseItemId:racePurchase.items[0].id,batches:[{lotNumber:suffix,productionDate:null,expiryDate:allocationPayload.allocations[0].expiryDate,quantity:10}]}],
      });
      expect(raceReceipt.status,JSON.stringify(raceReceipt.body)).toBe(201);
      const raceSource=await prisma.enterpriseStockMovement.findFirstOrThrow({where:{organizationId,sourceEntityType:"EnterprisePurchaseReceipt",sourceEntityId:raceReceipt.body.receipt.id,movementType:"PURCHASE_RECEIPT"},include:{stockLot:true}});
      const valuedRace=await post(context.owner,base+"/stock-movements/"+raceSource.id+"/value-receipt",{unitCost:"7",currencyCode:fixture.currencyCode});
      expect(valuedRace.status,JSON.stringify(valuedRace.body)).toBe(200);
      expect(valuedRace.body.event.status).toBe("POSTED");
      const isolatedRace=await patchLot(context.owner,{id:raceSource.stockLotId,revision:raceSource.stockLot.revision,status:"QUARANTINED",qualityReason:"Independent payment dispatch competition"});
      expect(isolatedRace.status,JSON.stringify(isolatedRace.body)).toBe(200);
      // Posting uses the genuine Finance service; only approved invoice and
      // matching purchase inputs are seeded, as for the earlier fixture.
      const raceInvoice=await prisma.enterpriseSupplierInvoice.create({data:{
        organizationId,number:historyKey+"-"+suffix,supplierId:supplier.id,businessPartyId:supplierParty.id,
        purchaseId:racePurchase.id,purchaseReceiptId:raceReceipt.body.receipt.id,status:"APPROVED",
        invoiceDate:invoiceDay,currencyCode:fixture.currencyCode,subtotal:"70",taxTotal:invoiceVat,grandTotal:invoiceGross,outstandingAmount:invoiceGross,
        approvedAt:new Date(),approvedByUserId:fixture.settler.id,createdByUserId:fixture.owner.id,
        ...(taxed&&!nonrecoverable?{taxRecoveryVerifiedAt:new Date(),taxRecoveryVerifiedByUserId:fixture.settler.id,reviewedByUserId:fixture.settler.id}:{}),
        items:{create:{catalogItemId:raceProduct.id,description:raceProduct.name,quantity:"10",unitPrice:"7",netAmount:"70",taxAmount:invoiceVat,totalAmount:invoiceGross,...(taxed?{taxCodeId:taxCode.id,taxRateApplied:"0.16",taxJurisdiction:"CD",taxEvidenceReference:"E2E-RTV-VAT",taxRecoveryRequested:!nonrecoverable,taxCalculationMode:"NET",taxBreakdownJson:vatSnapshots}:{})}},
        threeWayMatch:{create:{purchaseId:racePurchase.id,purchaseReceiptId:raceReceipt.body.receipt.id,quantityVariance:0,priceVariance:0,taxVariance:0,currencyMatches:true,supplierMatches:true,withinTolerance:true,status:"MATCHED",checkedAt:new Date()}},
      }});
      await ensureStepUp(context.owner,ownerPassword);
      const raceInvoicePosted=await post(context.owner,base+"/supplier-invoices/"+raceInvoice.id+"/transition",{action:"POST",revision:raceInvoice.revision});
      if(nonrecoverable&&!freshAcquisition){
        expect(raceInvoicePosted.status,JSON.stringify(raceInvoicePosted.body)).toBe(409);
        expect(raceInvoicePosted.body.error).toBe("SUPPLIER_RETURN_NONRECOVERABLE_COST_RECONCILIATION_REQUIRED");
        const rejectedSource=await prisma.enterpriseSupplierInvoiceItem.findFirstOrThrow({where:{organizationId,supplierInvoiceId:raceInvoice.id}});
        expect(await prisma.enterpriseJournalEntry.count({where:{organizationId,sourceEntityType:"EnterpriseSupplierInvoice",sourceEntityId:raceInvoice.id}})).toBe(0);
        expect(await prisma.enterpriseTaxLine.count({where:{organizationId,sourceEntityType:"EnterpriseSupplierInvoiceItem",sourceEntityId:rejectedSource.id}})).toBe(0);
        expect(await prisma.enterpriseInventoryAcquisitionCostSupplement.count({where:{organizationId,supplierInvoiceItemId:rejectedSource.id}})).toBe(0);
        expect(await prisma.enterprisePayable.count({where:{organizationId,supplierInvoiceId:raceInvoice.id}})).toBe(0);
        expect((await prisma.enterpriseSupplierInvoice.findUniqueOrThrow({where:{id:raceInvoice.id}})).status).toBe("APPROVED");
        const originalLayer=await prisma.enterpriseInventoryCostLayer.findFirstOrThrow({where:{organizationId,sourceMovementId:raceSource.id}});
        expect(originalLayer.unitCost.equals(7)&&originalLayer.totalCost.equals(70)&&originalLayer.remainingQuantity.equals(10)).toBe(true);
        continue;
      }
      expect(raceInvoicePosted.status,JSON.stringify(raceInvoicePosted.body)).toBe(200);
      const racePayable=await prisma.enterprisePayable.findUniqueOrThrow({where:{supplierInvoiceId:raceInvoice.id}});
      expect(racePayable.outstandingAmount.equals(invoiceGross)).toBe(true);
      const racePurchasePath=base+"/purchases/"+racePurchase.id;
      if(taxed){
        const sourceItem=await prisma.enterpriseSupplierInvoiceItem.findFirstOrThrow({where:{organizationId,supplierInvoiceId:raceInvoice.id}});
        const inputTaxes=await prisma.enterpriseTaxLine.findMany({where:{organizationId,sourceEntityType:"EnterpriseSupplierInvoiceItem",sourceEntityId:sourceItem.id,direction:nonrecoverable?"INPUT_NONRECOVERABLE":"INPUT"},orderBy:{applicationOrder:"asc"}});
        expect(inputTaxes).toHaveLength(vatSnapshots.length);
        expect(inputTaxes.reduce((sum,row)=>sum.plus(row.taxAmount),new Prisma.Decimal(0)).equals(invoiceVat)).toBe(true);
        const vatPreview=await context.owner.request.get(racePurchasePath+"?view=supplier-return-preflight&movementId="+encodeURIComponent(raceSource.id)+"&quantity=2");
        if(nonrecoverable){
          const beforeLayer=await prisma.enterpriseInventoryCostLayer.findFirstOrThrow({where:{organizationId,sourceMovementId:raceSource.id}});
          expect(beforeLayer.quantity.equals(10)&&beforeLayer.remainingQuantity.equals(10)&&beforeLayer.unitCost.equals("8.12")&&beforeLayer.totalCost.equals("81.2")).toBe(true);
          const proof=await prisma.enterpriseInventoryAcquisitionCostSupplement.findFirstOrThrow({where:{organizationId,supplierInvoiceItemId:sourceItem.id}});
          expect(proof.costLayerId).toBe(beforeLayer.id);
          expect(proof.taxLineId).toBe(inputTaxes[0].id);
          expect(proof.originalUnitCost.equals(7)&&proof.originalTotalCost.equals(70)&&proof.capitalizedTaxAmount.equals("11.2")&&proof.totalCost.equals("81.2")).toBe(true);
          const originalEvent=await prisma.enterpriseInventoryAccountingEvent.findUniqueOrThrow({where:{id:proof.receiptAccountingEventId}});
          expect(originalEvent.unitCost.equals(7)&&originalEvent.totalCost.equals(70)&&originalEvent.quantity.equals(10)).toBe(true);
          const newInvoiceJournal=await prisma.enterpriseJournalEntry.findUniqueOrThrow({where:{id:proof.invoiceJournalEntryId},include:{lines:true}});
          expect(newInvoiceJournal.totalDebit.equals("81.2")&&newInvoiceJournal.totalCredit.equals("81.2")).toBe(true);
          expect(newInvoiceJournal.lines).toHaveLength(3);
          const replayAcquisition=await post(context.owner,base+"/supplier-invoices/"+raceInvoice.id+"/transition",{action:"POST",revision:raceInvoice.revision});
          expect(replayAcquisition.status,JSON.stringify(replayAcquisition.body)).toBe(200);
          expect(await prisma.enterpriseInventoryAcquisitionCostSupplement.count({where:{organizationId,supplierInvoiceItemId:sourceItem.id}})).toBe(1);
          expect(await prisma.enterpriseJournalEntry.count({where:{organizationId,sourceEntityType:"EnterpriseSupplierInvoice",sourceEntityId:raceInvoice.id}})).toBe(1);
          expect(await prisma.enterpriseTaxLine.count({where:{organizationId,sourceEntityType:"EnterpriseSupplierInvoiceItem",sourceEntityId:sourceItem.id}})).toBe(1);
          const genericCredit=await post(context.owner,base+"/supplier-credit-notes",{invoiceId:raceInvoice.id,creditDate:returnBusinessContext.businessDate,reason:"Attempt unsupported independent acquisition correction",items:[{sourceInvoiceItemId:sourceItem.id,description:raceProduct.name,quantity:"2",unitPrice:"7"}]});
          expect(genericCredit.status,JSON.stringify(genericCredit.body)).toBe(409);
          expect(genericCredit.body.error).toBe("INVENTORY_ACQUISITION_COST_DOMAIN_CORRECTION_REQUIRED");
          for(const journalId of [newInvoiceJournal.id,originalEvent.journalEntryId]){
            const reverseAcquisition=await post(context.owner,base+"/journal-entries/"+journalId+"/reverse",{reason:"Attempt unsupported independent acquisition reversal",accountingDate:returnBusinessContext.businessDate});
            expect(reverseAcquisition.status,JSON.stringify(reverseAcquisition.body)).toBe(409);
            expect(reverseAcquisition.body.error).toBe("INVENTORY_ACQUISITION_COST_DOMAIN_CORRECTION_REQUIRED");
            expect((await prisma.enterpriseJournalEntry.findUniqueOrThrow({where:{id:journalId}})).status).toBe("POSTED");
            expect(await prisma.enterpriseJournalReversal.count({where:{organizationId,originalEntryId:journalId}})).toBe(0);
          }
          expect(await prisma.enterpriseSupplierCreditNote.count({where:{organizationId,supplierInvoiceId:raceInvoice.id}})).toBe(0);
        }
        expect(vatPreview.status(),await vatPreview.text()).toBe(200);
        expect(await vatPreview.json()).toMatchObject({totalCost:stockReturnValue,recoverableTaxAmount:reservedRecoverable,creditTotal:creditGross,...(freshAcquisition?{unitCost:"8.12",creditUnitPrice:"7",nonrecoverableTaxAmount:"2.24"}:{})});
      }
      let firstReturn=null, firstCreditInput=null, firstCreditId=null, firstDispatchCutoff=null;
      if(repeatedReturn){
        const firstSubmitted=await post(context.owner,racePurchasePath+"?action=submit-supplier-return",{movementId:raceSource.id,quantity:"2",reason:"First separately approved supplier return",approverUserId:fixture.settler.id,idempotencyKey:historyKey+"-"+suffix+"-first"});
        expect(firstSubmitted.status,JSON.stringify(firstSubmitted.body)).toBe(201);
        const firstId=firstSubmitted.body.request.id, firstApprovalId=firstSubmitted.body.approvalId;
        const review=await context.settler.request.get(base+"/approvals/"+firstApprovalId+"/coordination");
        expect(review.status()).toBe(200);
        const reviewBody=await review.json();
        const firstApproved=await post(context.settler,base+"/approvals/"+firstApprovalId+"/actions",{action:"APPROVE",revision:reviewBody.approval.revision,reviewedVersionId:reviewBody.versions[0].id});
        expect(firstApproved.status,JSON.stringify(firstApproved.body)).toBe(200);
        const beforeFirst=await prisma.enterpriseSupplierReturnRequest.findUniqueOrThrow({where:{id:firstId}});
        const firstShip=await post(context.owner,racePurchasePath+"?action=dispatch-supplier-return",{requestId:firstId,revision:beforeFirst.revision,dispatchReference:historyKey+"-"+suffix+"-FIRST-SHIP"});
        expect(firstShip.status,JSON.stringify(firstShip.body)).toBe(200);
        const dispatchedFirst=await prisma.enterpriseSupplierReturnRequest.findUniqueOrThrow({where:{id:firstId}});
        const firstTrace=await context.owner.request.get(racePurchasePath+"?view=receipt-lots&movementId="+encodeURIComponent(raceSource.id));
        expect(firstTrace.status()).toBe(200);
        const firstCreditDay=(await firstTrace.json()).items[0].supplierReturnRequest.dispatchBusinessDate;
        firstCreditInput={invoiceId:raceInvoice.id,supplierReturnId:firstId,supplierCreditReference:historyKey+"-"+suffix+"-FIRST-CREDIT",creditDate:firstCreditDay,reason:"First supplier credit of separately returned units",items:[{sourceInvoiceItemId:beforeFirst.supplierInvoiceItemId,description:raceProduct.name,quantity:"2",unitPrice:"7"}]};
        const note=await post(context.owner,base+"/supplier-credit-notes",firstCreditInput);
        expect(note.status,JSON.stringify(note.body)).toBe(201);
        expect(note.body.creditNote).toMatchObject({subtotal:"14",taxTotal:"2.24",grandTotal:"16.24"});
        firstCreditId=note.body.creditNote.id;
        const notePath=base+"/supplier-credit-notes/"+firstCreditId;
        const noteSubmitted=await post(context.owner,notePath+"/transition",{action:"SUBMIT",revision:note.body.creditNote.revision,approverUserId:fixture.settler.id});
        expect(noteSubmitted.status,JSON.stringify(noteSubmitted.body)).toBe(200);
        const noteApproved=await post(context.settler,notePath+"/transition",{action:"APPROVE",revision:noteSubmitted.body.creditNote.revision});
        expect(noteApproved.status,JSON.stringify(noteApproved.body)).toBe(200);
        const notePosted=await post(context.owner,notePath+"/post",{revision:noteApproved.body.creditNote.revision});
        expect(notePosted.status,JSON.stringify(notePosted.body)).toBe(200);
        firstReturn=await prisma.enterpriseSupplierReturnRequest.findUniqueOrThrow({where:{id:firstId}});
        expect(firstReturn.status).toBe("RECONCILED");
        expect((await prisma.enterprisePayable.findUniqueOrThrow({where:{id:racePayable.id}})).outstandingAmount.equals("64.96")).toBe(true);
        const firstMovement=await prisma.enterpriseStockMovement.findUniqueOrThrow({where:{id:dispatchedFirst.dispatchMovementId}});
        const firstEvent=await prisma.enterpriseInventoryAccountingEvent.findUniqueOrThrow({where:{id:dispatchedFirst.dispatchAccountingEventId}});
        const firstJournal=await prisma.enterpriseJournalEntry.findUniqueOrThrow({where:{id:firstEvent.journalEntryId}});
        firstDispatchCutoff=new Date(Math.max(...[dispatchedFirst.dispatchedAt,firstMovement.occurredAt,firstMovement.createdAt,firstEvent.createdAt,firstJournal.accountingDate,firstJournal.postedAt].map(d=>d.getTime())));
        const nextPreview=await context.owner.request.get(racePurchasePath+"?view=supplier-return-preflight&movementId="+encodeURIComponent(raceSource.id)+"&quantity=2");
        expect(nextPreview.status(),await nextPreview.text()).toBe(200);
        expect(await nextPreview.json()).toMatchObject({remaining:"8",totalCost:"16.24",creditTotal:"16.24"});
        const tooMuch=await context.owner.request.get(racePurchasePath+"?view=supplier-return-preflight&movementId="+encodeURIComponent(raceSource.id)+"&quantity=9");
        expect(tooMuch.status()).toBe(409);
      }
      const submittedRace=await post(context.owner,racePurchasePath+"?action=submit-supplier-return",{movementId:raceSource.id,quantity:"2",reason:"Physical supplier return competing with payable allocation",approverUserId:fixture.settler.id,idempotencyKey:historyKey+"-"+suffix});
      expect(submittedRace.status,JSON.stringify(submittedRace.body)).toBe(201);
      const raceId=submittedRace.body.request.id;
      if(repeatedReturn){
        const active=await context.owner.request.get(racePurchasePath+"?view=receipt-lots&movementId="+encodeURIComponent(raceSource.id));
        expect(active.status()).toBe(200);
        const trace=(await active.json()).items[0];
        expect(trace.supplierReturnRequest.id).toBe(raceId);
        expect(trace.supplierReturnHistory.map(r=>r.id)).toEqual([firstReturn.id]);
        const replayOld=await post(context.owner,base+"/supplier-credit-notes",firstCreditInput);
        expect(replayOld.status,JSON.stringify(replayOld.body)).toBe(201);
        expect(replayOld.body.creditNote.id).toBe(firstCreditId);
        const simultaneous=await post(context.owner,racePurchasePath+"?action=submit-supplier-return",{movementId:raceSource.id,quantity:"1",reason:"Third return while second request is active",approverUserId:fixture.settler.id,idempotencyKey:historyKey+"-"+suffix+"-third"});
        expect(simultaneous.status).toBe(409);
      }
      const raceApprovalId=submittedRace.body.approvalId;
      const raceCoordination=await context.settler.request.get(base+"/approvals/"+raceApprovalId+"/coordination");
      expect(raceCoordination.status()).toBe(200);
      const raceReview=await raceCoordination.json();
      const raceApproval=await post(context.settler,base+"/approvals/"+raceApprovalId+"/actions",{action:"APPROVE",revision:raceReview.approval.revision,reviewedVersionId:raceReview.versions[0].id});
      expect(raceApproval.status,JSON.stringify(raceApproval.body)).toBe(200);
      const approvedRace=await prisma.enterpriseSupplierReturnRequest.findFirstOrThrow({where:{organizationId,id:raceId}});
      expect(approvedRace.status).toBe("APPROVED");
      expect(approvedRace.totalCost.equals(stockReturnValue)).toBe(true);
      expect(approvedRace.recoverableTaxAmount.equals(reservedRecoverable)).toBe(true);
      expect(raceReview.versions[0].snapshotJson).toMatchObject({stockValue:stockReturnValue,recoverableTaxAmount:reservedRecoverable,totalAmount:creditGross});

      const racePayment=await post(context.owner,base+"/payments",{direction:"OUTBOUND",paymentType:"SUPPLIER_PAYMENT",methodType:"BANK_TRANSFER",financialAccountId:fixture.bank.id,businessPartyId:supplierParty.id,currencyCode:fixture.currencyCode,amount:String(paymentAmount),paymentDate:returnBusinessContext.businessDate,reference:historyKey+"-"+suffix,idempotencyKey:historyKey+"-"+suffix+"-payment"});
      expect(racePayment.status,JSON.stringify(racePayment.body)).toBe(201);
      const racePaymentId=racePayment.body.payment.id;
      const racePaymentPath=base+"/payments/"+racePaymentId;
      const paymentSubmittedRace=await post(context.owner,racePaymentPath+"/transition",{action:"SUBMIT",revision:racePayment.body.payment.revision,approverUserId:fixture.settler.id});
      expect(paymentSubmittedRace.status,JSON.stringify(paymentSubmittedRace.body)).toBe(200);
      const paymentApprovedRace=await post(context.settler,racePaymentPath+"/transition",{action:"APPROVE",revision:paymentSubmittedRace.body.payment.revision});
      expect(paymentApprovedRace.status,JSON.stringify(paymentApprovedRace.body)).toBe(200);
      await ensureStepUp(context.preparer,cashierPassword);
      const paymentConfirmedRace=await post(context.preparer,racePaymentPath+"/transition",{action:"CONFIRM",revision:paymentApprovedRace.body.payment.revision});
      expect(paymentConfirmedRace.status,JSON.stringify(paymentConfirmedRace.body)).toBe(200);
      expect(paymentConfirmedRace.body.payment.status).toBe("CONFIRMED");
      expect(await prisma.enterpriseTreasuryTransaction.count({where:{organizationId,paymentId:racePaymentId,status:"CONFIRMED"}})).toBe(1);
      const paymentJournalRace=await prisma.enterpriseJournalEntry.findFirstOrThrow({where:{organizationId,sourceEntityType:"EnterprisePayment",sourceEntityId:racePaymentId,postingEvent:"SUPPLIER_PAYMENT_CONFIRMED",status:"POSTED"}});
      expect(paymentJournalRace.totalDebit.equals(paymentAmount)&&paymentJournalRace.totalCredit.equals(paymentAmount)).toBe(true);

      const shipPath=racePurchasePath+"?action=dispatch-supplier-return";
      const shipInput={requestId:raceId,revision:approvedRace.revision,dispatchReference:historyKey+"-"+suffix+"-SHIP"};
      const allocatePath=racePaymentPath+"/allocations";
      const allocateInput={payableId:racePayable.id,amount:String(paymentAmount)};
      const allocOk=result=>[200,201].includes(result.status);
      if(paymentAmount===57){
        await prisma.enterpriseFiscalPeriod.update({where:{id:returnPeriod.id},data:{status:"CLOSED"}});
        try{
          const blockedAllocation=await post(context.owner,allocatePath,allocateInput);
          expect(blockedAllocation.status,JSON.stringify(blockedAllocation.body)).toBe(409);
          expect(await prisma.enterprisePaymentAllocation.count({where:{organizationId,paymentId:racePaymentId}})).toBe(0);
          expect(await prisma.enterprisePayableAllocation.count({where:{organizationId,payableId:racePayable.id}})).toBe(0);
          expect((await prisma.enterprisePayment.findUniqueOrThrow({where:{id:racePaymentId}})).unallocatedAmount.equals(paymentAmount)).toBe(true);
          expect((await prisma.enterprisePayable.findUniqueOrThrow({where:{id:racePayable.id}})).outstandingAmount.equals(70)).toBe(true);
        }finally{
          await prisma.enterpriseFiscalPeriod.update({where:{id:returnPeriod.id},data:{status:returnPeriod.status}});
        }
      }
      let [ship,allocated]=await Promise.all([post(context.owner,shipPath,shipInput),post(context.owner,allocatePath,allocateInput)]);
      expect([200,409]).toContain(ship.status);
      expect([200,201,409]).toContain(allocated.status);
      expect(ship.status===200||allocOk(allocated),JSON.stringify({ship,allocated})).toBe(true);
      if(paymentAmount===57) {
        expect(Number(ship.status===200)+Number(allocOk(allocated)),JSON.stringify({ship,allocated})).toBe(1);
        if(ship.status!==200){
          const retryShip=await post(context.owner,shipPath,shipInput);
          expect(retryShip.status).toBe(409);
          expect(retryShip.body.error).toBe("SUPPLIER_RETURN_PAYABLE_INSUFFICIENT");
          const unchanged=await prisma.enterpriseSupplierReturnRequest.findFirstOrThrow({where:{organizationId,id:raceId}});
          expect(unchanged.status).toBe("APPROVED");expect(unchanged.dispatchMovementId).toBeNull();expect(unchanged.dispatchAccountingEventId).toBeNull();
          expect(await prisma.enterpriseStockMovement.count({where:{organizationId,sourceEntityType:"EnterpriseSupplierReturnRequest",sourceEntityId:raceId}})).toBe(0);
          expect((await prisma.enterpriseInventoryBalance.findFirstOrThrow({where:{organizationId,stockLotId:raceSource.stockLotId}})).quantityOnHand.equals(10)).toBe(true);
          expect((await prisma.enterprisePayable.findUniqueOrThrow({where:{id:racePayable.id}})).outstandingAmount.equals(13)).toBe(true);
          const paidAllocation=await prisma.enterprisePaymentAllocation.findFirstOrThrow({where:{organizationId,paymentId:racePaymentId,payableId:racePayable.id}});
          expect(paidAllocation.amount.equals(57)).toBe(true);
          expect(await prisma.enterprisePaymentAllocation.count({where:{organizationId,paymentId:racePaymentId}})).toBe(1);
          const paidJournal=await prisma.enterpriseJournalEntry.findFirstOrThrow({where:{organizationId,sourceEntityType:"EnterprisePaymentAllocation",sourceEntityId:paidAllocation.id,postingEvent:"PAYMENT_ALLOCATION_CONFIRMED",status:"POSTED"}});
          expect(paidJournal.totalDebit.equals(57)&&paidJournal.totalCredit.equals(57)).toBe(true);
          expect((await prisma.enterprisePayment.findUniqueOrThrow({where:{id:racePaymentId}})).unallocatedAmount.isZero()).toBe(true);
          continue;
        }
        expect((await prisma.enterprisePayable.findUniqueOrThrow({where:{id:racePayable.id}})).outstandingAmount.equals(70)).toBe(true);
        expect(await prisma.enterprisePaymentAllocation.count({where:{organizationId,paymentId:racePaymentId}})).toBe(0);
        const retryAllocation=await post(context.owner,allocatePath,allocateInput);
        expect(retryAllocation.status).toBe(409);expect(retryAllocation.body.error).toBe("SUPPLIER_RETURN_PAYABLE_RESERVED");
        // Apply only the compatible part of the real advance; 1 stays free.
        allocated=await post(context.owner,allocatePath,{...allocateInput,amount:"56"});
      } else {
        if(ship.status===409) ship=await post(context.owner,shipPath,shipInput);
        if(!allocOk(allocated)) allocated=await post(context.owner,allocatePath,allocateInput);
      }
      expect(ship.status,JSON.stringify(ship.body)).toBe(200);
      expect(allocOk(allocated),JSON.stringify(allocated.body)).toBe(true);
      const shipped=await prisma.enterpriseSupplierReturnRequest.findFirstOrThrow({where:{organizationId,id:raceId}});
      expect(shipped.status).toBe("DISPATCHED");
      expect(await prisma.enterpriseStockMovement.count({where:{organizationId,sourceEntityType:"EnterpriseSupplierReturnRequest",sourceEntityId:raceId}})).toBe(1);
      const shippedValue=await prisma.enterpriseInventoryAccountingEvent.findFirstOrThrow({where:{organizationId,id:shipped.dispatchAccountingEventId,stockMovementId:shipped.dispatchMovementId}});
      expect(shippedValue.totalCost.equals(stockReturnValue)&&shippedValue.status==="POSTED").toBe(true);
      if(freshAcquisition){
        const remainingAcq=await prisma.enterpriseInventoryCostLayer.findFirstOrThrow({where:{organizationId,sourceMovementId:raceSource.id}});
        expect(remainingAcq.remainingQuantity.equals(repeatedReturn?6:8)&&remainingAcq.remainingQuantity.times(remainingAcq.unitCost).equals(repeatedReturn?"48.72":"64.96")).toBe(true);
      }
      const shippedJournal=await prisma.enterpriseJournalEntry.findFirstOrThrow({where:{organizationId,id:shippedValue.journalEntryId},include:{lines:true}});
      expect(shippedJournal.totalDebit.equals(stockReturnValue)&&shippedJournal.totalCredit.equals(stockReturnValue)).toBe(true);
      expect((await prisma.enterpriseInventoryBalance.findFirstOrThrow({where:{organizationId,stockLotId:raceSource.stockLotId}})).quantityOnHand.equals(repeatedReturn?6:8)).toBe(true);
      expect((await prisma.enterprisePayment.findUniqueOrThrow({where:{id:racePaymentId}})).unallocatedAmount.equals(new Prisma.Decimal(String(paymentAmount)).minus(exactAllocation))).toBe(true);
      expect(await prisma.enterprisePaymentAllocation.count({where:{organizationId,paymentId:racePaymentId}})).toBe(1);
      const allocationRace=await prisma.enterprisePaymentAllocation.findFirstOrThrow({where:{organizationId,paymentId:racePaymentId,payableId:racePayable.id}});
      expect(allocationRace.amount.equals(exactAllocation)).toBe(true);
      const allocationJournalRace=await prisma.enterpriseJournalEntry.findFirstOrThrow({where:{organizationId,sourceEntityType:"EnterprisePaymentAllocation",sourceEntityId:allocationRace.id,postingEvent:"PAYMENT_ALLOCATION_CONFIRMED",status:"POSTED"}});
      expect(allocationJournalRace.totalDebit.equals(exactAllocation)&&allocationJournalRace.totalCredit.equals(exactAllocation)).toBe(true);
      const racePayableView=await context.owner.request.get(base+"/payables?recordId="+encodeURIComponent(racePayable.id));
      expect(racePayableView.status()).toBe(200);
      expect((await racePayableView.json()).items[0]).toMatchObject({outstandingAmount:creditGross,supplierReturnReservedAmount:creditGross,supplierReturnAllocatableAmount:"0"});
      const raceTrace=await context.owner.request.get(racePurchasePath+"?view=receipt-lots&movementId="+encodeURIComponent(raceSource.id));
      expect(raceTrace.status()).toBe(200);
      const raceCreditDay=(await raceTrace.json()).items[0].supplierReturnRequest.dispatchBusinessDate;
      const raceCredit=await post(context.owner,base+"/supplier-credit-notes",{invoiceId:raceInvoice.id,supplierReturnId:raceId,supplierCreditReference:historyKey+"-"+suffix+"-CREDIT",creditDate:raceCreditDay,reason:"Confirmed returned goods credit after payment allocation",items:[{sourceInvoiceItemId:approvedRace.supplierInvoiceItemId,description:raceProduct.name,quantity:"2",unitPrice:"7"}]});
      expect(raceCredit.status,JSON.stringify(raceCredit.body)).toBe(201);
      expect(raceCredit.body.creditNote).toMatchObject({subtotal:"14",taxTotal:returnVat,grandTotal:creditGross});
      const raceCreditPath=base+"/supplier-credit-notes/"+raceCredit.body.creditNote.id;
      const submittedRaceCredit=await post(context.owner,raceCreditPath+"/transition",{action:"SUBMIT",revision:raceCredit.body.creditNote.revision,approverUserId:fixture.settler.id});
      expect(submittedRaceCredit.status,JSON.stringify(submittedRaceCredit.body)).toBe(200);
      const approvedRaceCredit=await post(context.settler,raceCreditPath+"/transition",{action:"APPROVE",revision:submittedRaceCredit.body.creditNote.revision});
      expect(approvedRaceCredit.status,JSON.stringify(approvedRaceCredit.body)).toBe(200);
      const postedRaceCredit=await post(context.owner,raceCreditPath+"/post",{revision:approvedRaceCredit.body.creditNote.revision});
      expect(postedRaceCredit.status,JSON.stringify(postedRaceCredit.body)).toBe(200);
      const closedRacePayable=await prisma.enterprisePayable.findUniqueOrThrow({where:{id:racePayable.id}});
      expect(closedRacePayable.status).toBe("CLOSED");expect(closedRacePayable.outstandingAmount.isZero()).toBe(true);
      expect(closedRacePayable.allocatedAmount.equals(exactAllocation)&&closedRacePayable.creditedAmount.equals(repeatedReturn?"32.48":creditGross)).toBe(true);
      const closedRace=await prisma.enterpriseSupplierReturnRequest.findFirstOrThrow({where:{organizationId,id:raceId}});
      expect(closedRace.status).toBe("RECONCILED");
      if(repeatedReturn){
        expect(await prisma.enterpriseSupplierReturnRequest.count({where:{organizationId,supplierInvoiceId:raceInvoice.id,status:"RECONCILED"}})).toBe(2);
        expect(await prisma.enterpriseSupplierReturnRequest.findUniqueOrThrow({where:{id:firstReturn.id}})).toEqual(firstReturn);
        const historyResponse=await context.owner.request.get(racePurchasePath+"?view=receipt-lots&movementId="+encodeURIComponent(raceSource.id));
        expect(historyResponse.status()).toBe(200);
        expect((await historyResponse.json()).items[0].supplierReturnHistory.map(r=>r.id)).toEqual([raceId,firstReturn.id]);
      }
      if(taxed){
        const vatCreditItem=await prisma.enterpriseSupplierCreditNoteItem.findFirstOrThrow({where:{organizationId,supplierCreditNoteId:raceCredit.body.creditNote.id}});
        const reversals=await prisma.enterpriseTaxLine.findMany({where:{organizationId,sourceEntityType:"EnterpriseSupplierCreditNoteItem",sourceEntityId:vatCreditItem.id,direction:freshAcquisition?"INPUT_NONRECOVERABLE_REVERSAL":"INPUT_REVERSAL"},orderBy:{applicationOrder:"asc"}});
        expect(reversals).toHaveLength(vatSnapshots.length);
        for(const [index,reversal] of reversals.entries()){
          expect(reversal.taxCodeId).toBe(vatSnapshots[index].taxCodeId);
          expect(reversal.taxRate.equals(vatSnapshots[index].rate)).toBe(true);
          expect(reversal.taxAmount.equals(new Prisma.Decimal(vatSnapshots[index].amount).div(5))).toBe(true);
          expect(reversal.taxableAmount.equals(14)).toBe(true);
        }
        expect(reversals.reduce((sum,row)=>sum.plus(row.taxAmount),new Prisma.Decimal(0)).equals(returnVat)).toBe(true);
        const vatJournal=await prisma.enterpriseJournalEntry.findFirstOrThrow({where:{organizationId,id:closedRace.creditJournalEntryId},include:{lines:true}});
        const originalJournal=await prisma.enterpriseJournalEntry.findFirstOrThrow({where:{organizationId,sourceEntityType:"EnterpriseSupplierInvoice",sourceEntityId:raceInvoice.id,postingEvent:"SUPPLIER_INVOICE_POSTED"},include:{lines:true}});
        const originalTaxLine=originalJournal.lines.find(line=>line.debit.equals(invoiceVat));
        expect(originalTaxLine).toBeTruthy();
        expect(vatJournal.totalDebit.equals(creditGross)&&vatJournal.totalCredit.equals(creditGross)).toBe(true);
        expect(vatJournal.lines).toHaveLength(freshAcquisition?2:3);
        expect(vatJournal.lines.some(line=>line.ledgerAccountId===originalTaxLine.ledgerAccountId&&line.credit.equals(returnVat)&&line.debit.isZero())).toBe(!freshAcquisition);
        expect(vatJournal.lines.some(line=>line.ledgerAccountId===shippedJournal.lines?.find(l=>l.debit.equals(stockReturnValue))?.ledgerAccountId&&line.credit.equals(stockReturnValue))).toBe(true);
        if(freshAcquisition)expect(vatJournal.lines.some(line=>line.ledgerAccountId===originalTaxLine.ledgerAccountId)).toBe(false);
      }
      expect(await prisma.enterprisePayableAllocation.count({where:{organizationId,payableId:racePayable.id,sourceType:"SUPPLIER_CREDIT_NOTE",sourceId:raceCredit.body.creditNote.id}})).toBe(1);
      if(freshAcquisition){
        // Rebuild all three historical states AFTER dispatch and credit posting.
        // Use actual recognition timestamps from committed evidence, not guessed
        // wall-clock dates or the currently depleted cost layer.
        const layer=await prisma.enterpriseInventoryCostLayer.findFirstOrThrow({where:{organizationId,sourceMovementId:raceSource.id}});
        const proof=await prisma.enterpriseInventoryAcquisitionCostSupplement.findFirstOrThrow({where:{organizationId,costLayerId:layer.id}});
        const [receiptEvent,invoiceJournal,dispatchMovement]=await Promise.all([
          prisma.enterpriseInventoryAccountingEvent.findUniqueOrThrow({where:{id:proof.receiptAccountingEventId}}),
          prisma.enterpriseJournalEntry.findUniqueOrThrow({where:{id:proof.invoiceJournalEntryId}}),
          prisma.enterpriseStockMovement.findUniqueOrThrow({where:{id:shipped.dispatchMovementId}}),
        ]);
        const receiptJournal=await prisma.enterpriseJournalEntry.findUniqueOrThrow({where:{id:receiptEvent.journalEntryId}});
        const latest=(...dates)=>new Date(Math.max(...dates.map(date=>date.getTime())));
        const receiptCutoff=latest(layer.effectiveAt,layer.createdAt,raceSource.occurredAt,raceSource.createdAt,receiptEvent.createdAt,receiptJournal.accountingDate,receiptJournal.postedAt);
        const capitalizedCutoff=latest(proof.effectiveAt,proof.createdAt,invoiceJournal.accountingDate,invoiceJournal.postedAt);
        const dispatchCutoff=latest(shipped.dispatchedAt,dispatchMovement.occurredAt,dispatchMovement.createdAt,shippedValue.createdAt,shippedJournal.accountingDate,shippedJournal.postedAt);
        expect(receiptCutoff.getTime()).toBeLessThan(capitalizedCutoff.getTime());
        expect(capitalizedCutoff.getTime()).toBeLessThan(dispatchCutoff.getTime());
        for(const [cutoff,quantity,value] of [[receiptCutoff,"10","70"],[capitalizedCutoff,"10","81.2"],...(firstDispatchCutoff?[[firstDispatchCutoff,"8","64.96"]]:[]),[dispatchCutoff,repeatedReturn?"6":"8",repeatedReturn?"48.72":"64.96"]]){
          const report=await post(context.owner,base+"/financial-statements",{
            statementType:"INVENTORY_VALUATION",periodStart:new Date(receiptCutoff.getTime()-86400000).toISOString(),
            periodEnd:cutoff.toISOString(),currencyCode:fixture.currencyCode,publish:false,
          });
          expect(report.status,JSON.stringify(report.body)).toBe(201);
          const row=report.body.snapshot.find(entry=>entry.inventoryItemId===layer.inventoryItemId&&entry.warehouseId===layer.warehouseId&&entry.currencyCode===fixture.currencyCode);
          expect(row,JSON.stringify(report.body)).toBeTruthy();
          expect(new Prisma.Decimal(row.quantity).equals(quantity)).toBe(true);
          expect(new Prisma.Decimal(row.value).equals(value)).toBe(true);
          const persisted=await prisma.enterpriseFinancialStatementSnapshot.findUniqueOrThrow({where:{id:report.body.statement.id}});
          expect(persisted.snapshotJson).toEqual(report.body.snapshot);
        }
        expect(await prisma.enterpriseInventoryCostLayer.findUniqueOrThrow({where:{id:layer.id}})).toEqual(layer);
        expect(await prisma.enterpriseInventoryAcquisitionCostSupplement.findUniqueOrThrow({where:{id:proof.id}})).toEqual(proof);
      }
    }






    // New ordinary pool: differently priced receipts, then an approved
    // physical loss. Prove the past AFTER depletion, not with seeded layers.
    const mixedSku=historyKey+"-CUMP-HISTORY";
    const mixedProduct=await prisma.enterpriseCatalogItem.create({data:{organizationId,code:mixedSku,sku:mixedSku,name:"E2E mixed-cost history "+historyKey,normalizedName:mixedSku.toLowerCase(),itemType:"PRODUCT",unitOfMeasureId:fixture.product.unitOfMeasureId,indicativeSalePrice:20,indicativeCost:7,currency:fixture.currencyCode,taxable:false,trackInventory:true,createdByUserId:fixture.owner.id}});
    const mixedItem=await prisma.enterpriseInventoryItem.create({data:{organizationId,catalogItemId:mixedProduct.id,lotTracking:true,expiryTracking:true,createdByUserId:fixture.owner.id}});
    const recognized=(...dates)=>new Date(Math.max(...dates.map(date=>date.getTime())));
    const mixedReceipts=[];
    for(const [suffix,cost] of [["MIX-A",5],["MIX-B",9]]){
      const purchase=await orderForPurchase(mixedProduct,10,suffix,supplier.id);
      await prisma.enterprisePurchaseItem.update({where:{id:purchase.items[0].id},data:{unitPrice:cost,lineSubtotal:10*cost,lineTotal:10*cost}});
      await prisma.enterprisePurchase.update({where:{id:purchase.id},data:{subtotalAmount:10*cost,totalAmount:10*cost}});
      const received=await post(context.owner,base+"/purchases/"+purchase.id+"/receive",{revision:purchase.revision,receivedAt:new Date().toISOString(),warehouseId:fixture.warehouse.id,items:[{purchaseItemId:purchase.items[0].id,quantityReceived:10}],lotAllocations:[{purchaseItemId:purchase.items[0].id,batches:[{lotNumber:suffix,productionDate:null,expiryDate:allocationPayload.allocations[0].expiryDate,quantity:10}]}]});
      expect(received.status,JSON.stringify(received.body)).toBe(201);
      const movement=await prisma.enterpriseStockMovement.findFirstOrThrow({where:{organizationId,sourceEntityType:"EnterprisePurchaseReceipt",sourceEntityId:received.body.receipt.id},include:{stockLot:true}});
      const valued=await post(context.owner,base+"/stock-movements/"+movement.id+"/value-receipt",{unitCost:String(cost),currencyCode:fixture.currencyCode});
      expect(valued.status,JSON.stringify(valued.body)).toBe(200);
      const event=await prisma.enterpriseInventoryAccountingEvent.findFirstOrThrow({where:{organizationId,stockMovementId:movement.id,eventType:"RECEIPT",status:"POSTED"}});
      const journal=await prisma.enterpriseJournalEntry.findUniqueOrThrow({where:{id:event.journalEntryId}});
      const layer=await prisma.enterpriseInventoryCostLayer.findFirstOrThrow({where:{organizationId,sourceMovementId:movement.id}});
      mixedReceipts.push({movement,cutoff:recognized(movement.occurredAt,movement.createdAt,event.createdAt,journal.accountingDate,journal.postedAt,layer.effectiveAt,layer.createdAt)});
    }
    const firstMixed=mixedReceipts[0].movement;
    const isolateMixed=await patchLot(context.owner,{id:firstMixed.stockLotId,revision:firstMixed.stockLot.revision,status:"QUARANTINED",qualityReason:"Mixed pool defect found before approved write-off"});
    expect(isolateMixed.status,JSON.stringify(isolateMixed.body)).toBe(200);
    const mixedLoss=await post(context.owner,base+"/stock-adjustments",{inventoryItemId:mixedItem.id,warehouseId:fixture.warehouse.id,stockLotId:firstMixed.stockLotId,adjustmentType:"OUT",lossReason:"DAMAGE",quantity:4,reason:"Independent destruction in a mixed weighted average cost pool",approverUserId:fixture.settler.id,idempotencyKey:mixedSku+"-loss"});
    expect(mixedLoss.status,JSON.stringify(mixedLoss.body)).toBe(201);
    const approvedMixedLoss=await post(context.settler,base+"/stock-adjustments/"+mixedLoss.body.adjustment.id+"/decision",{decision:"APPROVE",revision:mixedLoss.body.adjustment.revision});
    expect(approvedMixedLoss.status,JSON.stringify(approvedMixedLoss.body)).toBe(200);
    const mixedOut=await prisma.enterpriseStockMovement.findFirstOrThrow({where:{organizationId,sourceEntityType:"EnterpriseStockAdjustment",sourceEntityId:mixedLoss.body.adjustment.id,movementType:"LOT_WRITE_OFF"}});
    const mixedEvent=await prisma.enterpriseInventoryAccountingEvent.findFirstOrThrow({where:{organizationId,stockMovementId:mixedOut.id,eventType:"LOSS",status:"POSTED"}});
    expect(mixedEvent.unitCost.equals(7)&&mixedEvent.totalCost.equals(28)).toBe(true);
    const mixedJournal=await prisma.enterpriseJournalEntry.findUniqueOrThrow({where:{id:mixedEvent.journalEntryId}});
    const mixedCutoff=recognized(mixedOut.occurredAt,mixedOut.createdAt,mixedEvent.createdAt,mixedJournal.accountingDate,mixedJournal.postedAt);
    const beforeReports=await prisma.enterpriseInventoryCostLayer.findMany({where:{organizationId,inventoryItemId:mixedItem.id},orderBy:{id:"asc"}});
    expect(beforeReports.map(layer=>layer.remainingQuantity.toFixed())).toEqual(["8","8"]);
    const firstCutoff=mixedReceipts[0].cutoff,secondCutoff=mixedReceipts[1].cutoff;
    expect(firstCutoff.getTime()).toBeLessThan(secondCutoff.getTime());
    expect(secondCutoff.getTime()).toBeLessThan(mixedCutoff.getTime());
    for(const [cutoff,quantity,value] of [[firstCutoff,"10","50"],[secondCutoff,"20","140"],[mixedCutoff,"16","112"]]){
      const report=await post(context.owner,base+"/financial-statements",{statementType:"INVENTORY_VALUATION",periodStart:new Date(firstCutoff.getTime()-86400000).toISOString(),periodEnd:cutoff.toISOString(),currencyCode:fixture.currencyCode,publish:false});
      expect(report.status,JSON.stringify(report.body)).toBe(201);
      const row=report.body.snapshot.find(r=>r.inventoryItemId===mixedItem.id&&r.warehouseId===fixture.warehouse.id);
      expect(row).toMatchObject({valuationBasis:"VERIFIED_HISTORY",inventoryItemName:mixedProduct.name,currencyCode:fixture.currencyCode});
      expect(new Prisma.Decimal(row.quantity).equals(quantity)).toBe(true);
      expect(new Prisma.Decimal(row.value).equals(value)).toBe(true);
      const legacy=report.body.snapshot.find(r=>r.inventoryItemId===historicalInventory.id&&r.warehouseId===fixture.warehouse.id);
      expect(legacy?.valuationBasis).toBe("CURRENT_LAYER_PROJECTION");
    }
    expect(await prisma.enterpriseInventoryCostLayer.findMany({where:{organizationId,inventoryItemId:mixedItem.id},orderBy:{id:"asc"}})).toEqual(beforeReports);

  } finally {
    if (originalSettings !== undefined) await prisma.enterpriseRetailConfiguration.update({
      where: { organizationId }, data: { settingsJson: originalSettings === null ? Prisma.DbNull : originalSettings,
        revision: { increment: 1 } },
    });
    await Promise.all(Object.values(context).map((browserContext) => browserContext.close()));
    await prisma.$disconnect();
  }
});
