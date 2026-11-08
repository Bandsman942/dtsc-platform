"use client";

import { useCallback, useEffect, useState } from "react";
import { Building2, CheckCircle2, Clock3, CreditCard, Layers3, LoaderCircle, LockKeyhole, RadioTower, ShieldCheck, SmartphoneNfc } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { PasswordInput } from "@/components/ui/password-input";
import { toastError, toastSuccess } from "@/lib/client-toast";

type RetailPackCode = "MOBILE_MONEY_AGENCY" | "TELCO_TOPUPS";
type Pack = {
  moduleCode: RetailPackCode; labelFr: string; labelEn: string;
  descriptionFr: string; descriptionEn: string; minimumPlan: string;
  enabled: boolean; configured: boolean; eligible: boolean;
  choice: boolean | null; reason: string | null;
};
type Planned = { code: string; labelFr: string; labelEn: string; descriptionFr: string; descriptionEn: string };
type State = {
  organization: { id: string; name: string };
  businessSubtypeCode: string | null;
  planCode: string; planLabel: string; subscriptionStatus: string;
  modules: Pack[]; planned: Planned[];
  history: Array<{ id: string; action: string; at: string; actorName: string | null; reason: string | null; moduleCode: string | null }>;
};
type ResponseError = { error?: string; reasonCode?: string };

export function RetailSectorPacksPanel({
  organizationId, organizationName, locale, onClose, onChanged,
}: {
  organizationId: string; organizationName: string; locale: "fr" | "en";
  onClose: () => void; onChanged?: () => void;
}) {
  const en = locale === "en";
  const [data, setData] = useState<State | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [pending, setPending] = useState<{ moduleCode: RetailPackCode; enabled: boolean } | null>(null);
  const [reason, setReason] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const result = await fetch(`/api/admin/client-organizations/${encodeURIComponent(organizationId)}/retail-extensions`, { cache: "no-store" });
      const body = await result.json().catch(() => null) as State | ResponseError | null;
      if (!result.ok || !body || !("modules" in body)) throw new Error(
        en ? "The Retail configuration could not be loaded." : "Impossible de charger la configuration RETAIL.");
      setData(body);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }, [en, organizationId]);

  useEffect(() => { void load(); }, [load]);

  const cancel = () => {
    if (saving) return;
    setPending(null);
    setReason("");
    setPassword("");
    setCode("");
  };

  async function submit() {
    if (!pending || reason.trim().length < 8 || password.length < 1 || saving) return;
    setSaving(true);
    try {
      const verification = await fetch("/api/auth/step-up", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ password, ...(code.trim() ? { code: code.trim() } : {}) }),
      });
      const verified = await verification.json().catch(() => null) as ResponseError | null;
      if (!verification.ok) throw new Error(verified?.error || (en ? "Identity verification failed." : "Échec de la vérification d'identité."));
      const response = await fetch(`/api/admin/client-organizations/${encodeURIComponent(organizationId)}/retail-extensions`, {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({ moduleCode: pending.moduleCode, enabled: pending.enabled, reason: reason.trim() }),
      });
      const result = await response.json().catch(() => null) as { state?: State; error?: string } | null;
      if (!response.ok) throw new Error(result?.error || (en ? "Unable to change this extension." : "Modification de l'extension impossible."));
      if (result?.state) setData(result.state);
      else await load();
      toastSuccess(en ? "The Retail extension has been updated." : "Extension RETAIL actualisée.");
      setPending(null);
      setPassword("");
      setCode("");
      setReason("");
      onChanged?.();
    } catch (error) {
      toastError(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open title={en ? `Retail specialization · ${organizationName}` : `Spécialisations RETAIL · ${organizationName}`}
      description={en ? "Control paid extensions without changing the company's core retail sector." : "Gérez les extensions en fonction de l'abonnement, sans changer le secteur Commerce de détail."}
      className="max-w-5xl" onClose={onClose}>
      <div data-dtsc-retail-packs className="min-w-0 max-w-full space-y-5 pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-cyan-400/25 bg-cyan-500/10 p-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-500/10 text-cyan-500"><Building2 size={22} aria-hidden="true" /></span>
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-wider text-cyan-600 dark:text-cyan-300">RETAIL CORE</p>
              <p className="text-sm font-semibold text-dtsc-ink">{en ? "General retail · point of sale, inventory and daily close" : "Commerce général · point de vente, stock et clôture"}</p>
            </div>
          </div>
          <Button type="button" variant="outline" disabled={loading || saving} onClick={() => void load()}>
            {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Layers3 className="h-4 w-4" />}
            {en ? "Refresh" : "Actualiser"}
          </Button>
        </div>

        {loadError ? <p role="alert" className="rounded-xl border border-rose-400/40 bg-rose-500/10 p-3 text-sm font-semibold text-rose-700 dark:text-rose-300">{loadError}</p> : null}
        {!data ? <p role="status" className="text-sm text-dtsc-muted">{loading ? (en ? "Loading…" : "Chargement…") : (en ? "No data available." : "Aucune donnée disponible.")}</p> : (
          <>
            <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-dtsc-border bg-dtsc-surface p-4">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-dtsc-muted"><CreditCard size={16}/>{en ? "Subscription" : "Abonnement"}</div>
                <p className="mt-2 text-lg font-black text-dtsc-ink">{data.planLabel}</p>
                <p className="text-xs font-semibold text-dtsc-muted">{data.subscriptionStatus}</p>
              </div>
              <div className="rounded-2xl border border-dtsc-border bg-dtsc-surface p-4">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-dtsc-muted"><ShieldCheck size={16}/>{en ? "Business classification" : "Classification métier"}</div>
                <p className="mt-2 text-lg font-black text-dtsc-ink">{data.businessSubtypeCode === "SHOP" ? "SHOP" : (en ? "General retail" : "Commerce de détail général")}</p>
                <p className="text-xs text-dtsc-muted">{en ? "Historical Shop memberships remain compatible." : "Les entreprises historiques SHOP restent compatibles."}</p>
              </div>
            </div>

            <div className="grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-2">
              {data.modules.map((pack) => {
                const Icon = pack.moduleCode === "TELCO_TOPUPS" ? RadioTower : SmartphoneNfc;
                return (
                  <article key={pack.moduleCode} data-retail-extension={pack.moduleCode}
                    className="min-w-0 rounded-2xl border border-dtsc-border bg-dtsc-surface p-4 shadow-sm transition hover:border-cyan-500/50">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-cyan-500/30 bg-cyan-500/10 text-cyan-600 dark:text-cyan-300"><Icon size={20}/></span>
                      <div className="min-w-0 flex-1">
                        <h3 className="break-words text-sm font-black text-dtsc-ink">{en ? pack.labelEn : pack.labelFr}</h3>
                        <p className="mt-1 text-xs leading-5 text-dtsc-muted">{en ? pack.descriptionEn : pack.descriptionFr}</p>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
                      <span className={pack.configured ? "rounded-full bg-emerald-500/15 px-2 py-1 text-emerald-600" : "rounded-full bg-dtsc-soft px-2 py-1 text-dtsc-muted"}>
                        {pack.configured ? (en ? "Enabled" : "Activé") : (en ? "Disabled" : "Désactivé")}
                      </span>
                      <span className="rounded-full bg-dtsc-soft px-2 py-1 text-dtsc-muted">{en ? "Minimum plan" : "Plan minimum"} · {pack.minimumPlan}</span>
                    </div>
                    {pack.reason ? <p className="mt-3 text-xs font-semibold text-amber-700 dark:text-amber-300">{pack.reason}</p> : null}
                    <Button type="button" className="mt-4 min-h-11 w-full"
                      variant={pack.configured ? "outline" : "default"}
                      disabled={saving || ( !pack.configured && !pack.eligible )}
                      onClick={() => setPending({ moduleCode: pack.moduleCode, enabled: !pack.configured })}>
                      {pack.configured ? (en ? "Disable this extension" : "Désactiver cette extension") : (en ? "Enable this extension" : "Activer cette extension")}
                    </Button>
                  </article>
                );
              })}
            </div>

            <section className="rounded-2xl border border-dtsc-border bg-dtsc-page p-4">
              <h3 className="flex items-center gap-2 font-black text-dtsc-ink"><Layers3 size={18}/>{en ? "Future retail specializations" : "Sous-secteurs RETAIL à développer"}</h3>
              <p className="mt-1 text-xs text-dtsc-muted">{en ? "Planning only. Not included in your subscription and not currently accessible." : "Catalogue prospectif : ces fonctionnalités ne sont ni activables ni facturées comme disponibles."}</p>
              <div className="mt-3 grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {data.planned.map((item) => (
                  <div key={item.code} className="min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface p-3">
                    <p className="break-words text-xs font-black text-dtsc-ink">{en ? item.labelEn : item.labelFr}</p>
                    <p className="mt-1 line-clamp-3 text-xs text-dtsc-muted">{en ? item.descriptionEn : item.descriptionFr}</p>
                    <span className="mt-2 inline-flex rounded-full bg-dtsc-soft px-2 py-0.5 text-[10px] font-black text-dtsc-muted">{en ? "Planned" : "Prévu"}</span>
                  </div>
                ))}
              </div>
            </section>
            <section className="rounded-2xl border border-dtsc-border bg-dtsc-surface p-4">
              <h3 className="flex items-center gap-2 font-black text-dtsc-ink"><Clock3 size={17}/>{en ? "Recent decisions" : "Journal des décisions"}</h3>
              {data.history.length ? <ul className="mt-3 space-y-2">
                {data.history.map((item) => <li key={item.id} className="min-w-0 rounded-lg border border-dtsc-border bg-dtsc-page p-3 text-xs">
                  <div className="flex min-w-0 flex-wrap items-center gap-2 font-bold text-dtsc-ink">
                    <CheckCircle2 size={14} className="text-emerald-600" aria-hidden="true"/>
                    {item.moduleCode || "RETAIL"} · {item.action.endsWith("_ENABLED") ? (en ? "Enabled" : "Activé") : (en ? "Disabled" : "Désactivé")}
                  </div>
                  <p className="mt-1 text-dtsc-muted">{item.actorName || "DTSC"} · {new Intl.DateTimeFormat(en ? "en-GB" : "fr-FR", { dateStyle: "short", timeStyle: "short" }).format(new Date(item.at))}</p>
                  {item.reason ? <p className="mt-1 break-words text-dtsc-muted">{item.reason}</p> : null}
                </li>)}
              </ul> : <p className="mt-2 text-xs text-dtsc-muted">{en ? "No decisions yet." : "Aucune décision enregistrée."}</p>}
            </section>
          </>
        )}
      </div>

      <Dialog open={Boolean(pending)} onClose={cancel}
        title={pending?.enabled ? (en ? "Enable Retail extension" : "Activer l'extension RETAIL") : (en ? "Disable Retail extension" : "Désactiver l'extension RETAIL")}
        description={en ? "Justification, password and MFA (if enabled) are required." : "Motif, mot de passe et code MFA si configuré : confirmation obligatoire."}>
        <div className="space-y-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-dtsc-ink"><LockKeyhole size={18} aria-hidden="true"/> {pending?.moduleCode}</p>
          <label className="block text-sm font-semibold text-dtsc-ink">
            {en ? "Reason (8–500 characters)" : "Motif (8 à 500 caractères)"}
            <textarea className="mt-1 min-h-24 w-full rounded-xl border border-dtsc-border bg-dtsc-surface p-3 text-sm focus-visible:ring-2 focus-visible:ring-cyan-400"
              value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} disabled={saving}/>
          </label>
          <label className="block text-sm font-semibold text-dtsc-ink">{en ? "Current password" : "Mot de passe actuel"}
            <PasswordInput className="mt-1" value={password} onChange={(event) => setPassword(event.target.value)} disabled={saving}/>
          </label>
          <label className="block text-sm font-semibold text-dtsc-ink">{en ? "MFA / recovery code (if enabled)" : "Code MFA / récupération (si configuré)"}
            <input className="mt-1 min-h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-surface p-3 text-sm"
              inputMode="text" autoComplete="one-time-code" maxLength={30} value={code} onChange={(event) => setCode(event.target.value)} disabled={saving}/>
          </label>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" type="button" disabled={saving} onClick={cancel}>{en ? "Cancel" : "Annuler"}</Button>
            <Button type="button" disabled={saving || reason.trim().length < 8 || !password} onClick={() => void submit()}>
              {saving ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true"/> : <ShieldCheck className="h-4 w-4" aria-hidden="true"/>}
              {en ? "Confirm and audit" : "Confirmer et auditer"}
            </Button>
          </div>
        </div>
      </Dialog>
    </Dialog>
  );
}
