"use client";

import { CircleHelp } from "lucide-react";
import type { ReactNode } from "react";
import type { StatusBadgeTone } from "@/components/workspace/status-badge";
import {
  enterpriseCoreIntlLocale,
  enterpriseCoreT,
  type EnterpriseCoreKey,
} from "@/lib/enterprise-core-i18n";

export type EnterpriseChoice = { id: string; label: string };

const PRIORITY_IDS = ["LOW", "NORMAL", "HIGH", "CRITICAL"] as const;

export function statusLabel(locale: string | null | undefined, status: string) {
  return enterpriseCoreT(locale, `status.${status}` as EnterpriseCoreKey) || status;
}

export function priorityLabel(locale: string | null | undefined, priority: string) {
  return enterpriseCoreT(locale, `priority.${priority}` as EnterpriseCoreKey) || priority;
}

export function statusTone(status: string): StatusBadgeTone {
  if (/REJECTED|CANCELLED|BLOCKED|CRITICAL|SUSPENDED/i.test(status)) return "danger";
  if (/PENDING|SUBMITTED|TODO|SCHEDULED|PARTIALLY_RECEIVED/i.test(status)) return "warning";
  if (/APPROVED|DONE|COMPLETED|FULFILLED|RECEIVED|CLOSED|ACTIVE/i.test(status)) return "success";
  if (/IN_PROGRESS|IN_REVIEW|ORDERED/i.test(status)) return "info";
  return "neutral";
}

export function formatEnterpriseDate(value: string | Date | null | undefined, locale?: string | null) {
  if (!value) return enterpriseCoreT(locale, "common.notSpecified");
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat(enterpriseCoreIntlLocale(locale), { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function formatEnterpriseAmount(value: string | number, currency: string, locale?: string | null) {
  const number = Number(value || 0);
  try {
    return new Intl.NumberFormat(enterpriseCoreIntlLocale(locale), { style: "currency", currency }).format(number);
  } catch {
    return `${number.toFixed(2)} ${currency}`;
  }
}

export function Field({ label, help, children }: { label: string; help?: string; children: ReactNode }) {
  return <label className="grid min-w-0 gap-1"><span className="flex min-w-0 items-center gap-1 text-xs font-black uppercase text-dtsc-muted"><span className="min-w-0 break-words">{label}</span>{help ? <span title={help} aria-label={`${label} : ${help}`} className="shrink-0 cursor-help"><CircleHelp className="h-3.5 w-3.5" /></span> : null}</span>{children}</label>;
}

export function NativeSelect({ name, items, required, defaultValue, value, onChange, disabled }: { name?: string; items: EnterpriseChoice[]; required?: boolean; defaultValue?: string; value?: string; onChange?: (value: string) => void; disabled?: boolean }) {
  return <select name={name} required={required} defaultValue={value === undefined ? defaultValue : undefined} value={value} onChange={onChange ? (event) => onChange(event.target.value) : undefined} disabled={disabled} className="h-11 w-full min-w-0 truncate rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-base text-dtsc-ink disabled:opacity-60 md:text-sm"><option value="">—</option>{items.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select>;
}

export function priorityChoices(locale: string | null | undefined): EnterpriseChoice[] {
  return PRIORITY_IDS.map((id) => ({ id, label: priorityLabel(locale, id) }));
}

export const priorityChoicesFr: EnterpriseChoice[] = priorityChoices("fr");
export const priorityChoicesEn: EnterpriseChoice[] = priorityChoices("en");
