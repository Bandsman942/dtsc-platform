"use client";

import { useEffect,useState,type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { notifyToast } from "@/lib/client-toast";
import { customerFacingError } from "@/lib/customer-facing-language";

type CustodyRow={
  id:string;revision:number;quantity:string;status:string;disposition:string;inspectedAt:string;
  inspectionNotes:string|null;disposalReason:string|null;disposalEvidence:string|null;disposedAt:string|null;
  canRequest:boolean;canConfirm:boolean;
  originalMovement:{warehouse:{name:string;code:string};inventoryItem:{catalogItem:{name:string;code:string}};stockLot:{lotNumber:string;recallReference:string|null}|null};
  returnLine:{request:{id:string;number:string}};
};
export function InventoryReturnCustodyDialog({organizationId,locale,warehouses,onClose}:{organizationId:string;locale:"fr"|"en";warehouses:Array<{id:string;code:string;name:string}>;onClose:()=>void}){
  const en=locale==="en";
  const [search,setSearch]=useState("");
  const [warehouse,setWarehouse]=useState("");
  const [status,setStatus]=useState("");
  const [page,setPage]=useState(1);
  const [pages,setPages]=useState(1);
  const [total,setTotal]=useState(0);
  const [items,setItems]=useState<CustodyRow[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [reload,setReload]=useState(0);
  const [target,setTarget]=useState<CustodyRow|null>(null);
  const [reason,setReason]=useState("");
  const [busy,setBusy]=useState(false);
  const endpoint=`/api/enterprise/${organizationId}/inventory/lots`;
  useEffect(()=>{
    const controller=new AbortController();
    setLoading(true);setError("");setItems([]);
    const timer=setTimeout(()=>{
      const query=new URLSearchParams({view:"custody",search,warehouseId:warehouse,status,page:String(page)});
      void fetch(`${endpoint}?${query}`,{cache:"no-store",signal:controller.signal}).then(async response=>{
        const body=await response.json().catch(()=>null) as {items?:CustodyRow[];pagination?:{total:number;pageCount:number};message?:string}|null;
        if(!response.ok||!body?.items)throw new Error(body?.message||(en?"Could not load custody register.":"Registre de garde indisponible."));
        if(!controller.signal.aborted){setItems(body.items);setTotal(body.pagination?.total||0);setPages(body.pagination?.pageCount||1);}
      }).catch(caught=>{if(!controller.signal.aborted)setError(customerFacingError(caught,locale));}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    },200);
    return()=>{clearTimeout(timer);controller.abort();};
  },[endpoint,search,warehouse,status,page,reload,en,locale]);
  const labels:Record<string,string>={QUARANTINED:en?"In quarantine":"En quarantaine",DISPOSAL_PENDING:en?"Disposal pending":"Destruction à attester",DISPOSED:en?"Disposed":"Détruit"};
  const date=(value:string)=>new Intl.DateTimeFormat(en?"en-GB":"fr-FR",{dateStyle:"medium"}).format(new Date(value));
  async function decide(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(!target||reason.trim().length<8)return;setBusy(true);
    const confirm=target.status==="DISPOSAL_PENDING";
    try{
      const response=await fetch(endpoint,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({custodyId:target.id,revision:target.revision,action:confirm?"CONFIRM_DISPOSAL":"REQUEST_DISPOSAL",reason:reason.trim()})});
      const body=await response.json().catch(()=>null) as {message?:string}|null;
      if(!response.ok)throw new Error(body?.message||(en?"Action refused":"Opération refusée"));
      notifyToast(confirm?(en?"Physical disposal recorded":"Destruction physique attestée"):(en?"Disposal requested":"Destruction demandée"),"success");
      setTarget(null);setReason("");setReload(value=>value+1);
    }catch(caught){notifyToast({title:en?"Action not completed":"Opération non réalisée",description:customerFacingError(caught,locale),tone:"error"});}
    finally{setBusy(false);}
  }
  return <Dialog open onClose={()=>{if(!busy)onClose();}} presentation="editor" className="max-w-4xl" title={en?"Non-sellable return custody":"Garde des retours non revendables"} description={en?"Physical custody independent of available stock and accounting valuation.":"Garde physique distincte du stock disponible et de sa valorisation comptable."}>
    <div className="grid min-w-0 gap-3 p-2">
      <div className="rounded-xl border border-dtsc-border bg-dtsc-page p-3 text-xs text-dtsc-muted">{en?"Goods remain isolated. A credit note does not prove disposal. Recovery of value or release to sale is not authorized here.":"Les marchandises restent isolées. Un avoir ne prouve pas la destruction. La récupération de valeur ou la remise en vente ne sont pas autorisées ici."}</div>
      <Input value={search} onChange={event=>{setSearch(event.target.value);setPage(1);}} placeholder={en?"Item, batch, return reference":"Article, lot, référence du retour"} aria-label={en?"Search isolated returns":"Rechercher les retours isolés"}/>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="grid gap-1 text-xs font-semibold">{en?"Warehouse":"Dépôt"}<select className="min-h-11 rounded-xl border border-dtsc-border bg-dtsc-page p-2" value={warehouse} onChange={event=>{setWarehouse(event.target.value);setPage(1);}}><option value="">{en?"All authorized warehouses":"Tous les dépôts autorisés"}</option>{warehouses.map(row=><option key={row.id} value={row.id}>{row.code} · {row.name}</option>)}</select></label>
        <label className="grid gap-1 text-xs font-semibold">{en?"Status":"Statut"}<select className="min-h-11 rounded-xl border border-dtsc-border bg-dtsc-page p-2" value={status} onChange={event=>{setStatus(event.target.value);setPage(1);}}><option value="">{en?"All statuses":"Tous les statuts"}</option>{Object.entries(labels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
      </div>
      {loading?<p role="status" className="text-sm">{en?"Loading…":"Chargement…"}</p>:error?<p role="alert" className="text-sm text-red-700 dark:text-red-200">{error}</p>:items.length?items.map(row=><article key={row.id} className="grid min-w-0 gap-2 rounded-xl border border-dtsc-border p-3"><div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><p className="break-words text-sm font-bold">{row.originalMovement.inventoryItem.catalogItem.name} · {row.quantity}</p><p className="break-words text-xs text-dtsc-muted">{row.returnLine.request.number} · {row.originalMovement.warehouse.name} · {row.originalMovement.stockLot?.lotNumber||(en?"Untracked batch":"Sans lot")}</p></div><span className={`rounded-full px-2 py-1 text-xs font-semibold ${row.status==="DISPOSED"?"bg-slate-500/15 text-dtsc-muted":row.status==="DISPOSAL_PENDING"?"bg-red-500/10 text-red-700 dark:text-red-200":"bg-amber-500/15 text-amber-800 dark:text-amber-200"}`}>{labels[row.status]||row.status}</span></div>
        <p className="text-xs text-dtsc-muted">{en?"Inspected":"Inspecté"} · {date(row.inspectedAt)} {row.inspectionNotes||""}</p>{row.disposalReason?<p className="break-words text-xs">{en?"Reason":"Motif"} : {row.disposalReason}</p>:null}{row.disposalEvidence?<p className="break-words text-xs">{en?"Evidence":"Preuve"} : {row.disposalEvidence} · {row.disposedAt?date(row.disposedAt):"—"}</p>:null}
        {row.canRequest||row.canConfirm?<Button variant="outline" size="sm" type="button" disabled={busy} onClick={()=>{setTarget(row);setReason("");}}>{row.canConfirm?(en?"Attest disposal":"Attester la destruction"):(en?"Request disposal":"Demander la destruction")}</Button>:null}</article>):<p className="text-sm text-dtsc-muted">{en?"No matching isolated returns.":"Aucun retour isolé correspondant."}</p>}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs"><span>{total} · {page}/{pages}</span><div className="flex gap-2"><Button type="button" variant="outline" disabled={loading||page<=1} onClick={()=>setPage(value=>value-1)}>{en?"Previous":"Précédent"}</Button><Button type="button" variant="outline" disabled={loading||page>=pages} onClick={()=>setPage(value=>value+1)}>{en?"Next":"Suivant"}</Button></div></div>
      {target?<form onSubmit={decide} className="grid gap-2 rounded-xl border border-dtsc-border p-3"><p className="text-sm font-bold">{target.returnLine.request.number} · {target.quantity}</p><label className="grid gap-1 text-xs font-semibold">{target.canConfirm?(en?"Actual disposal evidence (date, witness or certificate reference)":"Preuve de destruction effective (date, témoin ou référence du procès-verbal)"):(en?"Reason for disposal":"Motif de destruction")} *<textarea required minLength={8} maxLength={2000} value={reason} onChange={event=>setReason(event.target.value)} className="min-h-24 rounded-xl border border-dtsc-border bg-dtsc-page p-3 text-sm"/></label>{target.canConfirm?<p className="text-xs text-red-700 dark:text-red-200">{en?"Confirm only after physical destruction has occurred.":"Confirmer uniquement après destruction physique effective."}</p>:null}<div className="flex justify-end gap-2"><Button variant="outline" type="button" disabled={busy} onClick={()=>setTarget(null)}>{en?"Cancel":"Annuler"}</Button><Button type="submit" disabled={busy||reason.trim().length<8}>{busy?(en?"Saving…":"Enregistrement…"):(en?"Confirm":"Confirmer")}</Button></div></form>:null}
    </div>
  </Dialog>;
}
