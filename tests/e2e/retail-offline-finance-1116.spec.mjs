import { expect, test } from "@playwright/test";
import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const baseUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const organizationId = process.env.E2E_ORGANIZATION_ID || "e2e-erp-professional-org";
const cashierEmail = process.env.E2E_USER_EMAIL || "erp-user@example.test";
const cashierPassword = process.env.E2E_USER_PASSWORD || "E2eUser2026!";

async function post(context, path, data) {
  const response = await context.request.post(path, {
    data, headers: { origin: baseUrl, referer: `${baseUrl}/enterprise-modules/RETAIL_POS` },
  });
  return { status: response.status(), body: await response.json().catch(() => null) };
}

test("offline Finance replay produces one DRAFT, no payment, posting or stock consumption #1116", async ({ browser }) => {
  if (process.env.CI !== "true" || !/\/dtsc_shop2_behavioral(?:\?|$)/.test(process.env.DATABASE_URL || "")) {
    throw new Error("RETAIL_1116_E2E_REQUIRES_EPHEMERAL_CI_DATABASE");
  }
  const context = await browser.newContext({ baseURL: baseUrl });
  let initialSettings;
  try {
    const [site, warehouse, item, config, finance] = await Promise.all([
      prisma.enterpriseSite.findFirstOrThrow({ where: { organizationId, code: "SHOP2-E2E-SITE-FINANCE" } }),
      prisma.enterpriseWarehouse.findFirstOrThrow({ where: { organizationId, code: "SHOP2-E2E-WH-FINANCE" } }),
      prisma.enterpriseCatalogItem.findFirstOrThrow({ where: { organizationId, code: "SHOP2-E2E-FINANCE-SKU" } }),
      prisma.enterpriseRetailConfiguration.findUniqueOrThrow({ where: { organizationId } }),
      prisma.enterpriseFinanceConfiguration.findUniqueOrThrow({ where: { organizationId } }),
    ]);
    initialSettings = config.settingsJson;
    await prisma.enterpriseRetailConfiguration.update({
      where: { organizationId },
      data: {
        settingsJson: { ...(initialSettings && typeof initialSettings === "object" && !Array.isArray(initialSettings) ? initialSettings : {}), invoiceCheckoutEnabled: true },
        revision: { increment: 1 },
      },
    });

    const signIn = await post(context, `${baseUrl}/api/auth/sign-in`, {
      email: cashierEmail, password: cashierPassword, organizationId, next: "/enterprise-modules/RETAIL_POS",
    });
    expect(signIn.status, JSON.stringify(signIn.body)).toBe(200);

    const base = `${baseUrl}/api/enterprise/${organizationId}/retail`;
    const snapshot = await post(context, `${base}/offline/snapshot`, {
      siteId: site.id, warehouseId: warehouse.id,
      currencyCode: finance.functionalCurrencyCode, maxItems: 500,
    });
    expect(snapshot.status, JSON.stringify(snapshot.body)).toBe(201);
    expect(snapshot.body?.policy?.draftOnly).toBe(true);
    expect(snapshot.body?.policy?.saleEnabled).toBe(true);
    expect(snapshot.body?.policy?.allowedTenderTypes).toEqual([]);
    const product = snapshot.body?.catalog?.items?.find((row) => row.catalogItemId === item.id);
    expect(product, "The Finance fixture product must be present in the offline snapshot").toBeTruthy();
    expect(product.offlineEligible, "Fixture must support a lot-free Finance draft").toBe(true);

    const inventory = await prisma.enterpriseInventoryItem.findFirstOrThrow({
      where: { organizationId, catalogItemId: item.id }, select: { id: true },
    });
    const before = {
      invoices: await prisma.enterpriseSalesInvoice.count({ where: { organizationId } }),
      payments: await prisma.enterprisePayment.count({ where: { organizationId } }),
      journals: await prisma.enterpriseJournalEntry.count({ where: { organizationId } }),
      stock: await prisma.enterpriseInventoryBalance.findFirstOrThrow({
        where: { organizationId, warehouseId: warehouse.id, inventoryItemId: inventory.id, stockLotId: null },
      }),
    };

    const operationUuid = crypto.randomUUID();
    const syncBody = {
      operationUuid, snapshotVersion: snapshot.body.version, siteId: site.id, warehouseId: warehouse.id,
      payload: {
        mode: "INVOICE_DRAFT", siteId: site.id, warehouseId: warehouse.id,
        soldAt: new Date().toISOString(), currencyCode: finance.functionalCurrencyCode,
        customerBusinessPartyId: null, tenders: [],
        lines: [{
          catalogItemId: item.id, quantity: 1,
          unitPrice: Number(product.serviceUnitPrice),
          discountAmount: Number(product.serviceUnitDiscountAmount || 0),
          taxAmount: Number(product.unitTaxAmount || 0),
        }],
      },
    };
    const created = await post(context, `${base}/offline/sync`, syncBody);
    expect(created.status, JSON.stringify(created.body)).toBe(200);
    expect(created.body?.operation?.status).toBe("SYNCED");
    expect(created.body?.operation?.serverEntityType).toBe("EnterpriseSalesInvoice");
    const invoiceId = created.body?.invoice?.id;
    expect(invoiceId).toBeTruthy();
    expect((await prisma.enterpriseSalesInvoice.findUniqueOrThrow({ where: { id: invoiceId } })).status).toBe("DRAFT");
    expect(await prisma.enterpriseSalesInvoice.count({ where: { organizationId } })).toBe(before.invoices + 1);

    const retried = await post(context, `${base}/offline/sync`, syncBody);
    expect(retried.status, JSON.stringify(retried.body)).toBe(200);
    expect(retried.body?.operation?.serverEntityId).toBe(invoiceId);
    expect(await prisma.enterpriseSalesInvoice.count({ where: { organizationId } })).toBe(before.invoices + 1);

    const modified = await post(context, `${base}/offline/sync`, {
      ...syncBody, payload: { ...syncBody.payload, lines: [{ ...syncBody.payload.lines[0], quantity: 2 }] },
    });
    expect(modified.status).toBe(409);
    expect(await prisma.enterpriseSalesInvoice.count({ where: { organizationId } })).toBe(before.invoices + 1);

    const tender = await post(context, `${base}/offline/sync`, {
      ...syncBody, operationUuid: crypto.randomUUID(),
      payload: { ...syncBody.payload, tenders: [{ methodType: "CASH", amount: 20 }] },
    });
    expect(tender.status, JSON.stringify(tender.body)).toBe(422);
    expect(tender.body?.operation?.status).toBe("REJECTED");

    expect(await prisma.enterprisePayment.count({ where: { organizationId } })).toBe(before.payments);
    expect(await prisma.enterpriseJournalEntry.count({ where: { organizationId } })).toBe(before.journals);
    const afterStock = await prisma.enterpriseInventoryBalance.findUniqueOrThrow({ where: { id: before.stock.id } });
    expect(new Prisma.Decimal(afterStock.quantityOnHand).eq(before.stock.quantityOnHand)).toBe(true);
  } finally {
    if (initialSettings !== undefined) {
      await prisma.enterpriseRetailConfiguration.update({
        where: { organizationId }, data: {
          settingsJson: initialSettings === null ? Prisma.DbNull : initialSettings,
          revision: { increment: 1 },
        },
      });
    }
    await context.close();
    await prisma.$disconnect();
  }
});
