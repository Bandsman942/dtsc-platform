import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ModuleMetric, ModuleMetrics } from "@/components/workspace/module-metrics";

function displayAmounts(rows: Array<{ currency: string; total: Prisma.Decimal | null }>) {
  return rows.map((row) => `${(row.total || new Prisma.Decimal(0)).toFixed(2)} ${row.currency}`).join(" · ") || "0.00 —";
}

/** Read-only DTSC treasury controls. Never mix currencies or mutate ERP client accounts. */
export async function InternalFinanceControls() {
  const [accounts, settledPayments, postedIncome, manualPending, unlinkedInvoices] = await Promise.all([
    prisma.financialAccount.findMany({ select: { id: true, name: true, accountType: true, currency: true, currentBalance: true, reconciliationIssue: true, status: true }, orderBy: [{ currency: "asc" }, { name: "asc" }], take: 200 }),
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
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-dtsc-border bg-dtsc-surface p-4">
        <h3 className="text-lg font-black text-dtsc-ink">Contrôle de trésorerie interne DTSC</h3>
        <p className="mt-2 text-sm leading-6 text-dtsc-muted">Encaissements réellement confirmés, revenus inscrits au registre HR & CFO et comptes par devise. Ce rapprochement ne constitue pas encore un grand livre en partie double ni un relevé bancaire certifié.</p>
      </div>
      <ModuleMetrics label="Rapprochement des abonnements et comptes">
        <ModuleMetric label="Paiements confirmés" value={displayAmounts(settledPayments.map((row) => ({ currency: row.currency, total: row._sum.amount })))} hint="Paiements au statut PAID, par devise" />
        <ModuleMetric label="Revenus abonnements enregistrés" value={displayAmounts(postedIncome.map((row) => ({ currency: row.currency, total: row._sum.amount })))} hint="Écritures validées/payées dans HR & CFO" />
        <ModuleMetric label="Soldes comptes certifiés" value={displayAmounts(balanceRows)} hint="Comptes non signalés uniquement" />
        <ModuleMetric label="Paiements manuels en attente" value={manualPending} />
        <ModuleMetric label="Factures payées sans écriture" value={unlinkedInvoices} hint="Anomalies à examiner" />
        <ModuleMetric label="Comptes à rapprocher" value={flagged.length} hint="Devise absente ou historique hétérogène" />
      </ModuleMetrics>
      {flagged.length ? <div className="rounded-xl border border-amber-500/50 bg-amber-500/10 p-4 text-sm text-dtsc-ink"><p className="font-black">Validation financière requise avant utilisation</p><p className="mt-1">{flagged.map((item) => item.name).join(" · ")}. Les soldes anciens ne sont pas convertis ou attribués automatiquement à une devise.</p></div> : null}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {accounts.map((account) => <article key={account.id} className="rounded-xl border border-dtsc-border bg-dtsc-page p-3"><p className="font-bold text-dtsc-ink">{account.name}</p><p className="mt-1 text-xs text-dtsc-muted">{account.accountType} · {account.status} · {account.currency || "Devise non certifiée"}</p><p className="mt-2 text-lg font-black text-dtsc-ink">{account.reconciliationIssue || !account.currency ? "Rapprochement requis" : `${account.currentBalance.toFixed(2)} ${account.currency}`}</p>{account.reconciliationIssue ? <p className="mt-1 text-xs text-amber-700">{account.reconciliationIssue}</p> : null}</article>)}
      </div>
    </div>
  );
}
