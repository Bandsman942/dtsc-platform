"use client";

import { Archive, CheckCircle2, Eye, FileCheck2, Pencil, Play, Plus, SquareCheckBig, XCircle } from "lucide-react";
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
import { EnterpriseMeetingForm } from "@/components/enterprise/core-v2/meeting-form";
import { EnterpriseTaskForm } from "@/components/enterprise/core-v2/task-form";
import { Field, NativeSelect, formatEnterpriseDate, statusLabel, statusTone, type EnterpriseChoice } from "@/components/enterprise/core-v2/erp-v2-ui";
import { enterpriseV2Mutation, useEnterpriseV2Collection } from "@/components/enterprise/core-v2/use-enterprise-v2-collection";

type Participant = { id: string; userId: string; role: string; responseStatus: string };
type Decision = { id: string; title: string; description: string | null; decidedAt: string; taskId: string | null };
type Meeting = { id: string; title: string; agenda: string | null; organizerUserId: string; startAt: string; endAt: string; status: string; locationMode: string; physicalLocation: string | null; meetingLink: string | null; minutes: string | null; departmentId: string | null; revision: number; participants: Participant[]; decisions: Decision[] };
type LegacyRecord = { id: string; recordType: string; title: string; description: string | null; status: string; updatedAt: string };

export function EnterpriseMeetingsWorkspace({ organizationId, members, departments, canCreate, canManage, locale, legacyRecords = [] }: { organizationId: string; members: EnterpriseChoice[]; departments: EnterpriseChoice[]; canCreate: boolean; canManage: boolean; locale?: string | null; legacyRecords?: LegacyRecord[] }) {
  const en = locale === "en";
  const [view, setView] = useState("upcoming");
  const [search, setSearch] = useState("");
  const [participant, setParticipant] = useState("");
  const [department, setDepartment] = useState("");
  const [date, setDate] = useState("");
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState<Meeting | null>(null);
  const [edit, setEdit] = useState<Meeting | null>(null);
  const [pendingAction, setPendingAction] = useState<{ meeting: Meeting; action: string } | null>(null);
  const [decisionMeeting, setDecisionMeeting] = useState<Meeting | null>(null);
  const [taskDecision, setTaskDecision] = useState<{ meeting: Meeting; decision: Decision } | null>(null);
  const [message, setMessage] = useState("");
  useToastMessage(message);
  const params = useMemo(() => {
    const value = new URLSearchParams({ page: String(page), pageSize: "20", view });
    if (search.trim()) value.set("search", search.trim());
    if (participant) value.set("participant", participant);
    if (department) value.set("department", department);
    if (date) value.set("date", date);
    return value;
  }, [date, department, page, participant, search, view]);
  const collection = useEnterpriseV2Collection<Meeting>({ endpoint: `/api/enterprise/${organizationId}/meetings`, params, refreshKey });
  const currentUserId = collection.meta.currentUserId || "";

  function meetingPayload(form: FormData) {
    const payload = Object.fromEntries(form.entries());
    delete payload.participantIds;
    return { ...payload, participants: form.getAll("participantIds").map((userId) => ({ userId: String(userId) })) };
  }

  async function createMeeting(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try { await enterpriseV2Mutation(`/api/enterprise/${organizationId}/meetings`, "POST", meetingPayload(new FormData(event.currentTarget))); setCreateOpen(false); setPage(1); setRefreshKey((value) => value + 1); setMessage(en ? "Meeting scheduled." : "Réunion planifiée."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "ACTION_FAILED"); }
  }

  async function updateMeeting(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!edit) return;
    try { await enterpriseV2Mutation(`/api/enterprise/${organizationId}/meetings/${edit.id}`, "PATCH", { ...meetingPayload(new FormData(event.currentTarget)), revision: edit.revision }); setEdit(null); setDetail(null); setRefreshKey((value) => value + 1); setMessage(en ? "Meeting updated." : "Réunion mise à jour."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "ACTION_FAILED"); }
  }

  async function runAction() {
    if (!pendingAction) return;
    try { await enterpriseV2Mutation(`/api/enterprise/${organizationId}/meetings/${pendingAction.meeting.id}/actions`, "POST", { action: pendingAction.action, revision: pendingAction.meeting.revision }); setPendingAction(null); setDetail(null); setRefreshKey((value) => value + 1); setMessage(en ? "Meeting action saved." : "Action enregistrée."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "ACTION_FAILED"); }
  }

  async function createDecision(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!decisionMeeting) return;
    try { await enterpriseV2Mutation(`/api/enterprise/${organizationId}/meetings/${decisionMeeting.id}/decisions`, "POST", Object.fromEntries(new FormData(event.currentTarget).entries())); setDecisionMeeting(null); setDetail(null); setRefreshKey((value) => value + 1); setMessage(en ? "Decision recorded." : "Décision enregistrée."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "ACTION_FAILED"); }
  }

  async function createDecisionTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!taskDecision) return;
    try { await enterpriseV2Mutation(`/api/enterprise/${organizationId}/meetings/${taskDecision.meeting.id}/decisions/${taskDecision.decision.id}/task`, "POST", Object.fromEntries(new FormData(event.currentTarget).entries())); setTaskDecision(null); setDetail(null); setRefreshKey((value) => value + 1); setMessage(en ? "Task created from decision." : "Tâche créée depuis la décision."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "ACTION_FAILED"); }
  }

  return <div className="grid min-w-0 gap-5">
    <ModuleMetrics label={en ? "Meeting indicators" : "Indicateurs réunions"}>
      <ModuleMetric label={en ? "Visible" : "Visibles"} value={collection.pagination.total} />
      <ModuleMetric label={en ? "Scheduled here" : "Planifiées ici"} value={collection.items.filter((item) => item.status === "SCHEDULED").length} />
      <ModuleMetric label={en ? "Completed here" : "Terminées ici"} value={collection.items.filter((item) => item.status === "COMPLETED").length} />
      <ModuleMetric label={en ? "Historical" : "Historiques"} value={legacyRecords.length} />
    </ModuleMetrics>
    <ModuleSection title={en ? "Meetings & minutes" : "Réunions & comptes rendus"} description={en ? "Meetings own their agenda, participants, minutes and decisions." : "Les réunions portent directement leur ordre du jour, participants, compte rendu et décisions."} count={`${collection.pagination.total}`} action={canCreate ? <Button onClick={() => setCreateOpen(true)} className="bg-dtsc-blue text-white"><Plus className="h-4 w-4" />{en ? "New meeting" : "Nouvelle réunion"}</Button> : undefined}>
      <div className="grid gap-2 border-y border-dtsc-border py-3 md:grid-cols-3 xl:grid-cols-5">
        <NativeSelect value={view} onChange={(value) => { setView(value || "upcoming"); setPage(1); }} items={[{ id: "upcoming", label: en ? "Upcoming" : "À venir" }, { id: "past", label: en ? "Past" : "Passées" }, { id: "cancelled", label: en ? "Cancelled" : "Annulées" }]} />
        <Input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder={en ? "Search meetings…" : "Rechercher une réunion…"} />
        <NativeSelect value={participant} onChange={(value) => { setParticipant(value); setPage(1); }} items={members} />
        <NativeSelect value={department} onChange={(value) => { setDepartment(value); setPage(1); }} items={departments} />
        <Input type="date" value={date} onChange={(event) => { setDate(event.target.value); setPage(1); }} />
      </div>
      {collection.loading ? <p className="py-8 text-center text-sm text-dtsc-muted">{en ? "Loading…" : "Chargement…"}</p> : collection.items.length ? <BusinessList ariaLabel={en ? "Meetings" : "Réunions"}>{collection.items.map((meeting) => <BusinessListItem key={meeting.id} title={meeting.title} status={<StatusBadge tone={statusTone(meeting.status)}>{statusLabel(locale, meeting.status)}</StatusBadge>} meta={`${formatEnterpriseDate(meeting.startAt, locale)} · ${meeting.locationMode} · ${meeting.participants.length} ${en ? "participants" : "participants"}`} description={meeting.agenda || (en ? "No agenda." : "Aucun ordre du jour.")} onOpen={() => setDetail(meeting)} openLabel={en ? `Open ${meeting.title}` : `Ouvrir ${meeting.title}`} actions={<ContextActions label={en ? "Meeting actions" : "Actions réunion"} actions={meetingActions(meeting, Boolean(collection.meta.canManage ?? canManage), currentUserId, en, setDetail, setEdit, setDecisionMeeting, setPendingAction)} />} />)}</BusinessList> : <EmptyState compact title={en ? "No meetings" : "Aucune réunion"} description={collection.error || (en ? "No meeting matches this view." : "Aucune réunion ne correspond à cette vue.")} />}
      <div className="mt-3 flex items-center justify-between border-t border-dtsc-border pt-3 text-sm text-dtsc-muted"><span>Page {collection.pagination.page}/{collection.pagination.pageCount}</span><div className="flex gap-2"><Button variant="outline" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>{en ? "Previous" : "Précédent"}</Button><Button variant="outline" disabled={page >= collection.pagination.pageCount} onClick={() => setPage((value) => value + 1)}>{en ? "Next" : "Suivant"}</Button></div></div>
    </ModuleSection>
    {legacyRecords.length ? <ModuleSection title={en ? "Historical meetings" : "Historique des réunions"} description={en ? "Legacy meetings and MINUTES records remain read-only." : "Les anciennes réunions et pseudo-MINUTES restent en lecture seule."}><BusinessList ariaLabel="legacy meetings">{legacyRecords.map((record) => <BusinessListItem key={record.id} title={record.title} status={<StatusBadge>{en ? "History" : "Historique"}</StatusBadge>} meta={`${record.recordType} · ${statusLabel(locale, record.status)}`} description={record.description || formatEnterpriseDate(record.updatedAt, locale)} />)}</BusinessList></ModuleSection> : null}
    <Dialog open={createOpen} onClose={() => setCreateOpen(false)} title={en ? "New meeting" : "Nouvelle réunion"} className="h-[94dvh] max-w-4xl"><EnterpriseMeetingForm locale={locale} members={members} departments={departments} onSubmit={createMeeting} /></Dialog>
    <Dialog open={Boolean(edit)} onClose={() => setEdit(null)} title={en ? "Edit meeting" : "Modifier la réunion"} className="h-[94dvh] max-w-4xl">{edit ? <EnterpriseMeetingForm locale={locale} members={members} departments={departments} value={{ ...edit, participantIds: edit.participants.map((item) => item.userId) }} onSubmit={updateMeeting} /> : null}</Dialog>
    <Dialog open={Boolean(detail)} onClose={() => setDetail(null)} title={detail?.title || ""} className="h-[92dvh] max-w-4xl">{detail ? <MeetingDetail meeting={detail} members={members} locale={locale} onDecision={() => setDecisionMeeting(detail)} onTask={(decision) => setTaskDecision({ meeting: detail, decision })} /> : null}</Dialog>
    <Dialog open={Boolean(pendingAction)} onClose={() => setPendingAction(null)} title={en ? "Confirm meeting action" : "Confirmer l’action réunion"}><p className="text-sm text-dtsc-muted">{pendingAction?.action} · {pendingAction?.meeting.title}</p><Button onClick={() => void runAction()} className="mt-4 bg-dtsc-blue text-white">{en ? "Confirm" : "Confirmer"}</Button></Dialog>
    <Dialog open={Boolean(decisionMeeting)} onClose={() => setDecisionMeeting(null)} title={en ? "Record a decision" : "Enregistrer une décision"}><form onSubmit={createDecision} className="grid gap-4"><Field label={en ? "Decision title" : "Titre de la décision"}><Input name="title" required minLength={3} /></Field><Field label={en ? "Description" : "Description"}><textarea name="description" className="min-h-28 w-full rounded-xl border border-dtsc-border bg-dtsc-surface p-3" /></Field><Button className="bg-dtsc-blue text-white">{en ? "Save decision" : "Enregistrer"}</Button></form></Dialog>
    <Dialog open={Boolean(taskDecision)} onClose={() => setTaskDecision(null)} title={en ? "Create action from decision" : "Créer une tâche depuis la décision"} description={taskDecision?.decision.title} className="h-[92dvh] max-w-4xl"><EnterpriseTaskForm locale={locale} members={members} departments={departments} onSubmit={createDecisionTask} /></Dialog>
  </div>;
}

function MeetingDetail({ meeting, members, locale, onDecision, onTask }: { meeting: Meeting; members: EnterpriseChoice[]; locale?: string | null; onDecision: () => void; onTask: (decision: Decision) => void }) {
  const en = locale === "en";
  return <div className="grid gap-5 text-sm"><div className="flex flex-wrap gap-2"><StatusBadge tone={statusTone(meeting.status)}>{statusLabel(locale, meeting.status)}</StatusBadge><StatusBadge>{meeting.locationMode}</StatusBadge></div><p className="leading-6 text-dtsc-muted">{meeting.agenda || (en ? "No agenda." : "Aucun ordre du jour.")}</p><div className="grid gap-2 border-y border-dtsc-border py-3 sm:grid-cols-2"><span>{en ? "Start" : "Début"} : {formatEnterpriseDate(meeting.startAt, locale)}</span><span>{en ? "End" : "Fin"} : {formatEnterpriseDate(meeting.endAt, locale)}</span><span>{en ? "Location" : "Lieu"} : {meeting.physicalLocation || meeting.meetingLink || "—"}</span><span>{en ? "Revision" : "Révision"} : {meeting.revision}</span></div><section><h3 className="mb-2 font-black">{en ? "Participants" : "Participants"}</h3><div className="flex flex-wrap gap-2">{meeting.participants.map((participant) => <StatusBadge key={participant.id}>{members.find((item) => item.id === participant.userId)?.label || participant.userId}</StatusBadge>)}</div></section><section><h3 className="mb-2 font-black">{en ? "Minutes" : "Compte rendu"}</h3><p className="whitespace-pre-wrap text-dtsc-muted">{meeting.minutes || (en ? "No minutes yet." : "Aucun compte rendu pour le moment.")}</p></section><section className="grid gap-2"><div className="flex items-center justify-between"><h3 className="font-black">{en ? "Decisions" : "Décisions"}</h3><Button variant="outline" onClick={onDecision}><Plus className="h-4 w-4" />{en ? "Decision" : "Décision"}</Button></div>{meeting.decisions.length ? meeting.decisions.map((decision) => <div key={decision.id} className="flex min-w-0 items-start justify-between gap-3 border-t border-dtsc-border py-3"><div className="min-w-0"><p className="font-semibold">{decision.title}</p><p className="text-dtsc-muted">{decision.description || formatEnterpriseDate(decision.decidedAt, locale)}</p></div>{decision.taskId ? <StatusBadge tone="success">{en ? "Task linked" : "Tâche liée"}</StatusBadge> : <Button variant="outline" size="sm" onClick={() => onTask(decision)}><SquareCheckBig className="h-4 w-4" />{en ? "Create task" : "Créer tâche"}</Button>}</div>) : <p className="text-dtsc-muted">{en ? "No decision recorded." : "Aucune décision enregistrée."}</p>}</section></div>;
}

function meetingActions(meeting: Meeting, canManage: boolean, currentUserId: string, en: boolean, detail: (item: Meeting) => void, edit: (item: Meeting) => void, decision: (item: Meeting) => void, action: (value: { meeting: Meeting; action: string }) => void): BusinessContextAction[] {
  const organizer = meeting.organizerUserId === currentUserId;
  const canOperate = canManage || organizer;
  const items: BusinessContextAction[] = [{ id: "open", label: en ? "Open" : "Ouvrir", icon: Eye, onSelect: () => detail(meeting) }];
  if (canOperate && meeting.status !== "CANCELLED") items.push({ id: "edit", label: en ? "Edit / minutes" : "Modifier / compte rendu", icon: Pencil, onSelect: () => edit(meeting) });
  if (canOperate && meeting.status === "SCHEDULED") items.push({ id: "start", label: en ? "Start" : "Démarrer", icon: Play, onSelect: () => action({ meeting, action: "START" }) });
  if (canOperate && meeting.status === "IN_PROGRESS") items.push({ id: "complete", label: en ? "Complete" : "Terminer", icon: CheckCircle2, onSelect: () => action({ meeting, action: "COMPLETE" }) });
  if (canOperate && meeting.status !== "CANCELLED") items.push({ id: "decision", label: en ? "Record decision" : "Ajouter décision", icon: FileCheck2, onSelect: () => decision(meeting) });
  if (canOperate && ["SCHEDULED", "IN_PROGRESS"].includes(meeting.status)) items.push({ id: "cancel", label: en ? "Cancel" : "Annuler", icon: XCircle, destructive: true, separatorBefore: true, onSelect: () => action({ meeting, action: "CANCEL" }) });
  if (canManage) items.push({ id: "archive", label: en ? "Archive" : "Archiver", icon: Archive, separatorBefore: true, onSelect: () => action({ meeting, action: "ARCHIVE" }) });
  return items;
}
