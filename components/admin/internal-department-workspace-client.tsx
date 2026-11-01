"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import { ArrowUpRight, Layers3, SlidersHorizontal } from "lucide-react";
import { InternalFullScreenSurface } from "@/components/admin/internal-full-screen-surface";
import { ListControls } from "@/components/ui/list-controls";
import { useSmartList } from "@/lib/hooks/use-smart-list";

type Section = { id: string; title: string; content: ReactNode };
type SectionGroup = "approval" | "finance" | "overview" | "operations";

function groupOf(id: string): SectionGroup {
  if (id.includes("approvals")) return "approval";
  if (["payroll", "invoices", "treasury"].includes(id)) return "finance";
  if (id.includes("executive") || id.includes("overview")) return "overview";
  return "operations";
}

const groups: Array<{ value: SectionGroup; fr: string; en: string }> = [
  { value: "approval", fr: "Validations", en: "Approvals" },
  { value: "finance", fr: "Finance & RH", en: "Finance & HR" },
  { value: "overview", fr: "Synthèses", en: "Overviews" },
  { value: "operations", fr: "Opérations", en: "Operations" },
];

export function InternalDepartmentWorkspaceClient({ sections, navigationLabel, locale }: { sections: Section[]; navigationLabel: string; locale?: string | null }) {
  const en = locale === "en";
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [group, setGroup] = useState<SectionGroup | "all">("all");
  const visible = useMemo(() => group === "all" ? sections : sections.filter((item) => groupOf(item.id) === group), [group, sections]);
  const getSearchText = useCallback((item: Section) => `${item.title} ${item.id} ${groupOf(item.id)}`, []);
  const list = useSmartList({ items: visible, pageSize: 8, getSearchText });
  const availableGroups = groups.filter((item) => sections.some((section) => groupOf(section.id) === item.value));
  const close = useCallback(() => setActiveSection(null), []);

  return (
    <div data-console-internal-workspace className="min-w-0 max-w-full space-y-3">
      <div className="flex min-w-0 items-center justify-between gap-2 border-b border-dtsc-border pb-2">
        <h2 className="flex min-w-0 items-center gap-2 truncate text-sm font-black text-dtsc-ink"><SlidersHorizontal className="h-4 w-4 shrink-0 text-cyan-500" />{navigationLabel}</h2>
        <span className="shrink-0 text-xs font-bold tabular-nums text-dtsc-muted">{sections.length} {en ? "sections" : `section${sections.length > 1 ? "s" : ""}`}</span>
      </div>
      <nav aria-label={navigationLabel} className="flex max-w-full gap-1.5 overflow-x-auto pb-2 [scrollbar-width:thin]">
        <button type="button" onClick={() => setGroup("all")} aria-pressed={group === "all"} className={`min-h-11 shrink-0 rounded-full border px-3 text-xs font-black ${group === "all" ? "border-cyan-400 bg-cyan-400/15 text-dtsc-blue" : "border-dtsc-border text-dtsc-muted"}`}>{en ? "All" : "Toutes"} · {sections.length}</button>
        {availableGroups.map((item) => <button key={item.value} type="button" onClick={() => setGroup(item.value)} aria-pressed={group === item.value} className={`min-h-11 shrink-0 rounded-full border px-3 text-xs font-black ${group === item.value ? "border-cyan-400 bg-cyan-400/15 text-dtsc-blue" : "border-dtsc-border text-dtsc-muted"}`}>{en ? item.en : item.fr} · {sections.filter((section) => groupOf(section.id) === item.value).length}</button>)}
      </nav>
      <ListControls query={list.query} onQueryChange={list.setQuery} page={list.page} pageCount={list.pageCount} totalCount={list.totalCount} filteredCount={list.filteredCount} onPageChange={list.setPage} placeholder={en ? "Search a section or department…" : "Rechercher une section, un métier…"} />
      {list.paginatedItems.length ? (
        <div className="divide-y divide-dtsc-border border-y border-dtsc-border">
          {list.paginatedItems.map((item) => (
            <button key={item.id} type="button" onClick={() => setActiveSection(item.id)} aria-label={en ? `Open ${item.title} full screen` : `Ouvrir ${item.title} en plein écran`} className="group flex min-h-14 w-full min-w-0 items-center gap-3 px-2 py-2 text-left transition hover:bg-dtsc-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-cyan-400/10 text-cyan-600"><Layers3 className="h-4 w-4" /></span>
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-black text-dtsc-ink">{item.title}</span><span className="block text-[0.7rem] text-dtsc-muted">{en ? groups.find((entry) => entry.value === groupOf(item.id))?.en : groups.find((entry) => entry.value === groupOf(item.id))?.fr}</span></span>
              <span className="shrink-0 text-xs font-bold text-dtsc-blue">{en ? "Open" : "Ouvrir"}</span><ArrowUpRight className="h-4 w-4 shrink-0 text-dtsc-blue" />
            </button>
          ))}
        </div>
      ) : <p className="py-5 text-sm text-dtsc-muted">{en ? "No section matches your filters." : "Aucune section ne correspond aux filtres."}</p>}
      {sections.map((item) => (
        <InternalFullScreenSurface key={item.id} open={activeSection === item.id} onClose={close} title={item.title} subtitle="Console DTSC · Design 2.0" level={1}>
          <section id={`department-${item.id}`} data-console-department-section aria-labelledby={`department-${item.id}-title`} className="min-w-0 max-w-full">
            <h3 id={`department-${item.id}-title`} className="sr-only">{item.title}</h3>
            {item.content}
          </section>
        </InternalFullScreenSurface>
      ))}
    </div>
  );
}
