"use client";

import { priorityChoices as corePriorityChoices } from "@/components/enterprise/core-v2/erp-v2-ui";
import { enterpriseCoreT } from "@/lib/enterprise-core-i18n";
import type { FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, NativeSelect, type EnterpriseChoice } from "@/components/enterprise/core-v2/erp-v2-ui";

export type RequestFormValue = { requestType?: string; title?: string; description?: string | null; priority?: string; assignedToUserId?: string | null; departmentId?: string | null; dueAt?: string | null };

const REQUEST_TYPES = ["GENERAL", "INFORMATION", "DOCUMENT", "VALIDATION", "SUPPORT", "ACTION", "MEETING", "FOLLOW_UP", "OTHER"] as const;

export function EnterpriseRequestForm({ locale, members, departments, value, onSubmit }: { locale?: string | null; members: EnterpriseChoice[]; departments: EnterpriseChoice[]; value?: RequestFormValue; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return <form onSubmit={onSubmit} className="grid gap-4">
    <div className="grid gap-3 md:grid-cols-2">
      <Field label={enterpriseCoreT(locale, "requests.request.type")} help={locale === "en" ? "Choose a standardized type so routing, reporting and workflows stay consistent." : "Choisissez un type standardisé pour garder cohérents le routage, les rapports et les workflows."}><NativeSelect name="requestType" required defaultValue={value?.requestType || "GENERAL"} items={requestTypeChoices(locale, value?.requestType)} /></Field>
      <Field label={enterpriseCoreT(locale, "requests.form.title")}><Input name="title" required minLength={3} defaultValue={value?.title || ""} /></Field>
      <Field label={enterpriseCoreT(locale, "tasks.form.priority")}><NativeSelect name="priority" required defaultValue={value?.priority || "NORMAL"} items={corePriorityChoices(locale)} /></Field>
      <Field label={enterpriseCoreT(locale, "tasks.form.dueDate")}><Input name="dueAt" type="datetime-local" defaultValue={toLocalInput(value?.dueAt)} /></Field>
      <Field label={enterpriseCoreT(locale, "requests.form.recipient")}><NativeSelect name="assignedToUserId" defaultValue={value?.assignedToUserId || ""} items={members} /></Field>
      <Field label={enterpriseCoreT(locale, "tasks.form.department")}><NativeSelect name="departmentId" defaultValue={value?.departmentId || ""} items={departments} /></Field>
    </div>
    <Field label={enterpriseCoreT(locale, "tasks.form.description")}><textarea name="description" required minLength={3} defaultValue={value?.description || ""} className="min-h-36 w-full rounded-xl border border-dtsc-border bg-dtsc-surface p-3 text-sm text-dtsc-ink" /></Field>
    <Button className="w-full bg-dtsc-blue text-white sm:w-fit">{value ? enterpriseCoreT(locale, "common.saveChanges") : enterpriseCoreT(locale, "requests.form.create.draft")}</Button>
  </form>;
}

function requestTypeChoices(locale?: string | null, current?: string) {
  const en = locale === "en";
  const labels: Record<(typeof REQUEST_TYPES)[number], [string, string]> = {
    GENERAL: ["Générale", "General"],
    INFORMATION: ["Information", "Information"],
    DOCUMENT: ["Document", "Document"],
    VALIDATION: ["Validation", "Approval"],
    SUPPORT: ["Support", "Support"],
    ACTION: ["Action", "Action"],
    MEETING: ["Réunion", "Meeting"],
    FOLLOW_UP: ["Suivi", "Follow-up"],
    OTHER: ["Autre", "Other"],
  };
  const items = REQUEST_TYPES.map((id) => ({ id, label: labels[id][en ? 1 : 0] }));
  if (current && !REQUEST_TYPES.includes(current as (typeof REQUEST_TYPES)[number])) {
    items.unshift({ id: current as (typeof REQUEST_TYPES)[number], label: `${current} · ${en ? "Legacy" : "Historique"}` });
  }
  return items;
}

function toLocalInput(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
