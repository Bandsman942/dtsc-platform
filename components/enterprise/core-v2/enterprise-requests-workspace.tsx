"use client";

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
import { Field, NativeSelect, formatEnterpriseDate, priorityChoicesEn, priorityChoicesFr, priorityLabel, statusLabel, statusTone, type EnterpriseChoice } from "@/components/enterprise/core-v2/erp-v2-ui";
import { enterpriseV2Mutation, useEnterpriseV2Collection } from "@/components/enterprise/core-v2/use-enterprise-v2-collection";

type RequestItem = { id: string; requestType: string; title: string; description: string; status: string; priority: string; requestedByUserId: string; assignedToUserId: string | null; departmentId: string | null; dueAt: string | null; sourceModule: string | null; sourceEntityType: string | null; revision: number; createdAt: string };
type LegacyRecord = { id: string; title: string; description: string | null; status: string; priority: string; updatedAt: string };
const requestStatuses = ["DRAFT", "SUBMITTED", "TRIAGED", "ASSIGNED", "IN_REVIEW", "IN_PROGRESS", "WAITING_REQUESTER", "WAITING_APPROVAL", "CORRECTION_REQUESTED", "APPROVED", "REJECTED", "RESOLVED", "FULFILLED", "CLOSED", "REOPENED", "CANCELLED"];

export function EnterpriseRequestsWorkspace({ organizationId, members, departments, canCreate, canManage, locale, legacyRecords = [] }: { organizationId: string; members: EnterpriseChoice[]; departments: EnterpriseChoice[]; canCreate: boolean; canManage: boolean; locale?: string | null; legacyRecords?: LegacyRecord[] }) {
  const en = locale === "en";
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
  const [pendingAction, setPendingAction] = useState<{ request: RequestItem; action: string } | null>(null);
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
  const focusedRequest = deepLinkedRequestId && dismissedDeepLinkId !== deepLinkedRequestId
    ? collection.items.find((item) => item.id === deepLinkedRequestId) || null
    : null;
  const activeDetail = detail || focusedRequest;

  async function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try { await enterpriseV2Mutation(`/api/enterprise/${organizationId}/requests`, "POST", Object.fromEntries(new FormData(event.currentTarget).entries())); setCreateOpen(false); setPage(1); setRefreshKey((value) => value + 1); setMessage(en ? "Draft created." : "Brouillon créé."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "ACTION_FAILED"); }
  }

  async function submitEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!edit) return;
    try { await enterpriseV2Mutation(`/api/enterprise/${organizationId}/requests/${edit.id}`, "PATCH", { ...Object.fromEntries(new FormData(event.currentTarget).entries()), revision: edit.revision }); setEdit(null); setDetail(null); setRefreshKey((value) => value + 1); setMessage(en ? "Request updated." : "Demande mise à jour."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "ACTION_FAILED"); }
  }

  async function runAction() {
    if (!pendingAction) return;
    try { await enterpriseV2Mutation(`/api/enterprise/${organizationId}/requests/${pendingAction.request.id}/actions`, "POST", { action: pendingAction.action, revision: pendingAction.request.revision }); setPendingAction(null); setDetail(null); setRefreshKey((value) => value + 1); setMessage(en ? "Request action saved." : "Action enregistrée."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "ACTION_FAILED"); }
  }

  async function createApproval(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!approvalTarget) return;
    const approverUserId = String(new FormData(event.currentTarget).get("approverUserId") || "");
    try { await enterpriseV2Mutation(`/api/enterprise/${organizationId}/approvals`, "POST", { targetEntityType: "EnterpriseRequest", targetEntityId: approvalTarget.id, approverUserId }); setApprovalTarget(null); setDetail(null); setRefreshKey((value) => value + 1); setMessage(en ? "Approval requested." : "Validation demandée."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "ACTION_FAILED"); }
  }

  function closeDetail() {
    setDetail(null);
    if (deepLinkedRequestId) setDismissedDeepLinkId(deepLinkedRequestId);
  }

  return <div className="grid min-w-0 gap-5">
    <ModuleMetrics label={en ? "Request indicators" : "Indicateurs demandes"}>
      <ModuleMetric label={en ? "Visible" : "Visibles"} value={collection.pagination.total} />
      <ModuleMetric label={en ? "Submitted" : "Soumises"} value={collection.items.filter((item) => item.status === "SUBMITTED").length} />
      <ModuleMetric label={en ? "Waiting requester" : "Attente demandeur"} value={collection.items.filter((item) => item.status === "WAITING_REQUESTER").length} />
      <ModuleMetric label={en ? "Historical" : "Historiques"} value={legacyRecords.length} />
    </ModuleMetrics>
    <ModuleSection title={en ? "Internal requests" : "Demandes internes"} description={en ? "Self-service requests with information, resolution, closure and reopening flows." : "Demandes self-service avec information, résolution, clôture et réouverture historisées."} count={`${collection.pagination.total}`} action={canCreate ? <Button onClick={() => setCreateOpen(true)} className="bg-dtsc-blue text-white"><Plus className="h-4 w-4" />{en ? "New request" : "Nouvelle demande"}</Button> : undefined}>
      <div className="grid gap-2 border-y border-dtsc-border py-3 md:grid-cols-3 xl:grid-cols-5">
        <Input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder={en ? "Search requests…" : "Rechercher une demande…"} />
        <NativeSelect value={status} onChange={(value) => { setStatus(value); setPage(1); }} items={[{ id: "", label: en ? "All statuses" : "Tous les statuts" }, ...requestStatuses.map((id) => ({ id, label: statusLabel(locale, id) }))]} />
        <Input value={type} onChange={(event) => { setType(event.target.value); setPage(1); }} placeholder={en ? "Request type" : "Type de demande"} />
        <NativeSelect value={priority} onChange={(value) => { setPriority(value); setPage(1); }} items={en ? priorityChoicesEn : priorityChoicesFr} />
        <NativeSelect value={department} onChange={(value) => { setDepartment(value); setPage(1); }} items={departments} />
      </div>
      {collection.loading ? <p className="py-8 text-center text-sm text-dtsc-muted">{en ? "Loading…" : "Chargement…"}</p> : collection.items.length ? <BusinessList ariaLabel={en ? "Requests" : "Demandes"}>{collection.items.map((requestRecord) => <BusinessListItem key={requestRecord.id} title={requestRecord.title} status={<StatusBadge tone={statusTone(requestRecord.status)}>{statusLabel(locale, requestRecord.status)}</StatusBadge>} meta={`${requestRecord.requestType} · ${priorityLabel(locale, requestRecord.priority)} · ${formatEnterpriseDate(requestRecord.createdAt, locale)}`} description={requestRecord.description} onOpen={() => setDetail(requestRecord)} openLabel={en ? `Open ${requestRecord.title}` : `Ouvrir ${requestRecord.title}`} actions={<ContextActions label={en ? "Request actions" : "Actions demande"} actions={actionsFor(requestRecord, canManage, en, setDetail, setEdit, setApprovalTarget, setPendingAction)} />} />)}</BusinessList> : <EmptyState compact title={en ? "No requests" : "Aucune demande"} description={collection.error || (deepLinkedRequestId ? (en ? "This request is unavailable or no longer accessible." : "Cette demande est indisponible ou n’est plus accessible.") : (en ? "No request matches the current filters." : "Aucune demande ne correspond aux filtres."))} />}
      <div className="mt-3 flex items-center justify-between border-t border-dtsc-border pt-3 text-sm text-dtsc-muted"><span>Page {collection.pagination.page}/{collection.pagination.pageCount}</span><div className="flex gap-2"><Button variant="outline" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>{en ? "Previous" : "Précédent"}</Button><Button variant="outline" disabled={page >= collection.pagination.pageCount} onClick={() => setPage((value) => value + 1)}>{en ? "Next" : "Suivant"}</Button></div></div>
    </ModuleSection>
    {legacyRecords.length ? <ModuleSection title={en ? "Historical requests" : "Historique des demandes"} description={en ? "Legacy requests remain readable and read-only." : "Les anciennes demandes restent lisibles et non modifiables."}><BusinessList ariaLabel="legacy requests">{legacyRecords.map((record) => <BusinessListItem key={record.id} title={record.title} status={<StatusBadge>{en ? "History" : "Historique"}</StatusBadge>} meta={`${statusLabel(locale, record.status)} · ${priorityLabel(locale, record.priority)}`} description={record.description || formatEnterpriseDate(record.updatedAt, locale)} />)}</BusinessList></ModuleSection> : null}
    <Dialog open={createOpen} onClose={() => setCreateOpen(false)} title={en ? "New internal request" : "Nouvelle demande interne"} className="h-[94dvh] max-w-4xl"><EnterpriseRequestForm locale={locale} members={members} departments={departments} onSubmit={submitCreate} /></Dialog>
    <Dialog open={Boolean(edit)} onClose={() => setEdit(null)} title={en ? "Edit request" : "Modifier la demande"} className="h-[94dvh] max-w-4xl">{edit ? <EnterpriseRequestForm locale={locale} members={members} departments={departments} value={edit} onSubmit={submitEdit} /> : null}</Dialog>
    <Dialog open={Boolean(activeDetail)} onClose={closeDetail} title={activeDetail?.title || ""} className="h-[94dvh] max-w-5xl">{activeDetail ? <div className="grid gap-5 text-sm"><div className="grid gap-3"><div className="flex flex-wrap gap-2"><StatusBadge tone={statusTone(activeDetail.status)}>{statusLabel(locale, activeDetail.status)}</StatusBadge><StatusBadge>{priorityLabel(locale, activeDetail.priority)}</StatusBadge><StatusBadge>{activeDetail.requestType}</StatusBadge></div><p className="leading-6 text-dtsc-muted">{activeDetail.description}</p><p>{en ? "Due" : "Échéance"} : {formatEnterpriseDate(activeDetail.dueAt, locale)}</p><p>{en ? "Revision" : "Révision"} : {activeDetail.revision}</p>{activeDetail.sourceEntityType ? <p className="text-xs text-dtsc-muted">{en ? "Linked source" : "Source liée"} : {activeDetail.sourceModule} · {activeDetail.sourceEntityType}</p> : null}</div><RequestCoordinationPanel organizationId={organizationId} requestId={activeDetail.id} locale={locale} onChanged={() => setRefreshKey((value) => value + 1)} /></div> : null}</Dialog>
    <Dialog open={Boolean(approvalTarget)} onClose={() => setApprovalTarget(null)} title={en ? "Request approval" : "Créer une validation"} description={approvalTarget?.title}><form onSubmit={createApproval} className="grid gap-4"><Field label={en ? "Designated approver" : "Approbateur désigné"}><NativeSelect name="approverUserId" required items={members} /></Field><Button className="bg-dtsc-blue text-white">{en ? "Request approval" : "Demander la validation"}</Button></form></Dialog>
    <Dialog open={Boolean(pendingAction)} onClose={() => setPendingAction(null)} title={en ? "Confirm action" : "Confirmer l’action"}><p className="text-sm text-dtsc-muted">{pendingAction?.action} · {pendingAction?.request.title}</p><Button onClick={() => void runAction()} className="mt-4 bg-dtsc-blue text-white">{en ? "Confirm" : "Confirmer"}</Button></Dialog>
  </div>;
}

function actionsFor(requestRecord: RequestItem, canManage: boolean, en: boolean, detail: (item: RequestItem) => void, edit: (item: RequestItem) => void, approval: (item: RequestItem) => void, action: (value: { request: RequestItem; action: string }) => void): BusinessContextAction[] {
  const items: BusinessContextAction[] = [{ id: "open", label: en ? "Open" : "Ouvrir", icon: Eye, onSelect: () => detail(requestRecord) }];
  if (requestRecord.status === "DRAFT" || requestRecord.status === "CORRECTION_REQUESTED" || canManage) items.push({ id: "edit", label: en ? "Edit" : "Modifier", icon: Pencil, onSelect: () => edit(requestRecord) });
  if (requestRecord.status === "DRAFT") items.push({ id: "submit", label: en ? "Submit" : "Soumettre", icon: Send, onSelect: () => action({ request: requestRecord, action: "SUBMIT" }) });
  if (requestRecord.status === "SUBMITTED") items.push({ id: "take", label: en ? "Take ownership" : "Prendre en charge", icon: UserCheck, onSelect: () => action({ request: requestRecord, action: "TAKE" }) });
  if (["SUBMITTED", "IN_REVIEW", "ASSIGNED", "IN_PROGRESS"].includes(requestRecord.status)) items.push({ id: "approval", label: en ? "Request approval" : "Créer validation", icon: ShieldCheck, onSelect: () => approval(requestRecord) });
  if (["IN_REVIEW", "APPROVED"].includes(requestRecord.status)) items.push({ id: "fulfill", label: en ? "Mark fulfilled" : "Marquer traitée", icon: CheckCircle2, onSelect: () => action({ request: requestRecord, action: "FULFILL" }) });
  if (["DRAFT", "SUBMITTED", "IN_REVIEW", "ASSIGNED", "IN_PROGRESS", "WAITING_REQUESTER"].includes(requestRecord.status)) items.push({ id: "cancel", label: en ? "Cancel" : "Annuler", icon: XCircle, destructive: true, separatorBefore: true, onSelect: () => action({ request: requestRecord, action: "CANCEL" }) });
  if (canManage) items.push({ id: "archive", label: en ? "Archive" : "Archiver", icon: Archive, separatorBefore: true, onSelect: () => action({ request: requestRecord, action: "ARCHIVE" }) });
  return items;
}
