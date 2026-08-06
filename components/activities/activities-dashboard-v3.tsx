"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightCircle, CalendarDays, CheckCircle2, Columns3, FileInput, List, PlayCircle, Send, SlidersHorizontal } from "lucide-react";
import { ActivityDetailV2 } from "@/components/activities/activity-detail-v2";
import { WorkPrestationsPanelV2 } from "@/components/activities/work-prestations-panel-v2";
import { BlockerDialog, ReportDialog, RequestDialog, WorkflowDialog } from "@/components/activities/activity-forms";
import { ActivityBusinessItem } from "@/components/activities/activity-list-item";
import type { ActivityItem, ActivitySection, CollaboratorOption } from "@/components/activities/activity-types";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ListControls } from "@/components/ui/list-controls";
import { useToastMessage } from "@/components/ui/use-toast-message";
import { ContextualUserGuide } from "@/components/user-guides/contextual-user-guide";
import { BusinessList } from "@/components/workspace/business-list";
import { EmptyState } from "@/components/workspace/empty-state";
import { ModuleMetric, ModuleMetrics } from "@/components/workspace/module-metrics";
import { ModuleContent, ModuleHeader, ModuleSection, ModuleToolbar, ModuleWorkspace } from "@/components/workspace/module-workspace";
import { StatusBadge } from "@/components/workspace/status-badge";
import { getQuickActivityStatusTransitions } from "@/lib/activity-status-workflow";
import { useSmartList } from "@/lib/hooks/use-smart-list";
import { ITERATION04_USER_GUIDES } from "@/lib/user-guides/iteration04-guides";
import { cn } from "@/lib/utils";

type ActivityEntry = { section: ActivitySection; item: ActivityItem };
type ViewMode = "list" | "kanban";
type GroupingKey = "status" | "priority" | "entityType" | "progress";

type GroupingOption = { key: GroupingKey; label: string };

const GROUPING_LABELS: Record<GroupingKey, string> = {
  status: "Statut",
  priority: "Priorité",
  entityType: "Type d’opération",
  progress: "Avancement",
};

export function ActivitiesDashboardV3({
  currentUserId,
  currentUserRole,
  locale,
  sections,
  collaborators,
  operations,
  metrics,
}: {
  currentUserId: string;
  currentUserRole: string;
  locale?: string | null;
  sections: ActivitySection[];
  collaborators: CollaboratorOption[];
  operations: CollaboratorOption[];
  metrics: { openTasks: number; completed: number; blocked: number };
}) {
  const router = useRouter();
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const [defaultViewMode, setDefaultViewMode] = useState<ViewMode>("kanban");
  const [sectionViews, setSectionViews] = useState<Record<string, ViewMode>>({});
  const [sectionGroupings, setSectionGroupings] = useState<Record<string, GroupingKey>>({});
  const [activeItem, setActiveItem] = useState<ActivityEntry | null>(null);
  const [requestOpen, setRequestOpen] = useState(false);
  const [requestContext, setRequestContext] = useState<ActivityItem | null>(null);
  const [workflowOpen, setWorkflowOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [blockerOpen, setBlockerOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  useToastMessage(statusMessage);

  const businessSections = useMemo(() => sections.filter((section) => section.id !== "collaborator-forms"), [sections]);
  const totalCount = useMemo(() => businessSections.reduce((sum, section) => sum + section.items.length, 0), [businessSections]);
  const dateFilteredEntries = useMemo(
    () => businessSections.flatMap((section) => section.items
      .filter((item) => matchesFilters(item, "", dateStart, dateEnd))
      .map((item) => ({ section, item }))),
    [businessSections, dateEnd, dateStart],
  );
  const getSearchText = useCallback((entry: ActivityEntry) => [
    entry.section.title,
    entry.item.title,
    entry.item.status,
    entry.item.detail,
    entry.item.body,
    entry.item.entityType,
    entry.item.priority,
  ].filter(Boolean).join(" "), []);
  const smartList = useSmartList<ActivityEntry>({
    items: dateFilteredEntries,
    pageSize: 48,
    getSearchText,
  });
  const visibleEntries = smartList.paginatedItems;
  const visibleSections = useMemo(() => businessSections.map((section) => ({
    ...section,
    items: visibleEntries.filter((entry) => entry.section.id === section.id).map((entry) => entry.item),
  })).filter((section) => section.items.length > 0), [businessSections, visibleEntries]);

  async function updateTask(item: ActivityItem, status: "IN_PROGRESS" | "COMPLETED") {
    const response = await fetch(`/api/activities/tasks/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    setStatusMessage(response.ok ? "Tâche mise à jour. La progression provient de la checklist." : body?.message || "Mise à jour impossible.");
    if (response.ok) router.refresh();
  }

  async function updateActivityStatus(item: ActivityItem, status: string) {
    const response = await fetch(`/api/activities/status-transitions/${item.entityType}/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const body = (await response.json().catch(() => null)) as { message?: string; unchanged?: boolean } | null;
    setStatusMessage(response.ok ? (body?.unchanged ? "Cette opération était déjà à ce statut." : "Opération actualisée dans Activités DTSC et Administration DTSC.") : body?.message || "Mise à jour impossible.");
    if (response.ok) router.refresh();
  }

  function openRequest(item?: ActivityItem) {
    setRequestContext(item || null);
    setRequestOpen(true);
  }

  function resetFilters() {
    smartList.setQuery("");
    smartList.setPage(1);
    setDateStart("");
    setDateEnd("");
  }

  function handleDone(message: string) {
    setStatusMessage(message);
    router.refresh();
  }

  function applyDefaultView(mode: ViewMode) {
    setDefaultViewMode(mode);
    setSectionViews(Object.fromEntries(businessSections.map((section) => [section.id, mode])));
  }

  return (
    <ModuleWorkspace>
      <ModuleHeader
        eyebrow="Espace collaborateur"
        title="Activités DTSC"
        count={`${totalCount} élément${totalCount > 1 ? "s" : ""}`}
        description="Chaque bloc dispose désormais de sa propre vue liste ou Kanban filtrable. Les transitions restent réservées aux personnes impliquées et mettent à jour la source de vérité utilisée dans Administration DTSC."
        secondaryActions={(
          <div className="flex flex-wrap gap-2">
            <ContextualUserGuide guide={ITERATION04_USER_GUIDES.DTSC_ACTIVITIES} compact />
            <Button type="button" variant="outline" onClick={() => setWorkflowOpen(true)} className="rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-blue"><FileInput className="h-4 w-4" /> Formulaires métier</Button>
          </div>
        )}
        primaryAction={<Button type="button" onClick={() => openRequest()} className="rounded-xl bg-dtsc-blue text-white"><Send className="h-4 w-4" /> Formuler une demande</Button>}
      />

      <ModuleMetrics label="Suivi opérationnel">
        <ModuleMetric label="Tâches ouvertes" value={metrics.openTasks} />
        <ModuleMetric label="Terminées / validées" value={metrics.completed} />
        <ModuleMetric label="Points bloqués" value={metrics.blocked} />
        <ModuleMetric label="Éléments filtrés" value={smartList.filteredCount} hint={`sur ${totalCount}`} />
      </ModuleMetrics>

      <ModuleToolbar
        ariaLabel="Contrôles des activités DTSC"
        controls={(
          <>
            <label className="grid min-w-[9rem] gap-1 text-[0.68rem] font-black uppercase tracking-[0.08em] text-dtsc-muted">Début<Input type="date" value={dateStart} onChange={(event) => { setDateStart(event.target.value); smartList.setPage(1); }} className="h-11 rounded-xl bg-dtsc-surface" /></label>
            <label className="grid min-w-[9rem] gap-1 text-[0.68rem] font-black uppercase tracking-[0.08em] text-dtsc-muted">Fin<Input type="date" value={dateEnd} onChange={(event) => { setDateEnd(event.target.value); smartList.setPage(1); }} className="h-11 rounded-xl bg-dtsc-surface" /></label>
            <div className="flex rounded-xl border border-dtsc-border bg-dtsc-surface p-1" aria-label="Vue par défaut des blocs">
              <button type="button" onClick={() => applyDefaultView("list")} className={cn("inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-black", defaultViewMode === "list" ? "bg-cyan-400 text-[#001736]" : "text-dtsc-muted")}><List className="h-4 w-4" /> Tout en liste</button>
              <button type="button" onClick={() => applyDefaultView("kanban")} className={cn("inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-black", defaultViewMode === "kanban" ? "bg-cyan-400 text-[#001736]" : "text-dtsc-muted")}><Columns3 className="h-4 w-4" /> Tout en Kanban</button>
            </div>
            {smartList.query || dateStart || dateEnd ? <Button type="button" variant="outline" onClick={resetFilters} className="h-11 rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-blue"><CalendarDays className="h-4 w-4" /> Réinitialiser</Button> : null}
          </>
        )}
        activeFilters={smartList.query || dateStart || dateEnd ? <span>{smartList.query ? `Recherche : “${smartList.query}”` : ""}{smartList.query && (dateStart || dateEnd) ? " · " : ""}{dateStart || dateEnd ? `Période : ${dateStart || "…"} → ${dateEnd || "…"}` : ""}</span> : <span>Aucun filtre actif</span>}
        summary={`${smartList.filteredCount}/${totalCount}`}
      />

      <ModuleContent>
        <ListControls
          query={smartList.query}
          onQueryChange={smartList.setQuery}
          page={smartList.page}
          pageCount={smartList.pageCount}
          totalCount={totalCount}
          filteredCount={smartList.filteredCount}
          placeholder="Rechercher une activité, un statut ou un responsable…"
          onPageChange={smartList.setPage}
        />
        <WorkPrestationsPanelV2 locale={locale} />
        {visibleSections.length ? visibleSections.map((section) => {
          const groupingOptions = groupingOptionsForSection(section);
          const grouping = sectionGroupings[section.id] || groupingOptions[0]?.key || "status";
          const viewMode = sectionViews[section.id] || defaultViewMode;
          return (
            <ModuleSection
              key={section.id}
              title={section.title}
              description={section.description}
              count={`${section.items.length}`}
              action={sectionAction(section.id, () => openRequest(), () => setReportOpen(true), () => setBlockerOpen(true))}
            >
              <ActivitySectionBoard
                section={section}
                viewMode={viewMode}
                grouping={grouping}
                groupingOptions={groupingOptions}
                onViewModeChange={(mode) => setSectionViews((current) => ({ ...current, [section.id]: mode }))}
                onGroupingChange={(key) => setSectionGroupings((current) => ({ ...current, [section.id]: key }))}
                onOpen={(item) => setActiveItem({ section, item })}
                onCreateRelatedRequest={openRequest}
                onTaskStatus={(item, status) => void updateTask(item, status)}
                onStatusTransition={(item, status) => void updateActivityStatus(item, status)}
              />
            </ModuleSection>
          );
        }) : <EmptyState compact title="Aucune activité" description="Aucune activité ne correspond aux filtres actifs." />}
      </ModuleContent>

      <Dialog open={Boolean(activeItem)} title={activeItem?.item.title || "Détail"} description={activeItem ? `${activeItem.section.title} · ${activeItem.item.status}` : ""} onClose={() => setActiveItem(null)} className="h-[94dvh] max-w-5xl">
        {activeItem ? <div className="min-h-0 overflow-y-auto pr-1"><ActivityDetailV2 item={activeItem.item} collaborators={collaborators} currentUserId={currentUserId} currentUserRole={currentUserRole} onChanged={() => router.refresh()} /></div> : null}
      </Dialog>

      <RequestDialog open={requestOpen} onClose={() => { setRequestOpen(false); setRequestContext(null); }} collaborators={collaborators} relatedItem={requestContext} onDone={handleDone} />
      <WorkflowDialog open={workflowOpen} onClose={() => setWorkflowOpen(false)} collaborators={collaborators} operations={operations} onDone={handleDone} />
      <ReportDialog open={reportOpen} onClose={() => setReportOpen(false)} collaborators={collaborators} operations={operations} onDone={handleDone} />
      <BlockerDialog open={blockerOpen} onClose={() => setBlockerOpen(false)} operations={operations} onDone={handleDone} />
    </ModuleWorkspace>
  );
}

function ActivitySectionBoard({
  section,
  viewMode,
  grouping,
  groupingOptions,
  onViewModeChange,
  onGroupingChange,
  onOpen,
  onCreateRelatedRequest,
  onTaskStatus,
  onStatusTransition,
}: {
  section: ActivitySection;
  viewMode: ViewMode;
  grouping: GroupingKey;
  groupingOptions: GroupingOption[];
  onViewModeChange: (mode: ViewMode) => void;
  onGroupingChange: (key: GroupingKey) => void;
  onOpen: (item: ActivityItem) => void;
  onCreateRelatedRequest: (item?: ActivityItem) => void;
  onTaskStatus: (item: ActivityItem, status: "IN_PROGRESS" | "COMPLETED") => void;
  onStatusTransition: (item: ActivityItem, status: string) => void;
}) {
  const columns = useMemo(() => buildColumns(section.items, grouping), [grouping, section.items]);
  return (
    <div className="min-w-0 space-y-4">
      <div className="flex min-w-0 flex-wrap items-end justify-between gap-3 rounded-2xl border border-dtsc-border bg-dtsc-page p-3">
        <div className="flex min-w-0 flex-wrap gap-2">
          <button type="button" onClick={() => onViewModeChange("list")} className={cn("inline-flex min-h-10 items-center gap-2 rounded-xl border px-3 text-xs font-black", viewMode === "list" ? "border-cyan-400 bg-cyan-400/15 text-cyan-800 dark:text-cyan-200" : "border-dtsc-border bg-dtsc-surface text-dtsc-muted")}><List className="h-4 w-4" /> Liste compacte</button>
          <button type="button" onClick={() => onViewModeChange("kanban")} className={cn("inline-flex min-h-10 items-center gap-2 rounded-xl border px-3 text-xs font-black", viewMode === "kanban" ? "border-cyan-400 bg-cyan-400/15 text-cyan-800 dark:text-cyan-200" : "border-dtsc-border bg-dtsc-surface text-dtsc-muted")}><Columns3 className="h-4 w-4" /> Kanban</button>
        </div>
        {viewMode === "kanban" ? (
          <label className="grid min-w-[12rem] gap-1 text-[0.68rem] font-black uppercase tracking-[0.08em] text-dtsc-muted">
            <span className="inline-flex items-center gap-1"><SlidersHorizontal className="h-3.5 w-3.5" /> Colonnes du Kanban</span>
            <select value={grouping} onChange={(event) => onGroupingChange(event.target.value as GroupingKey)} className="h-11 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-bold normal-case tracking-normal text-dtsc-ink">
              {groupingOptions.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
            </select>
          </label>
        ) : <p className="text-xs font-bold text-dtsc-muted">Résumé visuel compact · statut · priorité · avancement · actions</p>}
      </div>

      {viewMode === "list" ? (
        <BusinessList ariaLabel={section.title}>
          {section.items.map((item) => <ActivityBusinessItem key={`${item.entityType}-${item.id}`} item={item} onOpen={() => onOpen(item)} onCreateRelatedRequest={() => onCreateRelatedRequest(item)} onTaskStatus={(status) => onTaskStatus(item, status)} onStatusTransition={(status) => onStatusTransition(item, status)} />)}
        </BusinessList>
      ) : (
        <div className="flex min-w-0 gap-4 overflow-x-auto pb-3" aria-label={`Kanban ${section.title} par ${GROUPING_LABELS[grouping]}`}>
          {columns.map((column) => (
            <section key={column.id} className="w-[min(86vw,22rem)] shrink-0 rounded-2xl border border-dtsc-border bg-dtsc-page p-3">
              <div className="flex items-center justify-between gap-3"><h3 className="break-words font-black text-dtsc-ink">{column.label}</h3><span className="rounded-full bg-cyan-400/15 px-2.5 py-1 text-xs font-black text-cyan-700 dark:text-cyan-200">{column.items.length}</span></div>
              <div className="mt-3 max-h-[70dvh] space-y-3 overflow-y-auto pr-1">
                {column.items.map((item) => <KanbanCard key={`${item.entityType}-${item.id}`} item={item} onOpen={() => onOpen(item)} onTaskStatus={(status) => onTaskStatus(item, status)} onStatusTransition={(status) => onStatusTransition(item, status)} />)}
                {!column.items.length ? <p className="rounded-xl border border-dashed border-dtsc-border p-4 text-center text-xs text-dtsc-muted">Aucun élément</p> : null}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function KanbanCard({ item, onOpen, onTaskStatus, onStatusTransition }: { item: ActivityItem; onOpen: () => void; onTaskStatus: (status: "IN_PROGRESS" | "COMPLETED") => void; onStatusTransition: (status: string) => void }) {
  const isTask = item.entityType === "TASK";
  const quickTransitions = isTask ? [] : getQuickActivityStatusTransitions(item.entityType, item.status);
  return (
    <article className="rounded-xl border border-dtsc-border bg-dtsc-surface p-3">
      <button type="button" onClick={onOpen} className="block w-full text-left">
        <div className="flex flex-wrap gap-2"><StatusBadge>{formatBoardLabel(item.status)}</StatusBadge>{item.priority ? <StatusBadge>{formatBoardLabel(item.priority)}</StatusBadge> : null}{typeof item.progress === "number" ? <span className="rounded-full bg-cyan-400/15 px-2 py-1 text-xs font-black text-cyan-700 dark:text-cyan-200">{item.progress}%</span> : null}</div>
        <h4 className="mt-3 break-words font-black text-dtsc-ink">{item.title}</h4>
        <p className="mt-2 line-clamp-3 text-xs leading-5 text-dtsc-muted">{item.detail || item.body}</p>
      </button>
      {isTask && !["COMPLETED", "VALIDATED", "CANCELED"].includes(normalizeStatus(item.status)) ? (
        <div className="mt-3 flex flex-wrap gap-2 border-t border-dtsc-border pt-3">
          {normalizeStatus(item.status) !== "IN_PROGRESS" ? <Button type="button" size="sm" variant="outline" onClick={() => onTaskStatus("IN_PROGRESS")} className="h-9 rounded-xl"><PlayCircle className="h-4 w-4" /> Démarrer</Button> : null}
          <Button type="button" size="sm" onClick={() => onTaskStatus("COMPLETED")} className="h-9 rounded-xl bg-dtsc-blue text-white"><CheckCircle2 className="h-4 w-4" /> Terminer</Button>
        </div>
      ) : null}
      {!isTask && quickTransitions.length ? (
        <div className="mt-3 flex flex-wrap gap-2 border-t border-dtsc-border pt-3">
          {quickTransitions.map((status) => (
            <Button key={status} type="button" size="sm" variant="outline" onClick={() => onStatusTransition(status)} className="h-9 rounded-xl border-dtsc-border text-dtsc-blue">
              <ArrowRightCircle className="h-4 w-4" /> {formatBoardLabel(status)}
            </Button>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function groupingOptionsForSection(section: ActivitySection): GroupingOption[] {
  const options: GroupingKey[] = ["status"];
  if (section.items.some((item) => Boolean(item.priority))) options.push("priority");
  if (new Set(section.items.map((item) => item.entityType)).size > 1) options.push("entityType");
  if (section.items.some((item) => typeof item.progress === "number")) options.push("progress");
  return options.map((key) => ({ key, label: GROUPING_LABELS[key] }));
}

function buildColumns(items: ActivityItem[], grouping: GroupingKey) {
  const groups = new Map<string, ActivityItem[]>();
  for (const item of items) {
    const key = groupValue(item, grouping);
    groups.set(key, [...(groups.get(key) || []), item]);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => columnOrder(grouping, left) - columnOrder(grouping, right) || left.localeCompare(right, "fr"))
    .map(([id, groupedItems]) => ({ id, label: formatBoardLabel(id), items: groupedItems }));
}

function groupValue(item: ActivityItem, grouping: GroupingKey) {
  if (grouping === "priority") return item.priority || "NON_PRIORISE";
  if (grouping === "entityType") return item.entityType;
  if (grouping === "progress") {
    const progress = typeof item.progress === "number" ? item.progress : 0;
    if (progress >= 100) return "TERMINE_100";
    if (progress >= 75) return "AVANCE_75_99";
    if (progress >= 25) return "EN_COURS_25_74";
    return "DEMARRAGE_0_24";
  }
  return normalizeStatus(item.status) || "SANS_STATUT";
}

function columnOrder(grouping: GroupingKey, value: string) {
  if (grouping === "progress") return ["DEMARRAGE_0_24", "EN_COURS_25_74", "AVANCE_75_99", "TERMINE_100"].indexOf(value);
  if (grouping === "priority") return ["CRITICAL", "URGENT", "HIGH", "MEDIUM", "NORMAL", "LOW", "NON_PRIORISE"].indexOf(normalizeStatus(value));
  if (grouping === "status") {
    const status = normalizeStatus(value);
    const stages = [
      ["DRAFT", "NEW", "TODO", "OPEN", "PLANNED", "REQUESTED", "PENDING", "SUBMITTED"],
      ["ASSIGNED", "IN_PROGRESS", "PROCESSING", "ACTIVE", "ANSWERED", "TREATED"],
      ["BLOCKED", "CHANGES_REQUESTED", "ESCALATED", "ON_HOLD", "REJECTED", "PAST_DUE"],
      ["COMPLETED", "VALIDATED", "APPROVED", "RESOLVED", "CLOSED", "DONE", "PAID"],
      ["CANCELLED", "CANCELED", "EXPIRED"],
    ];
    const index = stages.findIndex((stage) => stage.includes(status));
    return index === -1 ? 10 : index;
  }
  return 0;
}

function formatBoardLabel(value: string) {
  const labels: Record<string, string> = {
    TERMINE_100: "Terminé · 100 %",
    AVANCE_75_99: "Avancé · 75–99 %",
    EN_COURS_25_74: "En cours · 25–74 %",
    DEMARRAGE_0_24: "Démarrage · 0–24 %",
    NON_PRIORISE: "Non priorisé",
  };
  return labels[value] || value.replaceAll("_", " ").toLocaleLowerCase("fr").replace(/^./, (letter) => letter.toLocaleUpperCase("fr"));
}

function normalizeSearch(value: string) { return value.toLocaleLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim(); }
function matchesFilters(item: ActivityItem, query: string, dateStart: string, dateEnd: string) { const normalized = normalizeSearch(query); if (normalized && !normalizeSearch([item.title, item.status, item.detail, item.body, item.entityType, item.priority].filter(Boolean).join(" ")).includes(normalized)) return false; const date = item.date.slice(0, 10); return (!dateStart || date >= dateStart) && (!dateEnd || date <= dateEnd); }
function normalizeStatus(value: string) { return value.trim().toUpperCase().replaceAll(" ", "_").replaceAll("É", "E"); }
function sectionAction(sectionId: string, openRequest: () => void, openReport: () => void, openBlocker: () => void) { if (sectionId === "reports") return <Button type="button" variant="outline" onClick={openReport} className="rounded-xl">Nouveau rapport</Button>; if (sectionId === "blockers") return <Button type="button" variant="outline" onClick={openBlocker} className="rounded-xl">Signaler un blocage</Button>; if (sectionId === "collab-requests") return <Button type="button" variant="outline" onClick={openRequest} className="rounded-xl">Nouvelle demande</Button>; return undefined; }
