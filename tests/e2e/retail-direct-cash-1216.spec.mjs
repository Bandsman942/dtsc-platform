import { expect, test } from "@playwright/test";
import { pbkdf2Sync, randomBytes, randomUUID } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const baseUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const organizationId = process.env.E2E_ORGANIZATION_ID || "e2e-erp-professional-org";
const operatorEmail = "shop2-direct-cash-1216@example.test";
const operatorPassword = "E2eDirectCash1216!";
const ownerEmail = process.env.E2E_ADMIN_EMAIL || "erp-admin@example.test";
const uniq = (prefix) => `${prefix}-${randomUUID().slice(0, 8)}`;

function passwordHash(password) {
  const salt = randomBytes(16).toString("base64url");
  return `pbkdf2:210000:${salt}:${pbkdf2Sync(password, salt, 210000, 32, "sha256").toString("base64url")}`;
}

async function post(context, path, data) {
  const response = await context.request.post(`${baseUrl}${path}`, {
    data, headers: { origin: baseUrl, referer: `${baseUrl}/enterprise-modules/RETAIL_POS` },
  });
  return { status: response.status(), body: await response.json().catch(() => null) };
}
async function setup() {
  const owner = await prisma.user.findUniqueOrThrow({ where: { email: ownerEmail } });
  const operator = await prisma.user.upsert({
    where: { email: operatorEmail },
    update: { name: "Retail Direct CASH E2E", passwordHash: passwordHash(operatorPassword), role: "CLIENT", status: "ACTIVE" },
    create: { name: "Retail Direct CASH E2E", email: operatorEmail,
      passwordHash: passwordHash(operatorPassword), role: "CLIENT", status: "ACTIVE", locale: "fr" },
  });
  const position = await prisma.enterprisePosition.upsert({
    where: { organizationId_positionCode: { organizationId, positionCode: "SHOP2-DIRECT-1216" } },
    update: { permissionsJson: ["enterprise.retail.pos.view", "enterprise.retail.pos.create"], isActive: true },
    create: { organizationId, positionCode: "SHOP2-DIRECT-1216", labelFr: "Facturier encaisseur", labelEn: "Direct cashier",
      permissionsJson: ["enterprise.retail.pos.view", "enterprise.retail.pos.create"], isActive: true },
  });
  await prisma.organizationMember.upsert({
    where: { organizationId_userId: { organizationId, userId: operator.id } },
    update: { role: "MEMBER", status: "ACTIVE", removedAt: null, positionId: position.id, positionCode: position.positionCode },
    create: { organizationId, userId: operator.id, role: "MEMBER", status: "ACTIVE",
      positionId: position.id, positionCode: position.positionCode, joinedAt: new Date() },
  });
  const site = await prisma.enterpriseSite.upsert({
    where: { organizationId_code: { organizationId, code: "SHOP2-DIRECT-1216-SITE" } },
    update: { name: "Retail Direct 1216 Store", siteType: "STORE", status: "ACTIVE", archivedAt: null },
    create: { organizationId, code: "SHOP2-DIRECT-1216-SITE", name: "Retail Direct 1216 Store",
      siteType: "STORE", countryCode: "US", timezone: "UTC", status: "ACTIVE", createdByUserId: owner.id },
  });
  const warehouse = await prisma.enterpriseWarehouse.upsert({
    where: { organizationId_code: { organizationId, code: "SHOP2-DIRECT-1216-WH" } },
    update: { siteId: site.id, status: "ACTIVE", archivedAt: null },
    create: { organizationId, siteId: site.id, code: "SHOP2-DIRECT-1216-WH",
      name: "Retail Direct 1216 Warehouse", warehouseType: "STORE", status: "ACTIVE", createdByUserId: owner.id },
  });
  const permissions = [
    "VIEW_STOCK", "VIEW_SALES", "PREPARE_INVOICE", "ISSUE_INVOICE",
    "COLLECT_PAYMENT", "OPEN_CASH", "SELF_APPROVE_INVOICE", "SELF_APPROVE_PAYMENT",
  ];
  await prisma.enterpriseRetailSiteAssignment.upsert({
    where: { organizationId_siteId_userId: { organizationId, siteId: site.id, userId: operator.id } },
    update: { roleCode: "INVOICER", permissionsJson: permissions, isActive: true },
    create: { organizationId, siteId: site.id, userId: operator.id, roleCode: "INVOICER",
      permissionsJson: permissions, isActive: true, createdByUserId: owner.id },
  });
  const baseCatalog = await prisma.enterpriseCatalogItem.findFirstOrThrow({
    where: { organizationId, code: "SHOP2-E2E-SKU", status: "ACTIVE" },
  });
  const currencyCode = (await prisma.enterpriseFinanceConfiguration.findUniqueOrThrow({
    where: { organizationId }, select: { functionalCurrencyCode: true },
  })).functionalCurrencyCode;
  const product = await prisma.enterpriseCatalogItem.upsert({
    where: { organizationId_code: { organizationId, code: "SHOP2-DIRECT-1216-PRODUCT" } },
    update: { status: "ACTIVE", archivedAt: null, currency: currencyCode, trackInventory: true,
      taxable: false, indicativeSalePrice: 85 },
    create: { organizationId, code: "SHOP2-DIRECT-1216-PRODUCT", sku: "SHOP2-DIRECT-1216-PRODUCT",
      name: "Direct CASH 85 test", normalizedName: "direct cash 85 test", itemType: "PRODUCT",
      unitOfMeasureId: baseCatalog.unitOfMeasureId, indicativeSalePrice: 85, indicativeCost: 30,
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
  if (balance) await prisma.enterpriseInventoryBalance.update({
    where: { id: balance.id }, data: { quantityOnHand: 10, quantityReserved: 0 },
  });
  else await prisma.enterpriseInventoryBalance.create({ data: {
    organizationId, warehouseId: warehouse.id, inventoryItemId: inventory.id,
    quantityOnHand: 10, quantityReserved: 0,
  } });
  const movement = await prisma.enterpriseStockMovement.findFirst({
    where: { organizationId, idempotencyKey: "shop2-direct-1216-opening" },
  }) || await prisma.enterpriseStockMovement.create({ data: {
    organizationId, inventoryItemId: inventory.id, warehouseId: warehouse.id,
    movementType: "OPENING_BALANCE", direction: "IN", quantity: 10, balanceAfter: 10,
    idempotencyKey: "shop2-direct-1216-opening", reason: "Direct CASH E2E opening", createdByUserId: owner.id,
  } });
  await prisma.enterpriseInventoryCostLayer.upsert({
    where: { organizationId_sourceMovementId: { organizationId, sourceMovementId: movement.id } },
    update: { remainingQuantity: 10, quantity: 10, unitCost: 30, totalCost: 300, currencyCode },
    create: { organizationId, inventoryItemId: inventory.id, warehouseId: warehouse.id,
      sourceMovementId: movement.id, valuationMethod: "WEIGHTED_AVERAGE",
      quantity: 10, remainingQuantity: 10, unitCost: 30, totalCost: 300,
      currencyCode, effectiveAt: new Date() },
  });
  const sourceCash = await prisma.enterpriseFinancialAccount.findFirstOrThrow({
    where: { organizationId, code: "SHOP2-E2E-CASH", accountType: "CASH", status: "ACTIVE" },
  });
  const cash = await prisma.enterpriseFinancialAccount.upsert({
    where: { organizationId_code: { organizationId, code: "SHOP2-DIRECT-1216-CASH" } },
    update: { accountType: "CASH", siteId: site.id, currencyCode,
      ledgerAccountId: sourceCash.ledgerAccountId, status: "ACTIVE", archivedAt: null,
      openingBalance: 1000, operationalBalance: 1000, reconciledBalance: 1000, availableBalance: 1000 },
    create: { organizationId, code: "SHOP2-DIRECT-1216-CASH", name: "Direct CASH 1216 cashbox",
      accountType: "CASH", siteId: site.id, currencyCode,
      ledgerAccountId: sourceCash.ledgerAccountId, status: "ACTIVE",
      openingBalance: 1000, operationalBalance: 1000, reconciledBalance: 1000, availableBalance: 1000,
      responsibleUserId: operator.id },
  });
  const session = await prisma.enterpriseCashSession.create({ data: {
    organizationId, number: uniq("DIRECT-1216-SESSION"), financialAccountId: cash.id,
    cashierUserId: operator.id, siteId: site.id, status: "OPEN", openingAmount: 1000,
  } });
  return { owner, operator, site, warehouse, product, inventory, cash, session, currencyCode };
}

test("RETAIL #1216 direct CASH full lifecycle, once-only posting, print and isolation", async ({ browser }) => {
  test.setTimeout(600_000);
  if (process.env.CI !== "true" || !/\/dtsc_shop2_behavioral(?:\?|$)/.test(process.env.DATABASE_URL || "")) {
    throw new Error("RETAIL_DIRECT_CASH_1216_REQUIRES_EPHEMERAL_SHOP2_CI_DATABASE");
  }
  const context = await browser.newContext({ baseURL: baseUrl, viewport: { width: 390, height: 844 } });
  const config = await prisma.enterpriseRetailConfiguration.findUniqueOrThrow({ where: { organizationId } });
  const previousSettings = config.settingsJson;
  try {
    const f = await setup();
    const settings = previousSettings && typeof previousSettings === "object" && !Array.isArray(previousSettings) ? previousSettings : {};
    await prisma.enterpriseRetailConfiguration.update({
      where: { organizationId },
      data: { settingsJson: {
        ...settings, invoiceCheckoutEnabled: true, siteStaffIsolationEnabled: true,
        retailSiteOperatingOverrides: {
          ...(settings.retailSiteOperatingOverrides || {}),
          [f.site.id]: {
            directCheckoutEnabled: true, quickPrintEnabled: true, simplifiedNavigationEnabled: true,
            defaultPaper: "THERMAL_80MM",
            footerLinesFr: ["Veuillez vérifier les marchandises."], footerLinesEn: [],
          },
        },
      }, revision: { increment: 1 } },
    });
    const signed = await post(context, "/api/auth/sign-in", {
      email: operatorEmail, password: operatorPassword,
      organizationId, next: "/enterprise-modules/RETAIL_POS",
    });
    expect(signed.status, JSON.stringify(signed.body)).toBe(200);
    const root = `/api/enterprise/${organizationId}/retail`;
    const options = await context.request.get(`${baseUrl}${root}/direct-checkout/options?siteId=${f.site.id}`);
    expect(options.status(), await options.text()).toBe(200);
    const operating = await options.json();
    expect(operating.directAllowed).toBe(true);
    expect(operating.cashSessions.some((item) => item.id === f.session.id)).toBe(true);

    const quoted = await post(context, root + "/invoice-fx-preview", {
      siteId: f.site.id, currencyCode: f.currencyCode,
      channelCode: "POS", invoiceCheckout: true,
      lines: [{ catalogItemId: f.product.id, quantity: 1 }],
    });
    expect(quoted.status, JSON.stringify(quoted.body)).toBe(200);
    const grandTotal = new Prisma.Decimal(quoted.body.grandTotal);
    expect(grandTotal.gt(0)).toBe(true);
    const tendered = grandTotal.plus(15).toFixed(2);
    const key = uniq("direct-1216");
    const command = {
      idempotencyKey: key, siteId: f.site.id, warehouseId: f.warehouse.id,
      currencyCode: f.currencyCode, expectedGrandTotal: grandTotal.toFixed(2),
      lines: [{ catalogItemId: f.product.id, quantity: 1 }],
      payment: { methodType: "CASH", financialAccountId: f.cash.id, cashSessionId: f.session.id,
        cashTendered: tendered },
    };
    const result = await post(context, root + "/direct-checkout", command);
    expect(result.status, JSON.stringify(result.body)).toBe(200);
    expect(result.body.status).toBe("COMPLETED");
    expect(new Prisma.Decimal(result.body.changeDue).equals(15)).toBe(true);
    const repeated = await post(context, root + "/direct-checkout", command);
    expect(repeated.status, JSON.stringify(repeated.body)).toBe(200);
    expect(repeated.body.invoiceId).toBe(result.body.invoiceId);
    const collision = await post(context, root + "/direct-checkout", {
      ...command, expectedGrandTotal: grandTotal.plus(1).toFixed(2),
    });
    expect(collision.status).toBe(409);

    // Cross-PR #1215/#1217: recall is an unconditional sale barrier,
    // including stores configured for permissive expiry policy. Rejected
    // direct CASH attempts must not emit invoices, allocate cash or move stock.
    const blockedLot = await prisma.enterpriseStockLot.create({ data: {
      organizationId, inventoryItemId: f.inventory.id, warehouseId: f.warehouse.id,
      lotNumber: uniq("RECALLED-1215"), status: "QUARANTINED",
      recallReference: uniq("RECALL-1215"),
      qualityReason: "Synthetic quality recall in disposable CI database",
      qualityChangedByUserId: f.owner.id, qualityChangedAt: new Date(),
      createdByUserId: f.owner.id,
    } });
    const blockedKey = uniq("direct-recalled-1215");
    const financeBeforeBlocked = await Promise.all([
      prisma.enterpriseSalesInvoice.count({ where: { organizationId } }),
      prisma.enterprisePayment.count({ where: { organizationId } }),
      prisma.enterpriseCashMovement.count({ where: { organizationId } }),
      prisma.enterpriseTreasuryTransaction.count({ where: { organizationId } }),
      prisma.enterpriseStockMovement.count({ where: { organizationId } }),
      prisma.enterpriseJournalEntry.count({ where: { organizationId } }),
    ]);
    const blockedCommand = {
      ...command, idempotencyKey: blockedKey,
      lines: [{ catalogItemId: f.product.id, stockLotId: blockedLot.id, quantity: 1 }],
    };
    const blocked = await post(context, root + "/direct-checkout", blockedCommand);
    expect(blocked.status, JSON.stringify(blocked.body)).toBe(409);
    const blockedReplay = await post(context, root + "/direct-checkout", blockedCommand);
    expect(blockedReplay.status, JSON.stringify(blockedReplay.body)).toBe(409);
    const failedAttempt = await prisma.enterpriseRetailDirectCheckoutAttempt.findUniqueOrThrow({
      where: { organizationId_idempotencyKey: { organizationId, idempotencyKey: blockedKey } },
    });
    expect(failedAttempt.status).toBe("FAILED");
    expect(failedAttempt.salesInvoiceId).toBeNull();
    expect(failedAttempt.paymentId).toBeNull();
    expect(await Promise.all([
      prisma.enterpriseSalesInvoice.count({ where: { organizationId } }),
      prisma.enterprisePayment.count({ where: { organizationId } }),
      prisma.enterpriseCashMovement.count({ where: { organizationId } }),
      prisma.enterpriseTreasuryTransaction.count({ where: { organizationId } }),
      prisma.enterpriseStockMovement.count({ where: { organizationId } }),
      prisma.enterpriseJournalEntry.count({ where: { organizationId } }),
    ])).toEqual(financeBeforeBlocked);
    expect((await prisma.enterpriseStockLot.findUniqueOrThrow({ where: { id: blockedLot.id } })).status).toBe("QUARANTINED");

    // Cross-warehouse anti-bypass: even a stale AVAILABLE local sister batch
    // must be unsellable when the SAME SKU/lot-number has been recalled
    // elsewhere in the tenant. No new Finance/stock record may be created.
    const shadowWarehouse = await prisma.enterpriseWarehouse.create({ data: {
      organizationId, siteId: f.site.id, code: uniq("SHADOW-WH-1215"),
      name: "Recall shadow warehouse", warehouseType: "STORE",
      status: "ACTIVE", createdByUserId: f.owner.id,
    } });
    const sharedBatchNumber = uniq("SISTER-BATCH-1215");
    const staleLocalLot = await prisma.enterpriseStockLot.create({ data: {
      organizationId, inventoryItemId: f.inventory.id, warehouseId: f.warehouse.id,
      lotNumber: sharedBatchNumber, status: "AVAILABLE", createdByUserId: f.owner.id,
    } });
    await prisma.enterpriseInventoryBalance.create({ data: {
      organizationId, inventoryItemId: f.inventory.id, warehouseId: f.warehouse.id,
      stockLotId: staleLocalLot.id, quantityOnHand: 5, quantityReserved: 0,
    } });
    const recalledSister = await prisma.enterpriseStockLot.create({ data: {
      organizationId, inventoryItemId: f.inventory.id, warehouseId: shadowWarehouse.id,
      lotNumber: sharedBatchNumber, status: "QUARANTINED",
      recallReference: uniq("RECALL-SISTER-1215"),
      qualityReason: "Synthetic globally recalled batch in a separate warehouse",
      qualityChangedByUserId: f.owner.id, qualityChangedAt: new Date(),
      createdByUserId: f.owner.id,
    } });
    const beforeCrossWarehouseCheckout = await Promise.all([
      prisma.enterpriseSalesInvoice.count({ where: { organizationId } }),
      prisma.enterprisePayment.count({ where: { organizationId } }),
      prisma.enterpriseCashMovement.count({ where: { organizationId } }),
      prisma.enterpriseTreasuryTransaction.count({ where: { organizationId } }),
      prisma.enterpriseStockMovement.count({ where: { organizationId } }),
      prisma.enterpriseJournalEntry.count({ where: { organizationId } }),
    ]);
    const crossWarehouseKey = uniq("direct-recalled-sister-1215");
    const crossWarehouseCommand = {
      ...command, idempotencyKey: crossWarehouseKey,
      lines: [{ catalogItemId: f.product.id, stockLotId: staleLocalLot.id, quantity: 1 }],
    };
    const crossWarehouseRejected = await post(context, root + "/direct-checkout", crossWarehouseCommand);
    expect(crossWarehouseRejected.status, JSON.stringify(crossWarehouseRejected.body)).toBe(409);
    const crossWarehouseReplay = await post(context, root + "/direct-checkout", crossWarehouseCommand);
    expect(crossWarehouseReplay.status, JSON.stringify(crossWarehouseReplay.body)).toBe(409);
    expect((await prisma.enterpriseRetailDirectCheckoutAttempt.findUniqueOrThrow({
      where: { organizationId_idempotencyKey: { organizationId, idempotencyKey: crossWarehouseKey } },
    })).status).toBe("FAILED");
    expect(await Promise.all([
      prisma.enterpriseSalesInvoice.count({ where: { organizationId } }),
      prisma.enterprisePayment.count({ where: { organizationId } }),
      prisma.enterpriseCashMovement.count({ where: { organizationId } }),
      prisma.enterpriseTreasuryTransaction.count({ where: { organizationId } }),
      prisma.enterpriseStockMovement.count({ where: { organizationId } }),
      prisma.enterpriseJournalEntry.count({ where: { organizationId } }),
    ])).toEqual(beforeCrossWarehouseCheckout);
    expect((await prisma.enterpriseStockLot.findUniqueOrThrow({
      where: { id: staleLocalLot.id },
    })).status).toBe("AVAILABLE", "Read-only guard must not mutate historic local lot");
    expect((await prisma.enterpriseStockLot.findUniqueOrThrow({
      where: { id: recalledSister.id },
    })).status).toBe("QUARANTINED");

    const invoice = await prisma.enterpriseSalesInvoice.findFirstOrThrow({
      where: { id: result.body.invoiceId, organizationId },
    });
    const payment = await prisma.enterprisePayment.findFirstOrThrow({
      where: { id: result.body.paymentId, organizationId },
    });
    expect(invoice.status).toBe("PAID");
    expect(invoice.outstandingAmount.isZero()).toBe(true);
    expect(payment.status).toBe("CONFIRMED");
    expect(payment.amount.equals(grandTotal)).toBe(true);
    const [cashMovements, treasury, allocations, inventoryMovements, attempt, checkout] = await Promise.all([
      prisma.enterpriseCashMovement.findMany({ where: { organizationId, paymentId: payment.id } }),
      prisma.enterpriseTreasuryTransaction.findMany({ where: { organizationId, paymentId: payment.id } }),
      prisma.enterprisePaymentAllocation.findMany({ where: { organizationId, paymentId: payment.id } }),
      prisma.enterpriseStockMovement.findMany({ where: {
        organizationId, sourceEntityType: "EnterpriseSalesInvoice", sourceEntityId: invoice.id,
        movementType: "SALE_FULFILLMENT",
      } }),
      prisma.enterpriseRetailDirectCheckoutAttempt.findUniqueOrThrow({
        where: { organizationId_idempotencyKey: { organizationId, idempotencyKey: key } },
      }),
      prisma.enterpriseRetailInvoiceCheckout.findFirstOrThrow({
        where: { organizationId, salesInvoiceId: invoice.id },
      }),
    ]);
    expect(cashMovements).toHaveLength(1);
    expect(treasury).toHaveLength(1);
    expect(allocations).toHaveLength(1);
    expect(inventoryMovements).toHaveLength(1);
    expect(inventoryMovements[0].quantity.equals(1)).toBe(true);
    expect(attempt.status).toBe("COMPLETED");
    expect(checkout.stockPostedAt).toBeTruthy();
    expect(allocations[0].amount.equals(grandTotal)).toBe(true);

    const journalEntries = await prisma.enterpriseJournalEntry.findMany({
      where: { organizationId, sourceEntityId: { in: [invoice.id, payment.id] }, status: "POSTED" },
      include: { lines: true },
    });
    expect(journalEntries.length).toBeGreaterThanOrEqual(2);
    for (const entry of journalEntries) {
      const debits = entry.lines.reduce((sum, line) => sum.plus(line.debit), new Prisma.Decimal(0));
      const credits = entry.lines.reduce((sum, line) => sum.plus(line.credit), new Prisma.Decimal(0));
      expect(debits.equals(credits), `Unbalanced ledger ${entry.id}`).toBe(true);
    }
    const print = await context.request.get(`${baseUrl}${root}/invoices/${invoice.id}/print?paper=thermal&lang=fr`);
    expect(print.status()).toBe(200);
    const html = await print.text();
    expect(html).toContain(invoice.number);
    expect(html).toContain("Veuillez vérifier les marchandises.");

    const denied = await post(context, root + "/direct-checkout", { ...command, idempotencyKey: uniq("cross-site"),
      siteId: "not-my-store" });
    expect([403, 404, 409]).toContain(denied.status);
    await context.newPage().then(async (page) => {
      try {
        await page.goto("/enterprise-modules/RETAIL_POS?section=checkout&siteId=" + encodeURIComponent(f.site.id));
        await expect(page.locator('[data-retail-direct-cash]')).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2)).toBe(false);
      } finally { await page.close(); }
    });
  } finally {
    await prisma.enterpriseRetailConfiguration.update({
      where: { organizationId },
      data: { settingsJson: previousSettings === null ? Prisma.DbNull : previousSettings, revision: { increment: 1 } },
    }).catch(() => {});
    await context.close();
    await prisma.$disconnect();
  }
});
