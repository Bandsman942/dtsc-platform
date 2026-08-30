import { Prisma } from "@prisma/client";
import { publishFinanceEvent } from "@/lib/enterprise/accounting/helpers";

export const SYSTEM_ACCOUNTING_CHART_CODE = "DTSC-SYSTEM-OHADA";

function utcCalendarYearBounds(accountingDate: Date) {
  const year = accountingDate.getUTCFullYear();
  return {
    year,
    startDate: new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0)),
    endDate: new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999)),
  };
}

function utcMonthlyPeriods(year: number) {
  return Array.from({ length: 12 }, (_, month) => {
    const number = String(month + 1).padStart(2, "0");
    return {
      code: `${year}-${number}`,
      startDate: new Date(Date.UTC(year, month, 1, 0, 0, 0, 0)),
      endDate: new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999)),
    };
  });
}

/**
 * Keep the hidden DTSC system ledger postable across calendar years without
 * inventing fiscal policy for companies that already own their accounting setup.
 *
 * The helper is active only while the canonical DTSC system chart is the active
 * chart. Any existing fiscal year covering the date wins, regardless of status;
 * a user-managed closed/draft year is never reopened or replaced automatically.
 */
export async function ensureSystemFiscalCalendarForDateTx(
  tx: Prisma.TransactionClient,
  organizationId: string,
  actorUserId: string,
  accountingDate: Date,
) {
  const activeChart = await tx.enterpriseChartOfAccounts.findFirst({
    where: { organizationId, status: "ACTIVE" },
    orderBy: { updatedAt: "desc" },
    select: { id: true, code: true },
  });
  if (activeChart?.code !== SYSTEM_ACCOUNTING_CHART_CODE) {
    return { managed: false, created: false, fiscalYearId: null as string | null };
  }

  const { year, startDate, endDate } = utcCalendarYearBounds(accountingDate);
  await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`dtsc-system-fiscal:${organizationId}:${year}`}))`);

  const existing = await tx.enterpriseFiscalYear.findFirst({
    where: {
      organizationId,
      startDate: { lte: accountingDate },
      endDate: { gte: accountingDate },
    },
    orderBy: { startDate: "desc" },
  });
  if (existing) {
    return { managed: true, created: false, fiscalYearId: existing.id };
  }

  const fiscalYear = await tx.enterpriseFiscalYear.create({
    data: {
      organizationId,
      code: `DTSC-SYS-FY-${year}`,
      startDate,
      endDate,
      status: "DRAFT",
      createdByUserId: actorUserId,
    },
  });
  await tx.enterpriseFiscalPeriod.createMany({
    data: utcMonthlyPeriods(year).map((period) => ({
      organizationId,
      fiscalYearId: fiscalYear.id,
      code: `DTSC-SYS-${period.code}`,
      startDate: period.startDate,
      endDate: period.endDate,
      status: "OPEN",
      createdByUserId: actorUserId,
    })),
  });
  const opened = await tx.enterpriseFiscalYear.update({
    where: { id: fiscalYear.id },
    data: { status: "OPEN", openedAt: new Date(), revision: { increment: 1 } },
  });
  await publishFinanceEvent(tx, {
    organizationId,
    entityType: "EnterpriseFiscalYear",
    entityId: opened.id,
    eventType: "SYSTEM_FISCAL_CALENDAR_PROVISIONED",
    summary: `DTSC system fiscal calendar ${year} provisioned`,
    actorUserId,
    fromStatus: "DRAFT",
    toStatus: "OPEN",
    metadataJson: {
      systemAccountingContinuity: true,
      chartId: activeChart.id,
      fiscalYearCode: opened.code,
      periodCount: 12,
    },
  });
  return { managed: true, created: true, fiscalYearId: opened.id };
}
