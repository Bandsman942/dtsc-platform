"use client";

import type { FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, NativeSelect, priorityChoicesEn, priorityChoicesFr, type EnterpriseChoice } from "@/components/enterprise/core-v2/erp-v2-ui";

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
  const en = locale === "en";
  return (
    <form onSubmit={onSubmit} className="grid min-w-0 gap-4">
      <div className="grid gap-3 md:grid-cols-2">
        <Field label={en ? "Type" : "Type"}><NativeSelect name="taskType" required defaultValue={value?.taskType || "TASK"} items={[{ id: "TASK", label: en ? "Task" : "Tâche" }, { id: "OPERATION", label: en ? "Operation" : "Opération" }, { id: "ACTION", label: "Action" }]} /></Field>
        <Field label={en ? "Title" : "Titre"}><Input name="title" required minLength={3} defaultValue={value?.title || ""} /></Field>
        <Field label={en ? "Priority" : "Priorité"}><NativeSelect name="priority" required defaultValue={value?.priority || "NORMAL"} items={en ? priorityChoicesEn : priorityChoicesFr} /></Field>
        <Field label={en ? "Due date" : "Échéance"}><Input name="dueAt" type="datetime-local" defaultValue={toLocalInput(value?.dueAt)} /></Field>
        <Field label={en ? "Assignee" : "Assigné à"}><NativeSelect name="assignedToUserId" defaultValue={value?.assignedToUserId || ""} items={members} /></Field>
        <Field label={en ? "Department" : "Département"}><NativeSelect name="departmentId" defaultValue={value?.departmentId || ""} items={departments} /></Field>
      </div>
      <Field label={en ? "Description" : "Description"}><textarea name="description" defaultValue={value?.description || ""} className="min-h-32 w-full rounded-xl border border-dtsc-border bg-dtsc-surface p-3 text-sm text-dtsc-ink" /></Field>
      <Button className="w-full rounded-xl bg-dtsc-blue text-white sm:w-fit">{value ? (en ? "Save changes" : "Enregistrer les modifications") : (en ? "Create task" : "Créer la tâche")}</Button>
    </form>
  );
}

function toLocalInput(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
