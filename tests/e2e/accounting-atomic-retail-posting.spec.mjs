import { expect, test } from "@playwright/test";
import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const baseUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const organizationId = process.env.E2E_ORGANIZATION_ID || "e2e-erp-professional-org";
const adminEmail = process.env.E2E_ADMIN_EMAIL || "erp-admin@example.test";
const adminPassword = process.env.E2E_ADMIN_PASSWORD || "E2eAdmin2026!";

const fixture = {
  userId: "",
  cashAccountId: "",
  bankAccountId: "",
  mobileCdfAccountId: "",
  mobileUsdAccountId: "",
  telcoUsdAccountId: "",
  mobileProviderId: "",
  telcoProviderId: "",
};

function asNumber(value) {
  return Number(value?.toString?.() ?? value ?? 0);
}

function expectBalanced(entry, label) {
  const debit = entry.lines.reduce((sum, line) => sum + asNumber(line.debit), 0);
  const credit = entry.lines.reduce((sum, line) => sum + asNumber(line.credit), 0);
  expect(debit, `${label}: journal entry must carry value`).toBeGreaterThan(0);
  expect(Math.abs(debit - credit), `${label}: debits and credits must balance`).toBeLessThan(0.00001);
  expect(asNumber(entry.totalDebit), `${label}: total debit`).toBeCloseTo(debit, 5);
  expect(asNumber(entry.totalCredit), `${label}: total credit`).toBeCloseTo(credit, 5);
}

async function ensureProvider(providerCode, label, providerType) {
  return prisma.enterpriseRetailProvider.upsert({
    where: { organizationId_providerCode: { organizationId, providerCode } },
    update: { label, providerType, isActive: true, revision: { increment: 1 } },
    create: { organizationId, providerCode, label, providerType, isActive: true },
  });
}

async function ensureLedgerChild(parent, code, nameFr, nameEn, currencyCode) {
  return prisma.enterpriseLedgerAccount.upsert({
    where: { organizationId_code: { organizationId, code } },
    update: {
      nameFr,
      nameEn,
      accountType: parent.accountType,
      accountSubtype: "MOBILE_MONEY",
      parentId: parent.id,
      currencyCode,
      allowDirectPosting: true,
      isActive: true,
      archivedAt: null,
    },
    create: {
      organizationId,
      chartId: parent.chartId,
      accountGroupId: parent.accountGroupId,
      code,
      nameFr,
      nameEn,
      accountType: parent.accountType,
      accountSubtype: "MOBILE_MONEY",
      parentId: parent.id,
      level: parent.level + 1,
      currencyCode,
      isControlAccount: false,
      isSystemAccount: false,
      allowDirectPosting: true,
      isActive: true,
    },
  });
}

async function ensureFinancialAccount({ code, name, currencyCode, ledgerAccountId }) {
  return prisma.enterpriseFinancialAccount.upsert({
    where: { organizationId_code: { organizationId, code } },
    update: {
      name,
      accountType: "MOBILE_MONEY",
      currencyCode,
      ledgerAccountId,
      status: "ACTIVE",
      archivedAt: null,
      openingBalance: new Prisma.Decimal(1_000_000),
      operationalBalance: new Prisma.Decimal(1_000_000),
      reconciledBalance: new Prisma.Decimal(1_000_000),
      availableBalance: new Prisma.Decimal(1_000_000),
    },
    create: {
      organizationId,
      code,
      name,
      accountType: "MOBILE_MONEY",
      currencyCode,
      openingBalance: new Prisma.Decimal(1_000_000),
      operationalBalance: new Prisma.Decimal(1_000_000),
      reconciledBalance: new Prisma.Decimal(1_000_000),
      availableBalance: new Prisma.Decimal(1_000_000),
      ledgerAccountId,
      responsibleUserId: fixture.userId,
      status: "ACTIVE",
    },
  });
}

async function mapProviderAccount(provider, accountUse, currencyCode, financialAccountId) {
  return prisma.enterpriseRetailProviderAccount.upsert({
    where: {
      organizationId_providerId_accountUse_currencyCode: {
        organizationId,
        providerId: provider.id,
        accountUse,
        currencyCode,
      },
    },
    update: {
      providerCode: provider.providerCode,
      financialAccountId,
      isActive: true,
      updatedByUserId: fixture.userId,
      revision: { increment: 1 },
    },
    create: {
      organizationId,
      providerId: provider.id,
      providerCode: provider.providerCode,
      accountUse,
      currencyCode,
      financialAccountId,
      isActive: true,
      createdByUserId: fixture.userId,
    },
  });
}

async function prepareFixture() {
  const user = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!user) throw new Error(`Atomic Retail E2E requires seeded admin ${adminEmail}`);
  fixture.userId = user.id;

  const organization = await prisma.organization.findUnique({ where: { id: organizationId } });
  if (!organization) throw new Error(`Atomic Retail E2E requires organization ${organizationId}`);

  const finance = await prisma.enterpriseFinanceConfiguration.findUnique({ where: { organizationId } });
  if (!finance || finance.readinessStatus !== "READY" || finance.functionalCurrencyCode !== "USD") {
    throw new Error("Atomic Retail E2E requires the canonical Shop 2 READY Finance fixture in USD");
  }

  for (const [index, moduleCode] of ["MOBILE_MONEY_AGENCY", "TELCO_TOPUPS"].entries()) {
    await prisma.enterpriseModule.upsert({
      where: { organizationId_moduleCode: { organizationId, moduleCode } },
      update: { isEnabled: true, requiresPlanLevel: "STARTER" },
      create: {
        organizationId,
        moduleCode,
        labelFr: moduleCode,
        labelEn: moduleCode,
        moduleCategory: "SHOP2_E2E",
        isEnabled: true,
        isCore: false,
        requiresPlanLevel: "STARTER",
        sortOrder: 980 + index,
      },
    });
  }

  const [cashAccount, bankAccount] = await Promise.all([
    prisma.enterpriseFinancialAccount.findFirst({
      where: { organizationId, code: "SHOP2-E2E-CASH", accountType: "CASH", currencyCode: "USD", status: "ACTIVE", archivedAt: null },
    }),
    prisma.enterpriseFinancialAccount.findFirst({
      where: { organizationId, code: "SHOP2-E2E-BANK", accountType: "BANK", currencyCode: "USD", status: "ACTIVE", archivedAt: null },
    }),
  ]);
  if (!cashAccount || !bankAccount) throw new Error("Atomic Retail E2E requires seeded USD cash and bank accounts");
  fixture.cashAccountId = cashAccount.id;
  fixture.bankAccountId = bankAccount.id;

  const mobileMapping = await prisma.enterpriseAccountMapping.findFirst({
    where: { organizationId, mappingKey: "MOBILE_MONEY", isActive: true },
    orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }],
  });
  if (!mobileMapping) throw new Error("Atomic Retail E2E requires MOBILE_MONEY semantic mapping");
  const mobileParent = await prisma.enterpriseLedgerAccount.findFirst({
    where: { organizationId, id: mobileMapping.ledgerAccountId, isActive: true, archivedAt: null },
  });
  if (!mobileParent) throw new Error("Atomic Retail E2E requires active MOBILE_MONEY ledger parent");

  const [mobileCdfLedger, mobileUsdLedger, telcoUsdLedger] = await Promise.all([
    ensureLedgerChild(mobileParent, "E2E-MM-AFRI-CDF", "Wallet Afrimoney E2E CDF", "E2E Afrimoney CDF wallet", "CDF"),
    ensureLedgerChild(mobileParent, "E2E-MM-AFRI-USD", "Wallet Afrimoney E2E USD", "E2E Afrimoney USD wallet", "USD"),
    ensureLedgerChild(mobileParent, "E2E-TELCO-AFRICELL-USD", "Float Africell E2E USD", "E2E Africell USD float", "USD"),
  ]);

  const [mobileCdf, mobileUsd, telcoUsd] = await Promise.all([
    ensureFinancialAccount({ code: "E2E-MM-AFRI-CDF", name: "E2E Afrimoney CDF", currencyCode: "CDF", ledgerAccountId: mobileCdfLedger.id }),
    ensureFinancialAccount({ code: "E2E-MM-AFRI-USD", name: "E2E Afrimoney USD", currencyCode: "USD", ledgerAccountId: mobileUsdLedger.id }),
    ensureFinancialAccount({ code: "E2E-TELCO-AFRICELL-USD", name: "E2E Africell USD", currencyCode: "USD", ledgerAccountId: telcoUsdLedger.id }),
  ]);
  fixture.mobileCdfAccountId = mobileCdf.id;
  fixture.mobileUsdAccountId = mobileUsd.id;
  fixture.telcoUsdAccountId = telcoUsd.id;

  const [mobileProvider, telcoProvider] = await Promise.all([
    ensureProvider("AFRIMONEY", "Afrimoney", "MOBILE_MONEY"),
    ensureProvider("AFRICELL", "Africell", "TELCO"),
  ]);
  fixture.mobileProviderId = mobileProvider.id;
  fixture.telcoProviderId = telcoProvider.id;

  await prisma.enterpriseRetailProviderIntegration.updateMany({
    where: { organizationId, providerId: { in: [mobileProvider.id, telcoProvider.id] }, archivedAt: null },
    data: { integrationMode: "MANUAL" },
  });

  await Promise.all([
    mapProviderAccount(mobileProvider, "MOBILE_MONEY_FLOAT", "CDF", mobileCdf.id),
    mapProviderAccount(mobileProvider, "MOBILE_MONEY_FLOAT", "USD", mobileUsd.id),
    mapProviderAccount(telcoProvider, "TELCO_FLOAT", "USD", telcoUsd.id),
  ]);

  const rateDate = new Date("2026-01-01T00:00:00.000Z");
  const existingRate = await prisma.enterpriseExchangeRate.findFirst({
    where: {
      organizationId,
      sourceCurrencyCode: "USD",
      targetCurrencyCode: "CDF",
      rateDate,
      source: "E2E_ATOMIC_602",
    },
  });
  if (existingRate) {
    await prisma.enterpriseExchangeRate.update({
      where: { id: existingRate.id },
      data: { rate: new Prisma.Decimal(2800), precision: 12, status: "ACTIVE" },
    });
  } else {
    await prisma.enterpriseExchangeRate.create({
      data: {
        organizationId,
        sourceCurrencyCode: "USD",
        targetCurrencyCode: "CDF",
        rateDate,
        source: "E2E_ATOMIC_602",
        rate: new Prisma.Decimal(2800),
        precision: 12,
        status: "ACTIVE",
        createdByUserId: user.id,
      },
    });
  }

  const currentPeriod = await prisma.enterpriseFiscalPeriod.findFirst({
    where: {
      organizationId,
      startDate: { lte: new Date() },
      endDate: { gte: new Date() },
      status: { in: ["OPEN", "SOFT_CLOSED"] },
    },
  });
  if (!currentPeriod) throw new Error("Atomic Retail E2E requires an open current fiscal period");
}

async function signIn(page, moduleCode = "MOBILE_MONEY_AGENCY") {
  const response = await page.context().request.post(`${baseUrl}/api/auth/sign-in`, {
    data: {
      email: adminEmail,
      password: adminPassword,
      organizationId,
      next: `/enterprise-modules/${moduleCode}`,
    },
    headers: { origin: baseUrl, referer: `${baseUrl}/auth/sign-in` },
  });
  const body = await response.json().catch(() => null);
  expect(response.ok(), `Atomic Retail E2E sign-in failed: ${JSON.stringify(body)}`).toBeTruthy();
  await page.goto(`/enterprise-modules/${moduleCode}`);
  await page.waitForURL((url) => url.pathname.includes(`/enterprise-modules/${moduleCode}`), { timeout: 30_000 });
  await expect(page.locator("body")).toBeVisible();
}

async function browserPost(page, path, data) {
  return page.evaluate(async ({ path: requestPath, payload }) => {
    const response = await fetch(requestPath, {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await response.json().catch(() => null);
    return { ok: response.ok, status: response.status, body };
  }, { path, payload: data });
}

async function ensureOpenTill(page) {
  const open = await prisma.enterpriseCashSession.findFirst({
    where: {
      organizationId,
      financialAccountId: fixture.cashAccountId,
      cashierUserId: fixture.userId,
      status: "OPEN",
    },
    orderBy: { openedAt: "desc" },
  });
  if (open) return open;

  const created = await browserPost(page, `/api/enterprise/${organizationId}/retail/cash-sessions`, {
    financialAccountId: fixture.cashAccountId,
    openingAmount: 1000,
  });
  expect(created.ok, JSON.stringify(created.body)).toBeTruthy();
  return prisma.enterpriseCashSession.findFirstOrThrow({
    where: {
      organizationId,
      financialAccountId: fixture.cashAccountId,
      cashierUserId: fixture.userId,
      status: "OPEN",
    },
    orderBy: { openedAt: "desc" },
  });
}

async function postedEntry(sourceEntityType, sourceEntityId) {
  return prisma.enterpriseJournalEntry.findFirst({
    where: { organizationId, sourceEntityType, sourceEntityId, status: "POSTED" },
    include: { lines: true },
  });
}

async function accountBalance(id) {
  const account = await prisma.enterpriseFinancialAccount.findUniqueOrThrow({ where: { id } });
  return asNumber(account.operationalBalance);
}

test.describe.serial("Accounting atomic Retail browser acceptance", () => {
  test.beforeAll(async () => {
    await prepareFixture();
  });

  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test("manual Mobile Money, FX and Telco commit once with GL and a closed period rolls everything back", async ({ page }) => {
    await signIn(page, "MOBILE_MONEY_AGENCY");
    await ensureOpenTill(page);

    const stamp = Date.now();

    const mobileKey = `e2e-602-mm-${stamp}`;
    const mobilePayload = {
      providerCode: "AFRIMONEY",
      transactionType: "DEPOSIT",
      customerPhone: "+243810006020",
      currencyCode: "USD",
      principalAmount: 10,
      customerFeeAmount: 0,
      providerCommissionAmount: 0,
      feeCollectionMode: "NONE",
      cashAccountId: fixture.cashAccountId,
      externalReference: `E2E-602-MM-${stamp}`,
      idempotencyKey: mobileKey,
    };
    const mobileBefore = await accountBalance(fixture.mobileUsdAccountId);
    const mobile = await browserPost(page, `/api/enterprise/${organizationId}/retail/mobile-money`, mobilePayload);
    expect(mobile.status, JSON.stringify(mobile.body)).toBe(201);
    expect(mobile.body?.outcome).toBe("SUCCESS");
    expect(mobile.body?.mode).toBe("MANUAL");
    expect(mobile.body?.accounting?.journalEntryId).toBeTruthy();
    const mobileId = mobile.body.transaction.id;
    const mobileEntry = await postedEntry("EnterpriseMobileMoneyTransaction", mobileId);
    expect(mobileEntry).toBeTruthy();
    expectBalanced(mobileEntry, "Manual Mobile Money");
    expect(await accountBalance(fixture.mobileUsdAccountId)).toBeCloseTo(mobileBefore - 10, 5);

    const mobileRetry = await browserPost(page, `/api/enterprise/${organizationId}/retail/mobile-money`, mobilePayload);
    expect(mobileRetry.status, JSON.stringify(mobileRetry.body)).toBe(200);
    expect(mobileRetry.body?.transaction?.id).toBe(mobileId);
    expect(mobileRetry.body?.idempotent).toBe(true);
    expect(await prisma.enterpriseMobileMoneyTransaction.count({ where: { organizationId, idempotencyKey: mobileKey } })).toBe(1);
    expect(await prisma.enterpriseJournalEntry.count({ where: { organizationId, sourceEntityType: "EnterpriseMobileMoneyTransaction", sourceEntityId: mobileId } })).toBe(1);
    expect(await accountBalance(fixture.mobileUsdAccountId)).toBeCloseTo(mobileBefore - 10, 5);

    const fxKey = `e2e-602-fx-${stamp}`;
    const fxPayload = {
      providerCode: "AFRIMONEY",
      sourceCurrencyCode: "USD",
      targetCurrencyCode: "CDF",
      sourceAmount: 10,
      idempotencyKey: fxKey,
    };
    const usdBeforeFx = await accountBalance(fixture.mobileUsdAccountId);
    const cdfBeforeFx = await accountBalance(fixture.mobileCdfAccountId);
    const fx = await browserPost(page, `/api/enterprise/${organizationId}/retail/mobile-money/fx`, fxPayload);
    expect(fx.status, JSON.stringify(fx.body)).toBe(201);
    expect(fx.body?.outcome).toBe("SUCCESS");
    expect(fx.body?.accounting?.status).toBe("POSTED");
    const fxId = fx.body.transfer.id;
    const fxEntry = await postedEntry("EnterpriseMobileMoneyFxTransfer", fxId);
    expect(fxEntry).toBeTruthy();
    expectBalanced(fxEntry, "Manual Mobile Money FX");
    expect(await accountBalance(fixture.mobileUsdAccountId)).toBeCloseTo(usdBeforeFx - 10, 5);
    expect(await accountBalance(fixture.mobileCdfAccountId)).toBeCloseTo(cdfBeforeFx + 28_000, 5);

    const fxRetry = await browserPost(page, `/api/enterprise/${organizationId}/retail/mobile-money/fx`, fxPayload);
    expect(fxRetry.status, JSON.stringify(fxRetry.body)).toBe(200);
    expect(fxRetry.body?.transfer?.id).toBe(fxId);
    expect(fxRetry.body?.idempotent).toBe(true);
    expect(await prisma.enterpriseMobileMoneyFxTransfer.count({ where: { organizationId, idempotencyKey: fxKey } })).toBe(1);
    expect(await prisma.enterpriseJournalEntry.count({ where: { organizationId, sourceEntityType: "EnterpriseMobileMoneyFxTransfer", sourceEntityId: fxId } })).toBe(1);
    expect(await accountBalance(fixture.mobileUsdAccountId)).toBeCloseTo(usdBeforeFx - 10, 5);
    expect(await accountBalance(fixture.mobileCdfAccountId)).toBeCloseTo(cdfBeforeFx + 28_000, 5);

    await page.goto("/enterprise-modules/TELCO_TOPUPS");
    await page.waitForURL((url) => url.pathname.includes("/enterprise-modules/TELCO_TOPUPS"), { timeout: 30_000 });
    const telcoKey = `e2e-602-telco-${stamp}`;
    const telcoPayload = {
      providerCode: "AFRICELL",
      destinationPhone: "+243810006021",
      offerLabel: "E2E Atomic bundle",
      currencyCode: "USD",
      saleAmount: 10,
      operatorCost: 9,
      tenderFinancialAccountId: fixture.bankAccountId,
      externalReference: `E2E-602-TELCO-${stamp}`,
      status: "SUCCESS",
      idempotencyKey: telcoKey,
    };
    const telcoBefore = await accountBalance(fixture.telcoUsdAccountId);
    const telco = await browserPost(page, `/api/enterprise/${organizationId}/retail/telco-topups`, telcoPayload);
    expect(telco.status, JSON.stringify(telco.body)).toBe(201);
    expect(telco.body?.outcome).toBe("SUCCESS");
    expect(telco.body?.mode).toBe("MANUAL");
    expect(telco.body?.accounting?.journalEntryId).toBeTruthy();
    const telcoId = telco.body.topup.id;
    const telcoEntry = await postedEntry("EnterpriseTelcoTopup", telcoId);
    expect(telcoEntry).toBeTruthy();
    expectBalanced(telcoEntry, "Manual Telco topup");
    expect(await accountBalance(fixture.telcoUsdAccountId)).toBeCloseTo(telcoBefore - 9, 5);

    const telcoRetry = await browserPost(page, `/api/enterprise/${organizationId}/retail/telco-topups`, telcoPayload);
    expect(telcoRetry.status, JSON.stringify(telcoRetry.body)).toBe(200);
    expect(telcoRetry.body?.topup?.id).toBe(telcoId);
    expect(telcoRetry.body?.idempotent).toBe(true);
    expect(await prisma.enterpriseTelcoTopup.count({ where: { organizationId, idempotencyKey: telcoKey } })).toBe(1);
    expect(await prisma.enterpriseJournalEntry.count({ where: { organizationId, sourceEntityType: "EnterpriseTelcoTopup", sourceEntityId: telcoId } })).toBe(1);
    expect(await accountBalance(fixture.telcoUsdAccountId)).toBeCloseTo(telcoBefore - 9, 5);

    await page.goto("/enterprise-modules/MOBILE_MONEY_AGENCY");
    const period = await prisma.enterpriseFiscalPeriod.findFirstOrThrow({
      where: {
        organizationId,
        startDate: { lte: new Date() },
        endDate: { gte: new Date() },
        status: { in: ["OPEN", "SOFT_CLOSED"] },
      },
    });
    const periodSnapshot = {
      status: period.status,
      softClosedAt: period.softClosedAt,
      closedAt: period.closedAt,
      lockedAt: period.lockedAt,
      updatedByUserId: period.updatedByUserId,
    };
    const rollbackKey = `e2e-602-rollback-${stamp}`;
    const rollbackPayload = {
      ...mobilePayload,
      principalAmount: 5,
      externalReference: `E2E-602-ROLLBACK-${stamp}`,
      idempotencyKey: rollbackKey,
    };
    const rollbackCashBefore = await accountBalance(fixture.cashAccountId);
    const rollbackFloatBefore = await accountBalance(fixture.mobileUsdAccountId);

    try {
      await prisma.enterpriseFiscalPeriod.update({
        where: { id: period.id },
        data: {
          status: "CLOSED",
          closedAt: new Date(),
          lockedAt: new Date(),
          updatedByUserId: fixture.userId,
        },
      });

      const failed = await browserPost(page, `/api/enterprise/${organizationId}/retail/mobile-money`, rollbackPayload);
      expect(failed.ok).toBe(false);
      expect(failed.body?.ok).toBe(false);
      expect(await prisma.enterpriseMobileMoneyTransaction.count({ where: { organizationId, idempotencyKey: rollbackKey } })).toBe(0);
      expect(await prisma.enterpriseJournalEntry.count({ where: { organizationId, sourceEntityType: "EnterpriseMobileMoneyTransaction", reference: rollbackPayload.externalReference } })).toBe(0);
      expect(await prisma.enterprisePostingBatch.count({ where: { organizationId, sourceEntityType: "EnterpriseMobileMoneyTransaction", sourceEntityId: { startsWith: "e2e-602-rollback" } } })).toBe(0);
      expect(await accountBalance(fixture.cashAccountId)).toBeCloseTo(rollbackCashBefore, 5);
      expect(await accountBalance(fixture.mobileUsdAccountId)).toBeCloseTo(rollbackFloatBefore, 5);
    } finally {
      await prisma.enterpriseFiscalPeriod.update({
        where: { id: period.id },
        data: periodSnapshot,
      });
    }
  });
});