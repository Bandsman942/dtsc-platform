"use client";

import { formatEnterpriseDate as coreFormatEnterpriseDate, statusLabel as coreStatusLabel } from "@/components/enterprise/core-v2/erp-v2-ui";

import { enterpriseCoreT } from "@/lib/enterprise-core-i18n";

import Link from "next/link";
import { AlertTriangle, Check, FileText, Link2, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/workspace/status-badge";
import type { EnterpriseChoice } from "@/components/enterprise/core-v2/erp-v2-ui";
import { workCoordinationDeepLink } from "@/lib/standard-work-coordination/deep-links";

type MeetingCoordination = {
  agendaItems: Array<{ id: string; title: string; description: string | null; ownerUserId: string | null; durationMinutes: number | null; status: string; position: number }>;
  minutesVersions: Array<{ id: string; versionNumber: number; content: string; status: string; createdAt: string; publishedAt: string | null }>;
  actions: Array<{ id: string; taskId: string; agendaItemId: string | null; createdAt: string }>;
  conflicts: Array<{ id: string; title: string; startAt: string; endAt: string; participantUserIds: string[] }>;
};

type MeetingCoordinationResponse = {
  meeting: { id: string; title: string; participants: Array<{ userId: string }>; organizerUserId: string };
  coordination: MeetingCoordination;
  tasks: Array<{ id: string; title: string; status: string; assignedToUserId: string | null }>;
  capabilities: { canUpdate: boolean; canPublishMinutes: boolean; canCreateFollowUpActions: boolean };
};

export function MeetingCoordinationPanel({ organizationId, meetingId, members, locale, onChanged }: { organizationId: string; meetingId: string; members: EnterpriseChoice[]; locale?: string | null; onChanged?: () => void }) {
  const [data, setData] = useState<MeetingCoordinationResponse | null>(null);
  const [minutes, setMinutes] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const endpoint = `/api/enterprise/${organizationId}/meetings/${meetingId}/coordination`;

  const load = useCallback(async () => {
    setLoading(true);
    const response = await fetch(endpoint, { cache: "no-store" });
    const body = (await response.json().catch(() => null)) as MeetingCoordinationResponse & { message?: string } | null;
    if (!response.ok || !body?.coordination) setMessage(body?.message || (enterpriseCoreT(locale, "meetings.coordination.unable.to.load.meeting.coordination")));
    else {
      setData(body);
      setMinutes(body.coordination.minutesVersions[0]?.content || "");
    }
    setLoading(false);
  }, [endpoint, locale]);

  useEffect(() => { void load(); }, [load]);

  async function mutate(payload: Record<string, unknown>) {
    const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const body = (await response.json().catch(() => null)) as { coordination?: MeetingCoordination; message?: string } | null;
    if (!response.ok || !body?.coordination) {
      setMessage(body?.message || (enterpriseCoreT(locale, "meetings.coordination.meeting.action.failed")));
      return false;
    }
    setData((current) => current ? { ...current, coordination: body.coordination as MeetingCoordination } : current);
    setMessage(enterpriseCoreT(locale, "meetings.coordination.meeting.coordination.updated"));
    onChanged?.();
    return true;
  }

  async function addAgenda(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    if (await mutate({ action: "ADD_AGENDA_ITEM", title: String(values.get("title") || ""), description: String(values.get("description") || ""), ownerUserId: String(values.get("ownerUserId") || "") || undefined, durationMinutes: Number(values.get("durationMinutes") || 0) || undefined, position: data?.coordination.agendaItems.length || 0 })) form.reset();
  }

  async function saveMinutes(publish: boolean) {
    if (!data) return;
    const participantIds = [...new Set([data.meeting.organizerUserId, ...data.meeting.participants.map((participant) => participant.userId)])];
    await mutate({ action: "SAVE_MINUTES", content: minutes, attendeeUserIds: participantIds, absentUserIds: [], publish });
  }

  if (loading) return <p className="text-sm text-dtsc-muted">{enterpriseCoreT(locale, "meetings.coordination.loading.agenda.and.minutes")}</p>;
  if (!data) return <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{message}</p>;

  const taskName = (taskId: string) => data.tasks.find((task) => task.id === taskId)?.title || taskId;
  return <div className="grid min-w-0 gap-5 border-t border-dtsc-border pt-4">
    {message ? <p className="rounded-xl border border-dtsc-border bg-dtsc-page p-3 text-sm text-dtsc-muted" role="status">{message}</p> : null}
    {data.coordination.conflicts.length ? <section className="grid gap-2 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-950"><h4 className="flex items-center gap-2 font-black"><AlertTriangle className="h-4 w-4" />{enterpriseCoreT(locale, "meetings.coordination.scheduling.conflicts")}</h4>{data.coordination.conflicts.map((conflict) => <p key={conflict.id} className="text-sm">{conflict.title} · {coreFormatEnterpriseDate(conflict.startAt, locale)}</p>)}</section> : <p className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"><Check className="h-4 w-4" />{enterpriseCoreT(locale, "meetings.coordination.no.participant.conflict.detected")}</p>}

    <section className="grid gap-3">
      <h4 className="font-black text-dtsc-ink">{enterpriseCoreT(locale, "meetings.coordination.structured.agenda")}</h4>
      {data.coordination.agendaItems.map((item) => <article key={item.id} className="grid gap-2 rounded-xl border border-dtsc-border p-3"><div className="flex min-w-0 flex-wrap items-center gap-2"><StatusBadge>{coreStatusLabel(locale, item.status)}</StatusBadge><h5 className="min-w-0 flex-1 break-words font-black text-dtsc-ink">{item.title}</h5>{item.durationMinutes ? <span className="text-xs text-dtsc-muted">{item.durationMinutes} min</span> : null}{data.capabilities.canUpdate ? <button type="button" onClick={() => void mutate({ action: "DELETE_AGENDA_ITEM", agendaItemId: item.id })} className="flex h-9 w-9 items-center justify-center rounded-xl text-red-600 hover:bg-red-50" aria-label={enterpriseCoreT(locale, "meetings.coordination.delete.agenda.item")}><Trash2 className="h-4 w-4" /></button> : null}</div>{item.description ? <p className="text-sm text-dtsc-muted">{item.description}</p> : null}{data.capabilities.canUpdate ? <div className="flex min-w-0 gap-2 overflow-x-auto pb-1">{["PENDING", "DISCUSSED", "DEFERRED", "CANCELLED"].map((status) => <button key={status} type="button" onClick={() => void mutate({ action: "SET_AGENDA_STATUS", agendaItemId: item.id, status })} className="h-9 shrink-0 rounded-xl border border-dtsc-border px-3 text-xs font-black">{coreStatusLabel(locale, status)}</button>)}</div> : null}</article>)}
      {data.capabilities.canUpdate ? <form onSubmit={addAgenda} className="grid gap-2 sm:grid-cols-2"><Input name="title" required minLength={2} maxLength={240} placeholder={enterpriseCoreT(locale, "meetings.coordination.agenda.topic")} /><Input name="description" maxLength={3000} placeholder={enterpriseCoreT(locale, "tasks.form.description")} /><select name="ownerUserId" defaultValue="" className="h-11 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm"><option value="">{enterpriseCoreT(locale, "meetings.coordination.no.topic.owner")}</option>{members.map((member) => <option key={member.id} value={member.id}>{member.label}</option>)}</select><div className="flex gap-2"><Input name="durationMinutes" type="number" min={1} max={480} placeholder={enterpriseCoreT(locale, "meetings.coordination.minutes")} /><Button type="submit" variant="outline"><Plus className="h-4 w-4" />{enterpriseCoreT(locale, "common.add")}</Button></div></form> : null}
    </section>

    <section className="grid gap-3 border-t border-dtsc-border pt-4">
      <h4 className="flex items-center gap-2 font-black text-dtsc-ink"><FileText className="h-4 w-4" />{enterpriseCoreT(locale, "meetings.coordination.versioned.minutes")}</h4>
      <textarea value={minutes} onChange={(event) => setMinutes(event.target.value)} disabled={!data.capabilities.canUpdate} className="min-h-44 w-full rounded-xl border border-dtsc-border bg-dtsc-surface p-3 text-sm" placeholder={enterpriseCoreT(locale, "meetings.coordination.meeting.minutes.decisions.and.context")} />
      {data.capabilities.canUpdate ? <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={() => void saveMinutes(false)}>{enterpriseCoreT(locale, "meetings.coordination.save.draft.version")}</Button><Button type="button" onClick={() => void saveMinutes(true)} className="bg-dtsc-blue text-white">{enterpriseCoreT(locale, "meetings.coordination.publish.minutes")}</Button></div> : null}
      <div className="grid gap-2">{data.coordination.minutesVersions.map((version) => <div key={version.id} className="rounded-xl border border-dtsc-border p-3 text-sm"><div className="flex flex-wrap items-center gap-2"><StatusBadge>v{version.versionNumber}</StatusBadge><StatusBadge>{coreStatusLabel(locale, version.status)}</StatusBadge><span className="text-dtsc-muted">{coreFormatEnterpriseDate(version.createdAt, locale)}</span></div></div>)}</div>
    </section>

    <section className="grid gap-3 border-t border-dtsc-border pt-4">
      <h4 className="flex items-center gap-2 font-black text-dtsc-ink"><Link2 className="h-4 w-4" />{enterpriseCoreT(locale, "meetings.coordination.follow.up.tasks")}</h4>
      {data.coordination.actions.map((action) => <div key={action.id} className="flex min-w-0 items-center gap-2 rounded-xl border border-dtsc-border p-3"><Link href={workCoordinationDeepLink("TASK", action.taskId)} className="min-w-0 flex-1 break-words text-sm font-bold text-dtsc-blue">{taskName(action.taskId)}</Link>{data.capabilities.canCreateFollowUpActions ? <button type="button" onClick={() => void mutate({ action: "UNLINK_TASK", meetingActionId: action.id })} className="flex h-9 w-9 items-center justify-center rounded-xl text-red-600 hover:bg-red-50" aria-label={enterpriseCoreT(locale, "meetings.coordination.unlink.task")}><Trash2 className="h-4 w-4" /></button> : null}</div>)}
      {data.capabilities.canCreateFollowUpActions ? <form onSubmit={(event) => { event.preventDefault(); const form = event.currentTarget; const values = new FormData(form); void mutate({ action: "LINK_TASK", taskId: String(values.get("taskId") || ""), agendaItemId: String(values.get("agendaItemId") || "") || undefined }).then((ok) => { if (ok) form.reset(); }); }} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"><select name="taskId" required defaultValue="" className="h-11 min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm"><option value="">{enterpriseCoreT(locale, "meetings.coordination.select.task")}</option>{data.tasks.map((task) => <option key={task.id} value={task.id}>{task.title} · {coreStatusLabel(locale, task.status)}</option>)}</select><select name="agendaItemId" defaultValue="" className="h-11 min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm"><option value="">{enterpriseCoreT(locale, "meetings.coordination.no.agenda.topic")}</option>{data.coordination.agendaItems.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select><Button type="submit" variant="outline"><Link2 className="h-4 w-4" />{enterpriseCoreT(locale, "common.link")}</Button></form> : null}
    </section>
  </div>;
}
