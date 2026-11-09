"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, FileCheck2, Printer, RefreshCw, Search, Send, ShieldCheck, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { toastError, toastSuccess } from "@/lib/client-toast";
import { customerFacingError } from "@/lib/customer-facing-language";
import { browserCivilDate } from "@/lib/enterprise/retail/civil-date";

type QueueInvoice = {
  id: string; siteId: string; canApprove: boolean; canIssue: boolean;
  site: { name: string; code: string };
  invoice: { id: string; revision: number; number: string; status: string; invoiceDate: string; grandTotal: string; currencyCode: string; items: { description: string }[] };
};
type QueuePayload = { items: QueueInvoice[]; sites: { id: string; name: string }[]; pagination: { page: number; pageSize: number; total: number; pageCount: number } };
type Action = "APPROVE" | "REJECT" | "REQUEST_CORRECTION" | "ISSUE";

const dictionary = {
  fr: {
    title: "Circuit de validation et d’émission", description: "Le validateur désigné décide ; le gérant émet uniquement les factures approuvées de sa boutique. Les personnes autorisées dans Finance peuvent également émettre selon leur périmètre.",
    approvals: "À valider par moi", issuance: "Validées · à émettre", search: "N°, article ou désignation", from: "Du", to: "Au", exact: "Date précise", clear: "Effacer", all: "Toutes les boutiques", refresh: "Actualiser", empty: "Aucune facture ne nécessite votre intervention pour cette sélection.", loading: "Chargement des factures…", unavailable: "Impossible de consulter cette file de factures.",
    approve: "Valider", reject: "Refuser", correction: "Demander correction", issue: "Émettre et comptabiliser", reason: "Motif de décision", reasonHint: "Au moins quatre caractères pour un refus ou une correction. La décision reste traçable.", confirm: "Confirmer la décision", cancel: "Annuler", printing: "Aperçu A4", previous: "Précédente", next: "Suivante", saved: "Décision enregistrée dans Finance. Le registre, les créances et les écritures seront actualisés.", failed: "Cette décision n’a pas pu être enregistrée. Actualisez puis réessayez.", pending: "En attente de validation", approved: "Approuvée, non émise",
  },
  en: {
    title: "Approval and issuance workflow", description: "The assigned reviewer decides; store managers issue only approved invoices from their own stores. Authorized Finance users can also issue within their permitted scope.",
    approvals: "Assigned to me", issuance: "Approved · to issue", search: "Number, item or description", from: "From", to: "To", exact: "Exact date", clear: "Clear", all: "All stores", refresh: "Refresh", empty: "No invoice currently requires your action for this selection.", loading: "Loading invoices…", unavailable: "Unable to load the invoice queue.",
    approve: "Approve", reject: "Reject", correction: "Request correction", issue: "Issue and post", reason: "Decision reason", reasonHint: "At least four characters when rejecting or requesting a correction. Every decision is traceable.", confirm: "Confirm decision", cancel: "Cancel", printing: "A4 preview", previous: "Previous", next: "Next", saved: "Decision recorded in Finance. The register, receivables and ledger will be updated.", failed: "This decision could not be recorded. Refresh and try again.", pending: "Awaiting approval", approved: "Approved, not issued",
  },
} as const;

export function RetailInvoiceApprovalWorkbench({ organizationId, locale, preferredSiteId }: { organizationId: string; locale: "fr" | "en"; preferredSiteId?: string }) {
  const t = dictionary[locale];
  const [view, setView] = useState<"approvals" | "issue">("approvals");
  const [data, setData] = useState<QueuePayload | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [siteId, setSiteId] = useState(preferredSiteId || "");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [target, setTarget] = useState<{ entry: QueueInvoice; action: Action } | null>(null);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearch(search), 250);
    return () => window.clearTimeout(timeout);
  }, [search]);
  const load = useCallback(async (signal: AbortSignal) => {
    setLoading(true); setError(""); setData(null);
    try {
      const params = new URLSearchParams({ view, page: String(page), pageSize: "12" });
      if (siteId) params.set("siteId", siteId);
      if (debouncedSearch.trim()) params.set("q", debouncedSearch.trim());
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      const response = await fetch(`/api/enterprise/${organizationId}/retail/invoices/workflow?${params}`, { cache: "no-store", signal });
      const body = await response.json().catch(() => null) as (QueuePayload & { message?: string }) | null;
      if (!response.ok || !body?.items || !body.pagination) throw new Error(body?.message || t.unavailable);
      setData(body);
    } catch (caught) {
      if (!signal.aborted) { setData(null); setError(customerFacingError(caught, locale)); }
    } finally { if (!signal.aborted) setLoading(false); }
  }, [organizationId, locale, t.unavailable, view, page, siteId, debouncedSearch, dateFrom, dateTo]);
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load, refreshKey]);
  const changeView = (next: "approvals" | "issue") => { setView(next); setPage(1); setSiteId(""); };
  const decide = async () => {
    if (!target || saving || (["REJECT", "REQUEST_CORRECTION"].includes(target.action) && reason.trim().length < 4)) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/enterprise/${organizationId}/retail/invoices/${encodeURIComponent(target.entry.invoice.id)}/transition`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: target.action, revision: target.entry.invoice.revision, ...(reason.trim() ? { reason: reason.trim() } : {}) }),
      });
      const body = await response.json().catch(() => null) as { message?: string } | null;
      if (!response.ok) throw new Error(body?.message || t.failed);
      toastSuccess(t.saved); setTarget(null); setReason(""); setRefreshKey((value) => value + 1);
    } catch (caught) { toastError(customerFacingError(caught, locale)); }
    finally { setSaving(false); }
  };
  const money = (value: string, currency: string) => `${new Intl.NumberFormat(locale === "fr" ? "fr-FR" : "en-US", { maximumFractionDigits: 2 }).format(Number(value))} ${currency}`;
  return <section className="min-w-0 max-w-full space-y-4 rounded-2xl border border-dtsc-border bg-dtsc-surface p-4 sm:p-5">
    <header className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h2 className="flex items-center gap-2 font-black text-dtsc-ink"><FileCheck2 className="h-5 w-5 text-dtsc-blue" />{t.title}</h2><p className="mt-1 max-w-3xl text-sm leading-6 text-dtsc-muted">{t.description}</p></div><Button variant="outline" disabled={loading} onClick={() => setRefreshKey((value) => value + 1)}><RefreshCw className="h-4 w-4" />{t.refresh}</Button></header>
    <div data-horizontal-rail className="flex min-w-0 gap-2 overflow-x-auto pb-2" role="tablist"><Button role="tab" aria-selected={view === "approvals"} variant={view === "approvals" ? "default" : "outline"} onClick={() => changeView("approvals")}>{t.approvals}</Button><Button role="tab" aria-selected={view === "issue"} variant={view === "issue" ? "default" : "outline"} onClick={() => changeView("issue")}>{t.issuance}</Button></div>
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-2 lg:grid-cols-4">
      <label className="grid gap-1 text-xs font-bold text-dtsc-ink">{t.search}<span className="flex min-h-11 items-center gap-2 rounded-lg border border-dtsc-border bg-dtsc-page px-2"><Search className="h-4 w-4 text-dtsc-muted"/><input className="min-w-0 flex-1 bg-transparent text-sm outline-none" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} /></span></label>
      <label className="grid gap-1 text-xs font-bold text-dtsc-ink">{t.all}<select className="min-h-11 min-w-0 rounded-lg border border-dtsc-border bg-dtsc-page px-2" value={siteId} onChange={(event) => { setSiteId(event.target.value); setPage(1); }}><option value="">{t.all}</option>{data?.sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}</select></label>
      <label className="grid gap-1 text-xs font-bold text-dtsc-ink">{t.from}<input type="date" value={dateFrom} max={dateTo || undefined} onChange={(event) => { setDateFrom(event.target.value); setPage(1); }} className="min-h-11 min-w-0 rounded-lg border border-dtsc-border bg-dtsc-page px-2" /></label>
      <label className="grid gap-1 text-xs font-bold text-dtsc-ink">{t.to}<input type="date" value={dateTo} min={dateFrom || undefined} onChange={(event) => { setDateTo(event.target.value); setPage(1); }} className="min-h-11 min-w-0 rounded-lg border border-dtsc-border bg-dtsc-page px-2" /></label>
    </div>
    <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => { const exact = dateFrom || dateTo || browserCivilDate(); setDateFrom(exact); setDateTo(exact); setPage(1); }}>{t.exact}</Button><Button variant="ghost" disabled={!dateFrom && !dateTo} onClick={() => { setDateFrom(""); setDateTo(""); setPage(1); }}>{t.clear}</Button></div>
    {loading ? <p role="status" className="text-sm text-dtsc-muted">{t.loading}</p> : null}{error ? <p role="alert" className="rounded-lg bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">{error}</p> : null}
    {!loading && !error && data?.items.length === 0 ? <p className="rounded-xl bg-dtsc-page p-4 text-sm text-dtsc-muted">{t.empty}</p> : null}
    <div className="grid min-w-0 gap-3">{data?.items.map((entry) => <article key={entry.id} className="min-w-0 rounded-xl border border-dtsc-border bg-dtsc-page p-3 sm:p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><h3 className="break-words font-black text-dtsc-ink">{entry.invoice.number} · {entry.site.name}</h3><p className="mt-1 break-words text-xs text-dtsc-muted">{entry.invoice.items.map((line) => line.description).join(" · ")}</p></div><span className={`rounded-full px-3 py-1 text-xs font-bold ${view === "approvals" ? "bg-amber-500/15 text-amber-700 dark:text-amber-300" : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"}`}>{view === "approvals" ? t.pending : t.approved}</span></div><p className="mt-2 text-sm font-bold text-dtsc-ink">{money(entry.invoice.grandTotal, entry.invoice.currencyCode)}</p><div data-responsive-actions className="mt-3 flex min-w-0 flex-wrap gap-2 border-t border-dtsc-border pt-3"><Button variant="outline" onClick={() => window.open(`/api/enterprise/${organizationId}/sales-invoices/${encodeURIComponent(entry.invoice.id)}/print?lang=${locale}`, "_blank", "noopener,noreferrer")}><Printer className="h-4 w-4" />{t.printing}</Button>{entry.canApprove ? <><Button onClick={() => { setTarget({ entry, action: "APPROVE" }); setReason(""); }}><CheckCircle2 className="h-4 w-4" />{t.approve}</Button><Button variant="outline" onClick={() => { setTarget({ entry, action: "REQUEST_CORRECTION" }); setReason(""); }}><Send className="h-4 w-4" />{t.correction}</Button><Button variant="outline" onClick={() => { setTarget({ entry, action: "REJECT" }); setReason(""); }}><XCircle className="h-4 w-4" />{t.reject}</Button></> : null}{entry.canIssue ? <Button onClick={() => { setTarget({ entry, action: "ISSUE" }); setReason(""); }}><ShieldCheck className="h-4 w-4" />{t.issue}</Button> : null}</div></article>)}</div>
    {data && data.pagination.pageCount > 1 ? <div className="flex flex-wrap items-center justify-between gap-2 border-t border-dtsc-border pt-3 text-xs text-dtsc-muted"><span>{data.pagination.total} · {data.pagination.page}/{data.pagination.pageCount}</span><div className="flex gap-2"><Button variant="outline" disabled={page <= 1 || loading} onClick={() => setPage((current) => current - 1)}>{t.previous}</Button><Button variant="outline" disabled={page >= data.pagination.pageCount || loading} onClick={() => setPage((current) => current + 1)}>{t.next}</Button></div></div> : null}
    <Dialog open={Boolean(target)} onClose={() => { if (!saving) setTarget(null); }} title={target ? `${target.entry.invoice.number} · ${target.action === "APPROVE" ? t.approve : target.action === "REJECT" ? t.reject : target.action === "ISSUE" ? t.issue : t.correction}` : ""} description={t.reasonHint} presentation="editor" className="max-w-xl">
      <form onSubmit={(event) => { event.preventDefault(); void decide(); }} className="grid gap-4">{target?.action !== "ISSUE" ? <label className="grid gap-2 text-sm font-semibold text-dtsc-ink">{t.reason}<textarea rows={4} className="min-h-24 w-full rounded-lg border border-dtsc-border bg-dtsc-page p-3" value={reason} onChange={(event) => setReason(event.target.value)} disabled={saving} required={target?.action !== "APPROVE"} minLength={target?.action !== "APPROVE" ? 4 : undefined} maxLength={1000} /></label> : null}<div data-responsive-actions className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" disabled={saving} onClick={() => setTarget(null)}>{t.cancel}</Button><Button type="submit" disabled={saving || Boolean(target && ["REJECT", "REQUEST_CORRECTION"].includes(target.action) && reason.trim().length < 4)}>{t.confirm}</Button></div></form>
    </Dialog>
  </section>;
}
