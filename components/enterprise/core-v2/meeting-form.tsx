"use client";

import { enterpriseCoreT } from "@/lib/enterprise-core-i18n";

import type { FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, NativeSelect, type EnterpriseChoice } from "@/components/enterprise/core-v2/erp-v2-ui";

export type MeetingFormValue = { title?: string; agenda?: string | null; startAt?: string | null; endAt?: string | null; locationMode?: string; physicalLocation?: string | null; meetingLink?: string | null; minutes?: string | null; departmentId?: string | null; participantIds?: string[] };

export function EnterpriseMeetingForm({ locale, members, departments, value, onSubmit }: { locale?: string | null; members: EnterpriseChoice[]; departments: EnterpriseChoice[]; value?: MeetingFormValue; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  const selected = new Set(value?.participantIds || []);
  return <form onSubmit={onSubmit} className="grid gap-4">
    <div className="grid gap-3 md:grid-cols-2">
      <Field label={enterpriseCoreT(locale, "tasks.form.title")}><Input name="title" required minLength={3} defaultValue={value?.title || ""} /></Field>
      <Field label={enterpriseCoreT(locale, "tasks.form.department")}><NativeSelect name="departmentId" defaultValue={value?.departmentId || ""} items={departments} /></Field>
      <Field label={enterpriseCoreT(locale, "meetings.start")}><Input name="startAt" type="datetime-local" required defaultValue={toLocalInput(value?.startAt)} /></Field>
      <Field label={enterpriseCoreT(locale, "meetings.end")}><Input name="endAt" type="datetime-local" required defaultValue={toLocalInput(value?.endAt)} /></Field>
      <Field label={enterpriseCoreT(locale, "meetings.form.mode")}><NativeSelect name="locationMode" required defaultValue={value?.locationMode || "ONLINE"} items={[{ id: "ONLINE", label: enterpriseCoreT(locale, "meeting.locationMode.ONLINE") }, { id: "PHYSICAL", label: enterpriseCoreT(locale, "meetings.form.on.site") }, { id: "HYBRID", label: enterpriseCoreT(locale, "meeting.locationMode.HYBRID") }]} /></Field>
      <Field label={enterpriseCoreT(locale, "meetings.form.physical.location")}><Input name="physicalLocation" defaultValue={value?.physicalLocation || ""} /></Field>
      <Field label={enterpriseCoreT(locale, "meetings.form.meeting.link")}><Input name="meetingLink" type="url" defaultValue={value?.meetingLink || ""} /></Field>
    </div>
    <Field label={enterpriseCoreT(locale, "meetings.form.agenda")}><textarea name="agenda" defaultValue={value?.agenda || ""} className="min-h-28 w-full rounded-xl border border-dtsc-border bg-dtsc-surface p-3 text-sm" /></Field>
    {value ? <Field label={enterpriseCoreT(locale, "meetings.minutes")}><textarea name="minutes" defaultValue={value.minutes || ""} className="min-h-36 w-full rounded-xl border border-dtsc-border bg-dtsc-surface p-3 text-sm" /></Field> : null}
    <Field label={enterpriseCoreT(locale, "meetings.participants.2")} help={enterpriseCoreT(locale, "meetings.form.only.active.organization.members.are.accepted.by.the")}>
      <div className="grid max-h-52 gap-2 overflow-y-auto rounded-xl border border-dtsc-border p-3 sm:grid-cols-2">
        {members.map((member) => <label key={member.id} className="flex min-w-0 items-center gap-2 text-sm"><input type="checkbox" name="participantIds" value={member.id} defaultChecked={selected.has(member.id)} /><span className="min-w-0 truncate">{member.label}</span></label>)}
      </div>
    </Field>
    <Button className="w-full bg-dtsc-blue text-white sm:w-fit">{value ? (enterpriseCoreT(locale, "meetings.form.save.meeting")) : (enterpriseCoreT(locale, "meetings.form.schedule.meeting"))}</Button>
  </form>;
}

function toLocalInput(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
