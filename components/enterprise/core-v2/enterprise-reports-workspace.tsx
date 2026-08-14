"use client";

import { Archive, Download, Eye, FileBarChart2, Plus, Send } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { BusinessList, BusinessListItem } from "@/components/workspace/business-list";
import { ContextActions, type BusinessContextAction } from "@/components/workspace/context-actions";
import { EmptyState } from "@/components/workspace/empty-state";
import { ModuleMetric, ModuleMetrics } from "@/components/workspace/module-metrics";
import { ModuleSection } from "@/components/workspace/module-workspace";
import { StatusBadge } from "@/components/workspace/status-badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToastMessage } from "@/components/ui/use-toast-message";
import { Field, NativeSelect, formatEnterpriseDate, statusLabel } from "@/components/enterprise/core-v2/erp-v2-ui";
import { enterpriseV2Mutation, useEnterpriseV2Collection } from "@/components/enterprise/core-v2/use-enterprise-v2-collection";
import { enterpriseCoreT, type EnterpriseCoreKey } from "@/lib/enterprise-core-i18n";

type LegacyRecord = { id: string; title: string; description: string | null; status: string; updatedAt: string };
type ReportItem = { id: string; reference: string; title: string; description: string | null; reportType: string; status: string; periodStart: string | null; periodEnd: string | null; currency: string | null; unitCode: string | null; sourcePolicyCode: string | null; metricDefinitionCodesJson: unknown; freshnessAt: string | null; generatedByUserId: string; generatedAt: string; schemaVersion: number; revision: number };
type ReportDetail = { report: ReportItem & { filtersJson: unknown; snapshotJson: unknown; roundingPolicyCode?: string | null; sourceModule?: string | null; sourceEntityType?: string | null; sourceEntityId?: string | null }; links: Array<{ id: string; sourceEntityType: string; sourceEntityId: string; targetEntityType: string; targetEntityId: string }>; events: Array<{ id: string; summary: string; createdAt: string }> };
type ReportCatalogItem = { code: string; titleKey: string; descriptionKey: string; family: string; domain: string; sourcePolicyCode: string; supportedDimensions: readonly string[]; supportedFilters: readonly string[]; freshnessPolicyCode: string; formatCodes: readonly string[] };
type MetricDefinitionItem = { code: string; sourceCode: string; unitType: string; calculationPolicyCode: string; supportedDimensions: string[]; supportedFilters: string[]; freshnessPolicyCode: string };
type SavedReportView = { id: string; reportType: string; name: string; visibility: string; filtersJson: unknown; isDefault: boolean; isFavorite: boolean; updatedAt: string };

const reportTypes = ["BUDGET_VS_ACTUAL", "EXPENSE_SUMMARY", "PROCUREMENT_SUMMARY", "FINANCE_OVERVIEW"];
const statuses = ["GENERATED", "PUBLISHED", "ARCHIVED"];

function reportLabel(locale: string | null | undefined, prefix: string, value: string) {
  return enterpriseCoreT(locale, `${prefix}.${value}` as EnterpriseCoreKey);
}

function reportTypeLabel(locale: string | null | undefined, value: string) {
  return reportLabel(locale, "reports.type", value);
}

function reportVisibilityLabel(locale: string | null | undefined, value: string) {
  return reportLabel(locale, "reports.visibility", value);
}

function reportFamilyLabel(locale: string | null | undefined, value: string) {
  return reportLabel(locale, "reports.family", value);
}

function reportSourceLabel(locale: string | null | undefined, value: string | null | undefined) {
  return value ? reportLabel(locale, "reports.source", value) : enterpriseCoreT(locale, "reports.canonicalSource");
}

function reportFreshnessLabel(locale: string | null | undefined, value: string) {
  return reportLabel(locale, "reports.freshness", value);
}

function reportMetricLabel(locale: string | null | undefined, value: string) {
  return reportLabel(locale, "reports.metric", value);
}

function tone(status: string) {
  return status === "PUBLISHED" ? "success" as const : status === "GENERATED" ? "info" as const : "neutral" as const;
}

export function EnterpriseReportsWorkspace({ organizationId, canCreate, canManage, locale, legacyRecords = [] }: { organizationId: string; canCreate: boolean; canManage: boolean; locale?: string | null; legacyRecords?: LegacyRecord[] }) {
  const t = (key: EnterpriseCoreKey, vars?: Record<string, string | number>) => enterpriseCoreT(locale, key, vars);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [saveViewOpen, setSaveViewOpen] = useState(false);
  const [detail, setDetail] = useState<ReportDetail | null>(null);
  const [catalog, setCatalog] = useState<ReportCatalogItem[]>([]);
  const [metrics, setMetrics] = useState<MetricDefinitionItem[]>([]);
  const [views, setViews] = useState<SavedReportView[]>([]);
  const [message, setMessage] = useState("");
  useToastMessage(message);

  const params = useMemo(() => { const value = new URLSearchParams({ page: String(page), pageSize: "20" }); if (search.trim()) value.set("search", search.trim()); if (type) value.set("type", type); if (status) value.set("status", status); return value; }, [page, search, type, status]);
  const reports = useEnterpriseV2Collection<ReportItem>({ endpoint: `/api/enterprise/${organizationId}/reports`, params, refreshKey });

  useEffect(() => {
    void Promise.all([
      fetch(`/api/enterprise/${organizationId}/reports/catalog`, { cache: "no-store" }).then((response) => response.ok ? response.json() : Promise.reject()),
      fetch(`/api/enterprise/${organizationId}/reports/views`, { cache: "no-store" }).then((response) => response.ok ? response.json() : Promise.reject()),
    ]).then(([catalogBody, viewsBody]) => {
      setCatalog((catalogBody as { catalog?: ReportCatalogItem[] }).catalog || []);
      setMetrics((catalogBody as { metrics?: MetricDefinitionItem[] }).metrics || []);
      setViews((viewsBody as { views?: SavedReportView[] }).views || []);
    }).catch(() => {
      setCatalog([]);
      setMetrics([]);
      setViews([]);
    });
  }, [organizationId, refreshKey]);

  async function saveView(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = Object.fromEntries(new FormData(event.currentTarget).entries());
    const reportType = String(form.reportType || type || "FINANCE_OVERVIEW");
    try {
      await enterpriseV2Mutation(`/api/enterprise/${organizationId}/reports/views`, "POST", { reportType, name: form.name, visibility: form.visibility || "PERSONAL", filters: { search, type: type || reportType, status }, dimensions: [], sort: [], isDefault: form.isDefault === "on", isFavorite: form.isFavorite === "on" });
      setSaveViewOpen(false);
      setRefreshKey((value) => value + 1);
      setMessage(t("reports.viewSaved"));
    } catch (error) { setMessage(error instanceof Error ? error.message : "ACTION_FAILED"); }
  }

  function applyView(view: SavedReportView) {
    const filters = (view.filtersJson && typeof view.filtersJson === "object" ? view.filtersJson : {}) as Record<string, unknown>;
    setSearch(typeof filters.search === "string" ? filters.search : "");
    setType(typeof filters.type === "string" ? filters.type : view.reportType);
    setStatus(typeof filters.status === "string" ? filters.status : "");
    setPage(1);
  }

  async function generate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      await enterpriseV2Mutation(`/api/enterprise/${organizationId}/reports/generate`, "POST", form);
      setCreateOpen(false);
      setRefreshKey((value) => value + 1);
      setMessage(t("reports.generated"));
    } catch (error) { setMessage(error instanceof Error ? error.message : "ACTION_FAILED"); }
  }

  async function runAction(item: ReportItem, action: "PUBLISH" | "ARCHIVE") {
    try {
      await enterpriseV2Mutation(`/api/enterprise/${organizationId}/reports/${item.id}/actions`, "POST", { action, revision: item.revision });
      setDetail(null);
      setRefreshKey((value) => value + 1);
      setMessage(t("reports.updated"));
    } catch (error) { setMessage(error instanceof Error ? error.message : "ACTION_FAILED"); }
  }

  async function open(item: ReportItem) {
    const response = await fetch(`/api/enterprise/${organizationId}/reports/${item.id}`, { cache: "no-store" });
    const body = await response.json() as ReportDetail & { message?: string };
    if (!response.ok) return setMessage(body.message || "LOAD_FAILED");
    setDetail(body);
  }

  const actions = (item: ReportItem): BusinessContextAction[] => [
    { id: "open", label: t("reports.action.open"), icon: Eye, onSelect: () => void open(item) },
    { id: "export", label: t("reports.action.export"), icon: Download, onSelect: () => { window.location.href = `/api/enterprise/${organizationId}/reports/${item.id}/export`; } },
    ...(canManage && item.status === "GENERATED" ? [{ id: "publish", label: t("reports.action.publish"), icon: Send, onSelect: () => void runAction(item, "PUBLISH") }] : []),
    ...(canManage && item.status !== "ARCHIVED" ? [{ id: "archive", label: t("reports.action.archive"), icon: Archive, destructive: true, separatorBefore: true, onSelect: () => void runAction(item, "ARCHIVE") }] : []),
  ];

  return <div className="grid min-w-0 gap-6">
    <ModuleMetrics label={t("reports.indicators")}><ModuleMetric label={t("reports.metric.reports")} value={reports.pagination.total} /><ModuleMetric label={t("reports.metric.published")} value={reports.items.filter((item) => item.status === "PUBLISHED").length} /><ModuleMetric label={t("reports.metric.latest")} value={reports.items[0] ? formatEnterpriseDate(reports.items[0].generatedAt, locale) : "—"} /><ModuleMetric label={t("reports.metric.savedViews")} value={views.length} /></ModuleMetrics>
    <ModuleSection title={t("reports.catalog.title")} description={t("reports.catalog.description")} count={`${catalog.length}`}><BusinessList ariaLabel={t("reports.catalog.aria")}>{catalog.map((item) => <BusinessListItem key={item.code} title={reportTypeLabel(locale, item.code)} status={<StatusBadge tone="info">{reportFamilyLabel(locale, item.family)}</StatusBadge>} meta={`${reportSourceLabel(locale, item.sourcePolicyCode)} · ${reportFreshnessLabel(locale, item.freshnessPolicyCode)}`} description={`${t("reports.catalog.metrics")}: ${metrics.filter((metric) => item.code === "FINANCE_OVERVIEW" || metric.supportedFilters.some((filter) => item.supportedFilters.includes(filter))).slice(0, 6).map((metric) => reportMetricLabel(locale, metric.code)).join(", ") || "—"} · ${t("reports.catalog.formats")}: ${item.formatCodes.join(", ")}`} />)}</BusinessList></ModuleSection>
    {views.length ? <ModuleSection title={t("reports.saved.title")} description={t("reports.saved.description")} count={`${views.length}`}><BusinessList ariaLabel={t("reports.saved.aria")}>{views.map((view) => <BusinessListItem key={view.id} title={view.name} status={<StatusBadge tone={view.isFavorite ? "success" : "neutral"}>{view.isFavorite ? t("reports.saved.favorite") : reportVisibilityLabel(locale, view.visibility)}</StatusBadge>} meta={reportTypeLabel(locale, view.reportType)} description={`${view.isDefault ? `${t("reports.saved.default")} · ` : ""}${formatEnterpriseDate(view.updatedAt, locale)}`} onOpen={() => applyView(view)} />)}</BusinessList></ModuleSection> : null}
    <ModuleSection title={t("reports.section.title")} description={t("reports.section.description")} count={`${reports.pagination.total}`} action={<div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => setSaveViewOpen(true)}>{t("reports.saveView")}</Button>{canCreate ? <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" />{t("reports.generateReport")}</Button> : null}</div>}>
      <div className="grid gap-2 border-y border-dtsc-border py-3 md:grid-cols-3"><Input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder={t("reports.search")} /><NativeSelect value={type} onChange={setType} items={reportTypes.map((id) => ({ id, label: reportTypeLabel(locale, id) }))} /><NativeSelect value={status} onChange={setStatus} items={statuses.map((id) => ({ id, label: statusLabel(locale, id) }))} /></div>
      {reports.loading ? <p className="py-8 text-center text-sm text-dtsc-muted">{t("common.loading")}</p> : reports.items.length ? <BusinessList ariaLabel={t("reports.aria")}>{reports.items.map((item) => <BusinessListItem key={item.id} title={`${item.reference} · ${item.title}`} status={<StatusBadge tone={tone(item.status)}>{statusLabel(locale, item.status)}</StatusBadge>} meta={`${reportTypeLabel(locale, item.reportType)}${item.currency ? ` · ${item.currency}` : ""}`} description={`${reportSourceLabel(locale, item.sourcePolicyCode)} · ${item.freshnessAt ? t("reports.fresh", { date: formatEnterpriseDate(item.freshnessAt, locale) }) : t("reports.freshnessUnavailable")} · ${formatEnterpriseDate(item.generatedAt, locale)}${item.periodStart ? ` · ${formatEnterpriseDate(item.periodStart, locale)} → ${formatEnterpriseDate(item.periodEnd, locale)}` : ""}`} onOpen={() => void open(item)} actions={<ContextActions label={t("reports.actions")} actions={actions(item)} />} />)}</BusinessList> : <EmptyState compact title={t("reports.noReports")} description={reports.error || t("reports.noReportsDescription")} />}
      <div className="mt-3 flex justify-between border-t border-dtsc-border pt-3 text-sm text-dtsc-muted"><span>{t("common.page", { current: reports.pagination.page, total: reports.pagination.pageCount })}</span><div className="flex gap-2"><Button variant="outline" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>{t("common.previous")}</Button><Button variant="outline" disabled={page >= reports.pagination.pageCount} onClick={() => setPage((value) => value + 1)}>{t("common.next")}</Button></div></div>
    </ModuleSection>
    {legacyRecords.length ? <ModuleSection title={t("reports.historical.title")} description={t("reports.historical.description")}><BusinessList ariaLabel={t("reports.historical.aria")}>{legacyRecords.map((item) => <BusinessListItem key={item.id} title={item.title} status={<StatusBadge>{t("reports.historyBadge")}</StatusBadge>} description={item.description || statusLabel(locale, item.status)} />)}</BusinessList></ModuleSection> : null}
    <Dialog open={saveViewOpen} onClose={() => setSaveViewOpen(false)} title={t("reports.save.title")}><form onSubmit={saveView} className="grid gap-4"><Field label={t("reports.save.name")}><Input name="name" required /></Field><Field label={t("reports.save.reportType")}><NativeSelect name="reportType" defaultValue={type || "FINANCE_OVERVIEW"} items={reportTypes.map((id) => ({ id, label: reportTypeLabel(locale, id) }))} /></Field><Field label={t("reports.save.visibility")}><NativeSelect name="visibility" defaultValue="PERSONAL" items={[{ id: "PERSONAL", label: t("reports.save.personal") }, ...(canManage ? [{ id: "ORGANIZATION", label: t("reports.save.organization") }] : [])]} /></Field><label className="flex min-h-11 items-center gap-2 text-sm font-bold"><input type="checkbox" name="isDefault" />{t("reports.save.default")}</label><label className="flex min-h-11 items-center gap-2 text-sm font-bold"><input type="checkbox" name="isFavorite" />{t("reports.save.favorite")}</label><Button type="submit">{t("reports.saveView")}</Button></form></Dialog>
    <Dialog open={createOpen} onClose={() => setCreateOpen(false)} title={t("reports.generate.title")} className="h-[96dvh] max-w-3xl"><form onSubmit={generate} className="grid gap-4"><Field label={t("reports.generate.reportTitle")}><Input name="title" required /></Field><Field label={t("reports.generate.reportType")}><NativeSelect name="reportType" required defaultValue="BUDGET_VS_ACTUAL" items={reportTypes.map((id) => ({ id, label: reportTypeLabel(locale, id) }))} /></Field><div className="grid gap-3 md:grid-cols-2"><Field label={t("reports.generate.periodStart")}><Input name="periodStart" type="date" /></Field><Field label={t("reports.generate.periodEnd")}><Input name="periodEnd" type="date" /></Field><Field label={t("reports.generate.currency")}><Input name="currency" maxLength={3} placeholder={t("reports.generate.currencyPlaceholder")} /></Field><Field label={t("reports.generate.category")}><Input name="category" /></Field></div><Field label={t("reports.generate.description")}><textarea name="description" className="min-h-20 rounded-xl border border-dtsc-border bg-dtsc-surface p-3 text-sm" /></Field><Button type="submit"><FileBarChart2 className="h-4 w-4" />{t("reports.generate.submit")}</Button></form></Dialog>
    <Dialog open={Boolean(detail)} onClose={() => setDetail(null)} title={detail ? `${detail.report.reference} · ${detail.report.title}` : ""} className="h-[96dvh] max-w-5xl">{detail ? <div className="grid gap-5"><div className="grid gap-2 border-y border-dtsc-border py-3 text-sm md:grid-cols-3"><p><strong>{t("reports.detail.type")}</strong><br />{reportTypeLabel(locale, detail.report.reportType)}</p><p><strong>{t("reports.detail.generated")}</strong><br />{formatEnterpriseDate(detail.report.generatedAt, locale)}</p><p><strong>{t("reports.detail.status")}</strong><br />{statusLabel(locale, detail.report.status)}</p><p><strong>{t("reports.detail.source")}</strong><br />{reportSourceLabel(locale, detail.report.sourcePolicyCode)}</p><p><strong>{t("reports.detail.freshness")}</strong><br />{detail.report.freshnessAt ? formatEnterpriseDate(detail.report.freshnessAt, locale) : "—"}</p><p><strong>{t("reports.detail.unitRounding")}</strong><br />{detail.report.unitCode || "—"}</p></div><SnapshotView value={detail.report.snapshotJson} locale={locale} /><div className="border-y border-dtsc-border py-3 text-sm text-dtsc-muted"><strong>{t("reports.detail.filters")}</strong><pre className="mt-2 whitespace-pre-wrap break-words font-sans">{JSON.stringify(detail.report.filtersJson, null, 2)}</pre></div>{detail.events.length ? <div className="text-sm text-dtsc-muted">{detail.events.slice(0, 10).map((event) => <p key={event.id}>{formatEnterpriseDate(event.createdAt, locale)} · {event.summary}</p>)}</div> : null}</div> : null}</Dialog>
  </div>;
}

function SnapshotView({ value, locale }: { value: unknown; locale?: string | null }) {
  const envelope = value as Record<string, unknown> | null;
  if (!envelope) return null;
  const data = (envelope.data && typeof envelope.data === "object" ? envelope.data : envelope) as Record<string, unknown>;
  const currencies = Array.isArray(data.currencies) ? data.currencies as Array<Record<string, unknown>> : [];
  const lines = Array.isArray(data.lines) ? data.lines as Array<Record<string, unknown>> : [];
  const t = (key: EnterpriseCoreKey) => enterpriseCoreT(locale, key);
  return <div className="grid gap-4">{currencies.length ? <BusinessList ariaLabel={t("reports.snapshot.currencyAria")}>{currencies.map((item, index) => <BusinessListItem key={`${String(item.currency)}-${index}`} title={String(item.currency || "—")} meta={`${t("reports.snapshot.planned")} ${String(item.planned || "0")} · ${t("reports.snapshot.committed")} ${String(item.committed || "0")} · ${t("reports.snapshot.actual")} ${String(item.actual || "0")} · ${t("reports.snapshot.available")} ${String(item.available || "0")}`} />)}</BusinessList> : null}{lines.length ? <BusinessList ariaLabel={t("reports.snapshot.detailsAria")}>{lines.slice(0, 100).map((item, index) => <BusinessListItem key={`${String(item.budgetLineId || index)}`} title={String(item.name || item.budgetTitle || t("reports.snapshot.line"))} meta={`${String(item.currency || "")} · ${t("reports.snapshot.planned")} ${String(item.planned || "0")} · ${t("reports.snapshot.actual")} ${String(item.actual || "0")}`} description={`${t("reports.snapshot.committed")} ${String(item.committed || "0")} · ${t("reports.snapshot.available")} ${String(item.available || "0")}`} />)}</BusinessList> : <pre className="max-h-[55dvh] overflow-auto whitespace-pre-wrap break-words rounded-xl border border-dtsc-border p-3 text-xs">{JSON.stringify(value, null, 2)}</pre>}</div>;
}
