"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { FileScan, RefreshCw, ShieldAlert, UploadCloud } from "lucide-react";
import { useAppLocale } from "@/components/i18n/locale-provider";
import { useToastMessage } from "@/components/ui/use-toast-message";
import type { HirmsEnvironment } from "@/lib/enterprise/health-insurance-connectors/environments";
import { HirmsEnvironmentSwitch } from "./hirms-environment-switch";
import { HirmsWorkspaceNavigation } from "./hirms-workspace-navigation";

type OcrRow = {
  id: string; mimeType: string; bytes: number; invoiceDate: string | null; submittedAt: string;
  transportStatus: string; remoteStatus: string|null; externalJobId: string|null;
  errorCode: string|null; salesInvoiceId: string|null;
};
type History = { environment: HirmsEnvironment; items: OcrRow[]; total: number; page: number; pageCount: number };
const MAX_FILE_SIZE = 4 * 1024 * 1024;
const MIMES = ["application/pdf","image/png","image/jpeg","image/webp"];
export function HirmsOcrWorkspace({organizationId,initialEnvironment="UAT"}:{
  organizationId:string; initialEnvironment?:HirmsEnvironment;
}) {
  const en = useAppLocale()==="en";
  const tx=(fr:string,english:string)=>en?english:fr;
  const [environment,setEnvironment]=useState<HirmsEnvironment>(initialEnvironment);
  const [file,setFile]=useState<File|null>(null);
  const [invoiceDate,setInvoiceDate]=useState("");
  const [providerId,setProviderId]=useState("");
  const [note,setNote]=useState("");
  const [salesInvoiceId,setSalesInvoiceId]=useState("");
  const [confirmProd,setConfirmProd]=useState("");
  const [pending,setPending]=useState(false);
  const [notice,setNotice]=useState("");
  const [page,setPage]=useState(1);
  const [history,setHistory]=useState<History|null>(null);
  const epoch=useRef(0);
  useToastMessage(notice);
  const load=useCallback(async (currentPage:number)=>{
    const id=++epoch.current;
    const response=await fetch(`/api/enterprise/${organizationId}/insurance-connectors/ocr?environment=${environment}&page=${currentPage}`,{cache:"no-store"});
    if(!response.ok)throw Error("OCR_HISTORY_UNAVAILABLE");
    const result=await response.json() as Omit<History,"environment">;
    if(epoch.current===id)setHistory({...result,environment});
  },[organizationId,environment]);
  useEffect(()=>{void load(page).catch(()=>{});},[load,page]);
  const shown=history?.environment===environment?history:null;
  function switchEnvironment(next:HirmsEnvironment){
    epoch.current++;setEnvironment(next);setHistory(null);setFile(null);setInvoiceDate("");setSalesInvoiceId("");setProviderId("");setNote("");setConfirmProd("");setPage(1);
  }
  async function upload(event:FormEvent<HTMLFormElement>){
    event.preventDefault();setNotice("");
    if(!file||!MIMES.includes(file.type)||file.size<1||file.size>MAX_FILE_SIZE){
      setNotice(tx("Choisissez un PDF ou une image valide de 4 Mo maximum.","Select a valid PDF or image up to 4 MB."));return;
    }
    if(environment==="PRODUCTION"&&confirmProd!=="PRODUCTION"){
      setNotice(tx("Confirmez PRODUCTION avant l'envoi réel.","Confirm PRODUCTION before a live upload."));return;
    }
    setPending(true);
    try{
      const form=new FormData();form.append("environment",environment);
      if(invoiceDate)form.append("invoiceDate",invoiceDate);
      if(providerId.trim())form.append("providerId",providerId.trim());
      if(note.trim())form.append("note",note.trim());
      form.append("file",file,file.name);
      if(salesInvoiceId.trim())form.append("salesInvoiceId",salesInvoiceId.trim());
      if(environment==="PRODUCTION")form.append("productionConfirmation",confirmProd);
      const response=await fetch(`/api/enterprise/${organizationId}/insurance-connectors/ocr`,{method:"POST",body:form});
      const data=await response.json() as {message?:string;error?:string;ok?:boolean};
      if(!response.ok){setNotice(data.message||data.error||tx("Envoi OCR refusé.","OCR upload rejected."));await load(1);return;}
      setFile(null);setConfirmProd("");setSalesInvoiceId("");setInvoiceDate("");setProviderId("");setNote("");
      setNotice(data.message||tx("Document reçu pour traitement OCR.","Document received for OCR processing."));
      setPage(1);await load(1);
    }catch{setNotice(tx("Résultat du transfert incertain. Consultez l'historique avant toute nouvelle tentative.","Upload outcome uncertain. Check history before retrying."));}
    finally{setPending(false)}
  }
  async function poll(id:string){
    setPending(true);setNotice("");
    try{
      const response=await fetch(`/api/enterprise/${organizationId}/insurance-connectors/ocr/status`,{
        method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({environment,id}),
      });
      const data=await response.json() as {message?:string;error?:string};
      setNotice(data.message||data.error||tx("Suivi indisponible.","Status unavailable."));
      await load(page);
    }catch{setNotice(tx("Connexion indisponible.","Connection unavailable."))}
    finally{setPending(false)}
  }
  return <main className="mx-auto w-full max-w-6xl space-y-4 px-4 py-5 sm:px-6">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="text-xs font-semibold text-dtsc-muted">MSO / HIRMS · OCR · {environment}</p>
        <h1 className="mt-1 text-2xl font-black text-dtsc-ink">{tx("Documents et suivi OCR","OCR documents and tracking")}</h1>
        <p className="mt-1 text-sm text-dtsc-muted">{tx("Envoyez un PDF ou une image à HSL, puis vérifiez le traitement documentaire, sans modifier les finances ERP.","Upload PDF/image to HSL and inspect document processing without modifying ERP finances.")}</p>
      </div>
      <Link href={`/enterprise-insurance/connectors?environment=${environment}`} className="rounded-xl border border-dtsc-border px-3 py-2 text-sm font-bold text-dtsc-ink">{tx("Configuration HSL","HSL settings")}</Link>
    </header>
    <HirmsEnvironmentSwitch value={environment} onChange={switchEnvironment} disabled={pending}/>
      <HirmsWorkspaceNavigation active="ocr" environment={environment}/>
    <section className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-dtsc-ink">
      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true"/>
      <p>{tx("HSL accepte 50 Mo par document ; ce transfert direct est limité à 4 Mo sur Vercel. Autorisation UploadDocuments requise. Ni reconnaissance OCR ni traitement terminé ne valent validation de facture ou paiement.",
        "HSL allows up to 50 MB per document; this Vercel direct upload supports only 4 MB. UploadDocuments permission required. OCR processing never means an invoice was approved or paid.")}</p>
    </section>
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,1fr)]">
      <form onSubmit={upload} className="min-w-0 space-y-4 rounded-2xl border border-dtsc-border bg-dtsc-surface p-4 sm:p-5">
        <h2 className="flex items-center gap-2 font-black text-dtsc-ink"><UploadCloud className="h-5 w-5 text-cyan-600"/>{tx("Envoyer un document","Upload a document")}</h2>
        <label className="block space-y-2 text-sm font-bold text-dtsc-ink">
          <span>{tx("Document PDF ou image","PDF or image")} *</span>
          <input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp"
            required onChange={event=>setFile(event.target.files?.[0]||null)}
            className="block w-full rounded-xl border border-dtsc-border bg-dtsc-page p-3 text-xs"/>
          <span className="block text-xs font-normal text-dtsc-muted">{file ? `${file.name} · ${(file.size/1024/1024).toFixed(2)} Mo` : tx("Fichier unique, 4 Mo maximum","One file, 4 MB maximum")}</span>
        </label>
        <label className="block space-y-1 text-sm font-bold text-dtsc-ink">
          <span>{tx("Date de la facture (facultative)","Invoice date (optional)")}</span>
          <input type="date" value={invoiceDate} onChange={event=>setInvoiceDate(event.target.value)}
            className="min-h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3 text-sm"/>
        </label>
        <label className="block space-y-1 text-sm font-bold text-dtsc-ink">
          <span>{tx("Identifiant de facture ERP (facultatif)","ERP invoice ID (optional)")}</span>
          <input value={salesInvoiceId} onChange={event=>setSalesInvoiceId(event.target.value)}
            className="min-h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3 text-sm"/>
        </label>
        <label className="block space-y-1 text-sm font-bold text-dtsc-ink">
          <span>{tx("GUID d’établissement HSL (si nécessaire)","HSL facility GUID (if needed)")}</span>
          <input value={providerId} onChange={event=>setProviderId(event.target.value)}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            className="min-h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3 text-sm"/>
          <span className="block text-xs font-normal text-dtsc-muted">{tx("Champ providerId : requis par HSL si le compte possède plusieurs établissements ; ne pas le confondre avec le ServiceProviderID numérique des factures.","providerId is required by HSL for multi-facility accounts and differs from the numeric invoice ServiceProviderID.")}</span>
        </label>
        <label className="block space-y-1 text-sm font-bold text-dtsc-ink">
          <span>{tx("Note HSL (facultative)","HSL note (optional)")}</span>
          <textarea rows={2} maxLength={300} value={note} onChange={event=>setNote(event.target.value)}
            className="w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-sm"/>
          <span className="block text-xs font-normal text-dtsc-muted">{tx("Transmise uniquement à HSL, non conservée dans l’historique DTSC.","Sent only to HSL; not stored in the DTSC history.")}</span>
        </label>
        {environment==="PRODUCTION"&&<label className="block space-y-1 text-sm font-bold text-amber-700 dark:text-amber-300">
          <span>{tx("Saisissez PRODUCTION pour confirmer l'envoi réel","Type PRODUCTION to confirm live upload")}</span>
          <input value={confirmProd} onChange={event=>setConfirmProd(event.target.value)} placeholder="PRODUCTION"
            className="min-h-11 w-full rounded-xl border border-amber-500/50 bg-dtsc-page px-3 text-sm text-dtsc-ink"/>
        </label>}
        <button type="submit" disabled={pending||!file||(environment==="PRODUCTION"&&confirmProd!=="PRODUCTION")}
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-cyan-600 px-4 text-sm font-bold text-white disabled:opacity-50">
          <FileScan className="h-4 w-4"/>{pending?tx("Traitement…","Working…"):tx(`Envoyer à HSL · ${environment}`,`Upload to HSL · ${environment}`)}
        </button>
      </form>
      <section className="min-w-0 space-y-3 rounded-2xl border border-dtsc-border bg-dtsc-surface p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-black text-dtsc-ink">{tx("Historique des traitements","Processing history")}</h2>
          <button type="button" aria-label={tx("Actualiser","Refresh")} onClick={()=>void load(page).catch(()=>setNotice("Historique indisponible."))}
            className="rounded-xl border border-dtsc-border p-2 text-dtsc-ink"><RefreshCw className="h-4 w-4"/></button>
        </div>
        <div className="max-h-[500px] space-y-2 overflow-y-auto">
          {shown?.items.map(item=><article key={item.id} className="rounded-xl border border-dtsc-border p-3">
            <p className="text-xs font-bold text-dtsc-ink">{item.mimeType} · {(item.bytes/1024).toFixed(0)} Ko · {item.invoiceDate || "—"}</p>
            <p className="mt-1 text-xs text-dtsc-muted">{item.transportStatus} · {new Date(item.submittedAt).toLocaleString(en?"en":"fr")}</p>
            {item.remoteStatus&&<p className="mt-1 break-all text-xs font-bold text-cyan-700 dark:text-cyan-300">HSL: {item.remoteStatus}</p>}
            {item.errorCode&&<p className="mt-1 text-xs text-amber-700 dark:text-amber-300">{item.errorCode}</p>}
            {item.externalJobId&&<button disabled={pending} type="button" onClick={()=>void poll(item.id)}
              className="mt-2 min-h-10 rounded-lg border border-dtsc-border px-3 text-xs font-bold text-dtsc-ink disabled:opacity-50">{tx("Vérifier l'avancement","Check progress")}</button>}
          </article>)}
          {!shown?.items.length&&<p className="py-5 text-center text-xs text-dtsc-muted">{tx("Aucun document transmis.","No documents submitted.")}</p>}
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-dtsc-border pt-3 text-xs text-dtsc-muted">
          <button type="button" disabled={page<=1} onClick={()=>setPage(p=>p-1)} className="min-h-10 rounded-lg border px-3 disabled:opacity-40">{tx("Précédent","Previous")}</button>
          <span>{page}/{shown?.pageCount||1}</span>
          <button type="button" disabled={page>=(shown?.pageCount||1)} onClick={()=>setPage(p=>p+1)} className="min-h-10 rounded-lg border px-3 disabled:opacity-40">{tx("Suivant","Next")}</button>
        </div>
      </section>
    </div>
  </main>;
}
