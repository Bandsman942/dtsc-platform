import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";

// Real PostgreSQL/Prisma integration: reproduce the exact nested write rejected
// by production. Use an isolated transaction deliberately rolled back at the end.
if (!process.env.DATABASE_URL) {
  console.error("QA requires DATABASE_URL pointing to an isolated CI database.");
  process.exit(2);
}
const prisma = new PrismaClient();
class ExpectedRollback extends Error {}
const tenant = `qa-quote-${randomUUID()}`;
const actor = `qa-actor-${randomUUID()}`;
const client = `qa-client-${randomUUID()}`;
try {
  await prisma.$transaction(async (tx) => {
    const unit = await tx.enterpriseUnitOfMeasure.create({
      data: { organizationId: tenant, code: "QA-PIECE", name: "Pièce", symbol: "pc" },
    });
    const catalog = await Promise.all(["Chargeur 20 W", "Chargeur Anker"].map((name, index) =>
      tx.enterpriseCatalogItem.create({
        data: {
          organizationId: tenant, code: `QA-CAT-${index}`,
          name, normalizedName: name.toLowerCase(),
          itemType: "PRODUCT", unitOfMeasureId: unit.id,
          indicativeSalePrice: index === 0 ? 45000 : 19900,
          currency: "CDF", createdByUserId: actor,
        },
      }),
    ));
    const lines = [
      { description: "Chargeur 20 W", quantity: 10, unitPrice: 45000, lineSubtotal: 450000, lineTotal: 450000 },
      { description: "Chargeur Anker", quantity: 9, unitPrice: 19900, lineSubtotal: 179100, lineTotal: 179100 },
    ];
    const quote = await tx.enterpriseQuote.create({
      data: {
        organizationId: tenant,
        reference: "QA-QTE-1198",
        businessPartyId: client,
        title: "Devis CRM CDF",
        currency: "CDF",
        subtotalAmount: 629100,
        discountAmount: 0,
        taxAmount: 0,
        totalAmount: 629100,
        createdByUserId: actor,
        items: {
          create: lines.map((item, index) => ({
            catalogItemId: catalog[index].id,
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            discountRate: 0, discountAmount: 0, taxRate: 0, taxAmount: 0,
            lineSubtotal: item.lineSubtotal, lineTotal: item.lineTotal, sortOrder: index,
          })),
        },
      },
      include: { items: { orderBy: { sortOrder: "asc" } } },
    });
    assert.equal(quote.items.length, 2, "Quote must persist both nested lines");
    assert.equal(quote.items[0].organizationId, tenant, "Tenant must inherit from parent relation");
    assert.equal(quote.items[1].organizationId, tenant);
    assert.equal(quote.items[0].catalogItemId, catalog[0].id, "First catalog link must survive nested create");
    assert.equal(quote.items[1].catalogItemId, catalog[1].id, "Second catalog link must survive nested create");
    assert.equal(Number(quote.totalAmount), 629100);
    assert.equal(Number(quote.items[0].lineTotal.plus(quote.items[1].lineTotal)), 629100);

    const order = await tx.enterpriseSalesOrder.create({
      data: {
        organizationId: tenant,
        reference: "QA-SO-1198",
        businessPartyId: client,
        quoteId: quote.id,
        title: quote.title,
        status: "CONFIRMED",
        currency: quote.currency,
        subtotalAmount: quote.subtotalAmount,
        discountAmount: quote.discountAmount,
        taxAmount: quote.taxAmount,
        totalAmount: quote.totalAmount,
        createdByUserId: actor,
        items: {
          create: quote.items.map((item) => ({
            catalogItemId: item.catalogItemId,
            description: item.description,
            quantityOrdered: item.quantity,
            unitOfMeasureId: item.unitOfMeasureId,
            unitPrice: item.unitPrice,
            discountRate: item.discountRate,
            discountAmount: item.discountAmount,
            taxRate: item.taxRate,
            taxAmount: item.taxAmount,
            lineSubtotal: item.lineSubtotal,
            lineTotal: item.lineTotal,
            sortOrder: item.sortOrder,
          })),
        },
      },
      include: { items: { orderBy: { sortOrder: "asc" } } },
    });
    assert.equal(order.items.length, 2, "Conversion must persist two order lines");
    assert.ok(order.items.every((item) => item.organizationId === tenant && item.salesOrderId === order.id));
    assert.equal(Number(order.totalAmount), Number(quote.totalAmount));
    await tx.enterpriseQuote.update({
      where: { id: quote.id }, data: { status: "CONVERTED", convertedOrderId: order.id },
    });
    const linked = await tx.enterpriseQuote.findFirst({
      where: { id: quote.id, organizationId: tenant },
      select: { convertedOrderId: true },
    });
    assert.equal(linked?.convertedOrderId, order.id, "Quote must link its converted order");
    throw new ExpectedRollback("ROLLBACK_QA_1198");
  });
  throw new Error("QA expected to roll back all synthetic records");
} catch (error) {
  if (!(error instanceof ExpectedRollback)) throw error;
  console.log("PASS #1198: Prisma PostgreSQL nested quote + 2 lines + order conversion + tenant FK + total 629100 CDF (rolled back)");
} finally {
  await prisma.$disconnect();
}
