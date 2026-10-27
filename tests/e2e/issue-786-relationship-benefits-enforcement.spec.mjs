import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const baseUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const organizationId = process.env.E2E_ORGANIZATION_ID || "e2e-erp-professional-org";
const adminEmail = process.env.E2E_ADMIN_EMAIL || "erp-admin@example.test";
const adminPassword = process.env.E2E_ADMIN_PASSWORD || "E2eAdmin2026!";
const userEmail = process.env.E2E_USER_EMAIL || "erp-user@example.test";
const userPassword = process.env.E2E_USER_PASSWORD || "E2eUser2026!";

const ids = {
  personIdentity: "e2e-786-person-identity",
  businessReference: "e2e-786-business-reference",
  identityLink: "e2e-786-identity-link",
};
const codes = {
  automatic: "E2E_786_RETAIL_STACK_5",
  exclusive: "E2E_786_RETAIL_EXCLUSIVE_30",
  manual: "E2E_786_MANUAL_SERVICE",
  fullReturn: "E2E_886_RETAIL_RETURN_QUOTA",
  omnichannel: "E2E_886_RETAIL_OMNICHANNEL_QUOTA",
  loyalty: "E2E_906_RETAIL_LOYALTY",
  cashback: "E2E_908_RETAIL_CASHBACK",
};

const fixture = {
  adminUserId: "",
  userId: "",
  customerBusinessPartyId: "",
  siteId: "",
  warehouseId: "",
  catalogItemId: "",
  inventoryItemId: "",
  cashAccountId: "",
  currencyCode: "USD",
};

function asNumber(value) {
  return Number(value?.toString?.() ?? value ?? 0);
}

async function readJson(response) {
  const body = await response.json().catch(() => null);
  return { response, body };
}

async function signIn(page, email, password, next) {
  const response = await page.context().request.post(`${baseUrl}/api/auth/sign-in`, {
    data: { email, password, organizationId, next },
    headers: {
      origin: baseUrl,
      referer: `${baseUrl}/auth/sign-in`,
      "x-forwarded-for": email === adminEmail ? "203.0.113.86" : "203.0.113.87",
    },
  });
  const body = await response.json().catch(() => null);
  expect(response.ok(), `Hotfix #786 sign-in failed for ${email}: ${JSON.stringify(body)}`).toBeTruthy();
  await page.goto(next);
  await page.waitForLoadState("networkidle");
}

async function post(page, path, data, referer = "/enterprise-relationship-benefits") {
  return readJson(
    await page.context().request.post(path, {
      data,
      headers: { origin: baseUrl, referer: `${baseUrl}${referer}` },
    }),
  );
}

async function patch(page, path, data, referer = "/enterprise-relationship-benefits") {
  return readJson(
    await page.context().request.patch(path, {
      data,
      headers: { origin: baseUrl, referer: `${baseUrl}${referer}` },
    }),
  );
}

async function get(page, path) {
  return readJson(await page.context().request.get(path));
}

async function cleanupFixture() {
  const benefits = await prisma.enterpriseRelationshipBenefit.findMany({
    where: { organizationId, code: { in: [codes.automatic, codes.exclusive, codes.manual, codes.fullReturn, codes.omnichannel, codes.loyalty, codes.cashback] } },
    select: { id: true },
  });
  const benefitIds = benefits.map((item) => item.id);
  await prisma.enterpriseRelationshipBenefitUsage.deleteMany({
    where: {
      organizationId,
      OR: [
        { benefitId: { in: benefitIds.length ? benefitIds : ["__none__"] } },
        { identityLinkId: ids.identityLink },
      ],
    },
  });
  if (benefitIds.length) {
    await prisma.enterpriseRelationshipBenefitAssignment.deleteMany({
      where: { organizationId, benefitId: { in: benefitIds } },
    });
    await prisma.enterpriseRelationshipBenefitAudience.deleteMany({
      where: { organizationId, benefitId: { in: benefitIds } },
    });
    await prisma.enterpriseRelationshipBenefit.deleteMany({
      where: { organizationId, id: { in: benefitIds } },
    });
  }
  const loyaltyPrograms = await prisma.enterpriseRetailLoyaltyProgram.findMany({
    where: { organizationId, code: codes.loyalty }, select: { id: true },
  });
  if (loyaltyPrograms.length) {
    const programIds = loyaltyPrograms.map((item) => item.id);
    const accounts = await prisma.enterpriseRetailLoyaltyAccount.findMany({
      where: { organizationId, programId: { in: programIds } }, select: { id: true },
    });
    await prisma.enterpriseRetailLoyaltyEntry.deleteMany({
      where: { organizationId, accountId: { in: accounts.map((item) => item.id) } },
    });
    await prisma.enterpriseRetailLoyaltyAccount.deleteMany({ where: { organizationId, programId: { in: programIds } } });
    await prisma.enterpriseRetailLoyaltyProgram.deleteMany({ where: { organizationId, id: { in: programIds } } });
  }
  await prisma.enterpriseIdentityConsentRecord.deleteMany({
    where: { organizationId, identityLinkId: ids.identityLink },
  });
  await prisma.enterpriseIdentityLinkEvent.deleteMany({
    where: { organizationId, identityLinkId: ids.identityLink },
  });
  await prisma.enterpriseIdentityLink.deleteMany({
    where: { organizationId, id: ids.identityLink },
  });
  await prisma.enterprisePersonBusinessReference.deleteMany({
    where: { organizationId, id: ids.businessReference },
  });
  await prisma.enterprisePersonIdentity.deleteMany({
    where: { organizationId, id: ids.personIdentity },
  });
}

async function prepareFixture() {
  await cleanupFixture();

  const [admin, user, customer, site, warehouse, product, inventoryItem, cashAccount, relationshipModule, retailModule] =
    await Promise.all([
      prisma.user.findUnique({ where: { email: adminEmail } }),
      prisma.user.findUnique({ where: { email: userEmail } }),
      prisma.enterpriseBusinessParty.findUnique({ where: { id: "e2e-baseline-business-party" } }),
      prisma.enterpriseSite.findFirst({
        where: { organizationId, code: "SHOP2-E2E-SITE", status: "ACTIVE", archivedAt: null },
      }),
      prisma.enterpriseWarehouse.findFirst({
        where: { organizationId, code: "SHOP2-E2E-WH", status: "ACTIVE", archivedAt: null },
      }),
      prisma.enterpriseCatalogItem.findFirst({
        where: { organizationId, code: "SHOP2-COMMERCIAL-SKU", status: "ACTIVE", archivedAt: null },
      }),
      prisma.enterpriseInventoryItem.findFirst({
        where: {
          organizationId,
          catalogItem: { code: "SHOP2-COMMERCIAL-SKU" },
          status: "ACTIVE",
          archivedAt: null,
        },
      }),
      prisma.enterpriseFinancialAccount.findFirst({
        where: { organizationId, code: "SHOP2-E2E-CASH", status: "ACTIVE", archivedAt: null },
      }),
      prisma.enterpriseModule.findUnique({
        where: { organizationId_moduleCode: { organizationId, moduleCode: "RELATIONSHIP_BENEFITS" } },
      }),
      prisma.enterpriseModule.findUnique({
        where: { organizationId_moduleCode: { organizationId, moduleCode: "RETAIL_POS" } },
      }),
    ]);

  if (!admin || !user || !customer || !site || !warehouse || !product || !inventoryItem || !cashAccount) {
    throw new Error("Hotfix #786 E2E requires ERP + Shop 2 behavioral + Shop 2 commercial seeds.");
  }
  if (!relationshipModule?.isEnabled || !retailModule?.isEnabled) {
    throw new Error("Hotfix #786 E2E requires RELATIONSHIP_BENEFITS and RETAIL_POS enabled.");
  }
  if (customer.organizationId !== organizationId || customer.status !== "ACTIVE" || customer.archivedAt) {
    throw new Error("Hotfix #786 E2E customer fixture is not active in the expected tenant.");
  }

  Object.assign(fixture, {
    adminUserId: admin.id,
    userId: user.id,
    customerBusinessPartyId: customer.id,
    siteId: site.id,
    warehouseId: warehouse.id,
    catalogItemId: product.id,
    inventoryItemId: inventoryItem.id,
    cashAccountId: cashAccount.id,
  });

  await prisma.enterprisePersonIdentity.create({
    data: {
      id: ids.personIdentity,
      organizationId,
      displayName: "Client relationnel E2E #786",
      primaryEmail: user.email,
      status: "ACTIVE",
      createdByUserId: admin.id,
    },
  });
  await prisma.enterprisePersonBusinessReference.create({
    data: {
      id: ids.businessReference,
      organizationId,
      personIdentityId: ids.personIdentity,
      businessPartyId: customer.id,
      relationType: "CUSTOMER",
      status: "ACTIVE",
      createdByUserId: admin.id,
    },
  });
  await prisma.enterpriseIdentityLink.create({
    data: {
      id: ids.identityLink,
      organizationId,
      personIdentityId: ids.personIdentity,
      userId: user.id,
      origin: "ENTERPRISE",
      requestedRelationType: "CUSTOMER",
      status: "ACTIVE",
      initiatedByUserId: admin.id,
      reviewedByUserId: admin.id,
      purpose: "Hotfix #786 Retail relationship benefit enforcement",
      consentTextVersion: "enterprise-identity-consent-v1",
      userDecisionAt: new Date(),
      organizationDecisionAt: new Date(),
      activatedAt: new Date(),
    },
  });
}

async function ensureOpenTill(page) {
  const existing = await prisma.enterpriseCashSession.findFirst({
    where: {
      organizationId,
      financialAccountId: fixture.cashAccountId,
      cashierUserId: fixture.adminUserId,
      status: "OPEN",
    },
    orderBy: { openedAt: "desc" },
  });
  if (existing) return existing;
  const opened = await post(
    page,
    `/api/enterprise/${organizationId}/retail/cash-sessions`,
    { financialAccountId: fixture.cashAccountId, openingAmount: 1000 },
    "/enterprise-modules/RETAIL_POS",
  );
  expect(opened.response.ok(), JSON.stringify(opened.body)).toBeTruthy();
  return opened.body?.session || opened.body;
}

test.describe.serial("Hotfix #786 relationship benefit enforcement", () => {
  test.beforeAll(async () => {
    await prepareFixture();
  });

  test.afterAll(async () => {
    await cleanupFixture();
    await prisma.$disconnect();
  });

  test("applies a real Retail benefit, persists one effect, frees quota on reversal and stops after revocation", async ({ browser }) => {
    const adminContext = await browser.newContext({ baseURL: baseUrl, viewport: { width: 390, height: 844 } });
    const admin = await adminContext.newPage();
    await signIn(admin, adminEmail, adminPassword, "/enterprise-relationship-benefits");
    await expect(admin.getByRole("heading", { name: /Relations & avantages|Relationships & benefits/i })).toBeVisible();
    const adminOverflow = await admin.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(adminOverflow, "Hotfix #786 admin workspace must not overflow at 390px").toBeLessThanOrEqual(2);

    await ensureOpenTill(admin);

    const baseline = await post(
      admin,
      `/api/enterprise/${organizationId}/retail/pricing/preview`,
      {
        siteId: fixture.siteId,
        customerBusinessPartyId: fixture.customerBusinessPartyId,
        currencyCode: fixture.currencyCode,
        channelCode: "POS",
        lines: [{ catalogItemId: fixture.catalogItemId, quantity: 1 }],
      },
      "/enterprise-modules/RETAIL_POS",
    );
    expect(baseline.response.ok(), JSON.stringify(baseline.body)).toBeTruthy();
    expect(baseline.body.relationshipBenefits || []).toHaveLength(0);
    const baselineTotal = asNumber(baseline.body.grandTotal);
    expect(baselineTotal).toBeGreaterThan(100);

    const created = await post(admin, `/api/enterprise/${organizationId}/relationship-benefits`, {
      code: codes.automatic,
      nameFr: "Remise relationnelle E2E 5 %",
      nameEn: "E2E relationship 5% discount",
      descriptionFr: "Remise réellement appliquée au ticket Retail par le serveur.",
      descriptionEn: "Discount actually applied to the Retail receipt by the server.",
      benefitType: "DISCOUNT",
      assignmentMode: "AUTOMATIC",
      relationTypes: ["CUSTOMER"],
      identityLinkIds: [],
      valueType: "PERCENT",
      valueDecimal: 5,
      currencyCode: fixture.currencyCode,
      minimumAmount: 100,
      actionCode: "NONE",
      targetModuleCode: "RETAIL_POS",
      usageLimitTotal: 1,
      usageLimitPerPeriod: 1,
      usagePeriodDays: 30,
      stackable: true,
      status: "ACTIVE",
      conditions: {
        channelCodes: ["POS"],
        catalogItemIds: [fixture.catalogItemId],
        minimumQuantity: 1,
      },
    });
    expect(created.response.status(), JSON.stringify(created.body)).toBe(201);
    const benefitId = created.body.benefit.id;

    const belowMinimum = await post(
      admin,
      `/api/enterprise/${organizationId}/retail/pricing/preview`,
      {
        siteId: fixture.siteId,
        customerBusinessPartyId: fixture.customerBusinessPartyId,
        currencyCode: fixture.currencyCode,
        channelCode: "POS",
        lines: [{ catalogItemId: fixture.catalogItemId, quantity: 0.5 }],
      },
      "/enterprise-modules/RETAIL_POS",
    );
    expect(belowMinimum.response.ok(), JSON.stringify(belowMinimum.body)).toBeTruthy();
    expect((belowMinimum.body.relationshipBenefits || []).some((item) => item.benefitId === benefitId)).toBe(false);

    const eligible = await post(
      admin,
      `/api/enterprise/${organizationId}/retail/pricing/preview`,
      {
        siteId: fixture.siteId,
        customerBusinessPartyId: fixture.customerBusinessPartyId,
        currencyCode: fixture.currencyCode,
        channelCode: "POS",
        lines: [{ catalogItemId: fixture.catalogItemId, quantity: 1 }],
      },
      "/enterprise-modules/RETAIL_POS",
    );
    expect(eligible.response.ok(), JSON.stringify(eligible.body)).toBeTruthy();
    expect(eligible.body.relationshipBenefits.some((item) => item.benefitId === benefitId)).toBe(true);
    expect(
      eligible.body.lines?.[0]?.promotions?.some(
        (promotion) => promotion.code === "SHOP2-E2E-10PCT",
      ),
    ).toBe(true);
    const eligibleTotal = asNumber(eligible.body.grandTotal);
    expect(eligibleTotal).toBeLessThan(baselineTotal);
    expect(eligibleTotal).toBeGreaterThan(0);

    const saleKey = `e2e-786-sale-${Date.now()}`;
    const salePayload = {
      siteId: fixture.siteId,
      warehouseId: fixture.warehouseId,
      storageLocationId: null,
      customerBusinessPartyId: fixture.customerBusinessPartyId,
      currencyCode: fixture.currencyCode,
      idempotencyKey: saleKey,
      lines: [{
        catalogItemId: fixture.catalogItemId,
        inventoryItemId: fixture.inventoryItemId,
        quantity: 1,
        unitPrice: 116,
        discountAmount: 0,
        taxAmount: 0,
      }],
      tenders: [{
        methodType: "CASH",
        financialAccountId: fixture.cashAccountId,
        amount: eligibleTotal,
        reference: "E2E-786-BENEFIT",
      }],
    };
    const sale = await post(
      admin,
      `/api/enterprise/${organizationId}/retail/sales`,
      salePayload,
      "/enterprise-modules/RETAIL_POS",
    );
    expect(sale.response.status(), JSON.stringify(sale.body)).toBe(201);
    expect(sale.body.sale.customerBusinessPartyId).toBe(fixture.customerBusinessPartyId);
    expect(asNumber(sale.body.sale.grandTotal)).toBeCloseTo(eligibleTotal, 5);
    expect(sale.body.commercial.relationshipBenefitCount).toBe(1);
    expect(sale.body.relationshipBenefits.some((item) => item.benefitId === benefitId)).toBe(true);

    const usagesAfterSale = await prisma.enterpriseRelationshipBenefitUsage.findMany({
      where: {
        organizationId,
        benefitId,
        identityLinkId: ids.identityLink,
        effectEntityId: sale.body.sale.id,
      },
    });
    expect(usagesAfterSale).toHaveLength(1);
    expect(usagesAfterSale[0].executionMode).toBe("AUTO_RETAIL");
    expect(usagesAfterSale[0].status).toBe("CONSUMED");
    expect(usagesAfterSale[0].effectModuleCode).toBe("RETAIL_POS");
    expect(usagesAfterSale[0].effectEntityType).toBe("EnterpriseRetailSale");
    expect(usagesAfterSale[0].effectCurrencyCode).toBe(fixture.currencyCode);
    expect(asNumber(usagesAfterSale[0].effectAmount)).toBeGreaterThan(0);

    const replay = await post(
      admin,
      `/api/enterprise/${organizationId}/retail/sales`,
      salePayload,
      "/enterprise-modules/RETAIL_POS",
    );
    expect(replay.response.status(), JSON.stringify(replay.body)).toBe(200);
    expect(replay.body.idempotent).toBe(true);
    const usageCountAfterReplay = await prisma.enterpriseRelationshipBenefitUsage.count({
      where: { organizationId, benefitId, effectEntityId: sale.body.sale.id },
    });
    expect(usageCountAfterReplay).toBe(1);

    const quotaBlocked = await post(
      admin,
      `/api/enterprise/${organizationId}/retail/pricing/preview`,
      {
        siteId: fixture.siteId,
        customerBusinessPartyId: fixture.customerBusinessPartyId,
        currencyCode: fixture.currencyCode,
        channelCode: "POS",
        lines: [{ catalogItemId: fixture.catalogItemId, quantity: 1 }],
      },
      "/enterprise-modules/RETAIL_POS",
    );
    expect(quotaBlocked.response.ok(), JSON.stringify(quotaBlocked.body)).toBeTruthy();
    expect((quotaBlocked.body.relationshipBenefits || []).some((item) => item.benefitId === benefitId)).toBe(false);

    const reversed = await post(
      admin,
      `/api/enterprise/${organizationId}/retail/sales/${sale.body.sale.id}/reverse`,
      { revision: sale.body.sale.revision, reason: "Hotfix #786 quota release verification" },
      "/enterprise-modules/RETAIL_POS",
    );
    expect(reversed.response.ok(), JSON.stringify(reversed.body)).toBeTruthy();
    const reversedUsage = await prisma.enterpriseRelationshipBenefitUsage.findFirstOrThrow({
      where: { organizationId, benefitId, effectEntityId: sale.body.sale.id },
    });
    expect(reversedUsage.status).toBe("CANCELLED");

    const afterReversal = await post(
      admin,
      `/api/enterprise/${organizationId}/retail/pricing/preview`,
      {
        siteId: fixture.siteId,
        customerBusinessPartyId: fixture.customerBusinessPartyId,
        currencyCode: fixture.currencyCode,
        channelCode: "POS",
        lines: [{ catalogItemId: fixture.catalogItemId, quantity: 1 }],
      },
      "/enterprise-modules/RETAIL_POS",
    );
    expect(afterReversal.response.ok(), JSON.stringify(afterReversal.body)).toBeTruthy();
    expect(afterReversal.body.relationshipBenefits.some((item) => item.benefitId === benefitId)).toBe(true);

    const exclusive = await post(admin, `/api/enterprise/${organizationId}/relationship-benefits`, {
      code: codes.exclusive,
      nameFr: "Remise relationnelle exclusive E2E 30 %",
      nameEn: "E2E exclusive relationship 30% discount",
      descriptionFr: "Remise non cumulable qui doit remplacer les règles Retail moins favorables.",
      descriptionEn: "Non-stackable discount that must replace less favorable Retail rules.",
      benefitType: "DISCOUNT",
      assignmentMode: "AUTOMATIC",
      relationTypes: ["CUSTOMER"],
      identityLinkIds: [],
      valueType: "PERCENT",
      valueDecimal: 30,
      currencyCode: fixture.currencyCode,
      actionCode: "NONE",
      targetModuleCode: "RETAIL_POS",
      stackable: false,
      status: "ACTIVE",
      conditions: {
        channelCodes: ["POS"],
        catalogItemIds: [fixture.catalogItemId],
      },
    });
    expect(exclusive.response.status(), JSON.stringify(exclusive.body)).toBe(201);
    const exclusiveBenefitId = exclusive.body.benefit.id;

    const exclusivePreview = await post(
      admin,
      `/api/enterprise/${organizationId}/retail/pricing/preview`,
      {
        siteId: fixture.siteId,
        customerBusinessPartyId: fixture.customerBusinessPartyId,
        currencyCode: fixture.currencyCode,
        channelCode: "POS",
        lines: [{ catalogItemId: fixture.catalogItemId, quantity: 1 }],
      },
      "/enterprise-modules/RETAIL_POS",
    );
    expect(exclusivePreview.response.ok(), JSON.stringify(exclusivePreview.body)).toBeTruthy();
    expect(exclusivePreview.body.relationshipBenefits.map((item) => item.benefitId)).toEqual([exclusiveBenefitId]);
    expect(exclusivePreview.body.lines?.[0]?.promotions || []).toHaveLength(0);
    expect(asNumber(exclusivePreview.body.grandTotal)).toBeLessThan(asNumber(afterReversal.body.grandTotal));

    const exclusiveTotal = asNumber(exclusivePreview.body.grandTotal);
    const exclusiveSaleKey = `e2e-786-exclusive-sale-${Date.now()}`;
    const exclusiveSalePayload = {
      siteId: fixture.siteId,
      warehouseId: fixture.warehouseId,
      storageLocationId: null,
      customerBusinessPartyId: fixture.customerBusinessPartyId,
      currencyCode: fixture.currencyCode,
      idempotencyKey: exclusiveSaleKey,
      lines: [{
        catalogItemId: fixture.catalogItemId,
        inventoryItemId: fixture.inventoryItemId,
        quantity: 1,
        unitPrice: 116,
        discountAmount: 0,
        taxAmount: 0,
      }],
      tenders: [{
        methodType: "CASH",
        financialAccountId: fixture.cashAccountId,
        amount: exclusiveTotal,
        reference: "E2E-786-EXCLUSIVE",
      }],
    };
    const exclusiveSale = await post(
      admin,
      `/api/enterprise/${organizationId}/retail/sales`,
      exclusiveSalePayload,
      "/enterprise-modules/RETAIL_POS",
    );
    expect(exclusiveSale.response.status(), JSON.stringify(exclusiveSale.body)).toBe(201);
    expect(exclusiveSale.body.commercial.promotionCount).toBe(0);
    expect(exclusiveSale.body.relationshipBenefits.map((item) => item.benefitId)).toEqual([exclusiveBenefitId]);

    const exclusiveUsagesBeforeReplay = await prisma.enterpriseRelationshipBenefitUsage.findMany({
      where: {
        organizationId,
        effectEntityId: exclusiveSale.body.sale.id,
        executionMode: "AUTO_RETAIL",
      },
    });
    expect(exclusiveUsagesBeforeReplay).toHaveLength(1);
    expect(exclusiveUsagesBeforeReplay[0].benefitId).toBe(exclusiveBenefitId);
    expect(exclusiveUsagesBeforeReplay[0].status).toBe("CONSUMED");
    expect(
      await prisma.enterpriseRetailPromotionRedemption.count({
        where: { organizationId, saleId: exclusiveSale.body.sale.id },
      }),
    ).toBe(0);

    const exclusiveReplay = await post(
      admin,
      `/api/enterprise/${organizationId}/retail/sales`,
      exclusiveSalePayload,
      "/enterprise-modules/RETAIL_POS",
    );
    expect(exclusiveReplay.response.status(), JSON.stringify(exclusiveReplay.body)).toBe(200);
    expect(exclusiveReplay.body.idempotent).toBe(true);
    expect(exclusiveReplay.body.commercial.promotionCount).toBe(0);
    expect(exclusiveReplay.body.relationshipBenefits.map((item) => item.benefitId)).toEqual([exclusiveBenefitId]);
    const exclusiveUsagesAfterReplay = await prisma.enterpriseRelationshipBenefitUsage.findMany({
      where: {
        organizationId,
        effectEntityId: exclusiveSale.body.sale.id,
        executionMode: "AUTO_RETAIL",
      },
    });
    expect(exclusiveUsagesAfterReplay).toHaveLength(1);
    expect(exclusiveUsagesAfterReplay[0].benefitId).toBe(exclusiveBenefitId);
    expect(
      exclusiveUsagesAfterReplay.some((usage) => usage.benefitId === benefitId),
      "Replay must not attach a newly re-resolved stackable benefit to the historical exclusive sale",
    ).toBe(false);
    expect(
      await prisma.enterpriseRetailPromotionRedemption.count({
        where: { organizationId, saleId: exclusiveSale.body.sale.id },
      }),
      "Replay must not add a Retail promotion that was excluded from the committed sale",
    ).toBe(0);

    const exclusiveReverse = await post(
      admin,
      `/api/enterprise/${organizationId}/retail/sales/${exclusiveSale.body.sale.id}/reverse`,
      {
        revision: exclusiveSale.body.sale.revision,
        reason: "Hotfix #786 immutable replay verification",
      },
      "/enterprise-modules/RETAIL_POS",
    );
    expect(exclusiveReverse.response.ok(), JSON.stringify(exclusiveReverse.body)).toBeTruthy();

    const suspendedExclusive = await patch(
      admin,
      `/api/enterprise/${organizationId}/relationship-benefits/${exclusiveBenefitId}`,
      { revision: exclusive.body.benefit.revision, status: "SUSPENDED" },
    );
    expect(suspendedExclusive.response.ok(), JSON.stringify(suspendedExclusive.body)).toBeTruthy();
    expect(suspendedExclusive.body.benefit.status).toBe("SUSPENDED");
    // A status-only PATCH must not inherit create-schema defaults or mutate
    // the certified adapter/discount configuration of a persisted benefit.
    const suspendedPersisted = await prisma.enterpriseRelationshipBenefit.findFirstOrThrow({
      where: { id: exclusiveBenefitId, organizationId },
    });
    expect(suspendedPersisted.valueType).toBe("PERCENT");
    expect(Number(suspendedPersisted.valueDecimal)).toBe(30);
    expect(suspendedPersisted.actionCode).toBe("NONE");
    expect(suspendedPersisted.stackable).toBe(false);
    expect(suspendedPersisted.targetModuleCode).toBe("RETAIL_POS");

    const userContext = await browser.newContext({ baseURL: baseUrl, viewport: { width: 390, height: 844 } });
    const user = await userContext.newPage();
    await signIn(user, userEmail, userPassword, `/enterprise-links?link=${ids.identityLink}&view=ACTIVE`);
    await expect(user.getByText(/Vos services et avantages disponibles|Your available services and benefits/i)).toBeVisible();
    // The same benefit name can legitimately appear in both the available
    // benefits catalogue and the consumption history. Assert the catalogue
    // card through its description instead of matching both headings.
    const availableBenefitCard = user.getByRole("article").filter({
      hasText: /Remise réellement appliquée au ticket Retail par le serveur|Discount actually applied to the Retail receipt by the server/i,
    });
    await expect(
      availableBenefitCard.getByRole("heading", {
        name: /Remise relationnelle E2E 5 %|E2E relationship 5% discount/i,
      }),
    ).toBeVisible();
    const userOverflow = await user.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(userOverflow, "Hotfix #786 account relationship UI must not overflow at 390px").toBeLessThanOrEqual(2);

    const forged = await post(
      user,
      `/api/account/enterprise-relationships/${organizationId}/benefits`,
      {
        identityLinkId: ids.identityLink,
        benefitId,
        idempotencyKey: `e2e-786-forged-${Date.now()}`,
        context: {
          moduleCode: "RETAIL_POS",
          transactionAmount: 999999,
          currencyCode: fixture.currencyCode,
          businessPartyId: fixture.customerBusinessPartyId,
        },
      },
      "/enterprise-links",
    );
    expect(forged.response.status()).toBe(400);
    expect(forged.body.error).toBe("RELATIONSHIP_BENEFIT_USAGE_INPUT_INVALID");

    const linkBeforeRevoke = await prisma.enterpriseIdentityLink.findUniqueOrThrow({ where: { id: ids.identityLink } });
    const revoke = await post(
      user,
      "/api/account/identity-links/decision",
      {
        action: "REVOKE",
        linkId: ids.identityLink,
        revision: linkBeforeRevoke.revision,
        reason: "Hotfix #786 immediate revocation verification",
      },
      "/enterprise-links",
    );
    expect(revoke.response.ok(), JSON.stringify(revoke.body)).toBeTruthy();

    const afterRevocation = await post(
      admin,
      `/api/enterprise/${organizationId}/retail/pricing/preview`,
      {
        siteId: fixture.siteId,
        customerBusinessPartyId: fixture.customerBusinessPartyId,
        currencyCode: fixture.currencyCode,
        channelCode: "POS",
        lines: [{ catalogItemId: fixture.catalogItemId, quantity: 1 }],
      },
      "/enterprise-modules/RETAIL_POS",
    );
    expect(afterRevocation.response.ok(), JSON.stringify(afterRevocation.body)).toBeTruthy();
    expect((afterRevocation.body.relationshipBenefits || []).some((item) => item.benefitId === benefitId)).toBe(false);

    const accountAfterRevocation = await get(
      user,
      `/api/account/enterprise-relationships/${organizationId}/benefits?identityLinkId=${ids.identityLink}`,
    );
    expect(accountAfterRevocation.response.ok(), JSON.stringify(accountAfterRevocation.body)).toBeTruthy();
    expect(accountAfterRevocation.body.access.allowed).toBe(false);
    expect(accountAfterRevocation.body.items).toEqual([]);

    await userContext.close();
    await adminContext.close();
  });

  test("keeps manual requests distinct from verified consumption and fails closed on unsupported targets", async ({ browser }) => {
    await prisma.enterpriseIdentityLink.update({
      where: { id: ids.identityLink },
      data: {
        status: "ACTIVE",
        revokedAt: null,
        revocationReason: null,
        userDecisionAt: new Date(),
        organizationDecisionAt: new Date(),
        activatedAt: new Date(),
        requestedRoleCode: null,
        revision: { increment: 1 },
      },
    });

    const adminContext = await browser.newContext({ baseURL: baseUrl });
    const admin = await adminContext.newPage();
    await signIn(admin, adminEmail, adminPassword, "/enterprise-relationship-benefits");

    const unsupported = await post(admin, `/api/enterprise/${organizationId}/relationship-benefits`, {
      code: `E2E_786_UNSUPPORTED_${Date.now()}`,
      nameFr: "Réservation non certifiée",
      nameEn: "Uncertified booking",
      descriptionFr: "Doit être refusée si une cible métier non certifiée est fournie.",
      descriptionEn: "Must fail when an uncertified business target is supplied.",
      benefitType: "BOOKING",
      assignmentMode: "AUTOMATIC",
      relationTypes: ["CUSTOMER"],
      identityLinkIds: [],
      valueType: "NONE",
      actionCode: "BOOK",
      targetModuleCode: "RETAIL_POS",
      stackable: false,
      status: "ACTIVE",
    });
    expect(unsupported.response.status(), JSON.stringify(unsupported.body)).toBe(409);
    expect(unsupported.body.error).toBe("RELATIONSHIP_BENEFIT_TARGET_ADAPTER_UNSUPPORTED");

    const manual = await post(admin, `/api/enterprise/${organizationId}/relationship-benefits`, {
      code: codes.manual,
      nameFr: "Service relationnel sur demande",
      nameEn: "Relationship service on request",
      descriptionFr: "Demande approuvable sans prétendre que le service a déjà été exécuté.",
      descriptionEn: "Approachable request without claiming the service has already been executed.",
      benefitType: "FREE_SERVICE",
      assignmentMode: "AUTOMATIC",
      relationTypes: ["CUSTOMER"],
      audienceRoleCode: "LOYAL_CUSTOMER",
      identityLinkIds: [],
      valueType: "NONE",
      actionCode: "REQUEST",
      actionLabelFr: "Demander le service",
      actionLabelEn: "Request service",
      targetModuleCode: null,
      stackable: false,
      status: "ACTIVE",
    });
    expect(manual.response.status(), JSON.stringify(manual.body)).toBe(201);
    const manualBenefitId = manual.body.benefit.id;

    const userContext = await browser.newContext({ baseURL: baseUrl });
    const user = await userContext.newPage();
    await signIn(user, userEmail, userPassword, "/enterprise-links");

    const roleMismatchSnapshot = await get(
      user,
      `/api/account/enterprise-relationships/${organizationId}/benefits?identityLinkId=${ids.identityLink}`,
    );
    expect(roleMismatchSnapshot.response.ok(), JSON.stringify(roleMismatchSnapshot.body)).toBeTruthy();
    expect(roleMismatchSnapshot.body.items.some((item) => item.id === manualBenefitId)).toBe(false);

    await prisma.enterpriseIdentityLink.update({
      where: { id: ids.identityLink },
      data: {
        requestedRoleCode: "LOYAL_CUSTOMER",
        revision: { increment: 1 },
      },
    });

    const roleMatchSnapshot = await get(
      user,
      `/api/account/enterprise-relationships/${organizationId}/benefits?identityLinkId=${ids.identityLink}`,
    );
    expect(roleMatchSnapshot.response.ok(), JSON.stringify(roleMatchSnapshot.body)).toBeTruthy();
    expect(roleMatchSnapshot.body.items.some((item) => item.id === manualBenefitId)).toBe(true);

    const requestKey = `e2e-786-manual-${Date.now()}`;
    const requested = await post(
      user,
      `/api/account/enterprise-relationships/${organizationId}/benefits`,
      {
        identityLinkId: ids.identityLink,
        benefitId: manualBenefitId,
        idempotencyKey: requestKey,
        note: "Demande manuelle E2E #786",
      },
      "/enterprise-links",
    );
    expect(requested.response.status(), JSON.stringify(requested.body)).toBe(201);
    expect(requested.body.usage.status).toBe("REQUESTED");

    const replay = await post(
      user,
      `/api/account/enterprise-relationships/${organizationId}/benefits`,
      {
        identityLinkId: ids.identityLink,
        benefitId: manualBenefitId,
        idempotencyKey: requestKey,
        note: "Demande manuelle E2E #786",
      },
      "/enterprise-links",
    );
    expect([200, 201]).toContain(replay.response.status());
    const requestCount = await prisma.enterpriseRelationshipBenefitUsage.count({
      where: { organizationId, benefitId: manualBenefitId, idempotencyKey: requestKey },
    });
    expect(requestCount).toBe(1);

    const approved = await patch(
      admin,
      `/api/enterprise/${organizationId}/relationship-benefits/usages/${requested.body.usage.id}`,
      { revision: requested.body.usage.revision, status: "APPROVED" },
    );
    expect(approved.response.ok(), JSON.stringify(approved.body)).toBeTruthy();
    expect(approved.body.usage.status).toBe("APPROVED");
    expect(approved.body.usage.executedAt).toBeNull();
    expect(approved.body.usage.effectEntityId).toBeNull();

    const fakeConsumed = await patch(
      admin,
      `/api/enterprise/${organizationId}/relationship-benefits/usages/${requested.body.usage.id}`,
      { revision: approved.body.usage.revision, status: "CONSUMED" },
    );
    expect(fakeConsumed.response.status()).toBe(400);
    expect(fakeConsumed.body.error).toBe("RELATIONSHIP_BENEFIT_USAGE_INPUT_INVALID");

    const crossTenant = await get(
      user,
      `/api/account/enterprise-relationships/not-this-tenant/benefits?identityLinkId=${ids.identityLink}`,
    );
    expect(crossTenant.response.ok()).toBeTruthy();
    expect(crossTenant.body.items).toEqual([]);
    expect(crossTenant.body.requests).toEqual([]);
    expect(crossTenant.body.retail).toBeNull();

    await userContext.close();
    await adminContext.close();
  });

  test("#886 keeps quota consumed on a partial return and releases it exactly once after full refund", async ({ browser }) => {
    const adminContext = await browser.newContext({ baseURL: baseUrl });
    const admin = await adminContext.newPage();
    await signIn(admin, adminEmail, adminPassword, "/enterprise-relationship-benefits");
    await ensureOpenTill(admin);
    const approverContext = await browser.newContext({ baseURL: baseUrl });
    const approver = await approverContext.newPage();
    await signIn(approver, userEmail, userPassword, "/enterprise-modules/RETAIL_POS");

    try {
      const newBenefit = await post(admin, `/api/enterprise/${organizationId}/relationship-benefits`, {
        code: codes.fullReturn,
        nameFr: "Remise sur vente remboursable E2E #886",
        nameEn: "Returnable sale discount E2E #886",
        descriptionFr: "Un retour partiel conserve le quota; un retour total confirmé le libère.",
        descriptionEn: "Partial refunds keep quota reserved; a fully confirmed refund releases it.",
        benefitType: "DISCOUNT",
        assignmentMode: "AUTOMATIC",
        relationTypes: ["CUSTOMER"], identityLinkIds: [],
        valueType: "PERCENT", valueDecimal: 30, currencyCode: fixture.currencyCode,
        actionCode: "NONE", targetModuleCode: "RETAIL_POS",
        usageLimitTotal: 1, usageLimitPerPeriod: 1, usagePeriodDays: 30,
        stackable: false, status: "ACTIVE",
        conditions: { channelCodes: ["POS"], catalogItemIds: [fixture.catalogItemId] },
      });
      expect(newBenefit.response.status(), JSON.stringify(newBenefit.body)).toBe(201);
      const benefitId = newBenefit.body.benefit.id;
      const preview = await post(admin, `/api/enterprise/${organizationId}/retail/pricing/preview`, {
        siteId: fixture.siteId,
        customerBusinessPartyId: fixture.customerBusinessPartyId,
        currencyCode: fixture.currencyCode, channelCode: "POS",
        lines: [{ catalogItemId: fixture.catalogItemId, quantity: 2 }],
      }, "/enterprise-modules/RETAIL_POS");
      expect(preview.response.ok(), JSON.stringify(preview.body)).toBeTruthy();
      expect(preview.body.relationshipBenefits.some((item) => item.benefitId === benefitId)).toBe(true);
      const sale = await post(admin, `/api/enterprise/${organizationId}/retail/sales`, {
        siteId: fixture.siteId, warehouseId: fixture.warehouseId,
        storageLocationId: null, customerBusinessPartyId: fixture.customerBusinessPartyId,
        currencyCode: fixture.currencyCode, idempotencyKey: `e2e-886-sale-${Date.now()}`,
        lines: [{
          catalogItemId: fixture.catalogItemId, inventoryItemId: fixture.inventoryItemId,
          quantity: 2, unitPrice: 116, discountAmount: 0, taxAmount: 0,
        }],
        tenders: [{
          methodType: "CASH", financialAccountId: fixture.cashAccountId,
          amount: asNumber(preview.body.grandTotal), reference: "E2E-886-RETURN",
        }],
      }, "/enterprise-modules/RETAIL_POS");
      expect(sale.response.status(), JSON.stringify(sale.body)).toBe(201);
      const saleId = sale.body.sale.id, saleLineId = sale.body.sale.lines[0].id;
      const usage = await prisma.enterpriseRelationshipBenefitUsage.findFirstOrThrow({
        where: { organizationId, benefitId, effectEntityId: saleId },
      });
      expect(usage.status).toBe("CONSUMED");

      const refundBankAccount = await prisma.enterpriseFinancialAccount.findFirstOrThrow({
        where: { organizationId, code: "SHOP2-E2E-BANK", status: "ACTIVE", archivedAt: null },
        select: { id: true },
      });
      for (const [index, expectedStatus] of ["CONSUMED", "CANCELLED"].entries()) {
        const requested = await post(admin, `/api/enterprise/${organizationId}/retail/sales/${saleId}/returns`, {
          returnType: "RETURN",
          reason: `Retour par tranche ${index + 1} sur deux pour #886`,
          refundMethod: "BANK_TRANSFER",
          refundFinancialAccountId: refundBankAccount.id,
          idempotencyKey: `e2e-886-return-${index}-${Date.now()}`,
          lines: [{ saleLineId, quantity: 1, productCondition: "SELLABLE", stockDisposition: "RESTOCK" }],
        }, "/enterprise-modules/RETAIL_POS");
        expect(requested.response.status(), JSON.stringify(requested.body)).toBe(201);
        const decision = {
          revision: requested.body.retailReturn.revision,
          decision: "APPROVE",
          refundFinancialAccountId: refundBankAccount.id,
          refundReference: `E2E-886-REFUND-${index}`,
        };
        const approved = await post(approver, `/api/enterprise/${organizationId}/retail/returns/${requested.body.retailReturn.id}/decision`,
          decision, "/enterprise-modules/RETAIL_POS");
        expect(approved.response.ok(), JSON.stringify(approved.body)).toBeTruthy();
        expect(approved.body.retailReturn.status).toBe("COMPLETED");
        const after = await prisma.enterpriseRelationshipBenefitUsage.findFirstOrThrow({
          where: { organizationId, benefitId, effectEntityId: saleId },
        });
        expect(after.id).toBe(usage.id);
        expect(after.status).toBe(expectedStatus);
        // Replaying an already approved refund cannot double-release the quota.
        const replay = await post(approver, `/api/enterprise/${organizationId}/retail/returns/${requested.body.retailReturn.id}/decision`,
          decision, "/enterprise-modules/RETAIL_POS");
        expect(replay.response.ok(), JSON.stringify(replay.body)).toBeTruthy();
        expect(replay.body.idempotent).toBe(true);
        expect(await prisma.enterpriseRelationshipBenefitUsage.count({
          where: { organizationId, benefitId, effectEntityId: saleId },
        })).toBe(1);
        expect((await prisma.enterpriseRelationshipBenefitUsage.findUniqueOrThrow({ where: { id: usage.id } })).status).toBe(expectedStatus);
      }
      const availableAgain = await post(admin, `/api/enterprise/${organizationId}/retail/pricing/preview`, {
        siteId: fixture.siteId, customerBusinessPartyId: fixture.customerBusinessPartyId,
        currencyCode: fixture.currencyCode, channelCode: "POS",
        lines: [{ catalogItemId: fixture.catalogItemId, quantity: 1 }],
      }, "/enterprise-modules/RETAIL_POS");
      expect(availableAgain.response.ok(), JSON.stringify(availableAgain.body)).toBeTruthy();
      expect(availableAgain.body.relationshipBenefits.some((item) => item.benefitId === benefitId)).toBe(true);
    } finally {
      await approverContext.close();
      await adminContext.close();
    }
  });

  test("#906 earns relation-linked Retail points once and reverses them atomically on completed refunds", async ({ browser }) => {
    const adminContext = await browser.newContext({ baseURL: baseUrl });
    const approverContext = await browser.newContext({ baseURL: baseUrl });
    const admin = await adminContext.newPage();
    const approver = await approverContext.newPage();
    await signIn(admin, adminEmail, adminPassword, "/enterprise-relationship-benefits");
    await signIn(approver, userEmail, userPassword, "/enterprise-modules/RETAIL_POS");
    await ensureOpenTill(admin);
    try {
      const program = await post(admin, `/api/enterprise/${organizationId}/retail/loyalty/programs`, {
        code: codes.loyalty, nameFr: "Fidélité relationnelle #906", nameEn: "Relationship loyalty #906",
        currencyCode: fixture.currencyCode, earnPointsPerCurrencyUnit: 0,
        redeemValuePerPoint: 0.01, minimumRedeemPoints: 0, status: "ACTIVE",
        settingsJson: { autoEarn: false },
      }, "/enterprise-modules/RETAIL_POS");
      expect(program.response.ok(), JSON.stringify(program.body)).toBeTruthy();

      const benefit = await post(admin, `/api/enterprise/${organizationId}/relationship-benefits`, {
        code: codes.loyalty, nameFr: "Points gagnés sur chaque vente #906",
        nameEn: "Points earned on each sale #906",
        descriptionFr: "Deux points par unité monétaire réellement encaissée.",
        descriptionEn: "Two points per unit of actual completed sales value.",
        benefitType: "LOYALTY", assignmentMode: "AUTOMATIC", relationTypes: ["CUSTOMER"], identityLinkIds: [],
        valueType: "POINTS", valueDecimal: 2, currencyCode: fixture.currencyCode,
        loyaltyProgramId: program.body.program.id,
        actionCode: "NONE", targetModuleCode: "RETAIL_POS", stackable: true, status: "ACTIVE",
        usageLimitTotal: 1, usageLimitPerPeriod: 1, usagePeriodDays: 30,
        conditions: { channelCodes: ["POS"], catalogItemIds: [fixture.catalogItemId] },
      });
      expect(benefit.response.status(), JSON.stringify(benefit.body)).toBe(201);

      const preview = await post(admin, `/api/enterprise/${organizationId}/retail/pricing/preview`, {
        siteId: fixture.siteId, customerBusinessPartyId: fixture.customerBusinessPartyId,
        currencyCode: fixture.currencyCode, channelCode: "POS",
        lines: [{ catalogItemId: fixture.catalogItemId, quantity: 2 }],
      }, "/enterprise-modules/RETAIL_POS");
      expect(preview.response.ok(), JSON.stringify(preview.body)).toBeTruthy();
      const saleInput = {
        siteId: fixture.siteId, warehouseId: fixture.warehouseId, storageLocationId: null,
        customerBusinessPartyId: fixture.customerBusinessPartyId, currencyCode: fixture.currencyCode,
        idempotencyKey: `e2e-906-loyalty-sale-${Date.now()}`,
        lines: [{ catalogItemId: fixture.catalogItemId, inventoryItemId: fixture.inventoryItemId,
          quantity: 2, unitPrice: 116, discountAmount: 0, taxAmount: 0 }],
        tenders: [{ methodType: "CASH", financialAccountId: fixture.cashAccountId,
          amount: asNumber(preview.body.grandTotal), reference: "E2E-906-LOYALTY" }],
      };
      const sale = await post(admin, `/api/enterprise/${organizationId}/retail/sales`, saleInput, "/enterprise-modules/RETAIL_POS");
      expect(sale.response.status(), JSON.stringify(sale.body)).toBe(201);
      const saleId = sale.body.sale.id;
      const earned = await prisma.enterpriseRetailLoyaltyEntry.findFirstOrThrow({
        where: { organizationId, saleId, idempotencyKey: `loyalty:relationship:${saleId}:${benefit.body.benefit.id}` },
      });
      expect(earned.entryType).toBe("EARN");
      expect(asNumber(earned.points)).toBeCloseTo(asNumber(sale.body.sale.grandTotal) * 2, 5);
      const usage = await prisma.enterpriseRelationshipBenefitUsage.findFirstOrThrow({
        where: { organizationId, benefitId: benefit.body.benefit.id, effectEntityId: saleId },
      });
      expect(usage.status).toBe("CONSUMED");
      expect(usage.executionMode).toBe("AUTO_RETAIL_LOYALTY");
      const replay = await post(admin, `/api/enterprise/${organizationId}/retail/sales`, saleInput, "/enterprise-modules/RETAIL_POS");
      expect(replay.response.ok(), JSON.stringify(replay.body)).toBeTruthy();
      expect(replay.body.idempotent || replay.body.result?.idempotent).toBeTruthy();
      expect(await prisma.enterpriseRetailLoyaltyEntry.count({
        where: { organizationId, idempotencyKey: earned.idempotencyKey },
      })).toBe(1);

      const bank = await prisma.enterpriseFinancialAccount.findFirstOrThrow({
        where: { organizationId, code: "SHOP2-E2E-BANK", status: "ACTIVE", archivedAt: null },
        select: { id: true },
      });
      for (const [index, expectedStatus] of ["CONSUMED", "CANCELLED"].entries()) {
        const requested = await post(admin, `/api/enterprise/${organizationId}/retail/sales/${saleId}/returns`, {
          returnType: "RETURN", reason: `Retour de fidélité #906 ${index + 1}`,
          refundMethod: "BANK_TRANSFER", refundFinancialAccountId: bank.id,
          idempotencyKey: `e2e-906-loyalty-return-${index}-${Date.now()}`,
          lines: [{ saleLineId: sale.body.sale.lines[0].id, quantity: 1, productCondition: "SELLABLE", stockDisposition: "RESTOCK" }],
        }, "/enterprise-modules/RETAIL_POS");
        expect(requested.response.status(), JSON.stringify(requested.body)).toBe(201);
        const decision = { revision: requested.body.retailReturn.revision, decision: "APPROVE",
          refundFinancialAccountId: bank.id, refundReference: `E2E-906-${index}` };
        const approved = await post(approver,
          `/api/enterprise/${organizationId}/retail/returns/${requested.body.retailReturn.id}/decision`,
          decision, "/enterprise-modules/RETAIL_POS");
        expect(approved.response.ok(), JSON.stringify(approved.body)).toBeTruthy();
        expect((await prisma.enterpriseRelationshipBenefitUsage.findUniqueOrThrow({ where: { id: usage.id } })).status).toBe(expectedStatus);
        const replayApproval = await post(approver,
          `/api/enterprise/${organizationId}/retail/returns/${requested.body.retailReturn.id}/decision`,
          decision, "/enterprise-modules/RETAIL_POS");
        expect(replayApproval.response.ok(), JSON.stringify(replayApproval.body)).toBeTruthy();
        expect(replayApproval.body.idempotent).toBe(true);
      }
      const account = await prisma.enterpriseRetailLoyaltyAccount.findFirstOrThrow({
        where: { organizationId, programId: program.body.program.id, customerBusinessPartyId: fixture.customerBusinessPartyId },
      });
      expect(asNumber(account.pointsBalance)).toBeCloseTo(0, 5);
      const reversals = await prisma.enterpriseRetailLoyaltyEntry.findMany({
        where: { organizationId, accountId: account.id, entryType: "REVERSAL" },
      });
      expect(reversals.reduce((total, item) => total + asNumber(item.points), 0)).toBeCloseTo(-asNumber(earned.points), 5);
    } finally {
      await approverContext.close();
      await adminContext.close();
    }
  });

  test("#886 omnichannel reserves the discounted price, then consumes the quota only after complete delivery", async ({ browser }) => {
    const adminContext = await browser.newContext({ baseURL: baseUrl });
    const admin = await adminContext.newPage();
    await signIn(admin, adminEmail, adminPassword, "/enterprise-modules/RETAIL_POS");
    try {
      const created = await post(admin, `/api/enterprise/${organizationId}/relationship-benefits`, {
        code: codes.omnichannel,
        nameFr: "Remise omnicanale #886",
        nameEn: "Omnichannel discount #886",
        descriptionFr: "Remise omnicanale réservée jusqu'à la livraison complète prouvée.",
        descriptionEn: "Omnichannel discount reserved until full, proven delivery.",
        benefitType: "DISCOUNT", assignmentMode: "AUTOMATIC",
        relationTypes: ["CUSTOMER"], identityLinkIds: [],
        valueType: "PERCENT", valueDecimal: 40, currencyCode: fixture.currencyCode,
        actionCode: "NONE", targetModuleCode: "RETAIL_POS",
        usageLimitTotal: 1, usageLimitPerPeriod: 1, usagePeriodDays: 30,
        stackable: false, status: "ACTIVE",
        conditions: { channelCodes: ["POS"], catalogItemIds: [fixture.catalogItemId] },
      });
      expect(created.response.status(), JSON.stringify(created.body)).toBe(201);
      const benefitId = created.body.benefit.id;

      const preview = await post(admin, `/api/enterprise/${organizationId}/retail/pricing/preview`, {
        siteId: fixture.siteId, customerBusinessPartyId: fixture.customerBusinessPartyId,
        currencyCode: fixture.currencyCode, channelCode: "POS",
        lines: [{ catalogItemId: fixture.catalogItemId, quantity: 2 }],
      }, "/enterprise-modules/RETAIL_POS");
      expect(preview.response.ok(), JSON.stringify(preview.body)).toBeTruthy();
      expect(preview.body.relationshipBenefits.map((item) => item.benefitId)).toContain(benefitId);

      const payload = {
        idempotencyKey: `e2e-886-omni-${Date.now()}`,
        customerBusinessPartyId: fixture.customerBusinessPartyId,
        sourceSiteId: fixture.siteId,
        fulfillmentWarehouseId: fixture.warehouseId,
        fulfillmentMode: "CLICK_COLLECT",
        currencyCode: fixture.currencyCode,
        lines: [{ catalogItemId: fixture.catalogItemId, quantity: 2 }],
      };
      const ordered = await post(admin, `/api/enterprise/${organizationId}/retail/omnichannel/orders`, payload,
        "/enterprise-modules/RETAIL_POS");
      expect(ordered.response.status(), JSON.stringify(ordered.body)).toBe(201);
      expect(ordered.body.orchestration.status).toBe("RESERVED");
      let orderId = ordered.body.order.id;
      expect(asNumber(ordered.body.order.totalAmount)).toBeCloseTo(asNumber(preview.body.grandTotal), 2);
      let usage = await prisma.enterpriseRelationshipBenefitUsage.findFirstOrThrow({
        where: { organizationId, benefitId, effectEntityType: "EnterpriseSalesOrder", effectEntityId: orderId },
      });
      expect(usage.executionMode).toBe("AUTO_RETAIL_OMNICHANNEL");
      expect(usage.status).toBe("REQUESTED");
      expect(usage.consumedAt).toBeNull();

      const replay = await post(admin, `/api/enterprise/${organizationId}/retail/omnichannel/orders`, payload,
        "/enterprise-modules/RETAIL_POS");
      expect(replay.response.status(), JSON.stringify(replay.body)).toBe(200);
      expect(replay.body.order.id).toBe(orderId);
      expect(await prisma.enterpriseRelationshipBenefitUsage.count({ where: { organizationId, effectEntityId: orderId } })).toBe(1);

      const blocked = await post(admin, `/api/enterprise/${organizationId}/retail/pricing/preview`, {
        siteId: fixture.siteId, customerBusinessPartyId: fixture.customerBusinessPartyId,
        currencyCode: fixture.currencyCode, channelCode: "POS",
        lines: [{ catalogItemId: fixture.catalogItemId, quantity: 2 }],
      }, "/enterprise-modules/RETAIL_POS");
      expect(blocked.response.ok(), JSON.stringify(blocked.body)).toBeTruthy();
      expect(blocked.body.relationshipBenefits.map((item) => item.benefitId)).not.toContain(benefitId);

      const cancelled = await post(admin, `/api/enterprise/${organizationId}/retail/omnichannel/orders/${orderId}/cancel`, {
        revision: ordered.body.order.revision,
        reason: "Annulation d’essai avant livraison #886",
      }, "/enterprise-modules/RETAIL_POS");
      expect(cancelled.response.status(), JSON.stringify(cancelled.body)).toBe(200);
      expect(cancelled.body.order.status).toBe("CANCELLED");
      expect((await prisma.enterpriseRelationshipBenefitUsage.findUniqueOrThrow({ where: { id: usage.id } })).status).toBe("CANCELLED");
      expect(await prisma.enterpriseInventoryReservation.count({
        where: { organizationId, salesOrderId: orderId, status: "ACTIVE" },
      })).toBe(0);
      const cancelledReplay = await post(admin, `/api/enterprise/${organizationId}/retail/omnichannel/orders/${orderId}/cancel`, {
        revision: ordered.body.order.revision,
        reason: "Annulation d’essai avant livraison #886",
      }, "/enterprise-modules/RETAIL_POS");
      expect(cancelledReplay.response.status(), JSON.stringify(cancelledReplay.body)).toBe(200);
      expect(cancelledReplay.body.idempotent).toBe(true);

      const availableAfterCancellation = await post(admin, `/api/enterprise/${organizationId}/retail/pricing/preview`, {
        siteId: fixture.siteId, customerBusinessPartyId: fixture.customerBusinessPartyId,
        currencyCode: fixture.currencyCode, channelCode: "POS",
        lines: [{ catalogItemId: fixture.catalogItemId, quantity: 2 }],
      }, "/enterprise-modules/RETAIL_POS");
      expect(availableAfterCancellation.response.ok(), JSON.stringify(availableAfterCancellation.body)).toBeTruthy();
      expect(availableAfterCancellation.body.relationshipBenefits.map((item) => item.benefitId)).toContain(benefitId);

      const replacement = await post(admin, `/api/enterprise/${organizationId}/retail/omnichannel/orders`, {
        ...payload, idempotencyKey: `e2e-886-omni-replacement-${Date.now()}`,
      }, "/enterprise-modules/RETAIL_POS");
      expect(replacement.response.status(), JSON.stringify(replacement.body)).toBe(201);
      orderId = replacement.body.order.id;
      usage = await prisma.enterpriseRelationshipBenefitUsage.findFirstOrThrow({
        where: { organizationId, benefitId, effectEntityType: "EnterpriseSalesOrder", effectEntityId: orderId },
      });
      expect(usage.status).toBe("REQUESTED");

      const first = await post(admin, `/api/enterprise/${organizationId}/sales-orders/${orderId}/fulfill`, {
        fulfillmentType: "PRODUCT_DELIVERY", warehouseId: fixture.warehouseId,
        acceptedByCustomer: true, idempotencyKey: `e2e-886-omni-half-${Date.now()}`,
        revision: replacement.body.order.revision,
        items: [{ salesOrderItemId: replacement.body.order.items[0].id, quantityFulfilled: 1 }],
      }, "/enterprise-modules/RETAIL_POS");
      expect(first.response.status(), JSON.stringify(first.body)).toBe(201);
      const firstStockIssue = await prisma.enterpriseStockMovement.findFirstOrThrow({
        where: { organizationId, sourceEntityType: "EnterpriseFulfillment",
          sourceEntityId: first.body.fulfillment.id, direction: "OUT", movementType: "SALE_FULFILLMENT" },
      });
      const firstValuation = await prisma.enterpriseInventoryAccountingEvent.findFirstOrThrow({
        where: { organizationId, stockMovementId: firstStockIssue.id, eventType: "ISSUE", status: "POSTED" },
      });
      expect(firstValuation.journalEntryId).toBeTruthy();
      expect((await prisma.enterpriseRelationshipBenefitUsage.findUniqueOrThrow({ where: { id: usage.id } })).status).toBe("REQUESTED");

      const updated = await prisma.enterpriseSalesOrder.findUniqueOrThrow({ where: { id: orderId } });
      const missingProof = await post(admin, `/api/enterprise/${organizationId}/sales-orders/${orderId}/fulfill`, {
        fulfillmentType: "PRODUCT_DELIVERY", warehouseId: fixture.warehouseId,
        acceptedByCustomer: false, idempotencyKey: `e2e-886-omni-no-proof-${Date.now()}`,
        revision: updated.revision,
        items: [{ salesOrderItemId: replacement.body.order.items[0].id, quantityFulfilled: 1 }],
      }, "/enterprise-modules/RETAIL_POS");
      expect(missingProof.response.status(), JSON.stringify(missingProof.body)).toBe(409);
      expect((await prisma.enterpriseRelationshipBenefitUsage.findUniqueOrThrow({ where: { id: usage.id } })).status).toBe("REQUESTED");
      const second = await post(admin, `/api/enterprise/${organizationId}/sales-orders/${orderId}/fulfill`, {
        fulfillmentType: "PRODUCT_DELIVERY", warehouseId: fixture.warehouseId,
        acceptedByCustomer: true, idempotencyKey: `e2e-886-omni-finish-${Date.now()}`,
        revision: updated.revision,
        items: [{ salesOrderItemId: replacement.body.order.items[0].id, quantityFulfilled: 1 }],
      }, "/enterprise-modules/RETAIL_POS");
      expect(second.response.status(), JSON.stringify(second.body)).toBe(201);
      const secondStockIssue = await prisma.enterpriseStockMovement.findFirstOrThrow({
        where: { organizationId, sourceEntityType: "EnterpriseFulfillment",
          sourceEntityId: second.body.fulfillment.id, direction: "OUT", movementType: "SALE_FULFILLMENT" },
      });
      expect(await prisma.enterpriseInventoryAccountingEvent.count({
        where: { organizationId, stockMovementId: secondStockIssue.id, eventType: "ISSUE", status: "POSTED" },
      })).toBe(1);
      expect((await prisma.enterpriseRelationshipBenefitUsage.findUniqueOrThrow({ where: { id: usage.id } })).status).toBe("CONSUMED");
      expect(await prisma.enterpriseRelationshipBenefitUsage.count({ where: { organizationId, effectEntityId: orderId } })).toBe(1);

      // #904: post-delivery returns require an independent validator before any
      // stock, credit note, refund, or relationship-quota reversal is possible.
      const invalidReturn = await post(admin, `/api/enterprise/${organizationId}/retail/omnichannel/orders/${orderId}/returns`, {
        idempotencyKey: `e2e-904-self-validation-${Date.now()}`,
        reason: "Retour omnicanal de contrôle après livraison",
        validatorUserId: fixture.adminUserId,
        lines: [{ salesOrderItemId: replacement.body.order.items[0].id, quantity: 1,
          productCondition: "SELLABLE", stockDisposition: "RESTOCK" }],
      }, "/enterprise-modules/RETAIL_POS");
      expect(invalidReturn.response.status(), JSON.stringify(invalidReturn.body)).toBe(403);
      expect(await prisma.enterpriseRetailOmnichannelReturn.count({ where: { organizationId, salesOrderId: orderId } })).toBe(0);
      expect((await prisma.enterpriseRelationshipBenefitUsage.findUniqueOrThrow({ where: { id: usage.id } })).status).toBe("CONSUMED");
    } finally {
      await adminContext.close();
    }
  });

  test("#908 issues real Retail cashback as store credit, redeems it on the next ticket and reverses eligible refunds", async ({ browser }) => {
    const adminContext = await browser.newContext({ baseURL: baseUrl, viewport: { width: 390, height: 844 } });
    const reviewerContext = await browser.newContext({ baseURL: baseUrl });
    const admin = await adminContext.newPage();
    const reviewer = await reviewerContext.newPage();
    await signIn(admin, adminEmail, adminPassword, "/enterprise-relationship-benefits");
    await signIn(reviewer, userEmail, userPassword, "/enterprise-modules/RETAIL_POS");
    await ensureOpenTill(admin);
    try {
      const benefit = await post(admin, `/api/enterprise/${organizationId}/relationship-benefits`, {
        code: codes.cashback, nameFr: "Cashback relationnel E2E #908", nameEn: "E2E relationship cashback #908",
        descriptionFr: "Cinq pour cent du ticket en avoir magasin non remboursable en espèces.",
        descriptionEn: "Five percent of the confirmed ticket issued as store credit.",
        benefitType: "CASHBACK", assignmentMode: "AUTOMATIC", relationTypes: ["CUSTOMER"], identityLinkIds: [],
        valueType: "PERCENT", valueDecimal: 5, currencyCode: fixture.currencyCode,
        actionCode: "NONE", targetModuleCode: "RETAIL_POS", stackable: true, status: "ACTIVE",
        usageLimitTotal: 1, usageLimitPerPeriod: 1, usagePeriodDays: 30,
        conditions: { channelCodes: ["POS"], catalogItemIds: [fixture.catalogItemId] },
      });
      expect(benefit.response.status(), JSON.stringify(benefit.body)).toBe(201);

      const price = await post(admin, `/api/enterprise/${organizationId}/retail/pricing/preview`, {
        siteId: fixture.siteId, customerBusinessPartyId: fixture.customerBusinessPartyId,
        currencyCode: fixture.currencyCode, channelCode: "POS",
        lines: [{ catalogItemId: fixture.catalogItemId, quantity: 2 }],
      }, "/enterprise-modules/RETAIL_POS");
      expect(price.response.ok(), JSON.stringify(price.body)).toBeTruthy();
      const originalInput = {
        warehouseId: fixture.warehouseId, siteId: fixture.siteId,
        customerBusinessPartyId: fixture.customerBusinessPartyId, currencyCode: fixture.currencyCode,
        idempotencyKey: `e2e-908-cashback-first-${Date.now()}`,
        lines: [{ catalogItemId: fixture.catalogItemId, inventoryItemId: fixture.inventoryItemId,
          quantity: 2, unitPrice: 116, discountAmount: 0, taxAmount: 0 }],
        tenders: [{ methodType: "CASH", financialAccountId: fixture.cashAccountId,
          amount: asNumber(price.body.grandTotal), reference: "E2E-908-CASHBACK-FIRST" }],
      };
      const original = await post(admin, `/api/enterprise/${organizationId}/retail/sales`, originalInput, "/enterprise-modules/RETAIL_POS");
      expect(original.response.status(), JSON.stringify(original.body)).toBe(201);
      expect(original.body.cashbackCredits).toHaveLength(1);
      const saleId = original.body.sale.id;
      const earn = await prisma.enterpriseRetailStoredValueEntry.findFirstOrThrow({
        where: { organizationId, saleId, entryType: "EARN", idempotencyKey: `cashback:relationship:${saleId}:${benefit.body.benefit.id}` },
      });
      const cashbackAmount = asNumber(earn.amount);
      expect(cashbackAmount).toBeCloseTo(asNumber(original.body.sale.grandTotal) * 0.05, 5);
      const usage = await prisma.enterpriseRelationshipBenefitUsage.findFirstOrThrow({
        where: { organizationId, effectEntityId: saleId, benefitId: benefit.body.benefit.id },
      });
      expect(usage.executionMode).toBe("AUTO_RETAIL_CASHBACK");
      expect(usage.status).toBe("CONSUMED");
      const account = await prisma.enterpriseRetailStoredValueAccount.findUniqueOrThrow({ where: { id: earn.accountId } });
      expect(account.accountType).toBe("STORE_CREDIT");
      expect(asNumber(account.balance)).toBeCloseTo(cashbackAmount, 5);
      expect(account.customerBusinessPartyId).toBe(fixture.customerBusinessPartyId);
      const replay = await post(admin, `/api/enterprise/${organizationId}/retail/sales`, originalInput, "/enterprise-modules/RETAIL_POS");
      expect(replay.response.ok(), JSON.stringify(replay.body)).toBeTruthy();
      expect(replay.body.idempotent || replay.body.result?.idempotent).toBeTruthy();
      expect(await prisma.enterpriseRetailStoredValueEntry.count({ where: { organizationId, idempotencyKey: earn.idempotencyKey } })).toBe(1);

      const nextPrice = await post(admin, `/api/enterprise/${organizationId}/retail/pricing/preview`, {
        siteId: fixture.siteId, customerBusinessPartyId: fixture.customerBusinessPartyId,
        currencyCode: fixture.currencyCode, channelCode: "POS",
        lines: [{ catalogItemId: fixture.catalogItemId, quantity: 1 }],
      }, "/enterprise-modules/RETAIL_POS");
      expect(nextPrice.response.ok(), JSON.stringify(nextPrice.body)).toBeTruthy();
      const secondTotal = asNumber(nextPrice.body.grandTotal);
      expect(secondTotal).toBeGreaterThan(cashbackAmount);
      const nextSale = await post(admin, `/api/enterprise/${organizationId}/retail/sales`, {
        warehouseId: fixture.warehouseId, siteId: fixture.siteId,
        customerBusinessPartyId: fixture.customerBusinessPartyId, currencyCode: fixture.currencyCode,
        idempotencyKey: `e2e-908-store-credit-spend-${Date.now()}`,
        lines: [{ catalogItemId: fixture.catalogItemId, inventoryItemId: fixture.inventoryItemId,
          quantity: 1, unitPrice: 116, discountAmount: 0, taxAmount: 0 }],
        tenders: [
          { methodType: "STORE_CREDIT", storedValueAccountId: account.id, amount: cashbackAmount },
          { methodType: "CASH", financialAccountId: fixture.cashAccountId, amount: Number((secondTotal - cashbackAmount).toFixed(6)) },
        ],
      }, "/enterprise-modules/RETAIL_POS");
      expect(nextSale.response.status(), JSON.stringify(nextSale.body)).toBe(201);
      const afterSpend = await prisma.enterpriseRetailStoredValueAccount.findUniqueOrThrow({ where: { id: account.id } });
      expect(asNumber(afterSpend.balance)).toBeCloseTo(0, 5);
      expect(nextSale.body.cashbackCredits).toHaveLength(0);

      const bank = await prisma.enterpriseFinancialAccount.findFirstOrThrow({
        where: { organizationId, code: "SHOP2-E2E-BANK", status: "ACTIVE", archivedAt: null }, select: { id: true },
      });
      for (const [index, remaining] of [cashbackAmount / 2, cashbackAmount].entries()) {
        const requested = await post(admin, `/api/enterprise/${organizationId}/retail/sales/${saleId}/returns`, {
          returnType: "RETURN", reason: `Retour cashback E2E #908 ${index + 1}`,
          refundMethod: "BANK_TRANSFER", refundFinancialAccountId: bank.id,
          idempotencyKey: `e2e-908-cashback-return-${index}-${Date.now()}`,
          lines: [{ saleLineId: original.body.sale.lines[0].id, quantity: 1, productCondition: "SELLABLE", stockDisposition: "RESTOCK" }],
        }, "/enterprise-modules/RETAIL_POS");
        expect(requested.response.status(), JSON.stringify(requested.body)).toBe(201);
        const decision = { revision: requested.body.retailReturn.revision, decision: "APPROVE", refundFinancialAccountId: bank.id };
        const approved = await post(reviewer,
          `/api/enterprise/${organizationId}/retail/returns/${requested.body.retailReturn.id}/decision`, decision, "/enterprise-modules/RETAIL_POS");
        expect(approved.response.ok(), JSON.stringify(approved.body)).toBeTruthy();
        const latest = await prisma.enterpriseRetailStoredValueAccount.findUniqueOrThrow({ where: { id: account.id } });
        expect(asNumber(latest.balance)).toBeCloseTo(-remaining, 5);
        expect((await prisma.enterpriseRelationshipBenefitUsage.findUniqueOrThrow({ where: { id: usage.id } })).status)
          .toBe(index === 0 ? "CONSUMED" : "CANCELLED");
      }
    } finally {
      await adminContext.close();
      await reviewerContext.close();
    }
  });

  test("#912 DELIVERY uses a versioned Sales proof, a linked customer and one idempotent consumption", async ({ browser }) => {
    const adminContext = await browser.newContext({ baseURL: baseUrl, viewport: { width: 390, height: 844 } });
    const memberContext = await browser.newContext({ baseURL: baseUrl });
    const admin = await adminContext.newPage();
    const member = await memberContext.newPage();
    let benefitId = null;
    let orderId = null;
    let documentId = null;
    let fulfillmentId = null;
    try {
      await prisma.enterpriseIdentityLink.update({
        where: { id: ids.identityLink },
        data: { status: "ACTIVE", revokedAt: null, revocationReason: null, userDecisionAt: new Date(), organizationDecisionAt: new Date(), activatedAt: new Date(), requestedRoleCode: null },
      });
      await signIn(admin, adminEmail, adminPassword, "/enterprise-relationship-benefits");
      await signIn(member, userEmail, userPassword, "/enterprise-links");
      const benefit = await post(admin, `/api/enterprise/${organizationId}/relationship-benefits`, {
        code: `E2E_912_DELIVERY_${Date.now()}`,
        nameFr: "Livraison avec preuve", nameEn: "Evidence-backed delivery",
        descriptionFr: "Livraison non monétaire avec justificatif commercial réel.",
        descriptionEn: "Non-monetary benefit attested by real Sales evidence.",
        benefitType: "DELIVERY", assignmentMode: "AUTOMATIC", relationTypes: ["CUSTOMER"],
        identityLinkIds: [], valueType: "NONE", actionCode: "REQUEST",
        targetModuleCode: "SALES_QUOTES_ORDERS", stackable: false, status: "ACTIVE",
      });
      expect(benefit.response.status(), JSON.stringify(benefit.body)).toBe(201);
      benefitId = benefit.body.benefit.id;

      const requested = await post(member, `/api/account/enterprise-relationships/${organizationId}/benefits`, {
        identityLinkId: ids.identityLink, benefitId, idempotencyKey: `e2e-912-req-${Date.now()}`,
        note: "Livraison demandée par le bénéficiaire",
      }, "/enterprise-links");
      expect(requested.response.status(), JSON.stringify(requested.body)).toBe(201);
      const usageId = requested.body.usage.id;
      const approved = await patch(admin,
        `/api/enterprise/${organizationId}/relationship-benefits/usages/${usageId}`,
        { status: "APPROVED", revision: requested.body.usage.revision });
      expect(approved.response.ok(), JSON.stringify(approved.body)).toBeTruthy();
      expect(approved.body.usage.effectEntityId).toBeNull();

      const invalid = await post(admin,
        `/api/enterprise/${organizationId}/relationship-benefits/usages/${usageId}/delivery`,
        { revision: approved.body.usage.revision, fulfillmentReference: "FUL-UNKNOWN-912" });
      expect(invalid.response.status()).toBe(404);

      // Synthetic isolated DB fixture exercises the attestation API. The
      // actual Sales and file-upload flows still require owner acceptance.
      const suffix = String(Date.now());
      const order = await prisma.enterpriseSalesOrder.create({
        data: {
          organizationId, reference: `E2E-912-ORDER-${suffix}`,
          businessPartyId: fixture.customerBusinessPartyId,
          title: "Commande livrée pour avantage #912", status: "FULFILLED",
          currency: fixture.currencyCode, subtotalAmount: 10, totalAmount: 10,
          fulfilledAt: new Date(Date.now() + 1000),
          createdByUserId: fixture.adminUserId,
          items: { create: [{
            description: "Article livré", quantityOrdered: 1, quantityFulfilled: 1,
            unitPrice: 10, lineSubtotal: 10, lineTotal: 10,
          }] },
        },
        include: { items: true },
      });
      orderId = order.id;
      const record = await prisma.enterpriseDocument.create({
        data: {
          organizationId, title: "Justificatif de livraison E2E", documentType: "OTHER",
          status: "ACTIVE", visibility: "ORGANIZATION",
          currentVersion: 1, sourceEntityType: "EnterpriseSalesOrder", sourceEntityId: order.id,
          createdByUserId: fixture.adminUserId,
          versions: { create: [{
            versionNumber: 1, fileName: "delivery-proof.pdf", mimeType: "application/pdf",
            sizeBytes: 128, storageBucket: "e2e-test", storagePath: `test-only/${suffix}/delivery-proof.pdf`,
            uploadedByUserId: fixture.adminUserId,
          }] },
        },
      });
      documentId = record.id;
      const fulfilledAt = new Date(Date.now() + 2000);
      const shipment = await prisma.enterpriseFulfillment.create({
        data: {
          organizationId, salesOrderId: order.id, reference: `FUL-E2E-912-${suffix}`,
          fulfillmentType: "PRODUCT_DELIVERY", status: "COMPLETED",
          fulfilledAt, fulfilledByUserId: fixture.userId, createdByUserId: fixture.adminUserId,
          items: { create: [{ salesOrderItemId: order.items[0].id, quantityFulfilled: 1 }] },
        },
      });
      fulfillmentId = shipment.id;

      const noDocument = await post(admin,
        `/api/enterprise/${organizationId}/relationship-benefits/usages/${usageId}/delivery`,
        { revision: approved.body.usage.revision, fulfillmentReference: shipment.reference });
      expect(noDocument.response.status()).toBe(409);
      expect(noDocument.body.error).toBe("RELATIONSHIP_DELIVERY_DOCUMENT_REQUIRED");

      await prisma.enterpriseFulfillment.update({ where: { id: shipment.id }, data: { proofDocumentId: record.id } });

      // Backend must verify the actual business object, not only a form field.
      await prisma.enterpriseSalesOrder.update({ where: { id: order.id }, data: { status: "PARTIALLY_FULFILLED" } });
      const partialOrder = await post(admin,
        `/api/enterprise/${organizationId}/relationship-benefits/usages/${usageId}/delivery`,
        { revision: approved.body.usage.revision, fulfillmentReference: shipment.reference });
      expect(partialOrder.response.status()).toBe(409);
      expect(partialOrder.body.error).toBe("RELATIONSHIP_DELIVERY_NOT_READY");
      await prisma.enterpriseSalesOrder.update({ where: { id: order.id }, data: { status: "FULFILLED" } });

      await prisma.enterpriseFulfillment.update({ where: { id: shipment.id }, data: { fulfilledByUserId: fixture.adminUserId } });
      const selfAttestation = await post(admin,
        `/api/enterprise/${organizationId}/relationship-benefits/usages/${usageId}/delivery`,
        { revision: approved.body.usage.revision, fulfillmentReference: shipment.reference });
      expect(selfAttestation.response.status()).toBe(403);
      expect(selfAttestation.body.error).toBe("RELATIONSHIP_DELIVERY_INDEPENDENT_REVIEW_REQUIRED");
      await prisma.enterpriseFulfillment.update({ where: { id: shipment.id }, data: { fulfilledByUserId: fixture.userId } });

      await prisma.enterpriseDocument.update({ where: { id: record.id }, data: { status: "DRAFT" } });
      const unapprovedDocument = await post(admin,
        `/api/enterprise/${organizationId}/relationship-benefits/usages/${usageId}/delivery`,
        { revision: approved.body.usage.revision, fulfillmentReference: shipment.reference });
      expect(unapprovedDocument.response.status()).toBe(409);
      expect(unapprovedDocument.body.error).toBe("RELATIONSHIP_DELIVERY_DOCUMENT_INVALID");
      await prisma.enterpriseDocument.update({ where: { id: record.id }, data: { status: "ACTIVE" } });

      const delivered = await post(admin,
        `/api/enterprise/${organizationId}/relationship-benefits/usages/${usageId}/delivery`,
        { revision: approved.body.usage.revision, fulfillmentReference: shipment.reference });
      expect(delivered.response.ok(), JSON.stringify(delivered.body)).toBeTruthy();
      expect(delivered.body.usage.status).toBe("CONSUMED");
      expect(delivered.body.usage.effectEntityId).toBe(shipment.id);

      const replay = await post(admin,
        `/api/enterprise/${organizationId}/relationship-benefits/usages/${usageId}/delivery`,
        { revision: approved.body.usage.revision, fulfillmentReference: shipment.reference });
      expect(replay.response.ok(), JSON.stringify(replay.body)).toBeTruthy();
      expect(replay.body.replayed).toBe(true);
      const usageCount = await prisma.enterpriseRelationshipBenefitUsage.count({
        where: { organizationId, benefitId, status: "CONSUMED", effectEntityId: shipment.id },
      });
      expect(usageCount).toBe(1);

      const secondRequest = await post(member, `/api/account/enterprise-relationships/${organizationId}/benefits`, {
        identityLinkId: ids.identityLink, benefitId,
        idempotencyKey: `e2e-912-double-use-${Date.now()}`,
        note: "Nouvelle demande, même preuve de livraison",
      }, "/enterprise-links");
      expect(secondRequest.response.status(), JSON.stringify(secondRequest.body)).toBe(201);
      const secondApproved = await patch(admin,
        `/api/enterprise/${organizationId}/relationship-benefits/usages/${secondRequest.body.usage.id}`,
        { revision: secondRequest.body.usage.revision, status: "APPROVED" });
      expect(secondApproved.response.ok(), JSON.stringify(secondApproved.body)).toBeTruthy();
      const duplicateProof = await post(admin,
        `/api/enterprise/${organizationId}/relationship-benefits/usages/${secondRequest.body.usage.id}/delivery`,
        { revision: secondApproved.body.usage.revision, fulfillmentReference: shipment.reference });
      expect(duplicateProof.response.status()).toBe(409);
      expect(duplicateProof.body.error).toBe("RELATIONSHIP_DELIVERY_DUPLICATE_PROOF");
    } finally {
      if (benefitId) {
        await prisma.enterpriseRelationshipBenefitUsage.deleteMany({ where: { organizationId, benefitId } });
        await prisma.enterpriseRelationshipBenefitAssignment.deleteMany({ where: { organizationId, benefitId } });
        await prisma.enterpriseRelationshipBenefitAudience.deleteMany({ where: { organizationId, benefitId } });
        await prisma.enterpriseRelationshipBenefit.deleteMany({ where: { organizationId, id: benefitId } });
      }
      if (fulfillmentId) await prisma.enterpriseFulfillment.deleteMany({ where: { organizationId, id: fulfillmentId } });
      if (documentId) await prisma.enterpriseDocument.deleteMany({ where: { organizationId, id: documentId } });
      if (orderId) {
        await prisma.enterpriseSalesOrderItem.deleteMany({ where: { organizationId, salesOrderId: orderId } });
        await prisma.enterpriseSalesOrder.deleteMany({ where: { organizationId, id: orderId } });
      }
      await adminContext.close();
      await memberContext.close();
    }
  });

});
