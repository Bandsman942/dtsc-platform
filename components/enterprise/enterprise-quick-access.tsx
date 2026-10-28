"use client";

import Link from "next/link";
import { Clock3, Search, Star, Zap } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { EnterpriseNavigationModule } from "@/lib/enterprise/enterprise-navigation";

type Shortcuts = { favorites: string[]; recent: string[] };
const EMPTY: Shortcuts = { favorites: [], recent: [] };

function prioritizedModules(modules: EnterpriseNavigationModule[], role: string) {
  const position = role.toUpperCase();
  const preference = /FINANCE|ACCOUNT|CFO|COMPTAB|CAISS/.test(position) ? /FINANCE|CASH|PAYMENT|POS/
    : /MEDIC|HEALTH|DOCT|NURS|INFIRM/.test(position) ? /HEALTH|PATIENT|CONSULT|LAB/
    : /PHARM|DISPENS/.test(position) ? /PHARMACY|STOCK/
    : /SELL|VENTE|COMMERC|SHOP/.test(position) ? /SALES|RETAIL|CRM|POS/
    : /HR|RH|PERSONNEL/.test(position) ? /HR|PAYROLL|TIME/
    : /PROJECT|PROJET|OPS|OPERATION/.test(position) ? /TASK|PROJECT|REQUEST/
    : null;
  return [...modules].sort((a, b) => {
    const aPreferred = preference?.test(a.code) ? 1 : 0;
    const bPreferred = preference?.test(b.code) ? 1 : 0;
    return bPreferred - aPreferred || a.navigationOrder - b.navigationOrder;
  });
}

/** All visible links come from the canonical, server-authorized navigation list. */
export function EnterpriseQuickAccess({
  organizationId,
  userId,
  activeOrganizationRole,
  modules,
  locale,
}: {
  organizationId: string;
  userId: string;
  activeOrganizationRole?: string | null;
  modules: EnterpriseNavigationModule[];
  locale?: string | null;
}) {
  const english = locale === "en";
  const storageKey = `dtsc:erp-shortcuts:v1:${organizationId}:${userId}`;
  const [query, setQuery] = useState("");
  const [shortcuts, setShortcuts] = useState<Shortcuts>(EMPTY);
  const [ready, setReady] = useState(false);
  const allowed = useMemo(() => new Map(modules.map((module) => [module.code, module])), [modules]);

  useEffect(() => {
    try {
      const raw: unknown = JSON.parse(window.localStorage.getItem(storageKey) || "null");
      if (raw && typeof raw === "object" && !Array.isArray(raw)) {
        const value = raw as Partial<Shortcuts>;
        const clean = (items: unknown, max: number) => Array.isArray(items)
          ? [...new Set(items.filter((code): code is string => typeof code === "string" && allowed.has(code)))].slice(0, max)
          : [];
        setShortcuts({ favorites: clean(value.favorites, 12), recent: clean(value.recent, 8) });
      } else setShortcuts(EMPTY);
    } catch {
      setShortcuts(EMPTY);
    }
    setReady(true);
  }, [allowed, storageKey]);

  function persist(next: Shortcuts) {
    setShortcuts(next);
    try { window.localStorage.setItem(storageKey, JSON.stringify(next)); }
    catch { /* Private browsing or storage denial does not block navigation. */ }
  }

  function visit(code: string) {
    if (!allowed.has(code)) return;
    persist({ ...shortcuts, recent: [code, ...shortcuts.recent.filter((item) => item !== code)].slice(0, 8) });
  }

  useEffect(() => {
    const trackModuleVisit = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      const code = event.target.closest<HTMLAnchorElement>("a[data-enterprise-module-code]")?.dataset.enterpriseModuleCode;
      if (!code || !allowed.has(code)) return;
      setShortcuts((current) => {
        const next = { ...current, recent: [code, ...current.recent.filter((item) => item !== code)].slice(0, 8) };
        try { window.localStorage.setItem(storageKey, JSON.stringify(next)); }
        catch { /* Private browsing or storage denial does not block navigation. */ }
        return next;
      });
    };
    document.addEventListener("click", trackModuleVisit, true);
    return () => document.removeEventListener("click", trackModuleVisit, true);
  }, [allowed, storageKey]);

  function toggleFavorite(code: string) {
    if (!allowed.has(code)) return;
    const favorites = shortcuts.favorites.includes(code)
      ? shortcuts.favorites.filter((item) => item !== code)
      : [code, ...shortcuts.favorites].slice(0, 12);
    persist({ ...shortcuts, favorites });
  }

  const normalizedQuery = query.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  const matches = normalizedQuery ? modules.filter((module) =>
    `${module.label} ${module.code} ${module.description}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().includes(normalizedQuery)) : [];
  const favorites = shortcuts.favorites.map((code) => allowed.get(code)).filter((module): module is EnterpriseNavigationModule => Boolean(module));
  const recent = shortcuts.recent.filter((code) => !shortcuts.favorites.includes(code)).map((code) => allowed.get(code)).filter((module): module is EnterpriseNavigationModule => Boolean(module));
  const suggestions = prioritizedModules(modules, activeOrganizationRole || "").filter((module) => !shortcuts.favorites.includes(module.code)).slice(0, 6);
  const displayed = normalizedQuery ? matches.slice(0, 12) : [...favorites, ...recent.slice(0, 3), ...suggestions.filter((module) => !shortcuts.recent.includes(module.code))].slice(0, 9);

  if (!modules.length) return null;

  return (
    <section data-enterprise-quick-access className="min-w-0 rounded-2xl border border-dtsc-border bg-dtsc-surface p-3.5 sm:p-5" aria-label={english ? "ERP quick access" : "Accès rapide ERP"}>
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-dtsc-ink">
          <Zap className="h-4 w-4 text-cyan-600" aria-hidden="true" />
          <h2 className="text-sm font-extrabold sm:text-base">{english ? "Quick access" : "Accès rapide"}</h2>
        </div>
        <span className="text-xs text-dtsc-muted">{english ? "Authorized modules only" : "Modules autorisés uniquement"}</span>
      </div>
      <label className="mt-3 flex min-h-11 items-center gap-2 rounded-xl border border-dtsc-border bg-dtsc-page px-3 focus-within:ring-2 focus-within:ring-cyan-400">
        <Search className="h-4 w-4 shrink-0 text-dtsc-muted" aria-hidden="true" />
        <span className="sr-only">{english ? "Find an ERP module" : "Rechercher un module ERP"}</span>
        <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={english ? "Find a module..." : "Rechercher un module..."} className="min-h-11 w-full min-w-0 bg-transparent text-base text-dtsc-ink outline-none placeholder:text-dtsc-muted sm:text-sm" />
      </label>
      <div className="mt-3 grid min-w-0 gap-2 sm:grid-cols-2 xl:grid-cols-3" aria-live="polite">
        {displayed.map((module) => {
          const isFavorite = shortcuts.favorites.includes(module.code);
          const isRecent = shortcuts.recent.includes(module.code);
          return (
            <div key={module.code} className="flex min-w-0 items-center rounded-xl border border-dtsc-border bg-dtsc-page/60 transition hover:border-cyan-400/40">
              <Link href={module.href} onClick={() => visit(module.code)} className="flex min-h-12 min-w-0 flex-1 items-center gap-2 px-3 py-2 text-sm font-semibold text-dtsc-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400">
                {isRecent ? <Clock3 className="h-4 w-4 shrink-0 text-dtsc-muted" aria-hidden="true" /> : <Zap className="h-4 w-4 shrink-0 text-cyan-600" aria-hidden="true" />}
                <span className="min-w-0 break-words">{module.label}</span>
              </Link>
              <button type="button" onClick={() => toggleFavorite(module.code)} aria-pressed={isFavorite} aria-label={english ? `${isFavorite ? "Remove" : "Add"} ${module.label} ${isFavorite ? "from" : "to"} favorites` : `${isFavorite ? "Retirer" : "Ajouter"} ${module.label} ${isFavorite ? "des" : "aux"} favoris`} className="mr-1 flex min-h-11 min-w-11 items-center justify-center rounded-lg text-dtsc-muted hover:bg-dtsc-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400">
                <Star className={isFavorite ? "h-4 w-4 fill-amber-400 text-amber-500" : "h-4 w-4"} aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>
      {ready && normalizedQuery && !matches.length ? <p className="mt-3 text-sm text-dtsc-muted">{english ? "No authorized module matches your search." : "Aucun module autorisé ne correspond à la recherche."}</p> : null}
      {!normalizedQuery && !favorites.length && <p className="mt-2 text-xs text-dtsc-muted">{english ? "Use the star to pin modules you open often." : "Utilisez l’étoile pour épingler les modules fréquents."}</p>}
    </section>
  );
}
