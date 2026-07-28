"use client";

import { useCallback, useMemo, useState } from "react";
import { CalendarDays, CircleAlert, ClipboardList, FileInput, FileText, GitBranch, Search, Send, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { ActivityDetail } from "@/components/activities/activity-detail";
import { BlockerDialog, ReportDialog, RequestDialog, WorkflowDialog } from "@/components/activities/activity-forms";
import { ActivityBusinessItem } from "@/components/activities/activity-list-item";
import type { ActivityItem, ActivitySection, CollaboratorOption } from "@/components/activities/activity-types";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ListControls } from "@/components/ui/list-controls";
import { useToastMessage } from "@/components/ui/use-toast-message";
import { BusinessList } from "@/components/workspace/business-list";
import { EmptyState } from "@/components/workspace/empty-state";
import { ModuleMetric, ModuleMetrics } from "@/components/workspace/module-metrics";
import { ModuleContent, ModuleHeader, ModuleSection, ModuleToolbar, ModuleWorkspace } from "@/components/workspace/module-workspace";
import { useSmartList } from "@/lib/hooks/use-smart-list";

const PREVIEW_COUNT = 6;

export function ActivitiesDashboard({
  currentUserId,
  currentUserRole,
  sections,
  collaborators,
  operations,
  metrics,
}: {
  currentUserId: string;
  currentUserRole: string;
  sections: ActivitySection[];
  collaborators: CollaboratorOption[];
  operations: CollaboratorOption[];
  metrics: { openTasks: number; completed: number; blocked: number };
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const [activeSection, setActiveSection] = useState<{ section: ActivitySection; initialItem?: ActivityItem } | null>(null);
  const [requestOpen, setRequestOpen] = useState(false);
  const [requestContext, setRequestContext] = useState<ActivityItem | null>(null);
  const [workflowOpen, setWorkflowOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [blockerOpen, setBlockerOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  useToastMessage(statusMessage);

  const businessSections = useMemo(() => sections.filter((section) => section.id !== "collaborator-forms"), [sections]);
  const totalCount = useMemo(() => businessSections.reduce((sum, section) => sum + section.items.length, 0), [businessSections]);
  const filteredSections = useMemo(() => businessSections.map((section) => ({
    ...section,
    items: section.items.filter((item) => matchesFilters(item, query, dateStart, dateEnd)),
  })), [businessSections, dateEnd, dateStart, query]);
  const visibleCount = useMemo(() => filteredSections.reduce((sum, section) => sum + section.items.length, 0), [filteredSections]);
  const hasFilters = Boolean(query.trim() || dateStart || dateEnd);
  const hasAnyVisibleItem = visibleCount > 0;

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
      body: JSON.stringify({ status, progress: status === "IN_PROGRESS" ? item.progress || 10 : 100 }),
    });
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    setStatusMessage(response.ok ? "Tâche mise à jour." : body?.message || "Mise à jour impossible.");
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
        count={`${totalCount} élément(s)`}
        description="Pilotez les tâches, opérations, demandes, réunions, rapports et suivis qui vous concernent sans multiplier les conteneurs visuels."
        secondaryActions={
          <Button type="button" variant="outline" onClick={() => setWorkflowOpen(true)} className="rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-blue">
            <FileInput className="h-4 w-4" />
            <span className="hidden sm:inline">Formulaires métier</span>
            <span className="sm:hidden">Formulaires</span>
          </Button>
        }
        primaryAction={
          <Button type="button" onClick={() => openRequest()} className="rounded-xl bg-dtsc-blue text-white">
            <Send className="h-4 w-4" />
            <span className="hidden sm:inline">Formuler une demande</span>
            <span className="sm:hidden">Demande</span>
          </Button>
        }
      />

      <ModuleMetrics label="Suivi opérationnel">
        <ModuleMetric label="Tâches ouvertes" value={metrics.openTasks} />
        <ModuleMetric label="Terminées / validées" value={metrics.completed} />
        <ModuleMetric label="Points bloqués" value={metrics.blocked} />
        <ModuleMetric label="Éléments visibles" value={visibleCount} hint={hasFilters ? `sur ${totalCount}` : "dans votre périmètre"} />
      </ModuleMetrics>

      <ModuleToolbar
        search={
          <div className="relative min-w-0">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dtsc-muted" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher une activité, un statut, un responsable..." className="h-11 w-full min-w-0 rounded-xl bg-dtsc-surface pl-10" />
          </div>
        }
        controls={
          <>
            <label className="grid min-w-[9.5rem] gap-1 text-[0.68rem] font-black uppercase tracking-[0.08em] text-dtsc-muted">
              Début
              <Input type="date" value={dateStart} onChange={(event) => setDateStart(event.target.value)} className="h-11 rounded-xl bg-dtsc-surface text-dtsc-ink" />
            </label>
            <label className="grid min-w-[9.5rem] gap-1 text-[0.68rem] font-black uppercase tracking-[0.08em] text-dtsc-muted">
              Fin
              <Input type="date" value={dateEnd} onChange={(event) => setDateEnd(event.target.value)} className="h-11 rounded-xl bg-dtsc-surface text-dtsc-ink" />
            </label>
            {hasFilters ? <Button type="button" variant="outline" onClick={resetFilters} className="h-11 rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-blue"><CalendarDays className="h-4 w-4" />Réinitialiser</Button> : null}
          </>
        }
        activeFilters={hasFilters ? <span>{query.trim() ? `Recherche : “${query.trim()}”` : ""}{query.trim() && (dateStart || dateEnd) ? " · " : ""}{dateStart || dateEnd ? `Période : ${dateStart || "…"} → ${dateEnd || "…"}` : ""}</span> : <span>Aucun filtre actif</span>}
        summary={`${visibleCount}/${totalCount} élément(s)`}
      />

      <ModuleContent>
        {!hasAnyVisibleItem && hasFilters ? (
          <EmptyState title="Aucun résultat" description="Aucune activité ne correspond à la recherche ou à la période sélectionnée." action={<Button type="button" variant="outline" onClick={resetFilters} className="rounded-xl border-dtsc-border">Réinitialiser les filtres</Button>} />
        ) : (
          filteredSections.map((section) => (
            <ActivitySectionBlock
              key={section.id}
              section={section}
              onOpen={(item) => setActiveSection({ section, initialItem: item })}
              onOpenAll={() => setActiveSection({ section })}
              onCreateRelatedRequest={openRequest}
              onTaskStatus={(item, status) => void updateTask(item, status)}
              sectionAction={sectionAction(section.id, {
                openRequest: () => openRequest(),
                openReport: () => setReportOpen(true),
                openBlocker: () => setBlockerOpen(true),
              })}
            />
          ))
        )}
      </ModuleContent>

      {activeSection ? (
        <SectionDialog
          section={activeSection.section}
          initialItem={activeSection.initialItem}
          onClose={() => setActiveSection(null)}
          collaborators={collaborators}
          currentUserId={currentUserId}
          currentUserRole={currentUserRole}
          onCreateRelatedRequest={(item) => openRequest(item)}
          onTaskStatus={(item, status) => void updateTask(item, status)}
          onChanged={() => router.refresh()}
        />
      ) : null}

      <RequestDialog open={requestOpen} onClose={() => { setRequestOpen(false); setRequestContext(null); }} collaborators={collaborators} relatedItem={requestContext} onDone={handleDone} />
      <WorkflowDialog open={workflowOpen} onClose={() => setWorkflowOpen(false)} collaborators={collaborators} operations={operations} onDone={handleDone} />
      <ReportDialog open={reportOpen} onClose={() => setReportOpen(false)} collaborators={collaborators} operations={operations} onDone={handleDone} />
      <BlockerDialog open={blockerOpen} onClose={() => setBlockerOpen(false)} operations={operations} onDone={handleDone} />
    </ModuleWorkspace>
  );
}

function ActivitySectionBlock({
  section,
  onOpen,
  onOpenAll,
  onCreateRelatedRequest,
  onTaskStatus,
  sectionAction: action,
}: {
  section: ActivitySection;
  onOpen: (item: ActivityItem) => void;
  onOpenAll: () => void;
  onCreateRelatedRequest: (item: ActivityItem) => void;
  onTaskStatus: (item: ActivityItem, status: "IN_PROGRESS" | "COMPLETED") => void;
  sectionAction?: React.ReactNode;
}) {
  const previewItems = section.items.slice(0, PREVIEW_COUNT);
  return (
    <ModuleSection id={`activities-${section.id}`} title={section.title} description={section.description} count={`${section.items.length} élément(s)`} action={action}>
      {section.items.length ? (
        <>
          <BusinessList ariaLabel={section.title}>
            {previewItems.map((item) => <ActivityBusinessItem key={`${item.entityType}-${item.id}`} item={item} onOpen={() => onOpen(item)} onCreateRelatedRequest={() => onCreateRelatedRequest(item)} onTaskStatus={(status) => onTaskStatus(item, status)} />)}
          </BusinessList>
          {section.items.length > PREVIEW_COUNT ? <div className="mt-2 flex justify-end"><Button type="button" variant="ghost" onClick={onOpenAll} className="rounded-xl text-dtsc-blue">Voir les {section.items.length} éléments</Button></div> : null}
        </>
      ) : (
        <EmptyState compact title="Aucun contenu" description="Aucune activité enregistrée dans cette section pour le filtre actuel." />
      )}
    </ModuleSection>
  );
}

function SectionDialog({
  section,
  initialItem,
  onClose,
  collaborators,
  currentUserId,
  currentUserRole,
  onCreateRelatedRequest,
  onTaskStatus,
  onChanged,
}: {
  section: ActivitySection;
  initialItem?: ActivityItem;
  onClose: () => void;
  collaborators: CollaboratorOption[];
  currentUserId: string;
  currentUserRole: string;
  onCreateRelatedRequest: (item: ActivityItem) => void;
  onTaskStatus: (item: ActivityItem, status: "IN_PROGRESS" | "COMPLETED") => void;
  onChanged: () => void;
}) {
  const [selected, setSelected] = useState<ActivityItem | null>(initialItem || section.items[0] || null);
  const [detailOpen, setDetailOpen] = useState(Boolean(initialItem));
  const getSearchText = useCallback((item: ActivityItem) => [item.title, item.status, item.detail, item.body, item.priority].join(" "), []);
  const list = useSmartList({ items: section.items, pageSize: 10, getSearchText });

  return (
    <Dialog open title={section.title} description={section.description} onClose={onClose} className="h-[92dvh] max-w-6xl">
      <div className="grid min-h-0 gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className={`min-w-0 ${detailOpen ? "hidden lg:block" : "block"}`}>
          <ListControls query={list.query} onQueryChange={list.setQuery} page={list.page} pageCount={list.pageCount} totalCount={list.totalCount} filteredCount={list.filteredCount} placeholder="Rechercher dans cette section..." onPageChange={list.setPage} />
          {list.paginatedItems.length ? <BusinessList ariaLabel={`Liste ${section.title}`} className="max-h-[60dvh] overflow-y-auto pr-1 lg:max-h-[58vh]">{list.paginatedItems.map((item) => <ActivityBusinessItem key={`${item.entityType}-${item.id}`} item={item} onOpen={() => { setSelected(item); setDetailOpen(true); }} onCreateRelatedRequest={() => onCreateRelatedRequest(item)} onTaskStatus={(status) => onTaskStatus(item, status)} />)}</BusinessList> : <EmptyState compact title="Aucun résultat" description="Aucun élément ne correspond à cette recherche." />}
        </div>
        <div className={`min-w-0 lg:border-l lg:border-dtsc-border lg:pl-5 ${detailOpen ? "block" : "hidden lg:block"}`}>
          {detailOpen ? <Button type="button" variant="ghost" onClick={() => setDetailOpen(false)} className="mb-2 rounded-xl text-dtsc-blue lg:hidden">← Retour à la liste</Button> : null}
          {selected ? <ActivityDetail item={selected} collaborators={collaborators} currentUserId={currentUserId} currentUserRole={currentUserRole} onChanged={onChanged} /> : <EmptyState compact title="Sélectionnez un élément" />}
        </div>
      </div>
    </Dialog>
  );
}

function sectionAction(sectionId: string, handlers: { openRequest: () => void; openReport: () => void; openBlocker: () => void }) {
  if (sectionId === "collab-requests") return <Button type="button" size="sm" variant="outline" onClick={handlers.openRequest} className="rounded-xl border-dtsc-border"><Send className="h-4 w-4" />Demande</Button>;
  if (sectionId === "reports") return <Button type="button" size="sm" variant="outline" onClick={handlers.openReport} className="rounded-xl border-dtsc-border"><FileText className="h-4 w-4" />Rapport</Button>;
  if (sectionId === "blockers") return <Button type="button" size="sm" variant="outline" onClick={handlers.openBlocker} className="rounded-xl border-dtsc-border"><CircleAlert className="h-4 w-4" />Blocage</Button>;
  return undefined;
}

function matchesFilters(item: ActivityItem, query: string, start: string, end: string) {
  if (!isInDateRange(item.date, start, end)) return false;
  const normalizedQuery = normalizeSearch(query);
  if (!normalizedQuery) return true;
  return normalizeSearch([item.title, item.status, item.detail, item.body, item.priority, item.entityType].filter(Boolean).join(" ")).includes(normalizedQuery);
}

function isInDateRange(value: string, start: string, end: string) {
  const time = Date.parse(value);
  if (Number.isNaN(time)) return true;
  const startTime = start ? Date.parse(`${start}T00:00:00`) : Number.NEGATIVE_INFINITY;
  const endTime = end ? Date.parse(`${end}T23:59:59.999`) : Number.POSITIVE_INFINITY;
  return time >= startTime && time <= endTime;
}

function normalizeSearch(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function sectionIcon(sectionId: string) {
  if (sectionId === "tasks") return ClipboardList;
  if (sectionId === "operations" || sectionId === "workflows") return GitBranch;
  if (sectionId === "blockers") return CircleAlert;
  if (sectionId === "reports") return FileText;
  if (sectionId === "collab-requests" || sectionId === "requests") return Users;
  return ClipboardList;
}

void sectionIcon;
