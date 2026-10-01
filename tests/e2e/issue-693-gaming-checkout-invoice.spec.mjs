import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const baseUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const organizationId = process.env.E2E_ORGANIZATION_ID || "e2e-erp-professional-org";
const adminEmail = process.env.E2E_ADMIN_EMAIL || "erp-admin@example.test";
const adminPassword = process.env.E2E_ADMIN_PASSWORD || "E2eAdmin2026!";
const approverEmail = process.env.E2E_USER_EMAIL || "erp-user@example.test";
const approverPassword = process.env.E2E_USER_PASSWORD || "E2eUser2026!";
const confirmerEmail = "erp-confirmer@example.test";
const confirmerPassword = approverPassword;
const customerId = "e2e-baseline-business-party";
const assetId = "e2e-gaming-asset-693";
const stationId = "e2e-gaming-station-693";
const unitId = "e2e-gaming-uom-693";
const serviceId = "e2e-gaming-service-693";
const pricingRuleId = "e2e-gaming-pricing-696";
let cashAccountId = "";
let adminUserId = "";
let approverUserId = "";
let confirmerUserId = "";
let crossDayPaidSessionId = "";
let context;
let approverContext;
let confirmerContext;

const requiredModules = [
  "CRM_CUSTOMERS",
  "CATALOG",
  "SITES_WAREHOUSES",
  "SUPPLIERS_PURCHASES",
  "ASSETS_MAINTENANCE",
  "FINANCE_OVERVIEW",
  "FINANCE_TREASURY",
  "FINANCE_CASH",
  "FINANCE_PAYMENTS",
  "FINANCE_RECEIVABLES",
  "GAMING_STATIONS",
  "GAMING_SESSIONS",
  "GAMING_CHECKOUT",
  "GAMING_DAILY_CLOSE",
];

async function prepareTenant() {
  const [admin, approver] = await Promise.all([
    prisma.user.findUnique({ where: { email: adminEmail } }),
    prisma.user.findUnique({ where: { email: approverEmail } }),
  ]);
  if (!admin || !approver) throw new Error("Issue #693 requires the canonical ERP authenticated seed.");
  adminUserId = admin.id;
  approverUserId = approver.id;

  const confirmer = await prisma.user.upsert({
    where: { email: confirmerEmail },
    update: {
      name: "Confirmeur Finance ERP E2E",
      passwordHash: approver.passwordHash,
      role: "CLIENT",
      status: "ACTIVE",
      locale: "fr",
      startPage: "/dashboard",
    },
    create: {
      id: "e2e-erp-finance-confirmer-user",
      name: "Confirmeur Finance ERP E2E",
      email: confirmerEmail,
      passwordHash: approver.passwordHash,
      role: "CLIENT",
      status: "ACTIVE",
      locale: "fr",
      startPage: "/dashboard",
    },
  });
  confirmerUserId = confirmer.id;

  await prisma.organization.update({
    where: { id: organizationId },
    data: {
      sectorCode: "HOSPITALITY_EVENTS",
      status: "ACTIVE",
      deletedAt: null,
      organizationType: "CLIENT",
      country: "CD",
      timezone: "Africa/Kinshasa",
    },
  });

  await prisma.organizationMember.upsert({
    where: { organizationId_userId: { organizationId, userId: approver.id } },
    update: { role: "ADMIN_ENTERPRISE", status: "ACTIVE", removedAt: null, joinedAt: new Date() },
    create: {
      id: "e2e-gaming-approver-membership-693",
      organizationId,
      userId: approver.id,
      role: "ADMIN_ENTERPRISE",
      status: "ACTIVE",
      joinedAt: new Date(),
    },
  });

  await prisma.organizationMember.upsert({
    where: { organizationId_userId: { organizationId, userId: confirmerUserId } },
    update: { role: "ADMIN_ENTERPRISE", status: "ACTIVE", removedAt: null, joinedAt: new Date() },
    create: {
      id: "e2e-gaming-confirmer-membership-730",
      organizationId,
      userId: confirmerUserId,
      role: "ADMIN_ENTERPRISE",
      status: "ACTIVE",
      joinedAt: new Date(),
    },
  });

  await prisma.enterpriseBusinessSubtypeSelection.upsert({
    where: { organizationId },
    update: {
      sectorCode: "HOSPITALITY_EVENTS",
      businessSubtypeCode: "GAMING_LOUNGE",
      selectedByUserId: admin.id,
      source: "OWNER_E2E_693",
    },
    create: {
      organizationId,
      sectorCode: "HOSPITALITY_EVENTS",
      businessSubtypeCode: "GAMING_LOUNGE",
      selectedByUserId: admin.id,
      source: "OWNER_E2E_693",
    },
  });

  for (const [index, moduleCode] of requiredModules.entries()) {
    await prisma.enterpriseModule.upsert({
      where: { organizationId_moduleCode: { organizationId, moduleCode } },
      update: { isEnabled: true, requiresPlanLevel: moduleCode === "CATALOG" || moduleCode === "CRM_CUSTOMERS" ? "STARTER" : "BUSINESS" },
      create: {
        organizationId,
        moduleCode,
        labelFr: moduleCode,
        labelEn: moduleCode,
        moduleCategory: "E2E",
        isEnabled: true,
        isCore: false,
        requiresPlanLevel: moduleCode === "CATALOG" || moduleCode === "CRM_CUSTOMERS" ? "STARTER" : "BUSINESS",
        sortOrder: 1600 + index,
      },
    });
  }

  await prisma.enterpriseUnitOfMeasure.upsert({
    where: { organizationId_code: { organizationId, code: "SESSION-693" } },
    update: { name: "Session Gaming QA #693", symbol: "session", status: "ACTIVE", archivedAt: null },
    create: {
      id: unitId,
      organizationId,
      code: "SESSION-693",
      name: "Session Gaming QA #693",
      symbol: "session",
      category: "SERVICE",
      decimalScale: 0,
      status: "ACTIVE",
      isSystem: false,
      createdByUserId: admin.id,
    },
  });

  await prisma.enterpriseCatalogItem.upsert({
    where: { organizationId_code: { organizationId, code: "GAMING-SERVICE-693" } },
    update: {
      name: "Session Gaming QA #693",
      normalizedName: "session gaming qa 693",
      itemType: "SERVICE",
      unitOfMeasureId: unitId,
      currency: "CDF",
      status: "ACTIVE",
      trackInventory: false,
      archivedAt: null,
      updatedByUserId: admin.id,
    },
    create: {
      id: serviceId,
      organizationId,
      code: "GAMING-SERVICE-693",
      name: "Session Gaming QA #693",
      normalizedName: "session gaming qa 693",
      itemType: "SERVICE",
      unitOfMeasureId: unitId,
      currency: "CDF",
      status: "ACTIVE",
      trackInventory: false,
      createdByUserId: admin.id,
    },
  });

  await prisma.enterpriseAsset.upsert({
    where: { id: assetId },
    update: {
      organizationId,
      code: "E2E-GAME-693",
      name: "Poste Gaming checkout #693",
      status: "ACTIVE",
      condition: "GOOD",
      archivedAt: null,
      updatedByUserId: admin.id,
    },
    create: {
      id: assetId,
      organizationId,
      code: "E2E-GAME-693",
      name: "Poste Gaming checkout #693",
      status: "ACTIVE",
      condition: "GOOD",
      createdByUserId: admin.id,
    },
  });

  await prisma.enterpriseGamingStationProfile.upsert({
    where: { organizationId_assetId: { organizationId, assetId } },
    update: {
      stationCode: "E2E-GS-693",
      displayName: "PS4 checkout #693",
      consoleFamily: "PlayStation",
      maxPlayers: 4,
      status: "AVAILABLE",
      archivedAt: null,
      updatedByUserId: admin.id,
    },
    create: {
      id: stationId,
      organizationId,
      assetId,
      stationCode: "E2E-GS-693",
      displayName: "PS4 checkout #693",
      consoleFamily: "PlayStation",
      maxPlayers: 4,
      status: "AVAILABLE",
      createdByUserId: admin.id,
    },
  });

  await prisma.enterpriseCurrency.upsert({
    where: { organizationId_code: { organizationId, code: "CDF" } },
    update: { name: "Franc congolais", symbol: "FC", precision: 2, isActive: true },
    create: { organizationId, code: "CDF", name: "Franc congolais", symbol: "FC", precision: 2, isActive: true },
  });

  await prisma.enterpriseGamingPricingRule.upsert({
    where: { organizationId_code: { organizationId, code: "E2E-FIXED-696" } },
    update: {
      serviceCatalogItemId: serviceId,
      stationId,
      pricingMode: "FIXED_DURATION",
      amount: 500,
      currency: "CDF",
      durationMinutes: 10,
      billingIncrementMinutes: 1,
      priority: 1,
      status: "ACTIVE",
      archivedAt: null,
      ruleJson: { contractVersion: 1, label: "Lifecycle #696", consoleFamily: null, minPlayers: null, maxPlayers: null },
      updatedByUserId: admin.id,
    },
    create: {
      id: pricingRuleId,
      organizationId,
      code: "E2E-FIXED-696",
      serviceCatalogItemId: serviceId,
      stationId,
      pricingMode: "FIXED_DURATION",
      amount: 500,
      currency: "CDF",
      durationMinutes: 10,
      billingIncrementMinutes: 1,
      priority: 1,
      status: "ACTIVE",
      ruleJson: { contractVersion: 1, label: "Lifecycle #696", consoleFamily: null, minPlayers: null, maxPlayers: null },
      createdByUserId: admin.id,
    },
  });

  const financeConfig = await context.request.patch(
    `${baseUrl}/api/enterprise/${organizationId}/finance/configuration`,
    {
      data: {
        functionalCurrencyCode: "CDF",
        presentationCurrencyCode: "CDF",
        inventoryValuationMethod: "WEIGHTED_AVERAGE",
        reconciliationTolerance: "0.01",
        automaticPostingEnabled: true,
      },
      headers: {
        origin: baseUrl,
        referer: `${baseUrl}/enterprise-modules/FINANCE_OVERVIEW`,
      },
    },
  );
  const financeConfigBody = await financeConfig.json().catch(() => null);
  expect(financeConfig.ok(), JSON.stringify(financeConfigBody)).toBeTruthy();

  const ledger = await prisma.enterpriseLedgerAccount.findFirst({
    where: {
      organizationId,
      isActive: true,
      archivedAt: null,
      accountSubtype: "CASH",
    },
    select: { id: true },
  });
  if (!ledger) throw new Error("Issue #698 requires the system Finance baseline to expose an active CASH ledger account.");
  const cashAccount = await prisma.enterpriseFinancialAccount.create({
    data: {
      organizationId,
      code: `G-CASH-698-${Date.now().toString(36).toUpperCase()}`,
      name: "Gaming cash E2E #698",
      accountType: "CASH",
      currencyCode: "CDF",
      openingBalance: 0,
      operationalBalance: 0,
      reconciledBalance: 0,
      availableBalance: 0,
      ledgerAccountId: ledger.id,
      responsibleUserId: admin.id,
      status: "ACTIVE",
    },
    select: { id: true },
  });
  cashAccountId = cashAccount.id;
}

async function signInAs(targetContext, email, password, next = "/enterprise-modules/GAMING_CHECKOUT") {
  const response = await targetContext.request.post(`${baseUrl}/api/auth/sign-in`, {
    data: { email, password, organizationId, next },
    headers: { origin: baseUrl, referer: `${baseUrl}/auth/sign-in` },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
}

async function signIn() {
  await signInAs(context, adminEmail, adminPassword);
}

async function startAndEndSession({ businessPartyId, suffix }) {
  const start = await context.request.post(`${baseUrl}/api/enterprise/${organizationId}/gaming/sessions`, {
    data: {
      stationId,
      durationMinutes: 10,
      idempotencyKey: `e2e-696-start-${suffix}`,
      businessPartyId,
      serviceCatalogItemId: serviceId,
      playerCount: 1,
      pauseBillable: false,
    },
    headers: {
      origin: baseUrl,
      referer: `${baseUrl}/enterprise-modules/GAMING_SESSIONS`,
    },
  });
  const started = await start.json().catch(() => null);
  expect(start.status(), JSON.stringify(started)).toBe(201);
  expect(started?.session?.status).toBe("ACTIVE");

  const end = await context.request.patch(`${baseUrl}/api/enterprise/${organizationId}/gaming/sessions/${started.session.id}`, {
    data: {
      action: "END",
      revision: started.session.revision,
      idempotencyKey: `e2e-696-end-${suffix}`,
    },
    headers: {
      origin: baseUrl,
      referer: `${baseUrl}/enterprise-modules/GAMING_SESSIONS`,
    },
  });
  const ended = await end.json().catch(() => null);
  expect(end.status(), JSON.stringify(ended)).toBe(200);
  expect(ended?.session?.status).toBe("TO_CHECKOUT");

  const transitions = await prisma.enterpriseGamingSessionTransition.findMany({
    where: { organizationId, sessionId: started.session.id },
    select: { action: true },
  });
  expect(transitions.map((item) => item.action)).toEqual(expect.arrayContaining(["START", "END", "READY_TO_CHECKOUT"]));
  return ended.session;
}

async function createLegacyEndedSession({ businessPartyId, suffix }) {
  const now = new Date();
  return prisma.enterpriseGamingSession.create({
    data: {
      organizationId,
      reference: `GS-E2E-696-LEGACY-${suffix}`,
      stationId,
      businessPartyId,
      serviceCatalogItemId: serviceId,
      pricingRuleId,
      status: "ENDED",
      startedAt: new Date(now.getTime() - 10 * 60 * 1000),
      expectedEndAt: now,
      endedAt: now,
      billableSeconds: 600,
      pricingSnapshotJson: {
        contractVersion: 1,
        authority: "SERVER",
        pricingMode: "FIXED_DURATION",
        currency: "CDF",
        unitAmount: "500.00",
        quotedAmount: "500.00",
      },
      currency: "CDF",
      quotedAmount: 500,
      finalAmount: 500,
      idempotencyKey: `e2e-696-legacy-session-${suffix}`,
      createdByUserId: adminUserId,
      updatedByUserId: adminUserId,
    },
  });
}

async function checkout(sessionId, suffix) {
  const response = await context.request.post(`${baseUrl}/api/enterprise/${organizationId}/gaming/checkouts`, {
    data: {
      sessionId,
      invoiceApproverUserId: approverUserId,
      idempotencyKey: `e2e-693-checkout-${suffix}`,
      extraItems: [],
    },
    headers: {
      origin: baseUrl,
      referer: `${baseUrl}/enterprise-modules/GAMING_CHECKOUT`,
    },
  });
  const body = await response.json().catch(() => null);
  expect(response.status(), JSON.stringify(body)).toBe(201);
  expect(body?.checkout?.status).toBe("INVOICE_PENDING");
  expect(body?.invoice?.status).toBe("PENDING_APPROVAL");
  expect(body?.invoice?.items).toHaveLength(1);
  expect(body?.invoice?.items?.[0]?.organizationId).toBe(organizationId);
  expect(body?.invoice?.items?.[0]?.catalogItemId).toBe(serviceId);
  return body;
}

async function approveInvoice(checkoutResult) {
  const response = await approverContext.request.patch(
    `${baseUrl}/api/enterprise/${organizationId}/gaming/checkouts/${checkoutResult.checkout.id}`,
    {
      data: { action: "APPROVE_INVOICE", revision: checkoutResult.checkout.revision },
      headers: {
        origin: baseUrl,
        referer: `${baseUrl}/enterprise-modules/GAMING_CHECKOUT`,
      },
    },
  );
  const body = await response.json().catch(() => null);
  expect(response.ok(), JSON.stringify(body)).toBeTruthy();
  expect(body?.checkout?.status).toBe("AWAITING_PAYMENT");
  expect(body?.invoice?.status).toBe("ISSUED");
  return body;
}

test.describe.serial("Issue #693 Gaming checkout invoice nested write", () => {
  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext();
    approverContext = await browser.newContext();
    confirmerContext = await browser.newContext();
    await signIn();
    await prepareTenant();
    await signInAs(approverContext, approverEmail, approverPassword);
    await signInAs(confirmerContext, confirmerEmail, confirmerPassword, "/enterprise-modules/FINANCE_PAYMENTS");
  });

  test.afterAll(async () => {
    await context?.close();
    await approverContext?.close();
    await confirmerContext?.close();
    await prisma.$disconnect();
  });

  test("walk-in checkout creates Finance invoice and propagates tenant to invoice line", async () => {
    const suffix = `walkin-${Date.now()}`;
    const session = await startAndEndSession({ businessPartyId: null, suffix });
    const result = await checkout(session.id, suffix);

    const walkIn = await prisma.enterpriseBusinessParty.findUnique({
      where: {
        organizationId_migrationKey: {
          organizationId,
          migrationKey: "SYSTEM:GAMING:WALK_IN_CUSTOMER",
        },
      },
      select: { id: true },
    });
    expect(walkIn?.id).toBeTruthy();
    expect(result.invoice.businessPartyId).toBe(walkIn?.id);
  });

  test("CRM customer checkout creates Finance invoice without nested organizationId payload", async () => {
    const customer = await prisma.enterpriseBusinessParty.findFirst({
      where: {
        id: customerId,
        organizationId,
        status: "ACTIVE",
        archivedAt: null,
        roles: { some: { roleCode: "CUSTOMER", status: "ACTIVE", archivedAt: null } },
      },
      select: { id: true },
    });
    expect(customer?.id).toBe(customerId);

    const suffix = `crm-${Date.now()}`;
    const session = await startAndEndSession({ businessPartyId: customerId, suffix });
    const result = await checkout(session.id, suffix);
    expect(result.invoice.businessPartyId).toBe(customerId);
  });

  test("legacy ENDED session can open checkout and persist CHECKOUT_OPEN", async () => {
    const suffix = `legacy-${Date.now()}`;
    const session = await createLegacyEndedSession({ businessPartyId: null, suffix });
    const result = await checkout(session.id, suffix);

    const transition = await prisma.enterpriseGamingSessionTransition.findFirst({
      where: {
        organizationId,
        sessionId: session.id,
        action: "CHECKOUT_OPEN",
      },
      select: { id: true, fromStatus: true, toStatus: true },
    });
    expect(transition).toMatchObject({ fromStatus: "ENDED", toStatus: "TO_CHECKOUT" });
    expect(result.checkout.status).toBe("INVOICE_PENDING");
  });

  test("#698 refuses CASH before payment creation when the initiating cashier has no open cash session", async () => {
    const suffix = `cash-block-${Date.now()}`;
    const session = await startAndEndSession({ businessPartyId: customerId, suffix });
    const prepared = await checkout(session.id, suffix);
    const issued = await approveInvoice(prepared);

    const response = await context.request.patch(
      `${baseUrl}/api/enterprise/${organizationId}/gaming/checkouts/${issued.checkout.id}`,
      {
        data: {
          action: "ADD_PAYMENT",
          revision: issued.checkout.revision,
          paymentApproverUserId: approverUserId,
          methodType: "CASH",
          financialAccountId: cashAccountId,
          amount: 500,
          idempotencyKey: `e2e-698-cash-block-${suffix}`,
        },
        headers: {
          origin: baseUrl,
          referer: `${baseUrl}/enterprise-modules/GAMING_CHECKOUT`,
        },
      },
    );
    const body = await response.json().catch(() => null);
    expect(response.status(), JSON.stringify(body)).toBe(409);
    expect(body?.error).toBe("GAMING_CHECKOUT_OPEN_CASH_SESSION_REQUIRED");
    expect(body?.message).toMatch(/caisse ouverte|open cash session/i);
    expect(await prisma.enterprisePayment.count({
      where: { organizationId, reference: issued.checkout.reference },
    })).toBe(0);
  });

  test("#698 external Finance approval and confirmation settle the Gaming checkout end to end", async () => {
    const cashSession = await prisma.enterpriseCashSession.create({
      data: {
        organizationId,
        number: `CASH-E2E-698-${Date.now().toString(36).toUpperCase()}`,
        financialAccountId: cashAccountId,
        cashierUserId: adminUserId,
        status: "OPEN",
        openingAmount: 0,
      },
    });

    const suffix = `cash-settle-${Date.now()}`;
    const session = await startAndEndSession({ businessPartyId: customerId, suffix });
    const prepared = await checkout(session.id, suffix);
    const issued = await approveInvoice(prepared);

    const addResponse = await context.request.patch(
      `${baseUrl}/api/enterprise/${organizationId}/gaming/checkouts/${issued.checkout.id}`,
      {
        data: {
          action: "ADD_PAYMENT",
          revision: issued.checkout.revision,
          paymentApproverUserId: approverUserId,
          methodType: "CASH",
          financialAccountId: cashAccountId,
          amount: 500,
          idempotencyKey: `e2e-698-cash-settle-${suffix}`,
        },
        headers: {
          origin: baseUrl,
          referer: `${baseUrl}/enterprise-modules/GAMING_CHECKOUT`,
        },
      },
    );
    const added = await addResponse.json().catch(() => null);
    expect(addResponse.ok(), JSON.stringify(added)).toBeTruthy();
    expect(added?.payment?.status).toBe("PENDING_APPROVAL");

    const approveResponse = await approverContext.request.post(
      `${baseUrl}/api/enterprise/${organizationId}/payments/${added.payment.id}/transition`,
      {
        data: { action: "APPROVE", revision: added.payment.revision },
        headers: {
          origin: baseUrl,
          referer: `${baseUrl}/enterprise-modules/FINANCE_PAYMENTS`,
        },
      },
    );
    const approved = await approveResponse.json().catch(() => null);
    expect(approveResponse.ok(), JSON.stringify(approved)).toBeTruthy();
    expect(approved?.payment?.status).toBe("APPROVED");

    const approverPreviewResponse = await approverContext.request.get(
      `${baseUrl}/api/enterprise/${organizationId}/payments?recordId=${added.payment.id}`,
      { headers: { origin: baseUrl, referer: `${baseUrl}/enterprise-modules/FINANCE_PAYMENTS` } },
    );
    const approverPreview = await approverPreviewResponse.json().catch(() => null);
    expect(approverPreviewResponse.ok(), JSON.stringify(approverPreview)).toBeTruthy();
    expect(approverPreview?.items?.[0]?.capabilities?.canConfirm).toBe(false);
    expect(approverPreview?.items?.[0]?.confirmation?.blockerCode).toBe("PAYMENT_SELF_CONFIRMATION_FORBIDDEN");

    const confirmerPreviewResponse = await confirmerContext.request.get(
      `${baseUrl}/api/enterprise/${organizationId}/payments?recordId=${added.payment.id}`,
      { headers: { origin: baseUrl, referer: `${baseUrl}/enterprise-modules/FINANCE_PAYMENTS` } },
    );
    const confirmerPreview = await confirmerPreviewResponse.json().catch(() => null);
    expect(confirmerPreviewResponse.ok(), JSON.stringify(confirmerPreview)).toBeTruthy();
    expect(confirmerPreview?.items?.[0]?.capabilities?.canConfirm).toBe(true);
    expect(confirmerPreview?.items?.[0]?.confirmation?.blockerCode).toBeNull();

    const sameApproverConfirm = await approverContext.request.post(
      `${baseUrl}/api/enterprise/${organizationId}/payments/${added.payment.id}/transition`,
      {
        data: { action: "CONFIRM", revision: approved.payment.revision },
        headers: {
          origin: baseUrl,
          referer: `${baseUrl}/enterprise-modules/FINANCE_PAYMENTS`,
        },
      },
    );
    const sameApproverConfirmBody = await sameApproverConfirm.json().catch(() => null);
    expect(sameApproverConfirm.status(), JSON.stringify(sameApproverConfirmBody)).toBe(409);
    expect(sameApproverConfirmBody?.error).toBe("PAYMENT_SELF_CONFIRMATION_FORBIDDEN");

    const confirmResponse = await confirmerContext.request.post(
      `${baseUrl}/api/enterprise/${organizationId}/payments/${added.payment.id}/transition`,
      {
        data: { action: "CONFIRM", revision: approved.payment.revision },
        headers: {
          origin: baseUrl,
          referer: `${baseUrl}/enterprise-modules/FINANCE_PAYMENTS`,
        },
      },
    );
    const confirmed = await confirmResponse.json().catch(() => null);
    expect(confirmResponse.ok(), JSON.stringify(confirmed)).toBeTruthy();
    expect(confirmed?.payment?.status).toBe("CONFIRMED");

    const [persistedPayment, persistedInvoice, persistedCheckout, persistedSession, allocation, paidTransition] = await Promise.all([
      prisma.enterprisePayment.findUniqueOrThrow({ where: { id: added.payment.id } }),
      prisma.enterpriseSalesInvoice.findUniqueOrThrow({ where: { id: issued.invoice.id } }),
      prisma.enterpriseGamingCheckout.findUniqueOrThrow({ where: { id: issued.checkout.id } }),
      prisma.enterpriseGamingSession.findUniqueOrThrow({ where: { id: session.id } }),
      prisma.enterprisePaymentAllocation.findFirst({
        where: { organizationId, paymentId: added.payment.id, receivableId: issued.invoice.receivable.id, status: "CONFIRMED" },
      }),
      prisma.enterpriseGamingSessionTransition.findFirst({
        where: { organizationId, sessionId: session.id, action: "CHECKOUT_PAID" },
      }),
    ]);

    expect(persistedPayment.status).toBe("CONFIRMED");
    expect(persistedPayment.unallocatedAmount.toFixed()).toBe("0");
    expect(allocation?.amount.toFixed()).toBe("500");
    expect(persistedInvoice.status).toBe("PAID");
    expect(persistedInvoice.outstandingAmount.toFixed()).toBe("0");
    expect(persistedCheckout.status).toBe("PAID");
    expect(persistedSession.status).toBe("PAID");
    expect(paidTransition).toBeTruthy();

    // #714: keep the payment on the current business day while moving the full
    // session window to the previous day. The daily close must still count this
    // settled Gaming session without violating the session time-order contract.
    crossDayPaidSessionId = persistedSession.id;
    const previousDayOffset = 24 * 60 * 60 * 1000;
    await prisma.enterpriseGamingSession.update({
      where: { id: persistedSession.id },
      data: {
        startedAt: persistedSession.startedAt ? new Date(persistedSession.startedAt.getTime() - previousDayOffset) : null,
        expectedEndAt: persistedSession.expectedEndAt ? new Date(persistedSession.expectedEndAt.getTime() - previousDayOffset) : null,
        endedAt: persistedSession.endedAt ? new Date(persistedSession.endedAt.getTime() - previousDayOffset) : null,
      },
    });

    await prisma.enterpriseCashSession.update({
      where: { id: cashSession.id },
      data: { status: "CLOSED", expectedClosingAmount: 500, countedClosingAmount: 500, discrepancyAmount: 0 },
    });
  });

  test("#706 submits Gaming daily close and persists tenant-scoped nested lines", async () => {
    const businessDate = new Date().toISOString().slice(0, 10);
    const idempotencyKey = `e2e-706-close-${businessDate}`;

    const previous = await prisma.enterpriseGamingDailyClose.findFirst({
      where: { organizationId, idempotencyKey },
      select: { id: true },
    });
    if (previous) {
      await prisma.enterpriseGamingDailyCloseLine.deleteMany({
        where: { organizationId, dailyCloseId: previous.id },
      });
      await prisma.enterpriseGamingDailyClose.delete({ where: { id: previous.id } });
    }

    const response = await context.request.post(
      `${baseUrl}/api/enterprise/${organizationId}/gaming/daily-closes`,
      {
        data: {
          businessDate,
          siteId: null,
          approverUserId,
          notes: "Hotfix #706/#710 E2E",
          idempotencyKey,
          declarations: [{
            financialAccountId: cashAccountId,
            methodType: "CASH",
            declaredAmount: 500,
            varianceReason: null,
          }],
        },
        headers: {
          origin: baseUrl,
          referer: `${baseUrl}/enterprise-modules/GAMING_DAILY_CLOSE`,
        },
      },
    );
    const body = await response.json().catch(() => null);
    expect(response.status(), JSON.stringify(body)).toBe(201);
    expect(body?.close?.status).toBe("SUBMITTED");
    expect(body?.close?.lines).toHaveLength(1);

    const persisted = await prisma.enterpriseGamingDailyClose.findUniqueOrThrow({
      where: { id: body.close.id },
      include: { lines: true },
    });
    expect(persisted.organizationId).toBe(organizationId);
    expect(persisted.approverUserId).toBe(approverUserId);
    expect(persisted.lines).toHaveLength(1);
    expect(persisted.lines[0].organizationId).toBe(organizationId);
    expect(persisted.lines[0].financialAccountId).toBe(cashAccountId);
    expect(persisted.lines[0].currencyCode).toBe("CDF");
    expect(persisted.lines[0].methodType).toBe("CASH");
    expect(persisted.lines[0].expectedAmount.toFixed()).toBe("500");
    expect(persisted.lines[0].declaredAmount.toFixed()).toBe("500");
    expect(persisted.lines[0].differenceAmount.toFixed()).toBe("0");
    expect(persisted.lines[0].varianceReason).toBeNull();

    const crossDayPaidSession = await prisma.enterpriseGamingSession.findUniqueOrThrow({
      where: { id: crossDayPaidSessionId },
      select: { endedAt: true, status: true },
    });
    expect(crossDayPaidSession.status).toBe("PAID");
    expect(crossDayPaidSession.endedAt?.getTime()).toBeLessThan(persisted.businessDate.getTime());
    expect(persisted.paidSessionCount).toBeGreaterThanOrEqual(1);
    expect(persisted.pendingCheckoutCount).toBeGreaterThanOrEqual(1);

    await prisma.enterpriseGamingDailyClose.update({
      where: { id: persisted.id },
      data: { approverUserId: null },
    });

    const assignResponse = await context.request.patch(
      `${baseUrl}/api/enterprise/${organizationId}/gaming/daily-closes/${persisted.id}`,
      {
        data: { action: "ASSIGN_APPROVER", revision: persisted.revision, approverUserId },
        headers: {
          origin: baseUrl,
          referer: `${baseUrl}/enterprise-modules/GAMING_DAILY_CLOSE`,
        },
      },
    );
    const assignedClose = await assignResponse.json().catch(() => null);
    expect(assignResponse.ok(), JSON.stringify(assignedClose)).toBeTruthy();
    expect(assignedClose?.close?.approverUserId).toBe(approverUserId);

    const selfDecision = await context.request.patch(
      `${baseUrl}/api/enterprise/${organizationId}/gaming/daily-closes/${persisted.id}`,
      {
        data: { action: "VALIDATE", revision: assignedClose.close.revision, reason: "Parfait" },
        headers: {
          origin: baseUrl,
          referer: `${baseUrl}/enterprise-modules/GAMING_DAILY_CLOSE`,
        },
      },
    );
    const selfDecisionBody = await selfDecision.json().catch(() => null);
    expect(selfDecision.status(), JSON.stringify(selfDecisionBody)).toBe(403);
    expect(selfDecisionBody?.error).toBe("GAMING_CLOSE_SELF_VALIDATION_FORBIDDEN");

    const assignedDecision = await approverContext.request.patch(
      `${baseUrl}/api/enterprise/${organizationId}/gaming/daily-closes/${persisted.id}`,
      {
        data: { action: "VALIDATE", revision: assignedClose.close.revision, reason: "Parfait" },
        headers: {
          origin: baseUrl,
          referer: `${baseUrl}/enterprise-modules/GAMING_DAILY_CLOSE`,
        },
      },
    );
    const assignedDecisionBody = await assignedDecision.json().catch(() => null);
    expect(assignedDecision.ok(), JSON.stringify(assignedDecisionBody)).toBeTruthy();
    expect(assignedDecisionBody?.close?.status).toBe("VALIDATED");
    expect(assignedDecisionBody?.close?.validatedByUserId).toBe(approverUserId);

    const shortReject = await approverContext.request.patch(
      `${baseUrl}/api/enterprise/${organizationId}/gaming/daily-closes/${persisted.id}`,
      {
        data: { action: "REJECT", revision: assignedDecisionBody.close.revision, reason: "Court" },
        headers: {
          origin: baseUrl,
          referer: `${baseUrl}/enterprise-modules/GAMING_DAILY_CLOSE`,
        },
      },
    );
    const shortRejectBody = await shortReject.json().catch(() => null);
    expect(shortReject.status(), JSON.stringify(shortRejectBody)).toBe(400);
    expect(shortRejectBody?.error).toBe("GAMING_CLOSE_REJECTION_REASON_TOO_SHORT");
    expect(shortRejectBody?.message).toMatch(/8 caractères|8 characters/i);
  });

  test("#700 reopens cash after pending close and recovers a historical approved Gaming payment; #704 uses another authorized cashier and preserves CDF", async () => {
    const oldCashSession = await prisma.enterpriseCashSession.create({
      data: {
        organizationId,
        number: `CASH-E2E-700-OLD-${Date.now().toString(36).toUpperCase()}`,
        financialAccountId: cashAccountId,
        cashierUserId: adminUserId,
        status: "OPEN",
        openingAmount: 0,
      },
    });

    const suffix = `cash-recovery-${Date.now()}`;
    const session = await startAndEndSession({ businessPartyId: customerId, suffix });
    const prepared = await checkout(session.id, suffix);
    const issued = await approveInvoice(prepared);

    const addResponse = await context.request.patch(
      `${baseUrl}/api/enterprise/${organizationId}/gaming/checkouts/${issued.checkout.id}`,
      {
        data: {
          action: "ADD_PAYMENT",
          revision: issued.checkout.revision,
          paymentApproverUserId: approverUserId,
          methodType: "CASH",
          financialAccountId: cashAccountId,
          amount: 500,
          idempotencyKey: `e2e-700-cash-recovery-${suffix}`,
        },
        headers: {
          origin: baseUrl,
          referer: `${baseUrl}/enterprise-modules/GAMING_CHECKOUT`,
        },
      },
    );
    const added = await addResponse.json().catch(() => null);
    expect(addResponse.ok(), JSON.stringify(added)).toBeTruthy();
    expect(added?.payment?.status).toBe("PENDING_APPROVAL");

    const initiallyBound = await prisma.enterprisePayment.findUniqueOrThrow({
      where: { id: added.payment.id },
      select: { cashSessionId: true },
    });
    expect(initiallyBound.cashSessionId).toBe(oldCashSession.id);

    const approveResponse = await approverContext.request.post(
      `${baseUrl}/api/enterprise/${organizationId}/payments/${added.payment.id}/transition`,
      {
        data: { action: "APPROVE", revision: added.payment.revision },
        headers: {
          origin: baseUrl,
          referer: `${baseUrl}/enterprise-modules/FINANCE_PAYMENTS`,
        },
      },
    );
    const approved = await approveResponse.json().catch(() => null);
    expect(approveResponse.ok(), JSON.stringify(approved)).toBeTruthy();
    expect(approved?.payment?.status).toBe("APPROVED");

    await prisma.enterpriseCashSession.update({
      where: { id: oldCashSession.id },
      data: {
        status: "PENDING_VALIDATION",
        submittedAt: new Date(),
        expectedClosingAmount: 0,
        countedClosingAmount: 0,
        discrepancyAmount: 0,
        revision: { increment: 1 },
      },
    });

    // Remove the durable binding while keeping the payment recent. Post-cutover rows
    // must not borrow another cashier's session automatically.
    await prisma.enterprisePayment.update({
      where: { id: added.payment.id },
      data: { cashSessionId: null },
    });

    // The independent confirmer opens a compatible session. Recovery is still
    // forbidden until the fixture is explicitly marked as pre-cutover.
    const openResponse = await confirmerContext.request.post(
      `${baseUrl}/api/enterprise/${organizationId}/cash-sessions`,
      {
        data: {
          financialAccountId: cashAccountId,
          openingAmount: "0",
        },
        headers: {
          origin: baseUrl,
          referer: `${baseUrl}/enterprise-modules/FINANCE_CASH`,
        },
      },
    );
    const opened = await openResponse.json().catch(() => null);
    expect(openResponse.status(), JSON.stringify(opened)).toBe(201);
    expect(opened?.session?.status).toBe("OPEN");
    expect(opened?.session?.id).not.toBe(oldCashSession.id);

    const openedPersisted = await prisma.enterpriseCashSession.findUniqueOrThrow({
      where: { id: opened.session.id },
      select: { cashierUserId: true },
    });
    expect(openedPersisted.cashierUserId).toBe(confirmerUserId);
    expect(openedPersisted.cashierUserId).not.toBe(adminUserId);
    expect(openedPersisted.cashierUserId).not.toBe(approverUserId);

    const cashListResponse = await confirmerContext.request.get(
      `${baseUrl}/api/enterprise/${organizationId}/cash-sessions?recordId=${opened.session.id}`,
      {
        headers: {
          origin: baseUrl,
          referer: `${baseUrl}/enterprise-modules/FINANCE_CASH`,
        },
      },
    );
    const cashList = await cashListResponse.json().catch(() => null);
    expect(cashListResponse.ok(), JSON.stringify(cashList)).toBeTruthy();
    expect(cashList?.items?.[0]?.currencyCode).toBe("CDF");
    expect(cashList?.items?.[0]?.financialAccount?.currencyCode).toBe("CDF");

    const modernPreviewResponse = await confirmerContext.request.get(
      `${baseUrl}/api/enterprise/${organizationId}/payments?recordId=${added.payment.id}`,
      { headers: { origin: baseUrl, referer: `${baseUrl}/enterprise-modules/FINANCE_PAYMENTS` } },
    );
    const modernPreview = await modernPreviewResponse.json().catch(() => null);
    expect(modernPreviewResponse.ok(), JSON.stringify(modernPreview)).toBeTruthy();
    expect(modernPreview?.items?.[0]?.capabilities?.canConfirm).toBe(false);
    expect(modernPreview?.items?.[0]?.confirmation?.blockerCode).toBe("PAYMENT_CASH_SESSION_BINDING_REQUIRED");

    const modernRecoveryAttempt = await confirmerContext.request.post(
      `${baseUrl}/api/enterprise/${organizationId}/payments/${added.payment.id}/transition`,
      {
        data: { action: "CONFIRM", revision: approved.payment.revision },
        headers: {
          origin: baseUrl,
          referer: `${baseUrl}/enterprise-modules/FINANCE_PAYMENTS`,
        },
      },
    );
    const modernRecoveryBody = await modernRecoveryAttempt.json().catch(() => null);
    expect(modernRecoveryAttempt.status(), JSON.stringify(modernRecoveryBody)).toBe(409);
    expect(modernRecoveryBody?.error).toBe("PAYMENT_CASH_SESSION_BINDING_REQUIRED");

    await prisma.enterprisePayment.update({
      where: { id: added.payment.id },
      data: { createdAt: new Date("2026-09-28T12:00:00.000Z") },
    });

    const legacyPreviewResponse = await confirmerContext.request.get(
      `${baseUrl}/api/enterprise/${organizationId}/payments?recordId=${added.payment.id}`,
      { headers: { origin: baseUrl, referer: `${baseUrl}/enterprise-modules/FINANCE_PAYMENTS` } },
    );
    const legacyPreview = await legacyPreviewResponse.json().catch(() => null);
    expect(legacyPreviewResponse.ok(), JSON.stringify(legacyPreview)).toBeTruthy();
    expect(legacyPreview?.items?.[0]?.capabilities?.canConfirm).toBe(true);
    expect(legacyPreview?.items?.[0]?.confirmation?.blockerCode).toBeNull();
    expect(legacyPreview?.items?.[0]?.confirmation?.noticeCode).toBe("PAYMENT_CASH_SESSION_LEGACY_RECOVERY");

    const confirmResponse = await confirmerContext.request.post(
      `${baseUrl}/api/enterprise/${organizationId}/payments/${added.payment.id}/transition`,
      {
        data: { action: "CONFIRM", revision: approved.payment.revision },
        headers: {
          origin: baseUrl,
          referer: `${baseUrl}/enterprise-modules/FINANCE_PAYMENTS`,
        },
      },
    );
    const confirmed = await confirmResponse.json().catch(() => null);
    expect(confirmResponse.ok(), JSON.stringify(confirmed)).toBeTruthy();
    expect(confirmed?.payment?.status).toBe("CONFIRMED");

    const [persistedPayment, movement, recoveryEvent, allocation, persistedInvoice, persistedCheckout, persistedSession] = await Promise.all([
      prisma.enterprisePayment.findUniqueOrThrow({ where: { id: added.payment.id } }),
      prisma.enterpriseCashMovement.findFirst({
        where: { organizationId, paymentId: added.payment.id },
      }),
      prisma.enterprisePaymentEvent.findFirst({
        where: { organizationId, paymentId: added.payment.id, eventType: "CASH_SESSION_RECOVERED" },
      }),
      prisma.enterprisePaymentAllocation.findFirst({
        where: { organizationId, paymentId: added.payment.id, receivableId: issued.invoice.receivable.id, status: "CONFIRMED" },
      }),
      prisma.enterpriseSalesInvoice.findUniqueOrThrow({ where: { id: issued.invoice.id } }),
      prisma.enterpriseGamingCheckout.findUniqueOrThrow({ where: { id: issued.checkout.id } }),
      prisma.enterpriseGamingSession.findUniqueOrThrow({ where: { id: session.id } }),
    ]);

    expect(persistedPayment.cashSessionId).toBe(opened.session.id);
    expect(movement?.cashSessionId).toBe(opened.session.id);
    expect(recoveryEvent).toBeTruthy();
    expect(allocation?.amount.toFixed()).toBe("500");
    expect(persistedInvoice.status).toBe("PAID");
    expect(persistedCheckout.status).toBe("PAID");
    expect(persistedSession.status).toBe("PAID");

    await prisma.enterpriseCashSession.update({
      where: { id: opened.session.id },
      data: {
        status: "CLOSED",
        expectedClosingAmount: 500,
        countedClosingAmount: 500,
        discrepancyAmount: 0,
      },
    });
  });

});
