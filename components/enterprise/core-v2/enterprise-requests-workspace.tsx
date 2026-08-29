"use client";

import { priorityChoices as corePriorityChoices } from "@/components/enterprise/core-v2/erp-v2-ui";
import { EnterpriseApproverSelect } from "@/components/enterprise/enterprise-approver-select";
import { enterpriseCoreT } from "@/lib/enterprise-core-i18n";

import { Archive, CheckCircle2, Eye, Pencil, Plus, Send, ShieldCheck, UserCheck, XCircle } from "lucide-react";
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
import { EnterpriseRequestForm } from "@/components/enterprise/core-v2/request-form";
import { RequestCoordinationPanel } from "@/components/enterprise/core-v2/request-coordination-panel";
import { NativeSelect, formatEnterpriseDate, priorityLabel, statusLabel, statusTone, type EnterpriseChoice } from "@/components/enterprise/core-v2/erp-v2-ui";
import { enterpriseV2Mutation, useEnterpriseV2Collection } from "@/components/enterprise/core-v2/use-enterprise-v2-collection";

type RequestItem = { id: string; requestType: string; title: string; description: string; status: string; priority: string; requestedByUserId: string; assignedToUserId: string | null; departmentId: string | null; dueAt: string | null; sourceModule: string | null; sourceEntityType: string | null; revision: number; createdAt: string };
type LegacyRecord = { id: string; title: string; description: string | null; status: string; priority: string; updatedAt: string };
type PendingRequestAction = { request: RequestItem; action: string };
const requestStatuses = ["DRAFT", "SUBMITTED", "IN_REVIEW", "IN_PROGRESS", "WAITING_REQUESTER", "CORRECTION_REQUESTED", "APPROVED", "REJECTED", "RESOLVED", "FULFILLED", "CLOSED", "CANCELLED"];
const requestTypes = ["GENERAL", "INFORMATION", "DOCUMENT", "VALIDATION", "SUPPORT", "ACTION", "MEETING", "FOLLOW_UP", "OTHER"];

export function EnterpriseRequestsWorkspace({ organizationId, members, departments, canCreate, canManage, locale, legacyRecords = [] }: { organizationId: string; members: EnterpriseChoice[]; departments: EnterpriseChoice[]; canCreate: boolean; canManage: boolean; locale?: string | null; legacyRecords?: LegacyRecord[] }) {
  const searchParams = useSearchParams();
  const deepLinkedRequestId = searchParams.get("request");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [type, setType] = useState("");
  const [priority, setPriority] = useState("");
  const [department, setDepartment] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState<RequestItem | null>(null);
  const [dismissedDeepLinkId, setDismissedDeepLinkId] = useState<string | null>(null);
  const [edit, setEdit] = useState<RequestItem | null>(null);
  const [approvalTarget, setApprovalTarget] = useState<RequestItem | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingRequestAction | null>(null);
  const [actionComment, setActionComment] = useState("");
  const [message, setMessage] = useState("");
  useToastMessage(message);
  const params = useMemo(() => {
    const value = new URLSearchParams({ page: String(page), pageSize: "20" });
    if (deepLinkedRequestId) value.set("id", deepLinkedRequestId);
    if (search.trim()) value.set("search", search.trim());
    if (status) value.set("status", status);
    if (type.trim()) value.set("type", type.trim());
    if (priority) value.set("priority", priority);
    if (department) value.set("department", department);
    return value;
  }, [deepLinkedRequestId, department, page, priority, search, status, type]);
  const collection = useEnterpriseV2Collection<RequestItem>({ endpoint: `/api/enterprise/${organizationId}/requests`, params, refreshKey });
  const currentUserId = collection.meta.currentUserId || "";
  const focusedRequest = deepLinkedRequestId && dismissedDeepLinkId !== deepLinkedRequestId
    ? collection.items.find((item) => item.id === deepLinkedRequestId) || null
    : null;
  const activeDetail = detail || focusedRequest;

  async function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try { await enterpriseV2Mutation(`/api/enterprise/${organizationId}/requests`, "POST", Object.fromEntries(new FormData(event.currentTarget).entries())); setCreateOpen(false); setPage(1); setRefreshKey((value) => value + 1); setMessage(enterpriseCoreT(locale, "requests.draft.created")); }
    catch (error) { setMessage(error instanceof Error ? error.message : "ACTION_FAILED"); }
  }

  async function submitEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!edit) return;
    try { await enterpriseV2Mutation(`/api/enterprise/${organizationId}/requests/${edit.id}`, "PATCH", { ...Object.fromEntries(new FormData(event.currentTarget).entries()), revision: edit.revision }); setEdit(null); setDetail(null); setRefreshKey((value) => value + 1); setMessage(enterpriseCoreT(locale, "requests.request.updated")); }
    catch (error) { setMessage(error instanceof Error ? error.message : "ACTION_FAILED"); }
  }

  async function runAction() {
    if (!pendingAction) return;
    const reasonRequired = ["CANCEL", "ARCHIVE"].includes(pendingAction.action);
    if (reasonRequired && !actionComment.trim()) {
      setMessage(locale === "en" ? "A reason is required for this action." : "Un motif est obligatoire pour cette action.");
      return;
    }
    try {
      await enterpriseV2Mutation(`/api/enterprise/${organizationId}/requests/${pendingAction.request.id}/actions`, "POST", { action: pendingAction.action, revision: pendingAction.request.revision, comment: actionComment.trim() || undefined });
      setPendingAction(null); setActionComment(""); setDetail(null); setRefreshKey((value) => value + 1); setMessage(enterpriseCoreT(locale, "requests.request.action.saved"));
    } catch (error) { setMessage(error instanceof Error ? error.message : "ACTION_FAILED"); }
  }

  async function createApproval(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!approvalTarget) return;
    const approverUserId = String(new FormData(event.currentTarget).get("approverUserId") || "");
    try { await enterpriseV2Mutation(`/api/enterprise/${organizationId}/approvals`, "POST", { targetEntityType: "EnterpriseRequest", targetEntityId: approvalTarget.id, approverUserId }); setApprovalTarget(null); setDetail(null); setRefreshKey((value) => value + 1); setMessage(enterpriseCoreT(locale, "requests.approval.requested")); }
    catch (error) { setMessage(error instanceof Error ? error.message : "ACTION_FAILED"); }
  }

  function closeDetail() {
    setDetail(null);
    if (deepLinkedRequestId) setDismissedDeepLinkId(deepLinkedRequestId);
  }

  function closePendingAction() {
    setPendingAction(null);
    setActionComment("");
  }

  return <div className="grid min-w-0 gap-5">
    <ModuleMetrics label={enterpriseCoreT(locale, "requests.request.indicators")}>
      <ModuleMetric label={enterpriseCoreT(locale, "tasks.visible")} value={collection.pagination.total} />
      <ModuleMetric label={enterpriseCoreT(locale, "requests.submitted")} value={collection.items.filter((item) => item.status === "SUBMITTED").length} />
      <ModuleMetric label={enterpriseCoreT(locale, "requests.waiting.requester")} value={collection.items.filter((item) => item.status === "WAITING_REQUESTER").length} />
      <ModuleMetric label={enterpriseCoreT(locale, "tasks.historicalMetric")} value={legacyRecords.length} />
    </ModuleMetrics>
    <ModuleSection title={enterpriseCoreT(locale, "requests.internal.requests")} description={enterpriseCoreT(locale, "requests.self.service.requests.with.information.resolution.closure.and")} count={`${collection.pagination.total}`} action={canCreate ? <Button onClick={() => setCreateOpen(true)} className="bg-dtsc-blue text-white"><Plus className="h-4 w-4" />{enterpriseCoreT(locale, "requests.new.request")}</Button> : undefined}>
      <div className="grid gap-2 border-y border-dtsc-border py-3 md:grid-cols-3 xl:grid-cols-5">
        <Input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder={enterpriseCoreT(locale, "requests.search.requests")} />
        <NativeSelect value={status} onChange={(value) => { setStatus(value); setPage(1); }} items={[{ id: "", label: enterpriseCoreT(locale, "requests.all.statuses") }, ...requestStatuses.map((id) => ({ id, label: statusLabel(locale, id) }))]} />
        <NativeSelect value={type} onChange={(value) => { setType(value); setPage(1); }} items={[{ id: "", label: locale === "en" ? "All request types" : "Tous les types de demande" }, ...requestTypes.map((id) => ({ id, label: requestTypeLabel(locale, id) }))]} />
        <NativeSelect value={priority} onChange={(value) => { setPriority(value); setPage(1); }} items={corePriorityChoices(locale)} />
        <NativeSelect value={department} onChange={(value) => { setDepartment(value); setPage(1); }} items={departments} />
      </div>
      {collection.loading ? <p className="py-8 text-center text-sm text-dtsc-muted">{enterpriseCoreT(locale, "common.loading")}</p> : collection.items.length ? <BusinessList ariaLabel={enterpriseCoreT(locale, "requests.requests")}>{collection.items.map((requestRecord) => <BusinessListItem key={requestRecord.id} title={requestRecord.title} status={<StatusBadge tone={statusTone(requestRecord.status)}>{statusLabel(locale, requestRecord.status)}</StatusBadge>} meta={`${requestTypeLabel(locale, requestRecord.requestType)} · ${priorityLabel(locale, requestRecord.priority)} · ${formatEnterpriseDate(requestRecord.createdAt, locale)}`} description={requestRecord.description} onOpen={() => setDetail(requestRecord)} openLabel={enterpriseCoreT(locale, "requests.open.named", { title: requestRecord.title })} actions={<ContextActions label={enterpriseCoreT(locale, "requests.request.actions")} actions={actionsFor(requestRecord, canManage, currentUserId, locale, setDetail, setEdit, setApprovalTarget, setPendingAction)} />} />)}</BusinessList> : <EmptyState compact title={enterpriseCoreT(locale, "requests.no.requests")} description={collection.error || (deepLinkedRequestId ? enterpriseCoreT(locale, "requests.this.request.is.unavailable.or.no.longer.accessible") : enterpriseCoreT(locale, "requests.no.request.matches.the.current.filters"))} />}
      <div className="mt-3 flex items-center justify-between border-t border-dtsc-border pt-3 text-sm text-dtsc-muted"><span>{enterpriseCoreT(locale, "common.page", { current: collection.pagination.page, total: collection.pagination.pageCount })}</span><div className="flex gap-2"><Button variant="outline" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>{enterpriseCoreT(locale, "common.previous")}</Button><Button variant="outline" disabled={page >= collection.pagination.pageCount} onClick={() => setPage((value) => value + 1)}>{enterpriseCoreT(locale, "common.next")}</Button></div></div>
    </ModuleSection>
    {legacyRecords.length ? <ModuleSection title={enterpriseCoreT(locale, "requests.historical.requests")} description={enterpriseCoreT(locale, "requests.legacy.requests.remain.readable.and.read.only")}><BusinessList ariaLabel={enterpriseCoreT(locale, "requests.legacy.aria")}>{legacyRecords.map((record) => <BusinessListItem key={record.id} title={record.title} status={<StatusBadge>{enterpriseCoreT(locale, "tasks.historyBadge")}</StatusBadge>} meta={`${statusLabel(locale, record.status)} · ${priorityLabel(locale, record.priority)}`} description={record.description || formatEnterpriseDate(record.updatedAt, locale)} />)}</BusinessList></ModuleSection> : null}
    <Dialog open={createOpen} onClose={() => setCreateOpen(false)} title={enterpriseCoreT(locale, "requests.new.internal.request")} presentation="editor" className="h-[96dvh] max-w-4xl"><EnterpriseRequestForm locale={locale} members={members} departments={departments} onSubmit={submitCreate} /></Dialog>
    <Dialog open={Boolean(edit)} onClose={() => setEdit(null)} title={enterpriseCoreT(locale, "requests.edit.request")} presentation="editor" className="h-[96dvh] max-w-4xl">{edit ? <EnterpriseRequestForm locale={locale} members={members} departments={departments} value={edit} onSubmit={submitEdit} /> : null}</Dialog>
    <Dialog open={Boolean(activeDetail)} onClose={closeDetail} title={activeDetail?.title || ""} presentation="editor" className="h-[96dvh] max-w-5xl">{activeDetail ? <div className="grid gap-5 text-sm"><div className="grid gap-3 rounded-xl border border-dtsc-border bg-dtsc-page p-4"><div className="flex flex-wrap gap-2"><StatusBadge tone={statusTone(activeDetail.status)}>{statusLabel(locale, activeDetail.status)}</StatusBadge><StatusBadge>{priorityLabel(locale, activeDetail.priority)}</StatusBadge><StatusBadge>{requestTypeLabel(locale, activeDetail.requestType)}</StatusBadge></div><p className="leading-6 text-dtsc-muted">{activeDetail.description}</p><p>{enterpriseCoreT(locale, "tasks.due")} : {formatEnterpriseDate(activeDetail.dueAt, locale)}</p><p>{enterpriseCoreT(locale, "tasks.revision")} : {activeDetail.revision}</p>{activeDetail.sourceEntityType ? <p className="text-xs text-dtsc-muted">{enterpriseCoreT(locale, "tasks.linkedSource")} : {activeDetail.sourceModule} · {activeDetail.sourceEntityType}</p> : null}</div><RequestCoordinationPanel organizationId={organizationId} requestId={activeDetail.id} locale={locale} onChanged={() => setRefreshKey((value) => value + 1)} /></div> : null}</Dialog>
    <Dialog open={Boolean(approvalTarget)} onClose={() => setApprovalTarget(null)} title={enterpriseCoreT(locale, "requests.request.approval")} description={approvalTarget?.title} presentation="editor" className="h-[90dvh] max-w-3xl"><form onSubmit={createApproval} className="grid gap-4"><label className="grid gap-1 text-xs font-black text-dtsc-muted">{enterpriseCoreT(locale, "requests.designated.approver")}<EnterpriseApproverSelect organizationId={organizationId} moduleCode="INTERNAL_REQUESTS" locale={locale} /></label><p className="text-xs leading-5 text-dtsc-muted">{locale === "en" ? "Approval is only available from Submitted or In review. The designated approver is revalidated server-side in this organization." : "La validation n’est disponible que depuis Soumise ou En revue. L’approbateur désigné est revérifié côté serveur dans cette entreprise."}</p><Button className="bg-dtsc-blue text-white">{enterpriseCoreT(locale, "requests.request.approval.2")}</Button></form></Dialog>
    <Dialog open={Boolean(pendingAction)} onClose={closePendingAction} title={enterpriseCoreT(locale, "tasks.confirmAction")} presentation="editor" className="h-[92dvh] max-w-3xl">{pendingAction ? <div className="grid gap-4"><div className="rounded-xl border border-dtsc-border bg-dtsc-page p-4"><div className="flex flex-wrap gap-2"><StatusBadge tone={statusTone(pendingAction.request.status)}>{statusLabel(locale, pendingAction.request.status)}</StatusBadge><StatusBadge>{requestTypeLabel(locale, pendingAction.request.requestType)}</StatusBadge></div><p className="mt-3 font-black text-dtsc-ink">{requestActionLabel(locale, pendingAction.action)}</p><p className="mt-1 text-sm text-dtsc-muted">{pendingAction.request.title}</p><p className="mt-2 text-xs text-dtsc-muted">{locale === "en" ? `Revision ${pendingAction.request.revision}` : `Révision ${pendingAction.request.revision}`}</p></div>{["CANCEL", "ARCHIVE"].includes(pendingAction.action) ? <label className="grid gap-2 text-sm font-black text-dtsc-ink">{locale === "en" ? "Reason *" : "Motif *"}<textarea value={actionComment} onChange={(event) => setActionComment(event.target.value)} aria-invalid={!actionComment.trim()} className="min-h-28 rounded-xl border border-dtsc-border bg-dtsc-surface p-3 font-normal" /><span className="text-xs font-normal text-dtsc-muted">{locale === "en" ? "The reason is written to the operational history and kept if the action fails." : "Le motif est écrit dans l’historique opérationnel et reste saisi si l’action échoue."}</span></label> : null}<Button onClick={() => void runAction()} className="bg-dtsc-blue text-white">{enterpriseCoreT(locale, "common.confirm")}</Button></div> : null}</Dialog>
  </div>;
}

function requestActionLabel(locale: string | null | undefined, action: string) {
  if (action === "SUBMIT") return enterpriseCoreT(locale, "requests.submit");
  if (action === "TAKE") return enterpriseCoreT(locale, "requests.take.ownership");
  if (action === "FULFILL") return enterpriseCoreT(locale, "requests.mark.fulfilled");
  if (action === "CANCEL") return enterpriseCoreT(locale, "common.cancel");
  if (action === "ARCHIVE") return enterpriseCoreT(locale, "common.archive");
  return action;
}

function requestTypeLabel(locale: string | null | undefined, type: string) {
  const en = locale === "en";
  const labels: Record<string, [string, string]> = { GENERAL: ["Générale", "General"], INFORMATION: ["Information", "Information"], DOCUMENT: ["Document", "Document"], VALIDATION: ["Validation", "Approval"], SUPPORT: ["Support", "Support"], ACTION: ["Action", "Action"], MEETING: ["Réunion", "Meeting"], FOLLOW_UP: ["Suivi", "Follow-up"], OTHER: ["Autre", "Other"] };
  return labels[type]?.[en ? 1 : 0] || type;
}

function actionsFor(requestRecord: RequestItem, canManage: boolean, currentUserId: string, locale: string | null | undefined, detail: (item: RequestItem) => void, edit: (item: RequestItem) => void, approval: (item: RequestItem) => void, action: (value: PendingRequestAction) => void): BusinessContextAction[] {
  const isRequester = requestRecord.requestedByUserId === currentUserId;
  const isAssignee = requestRecord.assignedToUserId === currentUserId;
  const items: BusinessContextAction[] = [{ id: "open", label: enterpriseCoreT(locale, "common.open"), icon: Eye, onSelect: () => detail(requestRecord) }];
  if ((isRequester && ["DRAFT", "CORRECTION_REQUESTED"].includes(requestRecord.status)) || (canManage && ["DRAFT", "SUBMITTED", "IN_REVIEW", "IN_PROGRESS", "CORRECTION_REQUESTED"].includes(requestRecord.status))) items.push({ id: "edit", label: enterpriseCoreT(locale, "common.edit"), icon: Pencil, onSelect: () => edit(requestRecord) });
  if (isRequester && requestRecord.status === "DRAFT") items.push({ id: "submit", label: enterpriseCoreT(locale, "requests.submit"), icon: Send, onSelect: () => action({ request: requestRecord, action: "SUBMIT" }) });
  if (requestRecord.status === "SUBMITTED" && (canManage || isAssignee)) items.push({ id: "take", label: enterpriseCoreT(locale, "requests.take.ownership"), icon: UserCheck, onSelect: () => action({ request: requestRecord, action: "TAKE" }) });
  if (["SUBMITTED", "IN_REVIEW"].includes(requestRecord.status) && (canManage || isRequester || isAssignee)) items.push({ id: "approval", label: enterpriseCoreT(locale, "requests.request.approval.3"), icon: ShieldCheck, onSelect: () => approval(requestRecord) });
  if (["IN_REVIEW", "IN_PROGRESS", "APPROVED", "RESOLVED"].includes(requestRecord.status) && (canManage || isAssignee)) items.push({ id: "fulfill", label: enterpriseCoreT(locale, "requests.mark.fulfilled"), icon: CheckCircle2, onSelect: () => action({ request: requestRecord, action: "FULFILL" }) });
  if (["DRAFT", "SUBMITTED", "IN_REVIEW", "IN_PROGRESS", "WAITING_REQUESTER", "CORRECTION_REQUESTED", "APPROVED", "RESOLVED"].includes(requestRecord.status) && (canManage || isRequester)) items.push({ id: "cancel", label: enterpriseCoreT(locale, "common.cancel"), icon: XCircle, destructive: true, separatorBefore: true, onSelect: () => action({ request: requestRecord, action: "CANCEL" }) });
  if (canManage) items.push({ id: "archive", label: enterpriseCoreT(locale, "common.archive"), icon: Archive, separatorBefore: true, onSelect: () => action({ request: requestRecord, action: "ARCHIVE" }) });
  return items;
}
