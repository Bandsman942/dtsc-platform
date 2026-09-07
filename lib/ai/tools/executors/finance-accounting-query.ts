import type { AiToolExecutor } from "@/lib/ai/tools/types";
import {
  getAccountingAnomalies,
  getAccountingGeneralLedger,
  getAccountingTrialBalance,
} from "@/lib/enterprise/accounting/accounting-query-service";
import { serializeFinanceValue } from "@/lib/enterprise/accounting/helpers";
import { prisma } from "@/lib/prisma";

type FinanceAccountingReadArgs = { periodDays?: number; limit?: number };

const MAX_QUERY_ROWS = 25;

function period(args: FinanceAccountingReadArgs) {
  const periodDays = Math.min(366, Math.max(1, args.periodDays || 30));
  const limit = Math.min(MAX_QUERY_ROWS, Math.max(1, args.limit || 12));
  const end = new Date();
  return { limit, end, start: new Date(end.getTime() - periodDays * 86_400_000) };
}

function objectData(value: unknown): Record<string, unknown> {
  const serialized = serializeFinanceValue(value);
  return serialized && typeof serialized === "object" && !Array.isArray(serialized)
    ? serialized as Record<string, unknown>
    : { value: serialized };
}

/**
 * FINANCE_ACCOUNTING_READ intentionally consumes the same canonical accounting
 * query service as the Accounting workspace. Authorization remains in the AI
 * Tool Gateway and the FINANCE_ACCOUNTING tool contract; this executor never
 * grants another module or performs a mutation.
 */
export const FINANCE_ACCOUNTING_QUERY_AI_EXECUTORS: Record<string, AiToolExecutor> = {
  FINANCE_ACCOUNTING_READ: async ({ args, context }) => {
    const organizationId = context.organizationId;
    if (!organizationId) throw new Error("ORGANIZATION_CONTEXT_REQUIRED");
    const window = period((args || {}) as FinanceAccountingReadArgs);
    const filters = {
      dateFrom: window.start,
      dateTo: window.end,
      page: 1,
      pageSize: window.limit,
    };

    const [trialBalance, generalLedger, anomalies, openPeriods] = await Promise.all([
      getAccountingTrialBalance(prisma, organizationId, filters),
      getAccountingGeneralLedger(prisma, organizationId, filters),
      getAccountingAnomalies(prisma, organizationId, { ...filters, pageSize: Math.min(window.limit, 10) }),
      prisma.enterpriseFiscalPeriod.count({ where: { organizationId, status: "OPEN" } }),
    ]);

    const balance = trialBalance.items.map((row) => ({
      accountCode: row.code,
      accountName: row.nameFr || row.nameEn,
      accountType: row.accountType,
      currencyCode: row.functionalCurrencyCode,
      openingBalance: row.openingBalance,
      periodDebit: row.periodDebit,
      periodCredit: row.periodCredit,
      closingBalance: row.closingBalance,
    }));
    const ledger = generalLedger.items.map((row) => ({
      entryNumber: row.journalEntry.number,
      accountingDate: row.journalEntry.accountingDate,
      reference: row.journalEntry.reference,
      description: row.description || row.journalEntry.description,
      journalCode: row.journalEntry.journal.code,
      accountCode: row.ledgerAccount.code,
      accountName: row.ledgerAccount.nameFr || row.ledgerAccount.nameEn,
      debit: row.debit,
      credit: row.credit,
      transactionCurrencyCode: row.transactionCurrencyCode,
      transactionAmount: row.transactionAmount,
    }));
    const anomalyItems = anomalies.items.map((row) => ({
      reference: row.reference,
      status: row.status,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));

    const postedLines = generalLedger.pagination.total;
    const count = postedLines + anomalies.pagination.total;
    return {
      toolName: "FINANCE_ACCOUNTING_READ",
      label: "Comptabilité",
      status: count > 0 || balance.length > 0 ? "AVAILABLE" : "EMPTY",
      summary: postedLines
        ? `${postedLines} ligne(s) comptable(s) postée(s) ont été lues depuis le grand livre canonique, avec balance et anomalies sur la période autorisée.`
        : "Aucun mouvement comptable posté sur la période autorisée.",
      asOf: new Date().toISOString(),
      data: objectData({
        periodStart: window.start,
        periodEnd: window.end,
        functionalCurrencyCode: trialBalance.functionalCurrencyCode,
        openPeriods,
        balance,
        ledger,
        anomalies: anomalyItems,
        totals: {
          trialBalanceAccounts: trialBalance.pagination.total,
          generalLedgerLines: generalLedger.pagination.total,
          anomalies: anomalies.pagination.total,
        },
      }),
    };
  },
};
