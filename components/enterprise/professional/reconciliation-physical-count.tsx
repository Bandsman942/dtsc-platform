"use client";
import {useState} from "react";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {physicalCountDenominations,physicalCountTotal,type PhysicalCountRows} from "@/lib/enterprise/accounting/physical-count";
import {financeMoney,type FinanceLocale} from "@/components/enterprise/professional/finance-professional-ui";

export function ReconciliationPhysicalCount({organizationId,accountId,currency,locale,disabled}:{organizationId:string;accountId:string;currency:string;locale:FinanceLocale;disabled:boolean}){
  const tr=(fr:string,en:string)=>locale==="en"?en:fr;
  const [rows,setRows]=useState<PhysicalCountRows>(()=>physicalCountDenominations(currency).map(denomination=>({denomination,quantity:0})));
  const [loading,setLoading]=useState(false),[error,setError]=useState("");
  let total="";try{total=physicalCountTotal(rows);}catch{}
  const url=`/api/enterprise/${organizationId}/reconciliations/physical-count-template?financialAccountId=${encodeURIComponent(accountId)}&locale=${locale}`;
  function edit(index:number,change:Partial<PhysicalCountRows[number]>){setRows(old=>old.map((row,i)=>i===index?{...row,...change}:row));}
  async function preview(file?:File){
    if(!file)return;setLoading(true);setError("");
    try{const data=new FormData();data.append("file",file);const response=await fetch(url,{method:"POST",body:data,cache:"no-store"});if(!response.ok)throw Error();const body=await response.json();physicalCountTotal(body.counts);setRows(body.counts);}
    catch{setError(tr("Fichier invalide ou compte/devise différent. Utilisez le modèle de ce compte.","Invalid file or account/currency mismatch. Use this account's template."));}
    finally{setLoading(false);}
  }
  return <div className="grid min-w-0 gap-3">
    <div data-responsive-actions><Button type="button" variant="outline" disabled={disabled||loading||!accountId} onClick={()=>window.location.assign(url)}>{tr("Modèle Excel de comptage","Excel count template")}</Button><Input aria-label={tr("Importer le comptage Excel","Import Excel count")} type="file" accept=".xlsx" disabled={disabled||loading||!accountId} onChange={e=>{void preview(e.target.files?.[0]);e.target.value="";}}/></div>
    {error?<p role="alert" className="text-sm text-red-600">{error}</p>:null}
    {rows.map((row,i)=><div key={i} className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-2"><label className="min-w-0 text-xs">{tr("Coupure","Denomination")} ({currency})<Input required type="number" min="0.000001" step="0.000001" value={row.denomination} disabled={disabled||loading} onChange={e=>edit(i,{denomination:e.target.value})}/></label><label className="min-w-0 text-xs">{tr("Quantité","Quantity")}<Input required type="number" min="0" max="1000000000" step="1" value={row.quantity} disabled={disabled||loading} onChange={e=>edit(i,{quantity:e.target.value===""?0:Number(e.target.value)})}/></label><Button type="button" variant="outline" size="sm" aria-label={tr("Retirer la coupure","Remove denomination")} disabled={disabled||loading||rows.length<=1} onClick={()=>setRows(old=>old.filter((_,j)=>j!==i))}>×</Button></div>)}
    <Button type="button" variant="outline" disabled={disabled||loading||rows.length>=50} onClick={()=>setRows(old=>[...old,{denomination:"",quantity:0}])}>{tr("Ajouter une coupure","Add denomination")}</Button>
    <label className="text-sm font-semibold">{tr("Total compté","Counted total")}<Input name="physicalCount" required readOnly value={total} aria-invalid={!total||loading} /></label>
    <input type="hidden" name="physicalCounts" value={loading?"":JSON.stringify(rows)}/>
    {!total?<p role="alert" className="text-sm text-red-600">{tr("Coupures positives et uniques, quantités entières requises.","Positive unique denominations and integer quantities are required.")}</p>:<p className="text-sm text-dtsc-muted">{financeMoney(total,currency,locale)}</p>}
  </div>;
}
