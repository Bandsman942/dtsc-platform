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
      <div><h2 className="font-black text-dtsc-ink">Factures HR/CFO</h2><p className="mt-1 text-sm text-dtsc-muted">La permission Console HR/CFO de lecture des factures est requise dans Administration DTSC.</p></div>
    </section>
  );

  return (
    <section data-dtsc-hrcfo-invoices className="min-w-0 space-y-3">
      <div className="flex min-w-0 items-center justify-between gap-2 border-b border-dtsc-border pb-2"><h2 className="flex items-center gap-2 text-sm font-black text-dtsc-ink"><FileText className="h-4 w-4 text-cyan-600" />Factures des transactions HR/CFO</h2><span className="text-xs text-dtsc-muted">{invoices.length} documents</span></div>
      <div className="flex min-w-0 flex-wrap items-end gap-2">
        <label className="grid min-w-0 flex-1 gap-1 text-xs font-bold text-dtsc-muted sm:max-w-48">Du<Input type="date" value={start} onChange={(event) => setStart(event.target.value)} className="h-10 rounded-lg" /></label>
        <label className="grid min-w-0 flex-1 gap-1 text-xs font-bold text-dtsc-muted sm:max-w-48">Au<Input type="date" value={end} onChange={(event) => setEnd(event.target.value)} className="h-10 rounded-lg" /></label>
        {start || end ? <button type="button" onClick={() => { setStart(""); setEnd(""); }} className="min-h-10 rounded-lg border border-dtsc-border px-3 text-xs font-bold text-dtsc-blue">Effacer</button> : null}
      </div>
      <nav aria-label="Filtrer les factures par statut" className="flex min-w-0 gap-1.5 overflow-x-auto py-1">
        {["ALL", ...statuses].map((value) => <button type="button" key={value} aria-pressed={status === value} onClick={() => { setStatus(value); list.setPage(1); }} className={`min-h-10 shrink-0 rounded-full border px-3 text-xs font-bold ${status === value ? "border-cyan-400 bg-cyan-400/15 text-dtsc-blue" : "border-dtsc-border text-dtsc-muted"}`}>{value === "ALL" ? "Toutes" : formatEnumLabel(value)} · {value === "ALL" ? invoices.length : invoices.filter((invoice) => invoice.status === value).length}</button>)}
      </nav>
      <ListControls query={list.query} onQueryChange={list.setQuery} page={list.page} pageCount={list.pageCount} totalCount={list.totalCount} filteredCount={list.filteredCount} onPageChange={list.setPage} placeholder="N° facture, bénéficiaire, référence, montant…" />
      {list.paginatedItems.length ? <BusinessList ariaLabel="Factures HR/CFO autorisées">
        {list.paginatedItems.map((invoice) => <BusinessListItem key={invoice.id} title={invoice.number} meta={`${invoice.beneficiary} · ${invoice.amount.toFixed(2)} ${invoice.currency}`} status={<StatusBadge>{formatEnumLabel(invoice.status)}</StatusBadge>} className="!py-2" onOpen={() => setSelectedId(invoice.id)} openLabel={`Consulter la facture ${invoice.number}`} actions={<ContextActions label={`Actions pour ${invoice.number}`} actions={[{ id: "view", label: "Voir la fiche", icon: Eye, onSelect: () => setSelectedId(invoice.id) }, { id: "download", label: "Télécharger le PDF", icon: Download, onSelect: () => window.open(`/api/invoices/${invoice.id}/pdf`, "_blank", "noopener,noreferrer") }]} />} />)}
      </BusinessList> : <EmptyState compact title="Aucune facture" description="Aucun document ne correspond aux filtres de recherche et de période." />}
      <InternalFullScreenSurface open={Boolean(selected)} title={selected?.number || "Facture"} subtitle="Fiche facture HR/CFO" onClose={close} level={2}>
        {selected ? <div data-dtsc-invoice-detail className="min-w-0 space-y-4"><StatusBadge>{formatEnumLabel(selected.status)}</StatusBadge><dl className="grid min-w-0 sm:grid-cols-2">{[["Bénéficiaire", selected.beneficiary], ["Prestation", selected.planName], ["Montant", `${selected.amount.toFixed(2)} ${selected.currency}`], ["Date d’émission", new Date(selected.issuedAt).toLocaleDateString("fr-FR")], ["Référence transaction", selected.transactionReference || "—"], ["Identifiant", selected.id]].map(([label, value]) => <div key={label} className="min-w-0 border-b border-dtsc-border p-3"><dt className="text-xs font-bold uppercase text-dtsc-muted">{label}</dt><dd className="mt-1 break-words text-sm font-black text-dtsc-ink">{value}</dd></div>)}</dl><a href={`/api/invoices/${selected.id}/pdf`} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-dtsc-blue px-4 text-sm font-black text-white"><Download className="h-4 w-4" />Télécharger le PDF</a></div> : null}
      </InternalFullScreenSurface>
    </section>
  );
}
