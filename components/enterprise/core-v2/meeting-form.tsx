"use client";

import type { FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, NativeSelect, type EnterpriseChoice } from "@/components/enterprise/core-v2/erp-v2-ui";

export type MeetingFormValue = { title?: string; agenda?: string | null; startAt?: string | null; endAt?: string | null; locationMode?: string; physicalLocation?: string | null; meetingLink?: string | null; minutes?: string | null; departmentId?: string | null; participantIds?: string[] };

export function EnterpriseMeetingForm({ locale, members, departments, value, onSubmit }: { locale?: string | null; members: EnterpriseChoice[]; departments: EnterpriseChoice[]; value?: MeetingFormValue; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  const en = locale === "en";
  const selected = new Set(value?.participantIds || []);
  return <form onSubmit={onSubmit} className="grid gap-4">
    <div className="grid gap-3 md:grid-cols-2">
      <Field label={en ? "Title" : "Titre"}><Input name="title" required minLength={3} defaultValue={value?.title || ""} /></Field>
      <Field label={en ? "Department" : "Département"}><NativeSelect name="departmentId" defaultValue={value?.departmentId || ""} items={departments} /></Field>
      <Field label={en ? "Start" : "Début"}><Input name="startAt" type="datetime-local" required defaultValue={toLocalInput(value?.startAt)} /></Field>
      <Field label={en ? "End" : "Fin"}><Input name="endAt" type="datetime-local" required defaultValue={toLocalInput(value?.endAt)} /></Field>
      <Field label={en ? "Mode" : "Mode"}><NativeSelect name="locationMode" required defaultValue={value?.locationMode || "ONLINE"} items={[{ id: "ONLINE", label: en ? "Online" : "En ligne" }, { id: "PHYSICAL", label: en ? "On site" : "Physique" }, { id: "HYBRID", label: en ? "Hybrid" : "Hybride" }]} /></Field>
      <Field label={en ? "Physical location" : "Lieu physique"}><Input name="physicalLocation" defaultValue={value?.physicalLocation || ""} /></Field>
      <Field label={en ? "Meeting link" : "Lien de réunion"}><Input name="meetingLink" type="url" defaultValue={value?.meetingLink || ""} /></Field>
    </div>
    <Field label={en ? "Agenda" : "Ordre du jour"}><textarea name="agenda" defaultValue={value?.agenda || ""} className="min-h-28 w-full rounded-xl border border-dtsc-border bg-dtsc-surface p-3 text-sm" /></Field>
    {value ? <Field label={en ? "Minutes" : "Compte rendu"}><textarea name="minutes" defaultValue={value.minutes || ""} className="min-h-36 w-full rounded-xl border border-dtsc-border bg-dtsc-surface p-3 text-sm" /></Field> : null}
    <Field label={en ? "Participants" : "Participants"} help={en ? "Only active organization members are accepted by the server." : "Seuls les membres actifs de l’entreprise sont acceptés côté serveur."}>
      <div className="grid max-h-52 gap-2 overflow-y-auto rounded-xl border border-dtsc-border p-3 sm:grid-cols-2">
        {members.map((member) => <label key={member.id} className="flex min-w-0 items-center gap-2 text-sm"><input type="checkbox" name="participantIds" value={member.id} defaultChecked={selected.has(member.id)} /><span className="min-w-0 truncate">{member.label}</span></label>)}
      </div>
    </Field>
    <Button className="w-full bg-dtsc-blue text-white sm:w-fit">{value ? (en ? "Save meeting" : "Enregistrer la réunion") : (en ? "Schedule meeting" : "Planifier la réunion")}</Button>
  </form>;
}

function toLocalInput(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
