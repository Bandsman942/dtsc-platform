"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { BadgeCheck, ScanLine, ShieldAlert } from "lucide-react";
import { useAppLocale } from "@/components/i18n/locale-provider";
import { useToastMessage } from "@/components/ui/use-toast-message";
import { HirmsEnvironmentSwitch } from "./hirms-environment-switch";
import type { HirmsEnvironment } from "@/lib/enterprise/health-insurance-connectors/environments";

type Result = {
  verified: boolean; memberName: string | null; planName: string | null;
  cover: string | null; service: string | null; network: string | null; serviceDate: string | null;
};
const translations: Record<string, [string, string]> = {
  Active: ["Couverture active", "Active cover"], NotStarted: ["Couverture non commencée", "Cover not started"],
  Ended: ["Couverture terminée", "Cover ended"], Covered: ["Prestation couverte", "Service covered"],
  NeedsPreAuthorisation: ["Autorisation préalable requise", "Preauthorization required"],
  NotCovered: ["Prestation non couverte", "Service not covered"],
  UnknownCode: ["Code non reconnu", "Unknown service code"], Allowed: ["Prestataire autorisé", "Provider allowed"],
  NotAllowed: ["Prestataire non autorisé", "Provider not allowed"],
};

export function InsuranceMemberVerifyWorkspace({ organizationId, sector, initialEnvironment = "UAT" }: { organizationId: string; sector: "HEALTH_CARE" | "PHARMACY"; initialEnvironment?: HirmsEnvironment }) {
  const en = useAppLocale() === "en";
  const tx = (fr: string, english: string) => en ? english : fr;
  const [environment, setEnvironment] = useState<HirmsEnvironment>(initialEnvironment);
  const [memberNumber, setMemberNumber] = useState("");
  const [cardReference, setCardReference] = useState("");
  const [serviceCode, setServiceCode] = useState("");
  const [codeSystem, setCodeSystem] = useState<"CPT"|"CDT"|"HCPCS"|"DRUG">(sector === "PHARMACY" ? "DRUG" : "CPT");
  const [serviceDate, setServiceDate] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");
  useToastMessage(notice);
  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setNotice(""); setResult(null); setPending(true);
    try {
      const response = await fetch(`/api/enterprise/${organizationId}/insurance-connectors/verify`, {
        method: "POST", cache: "no-store", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ environment, memberNumber: memberNumber.trim(), cardReference, ...(serviceCode.trim() ? { serviceCode: serviceCode.trim(), codeSystem } : {}), ...(serviceDate ? { serviceDate } : {}) }),
      });
      const payload = await response.json() as { message?: string; result?: Result };
      if (!response.ok || !payload.result) { setNotice(payload.message || tx("Vérification indisponible.", "Verification unavailable.")); return; }
      setResult(payload.result);
      // The card QR reference must never be persisted in browser storage.
      setCardReference("");
    } catch {
      setNotice(tx("Connexion interrompue. Aucun résultat ne peut être présumé.", "Connection interrupted. No eligibility can be assumed."));
    } finally { setPending(false); }
  }
  function value(code: string | null) { if (!code) return "—"; const label = translations[code]; return label ? label[en ? 1 : 0] : code; }
  return (
    <main className="mx-auto w-full max-w-5xl space-y-4 px-4 py-5 sm:px-6">
      <header className="flex flex-wrap justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-dtsc-muted">{tx("Assurances santé · MSO / HIRMS", "Health insurance · MSO / HIRMS")}</p>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-dtsc-ink">{tx("Vérifier un adhérent", "Verify a member")}</h1>
          <p className="mt-1 text-sm text-dtsc-muted">{tx(`Vérification HSL ${environment}. Aucun remboursement n’est garanti par ce contrôle.`, `HSL ${environment} verification. This check does not guarantee reimbursement.`)}</p>
        </div>
        <Link href={sector === "HEALTH_CARE" ? "/enterprise-modules/INSURANCE_COVERAGE" : "/enterprise-modules/SALES_DISPENSATION"} className="self-start rounded-xl border border-dtsc-border px-3 py-2 text-sm font-bold text-dtsc-ink">{tx("Retour au module", "Back to module")}</Link>
      </header>
      <HirmsEnvironmentSwitch value={environment} onChange={next=>{setEnvironment(next);setResult(null);setCardReference("");setMemberNumber("");}} disabled={pending}/>
      {environment==="PRODUCTION" && <p role="note" className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-dtsc-ink">{tx("Contrôle sur le service réel. N’utilisez que les données d’un adhérent autorisées pour cette prestation.", "Live HSL service. Use only authorized member data for this care.")}</p>}
      <div className="grid gap-4 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <form onSubmit={verify} className="min-w-0 space-y-4 rounded-2xl border border-dtsc-border bg-dtsc-surface p-4 sm:p-5">
          <h2 className="flex items-center gap-2 font-bold text-dtsc-ink"><ScanLine className="h-5 w-5 text-cyan-600" aria-hidden="true"/>{tx("Carte et prestation", "Card and service")}</h2>
          <label className="block space-y-1 text-sm font-semibold text-dtsc-ink"><span>{tx("Numéro MSO", "MSO member number")} *</span><input required value={memberNumber} onChange={(event)=>setMemberNumber(event.target.value)} autoComplete="off" className="min-h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3 text-sm" placeholder="MSO-…" /></label>
          <label className="block space-y-1 text-sm font-semibold text-dtsc-ink"><span>{tx("Référence QR exacte de la carte", "Exact card QR reference")} *</span><input required value={cardReference} onChange={(event)=>setCardReference(event.target.value)} autoComplete="off" className="min-h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3 text-sm" placeholder="HSL:QR:…" /><span className="block text-xs font-normal text-dtsc-muted">{tx("Utilisez exactement le contenu du QR imprimé sur la carte ; aucune photo n’est nécessaire.", "Use the exact printed QR contents; no photograph is required.")}</span></label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1 text-sm font-semibold text-dtsc-ink"><span>{tx("Code d'acte ou médicament", "Service or drug code")}</span><input value={serviceCode} onChange={(event)=>setServiceCode(event.target.value)} className="min-h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3 text-sm"/></label>
            <label className="block space-y-1 text-sm font-semibold text-dtsc-ink"><span>{tx("Nomenclature", "Code system")}</span><select value={codeSystem} onChange={(event)=>setCodeSystem(event.target.value as "CPT"|"CDT"|"HCPCS"|"DRUG")} className="min-h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3 text-sm"><option value="CPT">CPT</option><option value="CDT">CDT</option><option value="HCPCS">HCPCS</option><option value="DRUG">DRUG</option></select></label>
          </div>
          <label className="block space-y-1 text-sm font-semibold text-dtsc-ink"><span>{tx("Date de la prestation (facultative)", "Service date (optional)")}</span><input type="date" value={serviceDate} onChange={(event)=>setServiceDate(event.target.value)} className="min-h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3 text-sm"/><span className="block text-xs font-normal text-dtsc-muted">{tx("Sans date, HIRMS utilise la date courante de Kinshasa.", "Without a date, HIRMS uses the current date in Kinshasa.")}</span></label>
          <button disabled={pending} type="submit" className="min-h-11 w-full rounded-xl bg-cyan-600 px-4 text-sm font-bold text-white hover:bg-cyan-700 disabled:opacity-60">{pending ? tx("Vérification en cours…", "Checking…") : tx("Vérifier auprès de MSO", "Verify with MSO")}</button>
        </form>
        <section aria-live="polite" className="min-w-0 rounded-2xl border border-dtsc-border bg-dtsc-surface p-4 sm:p-5">
          <h2 className="font-bold text-dtsc-ink">{tx("Résultat HIRMS", "HIRMS result")}</h2>
          {!result ? <div className="mt-4 space-y-2 text-sm text-dtsc-muted"><ShieldAlert className="h-7 w-7"/><p>{tx("Aucune vérification effectuée dans cette session.", "No verification in this session.")}</p><p className="text-xs">{tx("Les réponses sont chargées directement auprès de HSL ; elles ne sont pas simulées.", "Responses come directly from HSL and are not simulated.")}</p></div> :
            <div className="mt-4 space-y-3">
              <div className={`flex items-center gap-2 rounded-xl p-3 font-bold ${result.verified ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-amber-500/10 text-amber-700 dark:text-amber-300"}`}><BadgeCheck className="h-5 w-5"/>{result.verified ? tx("Adhérent vérifié", "Member verified") : tx("Adhérent non vérifié", "Member not verified")}</div>
              {result.verified ? [
                [tx("Nom", "Name"), result.memberName],
                [tx("Formule", "Plan"), result.planName],
                [tx("Couverture", "Cover"), value(result.cover)],
                [tx("Prestation", "Service"), value(result.service)],
                [tx("Réseau", "Network"), value(result.network)],
                [tx("Date de contrôle", "Service date"), result.serviceDate],
              ].map(([label,detail])=><div key={label} className="flex justify-between gap-3 border-b border-dtsc-border py-2 text-sm"><span className="text-dtsc-muted">{label}</span><span className="text-right font-semibold text-dtsc-ink">{detail || "—"}</span></div>) : <p className="text-xs text-dtsc-muted">{tx("Vérifiez le numéro et la référence de carte sans supposer une couverture.", "Check the member number and card reference without assuming eligibility.")}</p>}
            </div>}
          <p className="mt-5 text-xs text-dtsc-muted">{tx("Le résultat ne contient aucun montant, plafond ni accord financier de remboursement.", "The response provides no financial amount, limit or reimbursement guarantee.")}</p>
        </section>
      </div>
    </main>
  );
}
