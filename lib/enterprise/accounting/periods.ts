import type { Prisma } from "@prisma/client";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";

export async function getPostingPeriod(
  tx: Prisma.TransactionClient,
  organizationId: string,
  accountingDate: Date,
  options?: { allowSoftClosed?: boolean },
) {
  const period = await tx.enterpriseFiscalPeriod.findFirst({
    where: {
      organizationId,
      startDate: { lte: accountingDate },
      endDate: { gte: accountingDate },
    },
    orderBy: { startDate: "desc" },
  });
  if (!period) throw new EnterpriseAccountingError("FINANCE_PERIOD_NOT_FOUND", 409);
  const allowed = period.status === "OPEN" || (options?.allowSoftClosed && period.status === "SOFT_CLOSED");
  if (!allowed) throw new EnterpriseAccountingError("FINANCE_PERIOD_CLOSED", 409, { periodId: period.id, status: period.status });
  return period;
}

export async function assertPeriodMatchesEntry(
  tx: Prisma.TransactionClient,
  organizationId: string,
  fiscalPeriodId: string,
  accountingDate: Date,
  options?: { allowSoftClosed?: boolean },
) {
  const period = await getPostingPeriod(tx, organizationId, accountingDate, options);
  if (period.id !== fiscalPeriodId) {
    throw new EnterpriseAccountingError("FINANCE_ENTRY_PERIOD_MISMATCH", 409, { expectedPeriodId: period.id, fiscalPeriodId });
  }
  return period;
}

export async function assertDraftDateEditable(
  tx: Prisma.TransactionClient,
  organizationId: string,
  accountingDate: Date,
) {
  const period = await tx.enterpriseFiscalPeriod.findFirst({
    where: { organizationId, startDate: { lte: accountingDate }, endDate: { gte: accountingDate } },
    select: { id: true, status: true },
  });
  if (!period || period.status === "CLOSED" || period.status === "LOCKED") {
    throw new EnterpriseAccountingError("FINANCE_PERIOD_BLOCKS_DRAFT_MUTATION", 409);
  }
  return period;
}
