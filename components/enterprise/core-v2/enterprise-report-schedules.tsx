"use client";

import { Archive, CalendarClock, PauseCircle, PlayCircle, Plus } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToastMessage } from "@/components/ui/use-toast-message";
import { BusinessList, BusinessListItem } from "@/components/workspace/business-list";
import { EmptyState } from "@/components/workspace/empty-state";
import { ModuleSection } from "@/components/workspace/module-workspace";
import { StatusBadge } from "@/components/workspace/status-badge";
import { Field, NativeSelect, formatEnterpriseDate } from "@/components/enterprise/core-v2/erp-v2-ui";
import { enterpriseV2Mutation } from "@/components/enterprise/core-v2/use-enterprise-v2-collection";
import { enterpriseCoreT, type EnterpriseCoreKey } from "@/lib/enterprise-core-i18n";

export type EnterpriseReportOption = { id: string; label: string; meta?: string | null };
export type EnterpriseReportGenerationOptions = {
  departments: EnterpriseReportOption[];
  suppliers: EnterpriseReportOption[];
  budgets: EnterpriseReportOption[];
  currencies: EnterpriseReportOption[];
  categories: EnterpriseReportOption[];
  sourceAvailability?: { finance?: boolean; procurement?: boolean };
};
export type EnterpriseReportCatalogItem = { code: string; supportedFilters: readonly string[] };

type ScheduleRun = { id: string; status: string; deliveryStatus: string; dueAt: string; completedAt: string | null; errorCode: string | null };
type Schedule = {
  id: string;
  name: string;
  reportType: string;
  reportTitle: string;
  frequency: string;
  timeZone: string;
  hour: number;
  minute: number;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  isEnabled: boolean;
  nextRunAt: string;
  revision: number;
  runs: ScheduleRun[];
};

type SchedulesResponse = { items?: Schedule[]; canManage?: boolean; emailDeliveryConfigured?: boolean };

function reportTypeLabel(locale: string | null | undefined, value: string) {
  return enterpriseCoreT(locale, `reports.type.${value}` as EnterpriseCoreKey);
}

function frequencyLabel(locale: string | null | undefined, value: string) {
  return enterpriseCoreT(locale, `reports.schedule.frequency.${value}` as EnterpriseCoreKey);
}

function dayItems(locale: string | null | undefined) {
  return [0, 1, 2, 3, 4, 5, 6].map((id) => ({ id: String(id), label: enterpriseCoreT(locale, `reports.schedule.weekday.${id}` as EnterpriseCoreKey) }));
}

export function EnterpriseReportSchedules({ organizationId, canManage, locale, catalog, options }: {
  organizationId: string;
  canManage: boolean;
  locale?: string | null;
  catalog: EnterpriseReportCatalogItem[];
  options: EnterpriseReportGenerationOptions;
}) {
  const t = (key: EnterpriseCoreKey, vars?: Record<string, string | number>) => enterpriseCoreT(locale, key, vars);
  const [items, setItems] = useState<Schedule[]>([]);
  const [emailConfigured, setEmailConfigured] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [reportType, setReportType] = useState(catalog[0]?.code || "BUDGET_VS_ACTUAL");
  const [frequency, setFrequency] = useState("MONTHLY");
  const [periodMode, setPeriodMode] = useState("PREVIOUS_MONTH");
  const [emailEnabled, setEmailEnabled] = useState(false);
  useToastMessage(message, "success");
  useToastMessage(error, "error");

  async function load() {
    const response = await fetch(`/api/enterprise/${organizationId}/reports/schedules`, { cache: "no-store" });
    const body = await response.json().catch(() => null) as SchedulesResponse | null;
    if (!response.ok || !body) { setError(t("reports.schedule.loadFailed")); return; }
    setItems(body.items || []);
    setEmailConfigured(Boolean(body.emailDeliveryConfigured));
  }

  useEffect(() => { void load(); }, [organizationId]);
  useEffect(() => { if (!catalog.some((item) => item.code === reportType) && catalog[0]) setReportType(catalog[0].code); }, [catalog, reportType]);

  const selectedCatalog = catalog.find((item) => item.code === reportType);
  const supports = (filter: string) => selectedCatalog?.supportedFilters?.includes(filter) ?? false;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError(""); setMessage("");
    const form = new FormData(event.currentTarget);
    const recipients = String(form.get("recipientEmails") || "").split(/[;,\n]/).map((value) => value.trim()).filter(Boolean);
    const payload = {
      name: form.get("name"),
      reportType,
      reportTitle: form.get("reportTitle"),
      reportDescription: form.get("reportDescription") || "",
      frequency,
      timeZone: form.get("timeZone") || "UTC",
      hour: Number(form.get("hour") || 7),
      minute: Number(form.get("minute") || 0),
      dayOfWeek: frequency === "WEEKLY" ? Number(form.get("dayOfWeek") || 1) : null,
      dayOfMonth: frequency === "MONTHLY" ? Number(form.get("dayOfMonth") || 1) : null,
      filters: {
        periodMode,
        periodStart: form.get("periodStart") || "",
        periodEnd: form.get("periodEnd") || "",
        currency: form.get("currency") || "",
        departmentId: form.get("departmentId") || "",
        supplierId: form.get("supplierId") || "",
        budgetId: form.get("budgetId") || "",
        category: form.get("category") || "",
      },
      deliveryChannels: ["ARCHIVE", ...(emailEnabled ? ["EMAIL"] : [])],
      recipientEmails: emailEnabled ? recipients : [],
    };
    try {
      await enterpriseV2Mutation(`/api/enterprise/${organizationId}/reports/schedules`, "POST", payload);
      setOpen(false); setEmailEnabled(false); setMessage(t("reports.schedule.created")); await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("reports.actionFailed"));
    } finally { setBusy(false); }
  }

  async function transition(schedule: Schedule, action: "ENABLE" | "DISABLE" | "ARCHIVE") {
    if (busy) return;
    setBusy(true); setError(""); setMessage("");
    try {
      await enterpriseV2Mutation(`/api/enterprise/${organizationId}/reports/schedules/${schedule.id}`, "PATCH", { action, revision: schedule.revision });
      setMessage(t("reports.schedule.updated")); await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("reports.actionFailed"));
    } finally { setBusy(false); }
  }

  return <>
    <ModuleSection
      title={t("reports.schedule.title")}
      description={t("reports.schedule.description")}
      count={`${items.length}`}
      action={canManage ? <Button variant="outline" onClick={() => setOpen(true)}><Plus className="h-4 w-4" />{t("reports.schedule.new")}</Button> : null}
    >
      {items.length ? <BusinessList ariaLabel={t("reports.schedule.title")}>
        {items.map((schedule) => <BusinessListItem
          key={schedule.id}
          title={schedule.name}
          status={<StatusBadge tone={schedule.isEnabled ? "success" : "neutral"}>{schedule.isEnabled ? t("reports.schedule.active") : t("reports.schedule.paused")}</StatusBadge>}
          meta={`${reportTypeLabel(locale, schedule.reportType)} · ${frequencyLabel(locale, schedule.frequency)} · ${schedule.timeZone}`}
          description={`${t("reports.schedule.nextRun")}: ${formatEnterpriseDate(schedule.nextRunAt, locale)}${schedule.runs[0] ? ` · ${t("reports.schedule.lastRun")}: ${schedule.runs[0].deliveryStatus}` : ""}`}
          actions={canManage ? <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void transition(schedule, schedule.isEnabled ? "DISABLE" : "ENABLE")}>
              {schedule.isEnabled ? <PauseCircle className="h-4 w-4" /> : <PlayCircle className="h-4 w-4" />}
              {schedule.isEnabled ? t("reports.schedule.pause") : t("reports.schedule.resume")}
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void transition(schedule, "ARCHIVE")}><Archive className="h-4 w-4" />{t("reports.schedule.archive")}</Button>
          </div> : undefined}
        />)}
      </BusinessList> : <EmptyState compact title={t("reports.schedule.empty")} description={t("reports.schedule.emptyDescription")} />}
    </ModuleSection>

    <Dialog open={open} onClose={() => { if (!busy) setOpen(false); }} title={t("reports.schedule.new")} description={t("reports.schedule.formDescription")} presentation="editor" className="max-w-4xl">
      <form onSubmit={submit} className="grid min-w-0 gap-5">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label={t("reports.schedule.name")}><Input name="name" required /></Field>
          <Field label={t("reports.generate.reportTitle")}><Input name="reportTitle" required /></Field>
          <Field label={t("reports.generate.reportType")}><NativeSelect value={reportType} onChange={setReportType} items={catalog.map((item) => ({ id: item.code, label: reportTypeLabel(locale, item.code) }))} /></Field>
          <Field label={t("reports.schedule.frequency")}><NativeSelect value={frequency} onChange={setFrequency} items={["DAILY", "WEEKLY", "MONTHLY"].map((id) => ({ id, label: frequencyLabel(locale, id) }))} /></Field>
          <Field label={t("reports.schedule.timeZone")}><Input name="timeZone" defaultValue={Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"} required /></Field>
          <div className="grid grid-cols-2 gap-3"><Field label={t("reports.schedule.hour")}><Input name="hour" type="number" min={0} max={23} defaultValue={7} required /></Field><Field label={t("reports.schedule.minute")}><Input name="minute" type="number" min={0} max={59} defaultValue={0} required /></Field></div>
          {frequency === "WEEKLY" ? <Field label={t("reports.schedule.dayOfWeek")}><NativeSelect name="dayOfWeek" defaultValue="1" items={dayItems(locale)} /></Field> : null}
          {frequency === "MONTHLY" ? <Field label={t("reports.schedule.dayOfMonth")}><Input name="dayOfMonth" type="number" min={1} max={31} defaultValue={1} required /></Field> : null}
        </div>
        <Field label={t("reports.generate.description")}><textarea name="reportDescription" className="min-h-20 rounded-xl border border-dtsc-border bg-dtsc-surface p-3 text-sm" /></Field>
        <section className="grid gap-4 rounded-2xl border border-dtsc-border bg-dtsc-page p-4">
          <div className="flex items-center gap-2"><CalendarClock className="h-4 w-4 text-dtsc-blue" /><h3 className="font-black text-dtsc-ink">{t("reports.schedule.scope")}</h3></div>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label={t("reports.schedule.periodMode")}><NativeSelect value={periodMode} onChange={setPeriodMode} items={["PREVIOUS_MONTH", "CURRENT_MONTH", "LAST_7_DAYS", "LAST_30_DAYS", "ALL_AVAILABLE", "CUSTOM"].map((id) => ({ id, label: t(`reports.schedule.period.${id}` as EnterpriseCoreKey) }))} /></Field>
            {periodMode === "CUSTOM" ? <><Field label={t("reports.generate.periodStart")}><Input name="periodStart" type="date" required /></Field><Field label={t("reports.generate.periodEnd")}><Input name="periodEnd" type="date" required /></Field></> : null}
            {supports("currency") ? <Field label={t("reports.generate.currency")}><NativeSelect name="currency" items={options.currencies} /></Field> : null}
            {supports("departmentId") ? <Field label={t("reports.schedule.department")}><NativeSelect name="departmentId" items={options.departments} /></Field> : null}
            {supports("supplierId") ? <Field label={t("reports.schedule.supplier")}><NativeSelect name="supplierId" items={options.suppliers} /></Field> : null}
            {supports("budgetId") ? <Field label={t("reports.schedule.budget")}><NativeSelect name="budgetId" items={options.budgets} /></Field> : null}
            {supports("category") ? <Field label={t("reports.generate.category")}><NativeSelect name="category" items={options.categories} /></Field> : null}
          </div>
        </section>
        <section className="grid gap-3 rounded-2xl border border-dtsc-border bg-dtsc-page p-4">
          <h3 className="font-black text-dtsc-ink">{t("reports.schedule.delivery")}</h3>
          <p className="text-sm text-dtsc-muted">{t("reports.schedule.archiveAlways")}</p>
          <label className="flex min-h-11 items-center gap-2 text-sm font-bold"><input type="checkbox" checked={emailEnabled} disabled={!emailConfigured} onChange={(event) => setEmailEnabled(event.target.checked)} />{t("reports.schedule.email")}</label>
          {!emailConfigured ? <p className="text-xs text-amber-600 dark:text-amber-300">{t("reports.schedule.emailUnavailable")}</p> : null}
          {emailEnabled ? <Field label={t("reports.schedule.recipients")}><textarea name="recipientEmails" required className="min-h-20 rounded-xl border border-dtsc-border bg-dtsc-surface p-3 text-sm" placeholder={t("reports.schedule.recipientsPlaceholder")} /></Field> : null}
        </section>
        <Button type="submit" disabled={busy}><CalendarClock className="h-4 w-4" />{t("reports.schedule.create")}</Button>
      </form>
    </Dialog>
  </>;
}
