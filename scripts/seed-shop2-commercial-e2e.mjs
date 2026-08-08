import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const organizationId = process.env.E2E_ORGANIZATION_ID || "e2e-erp-professional-org";
const adminEmail = (process.env.E2E_ADMIN_EMAIL || "erp-admin@example.test").toLowerCase();
const userEmail = (process.env.E2E_USER_EMAIL || "erp-user@example.test").toLowerCase();
const currencyCode = "USD";
const effectiveFrom = new Date("2026-01-01T00:00:00.000Z");

async function upsertTaxRate(taxCodeId, rate, actorUserId) {
  const existing = await prisma.enterpriseTaxRate.findFirst({ where: { organizationId, taxCodeId, effectiveFrom } });
  if (existing) {
    return prisma.enterpriseTaxRate.update({ where: { id: existing.id }, data: { rate, effectiveTo: null, status: "ACTIVE", createdByUserId: actorUserId } });
  }
  return prisma.enterpriseTaxRate.create({ data: { organizationId, taxCodeId, rate, effectiveFrom, status: "ACTIVE", createdByUserId: actorUserId } });
}

async function upsertCatalogPrice(catalogItemId, amount, taxIncluded, actorUserId) {
  const existing = await prisma.enterpriseCatalogPrice.findFirst({
    where: { organizationId, catalogItemId, priceType: "SALE", currency: currencyCode, effectiveFrom, archivedAt: null },
  });
  if (existing) {
    return prisma.enterpriseCatalogPrice.update({ where: { id: existing.id }, data: { amount, taxIncluded, effectiveUntil: null, status: "ACTIVE" } });
  }
  return prisma.enterpriseCatalogPrice.create({
    data: { organizationId, catalogItemId, priceType: "SALE", amount, currency: currencyCode, taxIncluded, effectiveFrom, status: "ACTIVE", createdByUserId: actorUserId },
  });
}

async function main() {
  const [admin, user, baseProduct, site, warehouse, uom, taxLedgerAccount, cashAccount] = await Promise.all([
    prisma.user.findUnique({ where: { email: adminEmail } }),
    prisma.user.findUnique({ where: { email: userEmail } }),
    prisma.enterpriseCatalogItem.findFirst({ where: { organizationId, code: "SHOP2-E2E-SKU", archivedAt: null } }),
    prisma.enterpriseSite.findFirst({ where: { organizationId, code: "SHOP2-E2E-SITE", archivedAt: null } }),
    prisma.enterpriseWarehouse.findFirst({ where: { organizationId, code: "SHOP2-E2E-WH", archivedAt: null } }),
    prisma.enterpriseUnitOfMeasure.findFirst({ where: { organizationId, code: "EA", archivedAt: null } }),
    prisma.enterpriseLedgerAccount.findFirst({ where: { organizationId, code: "SHOP2-TAX", archivedAt: null } }),
    prisma.enterpriseFinancialAccount.findFirst({ where: { organizationId, code: "SHOP2-E2E-CASH", archivedAt: null } }),
  ]);
  if (!admin || !user || !baseProduct || !site || !warehouse || !uom || !taxLedgerAccount || !cashAccount) {
    throw new Error("Shop 2 commercial seed requires the ERP and Shop 2 behavioral seeds first.");
  }

  await prisma.organizationMember.upsert({
    where: { organizationId_userId: { organizationId, userId: user.id } },
    update: { role: "OWNER", status: "ACTIVE", joinedAt: new Date(), removedAt: null },
    create: { organizationId, userId: user.id, role: "OWNER", status: "ACTIVE", joinedAt: new Date() },
  });

  const bankLedgerAccount = await prisma.enterpriseLedgerAccount.upsert({
    where: { organizationId_code: { organizationId, code: "SHOP2-BANK" } },
    update: { chartId: taxLedgerAccount.chartId, nameFr: "Banque Shop 2", nameEn: "Shop 2 bank", accountType: "ASSET", currencyCode, isActive: true, archivedAt: null, allowDirectPosting: true },
    create: { organizationId, chartId: taxLedgerAccount.chartId, code: "SHOP2-BANK", nameFr: "Banque Shop 2", nameEn: "Shop 2 bank", accountType: "ASSET", currencyCode, isActive: true, allowDirectPosting: true },
  });
  const refundBankAccount = await prisma.enterpriseFinancialAccount.upsert({
    where: { organizationId_code: { organizationId, code: "SHOP2-E2E-BANK" } },
    update: { name: "Shop 2 E2E Bank", accountType: "BANK", currencyCode, ledgerAccountId: bankLedgerAccount.id, siteId: site.id, status: "ACTIVE", archivedAt: null, openingBalance: 1000, operationalBalance: 1000, reconciledBalance: 1000, availableBalance: 1000 },
    create: { organizationId, code: "SHOP2-E2E-BANK", name: "Shop 2 E2E Bank", accountType: "BANK", currencyCode, openingBalance: 1000, operationalBalance: 1000, reconciledBalance: 1000, availableBalance: 1000, ledgerAccountId: bankLedgerAccount.id, siteId: site.id, responsibleUserId: admin.id, status: "ACTIVE" },
  });

  const zeroTax = await prisma.enterpriseTaxCode.upsert({
    where: { organizationId_code: { organizationId, code: "SHOP2-ZERO" } },
    update: { nameFr: "Taxe zéro Shop 2 E2E", nameEn: "Shop 2 E2E zero tax", category: "ZERO_RATED", payableAccountId: taxLedgerAccount.id, isActive: true },
    create: { organizationId, code: "SHOP2-ZERO", nameFr: "Taxe zéro Shop 2 E2E", nameEn: "Shop 2 E2E zero tax", category: "ZERO_RATED", payableAccountId: taxLedgerAccount.id, isActive: true },
  });
  await upsertTaxRate(zeroTax.id, 0, admin.id);
  await prisma.enterpriseCatalogItem.update({ where: { id: baseProduct.id }, data: { taxable: true, taxCode: zeroTax.code, indicativeSalePrice: 10, currency: currencyCode } });
  await upsertCatalogPrice(baseProduct.id, 10, false, admin.id);

  const vat = await prisma.enterpriseTaxCode.upsert({
    where: { organizationId_code: { organizationId, code: "SHOP2-VAT16" } },
    update: { nameFr: "TVA Shop 2 E2E 16 %", nameEn: "Shop 2 E2E VAT 16%", category: "VAT", payableAccountId: taxLedgerAccount.id, isActive: true },
    create: { organizationId, code: "SHOP2-VAT16", nameFr: "TVA Shop 2 E2E 16 %", nameEn: "Shop 2 E2E VAT 16%", category: "VAT", payableAccountId: taxLedgerAccount.id, isActive: true },
  });
  await upsertTaxRate(vat.id, 0.16, admin.id);

  const commercialProduct = await prisma.enterpriseCatalogItem.upsert({
    where: { organizationId_code: { organizationId, code: "SHOP2-COMMERCIAL-SKU" } },
    update: { sku: "SHOP2-COMMERCIAL-SKU", name: "Shop 2 Commercial Product", normalizedName: "shop 2 commercial product", itemType: "PRODUCT", unitOfMeasureId: uom.id, indicativeSalePrice: 116, indicativeCost: 50, currency: currencyCode, status: "ACTIVE", taxable: true, taxCode: vat.code, trackInventory: true, archivedAt: null },
    create: { organizationId, code: "SHOP2-COMMERCIAL-SKU", sku: "SHOP2-COMMERCIAL-SKU", name: "Shop 2 Commercial Product", normalizedName: "shop 2 commercial product", itemType: "PRODUCT", unitOfMeasureId: uom.id, indicativeSalePrice: 116, indicativeCost: 50, currency: currencyCode, status: "ACTIVE", taxable: true, taxCode: vat.code, trackInventory: true, createdByUserId: admin.id },
  });
  const commercialInventoryItem = await prisma.enterpriseInventoryItem.upsert({
    where: { organizationId_catalogItemId: { organizationId, catalogItemId: commercialProduct.id } },
    update: { status: "ACTIVE", allowNegativeStock: false, archivedAt: null },
    create: { organizationId, catalogItemId: commercialProduct.id, status: "ACTIVE", allowNegativeStock: false, createdByUserId: admin.id },
  });
  const commercialBalance = await prisma.enterpriseInventoryBalance.findFirst({
    where: { organizationId, inventoryItemId: commercialInventoryItem.id, warehouseId: warehouse.id, storageLocationId: null, stockLotId: null },
  });
  if (commercialBalance) {
    await prisma.enterpriseInventoryBalance.update({ where: { id: commercialBalance.id }, data: { quantityOnHand: 20, quantityReserved: 0 } });
  } else {
    await prisma.enterpriseInventoryBalance.create({ data: { organizationId, inventoryItemId: commercialInventoryItem.id, warehouseId: warehouse.id, quantityOnHand: 20, quantityReserved: 0 } });
  }
  const openingKey = `shop2-commercial-opening:${commercialInventoryItem.id}:${warehouse.id}`;
  let openingMovement = await prisma.enterpriseStockMovement.findFirst({ where: { organizationId, idempotencyKey: openingKey } });
  if (!openingMovement) {
    openingMovement = await prisma.enterpriseStockMovement.create({
      data: { organizationId, inventoryItemId: commercialInventoryItem.id, warehouseId: warehouse.id, movementType: "OPENING_BALANCE", direction: "IN", quantity: 20, balanceAfter: 20, idempotencyKey: openingKey, reason: "Shop 2 iteration 2 commercial acceptance opening stock", createdByUserId: admin.id },
    });
  }
  const existingCostLayer = await prisma.enterpriseInventoryCostLayer.findFirst({ where: { organizationId, sourceMovementId: openingMovement.id } });
  if (existingCostLayer) {
    await prisma.enterpriseInventoryCostLayer.update({ where: { id: existingCostLayer.id }, data: { quantity: 20, remainingQuantity: 20, unitCost: 50, totalCost: 1000, currencyCode, effectiveAt: new Date() } });
  } else {
    await prisma.enterpriseInventoryCostLayer.create({ data: { organizationId, inventoryItemId: commercialInventoryItem.id, warehouseId: warehouse.id, sourceMovementId: openingMovement.id, valuationMethod: "WEIGHTED_AVERAGE", quantity: 20, remainingQuantity: 20, unitCost: 50, totalCost: 1000, currencyCode, effectiveAt: new Date() } });
  }

  const commercialPrice = await upsertCatalogPrice(commercialProduct.id, 116, true, admin.id);
  await prisma.enterpriseRetailPriceCondition.upsert({
    where: { organizationId_id: { organizationId, id: "shop2-e2e-commercial-price-condition" } },
    update: { catalogPriceId: commercialPrice.id, siteId: site.id, customerBusinessPartyId: null, customerSegmentCode: null, minQuantity: 1, maxQuantity: null, channelCode: "POS", priority: 100, isActive: true, revision: { increment: 1 } },
    create: { id: "shop2-e2e-commercial-price-condition", organizationId, catalogPriceId: commercialPrice.id, siteId: site.id, minQuantity: 1, channelCode: "POS", priority: 100, isActive: true, createdByUserId: admin.id },
  });
  const promotion = await prisma.enterpriseRetailPromotion.upsert({
    where: { organizationId_code: { organizationId, code: "SHOP2-E2E-10PCT" } },
    update: { nameFr: "Remise E2E 10 %", nameEn: "E2E 10% discount", promotionType: "PERCENTAGE", status: "ACTIVE", priority: 100, stackMode: "EXCLUSIVE", siteId: site.id, currencyCode, startsAt: effectiveFrom, endsAt: null, conditionsJson: { productIds: [commercialProduct.id], minQuantity: 1 }, actionJson: { percent: 10 }, usageLimit: null, perCustomerLimit: null, archivedAt: null, updatedByUserId: admin.id, revision: { increment: 1 } },
    create: { organizationId, code: "SHOP2-E2E-10PCT", nameFr: "Remise E2E 10 %", nameEn: "E2E 10% discount", promotionType: "PERCENTAGE", status: "ACTIVE", priority: 100, stackMode: "EXCLUSIVE", siteId: site.id, currencyCode, startsAt: effectiveFrom, conditionsJson: { productIds: [commercialProduct.id], minQuantity: 1 }, actionJson: { percent: 10 }, createdByUserId: admin.id },
  });

  console.log(JSON.stringify({
    organizationId,
    adminUserId: admin.id,
    approverUserId: user.id,
    currencyCode,
    siteId: site.id,
    warehouseId: warehouse.id,
    cashAccountId: cashAccount.id,
    refundBankAccountId: refundBankAccount.id,
    zeroTaxCode: zeroTax.code,
    commercialTaxCode: vat.code,
    commercialCatalogItemId: commercialProduct.id,
    commercialCatalogItemCode: commercialProduct.code,
    commercialInventoryItemId: commercialInventoryItem.id,
    commercialPriceId: commercialPrice.id,
    promotionId: promotion.id,
    expectedUnitGrossTtc: "116.000000",
    expectedUnitCustomerDiscount: "11.600000",
    expectedUnitNetSubtotal: "100.000000",
    expectedUnitNetDiscount: "10.000000",
    expectedUnitTax: "14.400000",
    expectedUnitGrandTotal: "104.400000"
  }, null, 2));
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); });
