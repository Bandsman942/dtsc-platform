"use client";

import { useCallback, useMemo, useState } from "react";
import { Download, Eye, FileText, LockKeyhole } from "lucide-react";
import { InternalFullScreenSurface } from "@/components/admin/internal-full-screen-surface";
import { BusinessList, BusinessListItem } from "@/components/workspace/business-list";
import { ContextActions } from "@/components/workspace/context-actions";
import { EmptyState } from "@/components/workspace/empty-state";
import { StatusBadge } from "@/components/workspace/status-badge";
import { ListControls } from "@/components/ui/list-controls";
import { Input } from "@/components/ui/input";
import { useSmartList } from "@/lib/hooks/use-smart-list";
import { formatEnumLabel } from "@/lib/labels";
import { useAppLocale } from "@/components/i18n/locale-provider";

type HrcfoInvoiceItem = {
  id: string;
  number: string;
  planName: string;
  amount: number;
  currency: string;
  status: string;
  issuedAt: string;
  beneficiary: string;
  transactionReference: string | null;
};

export function HrcfoInvoiceList({ invoices, canRead }: { invoices: HrcfoInvoiceItem[]; canRead: boolean }) {
  const en = useAppLocale() === "en";
  const ui = en ? { forbidden: "Reading HR/CFO invoices requires the Console HR/CFO permission in DTSC Administration.", heading: "HR/CFO transaction invoices", documents: "documents", from: "From", to: "To", clear: "Clear", all: "All", filter: "Filter invoices by status", search: "Invoice number, beneficiary, reference, amount…", list: "Authorized HR/CFO invoices", view: "View details", download: "Download PDF", empty: "No invoices", noResults: "No document matches these search and date filters.", invoice: "Invoice", detail: "HR/CFO invoice summary", beneficiary: "Beneficiary", service: "Service", amount: "Amount", issued: "Issue date", reference: "Transaction reference", id: "Identifier" } : { forbidden: "La permission Console HR/CFO de lecture des factures est requise dans Administration DTSC.", heading: "Factures des transactions HR/CFO", documents: "documents", from: "Du", to: "Au", clear: "Effacer", all: "Toutes", filter: "Filtrer les factures par statut", search: "N° facture, bénéficiaire, référence, montant…", list: "Factures HR/CFO autorisées", view: "Voir la fiche", download: "Télécharger le PDF", empty: "Aucune facture", noResults: "Aucun document ne correspond aux filtres de recherche et de période.", invoice: "Facture", detail: "Fiche facture HR/CFO", beneficiary: "Bénéficiaire", service: "Prestation", amount: "Montant", issued: "Date d’émission", reference: "Référence transaction", id: "Identifiant" };
  const [status, setStatus] = useState("ALL");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = invoices.find((invoice) => invoice.id === selectedId);
  const close = useCallback(() => setSelectedId(null), []);
  const statuses = useMemo(() => Array.from(new Set(invoices.map((invoice) => invoice.status))), [invoices]);
  const visible = useMemo(() => invoices.filter((invoice) => {
    if (status !== "ALL" && invoice.status !== status) return false;
    const issued = Date.parse(invoice.issuedAt);
    if (start && issued < Date.parse(`${start}T00:00:00`)) return false;
    if (end && issued > Date.parse(`${end}T23:59:59`)) return false;
    return true;
  }), [invoices, status, start, end]);
  const getSearchText = useCallback((invoice: HrcfoInvoiceItem) => [invoice.id, invoice.number, invoice.planName, invoice.beneficiary, invoice.status, invoice.currency, invoice.amount, invoice.transactionReference].join(" "), []);
  const list = useSmartList({ items: visible, pageSize: 12, getSearchText });

  if (!canRead) return (
    <section className="flex min-w-0 items-start gap-3 border-y border-dtsc-border py-4">
      <LockKeyhole className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
      <div><h2 className="font-black text-dtsc-ink">{ui.heading}</h2><p className="mt-1 text-sm text-dtsc-muted">{ui.forbidden}</p></div>
    </section>
  );

  return (
    <section data-dtsc-hrcfo-invoices className="min-w-0 space-y-3">
      <div className="flex min-w-0 items-center justify-between gap-2 border-b border-dtsc-border pb-2"><h2 className="flex items-center gap-2 text-sm font-black text-dtsc-ink"><FileText className="h-4 w-4 text-cyan-600" />{ui.heading}</h2><span className="text-xs text-dtsc-muted">{invoices.length} {ui.documents}</span></div>
      <div className="flex min-w-0 flex-wrap items-end gap-2">
        <label className="grid min-w-0 flex-1 gap-1 text-xs font-bold text-dtsc-muted sm:max-w-48">{ui.from}<Input type="date" value={start} onChange={(event) => setStart(event.target.value)} className="h-10 rounded-lg" /></label>
        <label className="grid min-w-0 flex-1 gap-1 text-xs font-bold text-dtsc-muted sm:max-w-48">{ui.to}<Input type="date" value={end} onChange={(event) => setEnd(event.target.value)} className="h-10 rounded-lg" /></label>
        {start || end ? <button type="button" onClick={() => { setStart(""); setEnd(""); }} className="min-h-10 rounded-lg border border-dtsc-border px-3 text-xs font-bold text-dtsc-blue">{ui.clear}</button> : null}
      </div>
      <nav aria-label={ui.filter} className="flex min-w-0 gap-1.5 overflow-x-auto py-1">
        {["ALL", ...statuses].map((value) => <button type="button" key={value} aria-pressed={status === value} onClick={() => { setStatus(value); list.setPage(1); }} className={`min-h-10 shrink-0 rounded-full border px-3 text-xs font-bold ${status === value ? "border-cyan-400 bg-cyan-400/15 text-dtsc-blue" : "border-dtsc-border text-dtsc-muted"}`}>{value === "ALL" ? ui.all : formatEnumLabel(value)} · {value === "ALL" ? invoices.length : invoices.filter((invoice) => invoice.status === value).length}</button>)}
      </nav>
      <ListControls query={list.query} onQueryChange={list.setQuery} page={list.page} pageCount={list.pageCount} totalCount={list.totalCount} filteredCount={list.filteredCount} onPageChange={list.setPage} placeholder={ui.search} />
      {list.paginatedItems.length ? <BusinessList ariaLabel={ui.list}>
        {list.paginatedItems.map((invoice) => <BusinessListItem key={invoice.id} title={invoice.number} meta={`${invoice.beneficiary} · ${invoice.amount.toFixed(2)} ${invoice.currency}`} status={<StatusBadge>{formatEnumLabel(invoice.status)}</StatusBadge>} className="!py-2" onOpen={() => setSelectedId(invoice.id)} openLabel={`${ui.view}: ${invoice.number}`} actions={<ContextActions label={`Actions ${invoice.number}`} actions={[{ id: "view", label: ui.view, icon: Eye, onSelect: () => setSelectedId(invoice.id) }, { id: "download", label: ui.download, icon: Download, onSelect: () => window.open(`/api/invoices/${invoice.id}/pdf`, "_blank", "noopener,noreferrer") }]} />} />)}
      </BusinessList> : <EmptyState compact title={ui.empty} description={ui.noResults} />}
      <InternalFullScreenSurface open={Boolean(selected)} title={selected?.number || ui.invoice} subtitle={ui.detail} onClose={close} level={2}>
        {selected ? <div data-dtsc-invoice-detail className="min-w-0 space-y-4"><StatusBadge>{formatEnumLabel(selected.status)}</StatusBadge><dl className="grid min-w-0 sm:grid-cols-2">{[[ui.beneficiary, selected.beneficiary], [ui.service, selected.planName], [ui.amount, `${selected.amount.toFixed(2)} ${selected.currency}`], [ui.issued, new Date(selected.issuedAt).toLocaleDateString(en ? "en-GB" : "fr-FR")], [ui.reference, selected.transactionReference || "—"], [ui.id, selected.id]].map(([label, value]) => <div key={label} className="min-w-0 border-b border-dtsc-border p-3"><dt className="text-xs font-bold uppercase text-dtsc-muted">{label}</dt><dd className="mt-1 break-words text-sm font-black text-dtsc-ink">{value}</dd></div>)}</dl><a href={`/api/invoices/${selected.id}/pdf`} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-dtsc-blue px-4 text-sm font-black text-white"><Download className="h-4 w-4" />{ui.download}</a></div> : null}
      </InternalFullScreenSurface>
    </section>
  );
}
