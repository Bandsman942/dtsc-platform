import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const baseUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const organizationId = process.env.E2E_ORGANIZATION_ID || "e2e-erp-professional-org";
const adminEmail = process.env.E2E_ADMIN_EMAIL || "erp-admin@example.test";
const adminPassword = process.env.E2E_ADMIN_PASSWORD || "E2eAdmin2026!";

async function enableModule(moduleCode, sortOrder) {
  await prisma.enterpriseModule.upsert({
    where: { organizationId_moduleCode: { organizationId, moduleCode } },
    update: { isEnabled: true },
    create: {
      organizationId,
      moduleCode,
      labelFr: moduleCode,
      labelEn: moduleCode,
      moduleCategory: "HOTFIX_723_E2E",
      isEnabled: true,
      isCore: false,
      requiresPlanLevel: "BUSINESS",
      sortOrder,
    },
  });
}

async function signIn(context) {
  const response = await context.request.post(`${baseUrl}/api/auth/sign-in`, {
    data: { email: adminEmail, password: adminPassword, organizationId, next: "/enterprise-modules/FINANCE_PAYMENTS" },
    headers: { origin: baseUrl, referer: `${baseUrl}/auth/sign-in` },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
}

test.describe.serial("Hotfix #723 Finance integrity", () => {
  let context;
  let admin;

  test.beforeAll(async ({ browser }) => {
    admin = await prisma.user.findUnique({ where: { email: adminEmail } });
    if (!admin) throw new Error("Hotfix #723 requires the canonical ERP E2E admin.");
    for (const [index, moduleCode] of ["FINANCE_PAYMENTS", "FINANCE_TREASURY", "FINANCE_CASH", "FINANCE_ACCOUNTING"].entries()) {
      await enableModule(moduleCode, 17230 + index);
    }
    context = await browser.newContext();
    await signIn(context);
  });

  test.afterAll(async () => {
    await context?.close();
    await prisma.$disconnect();
  });

  test("reversing a confirmed Cash payment compensates balance, Treasury, Cash and journal exactly once", async () => {
    const suffix = Date.now().toString(36).toUpperCase();
    const cashLedger = await prisma.enterpriseLedgerAccount.findFirst({
      where: { organizationId, isActive: true, archivedAt: null, accountSubtype: "CASH" },
      select: { id: true },
    });
    const journal = await prisma.enterpriseJournal.findFirst({
      where: { organizationId, isActive: true },
      orderBy: { createdAt: "asc" },
    });
    const now = new Date();
    const period = await prisma.enterpriseFiscalPeriod.findFirst({
      where: {
        organizationId,
        status: { in: ["OPEN", "SOFT_CLOSED"] },
        fiscalYear: { status: "OPEN" },
        startDate: { lte: now },
        endDate: { gte: now },
      },
      orderBy: { startDate: "desc" },
    });
    if (!cashLedger || !journal || !period) {
      throw new Error("Hotfix #723 requires the canonical open accounting baseline.");
    }

    const account = await prisma.enterpriseFinancialAccount.create({
      data: {
        organizationId,
        code: `H723-CASH-${suffix}`,
        name: `Hotfix 723 cash ${suffix}`,
        accountType: "CASH",
        currencyCode: "CDF",
        openingBalance: 100,
        operationalBalance: 150,
        reconciledBalance: 100,
        availableBalance: 150,
        ledgerAccountId: cashLedger.id,
        responsibleUserId: admin.id,
        status: "ACTIVE",
      },
    });
    const cashSession = await prisma.enterpriseCashSession.create({
      data: {
        organizationId,
        number: `H723-SESSION-${suffix}`,
        financialAccountId: account.id,
        cashierUserId: admin.id,
        status: "OPEN",
        openingAmount: 100,
      },
    });
    const payment = await prisma.enterprisePayment.create({
      data: {
        organizationId,
        number: `H723-PAY-${suffix}`,
        direction: "INBOUND",
        paymentType: "CUSTOMER_PAYMENT",
        methodType: "CASH",
        financialAccountId: account.id,
        cashSessionId: cashSession.id,
        currencyCode: "CDF",
        amount: 50,
        unallocatedAmount: 50,
        paymentDate: now,
        reference: `H723-REF-${suffix}`,
        status: "CONFIRMED",
        initiatedByUserId: `h723-maker-${suffix}`,
        approvedByUserId: `h723-approver-${suffix}`,
        confirmedByUserId: `h723-confirmer-${suffix}`,
        confirmedAt: now,
        idempotencyKey: `h723-payment-${suffix}`,
      },
    });
    const treasury = await prisma.enterpriseTreasuryTransaction.create({
      data: {
        organizationId,
        financialAccountId: account.id,
        paymentId: payment.id,
        transactionType: "CUSTOMER_PAYMENT",
        direction: "INBOUND",
        currencyCode: "CDF",
        amount: 50,
        transactionDate: now,
        reference: payment.reference,
        status: "CONFIRMED",
        createdByUserId: `h723-confirmer-${suffix}`,
      },
    });
    await prisma.enterpriseCashMovement.create({
      data: {
        organizationId,
        cashSessionId: cashSession.id,
        paymentId: payment.id,
        movementType: "CUSTOMER_PAYMENT",
        direction: "INBOUND",
        amount: 50,
        currencyCode: "CDF",
        reference: payment.reference,
        createdByUserId: `h723-confirmer-${suffix}`,
      },
    });
    const originalEntry = await prisma.enterpriseJournalEntry.create({
      data: {
        organizationId,
        number: `H723-JE-${suffix}`,
        journalId: journal.id,
        fiscalPeriodId: period.id,
        accountingDate: now,
        documentDate: now,
        reference: payment.number,
        description: "Hotfix #723 payment posting fixture",
        sourceModule: "FINANCE_PAYMENTS",
        sourceEntityType: "EnterprisePayment",
        sourceEntityId: payment.id,
        postingEvent: "CUSTOMER_PAYMENT_CONFIRMED",
        postingVersion: 1,
        idempotencyKey: `${organizationId}:H723:PAYMENT:${payment.id}`,
        status: "POSTED",
        totalDebit: 50,
        totalCredit: 50,
        functionalCurrencyCode: "CDF",
        preparedByUserId: `h723-maker-${suffix}`,
        approvedByUserId: `h723-approver-${suffix}`,
        postedByUserId: `h723-confirmer-${suffix}`,
        postedAt: now,
        lines: {
          create: [
            {
              organizationId,
              ledgerAccountId: cashLedger.id,
              description: "Hotfix #723 debit",
              debit: 50,
              credit: 0,
              transactionCurrencyCode: "CDF",
              transactionAmount: 50,
              exchangeRate: 1,
              functionalAmount: 50,
            },
            {
              organizationId,
              ledgerAccountId: cashLedger.id,
              description: "Hotfix #723 credit",
              debit: 0,
              credit: 50,
              transactionCurrencyCode: "CDF",
              transactionAmount: 50,
              exchangeRate: 1,
              functionalAmount: 50,
            },
          ],
        },
      },
    });

    const response = await context.request.post(
      `${baseUrl}/api/enterprise/${organizationId}/payments/${payment.id}/transition`,
      {
        data: { action: "REVERSE", revision: payment.revision, reason: "Correction E2E #723" },
        headers: { origin: baseUrl, referer: `${baseUrl}/enterprise-modules/FINANCE_PAYMENTS` },
      },
    );
    const body = await response.json().catch(() => null);
    expect(response.ok(), JSON.stringify(body)).toBeTruthy();
    expect(body?.payment?.status).toBe("REVERSED");

    const [persistedPayment, persistedAccount, persistedTreasury, cashMovements, original, reversal] = await Promise.all([
      prisma.enterprisePayment.findUniqueOrThrow({ where: { id: payment.id } }),
      prisma.enterpriseFinancialAccount.findUniqueOrThrow({ where: { id: account.id } }),
      prisma.enterpriseTreasuryTransaction.findUniqueOrThrow({ where: { id: treasury.id } }),
      prisma.enterpriseCashMovement.findMany({ where: { organizationId, paymentId: payment.id }, orderBy: { createdAt: "asc" } }),
      prisma.enterpriseJournalEntry.findUniqueOrThrow({ where: { id: originalEntry.id } }),
      prisma.enterpriseJournalEntry.findFirst({ where: { organizationId, reversalOfEntryId: originalEntry.id, status: "POSTED" } }),
    ]);

    expect(persistedPayment.status).toBe("REVERSED");
    expect(Number(persistedAccount.operationalBalance)).toBe(100);
    expect(persistedTreasury.status).toBe("REVERSED");
    expect(cashMovements).toHaveLength(2);
    expect(cashMovements.map((item) => [item.direction, item.movementType])).toEqual([
      ["INBOUND", "CUSTOMER_PAYMENT"],
      ["OUTBOUND", "PAYMENT_REVERSAL"],
    ]);
    expect(original.status).toBe("REVERSED");
    expect(reversal?.reversalOfEntryId).toBe(originalEntry.id);

    const replay = await context.request.post(
      `${baseUrl}/api/enterprise/${organizationId}/payments/${payment.id}/transition`,
      {
        data: { action: "REVERSE", revision: persistedPayment.revision, reason: "Replay E2E #723" },
        headers: { origin: baseUrl, referer: `${baseUrl}/enterprise-modules/FINANCE_PAYMENTS` },
      },
    );
    expect(replay.status()).toBe(409);
    expect(await prisma.enterpriseCashMovement.count({ where: { organizationId, paymentId: payment.id } })).toBe(2);
    expect(Number((await prisma.enterpriseFinancialAccount.findUniqueOrThrow({ where: { id: account.id } })).operationalBalance)).toBe(100);
    expect(await prisma.enterpriseJournalReversal.count({ where: { organizationId, originalEntryId: originalEntry.id } })).toBe(1);
  });
});
