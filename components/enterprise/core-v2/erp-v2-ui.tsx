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

const CURRENCY_OPTIONS = [
  { id: "USD", fr: "Dollar américain (USD)", en: "US dollar (USD)" },
  { id: "CDF", fr: "Franc congolais (CDF)", en: "Congolese franc (CDF)" },
  { id: "EUR", fr: "Euro (EUR)", en: "Euro (EUR)" },
  { id: "GBP", fr: "Livre sterling (GBP)", en: "Pound sterling (GBP)" },
  { id: "CAD", fr: "Dollar canadien (CAD)", en: "Canadian dollar (CAD)" },
  { id: "CHF", fr: "Franc suisse (CHF)", en: "Swiss franc (CHF)" },
  { id: "ZAR", fr: "Rand sud-africain (ZAR)", en: "South African rand (ZAR)" },
  { id: "KES", fr: "Shilling kényan (KES)", en: "Kenyan shilling (KES)" },
  { id: "UGX", fr: "Shilling ougandais (UGX)", en: "Ugandan shilling (UGX)" },
  { id: "TZS", fr: "Shilling tanzanien (TZS)", en: "Tanzanian shilling (TZS)" },
  { id: "RWF", fr: "Franc rwandais (RWF)", en: "Rwandan franc (RWF)" },
  { id: "XAF", fr: "Franc CFA CEMAC (XAF)", en: "CFA franc BEAC (XAF)" },
  { id: "XOF", fr: "Franc CFA UEMOA (XOF)", en: "CFA franc BCEAO (XOF)" },
  { id: "NGN", fr: "Naira nigérian (NGN)", en: "Nigerian naira (NGN)" },
] as const;

const UNIT_OPTIONS = [
  { id: "unit", fr: "Unité", en: "Unit" },
  { id: "box", fr: "Boîte", en: "Box" },
  { id: "pack", fr: "Paquet", en: "Pack" },
  { id: "kg", fr: "Kilogramme (kg)", en: "Kilogram (kg)" },
  { id: "g", fr: "Gramme (g)", en: "Gram (g)" },
  { id: "l", fr: "Litre (L)", en: "Litre (L)" },
  { id: "ml", fr: "Millilitre (mL)", en: "Millilitre (mL)" },
  { id: "m", fr: "Mètre (m)", en: "Metre (m)" },
  { id: "cm", fr: "Centimètre (cm)", en: "Centimetre (cm)" },
  { id: "hour", fr: "Heure", en: "Hour" },
  { id: "day", fr: "Jour", en: "Day" },
  { id: "service", fr: "Prestation / service", en: "Service" },
] as const;

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

export function Field({ label, help, error, required = false, children }: { label: string; help?: string; error?: string; required?: boolean; children: ReactNode }) {
  return <label className="grid min-w-0 max-w-full gap-1.5"><span className="flex min-w-0 items-center gap-1 text-xs font-black uppercase text-dtsc-muted"><span className="min-w-0 break-words">{label}{required ? <span aria-hidden="true" className="ml-1 text-red-500">*</span> : null}</span>{help ? <span title={help} aria-label={`${label} : ${help}`} className="shrink-0 cursor-help"><CircleHelp className="h-3.5 w-3.5" /></span> : null}</span>{children}{help ? <span className="break-words text-sm leading-6 text-dtsc-muted">{help}</span> : null}{error ? <span role="alert" className="break-words text-sm font-semibold leading-6 text-red-600">{error}</span> : null}</label>;
}

export function NativeSelect({ name, items, required, defaultValue, value, onChange, disabled }: { name?: string; items: EnterpriseChoice[]; required?: boolean; defaultValue?: string; value?: string; onChange?: (value: string) => void; disabled?: boolean }) {
  return <select name={name} required={required} defaultValue={value === undefined ? defaultValue : undefined} value={value} onChange={onChange ? (event) => onChange(event.target.value) : undefined} disabled={disabled} className="h-11 w-full min-w-0 max-w-full truncate rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-base text-dtsc-ink disabled:opacity-60 md:text-sm"><option value="">—</option>{items.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select>;
}

export function priorityChoices(locale: string | null | undefined): EnterpriseChoice[] {
  return PRIORITY_IDS.map((id) => ({ id, label: priorityLabel(locale, id) }));
}

export function currencyChoices(locale: string | null | undefined): EnterpriseChoice[] {
  const isEnglish = enterpriseCoreIntlLocale(locale).toLowerCase().startsWith("en");
  return CURRENCY_OPTIONS.map((item) => ({ id: item.id, label: isEnglish ? item.en : item.fr }));
}

export function unitChoices(locale: string | null | undefined): EnterpriseChoice[] {
  const isEnglish = enterpriseCoreIntlLocale(locale).toLowerCase().startsWith("en");
  return UNIT_OPTIONS.map((item) => ({ id: item.id, label: isEnglish ? item.en : item.fr }));
}

export const priorityChoicesFr: EnterpriseChoice[] = priorityChoices("fr");
export const priorityChoicesEn: EnterpriseChoice[] = priorityChoices("en");
