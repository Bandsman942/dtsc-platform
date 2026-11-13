"use client";
import { useCallback, useEffect, useState, type ChangeEvent } from "react";
import Link from "next/link";
import { FileJson, RefreshCw, ShieldAlert, Send, SearchCheck } from "lucide-react";
import { useAppLocale } from "@/components/i18n/locale-provider";
import { useToastMessage } from "@/components/ui/use-toast-message";
import { HirmsEnvironmentSwitch } from "./hirms-environment-switch";
import { HirmsWorkspaceNavigation } from "./hirms-workspace-navigation";
import type { HirmsEnvironment } from "@/lib/enterprise/health-insurance-connectors/environments";

type Submission = { id: string; invoiceNumber: string; batchId: string | null; transportStatus: string; httpStatus: number | null; submittedAt: string; errorCode: string | null; remoteStatus: string | null; lastStatusErrorCode: string | null };
type History = { items: Submission[]; total: number; page: number; pageCount: number; environment: HirmsEnvironment };
type Preflight = { ok: boolean; count: number; invoiceNumbers: string[] };
const STATUSES: Record<string,[string,string]> = {
  RECEIVED:["Reçue techniquement","Received by transport"],
  QUEUED:["Traitement en attente","Queued"],
  REJECTED:["Rejetée par HIRMS","Rejected by HIRMS"],
  UNKNOWN_OUTCOME:["État à rapprocher","Outcome unknown"],
  SENDING:["Transmission engagée","Sending"],
};
export function HirmsInvoiceSubmissionWorkspace({organizationId,initialEnvironment="UAT"}:{organizationId:string;initialEnvironment?:HirmsEnvironment}) {
  const en = useAppLocale() === "en";
  const tx = (fr:string,english:string)=>en ? english : fr;
  const [environment,setEnvironment] = useState<HirmsEnvironment>(initialEnvironment);
  const [productionConfirmation,setProductionConfirmation] = useState("");
  const [mode,setMode] = useState<"single"|"bulk">("single");
  const [json,setJson] = useState("");
  const [preflight,setPreflight] = useState<Preflight|null>(null);
  const [confirmed,setConfirmed] = useState(false);
  const [pending,setPending] = useState(false);
  const [history,setHistory] = useState<History|null>(null);
  const [page,setPage] = useState(1);
  const [notice,setNotice] = useState("");
  useToastMessage(notice);
  const load = useCallback(async (currentPage:number)=>{
    const response = await fetch(`/api/enterprise/${organizationId}/insurance-connectors/invoices?environment=${environment}&page=${currentPage}`,{cache:"no-store"});
    if(!response.ok) throw Error("HISTORY_FAILED");
    const payload = await response.json() as Omit<History, "environment">;
    setHistory({ ...payload, environment });
  },[organizationId,environment]);
  useEffect(()=>{ void load(page).catch(()=>{}); },[load,page]);
  const visibleHistory = history?.environment === environment ? history : null;
  function reset(value:string,newMode:"single"|"bulk"=mode){setJson(value);setPreflight(null);setConfirmed(false);setProductionConfirmation("");setMode(newMode)}
  function switchEnvironment(next:HirmsEnvironment){setEnvironment(next);setPreflight(null);setConfirmed(false);setProductionConfirmation("");setJson("");setHistory(null);setPage(1)}
  async function readJson(event:ChangeEvent<HTMLInputElement>){
    const file=event.target.files?.[0];if(!file)return;
    if(!file.name.toLowerCase().endsWith(".json")||file.size>4*1024*1024){
      setNotice(tx("Sélectionnez un fichier JSON de moins de 4 Mo.", "Select a JSON file smaller than 4 MB."));return;
    }
    try{reset(await file.text())}catch{setNotice(tx("Lecture du fichier impossible.", "Unable to read file."))}
    event.target.value="";
  }
  async function execute(operation:"preflight"|"submit"){
    setPending(true);setNotice("");
    try{
      const payload:unknown=JSON.parse(json);
      if(mode==="bulk" && (!Array.isArray(payload)||payload.length>500||payload.length<1)){
        setNotice(tx("Le bulk exige un tableau de 1 à 500 factures.", "Bulk requires an array of 1 to 500 invoices."));return;
      }
      if(mode==="single" && (Array.isArray(payload)||!payload||typeof payload!=="object")){
        setNotice(tx("L'envoi individuel exige un seul objet JSON.", "Single submission requires one JSON object."));return;
      }
      if(operation==="submit" && (!preflight || !confirmed || (environment==="PRODUCTION" && productionConfirmation!=="PRODUCTION"))){
        setNotice(tx("Contrôlez puis confirmez explicitement les factures.", "Preflight and explicitly confirm the invoices first."));return;
      }
      const response=await fetch(`/api/enterprise/${organizationId}/insurance-connectors/invoices`,{
        method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({environment,operation,mode,payload, ...(environment === "PRODUCTION" && operation === "submit" ? {productionConfirmation} : {})}),
      });
      const data=await response.json() as {message?:string;ok?:boolean;count?:number;invoiceNumbers?:string[];transportStatus?:string};
      if(!response.ok){setPreflight(null);setConfirmed(false);setNotice(data.message||tx("Contrôle impossible.", "Validation failed."));return}
      if(operation==="preflight"){
        setPreflight({ok:true,count:data.count||0,invoiceNumbers:data.invoiceNumbers||[]});
        setNotice(tx("Contrôle ERP réussi. Confirmez avant transmission.", "ERP validation passed. Confirm before submitting."));
      }else{
        setPreflight(null);setConfirmed(false);setJson("");
        setNotice(data.message||tx("Transmission enregistrée.", "Submission recorded."));
        setPage(1);await load(1);
      }
    }catch{setNotice(tx("JSON non valide ou connexion interrompue.", "Invalid JSON or network failure."))}
    finally{setPending(false)}
  }
  async function reconcile(id:string){
    setPending(true);setNotice("");
    try {
      const response=await fetch(`/api/enterprise/${organizationId}/insurance-connectors/invoices/status`,{
        method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({environment,submissionId:id}),
      });
      const data=await response.json() as {message?:string;error?:string};
      setNotice(data.message||data.error||tx("Statut HSL indisponible.","HSL status unavailable."));
      await load(page);
    }catch{setNotice(tx("Connexion HSL indisponible.","HSL connection unavailable."));}
    finally{setPending(false);}
  }
  return <main className="mx-auto w-full max-w-6xl space-y-4 px-4 py-5 sm:px-6">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="text-xs font-semibold text-dtsc-muted">{tx(`Assurances santé · Connecteur HIRMS · ${environment}`, `Health insurance · HIRMS adapter · ${environment}`)}</p>
        <h1 className="mt-1 text-2xl font-black tracking-tight text-dtsc-ink">{tx("Transmettre des factures à HIRMS", "Submit invoices to HIRMS")}</h1>
        <p className="mt-1 text-sm text-dtsc-muted">{tx("Pilotage technique : les factures doivent déjà exister et être émises dans l'ERP DTSC.", "Technical pilot: invoices must already exist and be issued in DTSC ERP.")}</p>
      </div>
      <Link href="/enterprise-admin" className="rounded-xl border border-dtsc-border px-3 py-2 text-sm font-bold text-dtsc-ink">{tx("Retour à l’administration","Back to administration")}</Link>
    </header>
    <Link href={`/enterprise-insurance/ocr?environment=${environment}`} className="inline-flex min-h-11 items-center rounded-xl border border-dtsc-border px-3 py-2 text-sm font-bold text-dtsc-ink">{tx("Documents et suivi OCR","OCR documents and tracking")}</Link>
    <HirmsEnvironmentSwitch value={environment} onChange={switchEnvironment} disabled={pending}/>
      <HirmsWorkspaceNavigation active="invoices" environment={environment}/>
    <section className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-dtsc-ink">
      <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden="true"/>
      <div><p className="font-bold">{tx(`Environnement ${environment} — Aucun paiement créé`, `${environment} environment — No payments created`)}</p>
        <p className="mt-1 text-xs text-dtsc-muted">{tx("Ce premier parcours importe un JSON HSL complet, contrôle les liens ERP, puis transmet après votre accord. Aucun champ clinique, autorisation, paiement ou taux de change n'est inventé.", "This pilot imports a complete HSL JSON payload, checks ERP links and sends it only after confirmation. No clinical, approval, payment or exchange-rate fields are invented.")}</p>
      </div>
    </section>
    <section className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(300px,1fr)]">
      <div className="min-w-0 space-y-4 rounded-2xl border border-dtsc-border bg-dtsc-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 font-black text-dtsc-ink"><FileJson className="h-5 w-5 text-cyan-600" aria-hidden="true"/>{tx("Fichier de facturation HSL", "HSL invoice payload")}</h2>
          <label className="inline-flex min-h-11 cursor-pointer items-center rounded-xl border border-dtsc-border px-3 text-sm font-bold text-dtsc-ink">
            {tx("Importer .json", "Import .json")}
            <input type="file" accept=".json,application/json" onChange={readJson} className="sr-only"/>
          </label>
        </div>
        <div className="flex gap-2">
          {(["single","bulk"] as const).map(kind=><button key={kind} type="button" onClick={()=>reset("",kind)} className={`min-h-11 flex-1 rounded-xl border px-3 text-sm font-bold ${mode===kind?"border-cyan-500 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300":"border-dtsc-border text-dtsc-ink"}`}>{kind==="single"?tx("Une facture","One invoice"):tx("Lot ≤ 500", "Batch ≤ 500")}</button>)}
        </div>
        <label className="block space-y-2 text-sm font-semibold text-dtsc-ink"><span>{tx("JSON conforme au modèle HSL", "JSON matching the HSL schema")}</span>
          <textarea value={json} onChange={e=>reset(e.target.value)} rows={14} spellCheck={false} placeholder={mode==="bulk"?"[{ \"InvoiceID\": \"…\" }]":"{ \"InvoiceID\": \"…\" }"}
            className="w-full min-w-0 resize-y rounded-xl border border-dtsc-border bg-dtsc-page p-3 font-mono text-xs text-dtsc-ink"/>
        </label>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={pending || !json.trim()} onClick={()=>void execute("preflight")} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-dtsc-border px-4 text-sm font-bold text-dtsc-ink disabled:opacity-50"><SearchCheck className="h-4 w-4"/>{tx("Contrôler avec l’ERP","Preflight with ERP")}</button>
          <button type="button" disabled={pending || !preflight || !confirmed || (environment==="PRODUCTION" && productionConfirmation!=="PRODUCTION")} onClick={()=>void execute("submit")} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-cyan-600 px-4 text-sm font-bold text-white disabled:opacity-50"><Send className="h-4 w-4"/>{tx(`Transmettre en ${environment}`,`Submit to ${environment}`)}</button>
        </div>
      </div>
      <aside className="min-w-0 space-y-3">
        <section className="rounded-2xl border border-dtsc-border bg-dtsc-surface p-4">
          <h2 className="font-black text-dtsc-ink">{tx("Contrôle préalable", "Preflight")}</h2>
          {preflight?<div className="mt-3 space-y-3">
            <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">{preflight.count} {tx("facture(s) liées à l'ERP", "ERP-linked invoice(s)")}</p>
            <div className="max-h-36 space-y-1 overflow-y-auto text-xs text-dtsc-ink">{preflight.invoiceNumbers.map(number=><p key={number}>{number}</p>)}</div>
            <label className="flex items-start gap-3 rounded-xl bg-dtsc-page p-3 text-sm text-dtsc-ink">
              <input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} className="mt-1 h-4 w-4"/>
              {tx("Je confirme les références, prestations, montants et habilitations HSL de ce dossier.", "I confirm references, services, amounts and HSL authorization for this submission.")}
            </label>
            {environment==="PRODUCTION" && <label className="block space-y-1 text-sm font-semibold text-amber-700 dark:text-amber-300">
              <span>{tx("Pour confirmer un envoi réel, saisissez PRODUCTION", "Type PRODUCTION to confirm a live submission")}</span>
              <input autoComplete="off" value={productionConfirmation} onChange={e=>setProductionConfirmation(e.target.value)} placeholder="PRODUCTION" className="min-h-11 w-full rounded-xl border border-amber-500/50 bg-dtsc-page px-3 text-sm text-dtsc-ink"/>
            </label>}
          </div>:<p className="mt-3 text-sm text-dtsc-muted">{tx("Importer ou coller le JSON puis effectuer le contrôle ERP.", "Import or paste JSON, then run the ERP preflight.")}</p>}
        </section>
        <section className="rounded-2xl border border-dtsc-border bg-dtsc-surface p-4">
          <div className="flex items-center justify-between gap-2"><h2 className="font-black text-dtsc-ink">{tx("Transmissions", "Submissions")}</h2>
            <button type="button" onClick={()=>void load(page).catch(()=>setNotice(tx("Historique indisponible.","History unavailable.")))} aria-label={tx("Actualiser","Refresh")} className="rounded-lg border border-dtsc-border p-2 text-dtsc-ink"><RefreshCw className="h-4 w-4"/></button>
          </div>
          <div className="mt-2 max-h-[440px] space-y-2 overflow-y-auto">
            {visibleHistory?.items.map(item=><div key={item.id} className="rounded-xl border border-dtsc-border p-3">
              <p className="break-all text-sm font-bold text-dtsc-ink">{item.invoiceNumber}</p>
              <p className="mt-1 text-xs text-dtsc-muted">{STATUSES[item.transportStatus]?.[en?1:0] || item.transportStatus} · {new Date(item.submittedAt).toLocaleString(en?"en":"fr")}</p>
              {item.remoteStatus && <p className="mt-1 break-all text-xs font-semibold text-cyan-700 dark:text-cyan-300">HSL: {item.remoteStatus}</p>}
              {item.errorCode?<p className="mt-1 break-all text-xs text-amber-700 dark:text-amber-300">{item.errorCode}</p>:null}
              {item.lastStatusErrorCode && <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">{item.lastStatusErrorCode}</p>}
              <button type="button" disabled={pending} onClick={()=>void reconcile(item.id)} className="mt-2 min-h-10 rounded-lg border border-dtsc-border px-3 text-xs font-bold text-dtsc-ink disabled:opacity-50">{tx("Vérifier le statut HSL","Check HSL status")}</button>
            </div>)}
            {!visibleHistory?.items.length?<p className="py-6 text-center text-xs text-dtsc-muted">{tx("Aucune transmission enregistrée.","No submissions recorded.")}</p>:null}
          </div>
          <div className="mt-3 flex items-center justify-between gap-2 border-t border-dtsc-border pt-3 text-xs text-dtsc-muted">
            <button type="button" disabled={page<=1} onClick={()=>setPage(p=>p-1)} className="min-h-10 rounded-lg border border-dtsc-border px-3 disabled:opacity-40">{tx("Précédent","Previous")}</button>
            <span>{page}/{visibleHistory?.pageCount||1}</span>
            <button type="button" disabled={page>=(visibleHistory?.pageCount||1)} onClick={()=>setPage(p=>p+1)} className="min-h-10 rounded-lg border border-dtsc-border px-3 disabled:opacity-40">{tx("Suivant","Next")}</button>
          </div>
        </section>
      </aside>
    </section>
  </main>;
}
