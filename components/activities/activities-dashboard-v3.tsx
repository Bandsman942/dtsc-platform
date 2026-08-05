"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, FileInput, Send } from "lucide-react";
import { ActivityDetailV2 } from "@/components/activities/activity-detail-v2";
import { ActivitySectionBoard, type ActivityBoardAxis } from "@/components/activities/activity-section-board";
import { WorkPrestationsPanelV2 } from "@/components/activities/work-prestations-panel-v2";
import { BlockerDialog, ReportDialog, RequestDialog, WorkflowDialog } from "@/components/activities/activity-forms";
import type { ActivityItem, ActivitySection, CollaboratorOption } from "@/components/activities/activity-types";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ListControls } from "@/components/ui/list-controls";
import { useToastMessage } from "@/components/ui/use-toast-message";
import { ContextualUserGuide } from "@/components/user-guides/contextual-user-guide";
import { EmptyState } from "@/components/workspace/empty-state";
import { ModuleMetric, ModuleMetrics } from "@/components/workspace/module-metrics";
import { ModuleContent, ModuleHeader, ModuleToolbar, ModuleWorkspace } from "@/components/workspace/module-workspace";
import { useSmartList } from "@/lib/hooks/use-smart-list";
import { ITERATION04_USER_GUIDES } from "@/lib/user-guides/iteration04-guides";

type ActivityEntry = { section: ActivitySection; item: ActivityItem };

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
    pageSize: 32,
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

  return (
    <ModuleWorkspace>
      <ModuleHeader
        eyebrow="Espace collaborateur"
        title="Activités DTSC"
        count={`${totalCount} élément${totalCount > 1 ? "s" : ""}`}
        description="Pilotez les activités qui vous concernent. Les transitions sont réservées au destinataire ou au responsable explicite et la progression est calculée depuis les checklists."
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
        {visibleSections.length ? visibleSections.map((section) => (
          <ActivitySectionBoard
            key={section.id}
            section={section}
            defaultAxis={defaultAxisForSection(section.id)}
            action={sectionAction(section.id, () => openRequest(), () => setReportOpen(true), () => setBlockerOpen(true))}
            onOpen={(item) => setActiveItem({ section, item })}
            onCreateRelatedRequest={openRequest}
            onTaskStatus={(item, status) => void updateTask(item, status)}
          />
        )) : <EmptyState compact title="Aucune activité" description="Aucune activité ne correspond aux filtres actifs." />}
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

function normalizeSearch(value: string) { return value.toLocaleLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim(); }
function matchesFilters(item: ActivityItem, query: string, dateStart: string, dateEnd: string) { const normalized = normalizeSearch(query); if (normalized && !normalizeSearch([item.title, item.status, item.detail, item.body, item.entityType, item.priority].filter(Boolean).join(" ")).includes(normalized)) return false; const date = item.date.slice(0, 10); return (!dateStart || date >= dateStart) && (!dateEnd || date <= dateEnd); }
function defaultAxisForSection(sectionId: string): ActivityBoardAxis {
  if (["blockers", "ceo"].includes(sectionId)) return "priority";
  if (["sco"].includes(sectionId)) return "entityType";
  if (["operations", "ceo-follow-up", "mpo-projects", "cto-tech"].includes(sectionId)) return "progress";
  return "status";
}
function sectionAction(sectionId: string, openRequest: () => void, openReport: () => void, openBlocker: () => void) { if (sectionId === "reports") return <Button type="button" variant="outline" onClick={openReport} className="rounded-xl">Nouveau rapport</Button>; if (sectionId === "blockers") return <Button type="button" variant="outline" onClick={openBlocker} className="rounded-xl">Signaler un blocage</Button>; if (sectionId === "collab-requests") return <Button type="button" variant="outline" onClick={openRequest} className="rounded-xl">Nouvelle demande</Button>; return undefined; }
