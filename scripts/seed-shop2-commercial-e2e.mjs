import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const organizationId = process.env.E2E_ORGANIZATION_ID || "e2e-erp-professional-org";
const adminEmail = (process.env.E2E_ADMIN_EMAIL || "erp-admin@example.test").toLowerCase();
const userEmail = (process.env.E2E_USER_EMAIL || "erp-user@example.test").toLowerCase();
const currencyCode = "USD";
const effectiveFrom = new Date("2026-01-01T00:00:00.000Z");

async function upsertTaxRate(taxCodeId, rate, actorUserId) {
  const existing = await prisma.enterpriseTaxRate.findFirst({
    where: { organizationId, taxCodeId, effectiveFrom },
  });
  if (existing) {
    return prisma.enterpriseTaxRate.update({
      where: { id: existing.id },
      data: { rate, effectiveTo: null, status: "ACTIVE", createdByUserId: actorUserId },
    });
  }
  return prisma.enterpriseTaxRate.create({
    data: { organizationId, taxCodeId, rate, effectiveFrom, status: "ACTIVE", createdByUserId: actorUserId },
  });
}

async function upsertCatalogPrice(catalogItemId, amount, taxIncluded, actorUserId) {
  const existing = await prisma.enterpriseCatalogPrice.findFirst({
    where: { organizationId, catalogItemId, priceType: "SALE", currency: currencyCode, effectiveFrom, archivedAt: null },
  });
  if (existing) {
    return prisma.enterpriseCatalogPrice.update({
      where: { id: existing.id },
      data: { amount, taxIncluded, effectiveUntil: null, status: "ACTIVE" },
    });
  }
  return prisma.enterpriseCatalogPrice.create({
    data: {
      organizationId,
      catalogItemId,
      priceType: "SALE",
      amount,
      currency: currencyCode,
      taxIncluded,
      effectiveFrom,
      status: "ACTIVE",
      createdByUserId: actorUserId,
    },
  });
}

async function main() {
  const [admin, user, baseProduct, site, uom, taxLedgerAccount, cashAccount] = await Promise.all([
    prisma.user.findUnique({ where: { email: adminEmail } }),
    prisma.user.findUnique({ where: { email: userEmail } }),
    prisma.enterpriseCatalogItem.findFirst({ where: { organizationId, code: "SHOP2-E2E-SKU", archivedAt: null } }),
    prisma.enterpriseSite.findFirst({ where: { organizationId, code: "SHOP2-E2E-SITE", archivedAt: null } }),
    prisma.enterpriseUnitOfMeasure.findFirst({ where: { organizationId, code: "EA", archivedAt: null } }),
    prisma.enterpriseLedgerAccount.findFirst({ where: { organizationId, code: "SHOP2-TAX", archivedAt: null } }),
    prisma.enterpriseFinancialAccount.findFirst({ where: { organizationId, code: "SHOP2-E2E-CASH", archivedAt: null } }),
  ]);
  if (!admin || !user || !baseProduct || !site || !uom || !taxLedgerAccount || !cashAccount) {
    throw new Error("Shop 2 commercial seed requires the ERP and Shop 2 behavioral seeds first.");
  }

  // A second authenticated organization member is required to prove independent return approval.
  await prisma.organizationMember.upsert({
    where: { organizationId_userId: { organizationId, userId: user.id } },
    update: { role: "OWNER", status: "ACTIVE", joinedAt: new Date(), removedAt: null },
    create: { organizationId, userId: user.id, role: "OWNER", status: "ACTIVE", joinedAt: new Date() },
  });

  const zeroTax = await prisma.enterpriseTaxCode.upsert({
    where: { organizationId_code: { organizationId, code: "SHOP2-ZERO" } },
    update: {
      nameFr: "Taxe zéro Shop 2 E2E",
      nameEn: "Shop 2 E2E zero tax",
      category: "ZERO_RATED",
      payableAccountId: taxLedgerAccount.id,
      isActive: true,
    },
    create: {
      organizationId,
      code: "SHOP2-ZERO",
      nameFr: "Taxe zéro Shop 2 E2E",
      nameEn: "Shop 2 E2E zero tax",
      category: "ZERO_RATED",
      payableAccountId: taxLedgerAccount.id,
      isActive: true,
    },
  });
  await upsertTaxRate(zeroTax.id, 0, admin.id);
  await prisma.enterpriseCatalogItem.update({
    where: { id: baseProduct.id },
    data: { taxable: true, taxCode: zeroTax.code, indicativeSalePrice: 10, currency: currencyCode },
  });
  await upsertCatalogPrice(baseProduct.id, 10, false, admin.id);

  const vat = await prisma.enterpriseTaxCode.upsert({
    where: { organizationId_code: { organizationId, code: "SHOP2-VAT16" } },
    update: {
      nameFr: "TVA Shop 2 E2E 16 %",
      nameEn: "Shop 2 E2E VAT 16%",
      category: "VAT",
      payableAccountId: taxLedgerAccount.id,
      isActive: true,
    },
    create: {
      organizationId,
      code: "SHOP2-VAT16",
      nameFr: "TVA Shop 2 E2E 16 %",
      nameEn: "Shop 2 E2E VAT 16%",
      category: "VAT",
      payableAccountId: taxLedgerAccount.id,
      isActive: true,
    },
  });
  await upsertTaxRate(vat.id, 0.16, admin.id);

  const commercialProduct = await prisma.enterpriseCatalogItem.upsert({
    where: { organizationId_code: { organizationId, code: "SHOP2-COMMERCIAL-SKU" } },
    update: {
      sku: "SHOP2-COMMERCIAL-SKU",
      name: "Shop 2 Commercial Product",
      normalizedName: "shop 2 commercial product",
      itemType: "PRODUCT",
      unitOfMeasureId: uom.id,
      indicativeSalePrice: 116,
      indicativeCost: 0,
      currency: currencyCode,
      status: "ACTIVE",
      taxable: true,
      taxCode: vat.code,
      trackInventory: false,
      archivedAt: null,
    },
    create: {
      organizationId,
      code: "SHOP2-COMMERCIAL-SKU",
      sku: "SHOP2-COMMERCIAL-SKU",
      name: "Shop 2 Commercial Product",
      normalizedName: "shop 2 commercial product",
      itemType: "PRODUCT",
      unitOfMeasureId: uom.id,
      indicativeSalePrice: 116,
      indicativeCost: 0,
      currency: currencyCode,
      status: "ACTIVE",
      taxable: true,
      taxCode: vat.code,
      trackInventory: false,
      createdByUserId: admin.id,
    },
  });
  const commercialPrice = await upsertCatalogPrice(commercialProduct.id, 116, true, admin.id);
  await prisma.enterpriseRetailPriceCondition.upsert({
    where: { organizationId_id: { organizationId, id: "shop2-e2e-commercial-price-condition" } },
    update: {
      catalogPriceId: commercialPrice.id,
      siteId: site.id,
      customerBusinessPartyId: null,
      customerSegmentCode: null,
      minQuantity: 1,
      maxQuantity: null,
      channelCode: "POS",
      priority: 100,
      isActive: true,
      revision: { increment: 1 },
    },
    create: {
      id: "shop2-e2e-commercial-price-condition",
      organizationId,
      catalogPriceId: commercialPrice.id,
      siteId: site.id,
      minQuantity: 1,
      channelCode: "POS",
      priority: 100,
      isActive: true,
      createdByUserId: admin.id,
    },
  });
  const promotion = await prisma.enterpriseRetailPromotion.upsert({
    where: { organizationId_code: { organizationId, code: "SHOP2-E2E-10PCT" } },
    update: {
      nameFr: "Remise E2E 10 %",
      nameEn: "E2E 10% discount",
      promotionType: "PERCENTAGE",
      status: "ACTIVE",
      priority: 100,
      stackMode: "EXCLUSIVE",
      siteId: site.id,
      currencyCode,
      startsAt: effectiveFrom,
      endsAt: null,
      conditionsJson: { productIds: [commercialProduct.id], minQuantity: 1 },
      actionJson: { percent: 10 },
      usageLimit: null,
      perCustomerLimit: null,
      archivedAt: null,
      updatedByUserId: admin.id,
      revision: { increment: 1 },
    },
    create: {
      organizationId,
      code: "SHOP2-E2E-10PCT",
      nameFr: "Remise E2E 10 %",
      nameEn: "E2E 10% discount",
      promotionType: "PERCENTAGE",
      status: "ACTIVE",
      priority: 100,
      stackMode: "EXCLUSIVE",
      siteId: site.id,
      currencyCode,
      startsAt: effectiveFrom,
      conditionsJson: { productIds: [commercialProduct.id], minQuantity: 1 },
      actionJson: { percent: 10 },
      createdByUserId: admin.id,
    },
  });

  console.log(JSON.stringify({
    organizationId,
    adminUserId: admin.id,
    approverUserId: user.id,
    currencyCode,
    siteId: site.id,
    cashAccountId: cashAccount.id,
    zeroTaxCode: zeroTax.code,
    commercialTaxCode: vat.code,
    commercialCatalogItemId: commercialProduct.id,
    commercialCatalogItemCode: commercialProduct.code,
    commercialPriceId: commercialPrice.id,
    promotionId: promotion.id,
    expectedGrossTtc: "116.000000",
    expectedCustomerDiscount: "11.600000",
    expectedNetSubtotal: "100.000000",
    expectedNetDiscount: "10.000000",
    expectedTax: "14.400000",
    expectedGrandTotal: "104.400000"
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
