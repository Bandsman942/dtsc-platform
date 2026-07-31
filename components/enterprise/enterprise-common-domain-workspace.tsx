"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, ChevronLeft, ChevronRight, Database, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { EnterpriseModuleDefinition } from "@/lib/enterprise/module-registry";

type WorkspaceEndpoint = { key: string; label: string; path: string };

type ApiPayload = {
  items?: Array<Record<string, unknown>>;
  metrics?: Record<string, unknown>;
  pagination?: { page?: number; pageSize?: number; total?: number; pageCount?: number };
  canManage?: boolean;
};

const ENDPOINTS: Record<string, WorkspaceEndpoint[]> = {
  CRM_CUSTOMERS: [{ key: "parties", label: "Tiers & clients", path: "business-parties" }],
  CATALOG: [{ key: "catalog", label: "Produits & services", path: "catalog" }],
  SITES_WAREHOUSES: [
    { key: "sites", label: "Sites", path: "sites" },
    { key: "warehouses", label: "Entrepôts", path: "warehouses" },
  ],
  CRM_PIPELINE: [
    { key: "leads", label: "Leads", path: "leads" },
    { key: "opportunities", label: "Opportunités", path: "opportunities" },
  ],
  SALES_QUOTES_ORDERS: [
    { key: "quotes", label: "Devis", path: "quotes" },
    { key: "orders", label: "Commandes", path: "sales-orders" },
  ],
  CONTRACTS: [{ key: "contracts", label: "Contrats", path: "contracts" }],
  INVENTORY_LOGISTICS: [
    { key: "inventory", label: "Stock", path: "inventory" },
    { key: "transfers", label: "Transferts", path: "stock-transfers" },
    { key: "counts", label: "Inventaires", path: "inventory-counts" },
  ],
  HUMAN_RESOURCES: [
    { key: "employees", label: "Employés", path: "employees" },
    { key: "employment-contracts", label: "Contrats de travail", path: "employment-contracts" },
  ],
  TIME_ATTENDANCE: [
    { key: "leave", label: "Congés", path: "leave-requests" },
    { key: "timesheets", label: "Timesheets", path: "timesheets" },
  ],
  PAYROLL_OPERATIONS: [
    { key: "periods", label: "Périodes", path: "payroll-periods" },
    { key: "runs", label: "Préparations de paie", path: "payroll-runs" },
  ],
  PROJECTS_SERVICES: [{ key: "projects", label: "Projets", path: "projects" }],
  TIME_DELIVERABLES: [
    { key: "projects", label: "Projets & livrables", path: "projects" },
    { key: "timesheets", label: "Temps approuvé", path: "timesheets" },
  ],
  ASSETS_MAINTENANCE: [
    { key: "assets", label: "Actifs", path: "assets" },
    { key: "categories", label: "Catégories", path: "asset-categories" },
  ],
};

function text(value: unknown) {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (value && typeof value === "object" && "toString" in value) return String(value);
  return "";
}

function itemTitle(item: Record<string, unknown>) {
  return text(item.reference || item.code || item.employeeNumber || item.payslipNumber || item.name || item.title || item.displayName || item.legalName || item.id) || "Élément";
}

function itemSubtitle(item: Record<string, unknown>) {
  return text(item.description || item.email || item.workEmail || item.category || item.projectType || item.contractType || item.leaveType || item.itemType || item.currency);
}

function itemDate(item: Record<string, unknown>) {
  const raw = item.updatedAt || item.createdAt || item.periodStart || item.startDate || item.receivedAt;
  if (!raw || typeof raw !== "string") return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString("fr-FR");
}

function metricLabel(key: string) {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/^./, (letter) => letter.toUpperCase());
}

export function EnterpriseCommonDomainWorkspace({
  organizationId,
  organizationName,
  definition,
}: {
  organizationId: string;
  organizationName: string;
  definition: EnterpriseModuleDefinition;
}) {
  const endpoints = useMemo(() => ENDPOINTS[definition.code] || [], [definition.code]);
  const [activeKey, setActiveKey] = useState(endpoints[0]?.key || "");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [payload, setPayload] = useState<ApiPayload>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activeEndpoint = endpoints.find((endpoint) => endpoint.key === activeKey) || endpoints[0];

  const load = useCallback(async () => {
    if (!activeEndpoint) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: "20" });
      if (search.trim()) params.set("search", search.trim());
      const response = await fetch(`/api/enterprise/${organizationId}/${activeEndpoint.path}?${params.toString()}`, { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message || body.error || "Chargement impossible.");
      setPayload(body);
    } catch (loadError) {
      setPayload({});
      setError(loadError instanceof Error ? loadError.message : "Chargement impossible.");
    } finally {
      setLoading(false);
    }
  }, [activeEndpoint, organizationId, page, search]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPage(1);
    setPayload({});
  }, [activeKey]);

  const items = payload.items || [];
  const pageCount = Math.max(1, payload.pagination?.pageCount || 1);

  if (!activeEndpoint) {
    return (
      <div className="mx-auto max-w-4xl p-4 sm:p-8">
        <div className="rounded-3xl border border-amber-500/30 bg-amber-500/5 p-6">
          <AlertCircle className="mb-3 h-6 w-6" />
          <h1 className="text-xl font-semibold">Workspace non configuré</h1>
          <p className="mt-2 text-sm text-muted-foreground">Le module {definition.code} n’a pas de source opérationnelle déclarée.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 p-3 sm:p-6 lg:p-8">
      <header className="rounded-3xl border bg-card/70 p-5 shadow-sm backdrop-blur sm:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">{organizationName}</p>
            <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">{definition.labelFr}</h1>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground sm:text-base">{definition.descriptionFr}</p>
          </div>
          <Button variant="outline" onClick={() => void load()} disabled={loading} className="self-start rounded-full lg:self-auto">
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Actualiser
          </Button>
        </div>
      </header>

      <nav className="flex snap-x gap-2 overflow-x-auto pb-1" aria-label="Sous-domaines du module">
        {endpoints.map((endpoint) => (
          <button
            key={endpoint.key}
            type="button"
            onClick={() => setActiveKey(endpoint.key)}
            className={`shrink-0 snap-start rounded-full border px-4 py-2 text-sm font-medium transition ${activeEndpoint.key === endpoint.key ? "bg-foreground text-background" : "bg-card hover:bg-muted"}`}
          >
            {endpoint.label}
          </button>
        ))}
      </nav>

      {payload.metrics && Object.keys(payload.metrics).length > 0 ? (
        <section className="flex snap-x gap-3 overflow-x-auto pb-2" aria-label="Indicateurs">
          {Object.entries(payload.metrics).map(([key, value]) => (
            <article key={key} className="min-w-44 snap-start rounded-2xl border bg-card p-4">
              <p className="text-xs font-medium text-muted-foreground">{metricLabel(key)}</p>
              <p className="mt-2 text-2xl font-semibold">{text(value) || "0"}</p>
            </article>
          ))}
        </section>
      ) : null}

      <section className="rounded-3xl border bg-card/70 p-4 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">{activeEndpoint.label}</h2>
            <p className="text-sm text-muted-foreground">Données persistées et isolées pour l’entreprise active.</p>
          </div>
          <div className="relative w-full sm:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Rechercher…" className="rounded-full pl-9" />
          </div>
        </div>

        {error ? (
          <div className="mt-5 flex items-start gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        <div className="mt-5 space-y-3">
          {loading && items.length === 0 ? (
            Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-24 animate-pulse rounded-2xl bg-muted" />)
          ) : items.length === 0 ? (
            <div className="flex min-h-48 flex-col items-center justify-center rounded-2xl border border-dashed p-8 text-center">
              <Database className="h-8 w-8 text-muted-foreground" />
              <p className="mt-3 font-medium">Aucune donnée disponible</p>
              <p className="mt-1 text-sm text-muted-foreground">Les prochaines opérations autorisées apparaîtront ici.</p>
            </div>
          ) : (
            items.map((item) => {
              const status = text(item.status || item.employmentStatus);
              return (
                <article key={text(item.id)} className="rounded-2xl border bg-background/60 p-4 transition hover:bg-muted/40">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <h3 className="truncate font-semibold">{itemTitle(item)}</h3>
                      {itemSubtitle(item) ? <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{itemSubtitle(item)}</p> : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {status ? <span className="rounded-full border px-2.5 py-1 text-xs font-medium">{status}</span> : null}
                      {itemDate(item) ? <span className="text-xs text-muted-foreground">{itemDate(item)}</span> : null}
                    </div>
                  </div>
                </article>
              );
            })
          )}
        </div>

        <footer className="mt-5 flex items-center justify-between border-t pt-4">
          <p className="text-xs text-muted-foreground">{payload.pagination?.total ?? items.length} élément(s)</p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" className="rounded-full" disabled={page <= 1 || loading} onClick={() => setPage((current) => Math.max(1, current - 1))} aria-label="Page précédente"><ChevronLeft className="h-4 w-4" /></Button>
            <span className="min-w-20 text-center text-sm">{page} / {pageCount}</span>
            <Button variant="outline" size="icon" className="rounded-full" disabled={page >= pageCount || loading} onClick={() => setPage((current) => Math.min(pageCount, current + 1))} aria-label="Page suivante"><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </footer>
      </section>
    </div>
  );
}
