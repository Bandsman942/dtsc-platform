"use client";

import type { FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, NativeSelect, priorityChoices, type EnterpriseChoice } from "@/components/enterprise/core-v2/erp-v2-ui";
import { enterpriseCoreT } from "@/lib/enterprise-core-i18n";

export type TaskFormValue = {
  taskType?: string;
  title?: string;
  description?: string | null;
  priority?: string;
  assignedToUserId?: string | null;
  departmentId?: string | null;
  dueAt?: string | null;
};

export function EnterpriseTaskForm({ locale, members, departments, value, onSubmit }: { locale?: string | null; members: EnterpriseChoice[]; departments: EnterpriseChoice[]; value?: TaskFormValue; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return (
    <form onSubmit={onSubmit} className="grid min-w-0 gap-4">
      <div className="grid gap-3 md:grid-cols-2">
        <Field label={enterpriseCoreT(locale, "tasks.form.type")}><NativeSelect name="taskType" required defaultValue={value?.taskType || "TASK"} items={[{ id: "TASK", label: enterpriseCoreT(locale, "tasks.form.task") }, { id: "OPERATION", label: enterpriseCoreT(locale, "tasks.form.operation") }, { id: "ACTION", label: enterpriseCoreT(locale, "tasks.form.action") }]} /></Field>
        <Field label={enterpriseCoreT(locale, "tasks.form.title")}><Input name="title" required minLength={3} defaultValue={value?.title || ""} /></Field>
        <Field label={enterpriseCoreT(locale, "tasks.form.priority")}><NativeSelect name="priority" required defaultValue={value?.priority || "NORMAL"} items={priorityChoices(locale)} /></Field>
        <Field label={enterpriseCoreT(locale, "tasks.form.dueDate")}><Input name="dueAt" type="datetime-local" defaultValue={toLocalInput(value?.dueAt)} /></Field>
        <Field label={enterpriseCoreT(locale, "tasks.form.assignee")}><NativeSelect name="assignedToUserId" defaultValue={value?.assignedToUserId || ""} items={members} /></Field>
        <Field label={enterpriseCoreT(locale, "tasks.form.department")}><NativeSelect name="departmentId" defaultValue={value?.departmentId || ""} items={departments} /></Field>
      </div>
      <Field label={enterpriseCoreT(locale, "tasks.form.description")}><textarea name="description" defaultValue={value?.description || ""} className="min-h-32 w-full rounded-xl border border-dtsc-border bg-dtsc-surface p-3 text-sm text-dtsc-ink" /></Field>
      <Button className="w-full rounded-xl bg-dtsc-blue text-white sm:w-fit">{value ? enterpriseCoreT(locale, "common.saveChanges") : enterpriseCoreT(locale, "tasks.form.create")}</Button>
    </form>
  );
}

function toLocalInput(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
