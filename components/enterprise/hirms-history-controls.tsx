"use client";
import { CalendarDays, Download, RotateCcw, Search } from "lucide-react";
import { ModuleMetric, ModuleMetrics } from "@/components/workspace/module-metrics";
import { useAppLocale } from "@/components/i18n/locale-provider";
import { HirmsStatusIndicator, HIRMS_STATUS_VALUES } from "./hirms-status-indicator";

export type HirmsHistoryControlsValue = {search:string;status:string;from:string;to:string};
export function HirmsHistoryControls({value,onChange,statusCounts,total,onExport,pending=false}:{
  value:HirmsHistoryControlsValue;
  onChange:(next:HirmsHistoryControlsValue)=>void;
  statusCounts:Record<string,number>;
  total:number;
  onExport:()=>void;
  pending?:boolean;
}) {
  const en=useAppLocale()==="en";
  const tx=(fr:string,english:string)=>en?english:fr;
  function patch(changes:Partial<HirmsHistoryControlsValue>){onChange({...value,...changes});}
  const queued=(statusCounts.QUEUED||0)+(statusCounts.SENDING||0)+(statusCounts.UPLOADING||0);
  const warnings=(statusCounts.UNKNOWN_OUTCOME||0)+(statusCounts.REFERENCE_UNCONFIRMED||0)+(statusCounts.REJECTED||0);
  return <section aria-label={tx("Exploration des historiques HSL","Explore HSL histories")} className="min-w-0 space-y-3">
    <ModuleMetrics label={tx("Indicateurs de suivi HIRMS","HIRMS tracking metrics")}>
      <ModuleMetric label={tx("Dossiers trouvés","Matching records")} value={Object.values(statusCounts).reduce((a,b)=>a+b,0)} hint={tx("Avant filtre statut","Before status filter")}/>
      <ModuleMetric label={tx("En cours","In progress")} value={queued}/>
      <ModuleMetric label={tx("Reçus par HSL","Received by HSL")} value={statusCounts.RECEIVED||0} hint={tx("Pas une preuve de paiement","Not proof of payment")}/>
      <ModuleMetric label={tx("À examiner","Needs review")} value={warnings} hint={tx("Rejets et états incertains","Rejected and unknown outcomes")}/>
    </ModuleMetrics>
    <div className="flex min-w-0 flex-wrap items-end gap-2">
      <label className="relative min-w-[12rem] flex-[2_1_15rem] space-y-1 text-xs font-semibold text-dtsc-muted">
        <span>{tx("Recherche par référence","Reference search")}</span>
        <Search aria-hidden="true" className="pointer-events-none absolute bottom-3 left-3 h-4 w-4"/>
        <input type="search" maxLength={80} value={value.search} onChange={e=>patch({search:e.target.value})}
          placeholder={tx("N° facture ou identifiant HSL","Invoice number or HSL ID")}
          className="min-h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-page py-2 pl-9 pr-3 text-sm text-dtsc-ink"/>
      </label>
      {(["from","to"] as const).map(key=><label key={key} className="min-w-[8.5rem] flex-1 space-y-1 text-xs font-semibold text-dtsc-muted">
        <span className="flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" aria-hidden="true"/>{key==="from"?tx("Du (UTC)","From (UTC)"):tx("Au (UTC)","To (UTC)")}</span>
        <input type="date" max={key==="from"&&value.to?value.to:undefined} min={key==="to"&&value.from?value.from:undefined}
          value={value[key]} onChange={e=>patch({[key]:e.target.value})}
          className="min-h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-page px-2 text-sm text-dtsc-ink"/>
      </label>)}
      <button type="button" disabled={pending} onClick={onExport}
        className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-dtsc-border px-3 text-sm font-bold text-dtsc-ink hover:bg-dtsc-page disabled:opacity-50">
        <Download className="h-4 w-4" aria-hidden="true"/>{tx("Exporter CSV","Export CSV")}
      </button>
      <button type="button" disabled={pending||!Object.values(value).some(Boolean)} onClick={()=>onChange({search:"",status:"",from:"",to:""})}
        aria-label={tx("Réinitialiser les filtres","Reset filters")}
        className="inline-flex min-h-11 items-center justify-center rounded-xl border border-dtsc-border px-3 text-dtsc-ink disabled:opacity-40">
        <RotateCcw className="h-4 w-4" aria-hidden="true"/>
      </button>
    </div>
    <div className="flex max-w-full snap-x gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]" role="group" aria-label={tx("Filtrer par statut","Filter by status")}>
      <button type="button" aria-pressed={!value.status} onClick={()=>patch({status:""})}
        className={`min-h-10 shrink-0 rounded-xl border px-3 text-xs font-bold ${!value.status?"border-cyan-500 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300":"border-dtsc-border text-dtsc-ink"}`}>
        {tx("Tous","All")} · {Object.values(statusCounts).reduce((a,b)=>a+b,0)}
      </button>
      {HIRMS_STATUS_VALUES.filter(code=>(statusCounts[code]||0)>0 || value.status===code).map(code=>
        <button key={code} type="button" aria-pressed={value.status===code} onClick={()=>patch({status:code})}
          className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl border px-2.5 ${value.status===code?"border-cyan-500 bg-cyan-500/10":"border-dtsc-border"}`}>
          <HirmsStatusIndicator code={code}/><span className="text-xs tabular-nums text-dtsc-muted">{statusCounts[code]||0}</span>
        </button>
      )}
    </div>
    <p className="text-[0.7rem] text-dtsc-muted">{tx(`${total} élément(s) dans le filtre actif · Export limité aux 500 premiers résultats triés par date.`,`${total} matching items · Export includes the first 500 results by date.`)}</p>
  </section>;
}
