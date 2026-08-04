"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Columns3, FileInput, List, Search, Send } from "lucide-react";
import { ActivityDetail } from "@/components/activities/activity-detail";
import { WorkPrestationsPanelV2 } from "@/components/activities/work-prestations-panel-v2";
import { BlockerDialog, ReportDialog, RequestDialog, WorkflowDialog } from "@/components/activities/activity-forms";
import { ActivityBusinessItem } from "@/components/activities/activity-list-item";
import type { ActivityItem, ActivitySection, CollaboratorOption } from "@/components/activities/activity-types";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToastMessage } from "@/components/ui/use-toast-message";
import { ContextualUserGuide } from "@/components/user-guides/contextual-user-guide";
import { BusinessList } from "@/components/workspace/business-list";
import { EmptyState } from "@/components/workspace/empty-state";
import { ModuleMetric, ModuleMetrics } from "@/components/workspace/module-metrics";
import { ModuleContent, ModuleHeader, ModuleSection, ModuleToolbar, ModuleWorkspace } from "@/components/workspace/module-workspace";
import { StatusBadge } from "@/components/workspace/status-badge";
import { ITERATION04_USER_GUIDES } from "@/lib/user-guides/iteration04-guides";

const PREVIEW_COUNT = 8;
const KANBAN_COLUMNS = [
  { id: "todo", label: "À faire", statuses: ["DRAFT", "TODO", "OPEN", "NEW", "SUBMITTED", "PENDING", "PLANNED", "REQUESTED"] },
  { id: "progress", label: "En cours", statuses: ["IN_PROGRESS", "PROCESSING", "ACTIVE", "ASSIGNED", "ANSWERED", "TREATED"] },
  { id: "blocked", label: "Bloqué / correction", statuses: ["BLOCKED", "CHANGES_REQUESTED", "ESCALATED", "ON_HOLD", "REJECTED"] },
  { id: "done", label: "Terminé", statuses: ["COMPLETED", "VALIDATED", "APPROVED", "RESOLVED", "CLOSED", "DONE", "CANCELLED", "CANCELED"] },
] as const;

type ViewMode = "list" | "kanban";

export function ActivitiesDashboardV2({
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
  const [query, setQuery] = useState("");
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("kanban");
  const [activeItem, setActiveItem] = useState<{ section: ActivitySection; item: ActivityItem } | null>(null);
  const [activeSection, setActiveSection] = useState<ActivitySection | null>(null);
  const [requestOpen, setRequestOpen] = useState(false);
  const [requestContext, setRequestContext] = useState<ActivityItem | null>(null);
  const [workflowOpen, setWorkflowOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [blockerOpen, setBlockerOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  useToastMessage(statusMessage);

  const businessSections = useMemo(() => sections.filter((section) => section.id !== "collaborator-forms"), [sections]);
  const filteredSections = useMemo(() => businessSections.map((section) => ({
    ...section,
    items: section.items.filter((item) => matchesFilters(item, query, dateStart, dateEnd)),
  })), [businessSections, dateEnd, dateStart, query]);
  const allVisibleItems = useMemo(() => filteredSections.flatMap((section) => section.items.map((item) => ({ section, item }))), [filteredSections]);
  const totalCount = useMemo(() => businessSections.reduce((sum, section) => sum + section.items.length, 0), [businessSections]);
  const visibleCount = allVisibleItems.length;
  const visibleCompleted = allVisibleItems.filter(({ item }) => KANBAN_COLUMNS[3].statuses.includes(normalizeStatus(item.status) as never)).length;
  const visibleBlocked = allVisibleItems.filter(({ item }) => KANBAN_COLUMNS[2].statuses.includes(normalizeStatus(item.status) as never)).length;

  function resetFilters() {
    setQuery("");
    setDateStart("");
    setDateEnd("");
  }

  function openRequest(item?: ActivityItem) {
    setRequestContext(item || null);
    setRequestOpen(true);
  }

  async function updateTask(item: ActivityItem, status: "IN_PROGRESS" | "COMPLETED") {
    const response = await fetch(`/api/activities/tasks/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    setStatusMessage(response.ok ? "Tâche mise à jour. La progression reste calculée depuis la checklist." : body?.message || "Mise à jour impossible.");
    if (response.ok) router.refresh();
  }

  function handleDone(message: string) {
    setStatusMessage(message);
    router.refresh();
  }

  return (
    <ModuleWorkspace>
      <ModuleHeader
        eyebrow="Espace collaborateur"
        title="Activités DTSC"
        count={`${totalCount} élément${totalCount > 1 ? "s" : ""}`}
        description="Pilotez vos tâches, opérations, demandes, réunions, rapports et prestations. Les transitions sont contrôlées côté serveur selon le destinataire ou le responsable explicite."
        secondaryActions={(
          <div className="flex flex-wrap gap-2">
            <ContextualUserGuide guide={ITERATION04_USER_GUIDES.DTSC_ACTIVITIES} compact />
            <Button type="button" variant="outline" onClick={() => setWorkflowOpen(true)} className="rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-blue">
              <FileInput className="h-4 w-4" /> Formulaires métier
            </Button>
          </div>
        )}
        primaryAction={(
          <Button type="button" onClick={() => openRequest()} className="rounded-xl bg-dtsc-blue text-white">
            <Send className="h-4 w-4" /> Formuler une demande
          </Button>
        )}
      />

      <ModuleMetrics label="Suivi opérationnel">
        <ModuleMetric label="Tâches ouvertes" value={dateStart || dateEnd || query ? Math.max(0, visibleCount - visibleCompleted) : metrics.openTasks} />
        <ModuleMetric label="Terminées / validées" value={dateStart || dateEnd || query ? visibleCompleted : metrics.completed} />
        <ModuleMetric label="Points bloqués" value={dateStart || dateEnd || query ? visibleBlocked : metrics.blocked} />
        <ModuleMetric label="Éléments visibles" value={visibleCount} hint={`sur ${totalCount}`} />
      </ModuleMetrics>

      <ModuleToolbar
        ariaLabel="Contrôles des activités DTSC"
        search={(
          <label className="relative block min-w-0">
            <span className="sr-only">Rechercher dans les activités DTSC</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dtsc-muted" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher une activité, un statut, un responsable…" className="h-11 w-full min-w-0 rounded-xl bg-dtsc-surface pl-10" />
          </label>
        )}
        controls={(
          <>
            <label className="grid min-w-[8.5rem] flex-1 gap-1 text-[0.68rem] font-black uppercase tracking-[0.08em] text-dtsc-muted sm:flex-none sm:min-w-[9.5rem]">Début<Input type="date" value={dateStart} onChange={(event) => setDateStart(event.target.value)} className="h-11 min-w-0 rounded-xl bg-dtsc-surface text-dtsc-ink" /></label>
            <label className="grid min-w-[8.5rem] flex-1 gap-1 text-[0.68rem] font-black uppercase tracking-[0.08em] text-dtsc-muted sm:flex-none sm:min-w-[9.5rem]">Fin<Input type="date" value={dateEnd} onChange={(event) => setDateEnd(event.target.value)} className="h-11 min-w-0 rounded-xl bg-dtsc-surface text-dtsc-ink" /></label>
            <div className="flex shrink-0 rounded-xl border border-dtsc-border bg-dtsc-surface p-1">
              <button type="button" onClick={() => setViewMode("list")} className={`inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-black ${viewMode === "list" ? "bg-cyan-400 text-[#001736]" : "text-dtsc-muted"}`}><List className="h-4 w-4" /> Liste</button>
              <button type="button" onClick={() => setViewMode("kanban")} className={`inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-black ${viewMode === "kanban" ? "bg-cyan-400 text-[#001736]" : "text-dtsc-muted"}`}><Columns3 className="h-4 w-4" /> Kanban</button>
            </div>
            {query || dateStart || dateEnd ? <Button type="button" variant="outline" onClick={resetFilters} className="h-11 rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-blue"><CalendarDays className="h-4 w-4" /> Réinitialiser</Button> : null}
          </>
        )}
        activeFilters={query || dateStart || dateEnd ? <span>{query ? `Recherche : “${query}”` : ""}{query && (dateStart || dateEnd) ? " · " : ""}{dateStart || dateEnd ? `Période : ${dateStart || "…"} → ${dateEnd || "…"}` : ""}</span> : <span>Aucun filtre actif</span>}
        summary={`${visibleCount}/${totalCount} élément${totalCount > 1 ? "s" : ""}`}
      />

      <ModuleContent>
        <WorkPrestationsPanelV2 locale={locale} />

        {viewMode === "kanban" ? (
          <ModuleSection title="Vue Kanban transverse" description="Les éléments de toutes les sections sont regroupés par état opérationnel. Ouvrez une carte pour accéder aux actions autorisées, commentaires et checklists." count={`${visibleCount}`}>
            <div className="flex min-w-0 gap-4 overflow-x-auto pb-3" aria-label="Kanban des activités DTSC">
              {KANBAN_COLUMNS.map((column) => {
                const cards = allVisibleItems.filter(({ item }) => columnForStatus(item.status) === column.id);
                return (
                  <section key={column.id} className="w-[min(86vw,22rem)] shrink-0 rounded-2xl border border-dtsc-border bg-dtsc-page p-3">
                    <div className="flex items-center justify-between gap-3"><h3 className="font-black text-dtsc-ink">{column.label}</h3><span className="rounded-full bg-cyan-400/15 px-2.5 py-1 text-xs font-black text-cyan-700">{cards.length}</span></div>
                    <div className="mt-3 max-h-[70dvh] space-y-3 overflow-y-auto pr-1">
                      {cards.map(({ section, item }) => <KanbanCard key={`${item.entityType}-${item.id}`} item={item} sectionTitle={section.title} onOpen={() => setActiveItem({ section, item })} />)}
                      {!cards.length ? <p className="rounded-xl border border-dashed border-dtsc-border p-4 text-center text-xs text-dtsc-muted">Aucun élément</p> : null}
                    </div>
                  </section>
                );
              })}
            </div>
          </ModuleSection>
        ) : filteredSections.map((section) => (
          <ModuleSection key={section.id} id={`activities-${section.id}`} title={section.title} description={section.description} count={`${section.items.length}`} action={sectionAction(section.id, { openRequest: () => openRequest(), openReport: () => setReportOpen(true), openBlocker: () => setBlockerOpen(true) })}>
            {section.items.length ? (
              <>
                <BusinessList ariaLabel={section.title}>
                  {section.items.slice(0, PREVIEW_COUNT).map((item) => (
                    <ActivityBusinessItem key={`${item.entityType}-${item.id}`} item={item} onOpen={() => setActiveItem({ section, item })} onCreateRelatedRequest={() => openRequest(item)} onTaskStatus={(status) => void updateTask(item, status)} />
                  ))}
                </BusinessList>
                {section.items.length > PREVIEW_COUNT ? <div className="mt-2 flex justify-end"><Button type="button" variant="ghost" onClick={() => setActiveSection(section)} className="rounded-xl text-dtsc-blue">Voir les {section.items.length} éléments</Button></div> : null}
              </>
            ) : <EmptyState compact title="Aucun contenu" description="Aucune activité ne correspond aux filtres dans cette section." />}
          </ModuleSection>
        ))}
      </ModuleContent>

      <Dialog open={Boolean(activeItem)} title={activeItem?.item.title || "Détail"} description={activeItem ? `${activeItem.section.title} · ${activeItem.item.status}` : ""} onClose={() => setActiveItem(null)} className="h-[94dvh] max-w-5xl">
        {activeItem ? <div className="min-h-0 overflow-y-auto pr-1"><ActivityDetail item={activeItem.item} collaborators={collaborators} currentUserId={currentUserId} currentUserRole={currentUserRole} onChanged={() => router.refresh()} /></div> : null}
      </Dialog>

      <Dialog open={Boolean(activeSection)} title={activeSection?.title || "Section"} description={activeSection?.description || ""} onClose={() => setActiveSection(null)} className="h-[94dvh] max-w-5xl">
        <div className="min-h-0 space-y-3 overflow-y-auto pr-1">{activeSection?.items.map((item) => <ActivityBusinessItem key={`${item.entityType}-${item.id}`} item={item} onOpen={() => setActiveItem({ section: activeSection, item })} onCreateRelatedRequest={() => openRequest(item)} onTaskStatus={(status) => void updateTask(item, status)} />)}</div>
      </Dialog>

      <RequestDialog open={requestOpen} onClose={() => { setRequestOpen(false); setRequestContext(null); }} collaborators={collaborators} relatedItem={requestContext} onDone={handleDone} />
      <WorkflowDialog open={workflowOpen} onClose={() => setWorkflowOpen(false)} collaborators={collaborators} operations={operations} onDone={handleDone} />
      <ReportDialog open={reportOpen} onClose={() => setReportOpen(false)} collaborators={collaborators} operations={operations} onDone={handleDone} />
      <BlockerDialog open={blockerOpen} onClose={() => setBlockerOpen(false)} operations={operations} onDone={handleDone} />
    </ModuleWorkspace>
  );
}

function KanbanCard({ item, sectionTitle, onOpen }: { item: ActivityItem; sectionTitle: string; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="block w-full min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface p-3 text-left transition hover:border-cyan-300">
      <div className="flex flex-wrap items-center gap-2"><StatusBadge>{item.status}</StatusBadge>{item.priority ? <StatusBadge>{item.priority}</StatusBadge> : null}{typeof item.progress === "number" ? <span className="rounded-full bg-cyan-400/15 px-2 py-1 text-xs font-black text-cyan-700">{item.progress}%</span> : null}</div>
      <h4 className="mt-3 break-words font-black text-dtsc-ink">{item.title}</h4>
      <p className="mt-2 line-clamp-2 text-xs leading-5 text-dtsc-muted">{item.detail || item.body}</p>
      <p className="mt-2 text-[0.68rem] font-black uppercase tracking-[0.1em] text-cyan-600">{sectionTitle}</p>
    </button>
  );
}

function matchesFilters(item: ActivityItem, query: string, dateStart: string, dateEnd: string) {
  const normalized = query.trim().toLocaleLowerCase();
  if (normalized && ![item.title, item.status, item.detail, item.body, item.entityType, item.priority].filter(Boolean).join(" ").toLocaleLowerCase().includes(normalized)) return false;
  const itemDate = item.date.slice(0, 10);
  if (dateStart && itemDate < dateStart) return false;
  if (dateEnd && itemDate > dateEnd) return false;
  return true;
}

function normalizeStatus(value: string) { return value.trim().toUpperCase().replaceAll(" ", "_").replaceAll("É", "E"); }
function columnForStatus(status: string) { const normalized = normalizeStatus(status); for (const column of KANBAN_COLUMNS) if ((column.statuses as readonly string[]).includes(normalized)) return column.id; return "todo"; }
function sectionAction(sectionId: string, actions: { openRequest: () => void; openReport: () => void; openBlocker: () => void }) { if (sectionId === "reports") return <Button type="button" variant="outline" onClick={actions.openReport} className="rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-blue">Nouveau rapport</Button>; if (sectionId === "blockers") return <Button type="button" variant="outline" onClick={actions.openBlocker} className="rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-blue">Signaler un blocage</Button>; if (sectionId === "collab-requests") return <Button type="button" variant="outline" onClick={actions.openRequest} className="rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-blue">Nouvelle demande</Button>; return undefined; }
