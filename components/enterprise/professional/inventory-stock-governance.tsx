"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Boxes, PackagePlus, Settings2, ShieldCheck, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { notifyToast } from "@/lib/client-toast";
import { customerFacingError } from "@/lib/customer-facing-language";

type Item = { id: string; revision: number; catalogItem: { code: string; name: string }; minimumQuantity: string | number | null; reorderQuantity: string | number | null; lotTracking: boolean; expiryTracking: boolean };
type Warehouse = { id: string; code: string; name: string };
type Lot = { id: string; revision: number; lotNumber: string; warehouseId: string; status: string; productionDate: string | null; expiryDate: string | null; notes: string | null; quantityOnHand: string; quantityReserved: string; inventoryItem: { catalogItem: { name: string; code: string } } };
const dateInput = (value: string | null) => value ? value.slice(0, 10) : "";
const formatDate = (value: string | null, en: boolean) => value ? new Intl.DateTimeFormat(en ? "en-GB" : "fr-FR").format(new Date(value)) : "—";

/** Product master data declares stockability; this workspace owns stock
 * policy and local batch identities. No lot creation changes stock quantity. */
export function InventoryStockGovernance({ organizationId, locale, warehouses }: { organizationId: string; locale: "fr" | "en"; warehouses: Warehouse[] }) {
  const en = locale === "en";
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [itemPage, setItemPage] = useState(1);
  const [itemPages, setItemPages] = useState(1);
  const [itemSearch, setItemSearch] = useState("");
  const [lots, setLots] = useState<Lot[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [search, setSearch] = useState("");
  const [editPolicy, setEditPolicy] = useState<Item | null>(null);
  const [editLot, setEditLot] = useState<Lot | null>(null);
  const [lotDialog, setLotDialog] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const [error, setError] = useState("");
  const refresh = useCallback(() => setReload((value) => value + 1), []);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const query = new URLSearchParams({ page: String(page), search });
    void Promise.all([
      fetch(`/api/enterprise/${organizationId}/inventory?${new URLSearchParams({ page: String(itemPage), pageSize: "50", search: itemSearch })}`, { signal: controller.signal, cache: "no-store" }),
      fetch(`/api/enterprise/${organizationId}/inventory/lots?${query}`, { signal: controller.signal, cache: "no-store" }),
    ]).then(async ([inventoryResponse, lotResponse]) => {
      const inventory = await inventoryResponse.json().catch(() => null) as { items?: Item[]; pagination?: { pageCount: number }; message?: string } | null;
      const batches = await lotResponse.json().catch(() => null) as { items?: Lot[]; pagination?: { pageCount: number }; message?: string } | null;
      if (!inventoryResponse.ok || !lotResponse.ok) throw new Error(inventory?.message || batches?.message || (en ? "Inventory data unavailable." : "Données de stock indisponibles."));
      if (!controller.signal.aborted) { setItems(inventory?.items || []); setItemPages(inventory?.pagination?.pageCount || 1); setLots(batches?.items || []); setPages(batches?.pagination?.pageCount || 1); setError(""); }
    }).catch((caught) => { if (!controller.signal.aborted) setError(customerFacingError(caught, locale)); });
    return () => controller.abort();
  }, [open, organizationId, search, page, itemPage, itemSearch, reload, en, locale]);

  async function savePolicy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!editPolicy) return;
    const form = new FormData(event.currentTarget); setBusy(true);
    try {
      const response = await fetch(`/api/enterprise/${organizationId}/inventory/item-policy`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ inventoryItemId: editPolicy.id, revision: editPolicy.revision, minimumQuantity: form.get("minimumQuantity") === "" ? null : Number(form.get("minimumQuantity")), reorderQuantity: form.get("reorderQuantity") === "" ? null : Number(form.get("reorderQuantity")), lotTracking: form.get("lotTracking") === "on", expiryTracking: form.get("expiryTracking") === "on" }) });
      const body = await response.json().catch(() => null) as { message?: string } | null;
      if (!response.ok) throw new Error(body?.message || (en ? "Policy update refused." : "Modification de politique refusée."));
      setEditPolicy(null); refresh(); notifyToast(en ? "Stock rules updated" : "Règles de stock actualisées", "success");
    } catch (caught) { notifyToast({ title: en ? "Policy not saved" : "Règles non enregistrées", description: customerFacingError(caught, locale), tone: "error" }); }
    finally { setBusy(false); }
  }

  async function saveLot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(true);
    try {
      const payload = { inventoryItemId: String(form.get("inventoryItemId") || ""), warehouseId: String(form.get("warehouseId") || ""), lotNumber: String(form.get("lotNumber") || "").trim(), productionDate: String(form.get("productionDate") || "") || null, expiryDate: String(form.get("expiryDate") || "") || null, notes: String(form.get("notes") || "") || null };
      const response = await fetch(`/api/enterprise/${organizationId}/inventory/lots`, { method: editLot ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editLot ? { id: editLot.id, revision: editLot.revision, status: String(form.get("status") || editLot.status), productionDate: payload.productionDate, expiryDate: payload.expiryDate, notes: payload.notes } : payload) });
      const body = await response.json().catch(() => null) as { message?: string } | null;
      if (!response.ok) throw new Error(body?.message || (en ? "Batch save failed." : "Enregistrement du lot impossible."));
      setLotDialog(false); setEditLot(null); refresh(); notifyToast({ title: en ? "Batch metadata recorded; quantity unchanged" : "Lot enregistré ; quantité inchangée", description: en ? "Record the physical receipt through an approved stock adjustment or goods receipt." : "Enregistrez la réception physique par une entrée de stock approuvée.", tone: "success" });
    } catch (caught) { notifyToast({ title: en ? "Batch not saved" : "Lot non enregistré", description: customerFacingError(caught, locale), tone: "error" }); }
    finally { setBusy(false); }
  }

  return <section data-testid="inventory-stock-governance" className="min-w-0 rounded-2xl border border-dtsc-border bg-dtsc-surface p-3 sm:p-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-start gap-2"><ShieldCheck className="mt-1 h-5 w-5 shrink-0 text-emerald-600" /><div><h3 className="text-sm font-black text-dtsc-ink">{en ? "Stock rules, batches and expiry" : "Règles de stock, lots et péremptions"}</h3><p className="text-xs text-dtsc-muted">{en ? "Logistics is the owner of stock configuration and batch history; the product catalog only defines the item." : "La logistique pilote les règles de stock et les lots ; le catalogue définit uniquement l'article."}</p></div></div><Button variant="outline" type="button" onClick={() => setOpen((value) => !value)}><Boxes className="h-4 w-4" />{open ? en ? "Collapse" : "Réduire" : en ? "Manage" : "Gérer"}</Button></div>
    {open ? <div className="mt-4 space-y-4">
      {error ? <p role="alert" className="rounded-lg bg-red-500/10 p-3 text-xs text-red-700 dark:text-red-200">{error}</p> : null}
      <div className="flex flex-wrap gap-2"><Button type="button" onClick={() => { setEditLot(null); setLotDialog(true); }}><PackagePlus className="h-4 w-4" />{en ? "Register batch" : "Enregistrer un lot"}</Button><p className="self-center text-xs text-dtsc-muted">{en ? "A batch has zero stock until a receipt is approved." : "Un lot n'a aucun stock avant validation d'une entrée physique."}</p></div>
      <div><h4 className="mb-2 text-xs font-black uppercase text-dtsc-muted">{en ? "Per-item controls" : "Contrôles par article"}</h4>
        <input className="mb-2 min-h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3 text-sm" value={itemSearch} onChange={(event) => { setItemSearch(event.target.value); setItemPage(1); }} placeholder={en ? "Search item by name or SKU" : "Rechercher un article ou SKU"} aria-label={en ? "Search items" : "Rechercher les articles"} />
        <div className="grid min-w-0 gap-2 sm:grid-cols-2 xl:grid-cols-3">{items.map((item) => <div key={item.id} className="flex min-w-0 items-center justify-between gap-2 rounded-xl border border-dtsc-border bg-dtsc-page p-3"><span className="min-w-0 truncate text-xs font-bold text-dtsc-ink" title={item.catalogItem.name}>{item.catalogItem.name}</span><Button variant="outline" size="sm" onClick={() => setEditPolicy(item)}><Settings2 className="h-4 w-4" />{en ? "Rules" : "Règles"}</Button></div>)}</div>
        <div className="mt-2 flex items-center justify-between gap-3 text-xs text-dtsc-muted"><span>{en ? "Items page" : "Articles · page"} {itemPage}/{itemPages}</span><div className="flex gap-2"><Button variant="outline" disabled={itemPage <= 1} onClick={() => setItemPage((value) => value - 1)}>{en ? "Previous" : "Précédent"}</Button><Button variant="outline" disabled={itemPage >= itemPages} onClick={() => setItemPage((value) => value + 1)}>{en ? "Next" : "Suivant"}</Button></div></div>
      </div>
      <div><h4 className="mb-2 text-xs font-black uppercase text-dtsc-muted">{en ? "Traceable batches by warehouse" : "Lots traçables par dépôt"}</h4>
        <input className="mb-2 min-h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3 text-sm" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder={en ? "Search item or batch number" : "Rechercher un article ou un numéro de lot"} aria-label={en ? "Search batches" : "Rechercher des lots"} />
        <div className="grid gap-2">{lots.length ? lots.map((lot) => <button type="button" key={lot.id} onClick={() => { setEditLot(lot); setLotDialog(true); }} className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-xl border border-dtsc-border bg-dtsc-page p-3 text-left hover:border-cyan-500 focus-visible:outline-2 focus-visible:outline-cyan-500"><div className="min-w-0"><p className="break-words text-xs font-black text-dtsc-ink">{lot.inventoryItem.catalogItem.name} · {lot.lotNumber}</p><p className="text-xs text-dtsc-muted">{en ? "Expires" : "Péremption"} {formatDate(lot.expiryDate, en)} · {en ? "On hand" : "En stock"} {lot.quantityOnHand} · {en ? "Reserved" : "Réservé"} {lot.quantityReserved}</p></div><span className={`rounded-full px-2 py-1 text-xs font-bold ${lot.status === "AVAILABLE" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-amber-500/15 text-amber-800 dark:text-amber-200"}`}>{lot.status === "AVAILABLE" ? en ? "Available" : "Disponible" : lot.status === "QUARANTINED" ? en ? "Quarantined" : "En quarantaine" : en ? "Blocked" : "Bloqué"}</span></button>) : <p className="text-xs text-dtsc-muted">{en ? "No batch for these filters." : "Aucun lot pour ces filtres."}</p>}</div>
        <div className="mt-2 flex items-center justify-between gap-3 text-xs text-dtsc-muted"><span>{en ? "Page" : "Page"} {page}/{pages}</span><div className="flex gap-2"><Button variant="outline" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>{en ? "Previous" : "Précédent"}</Button><Button variant="outline" disabled={page >= pages} onClick={() => setPage((value) => value + 1)}>{en ? "Next" : "Suivant"}</Button></div></div>
      </div>
    </div> : null}
    <Dialog open={Boolean(editPolicy)} onClose={() => { if (!busy) setEditPolicy(null); }} title={en ? "Stock rules" : "Règles de stock"} presentation="editor"><form key={editPolicy?.id || "none"} onSubmit={savePolicy} className="grid gap-3 p-2">
      <p className="text-xs text-dtsc-muted">{editPolicy?.catalogItem.name}</p>
      <label className="grid gap-1 text-xs font-bold text-dtsc-muted">{en ? "Low-stock threshold (available units)" : "Seuil d'alerte du stock disponible"}<Input name="minimumQuantity" type="number" min="0" step="0.001" defaultValue={editPolicy?.minimumQuantity?.toString() || ""} /></label>
      <label className="grid gap-1 text-xs font-bold text-dtsc-muted">{en ? "Reorder quantity" : "Quantité de réapprovisionnement"}<Input name="reorderQuantity" type="number" min="0" step="0.001" defaultValue={editPolicy?.reorderQuantity?.toString() || ""} /></label>
      <label className="flex min-h-11 items-center gap-2 text-sm text-dtsc-ink"><input name="lotTracking" type="checkbox" defaultChecked={editPolicy?.lotTracking} />{en ? "Require batch tracking for stock movements" : "Suivre les lots sur les mouvements"}</label>
      <label className="flex min-h-11 items-center gap-2 text-sm text-dtsc-ink"><input name="expiryTracking" type="checkbox" defaultChecked={editPolicy?.expiryTracking} />{en ? "Require expiry dates for batches" : "Exiger la date de péremption par lot"}</label>
      <p className="flex gap-2 text-xs text-amber-800 dark:text-amber-200"><TriangleAlert className="h-4 w-4 shrink-0" />{en ? "Traceability cannot be turned off while active batches exist." : "La traçabilité ne peut être désactivée si des lots actifs existent."}</p>
      <div className="flex justify-end gap-2"><Button variant="outline" type="button" disabled={busy} onClick={() => setEditPolicy(null)}>{en ? "Cancel" : "Annuler"}</Button><Button type="submit" disabled={busy}>{busy ? en ? "Saving…" : "Enregistrement…" : en ? "Save rules" : "Enregistrer les règles"}</Button></div>
    </form></Dialog>
    <Dialog open={lotDialog} onClose={() => { if (!busy) { setLotDialog(false); setEditLot(null); } }} title={editLot ? en ? "Update batch metadata" : "Modifier le lot" : en ? "Register a batch" : "Enregistrer un lot"} description={en ? "Batch identification and expiry are managed here. Quantity is recorded only by an approved stock operation." : "Identification et péremption du lot. La quantité se saisit exclusivement par une opération de stock approuvée."} presentation="editor"><form key={editLot?.id || "new"} onSubmit={saveLot} className="grid gap-3 p-2">
      <label className="grid gap-1 text-xs font-bold text-dtsc-muted">{en ? "Tracked item" : "Article suivi"} *<select name="inventoryItemId" required disabled={Boolean(editLot)} defaultValue="" className="min-h-11 rounded-xl border border-dtsc-border bg-dtsc-page px-2 text-sm"><option value="">{en ? "Choose" : "Choisir"}</option>{items.map((item) => <option key={item.id} value={item.id}>{item.catalogItem.code} · {item.catalogItem.name}</option>)}</select></label>
      <label className="grid gap-1 text-xs font-bold text-dtsc-muted">{en ? "Warehouse" : "Dépôt"} *<select name="warehouseId" required disabled={Boolean(editLot)} defaultValue={editLot?.warehouseId || ""} className="min-h-11 rounded-xl border border-dtsc-border bg-dtsc-page px-2 text-sm"><option value="">{en ? "Choose" : "Choisir"}</option>{warehouses.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></label>
      <label className="grid gap-1 text-xs font-bold text-dtsc-muted">{en ? "Batch number" : "Numéro de lot"} *<Input required name="lotNumber" maxLength={120} disabled={Boolean(editLot)} defaultValue={editLot?.lotNumber || ""} /></label>
      <label className="grid gap-1 text-xs font-bold text-dtsc-muted">{en ? "Manufactured on" : "Date de fabrication"}<Input name="productionDate" type="date" defaultValue={dateInput(editLot?.productionDate || null)} /></label>
      <label className="grid gap-1 text-xs font-bold text-dtsc-muted">{en ? "Expiry date (required for expiry-tracked items)" : "Date de péremption (obligatoire si suivi activé)"}<Input name="expiryDate" type="date" defaultValue={dateInput(editLot?.expiryDate || null)} /></label>
      {editLot ? <label className="grid gap-1 text-xs font-bold text-dtsc-muted">{en ? "Batch availability" : "Disponibilité du lot"}<select name="status" defaultValue={editLot.status} className="min-h-11 rounded-xl border border-dtsc-border bg-dtsc-page p-2"><option value="AVAILABLE">{en ? "Available" : "Disponible"}</option><option value="BLOCKED">{en ? "Blocked" : "Bloqué"}</option><option value="QUARANTINED">{en ? "Quarantined" : "En quarantaine"}</option></select></label> : null}
      <label className="grid gap-1 text-xs font-bold text-dtsc-muted">{en ? "Traceability note" : "Observation de traçabilité"}<textarea name="notes" maxLength={1000} defaultValue={editLot?.notes || ""} className="min-h-20 rounded-xl border border-dtsc-border bg-dtsc-page p-3 text-sm" /></label>
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => { setLotDialog(false); setEditLot(null); }}>{en ? "Cancel" : "Annuler"}</Button><Button type="submit" disabled={busy}>{busy ? en ? "Saving…" : "Enregistrement…" : en ? "Save batch" : "Enregistrer le lot"}</Button></div>
    </form></Dialog>
  </section>;
}
