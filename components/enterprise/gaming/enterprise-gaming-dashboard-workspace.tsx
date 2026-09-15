"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Activity, Gamepad2, ShieldAlert, Timer, Trophy } from "lucide-react";
import { NativeSelect, formatEnterpriseAmount } from "@/components/enterprise/core-v2/erp-v2-ui";
import { ProfessionalError, ProfessionalLoading } from "@/components/enterprise/professional/professional-erp-ui";
import { useAppLocale } from "@/components/i18n/locale-provider";
import { EmptyState } from "@/components/workspace/empty-state";
import { ModuleMetric, ModuleMetrics } from "@/components/workspace/module-metrics";
import { ModuleContent, ModuleHeader, ModuleSection, ModuleToolbar, ModuleWorkspace } from "@/components/workspace/module-workspace";
import { StatusBadge } from "@/components/workspace/status-badge";
import type { EnterpriseModuleDefinition } from "@/lib/enterprise/module-registry";

type FinancialRow = { currency: string; invoiceCount: number; billedAmount: number; outstandingAmount: number; averageBasket: number };
type StationRow = { id: string; assetId: string; stationCode: string; displayName: string | null; status: string; assetDeepLink: string };
type Snapshot = {
  asOf: string;
  periodStart: string;
  periodDays: number;
  operational: { stationCount: number; activeSessions: number; sessionsEnded: number; billableHours: number; occupancyRate: number; noShowCount: number; noShowRate: number; upcomingTournaments: number; stationStatus: Record<string, number>; sessionStatus: Record<string, number>; bookingStatus: Record<string, number> };
  assetSignals: { incidentsOpen: number; maintenanceOpen: number; incidentsCritical: number; maintenanceOverdue: number } | null;
  financialByCurrency: FinancialRow[] | null;
  stations: StationRow[];
  capabilities: { canReadAssets: boolean; canReadFinance: boolean };
};

export function EnterpriseGamingDashboardWorkspace({ organizationId, organizationName, definition }: { organizationId: string; organizationName: string; definition: EnterpriseModuleDefinition }) {
  const locale = useAppLocale();
  const en = locale === "en";
  const [periodDays, setPeriodDays] = useState("30");
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError("");
    fetch(`/api/enterprise/${organizationId}/gaming/dashboard?periodDays=${periodDays}`, { cache: "no-store" })
      .then(async (response) => { const body = await response.json().catch(() => null) as (Snapshot & { message?: string; error?: string }) | null; if (!response.ok || !body) throw new Error(body?.message || body?.error || "LOAD_FAILED"); return body; })
      .then((body) => { if (!cancelled) setSnapshot(body); })
      .catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : "LOAD_FAILED"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [organizationId, periodDays]);

  const copy = {
    eyebrow: en ? "Gaming Lounge" : "Gaming Lounge",
    title: en ? "Gaming overview" : "Vue d’ensemble Gaming",
    period: en ? "Period" : "Période",
    stations: en ? "Stations" : "Postes",
    active: en ? "Active sessions" : "Sessions actives",
    hours: en ? "Billable hours" : "Heures facturables",
    occupancy: en ? "Current occupancy" : "Occupation actuelle",
    noShow: en ? "No-show rate" : "Taux d’absence",
    tournaments: en ? "Active tournaments" : "Tournois actifs",
    assets: en ? "Asset signals" : "Signaux actifs & maintenance",
    finance: en ? "Gaming billing by currency" : "Facturation Gaming par devise",
    privacyAssets: en ? "Asset incidents are hidden because your current permissions do not grant access to Assets & maintenance." : "Les incidents et maintenances sont masqués car vos permissions actuelles ne donnent pas accès au module Actifs & maintenance.",
    privacyFinance: en ? "Financial indicators are hidden because your current permissions do not grant access to receivables." : "Les indicateurs financiers sont masqués car vos permissions actuelles ne donnent pas accès aux créances.",
    billed: en ? "Billed" : "Facturé",
    outstanding: en ? "Outstanding" : "À recevoir",
    basket: en ? "Average basket" : "Panier moyen",
    invoices: en ? "Invoices" : "Factures",
    stationHealth: en ? "Station availability" : "Disponibilité des postes",
  };

  return <ModuleWorkspace>
    <ModuleHeader eyebrow={copy.eyebrow} title={copy.title} description={`${en ? definition.descriptionEn : definition.descriptionFr} · ${organizationName}`} primaryAction={<Link className="inline-flex min-h-10 items-center rounded-xl bg-dtsc-primary px-4 py-2 text-sm font-black text-white" href="/enterprise-modules/GAMING_REPORTS">{en ? "Open reports" : "Ouvrir les rapports"}</Link>} />
    <ModuleToolbar controls={<div className="w-48"><NativeSelect value={periodDays} onChange={setPeriodDays} items={[{ id: "7", label: en ? "Last 7 days" : "7 derniers jours" }, { id: "30", label: en ? "Last 30 days" : "30 derniers jours" }, { id: "90", label: en ? "Last 90 days" : "90 derniers jours" }, { id: "365", label: en ? "Last 365 days" : "365 derniers jours" }]} /></div>} summary={snapshot ? `${copy.period}: ${snapshot.periodDays} ${en ? "days" : "jours"}` : undefined} />
    {error ? <ProfessionalError message={error} /> : loading || !snapshot ? <ProfessionalLoading /> : <>
      <ModuleMetrics>
        <ModuleMetric label={copy.stations} value={snapshot.operational.stationCount} icon={<Gamepad2 className="h-4 w-4" />} />
        <ModuleMetric label={copy.active} value={snapshot.operational.activeSessions} icon={<Activity className="h-4 w-4" />} />
        <ModuleMetric label={copy.hours} value={snapshot.operational.billableHours.toLocaleString(en ? "en-US" : "fr-FR", { maximumFractionDigits: 2 })} icon={<Timer className="h-4 w-4" />} />
        <ModuleMetric label={copy.occupancy} value={`${snapshot.operational.occupancyRate.toLocaleString(en ? "en-US" : "fr-FR", { maximumFractionDigits: 2 })}%`} />
        <ModuleMetric label={copy.noShow} value={`${snapshot.operational.noShowRate.toLocaleString(en ? "en-US" : "fr-FR", { maximumFractionDigits: 2 })}%`} />
        <ModuleMetric label={copy.tournaments} value={snapshot.operational.upcomingTournaments} icon={<Trophy className="h-4 w-4" />} />
      </ModuleMetrics>
      <ModuleContent>
        <ModuleSection title={copy.assets} description={en ? "Signals are read from the canonical Assets & maintenance domain." : "Ces signaux proviennent uniquement du domaine canonique Actifs & maintenance."} defaultOpen>
          {snapshot.assetSignals ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-dtsc-border p-4"><p className="text-xs font-black uppercase text-dtsc-muted">{en ? "Open incidents" : "Incidents ouverts"}</p><p className="mt-2 text-2xl font-black">{snapshot.assetSignals.incidentsOpen}</p></div>
            <div className="rounded-2xl border border-dtsc-border p-4"><p className="text-xs font-black uppercase text-dtsc-muted">{en ? "Critical incidents" : "Incidents critiques"}</p><p className="mt-2 text-2xl font-black">{snapshot.assetSignals.incidentsCritical}</p></div>
            <div className="rounded-2xl border border-dtsc-border p-4"><p className="text-xs font-black uppercase text-dtsc-muted">{en ? "Open maintenance" : "Maintenances ouvertes"}</p><p className="mt-2 text-2xl font-black">{snapshot.assetSignals.maintenanceOpen}</p></div>
            <div className="rounded-2xl border border-dtsc-border p-4"><p className="text-xs font-black uppercase text-dtsc-muted">{en ? "Overdue maintenance" : "Maintenances en retard"}</p><p className="mt-2 text-2xl font-black">{snapshot.assetSignals.maintenanceOverdue}</p></div>
          </div> : <EmptyState icon={<ShieldAlert className="h-5 w-5" />} title={copy.privacyAssets} />}
        </ModuleSection>
        <ModuleSection title={copy.finance} description={en ? "Currencies remain separate; no cross-currency total is calculated without an explicit FX basis." : "Les devises restent séparées : aucun total multidevise n’est calculé sans base de change explicite."} defaultOpen>
          {snapshot.financialByCurrency ? snapshot.financialByCurrency.length ? <div className="grid gap-3 lg:grid-cols-2">{snapshot.financialByCurrency.map((row) => <div key={row.currency} className="rounded-2xl border border-dtsc-border p-4"><div className="flex items-center justify-between gap-2"><p className="font-black">{row.currency}</p><StatusBadge tone="info">{row.invoiceCount} {copy.invoices.toLowerCase()}</StatusBadge></div><div className="mt-3 grid grid-cols-3 gap-3 text-sm"><div><p className="text-dtsc-muted">{copy.billed}</p><p className="font-black">{formatEnterpriseAmount(row.billedAmount, row.currency, locale)}</p></div><div><p className="text-dtsc-muted">{copy.outstanding}</p><p className="font-black">{formatEnterpriseAmount(row.outstandingAmount, row.currency, locale)}</p></div><div><p className="text-dtsc-muted">{copy.basket}</p><p className="font-black">{formatEnterpriseAmount(row.averageBasket, row.currency, locale)}</p></div></div></div>)}</div> : <EmptyState title={en ? "No financial data in this period." : "Aucune donnée financière sur cette période."} /> : <EmptyState title={copy.privacyFinance} />}
        </ModuleSection>
        <ModuleSection title={copy.stationHealth} description={en ? "Open the canonical asset record for maintenance and incident actions." : "Ouvrez l’actif canonique pour les actions de maintenance et d’incident."}>
          {snapshot.stations.length ? <div className="grid gap-2 md:grid-cols-2">{snapshot.stations.map((station) => <Link href={station.assetDeepLink} key={station.id} className="flex min-w-0 items-center justify-between gap-3 rounded-2xl border border-dtsc-border p-4 hover:bg-dtsc-surface-muted"><span className="min-w-0"><span className="block truncate font-black">{station.displayName || station.stationCode}</span><span className="text-xs text-dtsc-muted">{station.stationCode}</span></span><StatusBadge tone={station.status === "AVAILABLE" ? "success" : station.status === "MAINTENANCE" || station.status === "OUT_OF_SERVICE" ? "danger" : "info"}>{station.status.replaceAll("_", " ")}</StatusBadge></Link>)}</div> : <EmptyState title={en ? "No gaming station configured." : "Aucun poste Gaming configuré."} />}
        </ModuleSection>
      </ModuleContent>
    </>}
  </ModuleWorkspace>;
}
