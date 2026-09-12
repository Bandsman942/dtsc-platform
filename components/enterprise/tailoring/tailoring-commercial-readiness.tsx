"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowUpRight, CheckCircle2, CircleDashed, RefreshCw, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toastError, toastSuccess } from "@/lib/client-toast";

type Locale = "fr" | "en";
type Option = { id: string; code: string; name: string; siteId?: string };
type Run = { id: string; status: string; currentStep: string; operatingMode: string; preferredSiteId: string | null; preferredWarehouseId: string | null; revision: number };
type Item = { code: string; complete: boolean; detail: Record<string, unknown>; deepLink: string };
type Readiness = {
  ready: boolean;
  completed: number;
  total: number;
  currentStep: string;
  items: Item[];
  selected: { operatingMode: string; businessModeCode: string; preferredSiteId: string | null; preferredWarehouseId: string | null };
  options: { sites: Option[]; warehouses: Option[] };
};
type State = { latestRun: Run | null; readiness: Readiness };

const STEP_COPY: Record<string, { fr: string; en: string; frHint: string; enHint: string }> = {
  IDENTITY: { fr: "Identité de l’entreprise", en: "Company identity", frHint: "Pays, fuseau horaire et identité de l’espace client.", enHint: "Country, timezone and client workspace identity." },
  SITES_WAREHOUSES: { fr: "Atelier et dépôt", en: "Workshop and warehouse", frHint: "Choisissez un site et un dépôt déjà configurés dans l’ERP commun.", enHint: "Choose a site and warehouse already configured in the common ERP." },
  TEAM: { fr: "Équipe atelier", en: "Workshop team", frHint: "Au moins un collaborateur RH actif doit être disponible.", enHint: "At least one active HR employee must be available." },
  CATALOG: { fr: "Catalogue métier", en: "Business catalog", frHint: "Produits et matières restent dans le Catalogue commun.", enHint: "Products and materials remain in the common Catalog." },
  INITIAL_STOCK: { fr: "Stock initial", en: "Initial stock", frHint: "Le stock initial doit être visible dans Inventory, jamais dans un stock Couture parallèle.", enHint: "Initial stock must be visible in Inventory, never in a parallel Tailoring stock." },
  FINANCE: { fr: "Finance", en: "Finance", frHint: "Devise, exercice, plan comptable, journaux et mappings doivent être prêts.", enHint: "Currency, fiscal year, chart, journals and mappings must be ready." },
  PRODUCTION: { fr: "Production", en: "Production", frHint: "Dépôts par défaut, centre de travail, nomenclature et gamme actives.", enHint: "Default warehouses, work center, active BOM and routing." },
  TAILORING_CONFIGURATION: { fr: "Configuration Couture", en: "Tailoring setup", frHint: "Mode métier et unité de mensuration de l’atelier.", enHint: "Workshop operating mode and measurement unit." },
};

const MODE_OPTIONS = [
  { value: "SUR_MESURE", fr: "Sur mesure", en: "Made to measure" },
  { value: "PRET_A_PORTER", fr: "Prêt-à-porter", en: "Ready to wear" },
  { value: "MIXTE", fr: "Mixte", en: "Mixed" },
] as const;

function text(locale: Locale, fr: string, en: string) {
  return locale === "en" ? en : fr;
}

export function TailoringCommercialReadiness({ organizationId, locale: localeProp }: { organizationId: string; locale?: string | null }) {
  const locale: Locale = localeProp === "en" ? "en" : "fr";
  const [state, setState] = useState<State | null>(null);
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState<"load" | "save" | null>("load");
  const [error, setError] = useState("");
  const [selection, setSelection] = useState({ operatingMode: "MIXTE", preferredSiteId: "", preferredWarehouseId: "" });

  const load = useCallback(async () => {
    setBusy("load");
    setError("");
    try {
      const response = await fetch(`/api/enterprise/${organizationId}/tailoring/onboarding`, { cache: "no-store" });
      if (response.status === 403) {
        setHidden(true);
        return;
      }
      const body = await response.json().catch(() => null) as State | { message?: string; error?: string } | null;
      if (!response.ok || !body || !("readiness" in body)) throw new Error((body as { message?: string; error?: string } | null)?.message || text(locale, "Mise en service Couture indisponible.", "Tailoring setup is unavailable."));
      const next = body as State;
      setState(next);
      setHidden(false);
      setSelection({
        operatingMode: next.readiness.selected.businessModeCode || "MIXTE",
        preferredSiteId: next.readiness.selected.preferredSiteId || "",
        preferredWarehouseId: next.readiness.selected.preferredWarehouseId || "",
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : text(locale, "Mise en service Couture indisponible.", "Tailoring setup is unavailable."));
    } finally {
      setBusy(null);
    }
  }, [locale, organizationId]);

  useEffect(() => { void load(); }, [load]);

  const warehouseOptions = useMemo(() => (state?.readiness.options.warehouses || []).filter((warehouse) => !selection.preferredSiteId || warehouse.siteId === selection.preferredSiteId), [selection.preferredSiteId, state]);

  async function save() {
    if (!state) return;
    setBusy("save");
    setError("");
    try {
      const response = await fetch(`/api/enterprise/${organizationId}/tailoring/onboarding`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...selection, revision: state.latestRun?.revision || undefined }),
      });
      const body = await response.json().catch(() => null) as State | { message?: string; error?: string } | null;
      if (!response.ok || !body || !("readiness" in body)) throw new Error((body as { message?: string; error?: string } | null)?.message || text(locale, "Impossible d’enregistrer la mise en service.", "Unable to save setup."));
      const next = body as State;
      setState(next);
      setSelection({
        operatingMode: next.readiness.selected.businessModeCode || "MIXTE",
        preferredSiteId: next.readiness.selected.preferredSiteId || "",
        preferredWarehouseId: next.readiness.selected.preferredWarehouseId || "",
      });
      toastSuccess(next.readiness.ready
        ? text(locale, "Votre atelier Couture est prêt pour son parcours opérationnel.", "Your Tailoring workshop is ready for its operational workflow.")
        : text(locale, "Progression enregistrée. Les étapes restantes indiquent où terminer la configuration.", "Progress saved. Remaining steps show where to finish setup."));
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : text(locale, "Impossible d’enregistrer la mise en service.", "Unable to save setup.");
      setError(message);
      toastError(message);
    } finally {
      setBusy(null);
    }
  }

  if (hidden) return null;
  if (!state && busy === "load") {
    return <section className="rounded-3xl border border-dtsc-border bg-dtsc-surface p-5"><div className="flex items-center gap-2 text-sm font-bold text-dtsc-muted"><RefreshCw className="h-4 w-4 animate-spin" />{text(locale, "Vérification de la mise en service Couture…", "Checking Tailoring setup…")}</div></section>;
  }
  if (!state) {
    return <section role="alert" className="rounded-3xl border border-red-500/30 bg-red-500/10 p-5 text-sm font-semibold text-red-700 dark:text-red-300">{error || text(locale, "Mise en service Couture indisponible.", "Tailoring setup is unavailable.")}</section>;
  }

  return <section id="tailoring-setup" data-testid="tailoring-commercial-readiness" className="rounded-3xl border border-dtsc-border bg-dtsc-surface p-4 shadow-sm sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2"><Settings2 className="h-5 w-5 text-cyan-600" /><h2 className="text-lg font-black text-dtsc-ink">{text(locale, "Mise en service Couture", "Tailoring setup")}</h2></div>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-dtsc-muted">{text(locale, "Cette checklist reconnaît vos données ERP existantes. Elle ne crée ni clients, ni articles, ni stock, ni finance à votre place.", "This checklist recognizes your existing ERP data. It does not create customers, items, stock or finance data on your behalf.")}</p>
      </div>
      <span className={`rounded-full px-3 py-1.5 text-xs font-black ${state.readiness.ready ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-amber-500/10 text-amber-800 dark:text-amber-200"}`}>{state.readiness.completed}/{state.readiness.total} · {state.readiness.ready ? text(locale, "Prêt", "Ready") : text(locale, "À finaliser", "Setup required")}</span>
    </div>

    {error ? <div role="alert" className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-700 dark:text-red-300">{error}</div> : null}

    <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
      <div className="rounded-2xl border border-dtsc-border bg-dtsc-page p-4">
        <p className="font-black text-dtsc-ink">{text(locale, "Choix de l’atelier", "Workshop choices")}</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
          <label className="text-xs font-bold text-dtsc-muted">{text(locale, "Mode Couture", "Tailoring mode")}
            <select className="mt-1 h-10 w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-2 text-sm text-dtsc-ink" value={selection.operatingMode} onChange={(event) => setSelection((current) => ({ ...current, operatingMode: event.target.value }))}>{MODE_OPTIONS.map((item) => <option key={item.value} value={item.value}>{locale === "en" ? item.en : item.fr}</option>)}</select>
          </label>
          <label className="text-xs font-bold text-dtsc-muted">{text(locale, "Site principal", "Primary site")}
            <select className="mt-1 h-10 w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-2 text-sm text-dtsc-ink" value={selection.preferredSiteId} onChange={(event) => setSelection((current) => ({ ...current, preferredSiteId: event.target.value, preferredWarehouseId: "" }))}><option value="">{text(locale, "Sélection automatique si unique", "Auto-select when unique")}</option>{state.readiness.options.sites.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select>
          </label>
          <label className="text-xs font-bold text-dtsc-muted">{text(locale, "Dépôt principal", "Primary warehouse")}
            <select className="mt-1 h-10 w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-2 text-sm text-dtsc-ink" value={selection.preferredWarehouseId} onChange={(event) => setSelection((current) => ({ ...current, preferredWarehouseId: event.target.value }))}><option value="">{text(locale, "Sélection automatique si unique", "Auto-select when unique")}</option>{warehouseOptions.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select>
          </label>
        </div>
        <Button type="button" className="mt-4 w-full" disabled={Boolean(busy)} onClick={() => void save()}>{busy === "save" ? <RefreshCw className="h-4 w-4 animate-spin" /> : null}{text(locale, "Enregistrer et revérifier", "Save and recheck")}</Button>
      </div>

      <div className="grid gap-2">
        {state.readiness.items.map((item) => {
          const copy = STEP_COPY[item.code] || { fr: item.code, en: item.code, frHint: "", enHint: "" };
          return <Link key={item.code} href={item.deepLink} className="group flex min-w-0 items-start gap-3 rounded-2xl border border-dtsc-border bg-dtsc-page p-3 transition hover:border-cyan-400 hover:bg-cyan-500/5 focus:outline-none focus:ring-2 focus:ring-cyan-400/40">
            {item.complete ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" /> : <CircleDashed className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />}
            <span className="min-w-0 flex-1"><span className="block break-words text-sm font-black text-dtsc-ink">{locale === "en" ? copy.en : copy.fr}</span><span className="mt-1 block break-words text-xs leading-5 text-dtsc-muted">{locale === "en" ? copy.enHint : copy.frHint}</span></span>
            <ArrowUpRight className="mt-1 h-4 w-4 shrink-0 text-dtsc-blue transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
          </Link>;
        })}
      </div>
    </div>
  </section>;
}
