"use client";

import { CircleHelp } from "lucide-react";
import type { ReactNode } from "react";
import type { StatusBadgeTone } from "@/components/workspace/status-badge";

export type EnterpriseChoice = { id: string; label: string };

const FR_STATUS: Record<string, string> = {
  TODO: "À faire", IN_PROGRESS: "En cours", BLOCKED: "Bloquée", DONE: "Terminée", CANCELLED: "Annulée", DRAFT: "Brouillon", SUBMITTED: "Soumise", IN_REVIEW: "En revue", APPROVED: "Approuvée", REJECTED: "Rejetée", FULFILLED: "Traitée", PENDING: "À traiter", SCHEDULED: "Planifiée", COMPLETED: "Terminée",
  ACTIVE: "Actif", ARCHIVED: "Archivé", PROSPECT: "Prospect", SUSPENDED: "Suspendu", INACTIVE: "Inactif", PENDING_APPROVAL: "En attente d’approbation", ORDERED: "Commandé", PARTIALLY_RECEIVED: "Partiellement reçu", RECEIVED: "Reçu", CLOSED: "Clôturé",
};
const EN_STATUS: Record<string, string> = {
  TODO: "To do", IN_PROGRESS: "In progress", BLOCKED: "Blocked", DONE: "Done", CANCELLED: "Cancelled", DRAFT: "Draft", SUBMITTED: "Submitted", IN_REVIEW: "In review", APPROVED: "Approved", REJECTED: "Rejected", FULFILLED: "Fulfilled", PENDING: "To process", SCHEDULED: "Scheduled", COMPLETED: "Completed",
  ACTIVE: "Active", ARCHIVED: "Archived", PROSPECT: "Prospect", SUSPENDED: "Suspended", INACTIVE: "Inactive", PENDING_APPROVAL: "Pending approval", ORDERED: "Ordered", PARTIALLY_RECEIVED: "Partially received", RECEIVED: "Received", CLOSED: "Closed",
};
const FR_PRIORITY: Record<string, string> = { LOW: "Faible", NORMAL: "Normale", HIGH: "Haute", CRITICAL: "Critique" };
const EN_PRIORITY: Record<string, string> = { LOW: "Low", NORMAL: "Normal", HIGH: "High", CRITICAL: "Critical" };

export function statusLabel(locale: string | null | undefined, status: string) { return (locale === "en" ? EN_STATUS : FR_STATUS)[status] || status; }
export function priorityLabel(locale: string | null | undefined, priority: string) { return (locale === "en" ? EN_PRIORITY : FR_PRIORITY)[priority] || priority; }
export function statusTone(status: string): StatusBadgeTone { if (/REJECTED|CANCELLED|BLOCKED|CRITICAL|SUSPENDED/i.test(status)) return "danger"; if (/PENDING|SUBMITTED|TODO|SCHEDULED|PARTIALLY_RECEIVED/i.test(status)) return "warning"; if (/APPROVED|DONE|COMPLETED|FULFILLED|RECEIVED|CLOSED|ACTIVE/i.test(status)) return "success"; if (/IN_PROGRESS|IN_REVIEW|ORDERED/i.test(status)) return "info"; return "neutral"; }
export function formatEnterpriseDate(value: string | Date | null | undefined, locale?: string | null) { if (!value) return locale === "en" ? "Not specified" : "Non précisée"; const date = typeof value === "string" ? new Date(value) : value; return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(date); }
export function Field({ label, help, children }: { label: string; help?: string; children: ReactNode }) { return <label className="grid min-w-0 gap-1"><span className="flex min-w-0 items-center gap-1 text-xs font-black uppercase text-dtsc-muted"><span className="min-w-0 break-words">{label}</span>{help ? <span title={help} aria-label={`${label} : ${help}`} className="shrink-0 cursor-help"><CircleHelp className="h-3.5 w-3.5" /></span> : null}</span>{children}</label>; }
export function NativeSelect({ name, items, required, defaultValue, value, onChange, disabled }: { name?: string; items: EnterpriseChoice[]; required?: boolean; defaultValue?: string; value?: string; onChange?: (value: string) => void; disabled?: boolean }) { return <select name={name} required={required} defaultValue={value === undefined ? defaultValue : undefined} value={value} onChange={onChange ? (event) => onChange(event.target.value) : undefined} disabled={disabled} className="h-11 w-full min-w-0 truncate rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-base text-dtsc-ink disabled:opacity-60 md:text-sm"><option value="">—</option>{items.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select>; }
export const priorityChoicesFr: EnterpriseChoice[] = [{ id: "LOW", label: "Faible" }, { id: "NORMAL", label: "Normale" }, { id: "HIGH", label: "Haute" }, { id: "CRITICAL", label: "Critique" }];
export const priorityChoicesEn: EnterpriseChoice[] = [{ id: "LOW", label: "Low" }, { id: "NORMAL", label: "Normal" }, { id: "HIGH", label: "High" }, { id: "CRITICAL", label: "Critical" }];
