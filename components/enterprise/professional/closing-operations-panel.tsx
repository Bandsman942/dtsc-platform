"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BookCheck, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { financeDate, financeMoney, financeStatusLabel, financeStatusTone, safeFinanceError, type FinanceLocale } from "@/components/enterprise/professional/finance-professional-ui";
import { StatusBadge } from "@/components/workspace/status-badge";

type Period = { id: string; code: string; status: string; startDate: string; endDate: string; fiscalYear?: { id: string; code: string } | null };
type FiscalYear = { id: string; code: string; status: string; startDate: string; endDate: string; periods?: Period[] };
type Currency = { code: string; name?: string; isActive?: boolean };
type RecentEntry = {
  id: string;
  number: string;
  postingEvent?: string | null;
  accountingDate: string;
  reference?: string | null;
  description: string;
  status: string;
  functionalCurrencyCode: string;
  totalDebit: string | number;
  totalCredit: string | number;
  reversalRecordsAsOriginal?: Array<{ reversalEntry?: { id: string; number: string; accountingDate: string; status: string } | null }>;
};
type Payload = {
  functionalCurrencyCode?: string | null;
  periods?: Period[];
  fiscalYears?: FiscalYear[];
  currencies?: Currency[];
  recentEntries?: RecentEntry[];
  capabilities?: { canRun?: boolean };
};

type Props = { organizationId: string; locale: FinanceLocale; canManage: boolean };

async function requestJson(url: string, fallback: string, options?: RequestInit) {
  const response = await fetch(url, { cache: "no-store", ...options });
  const body = await response.json().catch(() => null) as (Record<string, unknown> & { message?: string; error?: string }) | null;
  if (!response.ok || !body) throw new Error(body?.message || body?.error || fallback);
  return body;
}

export function ClosingOperationsPanel({ organizationId, locale, canManage }: Props) {
  const en = locale === "en";
  const copy = useMemo(() => en ? {
    title: "Closing operations",
    description: "Revalue foreign-currency monetary balances and close the fiscal year into retained earnings on the canonical ledger.",
    refresh: "Refresh",
    fxTitle: "Closing FX revaluation",
    fxDescription: "Uses the latest valid rate at the period end and creates a linked reversal in the next open period.",
    period: "Fiscal period",
    currency: "Foreign currency",
    runFx: "Run FX revaluation",
    yearTitle: "Year-end close",
    yearDescription: "Closes revenue and expense balances into retained earnings without duplicating balance-sheet opening balances.",
    fiscalYear: "Fiscal year",
    closeYear: "Close fiscal year",
    history: "Recent C5 postings",
    empty: "No C5 closing posting yet.",
    successFx: "Closing FX revaluation completed and scheduled reversal created.",
    successYear: "Fiscal year closed into retained earnings.",
    failure: "The closing operation could not be completed.",
    noForeignCurrency: "No active foreign currency is configured.",
    noPeriod: "No open or soft-closed fiscal period is available.",
    noYear: "No fiscal year is currently open for closing.",
    reversal: "Reversal",
  } : {
    title: "Opérations de clôture",
    description: "Réévaluez les soldes monétaires en devises et clôturez l’exercice vers le report à nouveau sur le grand livre canonique.",
    refresh: "Actualiser",
    fxTitle: "Réévaluation FX de clôture",
    fxDescription: "Utilise le dernier taux valide à la fin de période et crée une contrepassation liée dans la prochaine période ouverte.",
    period: "Période comptable",
    currency: "Devise étrangère",
    runFx: "Lancer la réévaluation FX",
    yearTitle: "Clôture annuelle",
    yearDescription: "Solde les produits et charges vers le report à nouveau sans dupliquer les soldes d’ouverture du bilan.",
    fiscalYear: "Exercice",
    closeYear: "Clôturer l’exercice",
    history: "Écritures C5 récentes",
    empty: "Aucune écriture de clôture C5.",
    successFx: "Réévaluation FX terminée et contrepassation planifiée créée.",
    successYear: "Exercice clôturé vers le report à nouveau.",
    failure: "L’opération de clôture n’a pas pu être terminée.",
    noForeignCurrency: "Aucune devise étrangère active n’est configurée.",
    noPeriod: "Aucune période ouverte ou pré-clôturée n’est disponible.",
    noYear: "Aucun exercice ouvert n’est disponible pour la clôture.",
    reversal: "Contrepassation",
  }, [en]);

  const [data, setData] = useState<Payload>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [periodId, setPeriodId] = useState("");
  const [currencyCode, setCurrencyCode] = useState("");
  const [fiscalYearId, setFiscalYearId] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const body = await requestJson(`/api/enterprise/${organizationId}/financial-close/operations`, copy.failure) as Payload;
      setData(body);
      setPeriodId((current) => current || body.periods?.[0]?.id || "");
      const foreign = body.currencies?.find((item) => item.code !== body.functionalCurrencyCode && item.isActive !== false);
      setCurrencyCode((current) => current || foreign?.code || "");
      setFiscalYearId((current) => current || body.fiscalYears?.[0]?.id || "");
    } catch (loadError) {
      setError(safeFinanceError(loadError, copy.failure, locale));
    } finally { setLoading(false); }
  }, [copy.failure, locale, organizationId]);

  useEffect(() => { void load(); }, [load]);

  const foreignCurrencies = (data.currencies || []).filter((item) => item.code !== data.functionalCurrencyCode && item.isActive !== false);
  const canRun = canManage && data.capabilities?.canRun !== false;

  async function runFx() {
    if (!periodId || !currencyCode) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await requestJson(`/api/enterprise/${organizationId}/financial-close/fx-revaluation`, copy.failure, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ fiscalPeriodId: periodId, currencyCode }),
      });
      setNotice(copy.successFx); await load();
    } catch (runError) { setError(safeFinanceError(runError, copy.failure, locale)); }
    finally { setBusy(false); }
  }

  async function closeYear() {
    if (!fiscalYearId) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await requestJson(`/api/enterprise/${organizationId}/financial-close/year-end`, copy.failure, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ fiscalYearId }),
      });
      setNotice(copy.successYear); await load();
    } catch (runError) { setError(safeFinanceError(runError, copy.failure, locale)); }
    finally { setBusy(false); }
  }

  return <div className="min-w-0 space-y-5">
    <div className="flex min-w-0 flex-col gap-3 border-b border-dtsc-border pb-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0"><div className="flex items-center gap-2"><BookCheck className="h-5 w-5 text-dtsc-blue" /><h2 className="font-black text-dtsc-ink">{copy.title}</h2></div><p className="mt-1 max-w-4xl text-sm leading-6 text-dtsc-muted">{copy.description}</p></div>
      <Button variant="outline" onClick={() => void load()} disabled={loading || busy}><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />{copy.refresh}</Button>
    </div>
    {error ? <p className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950/20 dark:text-red-200">{error}</p> : null}
    {notice ? <p className="rounded-xl border border-dtsc-border bg-dtsc-soft p-3 text-sm font-bold text-dtsc-ink">{notice}</p> : null}

    <div className="grid gap-4 lg:grid-cols-2">
      <section className="rounded-2xl border border-dtsc-border bg-dtsc-surface p-4 sm:p-5">
        <h3 className="font-black text-dtsc-ink">{copy.fxTitle}</h3><p className="mt-1 text-sm leading-6 text-dtsc-muted">{copy.fxDescription}</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm font-bold text-dtsc-ink"><span>{copy.period}</span><select className="h-10 w-full rounded-lg border border-dtsc-border bg-dtsc-surface px-3" value={periodId} onChange={(event) => setPeriodId(event.target.value)} disabled={busy || loading}>{(data.periods || []).map((period) => <option key={period.id} value={period.id}>{period.fiscalYear?.code ? `${period.fiscalYear.code} · ` : ""}{period.code} · {financeStatusLabel(period.status, locale)}</option>)}</select></label>
          <label className="space-y-1 text-sm font-bold text-dtsc-ink"><span>{copy.currency}</span><select className="h-10 w-full rounded-lg border border-dtsc-border bg-dtsc-surface px-3" value={currencyCode} onChange={(event) => setCurrencyCode(event.target.value)} disabled={busy || loading}>{foreignCurrencies.map((currency) => <option key={currency.code} value={currency.code}>{currency.code}{currency.name ? ` · ${currency.name}` : ""}</option>)}</select></label>
        </div>
        {!loading && !(data.periods || []).length ? <p className="mt-3 text-sm text-dtsc-muted">{copy.noPeriod}</p> : null}
        {!loading && !foreignCurrencies.length ? <p className="mt-3 text-sm text-dtsc-muted">{copy.noForeignCurrency}</p> : null}
        <Button className="mt-4" disabled={!canRun || busy || !periodId || !currencyCode} onClick={() => void runFx()}>{copy.runFx}</Button>
      </section>

      <section className="rounded-2xl border border-dtsc-border bg-dtsc-surface p-4 sm:p-5">
        <h3 className="font-black text-dtsc-ink">{copy.yearTitle}</h3><p className="mt-1 text-sm leading-6 text-dtsc-muted">{copy.yearDescription}</p>
        <label className="mt-4 block space-y-1 text-sm font-bold text-dtsc-ink"><span>{copy.fiscalYear}</span><select className="h-10 w-full rounded-lg border border-dtsc-border bg-dtsc-surface px-3" value={fiscalYearId} onChange={(event) => setFiscalYearId(event.target.value)} disabled={busy || loading}>{(data.fiscalYears || []).map((year) => <option key={year.id} value={year.id}>{year.code} · {financeStatusLabel(year.status, locale)} · {financeDate(year.startDate, locale)} → {financeDate(year.endDate, locale)}</option>)}</select></label>
        {!loading && !(data.fiscalYears || []).length ? <p className="mt-3 text-sm text-dtsc-muted">{copy.noYear}</p> : null}
        <Button className="mt-4" disabled={!canRun || busy || !fiscalYearId} onClick={() => void closeYear()}>{copy.closeYear}</Button>
      </section>
    </div>

    <section className="min-w-0">
      <h3 className="font-black text-dtsc-ink">{copy.history}</h3>
      {loading ? <p className="py-8 text-center text-sm text-dtsc-muted">…</p> : !(data.recentEntries || []).length ? <p className="mt-3 border-y border-dashed border-dtsc-border py-8 text-center text-sm text-dtsc-muted">{copy.empty}</p> : <div className="mt-3 divide-y divide-dtsc-border border-y border-dtsc-border">{(data.recentEntries || []).map((entry) => {
        const reversal = entry.reversalRecordsAsOriginal?.[0]?.reversalEntry;
        return <article key={entry.id} className="py-4"><div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="font-black text-dtsc-ink">{entry.number}</span><StatusBadge tone={financeStatusTone(entry.status)}>{financeStatusLabel(entry.status, locale)}</StatusBadge></div><p className="mt-1 text-sm text-dtsc-muted">{entry.description} · {financeDate(entry.accountingDate, locale)}</p><p className="mt-1 text-xs text-dtsc-muted">{entry.postingEvent} · {financeMoney(entry.totalDebit, entry.functionalCurrencyCode, locale)}</p>{reversal ? <p className="mt-1 text-xs font-bold text-dtsc-muted">{copy.reversal}: {reversal.number} · {financeDate(reversal.accountingDate, locale)}</p> : null}</div></div></article>;
      })}</div>}
    </section>
  </div>;
}
