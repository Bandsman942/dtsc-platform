"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Globe2, RefreshCw, ShieldAlert, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  customerFacingCapabilityLabel,
  customerFacingError,
  customerFacingReadinessDetail,
  customerFacingStatusLabel,
} from "@/lib/customer-facing-language";

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
  COUNTRY_PACK: { fr: "Configuration pays", en: "Country configuration" },
  FUNCTIONAL_CURRENCY: { fr: "Devise principale", en: "Main currency" },
  SITE: { fr: "Point de vente", en: "Store location" },
  WAREHOUSE: { fr: "Dépôt de stock", en: "Stock warehouse" },
  CASH_ACCOUNT: { fr: "Caisse", en: "Cash account" },
  CATALOG: { fr: "Catalogue de vente", en: "Sales catalog" },
  INVENTORY_LINKS: { fr: "Disponibilité du stock", en: "Stock availability" },
  TEAM: { fr: "Équipe autorisée", en: "Authorized team" },
  ACCOUNTING: { fr: "Suivi comptable des ventes", en: "Sales accounting" },
  RETAIL_CONFIGURATION: { fr: "Paramètres du Shop", en: "Shop settings" },
};

function capabilityNote(status: string, locale: "fr" | "en") {
  switch (status) {
    case "SUPPORTED":
      return locale === "en" ? "Available with this Shop configuration." : "Disponible avec cette configuration du Shop.";
    case "TENANT_CONFIGURATION_REQUIRED":
      return locale === "en" ? "Complete your company settings before using this feature." : "Complétez les paramètres de votre entreprise avant d’utiliser cette fonction.";
    case "EVIDENCE_REQUIRED":
      return locale === "en" ? "A local validation is required before this feature can be presented as compliant." : "Une validation locale est nécessaire avant de présenter cette fonction comme conforme.";
    case "NOT_CERTIFIED":
      return locale === "en" ? "This feature is not offered as certified in the current country configuration." : "Cette fonction n’est pas proposée comme certifiée dans la configuration pays actuelle.";
    default:
      return locale === "en" ? "Availability depends on your Shop setup." : "La disponibilité dépend de la configuration de votre Shop.";
  }
}

export function RetailGlobalReadiness({ organizationId, locale }: Props) {
  const [state, setState] = useState<State | null>(null);
  const [selection, setSelection] = useState({ countryCode: "", currencyCode: "", siteId: "", warehouseId: "", cashFinancialAccountId: "" });
  const [busy, setBusy] = useState<"load" | "save" | "pack" | null>("load");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setBusy("load");
    setError("");
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
    } catch (caught) {
      setError(customerFacingError(caught, locale));
    } finally {
      setBusy(null);
    }
  }, [locale, organizationId]);

  useEffect(() => { void load(); }, [load]);

  const pack = state?.countryPackRegistry.find((item) => item.countryCode === selection.countryCode) || null;
  const activation = state?.readiness.options.countryPackActivations.find((item) => item.countryCode === selection.countryCode && ["ACTIVE_CORE", "VALIDATED"].includes(item.status)) || null;
  const warehouses = useMemo(() => (state?.readiness.options.warehouses || []).filter((item) => !selection.siteId || item.siteId === selection.siteId), [selection.siteId, state]);
  const cashAccounts = useMemo(() => (state?.readiness.options.accounts || []).filter((item) => (!selection.currencyCode || item.currencyCode === selection.currencyCode) && (!selection.siteId || !item.siteId || item.siteId === selection.siteId) && String(item.accountType || "").toUpperCase().includes("CASH")), [selection.currencyCode, selection.siteId, state]);

  async function activatePack() {
    if (!pack) return;
    setBusy("pack");
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/enterprise/${organizationId}/retail/country-packs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ packCode: pack.packCode, countryCode: pack.countryCode, configuration: { currencyCode: selection.currencyCode || pack.defaultCurrencyCode } }),
      });
      const body = await response.json().catch(() => null) as { activation?: Activation; error?: string; message?: string } | null;
      if (!response.ok) throw new Error(body?.message || body?.error || "RETAIL_COUNTRY_PACK_ACTIVATION_FAILED");
      setNotice(locale === "en" ? "Country configuration activated. You can continue the Shop setup." : "Configuration pays activée. Vous pouvez poursuivre la mise en service du Shop.");
      await load();
    } catch (caught) {
      setError(customerFacingError(caught, locale));
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    setBusy("save");
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/enterprise/${organizationId}/retail/onboarding`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...selection, revision: state?.latestRun?.revision || undefined }),
      });
      const body = await response.json().catch(() => null) as { run?: Run; readiness?: Readiness; error?: string; message?: string } | null;
      if (!response.ok) throw new Error(body?.message || body?.error || "RETAIL_ONBOARDING_SAVE_FAILED");
      setNotice(body?.readiness?.ready
        ? (locale === "en" ? "Your Shop is ready for its first sale." : "Votre Shop est prêt pour sa première vente.")
        : (locale === "en" ? "Setup saved. Complete the remaining steps before the first sale." : "Configuration enregistrée. Complétez les étapes restantes avant la première vente."));
      await load();
    } catch (caught) {
      setError(customerFacingError(caught, locale));
    } finally {
      setBusy(null);
    }
  }

  if (!state && busy === "load") {
    return <section className="rounded-3xl border border-dtsc-border bg-dtsc-surface p-5"><div className="flex items-center gap-2 text-sm font-bold text-dtsc-muted"><RefreshCw className="h-4 w-4 animate-spin" />{locale === "en" ? "Checking Shop setup…" : "Vérification de la mise en service du Shop…"}</div></section>;
  }

  if (!state) {
    return <section className="rounded-3xl border border-red-500/30 bg-red-500/10 p-5 text-sm font-semibold text-red-700 dark:text-red-300">{error || customerFacingError("RETAIL_ONBOARDING_UNAVAILABLE", locale)}</section>;
  }

  return (
    <section data-testid="retail-global-readiness" className="rounded-3xl border border-dtsc-border bg-dtsc-surface p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2"><Globe2 className="h-5 w-5 text-cyan-600" /><h2 className="text-lg font-black text-dtsc-ink">{locale === "en" ? "Shop setup" : "Mise en service du Shop"}</h2></div>
          <p className="mt-1 max-w-3xl text-sm text-dtsc-muted">{locale === "en" ? "Choose the company resources used by this point of sale, then follow the remaining steps before the first transaction." : "Choisissez les ressources de l’entreprise utilisées par ce point de vente, puis complétez les étapes restantes avant la première transaction."}</p>
        </div>
        <div className={`rounded-full px-3 py-1.5 text-xs font-black ${state.readiness.ready ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-amber-500/10 text-amber-800 dark:text-amber-200"}`}>{state.readiness.completed}/{state.readiness.total} · {state.readiness.ready ? (locale === "en" ? "Ready to sell" : "Prêt à vendre") : (locale === "en" ? "Setup to finish" : "Mise en service à finaliser")}</div>
      </div>

      {error ? <div role="alert" className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-700 dark:text-red-300">{error}</div> : null}
      {notice ? <div role="status" className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-800 dark:text-emerald-200">{notice}</div> : null}

      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <div className="space-y-3">
          <div className="rounded-2xl border border-dtsc-border bg-dtsc-page p-4">
            <div className="flex items-center justify-between gap-2">
              <div><p className="font-black text-dtsc-ink">{locale === "en" ? "Country configuration" : "Configuration pays"}</p><p className="text-xs text-dtsc-muted">{pack ? (locale === "en" ? pack.labelEn : pack.labelFr) : "—"}</p></div>
              <span className={`rounded-full px-2 py-1 text-xs font-black ${activation ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-amber-500/10 text-amber-800 dark:text-amber-200"}`}>{customerFacingStatusLabel(activation?.status || "INACTIVE", locale)}</span>
            </div>
            {pack ? <div className="mt-3 grid gap-2">{Object.entries(pack.capabilities).map(([code, capability]) => <div key={code} className="rounded-xl border border-dtsc-border bg-dtsc-surface p-2.5"><div className="flex items-center justify-between gap-2"><span className="text-xs font-black text-dtsc-ink">{customerFacingCapabilityLabel(code, locale)}</span><span className="text-[11px] font-bold text-dtsc-muted">{customerFacingStatusLabel(capability.status, locale)}</span></div><p className="mt-1 text-xs leading-5 text-dtsc-muted">{capabilityNote(capability.status, locale)}</p></div>)}</div> : null}
            {!activation && pack ? <Button type="button" variant="outline" className="mt-3 w-full" disabled={Boolean(busy)} onClick={() => void activatePack()}><ShieldAlert className="h-4 w-4" />{locale === "en" ? "Activate this country configuration" : "Activer cette configuration pays"}</Button> : null}
          </div>

          <div className="rounded-2xl border border-dtsc-border bg-dtsc-page p-4">
            <div className="flex items-center gap-2"><Store className="h-4 w-4" /><p className="font-black text-dtsc-ink">{locale === "en" ? "Point-of-sale setup" : "Configuration du point de vente"}</p></div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-bold text-dtsc-muted">{locale === "en" ? "Country" : "Pays"}<select className="mt-1 h-10 w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-2 text-sm text-dtsc-ink" value={selection.countryCode} onChange={(event) => { const nextPack = state.countryPackRegistry.find((item) => item.countryCode === event.target.value); setSelection((current) => ({ ...current, countryCode: event.target.value, currencyCode: nextPack?.defaultCurrencyCode || current.currencyCode, cashFinancialAccountId: "" })); }}>{state.countryPackRegistry.map((item) => <option key={item.packCode} value={item.countryCode}>{locale === "en" ? item.labelEn : item.labelFr}</option>)}</select></label>
              <label className="text-xs font-bold text-dtsc-muted">{locale === "en" ? "Currency" : "Devise"}<select className="mt-1 h-10 w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-2 text-sm text-dtsc-ink" value={selection.currencyCode} onChange={(event) => setSelection((current) => ({ ...current, currencyCode: event.target.value, cashFinancialAccountId: "" }))}>{(pack?.supportedCurrencyCodes || []).map((code) => <option key={code} value={code}>{code}</option>)}</select></label>
              <label className="text-xs font-bold text-dtsc-muted">{locale === "en" ? "Store" : "Point de vente"}<select className="mt-1 h-10 w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-2 text-sm text-dtsc-ink" value={selection.siteId} onChange={(event) => setSelection((current) => ({ ...current, siteId: event.target.value, warehouseId: "", cashFinancialAccountId: "" }))}><option value="">—</option>{state.readiness.options.sites.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></label>
              <label className="text-xs font-bold text-dtsc-muted">{locale === "en" ? "Stock warehouse" : "Dépôt de stock"}<select className="mt-1 h-10 w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-2 text-sm text-dtsc-ink" value={selection.warehouseId} onChange={(event) => setSelection((current) => ({ ...current, warehouseId: event.target.value }))}><option value="">—</option>{warehouses.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></label>
              <label className="text-xs font-bold text-dtsc-muted sm:col-span-2">{locale === "en" ? "Cash register account" : "Compte de caisse"}<select className="mt-1 h-10 w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-2 text-sm text-dtsc-ink" value={selection.cashFinancialAccountId} onChange={(event) => setSelection((current) => ({ ...current, cashFinancialAccountId: event.target.value }))}><option value="">—</option>{cashAccounts.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name} · {item.currencyCode}</option>)}</select></label>
            </div>
            <Button type="button" className="mt-4 w-full" disabled={Boolean(busy)} onClick={() => void save()}>{busy === "save" ? "…" : (locale === "en" ? "Save & check setup" : "Enregistrer & vérifier la mise en service")}</Button>
          </div>
        </div>

        <div className="rounded-2xl border border-dtsc-border bg-dtsc-page p-4">
          <p className="font-black text-dtsc-ink">{locale === "en" ? "Steps before the first sale" : "Étapes avant la première vente"}</p>
          <div className="mt-3 grid gap-2">{state.readiness.items.map((item) => { const label = LABELS[item.code]?.[locale] || (locale === "en" ? "Shop setup" : "Configuration du Shop"); return <div key={item.code} className="flex items-start gap-3 rounded-xl border border-dtsc-border bg-dtsc-surface p-3">{item.complete ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <span className="mt-0.5 h-4 w-4 shrink-0 rounded-full border-2 border-amber-500" />}<div className="min-w-0"><p className="text-sm font-black text-dtsc-ink">{label}</p><p className="mt-0.5 break-words text-xs leading-5 text-dtsc-muted">{customerFacingReadinessDetail(item.detail, item.complete, locale)}</p></div></div>; })}</div>
          <p className="mt-4 text-xs leading-5 text-dtsc-muted">{locale === "en" ? "Some fiscal or regulated features may require additional local validation before they can be activated or presented as compliant." : "Certaines fonctions fiscales ou réglementées peuvent nécessiter une validation locale supplémentaire avant d’être activées ou présentées comme conformes."}</p>
        </div>
      </div>
    </section>
  );
}
