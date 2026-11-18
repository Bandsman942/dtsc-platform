"use client";

import { useEffect,useRef,useState,type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { EnterpriseApproverSelect } from "@/components/enterprise/enterprise-approver-select";
import { notifyToast } from "@/lib/client-toast";
import { customerFacingError } from "@/lib/customer-facing-language";

type CustodyRow={
  id:string;revision:number;quantity:string;status:string;disposition:string;inspectedAt:string;
  inspectionNotes:string|null;disposalReason:string|null;disposalEvidence:string|null;disposedAt:string|null;
  canRequest:boolean;canConfirm:boolean;canInspectRecovery?:boolean;canAssessRecovery?:boolean;recoveryAssessment?:{id:string;revision:number;canWithdraw:boolean;canExecute?:boolean;recoveryMovementId?:string|null;recoveryJournalEntryId?:string|null;releaseEvidence?:string|null;executedAt?:string|null;reference:string;status:string;proposedRecoveryAmount:string;currencyCode:string;stale:boolean;approvalId:string}|null;
  originalMovement:{warehouse:{name:string;code:string};inventoryItem:{catalogItem:{name:string;code:string}};stockLot:{lotNumber:string;recallReference:string|null}|null};
  returnLine:{request:{id:string;number:string}};
};
type RecoveryPreview={custodyId:string;revision:number;quantity:string;historicalUnitCost:string;historicalCostCeiling:string;currencyCode:string;lotNumber:string;returnReference:string;eligibleForAssessment:true;readOnly:true;physicalReleaseAuthorized:false;accountingRecognitionAuthorized:false};
export function InventoryReturnCustodyDialog({organizationId,locale,warehouses,onClose,initialCustodyId=""}:{organizationId:string;locale:"fr"|"en";warehouses:Array<{id:string;code:string;name:string}>;onClose:()=>void;initialCustodyId?:string}){
  const en=locale==="en";
  const [search,setSearch]=useState("");
  const [focusedCustodyId,setFocusedCustodyId]=useState(initialCustodyId);
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
  const [recovery,setRecovery]=useState<{id:string;preview?:RecoveryPreview;error?:string;loading:boolean}|null>(null);
  const endpoint=`/api/enterprise/${organizationId}/inventory/lots`;
  const assessmentRetry=useRef<{fingerprint:string;key:string}|null>(null);
  useEffect(()=>{
    const controller=new AbortController();
    setLoading(true);setError("");setItems([]);
    const timer=setTimeout(()=>{
      const query=new URLSearchParams({view:"custody",search,warehouseId:warehouse,status,page:String(page)});
      if(focusedCustodyId)query.set("custodyId",focusedCustodyId);
      void fetch(`${endpoint}?${query}`,{cache:"no-store",signal:controller.signal}).then(async response=>{
        const body=await response.json().catch(()=>null) as {items?:CustodyRow[];pagination?:{total:number;pageCount:number};message?:string}|null;
        if(!response.ok||!body?.items)throw new Error(body?.message||(en?"Could not load custody register.":"Registre de garde indisponible."));
        if(!controller.signal.aborted){setItems(body.items);setTotal(body.pagination?.total||0);setPages(body.pagination?.pageCount||1);}
      }).catch(caught=>{if(!controller.signal.aborted)setError(customerFacingError(caught,locale));}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    },200);
    return()=>{clearTimeout(timer);controller.abort();};
  },[endpoint,search,warehouse,status,page,reload,en,locale,focusedCustodyId]);
  const labels:Record<string,string>={QUARANTINED:en?"In quarantine":"En quarantaine",DISPOSAL_PENDING:en?"Disposal pending":"Destruction à attester",DISPOSED:en?"Disposed":"Détruit",RECOVERED:en?"Recovered":"Réintégré"};
  const date=(value:string)=>new Intl.DateTimeFormat(en?"en-GB":"fr-FR",{dateStyle:"medium"}).format(new Date(value));
  async function inspectRecovery(row:CustodyRow){
    if(busy||recovery?.loading)return;
    setRecovery({id:row.id,loading:true});
    try{
      const query=new URLSearchParams({view:"custody-recovery",custodyId:row.id});
      const response=await fetch(`${endpoint}?${query}`,{cache:"no-store",headers:{"Accept-Language":locale}});
      const body=await response.json().catch(()=>null) as (RecoveryPreview&{message?:string})|null;
      if(!response.ok||!body?.eligibleForAssessment||body.readOnly!==true||body.physicalReleaseAuthorized!==false||body.accountingRecognitionAuthorized!==false)throw new Error(body?.message||(en?"Assessment not available.":"Diagnostic indisponible."));
      setRecovery({id:row.id,preview:body,loading:false});
    }catch(caught){setRecovery({id:row.id,error:customerFacingError(caught,locale),loading:false});}
  }
  async function executeAssessment(event:FormEvent<HTMLFormElement>,row:CustodyRow){
    event.preventDefault();
    const appraisal=row.recoveryAssessment;
    if(busy||!appraisal?.canExecute)return;
    const form=new FormData(event.currentTarget),releaseEvidence=String(form.get("releaseEvidence")||"").trim();
    if(releaseEvidence.length<8||form.get("confirmedSaleableAndRepaired")!=="on")return;
    setBusy(true);
    try{
      const response=await fetch(endpoint+"?action=execute-recovery-assessment",{method:"PATCH",headers:{"Content-Type":"application/json","Accept-Language":locale},body:JSON.stringify({custodyId:row.id,assessmentId:appraisal.id,revision:appraisal.revision,releaseEvidence,confirmedSaleableAndRepaired:true})});
      const body=await response.json().catch(()=>null);
      if(!response.ok||!body?.ok)throw new Error(body?.message||(en?"Recovery refused.":"Réintégration refusée."));
      setRecovery(null);setReload(value=>value+1);notifyToast(en?"Stock and accounting recovery recorded.":"Réintégration physique et comptable enregistrée.","success");
    }catch(caught){notifyToast({title:en?"Recovery not recorded":"Réintégration non enregistrée",description:customerFacingError(caught,locale),tone:"error"});}finally{setBusy(false);}
  }
  async function withdrawAssessment(event:FormEvent<HTMLFormElement>,row:CustodyRow){
    event.preventDefault();
    const appraisal=row.recoveryAssessment;
    if(busy||!appraisal?.canWithdraw)return;
    const form=new FormData(event.currentTarget),reason=String(form.get("withdrawReason")||"").trim();
    if(reason.length<8||form.get("confirmNotReleased")!=="on")return;
    setBusy(true);
    try{
      const response=await fetch(endpoint+"?action=withdraw-recovery-assessment",{method:"PATCH",headers:{"Content-Type":"application/json","Accept-Language":locale},body:JSON.stringify({custodyId:row.id,assessmentId:appraisal.id,revision:appraisal.revision,reason,confirmedNotReleased:true})});
      const body=await response.json().catch(()=>null);
      if(!response.ok||!body?.ok)throw new Error(body?.message||(en?"Withdrawal refused.":"Retrait refusé."));
      setRecovery(null);setReload(value=>value+1);notifyToast(en?"Appraisal withdrawn without stock or accounting effects.":"Expertise retirée sans effet physique ni comptable.","success");
    }catch(caught){notifyToast({title:en?"Appraisal not withdrawn":"Expertise non retirée",description:customerFacingError(caught,locale),tone:"error"});}finally{setBusy(false);}
  }
  async function submitAssessment(event:FormEvent<HTMLFormElement>,row:CustodyRow,preview:RecoveryPreview){
    event.preventDefault();
    if(busy||!row.canAssessRecovery||preview.custodyId!==row.id)return;
    const form=new FormData(event.currentTarget);
    const payload={custodyId:row.id,custodyRevision:preview.revision,estimatedSellingAmount:String(form.get("estimatedSellingAmount")||"").trim().replace(",","."),
      completionCost:String(form.get("completionCost")||"").trim().replace(",","."),
      sellingCost:String(form.get("sellingCost")||"").trim().replace(",","."),
      evidenceReference:String(form.get("evidenceReference")||"").trim(),findings:String(form.get("findings")||"").trim(),
      confirmedPhysicalInspection:form.get("confirmedPhysicalInspection")==="on",approverUserId:String(form.get("approverUserId")||"")};
    if(!payload.approverUserId||!payload.confirmedPhysicalInspection){notifyToast(en?"Select a reviewer and confirm the physical inspection.":"Choisissez un validateur et confirmez l’expertise physique.","error");return;}
    const fingerprint=JSON.stringify(payload);
    if(assessmentRetry.current?.fingerprint!==fingerprint)assessmentRetry.current={fingerprint,key:crypto.randomUUID()};
    const idempotencyKey=assessmentRetry.current!.key;
    setBusy(true);
    try{
      const response=await fetch(endpoint+"?action=submit-recovery-assessment",{method:"PATCH",headers:{"Content-Type":"application/json","Accept-Language":locale},body:JSON.stringify({...payload,idempotencyKey})});
      const body=await response.json().catch(()=>null) as {ok?:boolean;message?:string}|null;
      if(!response.ok||!body?.ok)throw new Error(body?.message||(en?"Appraisal submission refused.":"Soumission de l’expertise refusée."));
      assessmentRetry.current=null;setRecovery(null);setReload(value=>value+1);
      notifyToast(en?"Appraisal submitted for independent review.":"Expertise soumise pour validation indépendante.","success");
    }catch(caught){notifyToast({title:en?"Appraisal not submitted":"Expertise non soumise",description:customerFacingError(caught,locale),tone:"error"});}
    finally{setBusy(false);}
  }
  async function decide(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(!target||reason.trim().length<8)return;setBusy(true);
    const confirm=target.status==="DISPOSAL_PENDING";
    try{
      const response=await fetch(endpoint,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({custodyId:target.id,revision:target.revision,action:confirm?"CONFIRM_DISPOSAL":"REQUEST_DISPOSAL",reason:reason.trim()})});
      const body=await response.json().catch(()=>null) as {message?:string}|null;
      if(!response.ok)throw new Error(body?.message||(en?"Action refused":"Opération refusée"));
      notifyToast(confirm?(en?"Physical disposal recorded":"Destruction physique attestée"):(en?"Disposal requested":"Destruction demandée"),"success");
      setTarget(null);setReason("");setRecovery(null);setReload(value=>value+1);
    }catch(caught){notifyToast({title:en?"Action not completed":"Opération non réalisée",description:customerFacingError(caught,locale),tone:"error"});}
    finally{setBusy(false);}
  }
  return <Dialog open onClose={()=>{if(!busy)onClose();}} presentation="editor" className="max-w-4xl" title={en?"Non-sellable return custody":"Garde des retours non revendables"} description={en?"Physical custody independent of available stock and accounting valuation.":"Garde physique distincte du stock disponible et de sa valorisation comptable."}>
    <div className="grid min-w-0 gap-3 p-2">
      <div className="rounded-xl border border-dtsc-border bg-dtsc-page p-3 text-xs text-dtsc-muted">{en?"Goods remain isolated. A credit note does not prove disposal. The recovery diagnostic provides a historical cost ceiling only; it authorizes neither valuation nor release.":"Les marchandises restent isolées. Un avoir ne prouve pas la destruction. Le diagnostic de récupération donne seulement un plafond de coût historique ; il n’autorise ni valorisation ni remise en vente."}</div>
      {focusedCustodyId?<Button type="button" variant="outline" size="sm" onClick={()=>{setFocusedCustodyId("");setPage(1);}}>{en?"Show all isolated returns":"Afficher tous les retours isolés"}</Button>:null}
      <Input value={search} onChange={event=>{setSearch(event.target.value);setPage(1);}} placeholder={en?"Item, batch, return reference":"Article, lot, référence du retour"} aria-label={en?"Search isolated returns":"Rechercher les retours isolés"}/>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="grid gap-1 text-xs font-semibold">{en?"Warehouse":"Dépôt"}<select className="min-h-11 rounded-xl border border-dtsc-border bg-dtsc-page p-2" value={warehouse} onChange={event=>{setWarehouse(event.target.value);setPage(1);}}><option value="">{en?"All authorized warehouses":"Tous les dépôts autorisés"}</option>{warehouses.map(row=><option key={row.id} value={row.id}>{row.code} · {row.name}</option>)}</select></label>
        <label className="grid gap-1 text-xs font-semibold">{en?"Status":"Statut"}<select className="min-h-11 rounded-xl border border-dtsc-border bg-dtsc-page p-2" value={status} onChange={event=>{setStatus(event.target.value);setPage(1);}}><option value="">{en?"All statuses":"Tous les statuts"}</option>{Object.entries(labels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
      </div>
      {loading?<p role="status" className="text-sm">{en?"Loading…":"Chargement…"}</p>:error?<p role="alert" className="text-sm text-red-700 dark:text-red-200">{error}</p>:items.length?items.map(row=><article key={row.id} className="grid min-w-0 gap-2 rounded-xl border border-dtsc-border p-3"><div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><p className="break-words text-sm font-bold">{row.originalMovement.inventoryItem.catalogItem.name} · {row.quantity}</p><p className="break-words text-xs text-dtsc-muted">{row.returnLine.request.number} · {row.originalMovement.warehouse.name} · {row.originalMovement.stockLot?.lotNumber||(en?"Untracked batch":"Sans lot")}</p></div><span className={`rounded-full px-2 py-1 text-xs font-semibold ${row.status==="RECOVERED"?"bg-green-500/10 text-green-700 dark:text-green-200":row.status==="DISPOSED"?"bg-slate-500/15 text-dtsc-muted":row.status==="DISPOSAL_PENDING"?"bg-red-500/10 text-red-700 dark:text-red-200":"bg-amber-500/15 text-amber-800 dark:text-amber-200"}`}>{labels[row.status]||row.status}</span></div>
        <p className="text-xs text-dtsc-muted">{en?"Inspected":"Inspecté"} · {date(row.inspectedAt)} {row.inspectionNotes||""}</p>{row.disposalReason?<p className="break-words text-xs">{en?"Reason":"Motif"} : {row.disposalReason}</p>:null}{row.disposalEvidence?<p className="break-words text-xs">{en?"Evidence":"Preuve"} : {row.disposalEvidence} · {row.disposedAt?date(row.disposedAt):"—"}</p>:null}
        {row.recoveryAssessment?<section className="grid min-w-0 gap-1 rounded-lg border border-dtsc-border p-2 text-xs">
          <strong className="break-words">{row.recoveryAssessment.reference} · {row.recoveryAssessment.status==="EXECUTED"?(en?"Recovery executed":"Réintégration effectuée"):row.recoveryAssessment.status==="APPROVED"?(en?"Appraisal approved":"Expertise approuvée"):(en?"Under review":"En attente de validation")}</strong>
          <p>{en?"Proposed recovery":"Valeur proposée"} : {row.recoveryAssessment.proposedRecoveryAmount} {row.recoveryAssessment.currencyCode}</p>
          {row.recoveryAssessment.stale?<p role="alert" className="text-amber-700 dark:text-amber-200">{en?"Custody has changed; a new review is required.":"La garde a changé ; une nouvelle revue est nécessaire."}</p>:null}
          {row.recoveryAssessment.status==="EXECUTED"?<div className="grid gap-1 text-dtsc-muted">
            <p>{en?"Recognized inventory value":"Valeur réintégrée"} : {row.recoveryAssessment.proposedRecoveryAmount} {row.recoveryAssessment.currencyCode}</p>
            <p className="break-all">{en?"Movement":"Mouvement"} : {row.recoveryAssessment.recoveryMovementId}</p>
            <p className="break-all">{en?"Journal entry":"Écriture"} : {row.recoveryAssessment.recoveryJournalEntryId}</p>
            <p className="break-words">{en?"Release evidence":"Preuve de remise"} : {row.recoveryAssessment.releaseEvidence}</p>
          </div>:<p className="text-dtsc-muted">{en?"Approval alone does not release stock or recognize value.":"L’approbation seule ne remet pas en stock et ne comptabilise aucune valeur."}</p>}
          {row.recoveryAssessment.canExecute?<form onSubmit={event=>void executeAssessment(event,row)} className="grid min-w-0 gap-2 rounded-lg border border-dtsc-border p-2">
            <strong>{en?"Record final physical release":"Enregistrer la remise en stock définitive"}</strong>
            <p className="text-dtsc-muted">{en?"Confirm only after quality checks and all required repairs are completed. The approved value will debit inventory and credit cost of sales.":"Confirmez uniquement après les contrôles qualité et la remise en état complète. La valeur approuvée sera portée au débit du stock et au crédit du coût des ventes."}</p>
            <label className="grid gap-1">{en?"Final quality/release evidence":"Preuve finale de conformité et de remise"} *<textarea name="releaseEvidence" required minLength={8} maxLength={2000} disabled={busy} className="w-full min-w-0 rounded-xl border border-dtsc-border bg-dtsc-page p-2 text-base"/></label>
            <label className="flex items-start gap-2"><input type="checkbox" name="confirmedSaleableAndRepaired" required disabled={busy}/><span>{en?"I confirm the goods are physically present, repairs complete, safe and saleable.":"Je confirme la présence physique, la remise en état terminée et la conformité du produit à la vente."}</span></label>
            <Button type="submit" disabled={busy} className="whitespace-normal">{en?"Confirm stock and valuation recovery":"Confirmer la réintégration et la valorisation"}</Button>
          </form>:null}
          {row.recoveryAssessment.canWithdraw?<details className="rounded-lg border border-dtsc-border p-2">
            <summary className="cursor-pointer font-medium">{en?"Withdraw approved appraisal":"Retirer l’expertise approuvée"}</summary>
            <form onSubmit={event=>void withdrawAssessment(event,row)} className="mt-2 grid min-w-0 gap-2">
              <p className="text-dtsc-muted">{en?"The original decision stays in history. The goods must still be isolated.":"La décision initiale reste dans l’historique. Les marchandises doivent toujours être isolées."}</p>
              <label className="grid min-w-0 gap-1">{en?"Withdrawal reason":"Motif du retrait"} *<textarea name="withdrawReason" required minLength={8} maxLength={2000} disabled={busy} className="w-full min-w-0 rounded-xl border border-dtsc-border bg-dtsc-page p-2 text-base"/></label>
              <label className="flex items-start gap-2"><input name="confirmNotReleased" type="checkbox" required disabled={busy}/><span>{en?"I confirm no goods have been released.":"Je confirme qu’aucune marchandise n’a été remise en stock."}</span></label>
              <Button type="submit" variant="outline" disabled={busy}>{en?"Confirm withdrawal":"Confirmer le retrait"}</Button>
            </form>
          </details>:null}
          <a className="break-words text-dtsc-blue underline" href={`/enterprise-modules/VALIDATIONS?approval=${encodeURIComponent(row.recoveryAssessment.approvalId)}`}>{en?"Open independent review":"Ouvrir la validation indépendante"}</a>
        </section>:null}
        {row.canInspectRecovery?<Button variant="outline" size="sm" type="button" disabled={busy||Boolean(recovery?.loading)} onClick={()=>void inspectRecovery(row)}>{en?"Check recovery eligibility":"Vérifier la récupération possible"}</Button>:null}
        {recovery?.id===row.id?<div className="grid min-w-0 gap-2 rounded-lg border border-dtsc-border p-2 text-xs" aria-live="polite" data-custody-recovery-diagnostic>
          {recovery.loading?<p>{en?"Checking source and valuation…":"Vérification de la provenance et de la valorisation…"}</p>:null}
          {recovery.error?<p role="alert" className="break-words text-red-700 dark:text-red-200">{recovery.error}</p>:null}
          {recovery.preview?<><strong>{en?"Eligible for independent assessment only":"Admissible à une expertise indépendante uniquement"}</strong>
            <p>{en?"Historical unit cost":"Coût unitaire historique"} : {recovery.preview.historicalUnitCost} {recovery.preview.currencyCode}</p>
            <p className="break-words">{en?"Historical cost ceiling":"Plafond du coût historique"} : <strong>{recovery.preview.historicalCostCeiling} {recovery.preview.currencyCode}</strong></p>
            <p className="text-dtsc-muted">{en?"This is not an appraisal or an accounting value. No stock release, new journal or refund is authorized.":"Ce plafond n’est ni une expertise ni une valeur comptable reconnue. Aucune remise en stock, écriture ou remboursement n’est autorisé."}</p></>:null}
          {row.canAssessRecovery&&recovery.preview?<form onSubmit={event=>void submitAssessment(event,row,recovery.preview!)} className="grid min-w-0 gap-2 border-t border-dtsc-border pt-2">
            <strong>{en?"Independent physical appraisal":"Expertise physique indépendante"}</strong>
            <p className="text-dtsc-muted">{en?"Enter total estimated proceeds and costs for this custody record, in its valuation currency. The server uses the lower of estimated net value and historical cost.":"Renseignez le produit de vente et les coûts totaux de ce dossier, dans sa devise de valorisation. Le serveur retient la plus faible valeur entre l’estimation nette et le coût historique."}</p>
            <div className="grid min-w-0 gap-2 sm:grid-cols-3">
              {([{name:"estimatedSellingAmount",fr:"Produit de vente estimé",en:"Estimated selling proceeds"},{name:"completionCost",fr:"Remise en état",en:"Completion costs"},{name:"sellingCost",fr:"Frais de vente",en:"Selling costs"}]).map(field=><label key={field.name} className="grid min-w-0 gap-1">{en?field.en:field.fr} ({recovery.preview!.currencyCode}) *<Input name={field.name} inputMode="decimal" required pattern="[0-9]{1,12}([.,][0-9]{1,6})?" defaultValue={field.name==="estimatedSellingAmount"?"":"0"} disabled={busy}/></label>)}
            </div>
            <label className="grid gap-1">{en?"Appraisal report reference":"Référence du rapport d’expertise"} *<Input name="evidenceReference" required minLength={5} maxLength={160} disabled={busy}/></label>
            <label className="grid gap-1">{en?"Findings and condition of goods":"Constat motivé et état des marchandises"} *<textarea name="findings" required minLength={20} maxLength={2000} disabled={busy} className="w-full min-w-0 rounded-xl border border-dtsc-border bg-dtsc-page p-3 text-base"/></label>
            <EnterpriseApproverSelect organizationId={organizationId} moduleCode="INVENTORY_LOGISTICS" locale={locale} label={en?"Independent reviewer":"Validateur indépendant"} candidatesEndpoint={endpoint+"?view=custody-recovery-approvers&custodyId="+encodeURIComponent(row.id)} disabled={busy}/>
            <label className="flex items-start gap-2"><input type="checkbox" name="confirmedPhysicalInspection" required disabled={busy}/><span>{en?"I confirm the goods have been physically appraised and the report is available.":"Je confirme avoir expertisé physiquement les marchandises et disposer du rapport."}</span></label>
            <Button type="submit" disabled={busy} className="whitespace-normal">{en?"Submit for independent review":"Soumettre à validation indépendante"}</Button>
          </form>:null}
          <Button type="button" variant="outline" size="sm" disabled={busy||Boolean(recovery.loading)} onClick={()=>setRecovery(null)}>{en?"Close":"Fermer"}</Button>
        </div>:null}
        {row.canRequest||row.canConfirm?<Button variant="outline" size="sm" type="button" disabled={busy} onClick={()=>{setTarget(row);setReason("");}}>{row.canConfirm?(en?"Attest disposal":"Attester la destruction"):(en?"Request disposal":"Demander la destruction")}</Button>:null}</article>):<p className="text-sm text-dtsc-muted">{en?"No matching isolated returns.":"Aucun retour isolé correspondant."}</p>}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs"><span>{total} · {page}/{pages}</span><div className="flex gap-2"><Button type="button" variant="outline" disabled={loading||page<=1} onClick={()=>setPage(value=>value-1)}>{en?"Previous":"Précédent"}</Button><Button type="button" variant="outline" disabled={loading||page>=pages} onClick={()=>setPage(value=>value+1)}>{en?"Next":"Suivant"}</Button></div></div>
      {target?<form onSubmit={decide} className="grid gap-2 rounded-xl border border-dtsc-border p-3"><p className="text-sm font-bold">{target.returnLine.request.number} · {target.quantity}</p><label className="grid gap-1 text-xs font-semibold">{target.canConfirm?(en?"Actual disposal evidence (date, witness or certificate reference)":"Preuve de destruction effective (date, témoin ou référence du procès-verbal)"):(en?"Reason for disposal":"Motif de destruction")} *<textarea required minLength={8} maxLength={2000} value={reason} onChange={event=>setReason(event.target.value)} className="min-h-24 rounded-xl border border-dtsc-border bg-dtsc-page p-3 text-sm"/></label>{target.canConfirm?<p className="text-xs text-red-700 dark:text-red-200">{en?"Confirm only after physical destruction has occurred.":"Confirmer uniquement après destruction physique effective."}</p>:null}<div className="flex justify-end gap-2"><Button variant="outline" type="button" disabled={busy} onClick={()=>setTarget(null)}>{en?"Cancel":"Annuler"}</Button><Button type="submit" disabled={busy||reason.trim().length<8}>{busy?(en?"Saving…":"Enregistrement…"):(en?"Confirm":"Confirmer")}</Button></div></form>:null}
    </div>
  </Dialog>;
}
