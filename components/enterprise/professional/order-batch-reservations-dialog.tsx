"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Boxes, PackageCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { notifyToast } from "@/lib/client-toast";
import { customerFacingError } from "@/lib/customer-facing-language";
import { professionalErpEnumLabel } from "@/components/enterprise/professional/professional-erp-i18n";

const words = {
  fr: { title: "Réservations et préparation des lots", help: "Réservez les lots avant la livraison. Prenez physiquement les quantités indiquées, dans l’ordre proposé. Une réservation ne constitue pas une sortie de stock.", line: "Article de la commande", warehouse: "Dépôt", qty: "Quantité à réserver", choose: "Choisir", reserve: "Réserver en FEFO", release: "Libérer le reliquat", reason: "Motif de libération", reserved: "Réservé", delivered: "Livré", remaining: "Restant", batch: "Lot", expires: "Péremption", noBatch: "Réservation historique non ventilée : libérez le reliquat puis réservez de nouveau.", unavailable: "Lot introuvable", noRows: "Aucune réservation dans cette vue.", noTracked: "Aucun article suivi par lots dans cette commande.", loading: "Chargement des réservations…", loadError: "Impossible de charger les réservations.", saved: "Réservation enregistrée", released: "Reliquat libéré", refused: "Opération refusée", previous: "Précédent", next: "Suivant", close: "Fermer", retail: "Les réservations de cette commande sont pilotées par RETAIL. Utilisez son circuit pour les modifier.", forbidden: "Les droits de consultation Ventes et Stock sont nécessaires.", expired: "Réservation expirée", legacy: "La préparation doit être vérifiée dans le dépôt.", linked: "Consulter / préparer les lots" },
  en: { title: "Reservations and batch picking", help: "Reserve batches before delivering. Physically pick the displayed quantities in the proposed order. A reservation is not a stock issue.", line: "Order item", warehouse: "Warehouse", qty: "Quantity to reserve", choose: "Choose", reserve: "Reserve using FEFO", release: "Release remainder", reason: "Release reason", reserved: "Reserved", delivered: "Delivered", remaining: "Remaining", batch: "Batch", expires: "Expiry", noBatch: "Historical reservation without batch allocation: release the remainder and reserve again.", unavailable: "Batch unavailable", noRows: "No reservations in this view.", noTracked: "There are no batch-tracked items in this order.", loading: "Loading reservations…", loadError: "Unable to load reservations.", saved: "Reservation recorded", released: "Remainder released", refused: "Operation refused", previous: "Previous", next: "Next", close: "Close", retail: "RETAIL manages this order's reservations. Use its workflow to modify them.", forbidden: "Sales and Inventory read rights are required.", expired: "Reservation expired", legacy: "Verify physical picking in the warehouse.", linked: "View / prepare batches" },
} as const;
export const orderBatchCopy = (locale: "fr" | "en") => words[locale];
type Allocation = { lotNumber: string | null; expiryDate: string | null; status: string; location: string | null; quantity: string; fulfilledQuantity: string };
type Reservation = { id: string; salesOrderItemId: string; warehouseId: string; status: string; quantity: string; fulfilledQuantity: string; expiresAt: string | null; canRelease: boolean; allocations: Allocation[] | null };
type Data = { orderItems: Array<{ id: string; description: string; remaining: string }>; warehouses: Array<{ id: string; name: string; code: string; canReserve: boolean }>; items: Reservation[]; pagination: { page: number; pageCount: number }; canReserve: boolean; retailManaged: boolean };

export function OrderBatchReservationsDialog({ organizationId, orderId, reference, locale, onClose }: { organizationId: string; orderId: string; reference: string; locale: "fr" | "en"; onClose: () => void }) {
  const t = words[locale], endpoint = `/api/enterprise/${organizationId}/sales-orders/${orderId}/fulfill`;
  const [data, setData] = useState<Data | null>(null), [page, setPage] = useState(1), [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [lineId, setLineId] = useState(""), [warehouseId, setWarehouseId] = useState(""), [quantity, setQuantity] = useState("");
  const [releaseId, setReleaseId] = useState(""), [reason, setReason] = useState("");
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  const refresh = useCallback(() => setReload((value) => value + 1), []);
  useEffect(() => {
    const abort = new AbortController();
    setLoading(true); setError("");
    void fetch(endpoint + "?page=" + page, { cache: "no-store", signal: abort.signal, headers: { "Accept-Language": locale } })
      .then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(response.status === 403 ? t.forbidden : body.message || t.loadError); if (!abort.signal.aborted) setData(body as Data); })
      .catch((err) => { if (!abort.signal.aborted) { setData(null); setError(customerFacingError(err, locale)); } })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [endpoint, page, reload, locale, t]);
  function changed() { setRequestKey(crypto.randomUUID()); setError(""); }
  async function action(payload: Record<string, unknown>, success: string) {
    setBusy(true); setError("");
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json", "Accept-Language": locale }, body: JSON.stringify(payload) });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.message || t.refused);
      notifyToast(success, "success"); setReleaseId(""); setReason(""); setQuantity(""); setRequestKey(crypto.randomUUID()); setPage(1); refresh();
    } catch (err) { const message = customerFacingError(err, locale); setError(message); notifyToast({ title: t.refused, description: message, tone: "error" }); }
    finally { setBusy(false); }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !data?.canReserve || !lineId || !warehouseId || Number(quantity) <= 0) return;
    void action({ action: "RESERVE", salesOrderItemId: lineId, warehouseId, quantity: Number(quantity), idempotencyKey: requestKey }, t.saved);
  }
  const selected = data?.orderItems.find((item) => item.id === lineId);
  const label = (value: string) => professionalErpEnumLabel(locale, "status", value);
  const format = (value: string | number) => Number(value).toLocaleString(locale, { maximumFractionDigits: 3 });
  return <Dialog open onClose={() => { if (!busy) onClose(); }} title={t.title} description={reference} presentation="editor" className="max-w-4xl">
    <div className="grid min-w-0 gap-4 p-3 sm:p-4">
      <p className="text-sm text-dtsc-muted">{t.help}</p>
      {error ? <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-700 dark:text-red-200">{error}</p> : null}
      {loading ? <p role="status" className="text-sm text-dtsc-muted">{t.loading}</p> : null}
      {data?.retailManaged ? <p className="rounded-xl border border-dtsc-border p-3 text-sm">{t.retail}</p> : null}
      {data && !data.orderItems.length ? <p className="text-sm text-dtsc-muted">{t.noTracked}</p> : null}
      {data?.canReserve && data.orderItems.some((item) => Number(item.remaining) > 0) ? <form onSubmit={submit} className="grid min-w-0 gap-3 rounded-xl border border-dtsc-border p-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm font-semibold sm:col-span-2">{t.line} *<select required value={lineId} disabled={busy} onChange={(event) => { setLineId(event.target.value); setQuantity(""); changed(); }} className="min-h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-page px-2"><option value="">{t.choose}</option>{data.orderItems.filter((item) => Number(item.remaining) > 0).map((item) => <option key={item.id} value={item.id}>{item.description} · {format(item.remaining)}</option>)}</select></label>
        <label className="grid gap-1 text-sm font-semibold">{t.warehouse} *<select required value={warehouseId} disabled={busy} onChange={(event) => { setWarehouseId(event.target.value); changed(); }} className="min-h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-page px-2"><option value="">{t.choose}</option>{data.warehouses.filter((warehouse) => warehouse.canReserve).map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.code} · {warehouse.name}</option>)}</select></label>
        <label className="grid gap-1 text-sm font-semibold">{t.qty} *<Input type="number" min="0.001" max={selected?.remaining || undefined} step="0.001" required disabled={busy} value={quantity} onChange={(event) => { setQuantity(event.target.value); changed(); }} /></label>
        <Button type="submit" disabled={busy || loading || !lineId || !warehouseId || Number(quantity) <= 0} className="sm:col-span-2"><Boxes className="h-4 w-4" />{t.reserve}</Button>
      </form> : null}
      {data?.items.length ? <div className="grid gap-3">{data.items.map((row) => <article key={row.id} className="grid min-w-0 gap-2 rounded-xl border border-dtsc-border bg-dtsc-page p-3">
        <div className="flex flex-wrap justify-between gap-2"><div><p className="break-words text-sm font-bold">{data.orderItems.find((item) => item.id === row.salesOrderItemId)?.description || t.legacy}</p><p className="text-xs text-dtsc-muted">{data.warehouses.find((warehouse) => warehouse.id === row.warehouseId)?.name}</p></div><span className="text-xs font-bold">{row.status === "ACTIVE" && row.expiresAt && new Date(row.expiresAt).getTime() <= Date.now() ? t.expired : label(row.status)}</span></div>
        <p className="text-xs text-dtsc-muted">{t.reserved} {format(row.quantity)} · {t.delivered} {format(row.fulfilledQuantity)} · {t.remaining} {format(Number(row.quantity) - Number(row.fulfilledQuantity))}</p>
        {row.allocations ? row.allocations.map((allocation, index) => <div key={index} className="grid gap-1 rounded-lg border border-dtsc-border p-2 text-xs sm:grid-cols-2"><p className="break-words font-bold">{t.batch} {allocation.lotNumber || t.unavailable}</p><p>{t.expires} {allocation.expiryDate?.slice(0, 10) || "—"}</p><p>{allocation.location || "—"} · {label(allocation.status)}</p><p>{t.remaining} {format(Number(allocation.quantity) - Number(allocation.fulfilledQuantity))}</p></div>) : <p className="text-xs text-amber-700 dark:text-amber-200">{t.noBatch}</p>}
        {row.canRelease ? releaseId === row.id ? <div className="grid gap-2"><Input aria-label={t.reason} placeholder={t.reason} value={reason} disabled={busy} maxLength={500} onChange={(event) => setReason(event.target.value)} /><Button type="button" variant="outline" disabled={busy || reason.trim().length < 3} onClick={() => void action({ action: "RELEASE", reservationId: row.id, reason: reason.trim() }, t.released)}>{t.release}</Button></div> : <Button variant="outline" type="button" size="sm" disabled={busy} onClick={() => { setReleaseId(row.id); setReason(""); }}>{t.release}</Button> : null}
      </article>)}</div> : data ? <p className="text-sm text-dtsc-muted">{t.noRows}</p> : null}
      {data && data.pagination.pageCount > 1 ? <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm">{page}/{data.pagination.pageCount}</span><div className="flex gap-2"><Button variant="outline" disabled={busy || loading || page <= 1} onClick={() => setPage(page - 1)}>{t.previous}</Button><Button variant="outline" disabled={busy || loading || page >= data.pagination.pageCount} onClick={() => setPage(page + 1)}>{t.next}</Button></div></div> : null}
      <Button type="button" variant="outline" disabled={busy} onClick={onClose}><PackageCheck className="h-4 w-4" />{t.close}</Button>
    </div>
  </Dialog>;
}
