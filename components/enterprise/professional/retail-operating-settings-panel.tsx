"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { toastError, toastSuccess } from "@/lib/client-toast";

type Settings = {
  directCheckoutEnabled: boolean;
  quickPrintEnabled: boolean;
  simplifiedNavigationEnabled: boolean;
  defaultPaper: "A4" | "THERMAL_80MM";
  footerLinesFr: string[];
  footerLinesEn: string[];
};
type Data = {
  revision: number; settings: Settings; inherited: Settings;
  isOverridden: boolean; sites: { id: string; name: string; code: string }[];
};
const labels = {
  fr: {
    title: "Mode de fonctionnement RETAIL", description: "Personnalisez le parcours commercial sans modifier les règles de facturation ni les contrôles Finance.",
    company: "Toutes les boutiques · configuration entreprise", store: "Périmètre de configuration", direct: "Commerce sans caissier",
    print: "Impression rapide après encaissement", simple: "Interface commerciale simplifiée",
    paper: "Document par défaut", thermal: "Ticket 80 mm", a4: "Facture A4",
    footer: "Mentions sur les factures", footerHelp: "Sous réserve des droits des consommateurs. Les anciennes factures conservent leurs mentions historiques.",
    security: "Pour enregistrer ces réglages, confirmez votre identité. L'auto-approbation reste soumise aux droits explicites par boutique.",
    password: "Mot de passe", totp: "Code MFA si demandé", save: "Enregistrer les réglages", busy: "Enregistrement…",
    inherit: "Hérite des réglages entreprise tant qu'aucune configuration boutique n'est enregistrée.",
    override: "Configuration particulière à cette boutique", saved: "Configuration commerciale actualisée.",
    failed: "Impossible d'enregistrer. Vérifiez les prérequis Finance, vos droits et la révision de la configuration.",
    loading: "Chargement des paramètres…",
  },
  en: {
    title: "Retail operating mode", description: "Customize counter sales without changing Finance rules or approvals.",
    company: "All stores · company defaults", store: "Configuration scope", direct: "Cashierless commerce",
    print: "Quick print after collection", simple: "Simplified sales interface",
    paper: "Default document", thermal: "80 mm receipt", a4: "A4 invoice",
    footer: "Invoice footer notices", footerHelp: "Subject to consumer rights. Old invoices retain their original printed notices.",
    security: "Verify your identity to save. Self-approval still requires explicit store grants.",
    password: "Password", totp: "MFA code if requested", save: "Save settings", busy: "Saving…",
    inherit: "Inherits company settings until a store-specific configuration is saved.",
    override: "Store-specific configuration", saved: "Retail settings updated.",
    failed: "Unable to save. Check Finance readiness, permissions and configuration revision.",
    loading: "Loading settings…",
  },
};
const suggested = [
  "Les marchandises vendues ne sont ni reprises ni échangées.",
  "Veuillez vérifier vos marchandises avant de quitter le magasin. Aucune réclamation ne sera acceptée après votre départ.",
];

export function RetailOperatingSettingsPanel({ organizationId, locale }: { organizationId: string; locale: "fr" | "en" }) {
  const t = labels[locale];
  const [siteId, setSiteId] = useState("");
  const [data, setData] = useState<Data | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState("");
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/enterprise/${encodeURIComponent(organizationId)}/retail/operating-settings${siteId ? `?siteId=${encodeURIComponent(siteId)}` : ""}`, { cache: "no-store" });
      const value = await response.json() as Data;
      if (!response.ok || !value.settings) throw new Error(t.failed);
      setData(value); setSettings(value.settings); setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : t.failed); }
    finally { setLoading(false); }
  }, [organizationId, siteId, t.failed]);
  useEffect(() => { void load(); }, [load]);
  const change = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setSettings((current) => current ? { ...current, [key]: value } : current);
  const submit = async () => {
    if (!settings || !data || !password || saving) return;
    setSaving(true); setError("");
    try {
      const auth = await fetch("/api/auth/step-up", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ password, ...(totp.trim() ? { code: totp.trim() } : {}) }),
      });
      if (!auth.ok) throw new Error(t.failed);
      const response = await fetch(`/api/enterprise/${encodeURIComponent(organizationId)}/retail/operating-settings`, {
        method: "PUT", headers: { "content-type": "application/json" },
        body: JSON.stringify({ revision: data.revision, siteId: siteId || null, settings }),
      });
      const body = await response.json().catch(() => null) as { message?: string } | null;
      if (!response.ok) throw new Error(body?.message || t.failed);
      setPassword(""); setTotp(""); await load(); toastSuccess(t.saved);
    } catch (cause) { const message = cause instanceof Error ? cause.message : t.failed; setError(message); toastError(message); setPassword(""); setTotp(""); }
    finally { setSaving(false); }
  };

  return (
    <section id="retail-operating-mode" className="mt-4 min-w-0 max-w-full space-y-3 rounded-2xl border border-dtsc-border bg-dtsc-surface p-4 sm:p-5">
      <header><h3 className="text-lg font-black text-dtsc-ink">{t.title}</h3><p className="mt-1 text-sm text-dtsc-muted">{t.description}</p></header>
      <label className="grid min-w-0 gap-1 text-sm font-bold text-dtsc-ink">{t.store}
        <select className="min-h-11 min-w-0 max-w-full rounded-xl border border-dtsc-border bg-dtsc-page p-2 text-sm" value={siteId} onChange={(event) => setSiteId(event.target.value)}>
          <option value="">{t.company}</option>
          {data?.sites.map((site) => <option value={site.id} key={site.id}>{site.name} · {site.code}</option>)}
        </select>
      </label>
      {loading ? <p role="status" className="text-sm text-dtsc-muted">{t.loading}</p> : null}
      {error ? <p role="alert" className="rounded-lg bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">{error}</p> : null}
      {settings && !loading ? <>
        {siteId ? <p className="text-xs text-dtsc-muted">{data?.isOverridden ? t.override : t.inherit}</p> : null}
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-3">
          {([["directCheckoutEnabled", t.direct], ["quickPrintEnabled", t.print], ["simplifiedNavigationEnabled", t.simple]] as const).map(([key, label]) =>
            <label key={key} className="flex min-w-0 items-center gap-3 rounded-xl border border-dtsc-border bg-dtsc-page p-3 text-sm font-bold text-dtsc-ink">
              <input className="h-5 w-5 shrink-0 accent-cyan-600" type="checkbox" checked={settings[key]} onChange={(event) => change(key, event.target.checked)} />
              <span className="min-w-0 break-words">{label}</span>
            </label>)}
        </div>
        <label className="grid max-w-sm gap-1 text-sm font-bold text-dtsc-ink">{t.paper}
          <select className="min-h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-page p-2" value={settings.defaultPaper} onChange={(event) => change("defaultPaper", event.target.value as Settings["defaultPaper"])}>
            <option value="THERMAL_80MM">{t.thermal}</option><option value="A4">{t.a4}</option>
          </select>
        </label>
        <div className="min-w-0 space-y-2">
          <p className="text-sm font-black text-dtsc-ink">{t.footer}</p>
          <p className="text-xs text-dtsc-muted">{t.footerHelp}</p>
          {[0,1].map((index) => <label className="block min-w-0" key={index}>
            <span className="sr-only">{t.footer} {index+1}</span>
            <textarea maxLength={300} rows={2} className="w-full min-w-0 rounded-xl border border-dtsc-border bg-dtsc-page p-3 text-sm text-dtsc-ink" placeholder={locale === "fr" ? suggested[index] : "Optional customer notice"} value={(locale === "fr" ? settings.footerLinesFr : settings.footerLinesEn)[index] || ""} onChange={(event) => {
              const key = locale === "fr" ? "footerLinesFr" : "footerLinesEn";
              const copy = [...settings[key]]; copy[index] = event.target.value;
              change(key, copy.filter(Boolean));
            }} />
          </label>)}
        </div>
        <p className="text-xs leading-5 text-dtsc-muted">{t.security}</p>
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-2">
          <label className="grid gap-1 text-xs font-bold text-dtsc-ink">{t.password}<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} className="min-h-11 min-w-0 rounded-xl border border-dtsc-border bg-dtsc-page px-3 text-base" /></label>
          <label className="grid gap-1 text-xs font-bold text-dtsc-ink">{t.totp}<input inputMode="numeric" autoComplete="one-time-code" value={totp} onChange={(event) => setTotp(event.target.value)} className="min-h-11 min-w-0 rounded-xl border border-dtsc-border bg-dtsc-page px-3 text-base" /></label>
        </div>
        <div data-responsive-actions className="flex flex-wrap justify-end"><Button type="button" disabled={!password || saving} onClick={() => void submit()}>{saving ? t.busy : t.save}</Button></div>
      </> : null}
    </section>
  );
}
