"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Boxes, PackagePlus, Settings2, ShieldCheck, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { InventoryReturnCustodyDialog } from "@/components/enterprise/professional/inventory-return-custody-dialog";
import { InventoryHistoricalLotDialog, type HistoricalInventoryItem } from "@/components/enterprise/professional/inventory-historical-lot-dialog";
import { notifyToast } from "@/lib/client-toast";
import { customerFacingError } from "@/lib/customer-facing-language";

type Item = HistoricalInventoryItem & { minimumQuantity: string | number | null; reorderQuantity: string | number | null; lotTracking: boolean; expiryTracking: boolean };
type BatchOption = { id: string; expiryTracking: boolean; catalogItem: { code: string; name: string } };
type Warehouse = { id: string; code: string; name: string };
type Lot = { expired?: boolean; expiresSoon?:boolean; recallReference?:string|null; qualityReason?:string|null; qualityChangedAt?:string|null; qualityChangedByUserId?:string|null; id: string; revision: number; lotNumber: string; warehouseId: string; status: string; productionDate: string | null; expiryDate: string | null; notes: string | null; quantityOnHand: string; quantityReserved: string; inventoryItem: { catalogItem: { name: string; code: string } } };
type TraceMovement={id:string;movementType:string;direction:string;quantity:string;occurredAt:string;sourceEntityType:string|null;sourceEntityId:string|null;sourceLineId:string|null;warehouse:{name:string;code:string};stockLot:{lotNumber:string;status:string;recallReference:string|null}|null};
const dateInput = (value: string | null) => value ? value.slice(0, 10) : "";
const formatDate = (value: string | null, en: boolean) => value ? new Intl.DateTimeFormat(en ? "en-GB" : "fr-FR").format(new Date(value)) : "—";

/** Product master data declares stockability; this workspace owns stock
 * policy and local batch identities. No lot creation changes stock quantity. */
export function InventoryStockGovernance({ organizationId, locale, warehouses }: { organizationId: string; locale: "fr" | "en"; warehouses: Warehouse[] }) {
  const en = locale === "en";
  const [open, setOpen] = useState(false);
  const [custodyOpen,setCustodyOpen]=useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [canAdminister, setCanAdminister] = useState(false);
  const [canRegisterLot, setCanRegisterLot] = useState(false);
  const [itemPage, setItemPage] = useState(1);
  const [itemPages, setItemPages] = useState(1);
  const [itemSearch, setItemSearch] = useState("");
  const [lots, setLots] = useState<Lot[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [search, setSearch] = useState("");
  const [lotStatus,setLotStatus]=useState("");
  const [expiryFilter,setExpiryFilter]=useState("");
  const [lotMetrics,setLotMetrics]=useState<{expired:number;expiring:number;undated:number;isolated:number;recalled:number;pendingDisposal:number}|null>(null);
  const [lotsLoading,setLotsLoading]=useState(false);
  const [lotsError,setLotsError]=useState("");
  const [lotWarehouse,setLotWarehouse]=useState("");
  const [canRecall,setCanRecall]=useState(false);
  const [currentUserId,setCurrentUserId]=useState("");
  const [nextStatus,setNextStatus]=useState("");
  const [recall,setRecall]=useState(false);
  const [traceLot,setTraceLot]=useState<Lot|null>(null);
  const [traceItems,setTraceItems]=useState<TraceMovement[]>([]);
  const [tracePage,setTracePage]=useState(1);
  const [tracePages,setTracePages]=useState(1);
  const [traceTotal,setTraceTotal]=useState(0);
  const [traceLoading,setTraceLoading]=useState(false);
  const [traceError,setTraceError]=useState("");
  const [editPolicy, setEditPolicy] = useState<Item | null>(null);
  const [historicalItem, setHistoricalItem] = useState<Item | null>(null);
  const [lastApproval, setLastApproval] = useState<{ id: string; reference: string } | null>(null);
  const [editLot, setEditLot] = useState<Lot | null>(null);
  const [lotDialog, setLotDialog] = useState(false);
  const [batchWarehouse, setBatchWarehouse] = useState("");
  const [batchSearch, setBatchSearch] = useState("");
  const [batchPage, setBatchPage] = useState(1);
  const [batchPages, setBatchPages] = useState(1);
  const [batchOptions, setBatchOptions] = useState<BatchOption[]>([]);
  const [batchItem, setBatchItem] = useState("");
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchError, setBatchError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const [error, setError] = useState("");
  const refresh = useCallback(() => setReload((value) => value + 1), []);

  // Rules and lot monitoring have independent queries.
  useEffect(() => {
    if(!open)return;
    const controller=new AbortController();
    void fetch(`/api/enterprise/${organizationId}/inventory?${new URLSearchParams({page:String(itemPage),pageSize:"50",search:itemSearch})}`,{signal:controller.signal,cache:"no-store"}).then(async response=>{
      const inventory=await response.json().catch(()=>null) as {items?:Item[];pagination?:{pageCount:number};message?:string;canAdminister?:boolean}|null;
      if(!response.ok||!inventory?.items)throw new Error(inventory?.message||(en?"Stock rules unavailable":"Règles de stock indisponibles"));
      if(!controller.signal.aborted){setItems(inventory.items);setCanAdminister(Boolean(inventory.canAdminister));setItemPages(inventory.pagination?.pageCount||1);setError("");}
    }).catch(caught=>{if(!controller.signal.aborted)setError(customerFacingError(caught,locale));});
    return()=>controller.abort();
  },[open,organizationId,itemPage,itemSearch,reload,en,locale]);
  useEffect(()=>{
    if(!open)return;
    const controller=new AbortController();setLotsLoading(true);setLotsError("");setLotMetrics(null);
    const query=new URLSearchParams({page:String(page),search,status:lotStatus,warehouseId:lotWarehouse,expiry:expiryFilter});
    const timer=setTimeout(()=>{
      void fetch(`/api/enterprise/${organizationId}/inventory/lots?${query}`,{signal:controller.signal,cache:"no-store"}).then(async response=>{
        const batches=await response.json().catch(()=>null) as {items?:Lot[];pagination?:{pageCount:number};message?:string;canManage?:boolean;canRecall?:boolean;currentUserId?:string;metrics?:{expired:number;expiring:number;undated:number;isolated:number;recalled:number;pendingDisposal:number}}|null;
        if(!response.ok||!batches?.items)throw new Error(batches?.message||(en?"Batch list unavailable":"Liste des lots indisponible"));
        if(!controller.signal.aborted){setLots(batches.items);setPages(batches.pagination?.pageCount||1);setCanRegisterLot(Boolean(batches.canManage));setCanRecall(Boolean(batches.canRecall));setCurrentUserId(batches.currentUserId||"");setLotMetrics(batches.metrics||null);}
      }).catch(caught=>{if(!controller.signal.aborted){setLots([]);setLotsError(customerFacingError(caught,locale));}}).finally(()=>{if(!controller.signal.aborted)setLotsLoading(false);});
    },200);
    return()=>{clearTimeout(timer);controller.abort();};
  },[open,organizationId,page,search,lotStatus,lotWarehouse,expiryFilter,reload,en,locale]);

  useEffect(() => {
    if (!lotDialog || editLot || !batchWarehouse) return;
    const controller = new AbortController();
    const query = new URLSearchParams({ view: "lot-options", warehouseId: batchWarehouse, search: batchSearch, page: String(batchPage) });
    const timer = setTimeout(() => {
      setBatchLoading(true); setBatchError(""); setBatchOptions([]);
      void fetch(`/api/enterprise/${organizationId}/inventory?${query}`, { signal: controller.signal, cache: "no-store" }).then(async (response) => {
        const body = await response.json() as { items?: BatchOption[]; pagination?: { pageCount: number }; message?: string };
        if (!response.ok) throw new Error(body.message || (en ? "Products unavailable for this warehouse." : "Articles indisponibles pour ce dépôt."));
        if (!controller.signal.aborted) { setBatchOptions(body.items || []); setBatchPages(body.pagination?.pageCount || 1); }
      }).catch((caught) => { if (!controller.signal.aborted) setBatchError(customerFacingError(caught, locale)); }).finally(() => { if (!controller.signal.aborted) setBatchLoading(false); });
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [lotDialog, editLot, batchWarehouse, batchSearch, batchPage, organizationId, en, locale, reload]);

  useEffect(()=>{
    if(!traceLot)return;
    const controller=new AbortController();setTraceLoading(true);setTraceError("");setTraceItems([]);
    const query=new URLSearchParams({view:"trace",lotId:traceLot.id,page:String(tracePage)});
    void fetch(`/api/enterprise/${organizationId}/inventory/lots?${query}`,{signal:controller.signal,cache:"no-store"}).then(async res=>{
      const body=await res.json().catch(()=>null) as {items?:TraceMovement[];pagination?:{pageCount:number;total:number};message?:string}|null;
      if(!res.ok || !body?.items)throw new Error(body?.message||(en?"Trace unavailable":"Traçabilité indisponible"));
      if(!controller.signal.aborted){setTraceItems(body.items);setTracePages(body.pagination?.pageCount||1);setTraceTotal(body.pagination?.total||0);}
    }).catch(error=>{if(!controller.signal.aborted)setTraceError(customerFacingError(error,locale));}).finally(()=>{if(!controller.signal.aborted)setTraceLoading(false);});
    return()=>controller.abort();
  },[traceLot,tracePage,organizationId,en,locale]);
  function openEditLot(lot:Lot){setEditLot(lot);setNextStatus(lot.status);setRecall(false);setLotDialog(true);}
  function openBatchDialog() {
    setRecall(false);setNextStatus("");
    setEditLot(null); setBatchWarehouse(""); setBatchSearch(""); setBatchPage(1); setBatchPages(1); setBatchOptions([]); setBatchItem(""); setBatchError(""); setBatchLoading(false); setLotDialog(true);
  }

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
      const response = await fetch(`/api/enterprise/${organizationId}/inventory/lots`, { method: editLot ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editLot ? { id: editLot.id, revision: editLot.revision, status: nextStatus||editLot.status, productionDate: payload.productionDate, expiryDate: payload.expiryDate, notes: payload.notes, ...((recall||nextStatus!==editLot.status)?{qualityReason:String(form.get("qualityReason")||"").trim()}:{}), ...(recall?{recall:true}:{}) } : payload) });
      const body = await response.json().catch(() => null) as { message?: string;recallReference?:string;affectedLots?:number } | null;
      if (!response.ok) throw new Error(body?.message || (en ? "Batch save failed." : "Enregistrement du lot impossible."));
      setLotDialog(false); setEditLot(null); refresh(); if(body?.recallReference){notifyToast({title:en?"Recall registered":"Rappel enregistré",description:`${body.recallReference} · ${body.affectedLots||0} ${en?"batch records quarantined":"fiches de lot mises en quarantaine"}`,tone:"success"});return;} notifyToast({ title: en ? "Batch metadata recorded; quantity unchanged" : "Lot enregistré ; quantité inchangée", description: en ? "Record the physical receipt through an approved stock adjustment or goods receipt." : "Enregistrez la réception physique par une entrée de stock approuvée.", tone: "success" });
    } catch (caught) { notifyToast({ title: en ? "Batch not saved" : "Lot non enregistré", description: customerFacingError(caught, locale), tone: "error" }); }
    finally { setBusy(false); }
  }

  return <section data-testid="inventory-stock-governance" className="min-w-0 rounded-2xl border border-dtsc-border bg-dtsc-surface p-3 sm:p-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-start gap-2"><ShieldCheck className="mt-1 h-5 w-5 shrink-0 text-emerald-600" /><div><h3 className="text-sm font-black text-dtsc-ink">{en ? "Stock rules, batches and expiry" : "Règles de stock, lots et péremptions"}</h3><p className="text-xs text-dtsc-muted">{en ? "Logistics is the owner of stock configuration and batch history; the product catalog only defines the item." : "La logistique pilote les règles de stock et les lots ; le catalogue définit uniquement l'article."}</p></div></div><Button variant="outline" type="button" onClick={() => setOpen((value) => !value)}><Boxes className="h-4 w-4" />{open ? en ? "Collapse" : "Réduire" : en ? "Manage" : "Gérer"}</Button></div>
    {open ? <div className="mt-4 space-y-4">
      {error ? <p role="alert" className="rounded-lg bg-red-500/10 p-3 text-xs text-red-700 dark:text-red-200">{error}</p> : null}
      <div className="flex flex-wrap gap-2"><Button type="button" disabled={!canRegisterLot} onClick={openBatchDialog}><PackagePlus className="h-4 w-4" />{en ? "Register batch" : "Enregistrer un lot"}</Button><Button type="button" variant="outline" onClick={()=>setCustodyOpen(true)}>{en?"Isolated returns":"Retours isolés"}</Button><p className="self-center text-xs text-dtsc-muted">{en ? "A batch has zero stock until a receipt is approved." : "Un lot n'a aucun stock avant validation d'une entrée physique."}</p></div>
      <div><h4 className="mb-2 text-xs font-black uppercase text-dtsc-muted">{en ? "Per-item controls" : "Contrôles par article"}</h4>{!canAdminister ? <p className="mb-2 text-xs text-dtsc-muted">{en ? "Company-wide stock rules require inventory administration rights." : "Les règles de stock communes à tous les dépôts exigent le droit d’administration du stock."}</p> : null}
        <input className="mb-2 min-h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3 text-sm" value={itemSearch} onChange={(event) => { setItemSearch(event.target.value); setItemPage(1); }} placeholder={en ? "Search item by name or SKU" : "Rechercher un article ou SKU"} aria-label={en ? "Search items" : "Rechercher les articles"} />
        {lastApproval ? <p role="status" className="mb-2 rounded-xl border border-dtsc-border p-3 text-sm"><strong>{lastApproval.reference}</strong> · <a className="font-semibold text-dtsc-blue underline" href={`/enterprise-modules/VALIDATIONS?approval=${encodeURIComponent(lastApproval.id)}`}>{en ? "Open approval" : "Ouvrir la validation"}</a></p> : null}
        <div className="grid min-w-0 gap-2 sm:grid-cols-2 xl:grid-cols-3">{items.map((item) => <div key={item.id} className="grid min-w-0 gap-2 rounded-xl border border-dtsc-border bg-dtsc-page p-3"><span className="min-w-0 break-words text-xs font-bold text-dtsc-ink">{item.catalogItem.code} · {item.catalogItem.name}</span><div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" disabled={!canAdminister} onClick={() => setEditPolicy(item)}><Settings2 className="h-4 w-4" />{en ? "Rules" : "Règles"}</Button>{canAdminister && item.balances?.some((balance) => !balance.stockLotId && Number(balance.quantityOnHand) > 0) ? <Button variant="outline" size="sm" onClick={() => setHistoricalItem(item)}>{en ? "Allocate historical stock" : "Répartir le stock historique"}</Button> : null}</div></div>)}</div>
        <div className="mt-2 flex items-center justify-between gap-3 text-xs text-dtsc-muted"><span>{en ? "Items page" : "Articles · page"} {itemPage}/{itemPages}</span><div className="flex gap-2"><Button variant="outline" disabled={itemPage <= 1} onClick={() => setItemPage((value) => value - 1)}>{en ? "Previous" : "Précédent"}</Button><Button variant="outline" disabled={itemPage >= itemPages} onClick={() => setItemPage((value) => value + 1)}>{en ? "Next" : "Suivant"}</Button></div></div>
      </div>
      <div><h4 className="mb-2 text-xs font-black uppercase text-dtsc-muted">{en ? "Traceable batches by warehouse" : "Lots traçables par dépôt"}</h4>
        <input className="mb-2 min-h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3 text-sm" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder={en ? "Search item or batch number" : "Rechercher un article ou un numéro de lot"} aria-label={en ? "Search batches" : "Rechercher des lots"} />
        <p className="mb-2 text-xs text-dtsc-muted">{en?"Warehouse/search scope · all matching stocked batch records, not just this page. Alert categories may overlap.":"Périmètre dépôt/recherche · tous les lots ayant du stock, au-delà de la page affichée. Les catégories peuvent se chevaucher."}</p>
        <div className="mb-3 grid grid-cols-2 gap-2 lg:grid-cols-3">
          {([{key:"EXPIRED",label:en?"Expired":"Périmés",value:lotMetrics?.expired,tone:"text-red-700 dark:text-red-200"},{key:"EXPIRING",label:en?"Expires ≤ 30 days":"Échéance ≤ 30 jours",value:lotMetrics?.expiring,tone:"text-amber-700 dark:text-amber-200"},{key:"UNDATED",label:en?"Missing expiry":"Date manquante",value:lotMetrics?.undated,tone:"text-orange-700 dark:text-orange-200"},{key:"ISOLATED",label:en?"Isolated":"Isolés",value:lotMetrics?.isolated,tone:"text-violet-700 dark:text-violet-200"},{key:"RECALLED",label:en?"Recalled":"Rappelés",value:lotMetrics?.recalled,tone:"text-red-700 dark:text-red-200"}]).map(metric=><button type="button" key={metric.key} aria-pressed={expiryFilter===metric.key} className={`min-w-0 rounded-xl border p-3 text-left transition-colors ${expiryFilter===metric.key?"border-dtsc-blue bg-dtsc-blue/5":"border-dtsc-border bg-dtsc-page"}`} onClick={()=>{setExpiryFilter(value=>value===metric.key?"":metric.key);setLotStatus("");setPage(1);}}><span className={"block text-lg font-bold "+metric.tone}>{metric.value??"—"}</span><span className="block break-words text-xs text-dtsc-muted">{metric.label}</span></button>)}
          <button type="button" className="min-w-0 rounded-xl border border-dtsc-border bg-dtsc-page p-3 text-left" onClick={()=>setCustodyOpen(true)}><span className="block text-lg font-bold text-amber-700 dark:text-amber-200">{lotMetrics?.pendingDisposal??"—"}</span><span className="block break-words text-xs text-dtsc-muted">{en?"Disposal to attest (warehouse)":"Destructions à attester (dépôt)"}</span></button>
        </div>
        {expiryFilter?<Button type="button" variant="outline" size="sm" onClick={()=>{setExpiryFilter("");setPage(1);}}>{en?"Clear alert filter":"Effacer le filtre d’alerte"}</Button>:null}
        {lotsError?<p role="alert" className="mb-2 text-xs text-red-700 dark:text-red-200">{lotsError}</p>:null}
        <div className="mb-3 grid gap-2 sm:grid-cols-2">
          <label className="grid gap-1 text-xs font-semibold">{en?"Warehouse":"Dépôt"}<select value={lotWarehouse} onChange={event=>{setLotWarehouse(event.target.value);setPage(1);}} className="min-h-11 min-w-0 rounded-xl border border-dtsc-border bg-dtsc-page px-2 text-sm"><option value="">{en?"All authorized warehouses":"Tous les dépôts autorisés"}</option>{warehouses.map(warehouse=><option key={warehouse.id} value={warehouse.id}>{warehouse.code} · {warehouse.name}</option>)}</select></label>
          <label className="grid gap-1 text-xs font-semibold">{en?"Quality status":"Statut qualité"}<select value={lotStatus} onChange={event=>{setLotStatus(event.target.value);setPage(1);}} className="min-h-11 min-w-0 rounded-xl border border-dtsc-border bg-dtsc-page px-2 text-sm"><option value="">{en?"All statuses":"Tous les statuts"}</option><option value="AVAILABLE">{en?"Available":"Disponible"}</option><option value="BLOCKED">{en?"Blocked":"Bloqué"}</option><option value="QUARANTINED">{en?"Quarantined":"En quarantaine"}</option><option value="RECALLED">{en?"Recalled":"Rappelé"}</option></select></label>
        </div>
        <div className="grid gap-2" aria-busy={lotsLoading}>{lotsLoading?<p role="status" className="text-xs text-dtsc-muted">{en?"Loading batches…":"Chargement des lots…"}</p>:lots.length?lots.map(lot=><article key={lot.id} className="grid min-w-0 gap-2 rounded-xl border border-dtsc-border bg-dtsc-page p-3">
          <div className="flex min-w-0 flex-wrap items-start justify-between gap-2"><div className="min-w-0"><p className="break-words text-sm font-black text-dtsc-ink">{lot.inventoryItem.catalogItem.name} · {lot.lotNumber}</p><p className="text-xs text-dtsc-muted">{warehouses.find(warehouse=>warehouse.id===lot.warehouseId)?.name||"—"} · {en?"Expires":"Péremption"} {formatDate(lot.expiryDate,en)}</p></div><span className={`rounded-full px-2 py-1 text-xs font-semibold ${lot.recallReference||lot.expired?"bg-red-500/15 text-red-700 dark:text-red-200":lot.expiresSoon&&lot.status==="AVAILABLE"?"bg-amber-500/15 text-amber-800 dark:text-amber-200":lot.status==="AVAILABLE"?"bg-emerald-500/15 text-emerald-700 dark:text-emerald-300":"bg-amber-500/15 text-amber-800 dark:text-amber-200"}`}>{lot.recallReference?(en?"Recalled":"Rappelé"):lot.expired?(en?"Expired":"Périmé"):lot.expiresSoon&&lot.status==="AVAILABLE"?(en?"Expires soon":"Péremption proche"):lot.status==="AVAILABLE"?(en?"Available":"Disponible"):lot.status==="QUARANTINED"?(en?"Quarantined":"En quarantaine"):(en?"Blocked":"Bloqué")}</span></div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs"><span>{en?"Physical stock":"Stock physique"} <strong>{lot.quantityOnHand}</strong></span><span>{en?"Balance reservation":"Réservé au solde"} <strong>{lot.quantityReserved}</strong></span></div>
          {lot.recallReference?<p className="break-words font-semibold text-xs text-red-700 dark:text-red-200">{lot.recallReference}</p>:null}
          {lot.qualityReason?<p className="break-words text-xs text-dtsc-muted">{lot.qualityReason}</p>:null}
          <div data-responsive-actions className="flex flex-wrap gap-2"><Button type="button" variant="outline" size="sm" disabled={!canRegisterLot||Boolean(lot.recallReference)} onClick={()=>openEditLot(lot)}>{en?"Quality / edit":"Qualité / modifier"}</Button><Button type="button" variant="outline" size="sm" onClick={()=>{setTraceLot(lot);setTracePage(1);setTraceItems([]);}}>{en?"Trace movements":"Tracer les mouvements"}</Button></div>
        </article>):<p className="text-xs text-dtsc-muted">{en?"No batch for these filters.":"Aucun lot pour ces filtres."}</p>}</div>
        <div className="mt-2 flex items-center justify-between gap-3 text-xs text-dtsc-muted"><span>{en ? "Page" : "Page"} {page}/{pages}</span><div className="flex gap-2"><Button variant="outline" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>{en ? "Previous" : "Précédent"}</Button><Button variant="outline" disabled={page >= pages} onClick={() => setPage((value) => value + 1)}>{en ? "Next" : "Suivant"}</Button></div></div>
      </div>
    </div> : null}
    {custodyOpen?<InventoryReturnCustodyDialog organizationId={organizationId} locale={locale} warehouses={warehouses} onClose={()=>setCustodyOpen(false)} />:null}
    {historicalItem ? <InventoryHistoricalLotDialog key={historicalItem.id} organizationId={organizationId} locale={locale} item={historicalItem} onClose={() => setHistoricalItem(null)} onSubmitted={(result) => { setLastApproval(result); setHistoricalItem(null); refresh(); }} /> : null}
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
      {editLot ? <p className="text-sm font-semibold text-dtsc-ink">{editLot.inventoryItem.catalogItem.code} · {editLot.inventoryItem.catalogItem.name}</p> : null}
      <label className="grid gap-1 text-xs font-bold text-dtsc-muted">{en ? "Warehouse" : "Dépôt"} *<select name="warehouseId" required disabled={Boolean(editLot)} value={editLot?.warehouseId || batchWarehouse} onChange={(event) => { setBatchWarehouse(event.target.value); setBatchSearch(""); setBatchPage(1); setBatchItem(""); setBatchOptions([]); setBatchError(""); setBatchLoading(Boolean(event.target.value)); }} className="min-h-11 rounded-xl border border-dtsc-border bg-dtsc-page px-2 text-sm"><option value="">{en ? "Choose" : "Choisir"}</option>{warehouses.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></label>
      {!editLot ? <div className="grid gap-2">
        <label className="grid gap-1 text-xs font-bold text-dtsc-muted">{en ? "Search tracked items" : "Rechercher un article suivi"}<Input value={batchSearch} disabled={!batchWarehouse} onChange={(event) => { setBatchSearch(event.target.value); setBatchPage(1); setBatchItem(""); setBatchOptions([]); setBatchLoading(true); }} placeholder={en ? "Name, code or SKU" : "Nom, code ou SKU"} /></label>
        <label className="grid gap-1 text-xs font-bold text-dtsc-muted">{en ? "Tracked item" : "Article suivi"} *<select name="inventoryItemId" required disabled={!batchWarehouse || batchLoading || Boolean(batchError)} value={batchItem} onChange={(event) => setBatchItem(event.target.value)} className="min-h-11 rounded-xl border border-dtsc-border bg-dtsc-page px-2 text-sm"><option value="">{en ? "Choose" : "Choisir"}</option>{batchOptions.map((item) => <option key={item.id} value={item.id}>{item.catalogItem.code} · {item.catalogItem.name}</option>)}</select></label>
        {batchLoading ? <p role="status" className="text-xs text-dtsc-muted">{en ? "Loading items…" : "Chargement des articles…"}</p> : batchError ? <p role="alert" className="text-xs text-red-600 dark:text-red-300">{batchError}</p> : !batchWarehouse ? <p className="text-xs text-dtsc-muted">{en ? "Choose the warehouse first." : "Choisissez d’abord le dépôt."}</p> : !batchOptions.length ? <p className="text-xs text-dtsc-muted">{en ? "No eligible item. Clear the search or enable batch tracking in stock rules." : "Aucun article éligible. Effacez la recherche ou activez le suivi des lots dans les règles de stock."}</p> : null}
        {batchPages > 1 ? <div className="flex items-center justify-between gap-2 text-xs text-dtsc-muted"><span>{batchPage}/{batchPages}</span><div className="flex gap-2"><Button variant="outline" type="button" disabled={batchLoading || batchPage <= 1} onClick={() => { setBatchPage((v) => v - 1); setBatchItem(""); setBatchOptions([]); setBatchLoading(true); }}>{en ? "Previous" : "Précédent"}</Button><Button variant="outline" type="button" disabled={batchLoading || batchPage >= batchPages} onClick={() => { setBatchPage((v) => v + 1); setBatchItem(""); setBatchOptions([]); setBatchLoading(true); }}>{en ? "Next" : "Suivant"}</Button></div></div> : null}
      </div> : null}
      <label className="grid gap-1 text-xs font-bold text-dtsc-muted">{en ? "Batch number" : "Numéro de lot"} *<Input required name="lotNumber" maxLength={120} disabled={Boolean(editLot)} defaultValue={editLot?.lotNumber || ""} /></label>
      <label className="grid gap-1 text-xs font-bold text-dtsc-muted">{en ? "Manufactured on" : "Date de fabrication"}<Input name="productionDate" type="date" defaultValue={dateInput(editLot?.productionDate || null)} /></label>
      <label className="grid gap-1 text-xs font-bold text-dtsc-muted">{en ? "Expiry date (required for expiry-tracked items)" : "Date de péremption (obligatoire si suivi activé)"}<Input name="expiryDate" type="date" required={!editLot && Boolean(batchOptions.find((item) => item.id === batchItem)?.expiryTracking)} defaultValue={dateInput(editLot?.expiryDate || null)} /></label>
      {editLot ? <div className="grid gap-2 rounded-xl border border-dtsc-border p-3">
        <label className="grid gap-1 text-xs font-bold text-dtsc-muted">{en?"Batch quality status":"Statut qualité du lot"}<select name="status" value={nextStatus} disabled={recall} onChange={event=>setNextStatus(event.target.value)} className="min-h-11 rounded-xl border border-dtsc-border bg-dtsc-page p-2"><option value="AVAILABLE" disabled={editLot.status!=="AVAILABLE"&&(!canAdminister||editLot.expired||editLot.qualityChangedByUserId===currentUserId)}>{en?"Available / release":"Disponible / libérer"}</option><option value="BLOCKED">{en?"Blocked":"Bloqué"}</option><option value="QUARANTINED">{en?"Quarantined":"En quarantaine"}</option></select></label>
        {canRecall?<label className="flex items-start gap-2 text-sm font-semibold text-red-700 dark:text-red-200"><input className="mt-1" type="checkbox" checked={recall} onChange={event=>{setRecall(event.target.checked);setNextStatus(event.target.checked?"QUARANTINED":editLot.status);}} />{en?"Recall this batch in every warehouse (irreversible here)":"Rappeler ce lot dans tous les dépôts (irréversible ici)"}</label>:null}
        {recall?<p role="alert" className="text-xs text-red-700 dark:text-red-200">{en?"The same item and batch number will be quarantined in all warehouses. No physical removal or credit note is generated.":"Le même article et numéro de lot seront mis en quarantaine dans tous les dépôts. Aucune sortie physique ni aucun avoir n’est généré."}</p>:null}
        {recall||nextStatus!==editLot.status?<label className="grid gap-1 text-xs font-semibold">{en?"Quality findings / mandatory reason":"Constat qualité / motif obligatoire"}<textarea required name="qualityReason" minLength={8} maxLength={1000} className="min-h-20 rounded-xl border border-dtsc-border bg-dtsc-page p-2 text-sm" /></label>:null}
        <p className="text-xs text-dtsc-muted">{en?"Release requires another inventory administrator; existing physical history locks batch dates.":"La libération requiert un autre administrateur du stock ; l’historique physique verrouille les dates."}</p>
      </div>:null}
      <label className="grid gap-1 text-xs font-bold text-dtsc-muted">{en ? "Traceability note" : "Observation de traçabilité"}<textarea name="notes" maxLength={1000} defaultValue={editLot?.notes || ""} className="min-h-20 rounded-xl border border-dtsc-border bg-dtsc-page p-3 text-sm" /></label>
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => { setLotDialog(false); setEditLot(null); }}>{en ? "Cancel" : "Annuler"}</Button><Button type="submit" disabled={busy || (!editLot && (!batchWarehouse || !batchItem || batchLoading || Boolean(batchError)))}>{busy ? en ? "Saving…" : "Enregistrement…" : en ? "Save batch" : "Enregistrer le lot"}</Button></div>
    </form></Dialog>
    <Dialog open={Boolean(traceLot)} onClose={()=>setTraceLot(null)} title={en?"Batch traceability":"Traçabilité du lot"} description={traceLot?`${traceLot.inventoryItem.catalogItem.name} · ${traceLot.lotNumber}`:""} presentation="editor" className="max-w-3xl"><div className="grid min-w-0 gap-3 p-2">
      {traceLot?.recallReference?<p className="rounded-xl bg-red-500/10 p-3 text-xs text-red-700 dark:text-red-200">{traceLot.recallReference} · {traceLot.qualityReason}</p>:null}
      <p className="text-xs text-dtsc-muted">{en?"Physical movements of this item and batch number in authorized warehouses. Source references identify the original documents.":"Mouvements physiques de cet article et numéro de lot dans les dépôts autorisés. Les références sources identifient les pièces d’origine."}</p>
      {traceLoading?<p role="status" className="text-sm">{en?"Loading…":"Chargement…"}</p>:traceError?<p role="alert" className="text-sm text-red-700 dark:text-red-200">{traceError}</p>:traceItems.length?traceItems.map(row=><article key={row.id} className="grid min-w-0 gap-1 rounded-xl border border-dtsc-border p-3"><div className="flex flex-wrap justify-between gap-2"><strong className="break-words text-sm">{row.warehouse.code} · {row.warehouse.name}</strong><span className={row.direction==="IN"?"font-semibold text-emerald-600":"font-semibold text-amber-600"}>{row.direction==="IN"?"+":"−"}{row.quantity}</span></div><p className="break-words text-xs">{row.movementType} · {formatDate(row.occurredAt,en)}</p>{row.sourceEntityId?<p className="break-all text-xs text-dtsc-muted">{row.sourceEntityType} · {row.sourceEntityId}</p>:null}</article>):<p className="text-sm text-dtsc-muted">{en?"No physical movements recorded.":"Aucun mouvement physique enregistré."}</p>}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs"><span>{traceTotal} {en?"movements":"mouvements"} · {tracePage}/{tracePages}</span><div className="flex gap-2"><Button variant="outline" type="button" disabled={traceLoading||tracePage<=1} onClick={()=>setTracePage(page=>page-1)}>{en?"Previous":"Précédent"}</Button><Button variant="outline" type="button" disabled={traceLoading||tracePage>=tracePages} onClick={()=>setTracePage(page=>page+1)}>{en?"Next":"Suivant"}</Button></div></div>
    </div></Dialog>
  </section>;
}
