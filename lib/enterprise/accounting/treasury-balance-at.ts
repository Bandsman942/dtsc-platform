import { Prisma } from "@prisma/client";
import { enterpriseBusinessCalendarWindows, formatEnterpriseBusinessDate } from "@/lib/enterprise/business-context";

export type TreasuryBalanceAt = {
  accountId: string;
  date: string;
  timezone: string;
  currencyCode: string;
  amount: string | null;
  status: "AVAILABLE" | "BEFORE_ACCOUNT" | "FUTURE_DATE" | "UNVERIFIED_HISTORY";
};

const ExactAmount = Prisma.Decimal.clone({ precision: 48 });

export async function readTreasuryBalanceAt(
  tx: Prisma.TransactionClient,
  organizationId: string,
  accountId: string,
  date: string,
  now = new Date(),
): Promise<TreasuryBalanceAt | null> {
  const [account, organization] = await Promise.all([
    tx.enterpriseFinancialAccount.findFirst({
      where: { organizationId, id: accountId },
      select: { createdAt: true, currencyCode: true, openingBalance: true, operationalBalance: true },
    }),
    tx.organization.findFirst({
      where: { id: organizationId, status: "ACTIVE", deletedAt: null, organizationType: "CLIENT" },
      select: { timezone: true },
    }),
  ]);
  if (!account || !organization) return null;

  const { timezone } = organization;
  const base = { accountId, date, timezone, currencyCode: account.currencyCode, amount: null };
  let asOf: Date;
  try {
    if (date > formatEnterpriseBusinessDate(now, timezone)) return { ...base, status: "FUTURE_DATE" };
    const utcMidnight = new Date(`${date}T00:00:00Z`);
    const anchor = formatEnterpriseBusinessDate(utcMidnight, timezone) === date ? utcMidnight : new Date(`${date}T12:00:00Z`);
    const window = enterpriseBusinessCalendarWindows(anchor, timezone);
    if (window.businessDate !== date) return { ...base, status: "UNVERIFIED_HISTORY" };
    asOf = window.day.lt <= now ? window.day.lt : now;
  } catch {
    return { ...base, status: "UNVERIFIED_HISTORY" };
  }
  if (account.createdAt >= asOf) return { ...base, status: "BEFORE_ACCOUNT" };

  // Mobile Money and funding reversals are recorded as new inverse rows.
  // Payment reversals end the validity of the original row at reversedAt.
  const [totals] = await tx.$queryRaw<Array<{ current: Prisma.Decimal | null; historical: Prisma.Decimal | null; invalid: boolean | null }>>(Prisma.sql`
    WITH scoped AS (
      SELECT status, "transactionDate", "reversedAt", "currencyCode", direction, amount,
        CASE WHEN direction = 'INBOUND' THEN amount ELSE -amount END AS signed
      FROM "EnterpriseTreasuryTransaction"
      WHERE "organizationId" = ${organizationId} AND "financialAccountId" = ${accountId}
    )
    SELECT
      SUM(signed) FILTER (WHERE status = 'CONFIRMED') AS current,
      SUM(signed) FILTER (WHERE "transactionDate" < ${asOf} AND (status = 'CONFIRMED' OR (status = 'REVERSED' AND "reversedAt" >= ${asOf}))) AS historical,
      BOOL_OR("currencyCode" <> ${account.currencyCode} OR direction NOT IN ('INBOUND','OUTBOUND') OR amount < 0
        OR status NOT IN ('CONFIRMED','REVERSED') OR (status = 'REVERSED' AND ("reversedAt" IS NULL OR "reversedAt" < "transactionDate"))) AS invalid
    FROM scoped
  `);
  const opening = new ExactAmount(account.openingBalance);
  if (!totals || totals.invalid || !opening.plus(totals.current ?? 0).equals(account.operationalBalance)) {
    return { ...base, status: "UNVERIFIED_HISTORY" };
  }
  return { ...base, status: "AVAILABLE", amount: opening.plus(totals.historical ?? 0).toFixed() };
}
