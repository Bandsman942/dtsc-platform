"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Globe2, RefreshCw, ShieldAlert, Store } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = { organizationId: string; locale: "fr" | "en" };
type Option = { id: string; code: string; name: string; siteId?: string; accountType?: string; currencyCode?: string };
type Pack = { packCode: string; countryCode: string; version: number; labelFr: string; labelEn: string; defaultCurrencyCode: string; supportedCurrencyCodes: string[]; capabilities: Record<string, { status: string; noteFr: string; noteEn: string }> };
type Activation = { id: string; packCode: string; countryCode: string; status: string; packVersion: number };
type Run = { id: string; status: string; currentStep: string; countryCode: string | null; currencyCode: string | null; siteId: string | null; warehouseId: string | null; cashFinancialAccountId: string | null; revision: number };
type Readiness = {
  ready: boolean;
  completed: number;
  total: number;
  currentStep: string;
  items: Array<{ code: string; complete: boolean; detail: unknown }>;
  selected: { countryCode: string | null; currencyCode: string | null; siteId: string | null; warehouseId: string | null; cashFinancialAccountId: string | null };
  options: { organization: { country: string | null }; sites: Option[]; warehouses: Option[]; accounts: Option[]; countryPackActivations: Activation[] };
};
type State = { latestRun: Run | null; readiness: Readiness; countryPackRegistry: Pack[] };

const LABELS: Record<string, { fr: string; en: string }> = {
  COUNTRY_PACK: { fr: "Country pack actif", en: "Active country pack" },
  FUNCTIONAL_CURRENCY: { fr: "Devise fonctionnelle Finance", en: "Finance functional currency" },
  SITE: { fr: "Site opérationnel", en: "Operational site" },
  WAREHOUSE: { fr: "Dépôt opérationnel", en: "Operational warehouse" },
  CASH_ACCOUNT: { fr: "Compte de caisse", en: "Cash account" },
  CATALOG: { fr: "Catalogue", en: "Catalog" },
  INVENTORY_LINKS: { fr: "Articles suivis reliés à Inventory", en: "Tracked items linked to Inventory" },
  TEAM: { fr: "Équipe active", en: "Active team" },
  ACCOUNTING: { fr: "Comptabilité POS prête", en: "POS accounting ready" },
  RETAIL_CONFIGURATION: { fr: "Configuration Retail active", en: "Active Retail configuration" },
};

export function RetailGlobalReadiness({ organizationId, locale }: Props) {
  const [state, setState] = useState<State | null>(null);
  const [selection, setSelection] = useState({ countryCode: "", currencyCode: "", siteId: "", warehouseId: "", cashFinancialAccountId: "" });
  const [busy, setBusy] = useState<"load" | "save" | "pack" | null>("load");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setBusy("load"); setError("");
    try {
      const response = await fetch(`/api/enterprise/${organizationId}/retail/onboarding`, { cache: "no-store" });
      const body = await response.json().catch(() => null) as State | { error?: string; message?: string } | null;
      if (!response.ok || !body || !("readiness" in body)) throw new Error((body as { message?: string; error?: string } | null)?.message || (body as { error?: string } | null)?.error || "RETAIL_ONBOARDING_LOAD_FAILED");
      const next = body as State;
      setState(next);
      setSelection({
        countryCode: next.readiness.selected.countryCode || next.countryPackRegistry[0]?.countryCode || "",
        currencyCode: next.readiness.selected.currencyCode || next.countryPackRegistry[0]?.defaultCurrencyCode || "",
        siteId: next.readiness.selected.siteId || next.readiness.options.sites[0]?.id || "",
        warehouseId: next.readiness.selected.warehouseId || "",
        cashFinancialAccountId: next.readiness.selected.cashFinancialAccountId || "",
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "RETAIL_ONBOARDING_LOAD_FAILED");
    } finally { setBusy(null); }
  }, [organizationId]);

  useEffect(() => { void load(); }, [load]);

  const pack = state?.countryPackRegistry.find((item) => item.countryCode === selection.countryCode) || null;
  const activation = state?.readiness.options.countryPackActivations.find((item) => item.countryCode === selection.countryCode && ["ACTIVE_CORE", "VALIDATED"].includes(item.status)) || null;
  const warehouses = useMemo(() => (state?.readiness.options.warehouses || []).filter((item) => !selection.siteId || item.siteId === selection.siteId), [selection.siteId, state]);
  const cashAccounts = useMemo(() => (state?.readiness.options.accounts || []).filter((item) => (!selection.currencyCode || item.currencyCode === selection.currencyCode) && (!selection.siteId || !item.siteId || item.siteId === selection.siteId) && String(item.accountType || "").toUpperCase().includes("CASH")), [selection.currencyCode, selection.siteId, state]);

  async function activatePack() {
    if (!pack) return;
    setBusy("pack"); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/enterprise/${organizationId}/retail/country-packs`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ packCode: pack.packCode, countryCode: pack.countryCode, configuration: { currencyCode: selection.currencyCode || pack.defaultCurrencyCode } }),
      });
      const body = await response.json().catch(() => null) as { activation?: Activation; error?: string; message?: string } | null;
      if (!response.ok) throw new Error(body?.message || body?.error || "RETAIL_COUNTRY_PACK_ACTIVATION_FAILED");
      setNotice(locale === "en" ? "Country pack core activated. Regulated capabilities remain evidence-gated." : "Socle country pack activé. Les capacités réglementées restent soumises à preuve.");
      await load();
    } catch (packError) { setError(packError instanceof Error ? packError.message : "RETAIL_COUNTRY_PACK_ACTIVATION_FAILED"); }
    finally { setBusy(null); }
  }

  async function save() {
    setBusy("save"); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/enterprise/${organizationId}/retail/onboarding`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...selection, revision: state?.latestRun?.revision || undefined }),
      });
      const body = await response.json().catch(() => null) as { run?: Run; readiness?: Readiness; error?: string; message?: string } | null;
      if (!response.ok) throw new Error(body?.message || body?.error || "RETAIL_ONBOARDING_SAVE_FAILED");
      setNotice(body?.readiness?.ready ? (locale === "en" ? "Shop onboarding is operationally ready." : "L’onboarding Shop est opérationnellement prêt.") : (locale === "en" ? "Selection saved. Complete the remaining canonical setup items." : "Sélection enregistrée. Complétez les éléments canoniques encore manquants."));
      await load();
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : "RETAIL_ONBOARDING_SAVE_FAILED"); }
    finally { setBusy(null); }
  }

  if (!state && busy === "load") return <section className="rounded-3xl border border-dtsc-border bg-dtsc-surface p-5"><div className="flex items-center gap-2 text-sm font-bold text-dtsc-muted"><RefreshCw className="h-4 w-4 animate-spin" />{locale === "en" ? "Loading Shop readiness…" : "Chargement de la readiness Shop…"}</div></section>;
  if (!state) return <section className="rounded-3xl border border-red-500/30 bg-red-500/10 p-5 text-sm font-semibold text-red-700 dark:text-red-300">{error || "RETAIL_ONBOARDING_UNAVAILABLE"}</section>;

  return <section data-testid="retail-global-readiness" className="rounded-3xl border border-dtsc-border bg-dtsc-surface p-4 shadow-sm sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><div className="flex items-center gap-2"><Globe2 className="h-5 w-5 text-cyan-600" /><h2 className="text-lg font-black text-dtsc-ink">{locale === "en" ? "Shop onboarding & country readiness" : "Onboarding Shop & readiness pays"}</h2></div><p className="mt-1 max-w-3xl text-sm text-dtsc-muted">{locale === "en" ? "This assistant selects existing tenant resources. It never invents accounts, balances, tax rates or regulatory evidence." : "Cet assistant sélectionne les ressources existantes du tenant. Il n’invente jamais comptes, soldes, taux fiscaux ou preuves réglementaires."}</p></div>
      <div className={`rounded-full px-3 py-1.5 text-xs font-black ${state.readiness.ready ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-amber-500/10 text-amber-800 dark:text-amber-200"}`}>{state.readiness.completed}/{state.readiness.total} · {state.readiness.ready ? "READY" : state.readiness.currentStep}</div>
    </div>

    {error ? <div role="alert" className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-700 dark:text-red-300">{error}</div> : null}
    {notice ? <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-800 dark:text-emerald-200">{notice}</div> : null}

    <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
      <div className="space-y-3">
        <div className="rounded-2xl border border-dtsc-border bg-dtsc-page p-4">
          <div className="flex items-center justify-between gap-2"><div><p className="font-black text-dtsc-ink">{locale === "en" ? "Country pack" : "Country pack"}</p><p className="text-xs text-dtsc-muted">{pack ? (locale === "en" ? pack.labelEn : pack.labelFr) : "—"}</p></div>{activation ? <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-xs font-black text-emerald-700 dark:text-emerald-300">{activation.status}</span> : <span className="rounded-full bg-amber-500/10 px-2 py-1 text-xs font-black text-amber-800 dark:text-amber-200">INACTIVE</span>}</div>
          {pack ? <div className="mt-3 grid gap-2">{Object.entries(pack.capabilities).map(([code, capability]) => <div key={code} className="rounded-xl border border-dtsc-border bg-dtsc-surface p-2.5"><div className="flex items-center justify-between gap-2"><span className="text-xs font-black text-dtsc-ink">{code}</span><span className="text-[11px] font-bold text-dtsc-muted">{capability.status}</span></div><p className="mt-1 text-xs text-dtsc-muted">{locale === "en" ? capability.noteEn : capability.noteFr}</p></div>)}</div> : null}
          {!activation && pack ? <Button type="button" variant="outline" className="mt-3 w-full" disabled={Boolean(busy)} onClick={() => void activatePack()}><ShieldAlert className="h-4 w-4" />{locale === "en" ? "Activate proven core only" : "Activer uniquement le socle prouvé"}</Button> : null}
        </div>

        <div className="rounded-2xl border border-dtsc-border bg-dtsc-page p-4">
          <div className="flex items-center gap-2"><Store className="h-4 w-4" /><p className="font-black text-dtsc-ink">{locale === "en" ? "Existing tenant resources" : "Ressources tenant existantes"}</p></div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-bold text-dtsc-muted">{locale === "en" ? "Country" : "Pays"}<select className="mt-1 h-10 w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-2 text-sm text-dtsc-ink" value={selection.countryCode} onChange={(event) => { const nextPack = state.countryPackRegistry.find((item) => item.countryCode === event.target.value); setSelection((current) => ({ ...current, countryCode: event.target.value, currencyCode: current.currencyCode || nextPack?.defaultCurrencyCode || "" })); }}>{state.countryPackRegistry.map((item) => <option key={item.packCode} value={item.countryCode}>{locale === "en" ? item.labelEn : item.labelFr}</option>)}</select></label>
            <label className="text-xs font-bold text-dtsc-muted">{locale === "en" ? "Currency" : "Devise"}<select className="mt-1 h-10 w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-2 text-sm text-dtsc-ink" value={selection.currencyCode} onChange={(event) => setSelection((current) => ({ ...current, currencyCode: event.target.value, cashFinancialAccountId: "" }))}>{(pack?.supportedCurrencyCodes || []).map((code) => <option key={code} value={code}>{code}</option>)}</select></label>
            <label className="text-xs font-bold text-dtsc-muted">Site<select className="mt-1 h-10 w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-2 text-sm text-dtsc-ink" value={selection.siteId} onChange={(event) => setSelection((current) => ({ ...current, siteId: event.target.value, warehouseId: "", cashFinancialAccountId: "" }))}><option value="">—</option>{state.readiness.options.sites.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></label>
            <label className="text-xs font-bold text-dtsc-muted">{locale === "en" ? "Warehouse" : "Dépôt"}<select className="mt-1 h-10 w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-2 text-sm text-dtsc-ink" value={selection.warehouseId} onChange={(event) => setSelection((current) => ({ ...current, warehouseId: event.target.value }))}><option value="">—</option>{warehouses.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></label>
            <label className="text-xs font-bold text-dtsc-muted sm:col-span-2">{locale === "en" ? "Cash financial account" : "Compte financier de caisse"}<select className="mt-1 h-10 w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-2 text-sm text-dtsc-ink" value={selection.cashFinancialAccountId} onChange={(event) => setSelection((current) => ({ ...current, cashFinancialAccountId: event.target.value }))}><option value="">—</option>{cashAccounts.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name} · {item.currencyCode}</option>)}</select></label>
          </div>
          <Button type="button" className="mt-4 w-full" disabled={Boolean(busy)} onClick={() => void save()}>{busy === "save" ? "…" : (locale === "en" ? "Save & recompute readiness" : "Enregistrer & recalculer la readiness")}</Button>
        </div>
      </div>

      <div className="rounded-2xl border border-dtsc-border bg-dtsc-page p-4"><p className="font-black text-dtsc-ink">{locale === "en" ? "Operational evidence" : "Preuves opérationnelles"}</p><div className="mt-3 grid gap-2">{state.readiness.items.map((item) => { const label = LABELS[item.code]?.[locale] || item.code; return <div key={item.code} className="flex items-start gap-3 rounded-xl border border-dtsc-border bg-dtsc-surface p-3">{item.complete ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <span className="mt-0.5 h-4 w-4 shrink-0 rounded-full border-2 border-amber-500" />}<div className="min-w-0"><p className="text-sm font-black text-dtsc-ink">{label}</p><p className="mt-0.5 break-words text-xs text-dtsc-muted">{typeof item.detail === "string" || typeof item.detail === "number" ? String(item.detail ?? "—") : JSON.stringify(item.detail ?? {})}</p></div></div>; })}</div><p className="mt-4 text-xs text-dtsc-muted">{locale === "en" ? "Operational readiness is not a legal or fiscal certification. COMMERCIAL_READY_GLOBAL remains gated by CI, behavioral tests and explicit release evidence." : "La readiness opérationnelle n’est pas une certification juridique ou fiscale. COMMERCIAL_READY_GLOBAL reste verrouillé par la CI, les tests comportementaux et les preuves explicites de release."}</p></div>
    </div>
  </section>;
}
