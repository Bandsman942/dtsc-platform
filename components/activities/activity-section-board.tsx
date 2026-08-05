"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Columns3, List, Search } from "lucide-react";
import { ActivityBusinessItem } from "@/components/activities/activity-list-item";
import type { ActivityItem, ActivitySection } from "@/components/activities/activity-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BusinessList } from "@/components/workspace/business-list";
import { EmptyState } from "@/components/workspace/empty-state";
import { ModuleSection } from "@/components/workspace/module-workspace";
import { StatusBadge } from "@/components/workspace/status-badge";

export type ActivityBoardAxis = "status" | "priority" | "entityType" | "progress";

type Props = {
  section: ActivitySection;
  defaultAxis?: ActivityBoardAxis;
  action?: ReactNode;
  onOpen: (item: ActivityItem) => void;
  onCreateRelatedRequest: (item: ActivityItem) => void;
  onTaskStatus: (item: ActivityItem, status: "IN_PROGRESS" | "COMPLETED") => void;
};

const AXIS_LABELS: Record<ActivityBoardAxis, string> = {
  status: "Statut",
  priority: "Priorité",
  entityType: "Type d’opération",
  progress: "Avancement",
};

export function ActivitySectionBoard({ section, defaultAxis = "status", action, onOpen, onCreateRelatedRequest, onTaskStatus }: Props) {
  const [view, setView] = useState<"kanban" | "list">("kanban");
  const [axis, setAxis] = useState<ActivityBoardAxis>(defaultAxis);
  const [query, setQuery] = useState("");
  const filteredItems = useMemo(() => {
    const normalized = normalize(query);
    if (!normalized) return section.items;
    return section.items.filter((item) => normalize([item.title, item.status, item.detail, item.body, item.priority, item.entityType].filter(Boolean).join(" ")).includes(normalized));
  }, [query, section.items]);
  const columns = useMemo(() => buildColumns(filteredItems, axis), [axis, filteredItems]);

  return (
    <ModuleSection
      id={`activity-${section.id}`}
      title={section.title}
      description={section.description}
      count={`${filteredItems.length}/${section.items.length}`}
      action={action}
    >
      <div className="min-w-0 space-y-4">
        <div data-responsive-actions className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-[minmax(14rem,1fr)_auto_auto]">
          <label className="relative min-w-0">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dtsc-muted" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Filtrer ${section.title.toLocaleLowerCase("fr-FR")}…`} className="h-11 min-w-0 rounded-xl bg-dtsc-page pl-9" />
          </label>
          <label className="flex min-w-0 items-center gap-2 rounded-xl border border-dtsc-border bg-dtsc-page px-3 text-xs font-black text-dtsc-muted">
            Regrouper par
            <select value={axis} onChange={(event) => setAxis(event.target.value as ActivityBoardAxis)} className="h-9 min-w-0 flex-1 border-0 bg-transparent text-sm font-black text-dtsc-ink outline-none">
              {Object.entries(AXIS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-2 rounded-xl border border-dtsc-border bg-dtsc-page p-1">
            <Button type="button" size="sm" variant={view === "kanban" ? "default" : "ghost"} onClick={() => setView("kanban")} className="rounded-lg"><Columns3 className="h-4 w-4" />Kanban</Button>
            <Button type="button" size="sm" variant={view === "list" ? "default" : "ghost"} onClick={() => setView("list")} className="rounded-lg"><List className="h-4 w-4" />Liste</Button>
          </div>
        </div>

        {!filteredItems.length ? <EmptyState compact title="Aucune donnée" description="Aucun élément ne correspond au filtre de ce bloc." /> : view === "list" ? (
          <BusinessList ariaLabel={`${section.title} en liste compacte`}>
            {filteredItems.map((item) => (
              <ActivityBusinessItem
                key={`${item.entityType}-${item.id}`}
                item={item}
                onOpen={() => onOpen(item)}
                onCreateRelatedRequest={() => onCreateRelatedRequest(item)}
                onTaskStatus={(status) => onTaskStatus(item, status)}
              />
            ))}
          </BusinessList>
        ) : (
          <div className="flex min-w-0 max-w-full gap-4 overflow-x-auto pb-3" aria-label={`${section.title} en Kanban par ${AXIS_LABELS[axis]}`}>
            {columns.map((column) => (
              <section key={column.key} className="w-[min(86vw,22rem)] shrink-0 rounded-2xl border border-dtsc-border bg-dtsc-page p-3">
                <div className="flex min-w-0 items-center justify-between gap-3">
                  <h3 className="min-w-0 break-words font-black text-dtsc-ink">{column.label}</h3>
                  <span className="shrink-0 rounded-full bg-cyan-400/15 px-2.5 py-1 text-xs font-black text-cyan-700 dark:text-cyan-200">{column.items.length}</span>
                </div>
                <div className="mt-3 max-h-[68dvh] space-y-3 overflow-y-auto pr-1">
                  {column.items.map((item) => (
                    <article key={`${item.entityType}-${item.id}`} className="min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface p-3">
                      <button type="button" onClick={() => onOpen(item)} className="block w-full min-w-0 text-left">
                        <div className="flex flex-wrap gap-2"><StatusBadge>{humanLabel(item.status || "Non défini")}</StatusBadge>{item.priority ? <StatusBadge>{humanLabel(item.priority)}</StatusBadge> : null}</div>
                        <h4 className="mt-3 break-words font-black text-dtsc-ink">{item.title}</h4>
                        <p className="mt-2 line-clamp-3 break-words text-xs leading-5 text-dtsc-muted">{item.detail || item.body || "Ouvrir pour consulter les informations."}</p>
                        {typeof item.progress === "number" ? <div className="mt-3"><div className="h-1.5 overflow-hidden rounded-full bg-dtsc-soft"><div className="h-full rounded-full bg-cyan-500" style={{ width: `${Math.max(0, Math.min(item.progress, 100))}%` }} /></div><p className="mt-1 text-[0.68rem] font-black text-cyan-700 dark:text-cyan-200">{item.progress}%</p></div> : null}
                      </button>
                      <CardActions item={item} onOpen={() => onOpen(item)} onTaskStatus={(status) => onTaskStatus(item, status)} />
                    </article>
                  ))}
                  {!column.items.length ? <p className="rounded-xl border border-dashed border-dtsc-border p-4 text-center text-xs text-dtsc-muted">Aucun élément</p> : null}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </ModuleSection>
  );
}

function CardActions({ item, onOpen, onTaskStatus }: { item: ActivityItem; onOpen: () => void; onTaskStatus: (status: "IN_PROGRESS" | "COMPLETED") => void }) {
  const normalized = normalizeKey(item.status || "");
  return (
    <div data-responsive-actions className="mt-3 flex flex-wrap gap-2 border-t border-dtsc-border pt-3">
      <Button type="button" size="sm" variant="outline" onClick={onOpen} className="rounded-lg">Ouvrir</Button>
      {item.entityType === "TASK" && !["IN_PROGRESS", "COMPLETED", "VALIDATED", "CANCELED", "CANCELLED"].includes(normalized) ? <Button type="button" size="sm" variant="outline" onClick={() => onTaskStatus("IN_PROGRESS")} className="rounded-lg">Démarrer</Button> : null}
      {item.entityType === "TASK" && !["COMPLETED", "VALIDATED", "CANCELED", "CANCELLED"].includes(normalized) ? <Button type="button" size="sm" onClick={() => onTaskStatus("COMPLETED")} className="rounded-lg bg-dtsc-blue text-white">Terminer</Button> : null}
    </div>
  );
}

function buildColumns(items: ActivityItem[], axis: ActivityBoardAxis) {
  const groups = new Map<string, ActivityItem[]>();
  for (const item of items) {
    const raw = axis === "status" ? item.status : axis === "priority" ? item.priority : axis === "entityType" ? item.entityType : progressBucket(item.progress);
    const key = normalizeKey(raw || "NON_DEFINI");
    groups.set(key, [...(groups.get(key) || []), item]);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => orderFor(axis, left) - orderFor(axis, right) || left.localeCompare(right, "fr"))
    .map(([key, groupedItems]) => ({ key, label: humanLabel(key), items: groupedItems }));
}

function progressBucket(progress?: number) {
  if (typeof progress !== "number") return "NON_DEFINI";
  if (progress >= 100) return "TERMINE_100";
  if (progress >= 75) return "AVANCE_75_99";
  if (progress >= 25) return "EN_COURS_25_74";
  return "DEMARRAGE_0_24";
}

function orderFor(axis: ActivityBoardAxis, value: string) {
  const orders: Record<string, number> = axis === "status" ? {
    DRAFT: 10, TODO: 11, OPEN: 12, NEW: 13, SUBMITTED: 20, PENDING: 21, PLANNED: 22, IN_PROGRESS: 30, PROCESSING: 31, ACTIVE: 32, BLOCKED: 40, CHANGES_REQUESTED: 41, REJECTED: 42, COMPLETED: 50, VALIDATED: 51, APPROVED: 52, RESOLVED: 53, CLOSED: 54, CANCELED: 60, CANCELLED: 60,
  } : axis === "priority" ? { CRITICAL: 10, URGENT: 11, HIGH: 20, MEDIUM: 30, NORMAL: 31, LOW: 40, NON_DEFINI: 90 } : axis === "progress" ? { DEMARRAGE_0_24: 10, EN_COURS_25_74: 20, AVANCE_75_99: 30, TERMINE_100: 40, NON_DEFINI: 90 } : {};
  return orders[value] ?? 70;
}

function normalize(value: string) { return value.toLocaleLowerCase("fr-FR").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim(); }
function normalizeKey(value: string) { return value.trim().toUpperCase().replaceAll(" ", "_").normalize("NFD").replace(/[\u0300-\u036f]/g, ""); }
function humanLabel(value: string) { return value.replaceAll("_", " ").toLocaleLowerCase("fr-FR").replace(/(^|\s)\S/g, (letter) => letter.toLocaleUpperCase("fr-FR")); }
