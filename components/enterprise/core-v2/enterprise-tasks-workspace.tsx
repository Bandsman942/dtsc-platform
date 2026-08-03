"use client";

import { Archive, CheckCircle2, Eye, PauseCircle, Pencil, Play, Plus, RotateCcw, XCircle } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { BusinessList, BusinessListItem } from "@/components/workspace/business-list";
import { ContextActions, type BusinessContextAction } from "@/components/workspace/context-actions";
import { EmptyState } from "@/components/workspace/empty-state";
import { ModuleMetric, ModuleMetrics } from "@/components/workspace/module-metrics";
import { ModuleSection } from "@/components/workspace/module-workspace";
import { StatusBadge } from "@/components/workspace/status-badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToastMessage } from "@/components/ui/use-toast-message";
import { EnterpriseTaskForm } from "@/components/enterprise/core-v2/task-form";
import { TaskCoordinationPanel } from "@/components/enterprise/core-v2/task-coordination-panel";
import { NativeSelect, formatEnterpriseDate, priorityChoicesEn, priorityChoicesFr, priorityLabel, statusLabel, statusTone, type EnterpriseChoice } from "@/components/enterprise/core-v2/erp-v2-ui";
import { enterpriseV2Mutation, useEnterpriseV2Collection } from "@/components/enterprise/core-v2/use-enterprise-v2-collection";

type Task = { id: string; taskType: string; title: string; description: string | null; status: string; priority: string; createdByUserId: string; assignedToUserId: string | null; departmentId: string | null; dueAt: string | null; sourceModule: string | null; sourceEntityType: string | null; revision: number };
type LegacyRecord = { id: string; recordType: string; title: string; description: string | null; status: string; priority: string; updatedAt: string };

export function EnterpriseTasksWorkspace({ organizationId, members, departments, canCreate, canManage, locale, legacyRecords = [] }: { organizationId: string; members: EnterpriseChoice[]; departments: EnterpriseChoice[]; canCreate: boolean; canManage: boolean; locale?: string | null; legacyRecords?: LegacyRecord[] }) {
  const en = locale === "en";
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [assignee, setAssignee] = useState("");
  const [department, setDepartment] = useState("");
  const [overdue, setOverdue] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState<Task | null>(null);
  const [edit, setEdit] = useState<Task | null>(null);
  const [pendingAction, setPendingAction] = useState<{ task: Task; action: string } | null>(null);
  const [message, setMessage] = useState("");
  useToastMessage(message);
  const params = useMemo(() => {
    const value = new URLSearchParams({ page: String(page), pageSize: "20" });
    if (search.trim()) value.set("search", search.trim());
    if (status) value.set("status", status);
    if (priority) value.set("priority", priority);
    if (assignee) value.set("assignee", assignee);
    if (department) value.set("department", department);
    if (overdue) value.set("overdue", "true");
    return value;
  }, [assignee, department, overdue, page, priority, search, status]);
  const collection = useEnterpriseV2Collection<Task>({ endpoint: `/api/enterprise/${organizationId}/tasks`, params, refreshKey });

  async function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await enterpriseV2Mutation(`/api/enterprise/${organizationId}/tasks`, "POST", Object.fromEntries(new FormData(event.currentTarget).entries()));
      setCreateOpen(false); setPage(1); setRefreshKey((value) => value + 1); setMessage(en ? "Task created." : "Tâche créée.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "ACTION_FAILED"); }
  }

  async function submitEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!edit) return;
    try {
      await enterpriseV2Mutation(`/api/enterprise/${organizationId}/tasks/${edit.id}`, "PATCH", { ...Object.fromEntries(new FormData(event.currentTarget).entries()), revision: edit.revision });
      setEdit(null); setDetail(null); setRefreshKey((value) => value + 1); setMessage(en ? "Task updated." : "Tâche mise à jour.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "ACTION_FAILED"); }
  }

  async function runAction() {
    if (!pendingAction) return;
    try {
      await enterpriseV2Mutation(`/api/enterprise/${organizationId}/tasks/${pendingAction.task.id}/actions`, "POST", { action: pendingAction.action, revision: pendingAction.task.revision });
      setPendingAction(null); setDetail(null); setRefreshKey((value) => value + 1); setMessage(en ? "Task action saved." : "Action enregistrée.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "ACTION_FAILED"); }
  }

  return <div className="grid min-w-0 gap-5">
    <ModuleMetrics label={en ? "Task indicators" : "Indicateurs tâches"}>
      <ModuleMetric label={en ? "Visible" : "Visibles"} value={collection.pagination.total} />
      <ModuleMetric label={en ? "Blocked" : "Bloquées"} value={collection.items.filter((item) => item.status === "BLOCKED").length} />
      <ModuleMetric label={en ? "Done" : "Terminées"} value={collection.items.filter((item) => item.status === "DONE").length} />
      <ModuleMetric label={en ? "Historical" : "Historiques"} value={legacyRecords.length} />
    </ModuleMetrics>
    <ModuleSection title={en ? "Tasks & operations" : "Tâches & opérations"} description={en ? "Dedicated operational work with server-side state transitions." : "Travail opérationnel dédié avec transitions métier contrôlées côté serveur."} count={`${collection.pagination.total}`} action={canCreate ? <Button onClick={() => setCreateOpen(true)} className="bg-dtsc-blue text-white"><Plus className="h-4 w-4" />{en ? "New task" : "Nouvelle tâche"}</Button> : undefined}>
      <div className="grid gap-2 border-y border-dtsc-border py-3 md:grid-cols-3 xl:grid-cols-6">
        <Input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder={en ? "Search tasks…" : "Rechercher une tâche…"} />
        <NativeSelect value={status} onChange={(value) => { setStatus(value); setPage(1); }} items={["TODO", "IN_PROGRESS", "BLOCKED", "DONE", "CANCELLED"].map((id) => ({ id, label: statusLabel(locale, id) }))} />
        <NativeSelect value={priority} onChange={(value) => { setPriority(value); setPage(1); }} items={en ? priorityChoicesEn : priorityChoicesFr} />
        <NativeSelect value={assignee} onChange={(value) => { setAssignee(value); setPage(1); }} items={members} />
        <NativeSelect value={department} onChange={(value) => { setDepartment(value); setPage(1); }} items={departments} />
        <Button variant={overdue ? "default" : "outline"} onClick={() => { setOverdue((value) => !value); setPage(1); }}>{en ? "Overdue" : "En retard"}</Button>
      </div>
      {collection.loading ? <p className="py-8 text-center text-sm text-dtsc-muted">{en ? "Loading…" : "Chargement…"}</p> : collection.items.length ? <BusinessList ariaLabel={en ? "Tasks" : "Tâches"}>{collection.items.map((task) => <BusinessListItem key={task.id} title={task.title} status={<StatusBadge tone={statusTone(task.status)}>{statusLabel(locale, task.status)}</StatusBadge>} meta={`${task.taskType} · ${priorityLabel(locale, task.priority)} · ${formatEnterpriseDate(task.dueAt, locale)}`} description={task.description || (en ? "No description." : "Aucune description.")} onOpen={() => setDetail(task)} openLabel={en ? `Open ${task.title}` : `Ouvrir ${task.title}`} actions={<ContextActions label={en ? "Task actions" : "Actions tâche"} actions={actionsFor(task, canManage, en, setDetail, setEdit, setPendingAction)} />} />)}</BusinessList> : <EmptyState compact title={en ? "No tasks" : "Aucune tâche"} description={collection.error || (en ? "No task matches the current filters." : "Aucune tâche ne correspond aux filtres." )} />}
      <div className="mt-3 flex items-center justify-between border-t border-dtsc-border pt-3 text-sm text-dtsc-muted"><span>Page {collection.pagination.page}/{collection.pagination.pageCount}</span><div className="flex gap-2"><Button variant="outline" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>{en ? "Previous" : "Précédent"}</Button><Button variant="outline" disabled={page >= collection.pagination.pageCount} onClick={() => setPage((value) => value + 1)}>{en ? "Next" : "Suivant"}</Button></div></div>
    </ModuleSection>
    {legacyRecords.length ? <ModuleSection title={en ? "Historical items" : "Historique"} description={en ? "Legacy tasks remain readable and read-only." : "Les anciennes tâches restent lisibles et non modifiables."}><BusinessList ariaLabel="legacy">{legacyRecords.map((record) => <BusinessListItem key={record.id} title={record.title} status={<StatusBadge>{en ? "History" : "Historique"}</StatusBadge>} meta={`${record.recordType} · ${statusLabel(locale, record.status)}`} description={record.description || formatEnterpriseDate(record.updatedAt, locale)} />)}</BusinessList></ModuleSection> : null}
    <Dialog open={createOpen} onClose={() => setCreateOpen(false)} title={en ? "New task" : "Nouvelle tâche"} className="h-[94dvh] max-w-4xl"><EnterpriseTaskForm locale={locale} members={members} departments={departments} onSubmit={submitCreate} /></Dialog>
    <Dialog open={Boolean(edit)} onClose={() => setEdit(null)} title={en ? "Edit task" : "Modifier la tâche"} className="h-[94dvh] max-w-4xl">{edit ? <EnterpriseTaskForm locale={locale} members={members} departments={departments} value={edit} onSubmit={submitEdit} /> : null}</Dialog>
    <Dialog open={Boolean(detail)} onClose={() => setDetail(null)} title={detail?.title || ""} className="h-[94dvh] max-w-5xl">{detail ? <div className="grid gap-5 text-sm"><div className="grid gap-3"><div className="flex gap-2"><StatusBadge tone={statusTone(detail.status)}>{statusLabel(locale, detail.status)}</StatusBadge><StatusBadge>{priorityLabel(locale, detail.priority)}</StatusBadge></div><p className="leading-6 text-dtsc-muted">{detail.description || (en ? "No description." : "Aucune description.")}</p><p>{en ? "Due" : "Échéance"} : {formatEnterpriseDate(detail.dueAt, locale)}</p><p>{en ? "Revision" : "Révision"} : {detail.revision}</p>{detail.sourceEntityType ? <p className="text-xs text-dtsc-muted">{en ? "Linked source" : "Source liée"} : {detail.sourceModule} · {detail.sourceEntityType}</p> : null}</div><TaskCoordinationPanel organizationId={organizationId} taskId={detail.id} canUpdate={canManage || detail.createdByUserId === detail.assignedToUserId || Boolean(detail.assignedToUserId)} taskChoices={collection.items.map((task) => ({ id: task.id, title: task.title }))} members={members} locale={locale} /></div> : null}</Dialog>
    <Dialog open={Boolean(pendingAction)} onClose={() => setPendingAction(null)} title={en ? "Confirm action" : "Confirmer l’action"}><p className="text-sm text-dtsc-muted">{pendingAction?.action} · {pendingAction?.task.title}</p><Button onClick={() => void runAction()} className="mt-4 bg-dtsc-blue text-white">{en ? "Confirm" : "Confirmer"}</Button></Dialog>
  </div>;
}

function actionsFor(task: Task, canManage: boolean, en: boolean, detail: (task: Task) => void, edit: (task: Task) => void, action: (value: { task: Task; action: string }) => void): BusinessContextAction[] {
  const items: BusinessContextAction[] = [{ id: "open", label: en ? "Open" : "Ouvrir", icon: Eye, onSelect: () => detail(task) }];
  if (["TODO", "IN_PROGRESS", "BLOCKED"].includes(task.status)) items.push({ id: "edit", label: en ? "Edit" : "Modifier", icon: Pencil, onSelect: () => edit(task) });
  if (task.status === "TODO") items.push({ id: "start", label: en ? "Start" : "Démarrer", icon: Play, onSelect: () => action({ task, action: "START" }) });
  if (task.status === "IN_PROGRESS") { items.push({ id: "block", label: en ? "Block" : "Bloquer", icon: PauseCircle, onSelect: () => action({ task, action: "BLOCK" }) }); items.push({ id: "complete", label: en ? "Complete" : "Terminer", icon: CheckCircle2, onSelect: () => action({ task, action: "COMPLETE" }) }); }
  if (task.status === "BLOCKED") items.push({ id: "resume", label: en ? "Resume" : "Reprendre", icon: RotateCcw, onSelect: () => action({ task, action: "RESUME" }) });
  if (["TODO", "IN_PROGRESS", "BLOCKED"].includes(task.status)) items.push({ id: "cancel", label: en ? "Cancel" : "Annuler", icon: XCircle, destructive: true, separatorBefore: true, onSelect: () => action({ task, action: "CANCEL" }) });
  if (canManage) items.push({ id: "archive", label: en ? "Archive" : "Archiver", icon: Archive, separatorBefore: true, onSelect: () => action({ task, action: "ARCHIVE" }) });
  return items;
}
