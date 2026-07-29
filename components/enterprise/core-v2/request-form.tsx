"use client";

import type { FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, NativeSelect, priorityChoicesEn, priorityChoicesFr, type EnterpriseChoice } from "@/components/enterprise/core-v2/erp-v2-ui";

export type RequestFormValue = { requestType?: string; title?: string; description?: string | null; priority?: string; assignedToUserId?: string | null; departmentId?: string | null; dueAt?: string | null };

export function EnterpriseRequestForm({ locale, members, departments, value, onSubmit }: { locale?: string | null; members: EnterpriseChoice[]; departments: EnterpriseChoice[]; value?: RequestFormValue; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  const en = locale === "en";
  return <form onSubmit={onSubmit} className="grid gap-4">
    <div className="grid gap-3 md:grid-cols-2">
      <Field label={en ? "Request type" : "Type de demande"}><Input name="requestType" required minLength={2} defaultValue={value?.requestType || "GENERAL"} /></Field>
      <Field label={en ? "Title" : "Objet"}><Input name="title" required minLength={3} defaultValue={value?.title || ""} /></Field>
      <Field label={en ? "Priority" : "Priorité"}><NativeSelect name="priority" required defaultValue={value?.priority || "NORMAL"} items={en ? priorityChoicesEn : priorityChoicesFr} /></Field>
      <Field label={en ? "Due date" : "Échéance"}><Input name="dueAt" type="datetime-local" defaultValue={toLocalInput(value?.dueAt)} /></Field>
      <Field label={en ? "Recipient" : "Destinataire"}><NativeSelect name="assignedToUserId" defaultValue={value?.assignedToUserId || ""} items={members} /></Field>
      <Field label={en ? "Department" : "Département"}><NativeSelect name="departmentId" defaultValue={value?.departmentId || ""} items={departments} /></Field>
    </div>
    <Field label={en ? "Description" : "Description"}><textarea name="description" required minLength={3} defaultValue={value?.description || ""} className="min-h-36 w-full rounded-xl border border-dtsc-border bg-dtsc-surface p-3 text-sm text-dtsc-ink" /></Field>
    <Button className="w-full bg-dtsc-blue text-white sm:w-fit">{value ? (en ? "Save changes" : "Enregistrer les modifications") : (en ? "Create draft" : "Créer le brouillon")}</Button>
  </form>;
}

function toLocalInput(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
