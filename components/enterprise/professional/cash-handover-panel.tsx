"use client";
import {useCallback,useEffect,useRef,useState,type FormEvent} from "react";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Dialog} from "@/components/ui/dialog";
import {Field,NativeSelect} from "@/components/enterprise/core-v2/erp-v2-ui";
import {FinanceCriticalStepUpFields,performFinanceCriticalStepUp} from "@/components/enterprise/professional/finance-critical-step-up";
import {financeMoney,safeFinanceError,type FinanceLocale} from "@/components/enterprise/professional/finance-professional-ui";
import {useToastMessage} from "@/components/ui/use-toast-message";
type Row={id:string;revision:number;amount:string;currencyCode:string;status:string;reason:string;source:string;target:string;sourceLabel:string;targetLabel:string;incoming:boolean;canDecide:boolean;createdAt:string};
type Result={items:Row[];candidates:Array<{id:string;label:string}>;page:number;pageCount:number};
type Action={action:"PROPOSE"}|{action:"ACCEPT"|"DECLINE"|"CANCEL";record:Row};
export function CashHandoverPanel({organizationId,sessionId,locale,onChanged}:{organizationId:string;sessionId:string;locale:FinanceLocale;onChanged:()=>Promise<void>}){
 const tr=(fr:string,en:string)=>locale==="fr"?fr:en;
 const [data,setData]=useState<Result|null>(null),[page,setPage]=useState(1),[busy,setBusy]=useState(false),[error,setError]=useState(""),[message,setMessage]=useState(""),[action,setAction]=useState<Action|null>(null);
 const token=useRef("");
 const endpoint=`/api/enterprise/${organizationId}/cash-sessions/${sessionId}/handover`;
 const load=useCallback(async(signal?:AbortSignal)=>{
   const response=await fetch(endpoint+"?page="+page,{cache:"no-store",signal});
   if(!response.ok)throw new Error("HANDOVER_LOAD_FAILED");
   setData(await response.json());
 },[endpoint,page]);
 useEffect(()=>{const controller=new AbortController();void load(controller.signal).catch(()=>{if(!controller.signal.aborted)setError(locale==="fr"?"Passations indisponibles.":"Handovers unavailable.");});return()=>controller.abort();},[load,locale]);
 useToastMessage(message,"success");useToastMessage(error,"error");
 async function submit(event:FormEvent<HTMLFormElement>){
   event.preventDefault();if(!action||busy)return;setBusy(true);setError("");setMessage("");
   const form=new FormData(event.currentTarget);
   try{
     await performFinanceCriticalStepUp(form,"APPROVE");
     const payload=action.action==="PROPOSE"?{action:action.action,targetSessionId:String(form.get("targetSessionId")||""),amount:String(form.get("amount")||""),reason:String(form.get("reason")||""),idempotencyKey:token.current,attest:form.get("attest")==="on"}:{action:action.action,handoverId:action.record.id,revision:action.record.revision,reason:String(form.get("reason")||""),attest:form.get("attest")==="on"};
     const response=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
     const body=await response.json().catch(()=>null);if(!response.ok)throw new Error(body?.message||tr("Passation refusée.","Handover rejected."));
     setAction(null);await load();await onChanged();setMessage(tr("Décision enregistrée.","Decision recorded."));
   }catch(e){setError(safeFinanceError(e,tr("Passation indisponible.","Handover unavailable."),locale));}finally{setBusy(false);}
 }
 const status=(value:string)=>value==="PENDING"?tr("À confirmer","Awaiting confirmation"):value==="ACCEPTED"?tr("Acceptée","Accepted"):value==="DECLINED"?tr("Refusée","Declined"):tr("Annulée","Cancelled");
 return <section className="grid min-w-0 gap-3 rounded-xl border border-dtsc-border p-3">
 <h3 className="font-semibold text-dtsc-ink">{tr("Passations physiques entre caissiers","Physical custody handovers")}</h3>
 <p className="text-xs text-dtsc-muted">{tr("Les deux caissiers doivent confirmer le montant réellement remis. Le transfert est exécuté à l’acceptation et n’affecte ni la comptabilité ni le solde général.","Both cashiers must confirm the amount actually handed over. Transfer occurs on acceptance and does not change accounting or the total account balance.")}</p>
 {error?<p role="alert" className="text-sm text-dtsc-muted">{error}</p>:null}
 {!data&&!error?<p className="text-xs">{tr("Chargement…","Loading…")}</p>:null}
 {data?.candidates.length?<Button size="sm" variant="outline" onClick={()=>{token.current=crypto.randomUUID();setAction({action:"PROPOSE"});}}>{tr("Proposer une passation","Propose handover")}</Button>:null}
 {data&&!data.items.length?<p className="text-xs text-dtsc-muted">{tr("Aucune passation enregistrée.","No recorded handover.")}</p>:null}
 {data?.items.map(r=><div key={r.id} className="grid min-w-0 gap-1 rounded-lg border border-dtsc-border p-3"><p className="break-words text-sm font-semibold">{financeMoney(r.amount,r.currencyCode,locale)} · {status(r.status)}</p><p className="break-words text-xs">{r.sourceLabel} → {r.targetLabel}</p><p className="break-words text-xs text-dtsc-muted">{r.reason}</p>{r.canDecide?<div className="flex flex-wrap gap-2">{r.incoming?<><Button size="sm" onClick={()=>setAction({action:"ACCEPT",record:r})}>{tr("Accepter","Accept")}</Button><Button size="sm" variant="outline" onClick={()=>setAction({action:"DECLINE",record:r})}>{tr("Refuser","Decline")}</Button></>:<Button size="sm" variant="outline" onClick={()=>setAction({action:"CANCEL",record:r})}>{tr("Annuler","Cancel")}</Button>}</div>:null}</div>)}
 {data&&data.pageCount>1?<div className="flex items-center justify-between gap-2"><Button size="sm" variant="outline" disabled={page<=1} onClick={()=>setPage(v=>v-1)}>{tr("Précédent","Previous")}</Button><span>{page}/{data.pageCount}</span><Button size="sm" variant="outline" disabled={page>=data.pageCount} onClick={()=>setPage(v=>v+1)}>{tr("Suivant","Next")}</Button></div>:null}
 <Dialog open={Boolean(action)} onClose={()=>{if(!busy)setAction(null);}} title={tr("Confirmation de passation","Confirm custody handover")} presentation="editor">
 {action?<form onSubmit={submit} className="grid min-w-0 gap-3">
 {action.action==="PROPOSE"?<><Field label={tr("Session destinataire","Receiving session")}><NativeSelect name="targetSessionId" required items={[{id:"",label:"—"},...(data?.candidates||[])]}/></Field><Field label={tr("Montant remis","Amount handed over")}><Input name="amount" type="number" min="0.000001" step="0.000001" required/></Field></>:<p className="text-sm">{financeMoney(action.record.amount,action.record.currencyCode,locale)} · {status(action.record.status)}</p>}
 <Field label={tr("Motif / référence de remise","Reason / handover reference")}><Input name="reason" minLength={4} maxLength={500} required/></Field>
 <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="attest" required/>{tr("Je confirme cette décision et, en cas de remise ou d’acceptation, la vérification du montant physique.","I confirm this decision and, for proposal or acceptance, the verified physical amount.")}</label>
 <FinanceCriticalStepUpFields action="APPROVE" locale={locale}/>
 <Button type="submit" disabled={busy}>{tr("Confirmer","Confirm")}</Button></form>:null}
 </Dialog>
 </section>;
}
