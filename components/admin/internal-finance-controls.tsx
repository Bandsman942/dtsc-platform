import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { InternalFinanceControlsClient } from "@/components/admin/internal-finance-controls-client";

function displayAmounts(rows: Array<{ currency: string; total: Prisma.Decimal | null }>) {
  return rows.map((row) => `${(row.total || new Prisma.Decimal(0)).toFixed(2)} ${row.currency}`).join(" · ") || "0.00 —";
}

/** Read-only DTSC treasury controls. Never mix currencies or mutate ERP client accounts. */
export async function InternalFinanceControls() {
  const [accounts, settledPayments, postedIncome, manualPending, unlinkedInvoices] = await Promise.all([
    prisma.financialAccount.findMany({ select: { id: true, name: true, accountType: true, currency: true, currentBalance: true, reconciliationIssue: true, status: true, createdAt: true, updatedAt: true }, orderBy: [{ currency: "asc" }, { name: "asc" }], take: 200 }),
    prisma.payment.groupBy({ by: ["currency"], where: { status: "PAID" }, _sum: { amount: true } }),
    prisma.hrcfoExpense.groupBy({ by: ["currency"], where: { transactionCategory: "IN", status: { in: ["VALIDATED", "PAID"] }, transactionType: "SUBSCRIPTION" }, _sum: { amount: true } }),
    prisma.manualSubscriptionPayment.count({ where: { status: "PENDING_VALIDATION" } }),
    prisma.invoice.count({ where: { status: "PAID", hrcfoTransactionId: null, category: { in: ["PERSONAL_SUBSCRIPTION", "ORGANIZATION_SUBSCRIPTION"] } } }),
  ]);
  const flagged = accounts.filter((account) => !account.currency || Boolean(account.reconciliationIssue));
  const verifiedBalances = new Map<string, Prisma.Decimal>();
  for (const account of accounts) {
    if (!account.currency || account.reconciliationIssue) continue;
    verifiedBalances.set(account.currency, (verifiedBalances.get(account.currency) || new Prisma.Decimal(0)).add(account.currentBalance));
  }
  const balanceRows = [...verifiedBalances].map(([currency, total]) => ({ currency, total }));
  return <InternalFinanceControlsClient
    metrics={[
      { label: "Paiements confirmés", value: displayAmounts(settledPayments.map((row) => ({ currency: row.currency, total: row._sum.amount }))) },
      { label: "Revenus abonnements comptabilisés", value: displayAmounts(postedIncome.map((row) => ({ currency: row.currency, total: row._sum.amount }))) },
      { label: "Soldes des comptes sans anomalie", value: displayAmounts(balanceRows) },
      { label: "Paiements manuels en attente", value: String(manualPending) },
      { label: "Factures payées sans écriture", value: String(unlinkedInvoices) },
      { label: "Comptes à rapprocher", value: String(flagged.length) },
    ]}
    accounts={accounts.map((account) => ({ id: account.id, name: account.name, accountType: account.accountType, currency: account.currency, balance: account.currentBalance.toFixed(2), reconciliationIssue: account.reconciliationIssue, status: account.status, createdAt: account.createdAt.toISOString(), updatedAt: account.updatedAt.toISOString() }))}
  />;
}
