"use client";

import { Archive, CheckCircle2, Eye, PauseCircle, Pencil, Play, Plus, RotateCcw, XCircle } from "lucide-react";
import { useSearchParams } from "next/navigation";
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
import { NativeSelect, formatEnterpriseDate, priorityChoices, priorityLabel, statusLabel, statusTone, type EnterpriseChoice } from "@/components/enterprise/core-v2/erp-v2-ui";
import { enterpriseV2Mutation, useEnterpriseV2Collection } from "@/components/enterprise/core-v2/use-enterprise-v2-collection";
import { enterpriseCoreT } from "@/lib/enterprise-core-i18n";

type Task = { id: string; taskType: string; title: string; description: string | null; status: string; priority: string; createdByUserId: string; assignedToUserId: string | null; departmentId: string | null; dueAt: string | null; sourceModule: string | null; sourceEntityType: string | null; revision: number };
type LegacyRecord = { id: string; recordType: string; title: string; description: string | null; status: string; priority: string; updatedAt: string };
type PendingAction = { task: Task; action: string; label: string };

export function EnterpriseTasksWorkspace({ organizationId, members, departments, canCreate, canManage, locale, legacyRecords = [] }: { organizationId: string; members: EnterpriseChoice[]; departments: EnterpriseChoice[]; canCreate: boolean; canManage: boolean; locale?: string | null; legacyRecords?: LegacyRecord[] }) {
  const searchParams = useSearchParams();
  const deepLinkedTaskId = searchParams.get("task");
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
  const [dismissedDeepLinkId, setDismissedDeepLinkId] = useState<string | null>(null);
  const [edit, setEdit] = useState<Task | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [message, setMessage] = useState("");
  useToastMessage(message);
  const params = useMemo(() => {
    const value = new URLSearchParams({ page: String(page), pageSize: "20" });
    if (deepLinkedTaskId) value.set("id", deepLinkedTaskId);
    if (search.trim()) value.set("search", search.trim());
    if (status) value.set("status", status);
    if (priority) value.set("priority", priority);
    if (assignee) value.set("assignee", assignee);
    if (department) value.set("department", department);
    if (overdue) value.set("overdue", "true");
    return value;
  }, [assignee, deepLinkedTaskId, department, overdue, page, priority, search, status]);
  const collection = useEnterpriseV2Collection<Task>({ endpoint: `/api/enterprise/${organizationId}/tasks`, params, refreshKey });
  const focusedTask = deepLinkedTaskId && dismissedDeepLinkId !== deepLinkedTaskId
    ? collection.items.find((item) => item.id === deepLinkedTaskId) || null
    : null;
  const activeDetail = detail || focusedTask;

  async function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await enterpriseV2Mutation(`/api/enterprise/${organizationId}/tasks`, "POST", Object.fromEntries(new FormData(event.currentTarget).entries()));
      setCreateOpen(false); setPage(1); setRefreshKey((value) => value + 1); setMessage(enterpriseCoreT(locale, "tasks.created"));
    } catch (error) { setMessage(error instanceof Error ? error.message : "ACTION_FAILED"); }
  }

  async function submitEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!edit) return;
    try {
      await enterpriseV2Mutation(`/api/enterprise/${organizationId}/tasks/${edit.id}`, "PATCH", { ...Object.fromEntries(new FormData(event.currentTarget).entries()), revision: edit.revision });
      setEdit(null); setDetail(null); setRefreshKey((value) => value + 1); setMessage(enterpriseCoreT(locale, "tasks.updated"));
    } catch (error) { setMessage(error instanceof Error ? error.message : "ACTION_FAILED"); }
  }

  async function runAction() {
    if (!pendingAction) return;
    try {
      await enterpriseV2Mutation(`/api/enterprise/${organizationId}/tasks/${pendingAction.task.id}/actions`, "POST", { action: pendingAction.action, revision: pendingAction.task.revision });
      setPendingAction(null); setDetail(null); setRefreshKey((value) => value + 1); setMessage(enterpriseCoreT(locale, "tasks.actionSaved"));
    } catch (error) { setMessage(error instanceof Error ? error.message : "ACTION_FAILED"); }
  }

  function closeDetail() {
    setDetail(null);
    if (deepLinkedTaskId) setDismissedDeepLinkId(deepLinkedTaskId);
  }

  return <div className="grid min-w-0 gap-5">
    <ModuleMetrics label={enterpriseCoreT(locale, "tasks.indicators")}>
      <ModuleMetric label={enterpriseCoreT(locale, "tasks.visible")} value={collection.pagination.total} />
      <ModuleMetric label={enterpriseCoreT(locale, "tasks.blocked")} value={collection.items.filter((item) => item.status === "BLOCKED").length} />
      <ModuleMetric label={enterpriseCoreT(locale, "tasks.done")} value={collection.items.filter((item) => item.status === "DONE").length} />
      <ModuleMetric label={enterpriseCoreT(locale, "tasks.historicalMetric")} value={legacyRecords.length} />
    </ModuleMetrics>
    <ModuleSection title={enterpriseCoreT(locale, "tasks.sectionTitle")} description={enterpriseCoreT(locale, "tasks.sectionDescription")} count={`${collection.pagination.total}`} action={canCreate ? <Button onClick={() => setCreateOpen(true)} className="bg-dtsc-blue text-white"><Plus className="h-4 w-4" />{enterpriseCoreT(locale, "tasks.newTask")}</Button> : undefined}>
      <div className="grid gap-2 border-y border-dtsc-border py-3 md:grid-cols-3 xl:grid-cols-6">
        <Input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder={enterpriseCoreT(locale, "tasks.searchPlaceholder")} />
        <NativeSelect value={status} onChange={(value) => { setStatus(value); setPage(1); }} items={["TODO", "IN_PROGRESS", "BLOCKED", "DONE", "CANCELLED"].map((id) => ({ id, label: statusLabel(locale, id) }))} />
        <NativeSelect value={priority} onChange={(value) => { setPriority(value); setPage(1); }} items={priorityChoices(locale)} />
        <NativeSelect value={assignee} onChange={(value) => { setAssignee(value); setPage(1); }} items={members} />
        <NativeSelect value={department} onChange={(value) => { setDepartment(value); setPage(1); }} items={departments} />
        <Button variant={overdue ? "default" : "outline"} onClick={() => { setOverdue((value) => !value); setPage(1); }}>{enterpriseCoreT(locale, "tasks.overdue")}</Button>
      </div>
      {collection.loading ? <p className="py-8 text-center text-sm text-dtsc-muted">{enterpriseCoreT(locale, "common.loading")}</p> : collection.items.length ? <BusinessList ariaLabel={enterpriseCoreT(locale, "tasks.ariaLabel")}>{collection.items.map((task) => <BusinessListItem key={task.id} title={task.title} status={<StatusBadge tone={statusTone(task.status)}>{statusLabel(locale, task.status)}</StatusBadge>} meta={`${taskTypeLabel(locale, task.taskType)} · ${priorityLabel(locale, task.priority)} · ${formatEnterpriseDate(task.dueAt, locale)}`} description={task.description || enterpriseCoreT(locale, "common.noDescription")} onOpen={() => setDetail(task)} openLabel={enterpriseCoreT(locale, "tasks.openLabel", { title: task.title })} actions={<ContextActions label={enterpriseCoreT(locale, "tasks.actionsLabel")} actions={actionsFor(task, canManage, locale, setDetail, setEdit, setPendingAction)} />} />)}</BusinessList> : <EmptyState compact title={enterpriseCoreT(locale, "tasks.noTasks")} description={collection.error || (deepLinkedTaskId ? enterpriseCoreT(locale, "tasks.unavailable") : enterpriseCoreT(locale, "tasks.noMatch"))} />}
      <div className="mt-3 flex items-center justify-between border-t border-dtsc-border pt-3 text-sm text-dtsc-muted"><span>{enterpriseCoreT(locale, "common.page", { current: collection.pagination.page, total: collection.pagination.pageCount })}</span><div className="flex gap-2"><Button variant="outline" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>{enterpriseCoreT(locale, "common.previous")}</Button><Button variant="outline" disabled={page >= collection.pagination.pageCount} onClick={() => setPage((value) => value + 1)}>{enterpriseCoreT(locale, "common.next")}</Button></div></div>
    </ModuleSection>
    {legacyRecords.length ? <ModuleSection title={enterpriseCoreT(locale, "tasks.historicalTitle")} description={enterpriseCoreT(locale, "tasks.historicalDescription")}><BusinessList ariaLabel="legacy">{legacyRecords.map((record) => <BusinessListItem key={record.id} title={record.title} status={<StatusBadge>{enterpriseCoreT(locale, "tasks.historyBadge")}</StatusBadge>} meta={`${taskTypeLabel(locale, record.recordType)} · ${statusLabel(locale, record.status)}`} description={record.description || formatEnterpriseDate(record.updatedAt, locale)} />)}</BusinessList></ModuleSection> : null}
    <Dialog open={createOpen} onClose={() => setCreateOpen(false)} title={enterpriseCoreT(locale, "tasks.newTask")} className="h-[94dvh] max-w-4xl"><EnterpriseTaskForm locale={locale} members={members} departments={departments} onSubmit={submitCreate} /></Dialog>
    <Dialog open={Boolean(edit)} onClose={() => setEdit(null)} title={enterpriseCoreT(locale, "tasks.editTask")} className="h-[94dvh] max-w-4xl">{edit ? <EnterpriseTaskForm locale={locale} members={members} departments={departments} value={edit} onSubmit={submitEdit} /> : null}</Dialog>
    <Dialog open={Boolean(activeDetail)} onClose={closeDetail} title={activeDetail?.title || ""} className="h-[94dvh] max-w-5xl">{activeDetail ? <div className="grid gap-5 text-sm"><div className="grid gap-3"><div className="flex gap-2"><StatusBadge tone={statusTone(activeDetail.status)}>{statusLabel(locale, activeDetail.status)}</StatusBadge><StatusBadge>{priorityLabel(locale, activeDetail.priority)}</StatusBadge></div><p className="leading-6 text-dtsc-muted">{activeDetail.description || enterpriseCoreT(locale, "common.noDescription")}</p><p>{enterpriseCoreT(locale, "tasks.due")} : {formatEnterpriseDate(activeDetail.dueAt, locale)}</p><p>{enterpriseCoreT(locale, "tasks.revision")} : {activeDetail.revision}</p>{activeDetail.sourceEntityType ? <p className="text-xs text-dtsc-muted">{enterpriseCoreT(locale, "tasks.linkedSource")} : {activeDetail.sourceModule} · {activeDetail.sourceEntityType}</p> : null}</div><TaskCoordinationPanel organizationId={organizationId} taskId={activeDetail.id} canUpdate={canManage || activeDetail.createdByUserId === collection.meta.currentUserId || activeDetail.assignedToUserId === collection.meta.currentUserId} taskChoices={collection.items.map((task) => ({ id: task.id, title: task.title }))} members={members} locale={locale} /></div> : null}</Dialog>
    <Dialog open={Boolean(pendingAction)} onClose={() => setPendingAction(null)} title={enterpriseCoreT(locale, "tasks.confirmAction")}><p className="text-sm text-dtsc-muted">{pendingAction?.label} · {pendingAction?.task.title}</p><Button onClick={() => void runAction()} className="mt-4 bg-dtsc-blue text-white">{enterpriseCoreT(locale, "common.confirm")}</Button></Dialog>
  </div>;
}

function actionsFor(task: Task, canManage: boolean, locale: string | null | undefined, detail: (task: Task) => void, edit: (task: Task) => void, action: (value: PendingAction) => void): BusinessContextAction[] {
  const items: BusinessContextAction[] = [{ id: "open", label: enterpriseCoreT(locale, "common.open"), icon: Eye, onSelect: () => detail(task) }];
  if (["TODO", "IN_PROGRESS", "BLOCKED"].includes(task.status)) items.push({ id: "edit", label: enterpriseCoreT(locale, "common.edit"), icon: Pencil, onSelect: () => edit(task) });
  if (task.status === "TODO") items.push({ id: "start", label: enterpriseCoreT(locale, "common.start"), icon: Play, onSelect: () => action({ task, action: "START", label: enterpriseCoreT(locale, "common.start") }) });
  if (task.status === "IN_PROGRESS") {
    items.push({ id: "block", label: enterpriseCoreT(locale, "common.block"), icon: PauseCircle, onSelect: () => action({ task, action: "BLOCK", label: enterpriseCoreT(locale, "common.block") }) });
    items.push({ id: "complete", label: enterpriseCoreT(locale, "common.complete"), icon: CheckCircle2, onSelect: () => action({ task, action: "COMPLETE", label: enterpriseCoreT(locale, "common.complete") }) });
  }
  if (task.status === "BLOCKED") items.push({ id: "resume", label: enterpriseCoreT(locale, "common.resume"), icon: RotateCcw, onSelect: () => action({ task, action: "RESUME", label: enterpriseCoreT(locale, "common.resume") }) });
  if (["TODO", "IN_PROGRESS", "BLOCKED"].includes(task.status)) items.push({ id: "cancel", label: enterpriseCoreT(locale, "common.cancel"), icon: XCircle, destructive: true, separatorBefore: true, onSelect: () => action({ task, action: "CANCEL", label: enterpriseCoreT(locale, "common.cancel") }) });
  if (canManage) items.push({ id: "archive", label: enterpriseCoreT(locale, "common.archive"), icon: Archive, separatorBefore: true, onSelect: () => action({ task, action: "ARCHIVE", label: enterpriseCoreT(locale, "common.archive") }) });
  return items;
}

function taskTypeLabel(locale: string | null | undefined, taskType: string) {
  if (taskType === "TASK") return enterpriseCoreT(locale, "tasks.form.task");
  if (taskType === "OPERATION") return enterpriseCoreT(locale, "tasks.form.operation");
  if (taskType === "ACTION") return enterpriseCoreT(locale, "tasks.form.action");
  return taskType;
}
