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
    where: { organizationId, code: { in: [codes.automatic, codes.exclusive, codes.manual] } },
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

    const suspendedExclusive = await patch(
      admin,
      `/api/enterprise/${organizationId}/relationship-benefits/${exclusiveBenefitId}`,
      { revision: exclusive.body.benefit.revision, status: "SUSPENDED" },
    );
    expect(suspendedExclusive.response.ok(), JSON.stringify(suspendedExclusive.body)).toBeTruthy();

    const userContext = await browser.newContext({ baseURL: baseUrl, viewport: { width: 390, height: 844 } });
    const user = await userContext.newPage();
    await signIn(user, userEmail, userPassword, `/enterprise-links?link=${ids.identityLink}&view=ACTIVE`);
    await expect(user.getByText(/Vos services et avantages disponibles|Your available services and benefits/i)).toBeVisible();
    await expect(user.getByText(/Remise relationnelle E2E 5 %|E2E relationship 5% discount/i)).toBeVisible();
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
});
