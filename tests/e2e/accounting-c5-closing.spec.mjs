import { expect, test } from "@playwright/test";
import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const baseUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const organizationId = process.env.E2E_ORGANIZATION_ID || "e2e-erp-professional-org";
const adminEmail = process.env.E2E_ADMIN_EMAIL || "erp-admin@example.test";
const adminPassword = process.env.E2E_ADMIN_PASSWORD || "E2eAdmin2026!";
const accountingPath = "/enterprise-modules/FINANCE_ACCOUNTING";

async function signIn(page) {
  const response = await page.context().request.post(`${baseUrl}/api/auth/sign-in`, {
    data: { email: adminEmail, password: adminPassword, organizationId, next: accountingPath },
    headers: { origin: baseUrl, referer: `${baseUrl}/auth/sign-in` },
  });
  const body = await response.json().catch(() => null);
  expect(response.ok(), `C5 sign-in failed: ${JSON.stringify(body)}`).toBeTruthy();
  return body;
}

async function apiPost(page, path, data) {
  const response = await page.context().request.post(`${baseUrl}${path}`, {
    data,
    headers: { origin: baseUrl, referer: `${baseUrl}${accountingPath}` },
  });
  return { response, body: await response.json().catch(() => null) };
}

function decimal(value = 0) {
  return new Prisma.Decimal(value);
}

async function createPostedEntry({
  number,
  journalId,
  fiscalPeriodId,
  accountingDate,
  description,
  sourceEntityType,
  sourceEntityId,
  postingEvent = null,
  functionalCurrencyCode = "XAF",
  actorUserId,
  lines,
}) {
  const totalDebit = lines.reduce((sum, line) => sum.plus(line.debit || 0), decimal());
  const totalCredit = lines.reduce((sum, line) => sum.plus(line.credit || 0), decimal());
  expect(totalDebit.toFixed(6)).toBe(totalCredit.toFixed(6));
  return prisma.enterpriseJournalEntry.create({
    data: {
      organizationId,
      number,
      journalId,
      fiscalPeriodId,
      accountingDate,
      documentDate: accountingDate,
      reference: sourceEntityId,
      description,
      sourceModule: "FINANCE_ACCOUNTING",
      sourceEntityType,
      sourceEntityId,
      postingEvent,
      postingVersion: 1,
      idempotencyKey: `${organizationId}:C5-FIXTURE:${sourceEntityId}`,
      status: "POSTED",
      totalDebit,
      totalCredit,
      functionalCurrencyCode,
      preparedByUserId: actorUserId,
      approvedByUserId: actorUserId,
      postedByUserId: actorUserId,
      postedAt: new Date(),
      lines: {
        create: lines.map((line) => ({
          ledgerAccountId: line.ledgerAccountId,
          businessPartyId: line.businessPartyId || null,
          projectId: line.projectId || null,
          departmentId: line.departmentId || null,
          siteId: line.siteId || null,
          assetId: line.assetId || null,
          inventoryItemId: line.inventoryItemId || null,
          description: line.description || description,
          debit: decimal(line.debit || 0),
          credit: decimal(line.credit || 0),
          transactionCurrencyCode: line.transactionCurrencyCode || functionalCurrencyCode,
          transactionAmount: decimal(line.transactionAmount ?? (line.debit || line.credit || 0)),
          exchangeRate: decimal(line.exchangeRate || 1),
          functionalAmount: decimal(line.functionalAmount ?? (line.debit || line.credit || 0)),
          analyticReference: line.analyticReference || null,
        })),
      },
    },
    include: { lines: true },
  });
}

async function ensureC5Calendar(actorUserId) {
  const fiscal2026 = await prisma.enterpriseFiscalYear.findFirstOrThrow({ where: { organizationId, code: "FY2026-E2E" } });
  const august = await prisma.enterpriseFiscalPeriod.findFirstOrThrow({ where: { organizationId, code: "2026-08-E2E" } });
  const september = await prisma.enterpriseFiscalPeriod.upsert({
    where: { organizationId_code: { organizationId, code: "2026-09-C5" } },
    update: { status: "OPEN", closedAt: null, lockedAt: null },
    create: {
      organizationId,
      fiscalYearId: fiscal2026.id,
      code: "2026-09-C5",
      startDate: new Date("2026-09-01T00:00:00.000Z"),
      endDate: new Date("2026-09-30T23:59:59.999Z"),
      status: "OPEN",
      createdByUserId: actorUserId,
    },
  });
  const closedOctober = await prisma.enterpriseFiscalPeriod.upsert({
    where: { organizationId_code: { organizationId, code: "2026-10-C5-CLOSED" } },
    update: { status: "CLOSED", closedAt: new Date(), lockedAt: null },
    create: {
      organizationId,
      fiscalYearId: fiscal2026.id,
      code: "2026-10-C5-CLOSED",
      startDate: new Date("2026-10-01T00:00:00.000Z"),
      endDate: new Date("2026-10-31T23:59:59.999Z"),
      status: "CLOSED",
      closedAt: new Date(),
      createdByUserId: actorUserId,
    },
  });

  const fiscal2027 = await prisma.enterpriseFiscalYear.upsert({
    where: { organizationId_code: { organizationId, code: "FY2027-C5" } },
    update: { status: "OPEN", closedAt: null },
    create: {
      organizationId,
      code: "FY2027-C5",
      startDate: new Date("2027-01-01T00:00:00.000Z"),
      endDate: new Date("2027-12-31T23:59:59.999Z"),
      status: "OPEN",
      openedAt: new Date(),
      createdByUserId: actorUserId,
    },
  });
  const period2027 = await prisma.enterpriseFiscalPeriod.upsert({
    where: { organizationId_code: { organizationId, code: "2027-C5" } },
    update: { status: "OPEN", closedAt: null, lockedAt: null },
    create: {
      organizationId,
      fiscalYearId: fiscal2027.id,
      code: "2027-C5",
      startDate: new Date("2027-01-01T00:00:00.000Z"),
      endDate: new Date("2027-12-31T23:59:59.999Z"),
      status: "OPEN",
      createdByUserId: actorUserId,
    },
  });

  const fiscal2028 = await prisma.enterpriseFiscalYear.upsert({
    where: { organizationId_code: { organizationId, code: "FY2028-C5" } },
    update: { status: "OPEN", closedAt: null },
    create: {
      organizationId,
      code: "FY2028-C5",
      startDate: new Date("2028-01-01T00:00:00.000Z"),
      endDate: new Date("2028-12-31T23:59:59.999Z"),
      status: "OPEN",
      openedAt: new Date(),
      createdByUserId: actorUserId,
    },
  });
  const period2028 = await prisma.enterpriseFiscalPeriod.upsert({
    where: { organizationId_code: { organizationId, code: "2028-01-C5" } },
    update: { status: "OPEN", closedAt: null, lockedAt: null },
    create: {
      organizationId,
      fiscalYearId: fiscal2028.id,
      code: "2028-01-C5",
      startDate: new Date("2028-01-01T00:00:00.000Z"),
      endDate: new Date("2028-01-31T23:59:59.999Z"),
      status: "OPEN",
      createdByUserId: actorUserId,
    },
  });

  return { august, september, closedOctober, fiscal2027, period2027, fiscal2028, period2028 };
}

test.describe.serial("Accounting C5 closing FX, year-end and asset disposal", () => {
  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test("is idempotent under retry/concurrency, preserves rate evidence and finalizes disposals", async ({ page }) => {
    const admin = await prisma.user.findUnique({ where: { email: adminEmail } });
    expect(admin).toBeTruthy();
    await signIn(page);

    const calendar = await ensureC5Calendar(admin.id);
    const [adjustmentJournal, assetsJournal, cashAccount, clearingAccount, revenueAccount, expenseAccount, assetAccount, accumulatedAccount, depreciationExpenseAccount] = await Promise.all([
      prisma.enterpriseJournal.findFirstOrThrow({ where: { organizationId, journalType: "ADJUSTMENT", isActive: true } }),
      prisma.enterpriseJournal.findFirstOrThrow({ where: { organizationId, journalType: "ASSETS", isActive: true } }),
      prisma.enterpriseLedgerAccount.findFirstOrThrow({ where: { organizationId, code: "571", isActive: true } }),
      prisma.enterpriseLedgerAccount.findFirstOrThrow({ where: { organizationId, code: "471", isActive: true } }),
      prisma.enterpriseLedgerAccount.findFirstOrThrow({ where: { organizationId, code: "701", isActive: true } }),
      prisma.enterpriseLedgerAccount.findFirstOrThrow({ where: { organizationId, code: "621", isActive: true } }),
      prisma.enterpriseLedgerAccount.findFirstOrThrow({ where: { organizationId, code: "244", isActive: true } }),
      prisma.enterpriseLedgerAccount.findFirstOrThrow({ where: { organizationId, code: "283", isActive: true } }),
      prisma.enterpriseLedgerAccount.findFirstOrThrow({ where: { organizationId, code: "681", isActive: true } }),
    ]);
    const suffix = Date.now().toString(36);

    await prisma.enterpriseCurrency.upsert({
      where: { organizationId_code: { organizationId, code: "USD" } },
      update: { isActive: true, name: "US Dollar", symbol: "$", precision: 2 },
      create: { organizationId, code: "USD", name: "US Dollar", symbol: "$", precision: 2, isActive: true },
    });
    await prisma.enterpriseExchangeRate.upsert({
      where: {
        organizationId_sourceCurrencyCode_targetCurrencyCode_rateDate_source: {
          organizationId,
          sourceCurrencyCode: "USD",
          targetCurrencyCode: "XAF",
          rateDate: new Date("2026-08-31T23:59:59.999Z"),
          source: "C5_E2E",
        },
      },
      update: { rate: decimal(600), status: "ACTIVE" },
      create: {
        organizationId,
        sourceCurrencyCode: "USD",
        targetCurrencyCode: "XAF",
        rateDate: new Date("2026-08-31T23:59:59.999Z"),
        source: "C5_E2E",
        rate: decimal(600),
        status: "ACTIVE",
        createdByUserId: admin.id,
      },
    });

    await createPostedEntry({
      number: `C5-FX-${suffix}`,
      journalId: adjustmentJournal.id,
      fiscalPeriodId: calendar.august.id,
      accountingDate: new Date("2026-08-15T12:00:00.000Z"),
      description: "C5 historical USD cash fixture",
      sourceEntityType: "C5FxHistoricalFixture",
      sourceEntityId: `fx-${suffix}`,
      actorUserId: admin.id,
      lines: [
        { ledgerAccountId: cashAccount.id, debit: 50000, transactionCurrencyCode: "USD", transactionAmount: 100, exchangeRate: 500, functionalAmount: 50000 },
        { ledgerAccountId: clearingAccount.id, credit: 50000, transactionCurrencyCode: "XAF", transactionAmount: 50000, exchangeRate: 1, functionalAmount: 50000 },
      ],
    });

    const fxPath = `/api/enterprise/${organizationId}/financial-close/fx-revaluation`;
    const [fxA, fxB] = await Promise.all([
      apiPost(page, fxPath, { fiscalPeriodId: calendar.august.id, currencyCode: "USD" }),
      apiPost(page, fxPath, { fiscalPeriodId: calendar.august.id, currencyCode: "USD" }),
    ]);
    expect(fxA.response.ok(), JSON.stringify(fxA.body)).toBeTruthy();
    expect(fxB.response.ok(), JSON.stringify(fxB.body)).toBeTruthy();

    const fxSourceEntityId = `${calendar.august.id}:USD`;
    const fxEntries = await prisma.enterpriseJournalEntry.findMany({
      where: { organizationId, sourceEntityType: "EnterpriseFxRevaluation", sourceEntityId: fxSourceEntityId, postingEvent: "FX_CLOSING_REVALUATION_POSTED" },
      include: { lines: true },
    });
    expect(fxEntries).toHaveLength(1);
    expect(fxEntries[0].status).toBe("REVERSED");
    expect(fxEntries[0].totalDebit.toString()).toBe("10000");
    expect(fxEntries[0].totalCredit.toString()).toBe("10000");

    const reversalRecord = await prisma.enterpriseJournalReversal.findFirst({ where: { organizationId, originalEntryId: fxEntries[0].id } });
    expect(reversalRecord).toBeTruthy();
    const reversal = await prisma.enterpriseJournalEntry.findUniqueOrThrow({ where: { id: reversalRecord.reversalEntryId } });
    expect(reversal.fiscalPeriodId).toBe(calendar.september.id);
    expect(reversal.status).toBe("POSTED");
    expect(await prisma.enterpriseJournalReversal.count({ where: { organizationId, originalEntryId: fxEntries[0].id } })).toBe(1);

    const snapshot = await prisma.enterpriseExchangeRateSnapshot.findUnique({
      where: {
        organizationId_sourceEntityType_sourceEntityId_sourceCurrencyCode_targetCurrencyCode: {
          organizationId,
          sourceEntityType: "EnterpriseFxRevaluation",
          sourceEntityId: fxSourceEntityId,
          sourceCurrencyCode: "USD",
          targetCurrencyCode: "XAF",
        },
      },
    });
    expect(snapshot).toBeTruthy();
    expect(snapshot.rate.toString()).toBe("600");
    expect(snapshot.source.startsWith("CLOSING:DIRECT:")).toBeTruthy();

    const fxRetry = await apiPost(page, fxPath, { fiscalPeriodId: calendar.august.id, currencyCode: "USD" });
    expect(fxRetry.response.ok(), JSON.stringify(fxRetry.body)).toBeTruthy();
    expect(await prisma.enterpriseJournalEntry.count({ where: { organizationId, sourceEntityType: "EnterpriseFxRevaluation", sourceEntityId: fxSourceEntityId, postingEvent: "FX_CLOSING_REVALUATION_POSTED" } })).toBe(1);

    const closedSource = `${calendar.closedOctober.id}:USD`;
    const beforeClosed = await prisma.enterpriseJournalEntry.count({ where: { organizationId, sourceEntityType: "EnterpriseFxRevaluation", sourceEntityId: closedSource } });
    const closedAttempt = await apiPost(page, fxPath, { fiscalPeriodId: calendar.closedOctober.id, currencyCode: "USD" });
    expect(closedAttempt.response.status()).toBe(409);
    expect(closedAttempt.body?.error).toBe("FINANCE_PERIOD_CLOSED");
    expect(await prisma.enterpriseJournalEntry.count({ where: { organizationId, sourceEntityType: "EnterpriseFxRevaluation", sourceEntityId: closedSource } })).toBe(beforeClosed);

    const crossTenantAttempt = await apiPost(page, `/api/enterprise/c5-other-tenant/financial-close/fx-revaluation`, { fiscalPeriodId: calendar.august.id, currencyCode: "USD" });
    expect([403, 404]).toContain(crossTenantAttempt.response.status());

    const asset = await prisma.enterpriseAsset.create({
      data: {
        organizationId,
        code: `C5-ASSET-${suffix}`,
        name: "C5 disposal acceptance asset",
        status: "ACTIVE",
        createdByUserId: admin.id,
      },
    });
    const profile = await prisma.enterpriseAssetAccountingProfile.create({
      data: {
        organizationId,
        assetId: asset.id,
        capitalizationSourceType: "C5_E2E",
        originalCost: decimal(100000),
        residualValue: decimal(0),
        usefulLifeMonths: 60,
        inServiceDate: new Date("2027-01-01T00:00:00.000Z"),
        depreciationMethod: "STRAIGHT_LINE",
        depreciationFrequency: "MONTHLY",
        assetAccountId: assetAccount.id,
        accumulatedDepreciationAccountId: accumulatedAccount.id,
        depreciationExpenseAccountId: depreciationExpenseAccount.id,
        currencyCode: "XAF",
        status: "ACTIVE",
      },
    });
    await createPostedEntry({
      number: `C5-CAP-${suffix}`,
      journalId: assetsJournal.id,
      fiscalPeriodId: calendar.period2027.id,
      accountingDate: new Date("2027-01-02T12:00:00.000Z"),
      description: "C5 asset capitalization fixture",
      sourceEntityType: "C5AssetCapitalizationFixture",
      sourceEntityId: `cap-${suffix}`,
      postingEvent: "ASSET_CAPITALIZED",
      actorUserId: admin.id,
      lines: [
        { ledgerAccountId: assetAccount.id, debit: 100000, assetId: asset.id },
        { ledgerAccountId: clearingAccount.id, credit: 100000, assetId: asset.id },
      ],
    });
    const depreciationEntry = await createPostedEntry({
      number: `C5-DEP-${suffix}`,
      journalId: assetsJournal.id,
      fiscalPeriodId: calendar.period2027.id,
      accountingDate: new Date("2027-03-31T12:00:00.000Z"),
      description: "C5 posted depreciation fixture",
      sourceEntityType: "C5DepreciationFixture",
      sourceEntityId: `dep-${suffix}`,
      postingEvent: "ASSET_DEPRECIATION_POSTED",
      actorUserId: admin.id,
      lines: [
        { ledgerAccountId: depreciationExpenseAccount.id, debit: 20000, assetId: asset.id },
        { ledgerAccountId: accumulatedAccount.id, credit: 20000, assetId: asset.id },
      ],
    });
    const postedSchedule = await prisma.enterpriseAssetDepreciationSchedule.create({
      data: {
        organizationId,
        assetAccountingProfileId: profile.id,
        periodCode: `2027-03-${suffix}`,
        scheduledDate: new Date("2027-03-31T12:00:00.000Z"),
        openingNetBookValue: decimal(100000),
        depreciationAmount: decimal(20000),
        closingNetBookValue: decimal(80000),
        status: "POSTED",
        idempotencyKey: `c5-posted-${suffix}`,
        postedAt: new Date("2027-03-31T12:00:00.000Z"),
        journalEntryId: depreciationEntry.id,
      },
    });
    const sameDaySchedule = await prisma.enterpriseAssetDepreciationSchedule.create({
      data: {
        organizationId,
        assetAccountingProfileId: profile.id,
        periodCode: `2027-06-${suffix}`,
        scheduledDate: new Date("2027-06-30T12:00:00.000Z"),
        openingNetBookValue: decimal(80000),
        depreciationAmount: decimal(1000),
        closingNetBookValue: decimal(79000),
        status: "PLANNED",
        idempotencyKey: `c5-same-day-${suffix}`,
      },
    });
    const futureSchedule = await prisma.enterpriseAssetDepreciationSchedule.create({
      data: {
        organizationId,
        assetAccountingProfileId: profile.id,
        periodCode: `2027-07-${suffix}`,
        scheduledDate: new Date("2027-07-31T12:00:00.000Z"),
        openingNetBookValue: decimal(79000),
        depreciationAmount: decimal(1000),
        closingNetBookValue: decimal(78000),
        status: "PLANNED",
        idempotencyKey: `c5-future-${suffix}`,
      },
    });

    const draft = await apiPost(page, `/api/enterprise/${organizationId}/asset-accounting/${profile.id}/disposals`, {
      disposalDate: "2027-06-30T00:00:00.000Z",
      proceedsAmount: "90000",
      proceedsCurrencyCode: "XAF",
      reason: "C5 production-like disposal acceptance",
    });
    expect(draft.response.status(), JSON.stringify(draft.body)).toBe(201);
    expect(draft.body.disposal.status).toBe("DRAFT");
    expect(draft.body.disposal.netBookValue).toBeDefined();

    const postPath = `/api/enterprise/${organizationId}/asset-accounting/${profile.id}/disposals/${draft.body.disposal.id}/post`;
    const postedDisposal = await apiPost(page, postPath, { revision: draft.body.disposal.revision });
    expect(postedDisposal.response.ok(), JSON.stringify(postedDisposal.body)).toBeTruthy();
    const disposalDb = await prisma.enterpriseAssetDisposal.findUniqueOrThrow({ where: { id: draft.body.disposal.id } });
    expect(disposalDb.status).toBe("POSTED");
    expect(disposalDb.journalEntryId).toBeTruthy();
    expect(disposalDb.netBookValue.toString()).toBe("80000");
    expect(disposalDb.gainLoss.toString()).toBe("10000");
    expect((await prisma.enterpriseAssetAccountingProfile.findUniqueOrThrow({ where: { id: profile.id } })).status).toBe("DISPOSED");
    expect((await prisma.enterpriseAssetDepreciationSchedule.findUniqueOrThrow({ where: { id: postedSchedule.id } })).status).toBe("POSTED");
    expect((await prisma.enterpriseAssetDepreciationSchedule.findUniqueOrThrow({ where: { id: sameDaySchedule.id } })).status).toBe("CANCELLED");
    expect((await prisma.enterpriseAssetDepreciationSchedule.findUniqueOrThrow({ where: { id: futureSchedule.id } })).status).toBe("CANCELLED");
    expect(await prisma.enterpriseJournalEntry.count({ where: { organizationId, sourceEntityType: "EnterpriseAssetDisposal", sourceEntityId: disposalDb.id, postingEvent: "ASSET_DISPOSAL_POSTED" } })).toBe(1);

    const disposalRetry = await apiPost(page, postPath, { revision: draft.body.disposal.revision });
    expect(disposalRetry.response.ok(), JSON.stringify(disposalRetry.body)).toBeTruthy();
    expect(await prisma.enterpriseJournalEntry.count({ where: { organizationId, sourceEntityType: "EnterpriseAssetDisposal", sourceEntityId: disposalDb.id, postingEvent: "ASSET_DISPOSAL_POSTED" } })).toBe(1);

    await createPostedEntry({
      number: `C5-YE-REV-${suffix}`,
      journalId: adjustmentJournal.id,
      fiscalPeriodId: calendar.period2027.id,
      accountingDate: new Date("2027-10-10T12:00:00.000Z"),
      description: "C5 year-end revenue fixture",
      sourceEntityType: "C5YearEndFixture",
      sourceEntityId: `ye-rev-${suffix}`,
      actorUserId: admin.id,
      lines: [
        { ledgerAccountId: cashAccount.id, debit: 40000 },
        { ledgerAccountId: revenueAccount.id, credit: 40000 },
      ],
    });
    await createPostedEntry({
      number: `C5-YE-EXP-${suffix}`,
      journalId: adjustmentJournal.id,
      fiscalPeriodId: calendar.period2027.id,
      accountingDate: new Date("2027-10-11T12:00:00.000Z"),
      description: "C5 year-end expense fixture",
      sourceEntityType: "C5YearEndFixture",
      sourceEntityId: `ye-exp-${suffix}`,
      actorUserId: admin.id,
      lines: [
        { ledgerAccountId: expenseAccount.id, debit: 5000 },
        { ledgerAccountId: cashAccount.id, credit: 5000 },
      ],
    });

    const yearEndPath = `/api/enterprise/${organizationId}/financial-close/year-end`;
    const yearEnd = await apiPost(page, yearEndPath, { fiscalYearId: calendar.fiscal2027.id });
    expect(yearEnd.response.ok(), JSON.stringify(yearEnd.body)).toBeTruthy();
    expect((await prisma.enterpriseFiscalYear.findUniqueOrThrow({ where: { id: calendar.fiscal2027.id } })).status).toBe("CLOSED");
    expect((await prisma.enterpriseFiscalYear.findUniqueOrThrow({ where: { id: calendar.fiscal2028.id } })).status).toBe("OPEN");

    const yearEndEntries = await prisma.enterpriseJournalEntry.findMany({
      where: { organizationId, sourceEntityType: "EnterpriseFiscalYear", sourceEntityId: calendar.fiscal2027.id, postingEvent: "YEAR_END_CLOSED" },
      include: { lines: true },
    });
    expect(yearEndEntries).toHaveLength(1);
    const retainedMapping = await prisma.enterpriseAccountMapping.findFirstOrThrow({
      where: { organizationId, mappingKey: "RETAINED_EARNINGS", isActive: true },
      orderBy: { effectiveFrom: "desc" },
    });
    const retainedLine = yearEndEntries[0].lines.find((line) => line.ledgerAccountId === retainedMapping.ledgerAccountId);
    expect(retainedLine).toBeTruthy();
    expect(decimal(retainedLine.debit).plus(retainedLine.credit).gt(0)).toBeTruthy();

    const profitAndLossLines = await prisma.enterpriseJournalLine.findMany({
      where: {
        organizationId,
        ledgerAccount: { accountType: { in: ["REVENUE", "OTHER_INCOME", "EXPENSE", "OTHER_EXPENSE"] } },
        journalEntry: {
          status: { in: ["POSTED", "REVERSED"] },
          accountingDate: { gte: calendar.fiscal2027.startDate, lte: calendar.fiscal2027.endDate },
        },
      },
      select: { debit: true, credit: true },
    });
    const pnlBalance = profitAndLossLines.reduce((sum, line) => sum.plus(line.debit).minus(line.credit), decimal());
    expect(pnlBalance.abs().lte("0.000001")).toBeTruthy();

    const retainedOpeningLines = await prisma.enterpriseJournalLine.findMany({
      where: {
        organizationId,
        ledgerAccountId: retainedMapping.ledgerAccountId,
        journalEntry: { status: { in: ["POSTED", "REVERSED"] }, accountingDate: { lte: calendar.fiscal2027.endDate } },
      },
      select: { debit: true, credit: true },
    });
    const retainedOpening = retainedOpeningLines.reduce((sum, line) => sum.plus(line.debit).minus(line.credit), decimal());
    const closingRetained = decimal(retainedLine.debit).minus(retainedLine.credit);
    expect(retainedOpening.toFixed(6)).toBe(closingRetained.toFixed(6));

    const yearEndRetry = await apiPost(page, yearEndPath, { fiscalYearId: calendar.fiscal2027.id });
    expect(yearEndRetry.response.ok(), JSON.stringify(yearEndRetry.body)).toBeTruthy();
    expect(await prisma.enterpriseJournalEntry.count({ where: { organizationId, sourceEntityType: "EnterpriseFiscalYear", sourceEntityId: calendar.fiscal2027.id, postingEvent: "YEAR_END_CLOSED" } })).toBe(1);
  });
});
