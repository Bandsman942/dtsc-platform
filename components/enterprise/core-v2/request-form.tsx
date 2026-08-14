"use client";

import { formatEnterpriseDate as coreFormatEnterpriseDate, priorityChoices as corePriorityChoices, statusLabel as coreStatusLabel } from "@/components/enterprise/core-v2/erp-v2-ui";

import { enterpriseCoreT } from "@/lib/enterprise-core-i18n";

import type { FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, NativeSelect, priorityChoicesEn, priorityChoicesFr, type EnterpriseChoice } from "@/components/enterprise/core-v2/erp-v2-ui";

export type RequestFormValue = { requestType?: string; title?: string; description?: string | null; priority?: string; assignedToUserId?: string | null; departmentId?: string | null; dueAt?: string | null };

export function EnterpriseRequestForm({ locale, members, departments, value, onSubmit }: { locale?: string | null; members: EnterpriseChoice[]; departments: EnterpriseChoice[]; value?: RequestFormValue; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return <form onSubmit={onSubmit} className="grid gap-4">
    <div className="grid gap-3 md:grid-cols-2">
      <Field label={enterpriseCoreT(locale, "requests.request.type")}><Input name="requestType" required minLength={2} defaultValue={value?.requestType || "GENERAL"} /></Field>
      <Field label={enterpriseCoreT(locale, "requests.form.title")}><Input name="title" required minLength={3} defaultValue={value?.title || ""} /></Field>
      <Field label={enterpriseCoreT(locale, "tasks.form.priority")}><NativeSelect name="priority" required defaultValue={value?.priority || "NORMAL"} items={corePriorityChoices(locale)} /></Field>
      <Field label={enterpriseCoreT(locale, "tasks.form.dueDate")}><Input name="dueAt" type="datetime-local" defaultValue={toLocalInput(value?.dueAt)} /></Field>
      <Field label={enterpriseCoreT(locale, "requests.form.recipient")}><NativeSelect name="assignedToUserId" defaultValue={value?.assignedToUserId || ""} items={members} /></Field>
      <Field label={enterpriseCoreT(locale, "tasks.form.department")}><NativeSelect name="departmentId" defaultValue={value?.departmentId || ""} items={departments} /></Field>
    </div>
    <Field label={enterpriseCoreT(locale, "tasks.form.description")}><textarea name="description" required minLength={3} defaultValue={value?.description || ""} className="min-h-36 w-full rounded-xl border border-dtsc-border bg-dtsc-surface p-3 text-sm text-dtsc-ink" /></Field>
    <Button className="w-full bg-dtsc-blue text-white sm:w-fit">{value ? (enterpriseCoreT(locale, "common.saveChanges")) : (enterpriseCoreT(locale, "requests.form.create.draft"))}</Button>
  </form>;
}

function toLocalInput(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
