"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowUpRight, CheckCircle2, CircleDashed, RefreshCw, ShieldCheck, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppLocale } from "@/components/i18n/locale-provider";
import { toastError, toastSuccess } from "@/lib/client-toast";

type Item = { code: string; complete: boolean; detail: Record<string, unknown>; deepLink: string };
type State = {
  configurationRevision: number;
  readiness: {
    ready: boolean;
    completed: number;
    total: number;
    currentStep: string;
    items: Item[];
    selected: { preferredSiteId: string | null };
    options: { sites: Array<{ id: string; code: string; name: string }> };
  };
};

const STEP_COPY: Record<string, { fr: string; en: string; frHint: string; enHint: string }> = {
  IDENTITY_SITE: { fr: "Identité & site", en: "Identity & site", frHint: "Identité, pays, fuseau horaire et site opérationnel canonique.", enHint: "Identity, country, timezone and canonical operating site." },
  STATIONS_ASSETS: { fr: "5 postes & actifs", en: "5 stations & assets", frHint: "Le lancement de référence exige 5 postes reliés à de vrais actifs ; aucune limite produit n’est créée.", enHint: "Launch readiness expects 5 stations linked to real assets; no product cap is introduced." },
  TEAM_PERMISSIONS: { fr: "Équipe & permissions", en: "Team & permissions", frHint: "Rôles Gaming recommandés et au moins un membre actif, sans bypass global.", enHint: "Recommended Gaming roles and at least one active member, without global bypass." },
  CATALOG_SERVICES: { fr: "Services du catalogue", en: "Catalog services", frHint: "Le temps de jeu reste un service du Catalogue commun.", enHint: "Gaming time remains a service in the shared Catalog." },
  PRICING: { fr: "Tarifs & forfaits", en: "Pricing & packages", frHint: "Au moins une règle Gaming active calcule les prix côté serveur.", enHint: "At least one active Gaming rule prices sessions server-side." },
  FINANCE_PAYMENTS: { fr: "Finance & paiements", en: "Finance & payments", frHint: "Finance doit être prête et disposer d’un compte actif ; aucune caisse parallèle.", enHint: "Finance must be ready with an active account; no parallel cash ledger." },
  OPERATIONS: { fr: "Réservations, sessions & checkout", en: "Bookings, sessions & checkout", frHint: "Les trois modules opérationnels doivent être réellement activés.", enHint: "All three operational modules must be truly enabled." },
  CLOSE_REPORTING_AI: { fr: "Clôture, rapports & DTSC AI", en: "Close, reports & DTSC AI", frHint: "Clôture, dashboard, rapports et tournois composent la fin du parcours ; l’IA reste permission-scoped.", enHint: "Close, dashboard, reports and tournaments complete the flow; AI remains permission-scoped." },
};

const ROLES = [
  ["GAMING_MANAGER", "Gérant / Admin Gaming", "Gaming manager / admin"],
  ["GAMING_OPERATOR_CASHIER", "Caissier / Opérateur", "Cashier / operator"],
  ["GAMING_TECHNICIAN", "Technicien", "Technician"],
  ["GAMING_FINANCE_ACCOUNTANT", "Finance / Comptable", "Finance / accountant"],
] as const;

export function GamingCommercialReadiness({ organizationId }: { organizationId: string }) {
  const locale = useAppLocale();
  const en = locale === "en";
  const [state, setState] = useState<State | null>(null);
  const [busy, setBusy] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [error, setError] = useState("");
  const [preferredSiteId, setPreferredSiteId] = useState("");

  const load = useCallback(async () => {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/enterprise/${organizationId}/gaming/onboarding`, { cache: "no-store" });
      if (response.status === 403) { setHidden(true); return; }
      const body = await response.json().catch(() => null) as State | { message?: string; error?: string } | null;
      if (!response.ok || !body || !("readiness" in body)) throw new Error((body as { message?: string; error?: string } | null)?.message || (en ? "Gaming setup is unavailable." : "La mise en service Gaming est indisponible."));
      const next = body as State;
      setState(next); setHidden(false); setPreferredSiteId(next.readiness.selected.preferredSiteId || "");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : (en ? "Gaming setup is unavailable." : "La mise en service Gaming est indisponible."));
    } finally { setBusy(false); }
  }, [en, organizationId]);

  useEffect(() => { void load(); }, [load]);
  const sites = useMemo(() => state?.readiness.options.sites || [], [state]);

  async function save() {
    if (!state) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/enterprise/${organizationId}/gaming/onboarding`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ preferredSiteId, revision: state.configurationRevision }),
      });
      const body = await response.json().catch(() => null) as State | { message?: string; error?: string } | null;
      if (!response.ok || !body || !("readiness" in body)) throw new Error((body as { message?: string; error?: string } | null)?.message || (en ? "Unable to save Gaming setup." : "Impossible d’enregistrer la mise en service Gaming."));
      const next = body as State;
      setState(next); setPreferredSiteId(next.readiness.selected.preferredSiteId || "");
      toastSuccess(next.readiness.ready ? (en ? "Gaming Lounge setup is ready." : "La mise en service Gaming Lounge est prête.") : (en ? "Progress saved. Complete the remaining steps." : "Progression enregistrée. Finalisez les étapes restantes."));
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : (en ? "Unable to save Gaming setup." : "Impossible d’enregistrer la mise en service Gaming.");
      setError(message); toastError(message);
    } finally { setBusy(false); }
  }

  if (hidden) return null;
  if (!state && busy) return <section data-testid="gaming-commercial-readiness" className="rounded-3xl border border-dtsc-border bg-dtsc-surface p-5"><p className="flex items-center gap-2 text-sm font-bold text-dtsc-muted"><RefreshCw className="h-4 w-4 animate-spin" />{en ? "Checking Gaming Lounge setup…" : "Vérification de la mise en service Gaming…"}</p></section>;
  if (!state) return <section data-testid="gaming-commercial-readiness" role="alert" className="rounded-3xl border border-red-500/30 bg-red-500/10 p-5 text-sm font-semibold text-red-700 dark:text-red-300">{error || (en ? "Gaming setup is unavailable." : "La mise en service Gaming est indisponible.")}</section>;

  return <section data-testid="gaming-commercial-readiness" className="rounded-3xl border border-dtsc-border bg-dtsc-surface p-4 shadow-sm sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0"><div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-cyan-600" /><h2 className="text-lg font-black text-dtsc-ink">{en ? "Gaming Lounge setup" : "Mise en service Gaming Lounge"}</h2></div><p className="mt-1 max-w-3xl text-sm leading-6 text-dtsc-muted">{en ? "This assistant checks canonical ERP data. It never creates a second customer, asset, catalog, stock, cash or finance source." : "Cet assistant contrôle les données ERP canoniques. Il ne crée jamais une seconde source client, actif, catalogue, stock, caisse ou finance."}</p></div>
      <span className={`rounded-full px-3 py-1.5 text-xs font-black ${state.readiness.ready ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-amber-500/10 text-amber-800 dark:text-amber-200"}`}>{state.readiness.completed}/{state.readiness.total} · {state.readiness.ready ? (en ? "Ready" : "Prêt") : (en ? "Setup required" : "À finaliser")}</span>
    </div>
    {error ? <div role="alert" className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-700 dark:text-red-300">{error}</div> : null}
    <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,0.72fr)_minmax(0,1.28fr)]">
      <div className="space-y-4">
        <div className="rounded-2xl border border-dtsc-border bg-dtsc-page p-4"><p className="font-black text-dtsc-ink">{en ? "Primary operating site" : "Site opérationnel principal"}</p><select aria-label={en ? "Primary operating site" : "Site opérationnel principal"} className="mt-3 h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm text-dtsc-ink" value={preferredSiteId} onChange={(event) => setPreferredSiteId(event.target.value)}><option value="">{en ? "Auto-select when unique" : "Sélection automatique si unique"}</option>{sites.map((site) => <option key={site.id} value={site.id}>{site.code} · {site.name}</option>)}</select><Button type="button" className="mt-3 w-full" disabled={busy} onClick={() => void save()}>{busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : null}{en ? "Save and recheck" : "Enregistrer et revérifier"}</Button></div>
        <div className="rounded-2xl border border-dtsc-border bg-dtsc-page p-4"><div className="flex items-center gap-2"><Users className="h-4 w-4" /><p className="font-black text-dtsc-ink">{en ? "Recommended positions" : "Postes recommandés"}</p></div><div className="mt-3 grid gap-2">{ROLES.map(([code, fr, english]) => <div key={code} className="rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2"><p className="text-sm font-bold text-dtsc-ink">{en ? english : fr}</p><p className="text-[11px] text-dtsc-muted">{code}</p></div>)}</div></div>
      </div>
      <div className="grid gap-2">{state.readiness.items.map((item) => { const copy = STEP_COPY[item.code] || { fr: item.code, en: item.code, frHint: "", enHint: "" }; return <Link key={item.code} href={item.deepLink} className="group flex min-w-0 items-start gap-3 rounded-2xl border border-dtsc-border bg-dtsc-page p-3 transition hover:border-cyan-400 hover:bg-cyan-500/5 focus:outline-none focus:ring-2 focus:ring-cyan-400/40">{item.complete ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" /> : <CircleDashed className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />}<span className="min-w-0 flex-1"><span className="block break-words text-sm font-black text-dtsc-ink">{en ? copy.en : copy.fr}</span><span className="mt-1 block break-words text-xs leading-5 text-dtsc-muted">{en ? copy.enHint : copy.frHint}</span></span><ArrowUpRight className="mt-1 h-4 w-4 shrink-0 text-dtsc-blue transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" /></Link>; })}</div>
    </div>
  </section>;
}
