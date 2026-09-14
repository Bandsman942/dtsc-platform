"use client";

import { Archive, Download, Eye, FileBarChart2, FileSpreadsheet, FileText, Plus, RotateCcw, Send } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { BusinessList, BusinessListItem } from "@/components/workspace/business-list";
import { ContextActions, type BusinessContextAction } from "@/components/workspace/context-actions";
import { EmptyState } from "@/components/workspace/empty-state";
import { FullscreenEntityDetail } from "@/components/workspace/fullscreen-entity-detail";
import { ModuleMetric, ModuleMetrics } from "@/components/workspace/module-metrics";
import { ModuleSection } from "@/components/workspace/module-workspace";
import { StatusBadge } from "@/components/workspace/status-badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToastMessage } from "@/components/ui/use-toast-message";
import { Field, NativeSelect, formatEnterpriseDate, statusLabel } from "@/components/enterprise/core-v2/erp-v2-ui";
import { EnterpriseReportSchedules, type EnterpriseReportCatalogItem, type EnterpriseReportGenerationOptions } from "@/components/enterprise/core-v2/enterprise-report-schedules";
import { enterpriseV2Mutation, useEnterpriseV2Collection } from "@/components/enterprise/core-v2/use-enterprise-v2-collection";
import { ProfessionalReportView } from "@/components/reports/professional-report-view";
import { enterpriseCoreT, type EnterpriseCoreKey } from "@/lib/enterprise-core-i18n";
import { buildEnterpriseProfessionalReport } from "@/lib/reporting/enterprise-professional-report";
import { downloadProfessionalCsv, downloadProfessionalXlsx } from "@/lib/reporting/professional-export";
import { downloadProfessionalPdfV2 } from "@/lib/reporting/professional-pdf-v2";

type LegacyRecord = { id: string; title: string; description: string | null; status: string; updatedAt: string };
type ReportItem = { id: string; reference: string; title: string; description: string | null; reportType: string; status: string; periodStart: string | null; periodEnd: string | null; currency: string | null; unitCode: string | null; sourcePolicyCode: string | null; metricDefinitionCodesJson: unknown; freshnessAt: string | null; generatedByUserId: string; generatedAt: string; schemaVersion: number; revision: number; capabilities?: { canPublish?: boolean; canArchive?: boolean } };
type ReportDetail = {
  report: Omit<ReportItem, "sourcePolicyCode" | "metricDefinitionCodesJson"> & { filtersJson: unknown; snapshotJson: unknown; roundingPolicyCode?: string | null; sourceModule?: string | null; sourceEntityType?: string | null; sourceEntityId?: string | null };
  generatedByLabel?: string | null;
  filterReferences?: {
    department?: { id: string; labelFr: string; labelEn: string } | null;
    supplier?: { id: string; label: string } | null;
    budget?: { id: string; label: string } | null;
  };
  links: Array<{ id: string; sourceEntityType: string; sourceEntityId: string; targetEntityType: string; targetEntityId: string }>;
  events: Array<{ id: string; summary: string; createdAt: string }>;
};
type ReportCatalogItem = EnterpriseReportCatalogItem & { titleKey: string; descriptionKey: string; family: string; domain: string; sourcePolicyCode: string; supportedDimensions: readonly string[]; freshnessPolicyCode: string; formatCodes: readonly string[] };
type MetricDefinitionItem = { code: string; sourceCode: string; unitType: string; calculationPolicyCode: string; supportedDimensions: string[]; supportedFilters: string[]; freshnessPolicyCode: string };
type SavedReportView = { id: string; reportType: string; name: string; visibility: string; filtersJson: unknown; isDefault: boolean; isFavorite: boolean; updatedAt: string };
type GenerationStatus = "QUEUED" | "PROCESSING" | "FAILED" | "DEAD" | "COMPLETED";
type GenerationJob = { id: string; status: GenerationStatus; attempts?: number; retryAt?: string | null; processedAt?: string | null; durationMs?: number | null; message?: string | null; report?: { id: string; reference: string; title: string; reportType: string; status: string; generatedAt: string; freshnessAt: string | null } | null };
type GenerationAccepted = { ok?: boolean; queued?: boolean; job?: { id: string; status: GenerationStatus; statusUrl: string } };
type GenerationDraft = Record<string, string>;

const statuses = ["GENERATED", "PUBLISHED", "ARCHIVED"];
const REPORT_GENERATION_POLL_MS = 3000;
const REPORT_GENERATION_MAX_POLLS = 100;
const EMPTY_OPTIONS: EnterpriseReportGenerationOptions = { departments: [], suppliers: [], budgets: [], currencies: [], categories: [] };

function reportLabel(locale: string | null | undefined, prefix: string, value: string) { return enterpriseCoreT(locale, `${prefix}.${value}` as EnterpriseCoreKey); }
function reportTypeLabel(locale: string | null | undefined, value: string) { return reportLabel(locale, "reports.type", value); }
function reportVisibilityLabel(locale: string | null | undefined, value: string) { return reportLabel(locale, "reports.visibility", value); }
function reportFamilyLabel(locale: string | null | undefined, value: string) { return reportLabel(locale, "reports.family", value); }
function reportSourceLabel(locale: string | null | undefined, value: string | null | undefined) { return value ? reportLabel(locale, "reports.source", value) : enterpriseCoreT(locale, "reports.canonicalSource"); }
function reportFreshnessLabel(locale: string | null | undefined, value: string) { return reportLabel(locale, "reports.freshness", value); }
function reportMetricLabel(locale: string | null | undefined, value: string) { return reportLabel(locale, "reports.metric", value); }
function tone(status: string) { return status === "PUBLISHED" ? "success" as const : status === "GENERATED" ? "info" as const : "neutral" as const; }
function generationTone(status: GenerationStatus) { return status === "COMPLETED" ? "success" as const : status === "DEAD" ? "danger" as const : status === "FAILED" ? "warning" as const : "info" as const; }
function generationLabel(locale: string | null | undefined, status: GenerationStatus) {
  if (status === "PROCESSING") return enterpriseCoreT(locale, "reports.generationProcessing");
  if (status === "FAILED") return enterpriseCoreT(locale, "reports.generationRetrying");
  if (status === "DEAD") return enterpriseCoreT(locale, "reports.generationFailed");
  if (status === "COMPLETED") return enterpriseCoreT(locale, "reports.generationReady");
  return enterpriseCoreT(locale, "reports.generationQueued");
}
function formDraft(form: FormData) {
  return Object.fromEntries([...form.entries()].map(([key, value]) => [key, typeof value === "string" ? value : value.name])) as GenerationDraft;
}

export function EnterpriseReportsWorkspace({ organizationId, organizationName, organizationLogoUrl, canCreate, canManage, locale, legacyRecords = [] }: { organizationId: string; organizationName: string; organizationLogoUrl?: string | null; canCreate: boolean; canManage: boolean; locale?: string | null; legacyRecords?: LegacyRecord[] }) {
  const t = (key: EnterpriseCoreKey, vars?: Record<string, string | number>) => enterpriseCoreT(locale, key, vars);
  const humanActionError = t("reports.actionFailed");
  const humanLoadError = t("reports.loadFailed");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [saveViewOpen, setSaveViewOpen] = useState(false);
  const [detail, setDetail] = useState<ReportDetail | null>(null);
  const [catalogDetail, setCatalogDetail] = useState<ReportCatalogItem | null>(null);
  const [catalog, setCatalog] = useState<ReportCatalogItem[]>([]);
  const [metrics, setMetrics] = useState<MetricDefinitionItem[]>([]);
  const [views, setViews] = useState<SavedReportView[]>([]);
  const [generationOptions, setGenerationOptions] = useState<EnterpriseReportGenerationOptions>(EMPTY_OPTIONS);
  const [newReportType, setNewReportType] = useState("");
  const [generationDraft, setGenerationDraft] = useState<GenerationDraft>({});
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [busyActionId, setBusyActionId] = useState<string | null>(null);
  const [generationJob, setGenerationJob] = useState<GenerationJob | null>(null);
  const [generationStatusUrl, setGenerationStatusUrl] = useState<string | null>(null);
  useToastMessage(message, "success");
  useToastMessage(errorMessage, "error");

  const generationStorageKey = useMemo(() => `dtsc:finance-report-generation:${organizationId}`, [organizationId]);
  const params = useMemo(() => { const value = new URLSearchParams({ page: String(page), pageSize: "20" }); if (search.trim()) value.set("search", search.trim()); if (type) value.set("type", type); if (status) value.set("status", status); return value; }, [page, search, type, status]);
  const reports = useEnterpriseV2Collection<ReportItem>({ endpoint: `/api/enterprise/${organizationId}/reports`, params, refreshKey });
  const reportTypeChoices = useMemo(() => catalog.map((item) => ({ id: item.code, label: reportTypeLabel(locale, item.code) })), [catalog, locale]);
  const selectedCatalog = useMemo(() => catalog.find((item) => item.code === newReportType) || null, [catalog, newReportType]);
  const filterLabels = useMemo(() => detail ? {
    departmentId: locale === "en" ? detail.filterReferences?.department?.labelEn || detail.filterReferences?.department?.labelFr || "" : detail.filterReferences?.department?.labelFr || "",
    supplierId: detail.filterReferences?.supplier?.label || "",
    budgetId: detail.filterReferences?.budget?.label || "",
  } : null, [detail, locale]);
  const detailModel = useMemo(() => detail ? buildEnterpriseProfessionalReport({ locale, organizationName, reference: detail.report.reference, title: detail.report.title, reportType: detail.report.reportType, reportTypeLabel: reportTypeLabel(locale, detail.report.reportType), generatedAt: detail.report.generatedAt, generatedByLabel: detail.generatedByLabel, periodStart: detail.report.periodStart, periodEnd: detail.report.periodEnd, currency: detail.report.currency, snapshot: detail.report.snapshotJson, filters: detail.report.filtersJson, filterLabels }) : null, [detail, filterLabels, locale, organizationName]);

  useEffect(() => {
    void Promise.all([
      fetch(`/api/enterprise/${organizationId}/reports/catalog`, { cache: "no-store" }).then((response) => response.ok ? response.json() : Promise.reject()),
      fetch(`/api/enterprise/${organizationId}/reports/views`, { cache: "no-store" }).then((response) => response.ok ? response.json() : Promise.reject()),
      fetch(`/api/enterprise/${organizationId}/reports/options`, { cache: "no-store" }).then((response) => response.ok ? response.json() : Promise.reject()),
    ]).then(([catalogBody, viewsBody, optionsBody]) => {
      const nextCatalog = (catalogBody as { catalog?: ReportCatalogItem[]; reports?: ReportCatalogItem[] }).catalog || (catalogBody as { reports?: ReportCatalogItem[] }).reports || [];
      setCatalog(nextCatalog);
      setMetrics((catalogBody as { metrics?: MetricDefinitionItem[] }).metrics || []);
      setViews((viewsBody as { views?: SavedReportView[] }).views || []);
      setGenerationOptions({ ...EMPTY_OPTIONS, ...(optionsBody as Partial<EnterpriseReportGenerationOptions>) });
      setNewReportType((current) => current && nextCatalog.some((item) => item.code === current) ? current : nextCatalog[0]?.code || "");
    }).catch(() => {
      setCatalog([]); setMetrics([]); setViews([]); setGenerationOptions(EMPTY_OPTIONS);
    });
  }, [organizationId, refreshKey]);

  useEffect(() => {
    const stored = window.sessionStorage.getItem(generationStorageKey);
    if (!stored) return;
    try {
      const pointer = JSON.parse(stored) as { id?: string; statusUrl?: string };
      if (pointer.id && pointer.statusUrl) { setGenerationJob({ id: pointer.id, status: "QUEUED" }); setGenerationStatusUrl(pointer.statusUrl); }
    } catch { window.sessionStorage.removeItem(generationStorageKey); }
  }, [generationStorageKey]);

  useEffect(() => {
    if (!generationStatusUrl) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let polls = 0;
    const poll = async () => {
      polls += 1;
      try {
        const response = await fetch(generationStatusUrl, { cache: "no-store" });
        const body = await response.json().catch(() => null) as { job?: GenerationJob } | null;
        if (!active) return;
        if (!response.ok || !body?.job) {
          if (response.status === 404 || response.status === 403) {
            window.sessionStorage.removeItem(generationStorageKey); setGenerationStatusUrl(null); setGenerationJob(null); setErrorMessage(t("reports.generationFailed")); return;
          }
        } else {
          const job = body.job; setGenerationJob(job);
          if (job.status === "COMPLETED") {
            window.sessionStorage.removeItem(generationStorageKey); setGenerationStatusUrl(null); setGenerationDraft({}); setRefreshKey((value) => value + 1); setMessage(t("reports.generationReady")); return;
          }
          if (job.status === "DEAD") {
            window.sessionStorage.removeItem(generationStorageKey); setGenerationStatusUrl(null); setErrorMessage(job.message || t("reports.generationFailed")); setCreateOpen(true); return;
          }
        }
      } catch { /* durable pointer is retained across transient network failures */ }
      if (active && polls < REPORT_GENERATION_MAX_POLLS) timer = setTimeout(() => void poll(), REPORT_GENERATION_POLL_MS);
    };
    void poll();
    return () => { active = false; if (timer) clearTimeout(timer); };
  }, [generationStatusUrl, generationStorageKey, locale]);

  async function saveView(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    setMessage(""); setErrorMessage(""); setBusy(true);
    const form = Object.fromEntries(new FormData(event.currentTarget).entries());
    const reportType = String(form.reportType || type || catalog[0]?.code || "");
    if (!reportType) { setBusy(false); setErrorMessage(humanLoadError); return; }
    try {
      await enterpriseV2Mutation(`/api/enterprise/${organizationId}/reports/views`, "POST", { reportType, name: form.name, visibility: form.visibility || "PERSONAL", filters: { search, type: type || reportType, status }, dimensions: [], sort: [], isDefault: form.isDefault === "on", isFavorite: form.isFavorite === "on" });
      setSaveViewOpen(false); setRefreshKey((value) => value + 1); setMessage(t("reports.viewSaved"));
    } catch (error) { setErrorMessage(error instanceof Error && !error.message.includes("ACTION_FAILED") ? error.message : humanActionError); }
    finally { setBusy(false); }
  }

  function applyView(view: SavedReportView) {
    const filters = (view.filtersJson && typeof view.filtersJson === "object" ? view.filtersJson : {}) as Record<string, unknown>;
    setSearch(typeof filters.search === "string" ? filters.search : ""); setType(typeof filters.type === "string" ? filters.type : view.reportType); setStatus(typeof filters.status === "string" ? filters.status : ""); setPage(1);
  }

  function generateFromCatalog(item: ReportCatalogItem) {
    setNewReportType(item.code);
    setCatalogDetail(null);
    setCreateOpen(true);
  }

  async function generate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy || generationStatusUrl || !newReportType) return;
    setMessage(""); setErrorMessage(""); setBusy(true);
    const formData = new FormData(event.currentTarget);
    const draft = formDraft(formData); setGenerationDraft(draft);
    const form = { ...draft, reportType: newReportType };
    try {
      const body = await enterpriseV2Mutation(`/api/enterprise/${organizationId}/reports/generate`, "POST", form) as GenerationAccepted | null;
      if (!body?.job?.id || !body.job.statusUrl) throw new Error(humanActionError);
      const pointer = { id: body.job.id, statusUrl: body.job.statusUrl }; window.sessionStorage.setItem(generationStorageKey, JSON.stringify(pointer));
      setGenerationJob({ id: body.job.id, status: body.job.status }); setGenerationStatusUrl(body.job.statusUrl); setCreateOpen(false); setMessage(t("reports.generationQueued"));
    } catch (error) { setErrorMessage(error instanceof Error && !error.message.includes("ACTION_FAILED") ? error.message : humanActionError); }
    finally { setBusy(false); }
  }

  async function runAction(item: Pick<ReportItem, "id" | "revision" | "capabilities">, action: "PUBLISH" | "ARCHIVE") {
    if (busyActionId) return; setMessage(""); setErrorMessage(""); setBusyActionId(item.id);
    try { await enterpriseV2Mutation(`/api/enterprise/${organizationId}/reports/${item.id}/actions`, "POST", { action, revision: item.revision }); setDetail(null); setRefreshKey((value) => value + 1); setMessage(t("reports.updated")); }
    catch (error) { setErrorMessage(error instanceof Error && !error.message.includes("ACTION_FAILED") ? error.message : humanActionError); }
    finally { setBusyActionId(null); }
  }

  async function open(item: ReportItem) {
    setErrorMessage("");
    const response = await fetch(`/api/enterprise/${organizationId}/reports/${item.id}`, { cache: "no-store" });
    const body = await response.json().catch(() => null) as (ReportDetail & { message?: string }) | null;
    if (!response.ok || !body) { setErrorMessage(body?.message || humanLoadError); return; }
    setDetail(body);
  }

  const actions = (item: ReportItem): BusinessContextAction[] => [
    { id: "open", label: t("reports.action.open"), icon: Eye, disabled: busyActionId === item.id, onSelect: () => void open(item) },
    { id: "export", label: t("reports.action.export"), icon: Download, disabled: busyActionId === item.id, onSelect: () => { window.location.href = `/api/enterprise/${organizationId}/reports/${item.id}/export`; } },
    ...(item.capabilities?.canPublish ? [{ id: "publish", label: t("reports.action.publish"), icon: Send, disabled: busyActionId === item.id, onSelect: () => void runAction(item, "PUBLISH") }] : []),
    ...(item.capabilities?.canArchive ? [{ id: "archive", label: t("reports.action.archive"), icon: Archive, destructive: true, separatorBefore: true, disabled: busyActionId === item.id, onSelect: () => void runAction(item, "ARCHIVE") }] : []),
  ];

  const catalogActions: BusinessContextAction[] = catalogDetail ? [
    ...(canCreate ? [{ id: "generate", label: t("reports.generateReport"), icon: FileBarChart2, disabled: Boolean(generationStatusUrl), onSelect: () => generateFromCatalog(catalogDetail) }] : []),
    { id: "refresh", label: locale === "en" ? "Refresh catalog" : "Actualiser le catalogue", icon: RotateCcw, separatorBefore: canCreate, onSelect: () => setRefreshKey((value) => value + 1) },
  ] : [];

  const reportDetailActions: BusinessContextAction[] = detail && detailModel ? [
    { id: "csv", label: "CSV", icon: Download, onSelect: () => downloadProfessionalCsv(detailModel) },
    { id: "xlsx", label: "Excel", icon: FileSpreadsheet, onSelect: () => downloadProfessionalXlsx(detailModel) },
    { id: "pdf", label: "PDF", icon: FileText, onSelect: () => downloadProfessionalPdfV2(detailModel) },
    ...(detail.report.capabilities?.canPublish ? [{ id: "publish", label: t("reports.action.publish"), icon: Send, separatorBefore: true, disabled: busyActionId === detail.report.id, onSelect: () => void runAction(detail.report, "PUBLISH") }] : []),
    ...(detail.report.capabilities?.canArchive ? [{ id: "archive", label: t("reports.action.archive"), icon: Archive, destructive: true, separatorBefore: true, disabled: busyActionId === detail.report.id, onSelect: () => void runAction(detail.report, "ARCHIVE") }] : []),
  ] : [];

  const publishedTotal = reports.meta.metrics?.published ?? 0;
  const latestGeneratedAt = reports.meta.latestGeneratedAt;
  const supports = (filter: string) => selectedCatalog?.supportedFilters?.includes(filter) ?? false;
  const catalogMetrics = catalogDetail ? metrics.filter((metric) => catalogDetail.code === "FINANCE_OVERVIEW" || metric.supportedFilters.some((filter) => catalogDetail.supportedFilters.includes(filter))) : [];

  return <div className="grid min-w-0 max-w-full gap-6">
    <ModuleMetrics label={t("reports.indicators")}><ModuleMetric label={t("reports.metric.reports")} value={reports.pagination.total} /><ModuleMetric label={t("reports.metric.published")} value={publishedTotal} /><ModuleMetric label={t("reports.metric.latest")} value={latestGeneratedAt ? formatEnterpriseDate(latestGeneratedAt, locale) : "—"} /><ModuleMetric label={t("reports.metric.savedViews")} value={views.length} /></ModuleMetrics>

    <ModuleSection title={t("reports.catalog.title")} description={t("reports.catalog.description")} count={`${catalog.length}`}>
      <BusinessList ariaLabel={t("reports.catalog.aria")}>{catalog.map((item) => <BusinessListItem key={item.code} title={reportTypeLabel(locale, item.code)} status={<StatusBadge tone="info">{reportFamilyLabel(locale, item.family)}</StatusBadge>} meta={`${reportSourceLabel(locale, item.sourcePolicyCode)} · ${reportFreshnessLabel(locale, item.freshnessPolicyCode)}`} description={`${t("reports.catalog.metrics")}: ${metrics.filter((metric) => item.code === "FINANCE_OVERVIEW" || metric.supportedFilters.some((filter) => item.supportedFilters.includes(filter))).slice(0, 6).map((metric) => reportMetricLabel(locale, metric.code)).join(", ") || "—"} · ${t("reports.catalog.formats")}: ${item.formatCodes.join(", ")}`} onOpen={() => setCatalogDetail(item)} />)}</BusinessList>
    </ModuleSection>

    {views.length ? <ModuleSection title={t("reports.saved.title")} description={t("reports.saved.description")} count={`${views.length}`}><BusinessList ariaLabel={t("reports.saved.aria")}>{views.map((view) => <BusinessListItem key={view.id} title={view.name} status={<StatusBadge tone={view.isFavorite ? "success" : "neutral"}>{view.isFavorite ? t("reports.saved.favorite") : reportVisibilityLabel(locale, view.visibility)}</StatusBadge>} meta={reportTypeLabel(locale, view.reportType)} description={`${view.isDefault ? `${t("reports.saved.default")} · ` : ""}${formatEnterpriseDate(view.updatedAt, locale)}`} onOpen={() => applyView(view)} />)}</BusinessList></ModuleSection> : null}

    {generationJob ? <ModuleSection title={t("reports.generationStatusTitle")} description={t("reports.generationLeaveHint")}><div className="flex min-w-0 flex-wrap items-center gap-3 rounded-2xl border border-dtsc-border bg-dtsc-page p-4"><StatusBadge tone={generationTone(generationJob.status)}>{generationLabel(locale, generationJob.status)}</StatusBadge>{generationJob.report ? <span className="min-w-0 truncate text-sm font-bold text-dtsc-ink">{generationJob.report.reference} · {generationJob.report.title}</span> : null}</div></ModuleSection> : null}

    {catalog.length ? <EnterpriseReportSchedules organizationId={organizationId} canManage={canManage} locale={locale} catalog={catalog} options={generationOptions} /> : null}

    <ModuleSection title={t("reports.section.title")} description={t("reports.section.description")} count={`${reports.pagination.total}`} action={<div className="flex flex-wrap gap-2"><Button variant="outline" disabled={!catalog.length} onClick={() => setSaveViewOpen(true)}>{t("reports.saveView")}</Button>{canCreate ? <Button disabled={Boolean(generationStatusUrl) || !catalog.length} onClick={() => { setNewReportType((current) => current || catalog[0]?.code || ""); setCreateOpen(true); }}><Plus className="h-4 w-4" />{t("reports.generateReport")}</Button> : null}</div>}>
      <div className="grid gap-2 border-y border-dtsc-border py-3 md:grid-cols-3"><Input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder={t("reports.search")} /><NativeSelect value={type} onChange={setType} items={reportTypeChoices} /><NativeSelect value={status} onChange={setStatus} items={statuses.map((id) => ({ id, label: statusLabel(locale, id) }))} /></div>
      {reports.loading ? <p className="py-8 text-center text-sm text-dtsc-muted">{t("common.loading")}</p> : reports.items.length ? <BusinessList ariaLabel={t("reports.aria")}>{reports.items.map((item) => <BusinessListItem key={item.id} title={`${item.reference} · ${item.title}`} status={<StatusBadge tone={tone(item.status)}>{statusLabel(locale, item.status)}</StatusBadge>} meta={`${reportTypeLabel(locale, item.reportType)}${item.currency ? ` · ${item.currency}` : ""}`} description={`${item.freshnessAt ? t("reports.fresh", { date: formatEnterpriseDate(item.freshnessAt, locale) }) : t("reports.freshnessUnavailable")} · ${formatEnterpriseDate(item.generatedAt, locale)}${item.periodStart ? ` · ${formatEnterpriseDate(item.periodStart, locale)} – ${formatEnterpriseDate(item.periodEnd, locale)}` : ""}`} onOpen={() => void open(item)} actions={<ContextActions label={t("reports.actions")} actions={actions(item)} />} />)}</BusinessList> : <EmptyState compact title={t("reports.noReports")} description={reports.error || t("reports.noReportsDescription")} />}
      <div className="mt-3 flex justify-between border-t border-dtsc-border pt-3 text-sm text-dtsc-muted"><span>{t("common.page", { current: reports.pagination.page, total: reports.pagination.pageCount })}</span><div className="flex gap-2"><Button variant="outline" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>{t("common.previous")}</Button><Button variant="outline" disabled={page >= reports.pagination.pageCount} onClick={() => setPage((value) => value + 1)}>{t("common.next")}</Button></div></div>
    </ModuleSection>

    {legacyRecords.length ? <ModuleSection title={t("reports.historical.title")} description={t("reports.historical.description")}><BusinessList ariaLabel={t("reports.historical.aria")}>{legacyRecords.map((item) => <BusinessListItem key={item.id} title={item.title} status={<StatusBadge>{t("reports.historyBadge")}</StatusBadge>} description={item.description || statusLabel(locale, item.status)} />)}</BusinessList></ModuleSection> : null}

    <Dialog open={saveViewOpen} onClose={() => setSaveViewOpen(false)} title={t("reports.save.title")} presentation="editor"><form onSubmit={saveView} className="grid gap-4 p-3 sm:p-5"><Field label={t("reports.save.name")}><Input name="name" required /></Field><Field label={t("reports.save.reportType")}><NativeSelect name="reportType" required defaultValue={type || catalog[0]?.code || ""} items={reportTypeChoices} /></Field><Field label={t("reports.save.visibility")}><NativeSelect name="visibility" defaultValue="PERSONAL" items={[{ id: "PERSONAL", label: t("reports.save.personal") }, ...(canManage ? [{ id: "ORGANIZATION", label: t("reports.save.organization") }] : [])]} /></Field><label className="flex min-h-11 items-center gap-2 text-sm font-bold"><input type="checkbox" name="isDefault" />{t("reports.save.default")}</label><label className="flex min-h-11 items-center gap-2 text-sm font-bold"><input type="checkbox" name="isFavorite" />{t("reports.save.favorite")}</label><Button type="submit" disabled={busy || !catalog.length}>{t("reports.saveView")}</Button></form></Dialog>

    <Dialog open={createOpen} onClose={() => { if (!busy) setCreateOpen(false); }} title={t("reports.generate.title")} presentation="editor" className="h-[100dvh] w-screen max-w-none rounded-none sm:h-auto sm:w-auto sm:max-w-4xl sm:rounded-3xl">
      <form onSubmit={generate} className="grid min-w-0 gap-5 p-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-5">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label={t("reports.generate.reportTitle")} help={locale === "en" ? "Give the archived report a business-readable title." : "Donnez au rapport archivé un titre compréhensible par les utilisateurs métier."}><Input name="title" required defaultValue={generationDraft.title || ""} /></Field>
          <Field label={t("reports.generate.reportType")} help={locale === "en" ? "The selected catalog definition controls available filters and indicators." : "La définition du catalogue sélectionnée détermine les filtres et indicateurs disponibles."}><NativeSelect name="reportType" required value={newReportType} onChange={setNewReportType} items={reportTypeChoices} /></Field>
        </div>
        {selectedCatalog ? <section className="grid min-w-0 gap-4 rounded-2xl border border-dtsc-border bg-dtsc-page p-4"><div className="grid gap-4 md:grid-cols-2">
          {supports("period") ? <><Field label={t("reports.generate.periodStart")}><Input name="periodStart" type="date" defaultValue={generationDraft.periodStart || ""} /></Field><Field label={t("reports.generate.periodEnd")}><Input name="periodEnd" type="date" defaultValue={generationDraft.periodEnd || ""} /></Field></> : null}
          {supports("currency") ? <Field label={t("reports.generate.currency")}><NativeSelect name="currency" defaultValue={generationDraft.currency || ""} items={generationOptions.currencies} /></Field> : null}
          {supports("departmentId") ? <Field label={t("reports.schedule.department")}><NativeSelect name="departmentId" defaultValue={generationDraft.departmentId || ""} items={generationOptions.departments} /></Field> : null}
          {supports("supplierId") ? <Field label={t("reports.schedule.supplier")}><NativeSelect name="supplierId" defaultValue={generationDraft.supplierId || ""} items={generationOptions.suppliers} /></Field> : null}
          {supports("budgetId") ? <Field label={t("reports.schedule.budget")}><NativeSelect name="budgetId" defaultValue={generationDraft.budgetId || ""} items={generationOptions.budgets} /></Field> : null}
          {supports("category") ? <Field label={t("reports.generate.category")}><NativeSelect name="category" defaultValue={generationDraft.category || ""} items={generationOptions.categories} /></Field> : null}
        </div></section> : null}
        <Field label={t("reports.generate.description")} help={locale === "en" ? "Optional context stored with the report." : "Contexte facultatif conservé avec le rapport."}><textarea name="description" defaultValue={generationDraft.description || ""} className="min-h-24 rounded-xl border border-dtsc-border bg-dtsc-surface p-3 text-base md:text-sm" /></Field>
        <Button type="submit" disabled={busy || Boolean(generationStatusUrl) || !newReportType}><FileBarChart2 className="h-4 w-4" />{t("reports.generate.submit")}</Button>
      </form>
    </Dialog>

    <FullscreenEntityDetail
      open={Boolean(catalogDetail)}
      onClose={() => setCatalogDetail(null)}
      title={catalogDetail ? reportTypeLabel(locale, catalogDetail.code) : ""}
      description={catalogDetail ? t(catalogDetail.descriptionKey as EnterpriseCoreKey) : undefined}
      actions={catalogActions}
      actionLabel={t("reports.actions")}
    >
      {catalogDetail ? <div className="grid min-w-0 gap-5">
        <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <CatalogFact label={locale === "en" ? "Family" : "Famille"} value={reportFamilyLabel(locale, catalogDetail.family)} />
          <CatalogFact label={locale === "en" ? "Source" : "Source"} value={reportSourceLabel(locale, catalogDetail.sourcePolicyCode)} />
          <CatalogFact label={locale === "en" ? "Freshness" : "Fraîcheur"} value={reportFreshnessLabel(locale, catalogDetail.freshnessPolicyCode)} />
          <CatalogFact label={t("reports.catalog.formats")} value={catalogDetail.formatCodes.join(", ")} />
        </div>
        <section className="rounded-2xl border border-dtsc-border bg-dtsc-surface p-4 sm:p-5">
          <h3 className="font-black text-dtsc-ink">{t("reports.catalog.metrics")}</h3>
          <div className="mt-3 flex min-w-0 flex-wrap gap-2">{catalogMetrics.length ? catalogMetrics.map((metric) => <span key={metric.code} className="max-w-full rounded-full border border-dtsc-border bg-dtsc-soft px-3 py-2 text-xs font-bold text-dtsc-ink">{reportMetricLabel(locale, metric.code)}</span>) : <span className="text-sm text-dtsc-muted">—</span>}</div>
        </section>
        {canCreate ? <p className="rounded-xl border border-cyan-400/30 bg-cyan-400/5 p-4 text-sm leading-6 text-dtsc-muted">{locale === "en" ? "Use the … menu to generate this report. The generation form will only expose filters supported by this catalog definition." : "Utilisez le menu … pour générer ce rapport. Le formulaire n’affichera que les filtres réellement supportés par cette définition du catalogue."}</p> : null}
      </div> : null}
    </FullscreenEntityDetail>

    <FullscreenEntityDetail
      open={Boolean(detail)}
      onClose={() => setDetail(null)}
      title={detail ? `${detail.report.reference} · ${detail.report.title}` : ""}
      actions={reportDetailActions}
      actionLabel={t("reports.actions")}
    >
      {detail && detailModel ? <div className="grid min-w-0 gap-5"><ProfessionalReportView model={detailModel} locale={locale} logoUrl={organizationLogoUrl} />{detail.events.length ? <section className="rounded-2xl border border-dtsc-border bg-dtsc-page p-4"><h3 className="font-black text-dtsc-ink">{t("history")}</h3><div className="mt-3 grid gap-2 text-sm text-dtsc-muted">{detail.events.slice(0, 10).map((event) => <p key={event.id}>{formatEnterpriseDate(event.createdAt, locale)} · {event.summary}</p>)}</div></section> : null}</div> : null}
    </FullscreenEntityDetail>
  </div>;
}

function CatalogFact({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0 rounded-xl border border-dtsc-border bg-dtsc-page/60 p-4"><span className="text-xs font-black uppercase tracking-[0.05em] text-dtsc-muted">{label}</span><strong className="mt-1 block break-words text-sm text-dtsc-ink">{value || "—"}</strong></div>;
}
