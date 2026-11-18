"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/workspace/status-badge";
import { formatEnterpriseDate } from "@/components/enterprise/core-v2/erp-v2-ui";
import { purchaseFormGuidance, type PurchaseFormGuidanceKey } from "@/lib/enterprise/purchase-form-i18n";

type TraceRow = {
  id: string; receiptReference: string | null; quantity: string; occurredAt: string;
  inventoryItem: { catalogItem: { name: string; code: string; sku: string | null; unitOfMeasure: { symbol: string } | null } };
  warehouse: { name: string; code: string };
  storageLocation: { name: string; code: string } | null;
  stockLot: { lotNumber: string; productionDate: string | null; expiryDate: string | null; status: string; recallReference: string | null } | null;
};
type TraceResponse = { items: TraceRow[]; pagination: { page: number; pageSize: number; total: number; pageCount: number } };

export function PurchaseReceiptTrace({ organizationId, purchaseId, locale }: { organizationId: string; purchaseId: string; locale: string }) {
  const t = (key: PurchaseFormGuidanceKey) => purchaseFormGuidance(locale, key);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [result, setResult] = useState<TraceResponse | null>(null);
  const date = (value: string | null) => value ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(value)) : "—";

  async function load(page: number, query: string) {
    if (busy) return;
    setBusy(true); setFailed(false); setResult(null);
    const params = new URLSearchParams({ view: "receipt-lots", page: String(page), pageSize: "20", search: query });
    try {
      const response = await fetch(`/api/enterprise/${encodeURIComponent(organizationId)}/purchases/${encodeURIComponent(purchaseId)}?${params}`, { cache: "no-store" });
      if (!response.ok) throw new Error("RECEIPT_TRACE_UNAVAILABLE");
      const body = await response.json() as TraceResponse;
      setResult(body); setAppliedSearch(query);
    } catch { setFailed(true); }
    finally { setBusy(false); }
  }

  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); void load(1, search.trim()); }

  return <section data-purchase-receipt-trace className="grid min-w-0 max-w-full grid-cols-[minmax(0,1fr)] gap-3 border-t border-dtsc-border pt-3">
    <div className="min-w-0">
      <h3 className="font-semibold text-dtsc-ink">{t("receiptTraceTitle")}</h3>
      <p className="mt-1 text-xs text-dtsc-muted">{t("receiptTraceHelp")}</p>
    </div>
    {!open ? <Button type="button" variant="outline" onClick={() => { setOpen(true); void load(1, ""); }} className="w-fit max-w-full" aria-expanded={false}>{t("receiptTraceOpen")}</Button> : <>
      <form onSubmit={submit} className="flex min-w-0 flex-wrap gap-2" data-responsive-actions>
        <Input className="min-w-0 flex-1" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("receiptTraceSearch")} aria-label={t("receiptTraceSearch")} maxLength={120} disabled={busy} />
        <Button type="submit" variant="outline" disabled={busy}>{t("receiptTraceOpen")}</Button>
      </form>
      <div aria-live="polite" aria-busy={busy} className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2">
        {busy ? <p className="text-dtsc-muted">…</p> : null}
        {failed ? <p role="alert" className="break-words text-red-700 dark:text-red-300">{t("receiptTraceError")}</p> : null}
        {result && !result.items.length ? <p className="text-dtsc-muted">{t("receiptTraceEmpty")}</p> : null}
        {result?.items.map((row) => {
          const lot = row.stockLot;
          const stateKey: PurchaseFormGuidanceKey = lot?.recallReference ? "receiptTraceRecall" : lot?.status === "AVAILABLE" ? "receiptTraceAvailable" : lot?.status === "BLOCKED" ? "receiptTraceBlocked" : lot?.status === "QUARANTINED" ? "receiptTraceQuarantine" : "receiptTraceOther";
          const product = row.inventoryItem.catalogItem;
          return <article key={row.id} className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1 rounded-xl border border-dtsc-border p-3">
            <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-2"><strong className="min-w-0 break-words text-dtsc-ink">{product.name} · {product.sku || product.code}</strong><span className="font-semibold tabular-nums text-dtsc-ink">{row.quantity} {product.unitOfMeasure?.symbol || ""}</span></div>
            <p className="break-words text-xs text-dtsc-muted">{t("receiptTraceReceipt")} : {row.receiptReference || "—"} · {formatEnterpriseDate(row.occurredAt, locale)}</p>
            <p className="break-words text-xs text-dtsc-muted">{row.warehouse.name}{row.storageLocation ? " · " + row.storageLocation.name : ""}</p>
            <div className="flex min-w-0 flex-wrap items-center gap-2"><span className="min-w-0 break-words font-medium">{lot?.lotNumber || t("receiptTraceNoLot")}</span>{lot ? <StatusBadge tone={lot.recallReference || lot.status === "BLOCKED" || lot.status === "QUARANTINED" ? "warning" : lot.status === "AVAILABLE" ? "success" : "neutral"}>{t(stateKey)}</StatusBadge> : null}</div>
            {lot ? <p className="break-words text-xs text-dtsc-muted">{t("receiptBatchProduction")} : {date(lot.productionDate)} · {t("receiptBatchExpiry")} : {date(lot.expiryDate)}{lot.recallReference ? " · " + lot.recallReference : ""}</p> : null}
          </article>;
        })}
      </div>
      {result ? <div className="flex min-w-0 flex-wrap items-center justify-between gap-2" data-responsive-actions><Button type="button" variant="outline" disabled={busy || result.pagination.page <= 1} onClick={() => void load(result.pagination.page - 1, appliedSearch)}>{t("receiptTracePrevious")}</Button><span className="text-xs tabular-nums text-dtsc-muted">{result.pagination.page} / {result.pagination.pageCount} · {result.pagination.total}</span><Button type="button" variant="outline" disabled={busy || result.pagination.page >= result.pagination.pageCount} onClick={() => void load(result.pagination.page + 1, appliedSearch)}>{t("receiptTraceNext")}</Button></div> : null}
    </>}
  </section>;
}
