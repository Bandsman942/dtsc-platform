"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ArrowRight, ChevronDown, ChevronUp, Clock3, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";

type RecoveryItem = {
  id: string; number: string; status: string; stage: string; createdAt: string;
  invoiceId: string; invoiceNumber: string; invoiceStatus: string;
  invoiceOutstanding: string; invoiceAmountPaid: string;
  siteId: string; siteName: string; currencyCode: string; creditAmount: string;
  payoutAmount: string | null; legacyStandard: boolean; stockAlreadyPosted: boolean;
  stockTreatment: string; hasExternalPayout: boolean;
  creditNoteNumber: string | null; creditStatus: string | null; paymentStatuses: string[];
};
type RecoveryResponse = {
  items: RecoveryItem[];
  pagination: { page: number; pageSize: number; total: number; pageCount: number };
};
const stages = {
  fr: {
    INSPECTION_REQUIRED: "Inspection indépendante à enregistrer",
    RETURN_APPROVAL_REQUIRED: "Décision du validateur désigné requise",
    FINANCE_PREPARATION_REQUIRED: "Préparer l'avoir et les remboursements dans Finance",
    FINANCE_APPROVAL_REQUIRED: "Faire approuver l'avoir et tous les remboursements dans Finance",
    INDEPENDENT_SETTLEMENT_REQUIRED: "Liquidation par un autre intervenant Finance habilité",
    REFUND_CONFIRMATION_REQUIRED: "Confirmer le paiement réel avant clôture",
    FINANCE_CONFLICT_REVIEW: "Pièces Finance déjà liées : contrôler sans créer de duplicata",
  },
  en: {
    INSPECTION_REQUIRED: "Independent inspection required",
    RETURN_APPROVAL_REQUIRED: "Designated approver decision required",
    FINANCE_PREPARATION_REQUIRED: "Prepare credit and refunds in Finance",
    FINANCE_APPROVAL_REQUIRED: "Approve credit and all refunds in Finance",
    INDEPENDENT_SETTLEMENT_REQUIRED: "Settlement by a separate authorized Finance actor",
    REFUND_CONFIRMATION_REQUIRED: "Confirm real payout before closing",
    FINANCE_CONFLICT_REVIEW: "Finance records already linked: review without duplicating",
  },
};
const statuses = ["ALL", "SUBMITTED", "INSPECTED", "APPROVED", "FINANCE_PENDING", "REFUND_PENDING"] as const;

export function RetailHistoricalReturnRecovery({ organizationId, locale, siteId }: {
  organizationId: string; locale: "fr" | "en"; siteId: string;
}) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState("ALL");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<RecoveryResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (controller: AbortController) => {
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams({ status, page: String(page), ...(siteId ? { siteId } : {}), ...(search.trim() ? { q: search.trim() } : {}) });
      const response = await fetch(`/api/enterprise/${encodeURIComponent(organizationId)}/retail/returns/historical?${params}`, { cache: "no-store", signal: controller.signal });
      const payload = await response.json().catch(() => null) as (RecoveryResponse & { message?: string }) | null;
      if (!response.ok || !payload?.items) throw new Error(payload?.message || (locale === "fr" ? "Impossible de lire les anciens retours." : "Unable to read return history."));
      if (!controller.signal.aborted) setData(payload);
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : String(cause));
    } finally { if (!controller.signal.aborted) setLoading(false); }
  }, [organizationId, siteId, status, search, page, locale]);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => void load(controller), search ? 250 : 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [open, load, search]);
  const copy = locale === "fr";
  const money = (amount: string, currency: string) =>
    `${new Intl.NumberFormat(copy ? "fr-FR" : "en-US", { maximumFractionDigits: 2 }).format(Number(amount))} ${currency}`;
  const buttonTitle = copy ? "Reprise des retours historiques" : "Historical return recovery";
  return <section data-testid="retail-historical-return-recovery" className="mt-3 min-w-0 rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-3">
    <button type="button" className="flex w-full min-h-11 items-center justify-between gap-3 text-left font-bold text-dtsc-ink" aria-expanded={open} onClick={() => setOpen(value => !value)}>
      <span className="flex min-w-0 items-center gap-2"><Clock3 className="h-4 w-4 shrink-0 text-cyan-500" />{buttonTitle}</span>
      {open ? <ChevronUp className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
    </button>
    {open ? <div className="mt-3 min-w-0 space-y-3 border-t border-cyan-500/20 pt-3">
      <p className="text-xs leading-5 text-dtsc-muted">{copy
        ? "Retrouvez les dossiers non liquidés et la prochaine étape sécurisée. Les anciennes règles de validation restent obligatoires. Aucune comptabilisation ni remise en stock ne se produit en ouvrant ce registre."
        : "Review unfinished returns and their next authorized step. Original approval requirements still apply. Browsing this register does not post accounting or release inventory."}</p>
      <div className="grid min-w-0 gap-2 sm:grid-cols-2">
        <label className="grid gap-1 text-xs font-semibold text-dtsc-ink">{copy ? "État du retour" : "Return status"}
          <select value={status} onChange={event => { setStatus(event.target.value); setPage(1); }} className="min-h-11 rounded-lg border border-dtsc-border bg-dtsc-surface px-3 text-sm">
            {statuses.map(value => <option key={value} value={value}>{value === "ALL" ? copy ? "Tous les retours ouverts" : "All pending returns" : value}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-semibold text-dtsc-ink">{copy ? "Recherche du retour, de la facture ou de l'avoir" : "Search return, invoice or credit"}
          <span className="flex min-h-11 items-center gap-2 rounded-lg border border-dtsc-border bg-dtsc-surface px-3"><Search className="h-4 w-4 text-dtsc-muted" /><input className="min-w-0 w-full bg-transparent text-sm outline-none" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder="RIR- / INV- / CN-" /></span>
        </label>
      </div>
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <span role="status" className="text-xs text-dtsc-muted">{loading ? copy ? "Analyse des dossiers…" : "Analyzing returns…" : data ? `${data.pagination.total} ${copy ? "dossier(s) en attente" : "pending return(s)"}` : ""}</span>
        <Button variant="outline" size="sm" type="button" disabled={loading} onClick={() => { const controller = new AbortController(); void load(controller); }}><RefreshCw className="h-4 w-4" />{copy ? "Actualiser" : "Refresh"}</Button>
      </div>
      {error ? <p role="alert" className="rounded-lg bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">{error}</p> : null}
      {!loading && data?.items.length === 0 ? <p className="rounded-lg bg-dtsc-page p-3 text-sm text-dtsc-muted">{copy ? "Aucun dossier à reprendre dans cette sélection." : "No pending return matches these filters."}</p> : null}
      <div className="grid gap-2">{data?.items.map(item => {
        const nextStep = stages[locale][item.stage as keyof typeof stages.fr] || item.stage;
        const href = `/enterprise-modules/RETAIL_POS?section=invoices&siteId=${encodeURIComponent(item.siteId)}&q=${encodeURIComponent(item.invoiceNumber)}&returnInvoiceId=${encodeURIComponent(item.invoiceId)}`;
        return <article key={item.id} className="min-w-0 rounded-lg border border-dtsc-border bg-dtsc-surface p-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0"><p className="break-words text-sm font-black text-dtsc-ink">{item.number}</p>
              <p className="text-xs text-dtsc-muted">{item.invoiceNumber} · {item.siteName} · {item.invoiceStatus}</p></div>
            <span className="rounded-full bg-amber-500/10 px-2 py-1 text-xs font-bold text-amber-800 dark:text-amber-200">{item.status}</span>
          </div>
          <p className="mt-2 text-xs font-semibold text-dtsc-ink">{copy ? "Avoir prévu" : "Credit amount"}: {money(item.creditAmount, item.currencyCode)} · {copy ? "Décaissé" : "Paid out"}: {item.payoutAmount === null ? (copy ? "À déterminer" : "To assess") : money(item.payoutAmount, item.currencyCode)}</p>
          {item.creditNoteNumber ? <p className="mt-1 text-xs text-dtsc-muted">{copy ? "Avoir existant" : "Existing credit"}: {item.creditNoteNumber} ({item.creditStatus})</p> : null}
          <p className="mt-2 flex items-start gap-2 text-xs leading-5 text-dtsc-ink"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />{nextStep}</p>
          <p className="mt-1 text-xs text-dtsc-muted">{item.stockTreatment === "RELEASE_PROMISE_ON_COMPLETION"
            ? copy ? "Stock non livré : la réservation ne se libère qu'après liquidation, sans entrée physique." : "Undelivered stock: release the reservation on settlement; no receipt movement."
            : item.stockTreatment === "PHYSICAL_RETURN_ON_COMPLETION"
              ? copy ? "Stock physiquement retourné : réintégration ou isolement suivant le contrôle des lots." : "Physical return: restock or quarantine after batch inspection."
              : copy ? "Aucun mouvement physique de stock requis." : "No physical stock movement required."}
            {item.hasExternalPayout ? copy ? " Paiement externe : confirmation Finance indépendante exigée." : " External payout requires independent Finance confirmation." : ""}</p>
          {item.legacyStandard ? <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">{copy ? "Ancienne politique STANDARD : aucune auto-approbation express rétroactive." : "Original STANDARD policy: no retroactive express self-approval."}</p> : null}
          <div className="mt-2 flex justify-end"><a href={href} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-cyan-500/40 px-3 text-xs font-bold text-dtsc-blue focus-visible:ring-2 focus-visible:ring-cyan-500">{copy ? "Ouvrir le dossier et poursuivre" : "Open return and continue"}<ArrowRight className="h-4 w-4" /></a></div>
        </article>;
      })}</div>
      {data && data.pagination.pageCount > 1 ? <div className="flex items-center justify-between gap-2 text-xs">
        <span>{data.pagination.page} / {data.pagination.pageCount}</span>
        <div className="flex gap-2"><Button variant="outline" size="sm" disabled={loading || page <= 1} onClick={() => setPage(v => Math.max(1, v-1))}>{copy ? "Précédent" : "Previous"}</Button><Button variant="outline" size="sm" disabled={loading || page >= data.pagination.pageCount} onClick={() => setPage(v => v+1)}>{copy ? "Suivant" : "Next"}</Button></div>
      </div> : null}
    </div> : null}
  </section>;
}
