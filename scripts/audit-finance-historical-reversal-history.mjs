import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const ZERO = new Prisma.Decimal(0);
const TOLERANCE = new Prisma.Decimal("0.000001");

const organizationArg = process.argv.find((value) => value.startsWith("--organization="));
const organizationId = organizationArg ? organizationArg.slice("--organization=".length).trim() : null;
const failOnFindings = process.argv.includes("--fail-on-findings");

const accountKey = (organizationIdValue, accountId) => `${organizationIdValue}:${accountId}`;
const signed = (direction, amount) => direction === "INBOUND" ? amount : amount.negated();
const absGreaterThanTolerance = (value) => value.abs().greaterThan(TOLERANCE);
const decimalString = (value) => value.toFixed(6);

async function main() {
  const organizationWhere = organizationId ? { organizationId } : {};

  const [accounts, confirmedTreasurySums, reversedPayments] = await Promise.all([
    prisma.enterpriseFinancialAccount.findMany({
      where: { ...organizationWhere, archivedAt: null },
      select: {
        id: true,
        organizationId: true,
        openingBalance: true,
        operationalBalance: true,
      },
      orderBy: [{ organizationId: "asc" }, { id: "asc" }],
    }),
    prisma.enterpriseTreasuryTransaction.groupBy({
      by: ["organizationId", "financialAccountId", "direction"],
      where: { ...organizationWhere, status: "CONFIRMED" },
      _sum: { amount: true },
    }),
    prisma.enterprisePayment.findMany({
      where: { ...organizationWhere, status: "REVERSED" },
      select: {
        id: true,
        organizationId: true,
        financialAccountId: true,
        methodType: true,
        direction: true,
        currencyCode: true,
        amount: true,
      },
      orderBy: [{ organizationId: "asc" }, { id: "asc" }],
    }),
  ]);

  const confirmedNetByAccount = new Map();
  for (const row of confirmedTreasurySums) {
    const key = accountKey(row.organizationId, row.financialAccountId);
    const current = confirmedNetByAccount.get(key) || ZERO;
    const amount = row._sum.amount || ZERO;
    confirmedNetByAccount.set(key, current.plus(signed(row.direction, amount)));
  }

  const accountAudit = accounts.map((account) => {
    const key = accountKey(account.organizationId, account.id);
    const expectedBalance = account.openingBalance.plus(confirmedNetByAccount.get(key) || ZERO);
    const gap = account.operationalBalance.minus(expectedBalance);
    return {
      organizationId: account.organizationId,
      financialAccountId: account.id,
      operationalBalance: decimalString(account.operationalBalance),
      expectedBalance: decimalString(expectedBalance),
      gap: decimalString(gap),
      mismatch: absGreaterThanTolerance(gap),
      gapDecimal: gap,
    };
  });
  const accountAuditByKey = new Map(accountAudit.map((row) => [accountKey(row.organizationId, row.financialAccountId), row]));

  const paymentIds = reversedPayments.map((payment) => payment.id);
  const paymentFilter = paymentIds.length ? { paymentId: { in: paymentIds } } : { paymentId: "__none__" };
  const sourceFilter = paymentIds.length ? { sourceEntityId: { in: paymentIds } } : { sourceEntityId: "__none__" };

  const [treasuryRows, journalEntries, cashMovements] = await Promise.all([
    prisma.enterpriseTreasuryTransaction.findMany({
      where: { ...organizationWhere, ...paymentFilter },
      select: {
        id: true,
        organizationId: true,
        paymentId: true,
        financialAccountId: true,
        status: true,
        direction: true,
        currencyCode: true,
        amount: true,
      },
      orderBy: [{ organizationId: "asc" }, { paymentId: "asc" }, { createdAt: "asc" }],
    }),
    prisma.enterpriseJournalEntry.findMany({
      where: {
        ...organizationWhere,
        sourceEntityType: "EnterprisePayment",
        ...sourceFilter,
      },
      select: {
        id: true,
        organizationId: true,
        sourceEntityId: true,
        status: true,
      },
      orderBy: [{ organizationId: "asc" }, { sourceEntityId: "asc" }, { createdAt: "asc" }],
    }),
    prisma.enterpriseCashMovement.findMany({
      where: { ...organizationWhere, ...paymentFilter },
      select: {
        id: true,
        organizationId: true,
        paymentId: true,
        movementType: true,
        direction: true,
        currencyCode: true,
        amount: true,
      },
      orderBy: [{ organizationId: "asc" }, { paymentId: "asc" }, { createdAt: "asc" }],
    }),
  ]);

  const journalIds = journalEntries.map((entry) => entry.id);
  const reversalRecords = journalIds.length
    ? await prisma.enterpriseJournalReversal.findMany({
        where: {
          ...organizationWhere,
          originalEntryId: { in: journalIds },
        },
        select: {
          organizationId: true,
          originalEntryId: true,
          reversalEntryId: true,
        },
      })
    : [];

  const treasuryByPayment = new Map();
  for (const row of treasuryRows) {
    if (!row.paymentId) continue;
    const rows = treasuryByPayment.get(row.paymentId) || [];
    rows.push(row);
    treasuryByPayment.set(row.paymentId, rows);
  }

  const journalsByPayment = new Map();
  for (const row of journalEntries) {
    if (!row.sourceEntityId) continue;
    const rows = journalsByPayment.get(row.sourceEntityId) || [];
    rows.push(row);
    journalsByPayment.set(row.sourceEntityId, rows);
  }

  const cashByPayment = new Map();
  for (const row of cashMovements) {
    if (!row.paymentId) continue;
    const rows = cashByPayment.get(row.paymentId) || [];
    rows.push(row);
    cashByPayment.set(row.paymentId, rows);
  }

  const reversalByOriginalEntry = new Map(reversalRecords.map((row) => [row.originalEntryId, row]));

  const reversedByAccount = new Map();
  for (const payment of reversedPayments) {
    if (!payment.financialAccountId) continue;
    const key = accountKey(payment.organizationId, payment.financialAccountId);
    const rows = reversedByAccount.get(key) || [];
    rows.push(payment.id);
    reversedByAccount.set(key, rows);
  }

  const reversalAudit = reversedPayments.map((payment) => {
    const treasury = treasuryByPayment.get(payment.id) || [];
    const journals = journalsByPayment.get(payment.id) || [];
    const cash = cashByPayment.get(payment.id) || [];
    const originalCash = cash.filter((row) => !row.movementType.endsWith("_REVERSAL"));
    const cashReversals = cash.filter((row) => row.movementType.endsWith("_REVERSAL"));
    const postedJournals = journals.filter((entry) => entry.status === "POSTED");
    const reversedJournals = journals.filter((entry) => entry.status === "REVERSED");
    const journalsWithoutReversalRecord = journals.filter(
      (entry) => entry.status === "POSTED" && !reversalByOriginalEntry.has(entry.id),
    );
    const account = payment.financialAccountId
      ? accountAuditByKey.get(accountKey(payment.organizationId, payment.financialAccountId))
      : null;

    const issues = [];
    if (!payment.financialAccountId) issues.push("PAYMENT_FINANCIAL_ACCOUNT_MISSING");
    if (treasury.length === 0) issues.push("TREASURY_EFFECT_MISSING");
    if (treasury.some((row) => row.status === "CONFIRMED")) issues.push("TREASURY_STILL_CONFIRMED");
    if (treasury.length > 1) issues.push("TREASURY_EFFECT_AMBIGUOUS");
    if (journalsWithoutReversalRecord.length > 0) issues.push("POSTED_JOURNAL_NOT_REVERSED");
    if (journals.length > 1) issues.push("JOURNAL_EFFECT_AMBIGUOUS");
    if (payment.methodType === "CASH" && originalCash.length > 0 && cashReversals.length === 0) {
      issues.push("CASH_EFFECT_NOT_COMPENSATED");
    }
    if (payment.methodType === "CASH" && originalCash.length > 1) issues.push("CASH_EFFECT_AMBIGUOUS");
    if (account?.mismatch) issues.push("OPERATIONAL_BALANCE_GAP");

    const expectedLegacyGap = signed(payment.direction, payment.amount);
    const oneReversedPaymentOnAccount = payment.financialAccountId
      ? (reversedByAccount.get(accountKey(payment.organizationId, payment.financialAccountId)) || []).length === 1
      : false;
    const treasuryMatchesPayment = treasury.length === 1
      && treasury[0].status === "REVERSED"
      && treasury[0].financialAccountId === payment.financialAccountId
      && treasury[0].direction === payment.direction
      && treasury[0].currencyCode === payment.currencyCode
      && treasury[0].amount.equals(payment.amount);
    const journalIsUnambiguous = journals.length <= 1
      && (journals.length === 0
        || reversedJournals.length === 1
        || (postedJournals.length === 1 && journalsWithoutReversalRecord.length === 1));
    const cashIsUnambiguous = payment.methodType !== "CASH"
      || (originalCash.length === 1 && cashReversals.length <= 1);
    const gapMatchesKnownLegacyEffect = Boolean(account?.mismatch)
      && account.gapDecimal.equals(expectedLegacyGap);

    let classification = "NO_ACTION";
    if (issues.length > 0) {
      classification = (
        oneReversedPaymentOnAccount
        && treasuryMatchesPayment
        && journalIsUnambiguous
        && cashIsUnambiguous
        && gapMatchesKnownLegacyEffect
        && !issues.includes("TREASURY_STILL_CONFIRMED")
      ) ? "AUTO_REPAIR_SAFE" : "AMBIGUOUS";
    }

    return {
      organizationId: payment.organizationId,
      paymentId: payment.id,
      financialAccountId: payment.financialAccountId,
      classification,
      issues,
      evidence: {
        treasuryRows: treasury.length,
        confirmedTreasuryRows: treasury.filter((row) => row.status === "CONFIRMED").length,
        journalRows: journals.length,
        postedJournalRows: postedJournals.length,
        journalReversalRecords: journals.filter((row) => reversalByOriginalEntry.has(row.id)).length,
        cashOriginalRows: originalCash.length,
        cashReversalRows: cashReversals.length,
        accountGap: account ? account.gap : null,
      },
    };
  });

  const report = {
    generatedAt: new Date().toISOString(),
    mode: "READ_ONLY",
    organizationFilter: organizationId,
    tolerance: TOLERANCE.toFixed(6),
    summary: {
      accountsAudited: accountAudit.length,
      accountsWithBalanceMismatch: accountAudit.filter((row) => row.mismatch).length,
      reversedPaymentsAudited: reversalAudit.length,
      reversedPaymentsWithConfirmedTreasury: reversalAudit.filter((row) => row.issues.includes("TREASURY_STILL_CONFIRMED")).length,
      reversedPaymentsWithPostedJournalNotReversed: reversalAudit.filter((row) => row.issues.includes("POSTED_JOURNAL_NOT_REVERSED")).length,
      reversedCashPaymentsWithoutCompensation: reversalAudit.filter((row) => row.issues.includes("CASH_EFFECT_NOT_COMPENSATED")).length,
      autoRepairSafe: reversalAudit.filter((row) => row.classification === "AUTO_REPAIR_SAFE").length,
      ambiguous: reversalAudit.filter((row) => row.classification === "AMBIGUOUS").length,
    },
    accountMismatches: accountAudit
      .filter((row) => row.mismatch)
      .map(({ gapDecimal: _gapDecimal, ...row }) => row),
    reversedPayments: reversalAudit.filter((row) => row.classification !== "NO_ACTION"),
  };

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

  const findings = report.summary.accountsWithBalanceMismatch
    + report.summary.reversedPaymentsWithConfirmedTreasury
    + report.summary.reversedPaymentsWithPostedJournalNotReversed
    + report.summary.reversedCashPaymentsWithoutCompensation;
  if (failOnFindings && findings > 0) process.exitCode = 2;
}

main()
  .catch((error) => {
    console.error("Finance historical reversal audit failed.", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
