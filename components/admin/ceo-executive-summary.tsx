"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Eye, SlidersHorizontal } from "lucide-react";
import { InternalFullScreenSurface } from "@/components/admin/internal-full-screen-surface";
import { Input } from "@/components/ui/input";
import { ListControls } from "@/components/ui/list-controls";
import { ContextActions } from "@/components/workspace/context-actions";
import { BusinessList, BusinessListItem } from "@/components/workspace/business-list";
import { ModuleHeader, ModuleWorkspace } from "@/components/workspace/module-workspace";
import { useSmartList } from "@/lib/hooks/use-smart-list";

type CeoExecutiveMetric = { label: string; value: string | number; detail: string };
type CeoExecutiveGroup = { title: string; description: string; metrics: CeoExecutiveMetric[] };

export function CeoExecutiveSummary({ groups, dateStart, dateEnd, embedded = false }: { groups: CeoExecutiveGroup[]; dateStart?: string; dateEnd?: string; embedded?: boolean }) {
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [activeMetric, setActiveMetric] = useState<string | null>(null);
  const [groupFilter, setGroupFilter] = useState<string>("ALL");
  const getSearchText = useCallback((group: CeoExecutiveGroup) => [group.title, group.description, ...group.metrics.flatMap((metric) => [metric.label, metric.value, metric.detail])].join(" "), []);
  const visible = groupFilter === "ALL" ? groups : groups.filter((group) => group.title === groupFilter);
  const list = useSmartList({ items: visible, pageSize: 8, getSearchText });
  const chosen = groups.find((group) => group.title === activeGroup);
  const metricList = useSmartList({ items: chosen?.metrics || [], pageSize: 12, getSearchText: useCallback((metric: CeoExecutiveMetric) => `${metric.label} ${metric.value} ${metric.detail}`, []) });
  const metric = chosen?.metrics.find((item) => item.label === activeMetric);
  const closeGroup = useCallback(() => { setActiveGroup(null); setActiveMetric(null); }, []);
  const closeMetric = useCallback(() => setActiveMetric(null), []);
  const hasFilters = Boolean(dateStart || dateEnd);

  return <ModuleWorkspace>
    {!embedded ? <ModuleHeader eyebrow="Tableau de bord exécutif" title="Vue CEO consolidée" count={`${groups.length} domaines`} description="Synthèse financière et opérationnelle du CEO." /> : null}
    <form action="/admin" className="flex min-w-0 flex-wrap items-end gap-2 border-b border-dtsc-border pb-3">
      <input type="hidden" name="section" value="ceo" />
      <label className="grid min-w-0 flex-1 gap-1 text-xs font-bold text-dtsc-muted sm:max-w-48">Début<Input type="date" name="ceoStart" defaultValue={dateStart || ""} className="h-10 rounded-lg" /></label>
      <label className="grid min-w-0 flex-1 gap-1 text-xs font-bold text-dtsc-muted sm:max-w-48">Fin<Input type="date" name="ceoEnd" defaultValue={dateEnd || ""} className="h-10 rounded-lg" /></label>
      <button type="submit" className="inline-flex min-h-10 items-center rounded-lg bg-dtsc-blue px-4 text-xs font-black text-white">Appliquer</button>
      {hasFilters ? <Link href="/admin?section=ceo" className="inline-flex min-h-10 items-center rounded-lg border border-dtsc-border px-3 text-xs font-black text-dtsc-blue">Effacer</Link> : null}
    </form>
    <nav aria-label="Domaines du pilotage CEO" className="flex min-w-0 gap-1.5 overflow-x-auto py-1"><button type="button" aria-pressed={groupFilter === "ALL"} onClick={() => setGroupFilter("ALL")} className={`min-h-10 shrink-0 rounded-full border px-3 text-xs font-bold ${groupFilter === "ALL" ? "border-cyan-400 bg-cyan-400/15 text-dtsc-blue" : "border-dtsc-border text-dtsc-muted"}`}>Tous · {groups.length}</button>{groups.map((group) => <button key={group.title} type="button" aria-pressed={groupFilter === group.title} onClick={() => setGroupFilter(group.title)} className={`min-h-10 shrink-0 rounded-full border px-3 text-xs font-bold ${groupFilter === group.title ? "border-cyan-400 bg-cyan-400/15 text-dtsc-blue" : "border-dtsc-border text-dtsc-muted"}`}>{group.title} · {group.metrics.length}</button>)}</nav>
    <ListControls query={list.query} onQueryChange={list.setQuery} page={list.page} pageCount={list.pageCount} totalCount={list.totalCount} filteredCount={list.filteredCount} onPageChange={list.setPage} placeholder="Rechercher un domaine, un indicateur…" />
    <div className="divide-y divide-dtsc-border border-y border-dtsc-border" role="list">{list.paginatedItems.map((group) => <button key={group.title} type="button" role="listitem" onClick={() => setActiveGroup(group.title)} className="flex min-h-14 w-full min-w-0 items-center gap-2 px-2 text-left hover:bg-dtsc-soft"><SlidersHorizontal className="h-4 w-4 shrink-0 text-cyan-600" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-black text-dtsc-ink">{group.title}</span><span className="block truncate text-xs text-dtsc-muted">{group.description}</span></span><span className="text-xs font-bold text-dtsc-muted">{group.metrics.length}</span><ArrowUpRight className="h-4 w-4 text-dtsc-blue" /></button>)}</div>
    <InternalFullScreenSurface open={Boolean(chosen)} title={chosen?.title || "Domaine"} subtitle={chosen?.description} onClose={closeGroup} level={2}>
      {chosen ? <div className="min-w-0 space-y-3"><ListControls query={metricList.query} onQueryChange={metricList.setQuery} page={metricList.page} pageCount={metricList.pageCount} totalCount={metricList.totalCount} filteredCount={metricList.filteredCount} onPageChange={metricList.setPage} placeholder="Rechercher une mesure, une valeur…" /><BusinessList ariaLabel={`Indicateurs ${chosen.title}`}>{metricList.paginatedItems.map((item) => <BusinessListItem key={item.label} title={item.label} meta={String(item.value)} onOpen={() => setActiveMetric(item.label)} openLabel={`Voir ${item.label}`} className="!py-2" actions={<ContextActions label={`Actions ${item.label}`} actions={[{ id: "view", label: "Voir la fiche", icon: Eye, onSelect: () => setActiveMetric(item.label) }]} />} />)}</BusinessList></div> : null}
      <InternalFullScreenSurface open={Boolean(metric)} title={metric?.label || "Indicateur"} subtitle={chosen?.title} onClose={closeMetric} level={3}>{metric ? <div className="min-w-0 space-y-3 border-y border-dtsc-border py-4"><strong className="block break-words text-2xl font-black text-dtsc-ink">{metric.value}</strong><p className="text-sm leading-6 text-dtsc-muted">{metric.detail}</p><p className="text-xs text-dtsc-muted">Période : {dateStart || "origine"} → {dateEnd || "aujourd’hui"}</p></div> : null}</InternalFullScreenSurface>
    </InternalFullScreenSurface>
  </ModuleWorkspace>;
}
