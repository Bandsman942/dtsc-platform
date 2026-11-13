"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { BadgeCheck, CircleHelp, KeyRound, PlugZap, RefreshCw, ShieldCheck, Stethoscope } from "lucide-react";
import { useAppLocale } from "@/components/i18n/locale-provider";
import { useToastMessage } from "@/components/ui/use-toast-message";
import { HirmsEnvironmentSwitch } from "./hirms-environment-switch";
import { HirmsWorkspaceNavigation } from "./hirms-workspace-navigation";
import type { HirmsEnvironment } from "@/lib/enterprise/health-insurance-connectors/environments";

type Connector = {
  id: string; status: string; environment: string; siteId: string | null; hslServiceProviderId: number | null;
  credentialsConfigured: boolean; lastAuthCheckAt: string | null; lastVerifiedAt: string | null;
  credentialsUpdatedAt: string | null; lastErrorCode: string | null;
};
type Dataset = { connector: Connector | null; sites: Array<{ id: string; name: string; code: string }>;
  environment: HirmsEnvironment; productionEnabled: boolean; uatInvoiceSendEnabled: boolean; productionInvoiceSendEnabled: boolean };

export function HealthInsuranceConnectorWorkspace({ organizationId, initialEnvironment = "UAT" }: { organizationId: string; initialEnvironment?: HirmsEnvironment }) {
  const locale = useAppLocale() || "fr";
  const en = locale === "en";
  const tx = (fr: string, english: string) => en ? english : fr;
  const [environment, setEnvironment] = useState<HirmsEnvironment>(initialEnvironment);
  const requestEpoch = useRef(0);
  const [data, setData] = useState<Dataset | null>(null);
  const [siteId, setSiteId] = useState("");
  const [serviceProviderId, setServiceProviderId] = useState("");
  const [username, setUsername] = useState("");
  const [secret, setSecret] = useState("");
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");
  useToastMessage(notice);
  const load = useCallback(async () => {
    const currentRequest = ++requestEpoch.current;
    const response = await fetch(`/api/enterprise/${organizationId}/insurance-connectors?environment=${environment}`, { cache: "no-store" });
    if (!response.ok) throw new Error("LOAD_FAILED");
    const payload = await response.json() as Dataset;
    if (currentRequest !== requestEpoch.current || payload.environment !== environment) return;
    setData(payload);
    setSiteId(payload.connector?.siteId || "");
    setServiceProviderId(payload.connector?.hslServiceProviderId ? String(payload.connector.hslServiceProviderId) : "");
  }, [organizationId, environment]);
  useEffect(() => {
    setData(null); setUsername(""); setSecret(""); setSiteId(""); setServiceProviderId("");
    void load().catch(() => setNotice("Chargement du connecteur indisponible."));
  }, [load]);

  async function send(payload: Record<string, unknown>, success: string) {
    setPending(true); setNotice("");
    try {
      const response = await fetch(`/api/enterprise/${organizationId}/insurance-connectors`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, environment }),
      });
      const body = await response.json() as { message?: string };
      if (!response.ok) { setNotice(body.message || tx("Opération impossible.", "Operation failed.")); return; }
      setNotice(success);
      setUsername(""); setSecret("");
      await load();
    } catch {
      setNotice(tx("Connexion interrompue. Réessayez.", "Connection interrupted. Please retry."));
    } finally { setPending(false); }
  }
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void send({ siteId: siteId || null, hslServiceProviderId: serviceProviderId ? Number(serviceProviderId) : null, ...(username && secret ? { username, secret } : {}) },
      tx(`Configuration ${environment} enregistrée. Testez maintenant l’authentification HSL.`, `${environment} configuration saved. Test HSL authentication now.`));
  }
  return (
    <main className="mx-auto w-full max-w-6xl space-y-4 px-4 py-5 sm:px-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-dtsc-muted">{tx("Administration entreprise · Assurances santé", "Company administration · Health insurance")}</p>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-dtsc-ink">{tx("Connecteurs d’assurances santé", "Health insurance connectors")}</h1>
          <p className="mt-1 text-sm text-dtsc-muted">{tx("Préparation des établissements partenaires MSO, sans exposer les secrets API.", "Set up MSO partner facilities without exposing API secrets.")}</p>
        </div>
        <Link href="/enterprise-admin" className="rounded-xl border border-dtsc-border px-3 py-2 text-sm font-semibold text-dtsc-ink hover:bg-dtsc-surface">{tx("Retour à l’administration", "Back to administration")}</Link>
      </header>

      <section className="flex flex-wrap gap-3 rounded-2xl border border-dtsc-border bg-dtsc-surface p-4">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="rounded-xl bg-cyan-500/10 p-3 text-cyan-600"><ShieldCheck className="h-6 w-6" aria-hidden="true"/></div>
          <div className="min-w-0">
            <h2 className="font-black text-dtsc-ink">MSO / HIRMS <span className="ml-1 rounded-full border border-amber-500/40 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-300">{environment}</span></h2>
            <p className="text-xs text-dtsc-muted">{tx("Adaptateur HSL · Vérification des adhérents · Phase pilote", "HSL adapter · Member verification · Pilot phase")}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm font-semibold text-dtsc-ink">
          <span className={`h-2.5 w-2.5 rounded-full ${data?.connector?.status === "READY" ? "bg-emerald-500" : "bg-amber-500"}`}/>
          {data?.connector?.status === "READY" ? tx("Authentification vérifiée", "Authentication verified") : tx("Configuration à terminer", "Setup incomplete")}
        </div>
      </section>

      <HirmsEnvironmentSwitch value={environment} onChange={next=>{requestEpoch.current++;setEnvironment(next);setData(null);setUsername("");setSecret("");}} disabled={pending} />
      <HirmsWorkspaceNavigation active="connectors" environment={environment}/>
      {environment === "PRODUCTION" && <div role="note" className="rounded-xl border border-amber-500/50 bg-amber-500/10 p-3 text-sm text-dtsc-ink">{tx("Environnement réel. Utilisez exclusivement les identifiants de Production remis par HSL. Les appels sont bloqués tant que DTSC n’a pas habilité la Production.", "Live environment. Use only Production credentials issued by HSL. Outbound calls are blocked until DTSC enables Production.")}</div>}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(280px,1fr)]">
        <form onSubmit={save} className="min-w-0 space-y-4 rounded-2xl border border-dtsc-border bg-dtsc-surface p-4 sm:p-5">
          <div className="flex items-center gap-2"><KeyRound className="h-5 w-5 text-cyan-600" aria-hidden="true"/><h2 className="font-black text-dtsc-ink">{tx("Configuration sécurisée", "Secure setup")}</h2></div>
          <p className="text-sm text-dtsc-muted">{tx(`Utilisez uniquement les identifiants HSL propres à ${environment}.`, `Use HSL credentials issued specifically for ${environment}.`)}</p>
          <label className="block space-y-1 text-sm font-semibold text-dtsc-ink">
            <span>{tx("Établissement relié", "Linked facility")}</span>
            <select value={siteId} onChange={(event)=>setSiteId(event.target.value)} className="min-h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3 text-sm">
              <option value="">{tx("Organisation entière (à confirmer avec HSL)", "Organization-wide (confirm with HSL)")}</option>
              {data?.sites.map((site)=><option key={site.id} value={site.id}>{site.name} · {site.code}</option>)}
            </select>
          </label>
          <label className="block space-y-1 text-sm font-semibold text-dtsc-ink">
            <span>{tx("Identifiant officiel du prestataire HSL", "Official HSL service provider ID")}</span>
            <input type="number" min="1" step="1" inputMode="numeric" value={serviceProviderId} onChange={(event)=>setServiceProviderId(event.target.value)} placeholder={tx("ServiceProviderID fourni par HSL", "ServiceProviderID provided by HSL")} className="min-h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3 text-sm" />
            <span className="block text-xs font-normal text-dtsc-muted">{tx("Obligatoire avant l’envoi des factures. Ne devinez pas cet identifiant.", "Required for invoice submission. Do not guess this ID.")}</span>
          </label>
          <label className="block space-y-1 text-sm font-semibold text-dtsc-ink">
            <span>{tx("Compte technique HSL", "HSL technical account")}</span>
            <input autoComplete="off" spellCheck={false} value={username} onChange={(event)=>setUsername(event.target.value)} placeholder={tx("Compte remis par HSL", "Account issued by HSL")} className="min-h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3 text-sm" />
          </label>
          <label className="block space-y-1 text-sm font-semibold text-dtsc-ink">
            <span>{tx("Secret HSL", "HSL secret")}</span>
            <input type="password" autoComplete="new-password" value={secret} onChange={(event)=>setSecret(event.target.value)} placeholder={data?.connector?.credentialsConfigured ? tx("Conservé en sécurité · laisser vide pour ne pas modifier", "Stored securely · leave blank to keep existing") : tx("Coller le secret transmis en sécurité", "Enter the secret sent securely")} className="min-h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3 text-sm" />
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={pending || Boolean(username) !== Boolean(secret)} className="min-h-11 rounded-xl bg-cyan-600 px-4 text-sm font-bold text-white hover:bg-cyan-700 disabled:opacity-50">{pending ? tx("Traitement…", "Processing…") : tx("Enregistrer", "Save")}</button>
            <button type="button" disabled={pending || !data?.connector?.credentialsConfigured || (environment === "PRODUCTION" && !data?.productionEnabled)} onClick={()=>void send({ action: "check" }, tx(`Authentification HSL confirmée en ${environment}.`, `HSL authentication confirmed in ${environment}.`))} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-dtsc-border px-4 text-sm font-bold text-dtsc-ink hover:bg-dtsc-page disabled:opacity-50"><PlugZap className="h-4 w-4" aria-hidden="true"/>{tx("Tester l’authentification", "Test authentication")}</button>
          </div>
          <p className="text-xs text-dtsc-muted">{tx("Pour modifier le compte HSL, renseignez à nouveau le compte et le nouveau secret. Aucun secret enregistré n’est réaffiché.", "To change credentials, enter both the account and new secret. Stored secrets are never displayed.")}</p>
        </form>
        <aside className="min-w-0 space-y-3">
          <section className="space-y-3 rounded-2xl border border-dtsc-border bg-dtsc-surface p-4">
            <div className="flex items-center gap-2"><BadgeCheck className="h-5 w-5 text-emerald-600" aria-hidden="true"/><h2 className="font-black text-dtsc-ink">{tx("État du connecteur", "Connector status")}</h2></div>
            {[
              [tx("Environnement", "Environment"), environment],
              [tx("Prestataire HSL", "HSL provider"), data?.connector?.hslServiceProviderId ? String(data.connector.hslServiceProviderId) : tx("À configurer", "Missing")],
              [tx("Identifiants", "Credentials"), data?.connector?.credentialsConfigured ? tx("Enregistrés et chiffrés", "Stored encrypted") : tx("À renseigner", "Missing")],
              [tx("Dernier test", "Last test"), data?.connector?.lastAuthCheckAt ? new Date(data.connector.lastAuthCheckAt).toLocaleString(en ? "en" : "fr") : "—"],
              [tx("Dernière vérification", "Last member check"), data?.connector?.lastVerifiedAt ? new Date(data.connector.lastVerifiedAt).toLocaleString(en ? "en" : "fr") : "—"],
            ].map(([label,value])=><div key={label} className="flex items-center justify-between gap-3 border-b border-dtsc-border py-2 text-xs last:border-b-0"><span className="text-dtsc-muted">{label}</span><span className="max-w-[60%] text-right font-bold text-dtsc-ink">{value}</span></div>)}
            <button type="button" onClick={()=>void load().catch(()=>setNotice(tx("Actualisation impossible.", "Refresh failed.")))} className="inline-flex min-h-10 items-center gap-2 text-xs font-bold text-dtsc-ink"><RefreshCw className="h-4 w-4"/>{tx("Actualiser", "Refresh")}</button>
          </section>
          <section className="space-y-2 rounded-2xl border border-dtsc-border bg-dtsc-surface p-4">
            <div className="flex items-center gap-2"><CircleHelp className="h-5 w-5 text-dtsc-muted" aria-hidden="true"/><h2 className="font-bold text-dtsc-ink">{tx("Avant d'utiliser MSO", "Before using MSO")}</h2></div>
            <p className="text-xs text-dtsc-muted">{tx("HSL doit avoir approuvé le client et autorisé VerifyMembers. La connexion réussie ne garantit pas l'accès à toutes les opérations.", "HSL must approve this client and grant VerifyMembers. Successful authentication does not grant every operation.")}</p>
            <Link href={`/enterprise-insurance/verify?environment=${environment}`} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-dtsc-border px-3 py-2 text-sm font-bold text-dtsc-ink hover:bg-dtsc-page"><Stethoscope className="h-4 w-4" aria-hidden="true"/>{tx("Ouvrir la vérification adhérent", "Open member verification")}</Link>
            <Link href={`/enterprise-insurance/ocr?environment=${environment}`} className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-xl border border-dtsc-border px-3 py-2 text-sm font-bold text-dtsc-ink hover:bg-dtsc-page">{tx("Documents et suivi OCR HSL","HSL OCR documents and tracking")}</Link>
            <Link href={`/enterprise-insurance/invoices?environment=${environment}`} className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-xl border border-dtsc-border px-3 py-2 text-sm font-bold text-dtsc-ink hover:bg-dtsc-page">
              {tx("Contrôler et transmettre les factures HSL", "Preflight and submit HSL invoices")}
            </Link>
          </section>
        </aside>
      </div>
      <p className="text-xs text-dtsc-muted">{tx("Les contrôles et transmissions sont séparés entre UAT et Production. Chaque environnement possède ses propres identifiants et habilitations HSL ; les appels réels sont désactivés par défaut. Les justificatifs OCR ne sont pas encore intégrés.", "Preflight and submissions are separated between UAT and Production. Each environment has its own HSL credentials and permissions; live calls are disabled by default. OCR documents are not integrated yet.")}</p>
    </main>
  );
}
