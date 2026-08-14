"use client";

import { enterpriseCoreT } from "@/lib/enterprise-core-i18n";

import { Archive, CheckCircle2, Eye, FileCheck2, Pencil, Play, Plus, SquareCheckBig, XCircle } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";
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
import { MeetingCoordinationPanel } from "@/components/enterprise/core-v2/meeting-coordination-panel";
import { EnterpriseTaskForm } from "@/components/enterprise/core-v2/task-form";
import { Field, NativeSelect, formatEnterpriseDate, statusLabel, statusTone, type EnterpriseChoice } from "@/components/enterprise/core-v2/erp-v2-ui";
import { enterpriseV2Mutation, useEnterpriseV2Collection } from "@/components/enterprise/core-v2/use-enterprise-v2-collection";

type Participant = { id: string; userId: string; role: string; responseStatus: string };
type Decision = { id: string; title: string; description: string | null; decidedAt: string; taskId: string | null };
type Meeting = { id: string; title: string; agenda: string | null; organizerUserId: string; startAt: string; endAt: string; status: string; locationMode: string; physicalLocation: string | null; meetingLink: string | null; minutes: string | null; departmentId: string | null; revision: number; participants: Participant[]; decisions: Decision[] };
type LegacyRecord = { id: string; recordType: string; title: string; description: string | null; status: string; updatedAt: string };

export function EnterpriseMeetingsWorkspace({ organizationId, members, departments, canCreate, canManage, locale, legacyRecords = [] }: { organizationId: string; members: EnterpriseChoice[]; departments: EnterpriseChoice[]; canCreate: boolean; canManage: boolean; locale?: string | null; legacyRecords?: LegacyRecord[] }) {
  const en = locale === "en";
  const searchParams = useSearchParams();
  const deepLinkedMeetingId = searchParams.get("meeting");
  const [view, setView] = useState("upcoming");
  const [search, setSearch] = useState("");
  const [participant, setParticipant] = useState("");
  const [department, setDepartment] = useState("");
  const [date, setDate] = useState("");
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState<Meeting | null>(null);
  const [deepLinkResolved, setDeepLinkResolved] = useState(false);
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

  useEffect(() => {
    if (!deepLinkedMeetingId || deepLinkResolved) return;
    const visible = collection.items.find((item) => item.id === deepLinkedMeetingId);
    if (visible) {
      setDetail(visible);
      setDeepLinkResolved(true);
      return;
    }
    if (collection.loading) return;
    void fetch(`/api/enterprise/${organizationId}/meetings/${deepLinkedMeetingId}/coordination`, { cache: "no-store" })
      .then(async (response) => ({ response, body: await response.json().catch(() => null) as { meeting?: Omit<Meeting, "decisions">; message?: string } | null }))
      .then(({ response, body }) => {
        if (response.ok && body?.meeting) setDetail({ ...body.meeting, decisions: [] });
        else setMessage(body?.message || (enterpriseCoreT(locale, "meetings.this.meeting.is.unavailable")));
        setDeepLinkResolved(true);
      });
  }, [collection.items, collection.loading, deepLinkResolved, deepLinkedMeetingId, en, organizationId]);

  function meetingPayload(form: FormData) {
    const payload = Object.fromEntries(form.entries());
    delete payload.participantIds;
    return { ...payload, participants: form.getAll("participantIds").map((userId) => ({ userId: String(userId) })) };
  }

  async function createMeeting(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try { await enterpriseV2Mutation(`/api/enterprise/${organizationId}/meetings`, "POST", meetingPayload(new FormData(event.currentTarget))); setCreateOpen(false); setPage(1); setRefreshKey((value) => value + 1); setMessage(enterpriseCoreT(locale, "meetings.meeting.scheduled")); }
    catch (error) { setMessage(error instanceof Error ? error.message : "ACTION_FAILED"); }
  }

  async function updateMeeting(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!edit) return;
    try { await enterpriseV2Mutation(`/api/enterprise/${organizationId}/meetings/${edit.id}`, "PATCH", { ...meetingPayload(new FormData(event.currentTarget)), revision: edit.revision }); setEdit(null); setDetail(null); setRefreshKey((value) => value + 1); setMessage(enterpriseCoreT(locale, "meetings.meeting.updated")); }
    catch (error) { setMessage(error instanceof Error ? error.message : "ACTION_FAILED"); }
  }

  async function runAction() {
    if (!pendingAction) return;
    try { await enterpriseV2Mutation(`/api/enterprise/${organizationId}/meetings/${pendingAction.meeting.id}/actions`, "POST", { action: pendingAction.action, revision: pendingAction.meeting.revision }); setPendingAction(null); setDetail(null); setRefreshKey((value) => value + 1); setMessage(enterpriseCoreT(locale, "meetings.meeting.action.saved")); }
    catch (error) { setMessage(error instanceof Error ? error.message : "ACTION_FAILED"); }
  }

  async function createDecision(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!decisionMeeting) return;
    try { await enterpriseV2Mutation(`/api/enterprise/${organizationId}/meetings/${decisionMeeting.id}/decisions`, "POST", Object.fromEntries(new FormData(event.currentTarget).entries())); setDecisionMeeting(null); setDetail(null); setRefreshKey((value) => value + 1); setMessage(enterpriseCoreT(locale, "meetings.decision.recorded")); }
    catch (error) { setMessage(error instanceof Error ? error.message : "ACTION_FAILED"); }
  }

  async function createDecisionTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!taskDecision) return;
    try { await enterpriseV2Mutation(`/api/enterprise/${organizationId}/meetings/${taskDecision.meeting.id}/decisions/${taskDecision.decision.id}/task`, "POST", Object.fromEntries(new FormData(event.currentTarget).entries())); setTaskDecision(null); setDetail(null); setRefreshKey((value) => value + 1); setMessage(enterpriseCoreT(locale, "meetings.task.created.from.decision")); }
    catch (error) { setMessage(error instanceof Error ? error.message : "ACTION_FAILED"); }
  }

  return <div className="grid min-w-0 gap-5">
    <ModuleMetrics label={enterpriseCoreT(locale, "meetings.meeting.indicators")}>
      <ModuleMetric label={enterpriseCoreT(locale, "tasks.visible")} value={collection.pagination.total} />
      <ModuleMetric label={enterpriseCoreT(locale, "meetings.scheduled.here")} value={collection.items.filter((item) => item.status === "SCHEDULED").length} />
      <ModuleMetric label={enterpriseCoreT(locale, "meetings.completed.here")} value={collection.items.filter((item) => item.status === "COMPLETED").length} />
      <ModuleMetric label={enterpriseCoreT(locale, "tasks.historicalMetric")} value={legacyRecords.length} />
    </ModuleMetrics>
    <ModuleSection title={enterpriseCoreT(locale, "meetings.meetings.minutes")} description={enterpriseCoreT(locale, "meetings.meetings.own.their.agenda.participants.minutes.and.decisions")} count={`${collection.pagination.total}`} action={canCreate ? <Button onClick={() => setCreateOpen(true)} className="bg-dtsc-blue text-white"><Plus className="h-4 w-4" />{enterpriseCoreT(locale, "meetings.new.meeting")}</Button> : undefined}>
      <div className="grid gap-2 border-y border-dtsc-border py-3 md:grid-cols-3 xl:grid-cols-5">
        <NativeSelect value={view} onChange={(value) => { setView(value || "upcoming"); setPage(1); }} items={[{ id: "upcoming", label: enterpriseCoreT(locale, "meetings.upcoming") }, { id: "past", label: enterpriseCoreT(locale, "meetings.past") }, { id: "cancelled", label: enterpriseCoreT(locale, "meetings.cancelled") }]} />
        <Input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder={enterpriseCoreT(locale, "meetings.search.meetings")} />
        <NativeSelect value={participant} onChange={(value) => { setParticipant(value); setPage(1); }} items={members} />
        <NativeSelect value={department} onChange={(value) => { setDepartment(value); setPage(1); }} items={departments} />
        <Input type="date" value={date} onChange={(event) => { setDate(event.target.value); setPage(1); }} />
      </div>
      {collection.loading ? <p className="py-8 text-center text-sm text-dtsc-muted">{enterpriseCoreT(locale, "common.loading")}</p> : collection.items.length ? <BusinessList ariaLabel={enterpriseCoreT(locale, "meetings.meetings")}>{collection.items.map((meeting) => <BusinessListItem key={meeting.id} title={meeting.title} status={<StatusBadge tone={statusTone(meeting.status)}>{statusLabel(locale, meeting.status)}</StatusBadge>} meta={`${formatEnterpriseDate(meeting.startAt, locale)} · ${meeting.locationMode} · ${meeting.participants.length} ${enterpriseCoreT(locale, "meetings.participants")}`} description={meeting.agenda || (enterpriseCoreT(locale, "meetings.no.agenda"))} onOpen={() => setDetail(meeting)} openLabel={en ? `Open ${meeting.title}` : `Ouvrir ${meeting.title}`} actions={<ContextActions label={enterpriseCoreT(locale, "meetings.meeting.actions")} actions={meetingActions(meeting, Boolean(collection.meta.canManage ?? canManage), currentUserId, en, setDetail, setEdit, setDecisionMeeting, setPendingAction)} />} />)}</BusinessList> : <EmptyState compact title={enterpriseCoreT(locale, "meetings.no.meetings")} description={collection.error || (enterpriseCoreT(locale, "meetings.no.meeting.matches.this.view"))} />}
      <div className="mt-3 flex items-center justify-between border-t border-dtsc-border pt-3 text-sm text-dtsc-muted"><span>Page {collection.pagination.page}/{collection.pagination.pageCount}</span><div className="flex gap-2"><Button variant="outline" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>{enterpriseCoreT(locale, "common.previous")}</Button><Button variant="outline" disabled={page >= collection.pagination.pageCount} onClick={() => setPage((value) => value + 1)}>{enterpriseCoreT(locale, "common.next")}</Button></div></div>
    </ModuleSection>
    {legacyRecords.length ? <ModuleSection title={enterpriseCoreT(locale, "meetings.historical.meetings")} description={enterpriseCoreT(locale, "meetings.legacy.meetings.and.minutes.records.remain.read.only")}><BusinessList ariaLabel="legacy meetings">{legacyRecords.map((record) => <BusinessListItem key={record.id} title={record.title} status={<StatusBadge>{enterpriseCoreT(locale, "tasks.historyBadge")}</StatusBadge>} meta={`${record.recordType} · ${statusLabel(locale, record.status)}`} description={record.description || formatEnterpriseDate(record.updatedAt, locale)} />)}</BusinessList></ModuleSection> : null}
    <Dialog open={createOpen} onClose={() => setCreateOpen(false)} title={enterpriseCoreT(locale, "meetings.new.meeting")} className="h-[94dvh] max-w-4xl"><EnterpriseMeetingForm locale={locale} members={members} departments={departments} onSubmit={createMeeting} /></Dialog>
    <Dialog open={Boolean(edit)} onClose={() => setEdit(null)} title={enterpriseCoreT(locale, "meetings.edit.meeting")} className="h-[94dvh] max-w-4xl">{edit ? <EnterpriseMeetingForm locale={locale} members={members} departments={departments} value={{ ...edit, participantIds: edit.participants.map((item) => item.userId) }} onSubmit={updateMeeting} /> : null}</Dialog>
    <Dialog open={Boolean(detail)} onClose={() => setDetail(null)} title={detail?.title || ""} className="h-[94dvh] max-w-5xl">{detail ? <MeetingDetail organizationId={organizationId} meeting={detail} members={members} locale={locale} onDecision={() => setDecisionMeeting(detail)} onTask={(decision) => setTaskDecision({ meeting: detail, decision })} onChanged={() => setRefreshKey((value) => value + 1)} /> : null}</Dialog>
    <Dialog open={Boolean(pendingAction)} onClose={() => setPendingAction(null)} title={enterpriseCoreT(locale, "meetings.confirm.meeting.action")}><p className="text-sm text-dtsc-muted">{pendingAction?.action} · {pendingAction?.meeting.title}</p><Button onClick={() => void runAction()} className="mt-4 bg-dtsc-blue text-white">{enterpriseCoreT(locale, "common.confirm")}</Button></Dialog>
    <Dialog open={Boolean(decisionMeeting)} onClose={() => setDecisionMeeting(null)} title={enterpriseCoreT(locale, "meetings.record.a.decision")}><form onSubmit={createDecision} className="grid gap-4"><Field label={enterpriseCoreT(locale, "meetings.decision.title")}><Input name="title" required minLength={3} /></Field><Field label={enterpriseCoreT(locale, "tasks.form.description")}><textarea name="description" className="min-h-28 w-full rounded-xl border border-dtsc-border bg-dtsc-surface p-3" /></Field><Button className="bg-dtsc-blue text-white">{enterpriseCoreT(locale, "meetings.save.decision")}</Button></form></Dialog>
    <Dialog open={Boolean(taskDecision)} onClose={() => setTaskDecision(null)} title={enterpriseCoreT(locale, "meetings.create.action.from.decision")} description={taskDecision?.decision.title} className="h-[92dvh] max-w-4xl"><EnterpriseTaskForm locale={locale} members={members} departments={departments} onSubmit={createDecisionTask} /></Dialog>
  </div>;
}

function MeetingDetail({ organizationId, meeting, members, locale, onDecision, onTask, onChanged }: { organizationId: string; meeting: Meeting; members: EnterpriseChoice[]; locale?: string | null; onDecision: () => void; onTask: (decision: Decision) => void; onChanged: () => void }) {
  const en = locale === "en";
  return <div className="grid gap-5 text-sm"><div className="flex flex-wrap gap-2"><StatusBadge tone={statusTone(meeting.status)}>{statusLabel(locale, meeting.status)}</StatusBadge><StatusBadge>{meeting.locationMode}</StatusBadge></div><p className="leading-6 text-dtsc-muted">{meeting.agenda || (enterpriseCoreT(locale, "meetings.no.agenda"))}</p><div className="grid gap-2 border-y border-dtsc-border py-3 sm:grid-cols-2"><span>{enterpriseCoreT(locale, "meetings.start")} : {formatEnterpriseDate(meeting.startAt, locale)}</span><span>{enterpriseCoreT(locale, "meetings.end")} : {formatEnterpriseDate(meeting.endAt, locale)}</span><span>{enterpriseCoreT(locale, "meetings.location")} : {meeting.physicalLocation || meeting.meetingLink || "—"}</span><span>{enterpriseCoreT(locale, "tasks.revision")} : {meeting.revision}</span></div><section><h3 className="mb-2 font-black">{enterpriseCoreT(locale, "meetings.participants.2")}</h3><div className="flex flex-wrap gap-2">{meeting.participants.map((participant) => <StatusBadge key={participant.id}>{members.find((item) => item.id === participant.userId)?.label || participant.userId}</StatusBadge>)}</div></section><section><h3 className="mb-2 font-black">{enterpriseCoreT(locale, "meetings.minutes")}</h3><p className="whitespace-pre-wrap text-dtsc-muted">{meeting.minutes || (enterpriseCoreT(locale, "meetings.no.minutes.yet"))}</p></section><section className="grid gap-2"><div className="flex items-center justify-between"><h3 className="font-black">{enterpriseCoreT(locale, "meetings.decisions")}</h3><Button variant="outline" onClick={onDecision}><Plus className="h-4 w-4" />{enterpriseCoreT(locale, "meetings.decision")}</Button></div>{meeting.decisions.length ? meeting.decisions.map((decision) => <div key={decision.id} className="flex min-w-0 items-start justify-between gap-3 border-t border-dtsc-border py-3"><div className="min-w-0"><p className="font-semibold">{decision.title}</p><p className="text-dtsc-muted">{decision.description || formatEnterpriseDate(decision.decidedAt, locale)}</p></div>{decision.taskId ? <StatusBadge tone="success">{enterpriseCoreT(locale, "meetings.task.linked")}</StatusBadge> : <Button variant="outline" size="sm" onClick={() => onTask(decision)}><SquareCheckBig className="h-4 w-4" />{enterpriseCoreT(locale, "meetings.create.task")}</Button>}</div>) : <p className="text-dtsc-muted">{enterpriseCoreT(locale, "meetings.no.decision.recorded")}</p>}</section><MeetingCoordinationPanel organizationId={organizationId} meetingId={meeting.id} members={members} locale={locale} onChanged={onChanged} /></div>;
}

function meetingActions(meeting: Meeting, canManage: boolean, currentUserId: string, en: boolean, detail: (item: Meeting) => void, edit: (item: Meeting) => void, decision: (item: Meeting) => void, action: (value: { meeting: Meeting; action: string }) => void): BusinessContextAction[] {
  const organizer = meeting.organizerUserId === currentUserId;
  const canOperate = canManage || organizer;
  const items: BusinessContextAction[] = [{ id: "open", label: enterpriseCoreT(locale, "common.open"), icon: Eye, onSelect: () => detail(meeting) }];
  if (canOperate && meeting.status !== "CANCELLED") items.push({ id: "edit", label: enterpriseCoreT(locale, "meetings.edit.minutes"), icon: Pencil, onSelect: () => edit(meeting) });
  if (canOperate && meeting.status === "SCHEDULED") items.push({ id: "start", label: enterpriseCoreT(locale, "common.start"), icon: Play, onSelect: () => action({ meeting, action: "START" }) });
  if (canOperate && meeting.status === "IN_PROGRESS") items.push({ id: "complete", label: enterpriseCoreT(locale, "common.complete"), icon: CheckCircle2, onSelect: () => action({ meeting, action: "COMPLETE" }) });
  if (canOperate && meeting.status !== "CANCELLED") items.push({ id: "decision", label: enterpriseCoreT(locale, "meetings.record.decision"), icon: FileCheck2, onSelect: () => decision(meeting) });
  if (canOperate && ["SCHEDULED", "IN_PROGRESS"].includes(meeting.status)) items.push({ id: "cancel", label: enterpriseCoreT(locale, "common.cancel"), icon: XCircle, destructive: true, separatorBefore: true, onSelect: () => action({ meeting, action: "CANCEL" }) });
  if (canManage) items.push({ id: "archive", label: enterpriseCoreT(locale, "common.archive"), icon: Archive, separatorBefore: true, onSelect: () => action({ meeting, action: "ARCHIVE" }) });
  return items;
}
