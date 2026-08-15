"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, Network, RotateCcw, Settings2, ShieldAlert } from "lucide-react";
import { Field, NativeSelect } from "@/components/enterprise/core-v2/erp-v2-ui";
import { ProfessionalError, ProfessionalFormSection, ProfessionalHelp, ProfessionalLoading } from "@/components/enterprise/professional/professional-erp-ui";
import { financeMutation, ReloadButton } from "@/components/enterprise/professional/finance-professional-workspace-shared";
import { financeEnumLabel, financeMetricLabel, type FinanceLocale } from "@/components/enterprise/professional/finance-professional-ui";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ModuleMetric, ModuleMetrics } from "@/components/workspace/module-metrics";
import { ModuleContent, ModuleHeader, ModuleSection, ModuleWorkspace } from "@/components/workspace/module-workspace";
import type { EnterpriseModuleDefinition } from "@/lib/enterprise/module-registry";
import { translateEnterpriseFinance, type EnterpriseFinanceKey } from "@/lib/i18n";

type ReadinessDiagnostic = { code: string; severity: "BLOCKER" | "WARNING"; ready: boolean; labelFr: string; labelEn: string; messageFr: string; messageEn: string; actionFr?: string; actionEn?: string; actionKind: "CONFIGURATION" | "LINK" | "NONE"; actionHref?: string };
type Readiness = { version?: number; configuration?: { functionalCurrencyCode?: string; presentationCurrencyCode?: string | null; inventoryValuationMethod?: string; reconciliationTolerance?: string | number; automaticPostingEnabled?: boolean; revision?: number } | null; diagnostics?: ReadinessDiagnostic[]; ready?: boolean; status?: string; blockers?: string[]; warnings?: string[] };
type SourceState = "success" | "empty" | "error";
type MetricRead = { state: SourceState; total: number | null; items: Array<{ unallocatedAmount?: string | number; status?: string }>; message?: string };
type MetricValue = { state: SourceState; value: number | null; message?: string };
type Summary = { openReceivables: MetricValue; openPayables: MetricValue; unallocatedPayments: MetricValue; openCashSessions: MetricValue; pendingReconciliations: MetricValue; invoicesToPost: MetricValue; pendingApprovals: MetricValue };
type ProjectionItem = { id: string; eventType: string; sourceEntityType: string; sourceEntityId: string; targetModule: string; targetEntityType?: string | null; targetEntityId?: string | null; status: string; attemptCount: number; lastErrorCode?: string | null; lastErrorMessage?: string | null; updatedAt: string; sourceDeepLink?: string | null; targetDeepLink?: string | null };
type ProjectionHealth = { items: ProjectionItem[]; metrics: Record<string, number>; pagination: { total: number } };

const unavailableMetric = (): MetricValue => ({ state: "error", value: null });
const EMPTY_SUMMARY: Summary = { openReceivables: unavailableMetric(), openPayables: unavailableMetric(), unallocatedPayments: unavailableMetric(), openCashSessions: unavailableMetric(), pendingReconciliations: unavailableMetric(), invoicesToPost: unavailableMetric(), pendingApprovals: unavailableMetric() };
const EMPTY_PROJECTION_HEALTH: ProjectionHealth = { items: [], metrics: {}, pagination: { total: 0 } };
const financeT = (locale: FinanceLocale, key: EnterpriseFinanceKey) => translateEnterpriseFinance(locale, key);

async function totalFor(url: string): Promise<MetricRead> {
  try {
    const response = await fetch(url, { cache: "no-store" });
    const body = await response.json().catch(() => null) as { pagination?: { total?: number }; items?: Array<{ unallocatedAmount?: string | number; status?: string }>; message?: string; error?: string } | null;
    if (!response.ok || !body) return { state: "error", total: null, items: [], message: body?.message || body?.error || `HTTP ${response.status}` };
    const total = Number(body.pagination?.total || 0);
    return { state: total === 0 ? "empty" : "success", total, items: body.items || [] };
  } catch (error) {
    return { state: "error", total: null, items: [], message: error instanceof Error ? error.message : "READ_FAILED" };
  }
}

function metricFrom(read: MetricRead, value = read.total): MetricValue {
  if (read.state === "error") return { state: "error", value: null, message: read.message };
  const number = Number(value || 0);
  return { state: number === 0 ? "empty" : "success", value: number, message: read.message };
}

function metricDisplay(metric: MetricValue, locale: FinanceLocale): ReactNode {
  return metric.state === "error" ? <span className="text-sm font-black text-amber-700 dark:text-amber-300">{financeT(locale, "unavailable")}</span> : metric.value;
}

function DiagnosticCard({ diagnostic, locale, canManage, openConfiguration }: { diagnostic: ReadinessDiagnostic; locale: FinanceLocale; canManage: boolean; openConfiguration: () => void }) {
  const label = locale === "fr" ? diagnostic.labelFr : diagnostic.labelEn;
  const description = locale === "fr" ? diagnostic.messageFr : diagnostic.messageEn;
  const action = locale === "fr" ? diagnostic.actionFr : diagnostic.actionEn;
  const stateLabel = diagnostic.ready ? financeT(locale, "done") : diagnostic.severity === "BLOCKER" ? financeT(locale, "required") : financeT(locale, "recommended");
  const content = <div className={`flex min-h-32 items-start gap-3 rounded-xl border p-4 ${diagnostic.ready ? "border-emerald-500/30 bg-emerald-500/5" : diagnostic.severity === "BLOCKER" ? "border-red-500/30 bg-red-500/5" : "border-amber-500/30 bg-amber-500/5"}`}>
    {diagnostic.ready ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" /> : <ShieldAlert className={`mt-0.5 h-5 w-5 shrink-0 ${diagnostic.severity === "BLOCKER" ? "text-red-600" : "text-amber-600"}`} />}
    <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-black text-dtsc-ink">{label}</p><span className="text-[0.65rem] font-black uppercase tracking-[0.12em] text-dtsc-muted">{stateLabel}</span></div><p className="mt-1 text-sm leading-5 text-dtsc-muted">{description}</p>{!diagnostic.ready && action ? <p className="mt-2 text-xs font-bold text-dtsc-ink">{action}</p> : null}</div>
    {diagnostic.actionKind !== "NONE" ? <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-dtsc-blue" /> : null}
  </div>;
  if (diagnostic.actionKind === "LINK" && diagnostic.actionHref) return <Link href={diagnostic.actionHref}>{content}</Link>;
  if (diagnostic.actionKind === "CONFIGURATION") return <button type="button" className="w-full text-left" disabled={!canManage} onClick={openConfiguration}>{content}</button>;
  return content;
}

export function EnterpriseFinanceOverviewWorkspace({ organizationId, organizationName, definition, locale: requestedLocale, canManage }: { organizationId: string; organizationName: string; definition: EnterpriseModuleDefinition; locale?: string | null; canManage: boolean }) {
  const locale: FinanceLocale = requestedLocale === "en" ? "en" : "fr";
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [summary, setSummary] = useState<Summary>(EMPTY_SUMMARY);
  const [projectionHealth, setProjectionHealth] = useState<ProjectionHealth>(EMPTY_PROJECTION_HEALTH);
  const [projectionError, setProjectionError] = useState("");
  const [retryingProjectionId, setRetryingProjectionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [configurationOpen, setConfigurationOpen] = useState(false);
  const [requestedConfiguration, setRequestedConfiguration] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError(""); setProjectionError("");
    try {
      const [readinessResponse, receivables, payables, payments, cash, reconciliations, approvedInvoices, pendingPayments, projectionsResponse] = await Promise.all([
        fetch(`/api/enterprise/${organizationId}/finance/configuration`, { cache: "no-store" }),
        totalFor(`/api/enterprise/${organizationId}/receivables?page=1&pageSize=1&status=OPEN`),
        totalFor(`/api/enterprise/${organizationId}/payables?page=1&pageSize=1&status=OPEN`),
        totalFor(`/api/enterprise/${organizationId}/payments?page=1&pageSize=100&status=CONFIRMED`),
        totalFor(`/api/enterprise/${organizationId}/cash-sessions?page=1&pageSize=1&status=OPEN`),
        totalFor(`/api/enterprise/${organizationId}/reconciliations?page=1&pageSize=1&status=SUBMITTED`),
        totalFor(`/api/enterprise/${organizationId}/sales-invoices?page=1&pageSize=1&status=APPROVED`),
        totalFor(`/api/enterprise/${organizationId}/payments?page=1&pageSize=1&status=PENDING_APPROVAL`),
        fetch(`/api/enterprise/${organizationId}/erp-projections?page=1&pageSize=20`, { cache: "no-store" }).catch(() => null),
      ]);
      const body = await readinessResponse.json().catch(() => null) as Readiness & { message?: string; error?: string } | null;
      if (!readinessResponse.ok || !body) throw new Error(body?.message || body?.error || financeT(locale, "financeReadinessLoadFailed"));
      setReadiness(body);
      setSummary({
        openReceivables: metricFrom(receivables), openPayables: metricFrom(payables),
        unallocatedPayments: metricFrom(payments, payments.state === "error" ? null : payments.items.filter((item) => Number(item.unallocatedAmount || 0) > 0).length),
        openCashSessions: metricFrom(cash), pendingReconciliations: metricFrom(reconciliations), invoicesToPost: metricFrom(approvedInvoices), pendingApprovals: metricFrom(pendingPayments),
      });
      if (!projectionsResponse) {
        setProjectionHealth(EMPTY_PROJECTION_HEALTH); setProjectionError(financeT(locale, "projectionHealthUnavailable"));
      } else {
        const projectionsBody = await projectionsResponse.json().catch(() => null) as (ProjectionHealth & { message?: string; error?: string }) | null;
        if (!projectionsResponse.ok || !projectionsBody) {
          setProjectionHealth(EMPTY_PROJECTION_HEALTH); setProjectionError(projectionsBody?.message || projectionsBody?.error || financeT(locale, "projectionHealthUnavailable"));
        } else setProjectionHealth(projectionsBody);
      }
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : financeT(locale, "financeReadinessLoadFailed")); }
    finally { setLoading(false); }
  }, [locale, organizationId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("configure");
    if (requested !== "finance" && requested !== "currency") return;
    setRequestedConfiguration(requested);
    setConfigurationOpen(true);
  }, []);
  const diagnostics = readiness?.diagnostics || [];
  const blockerDiagnostics = diagnostics.filter((diagnostic) => diagnostic.severity === "BLOCKER");
  const completedBlockers = blockerDiagnostics.filter((diagnostic) => diagnostic.ready).length;
  const percentage = blockerDiagnostics.length ? Math.round((completedBlockers / blockerDiagnostics.length) * 100) : 0;
  const degradedMetrics = Object.values(summary).filter((metric) => metric.state === "error").length;

  async function retryProjection(projectionId: string) {
    setRetryingProjectionId(projectionId); setMessage(""); setError("");
    try {
      const response = await fetch(`/api/enterprise/${organizationId}/erp-projections/${projectionId}/retry`, { method: "POST" });
      const body = await response.json().catch(() => null) as { message?: string } | null;
      if (!response.ok) throw new Error(body?.message || financeT(locale, "projectionRetryFailed"));
      setMessage(financeT(locale, "projectionRetried")); await load();
    } catch (retryError) { setError(retryError instanceof Error ? retryError.message : financeT(locale, "projectionRetryFailed")); }
    finally { setRetryingProjectionId(null); }
  }

  async function saveConfiguration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); setMessage(""); setError("");
    try {
      await financeMutation(`/api/enterprise/${organizationId}/finance/configuration`, { functionalCurrencyCode: String(form.get("functionalCurrencyCode") || "USD").toUpperCase(), presentationCurrencyCode: String(form.get("presentationCurrencyCode") || "").toUpperCase() || null, inventoryValuationMethod: String(form.get("inventoryValuationMethod") || "WEIGHTED_AVERAGE"), reconciliationTolerance: String(form.get("reconciliationTolerance") || "0.01"), automaticPostingEnabled: form.get("automaticPostingEnabled") === "on", revision: readiness?.configuration?.revision || undefined }, "PATCH");
      setConfigurationOpen(false); setMessage(financeT(locale, "financeConfigurationSaved")); await load();
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : financeT(locale, "saveFailed")); }
  }

  const remainingPrerequisites = blockerDiagnostics.length - completedBlockers;
  const readinessSummary: ReactNode = readiness?.ready ? <span className="font-black text-emerald-700 dark:text-emerald-300">{financeT(locale, "financeReadyForPosting")}</span> : <span className="font-black text-amber-700 dark:text-amber-300">{remainingPrerequisites} {financeT(locale, "prerequisitesRemaining")}</span>;
  const actions = [
    { href: "/enterprise-modules/FINANCE_RECEIVABLES?tab=overdue", label: financeT(locale, "handleOverdueReceivables"), metric: summary.openReceivables },
    { href: "/enterprise-modules/FINANCE_PAYABLES?tab=to-pay", label: financeT(locale, "prepareSupplierPayments"), metric: summary.openPayables },
    { href: "/enterprise-modules/FINANCE_PAYMENTS?tab=unallocated", label: financeT(locale, "allocatePayments"), metric: summary.unallocatedPayments },
    { href: "/enterprise-modules/FINANCE_RECONCILIATION?tab=pending", label: financeT(locale, "completeReconciliations"), metric: summary.pendingReconciliations },
  ];

  return <ModuleWorkspace>
    <ModuleHeader eyebrow={`${financeT(locale, "financeReadiness")} · ${organizationName}`} title={financeT(locale, "financeOverviewTitle")} description={locale === "en" ? definition.descriptionEn : definition.descriptionFr} count={`${percentage}%`} primaryAction={canManage ? <Button onClick={() => setConfigurationOpen(true)}><Settings2 className="h-4 w-4" />{financeT(locale, "configureFinance")}</Button> : undefined} secondaryActions={<ReloadButton onClick={() => void load()} locale={locale} loading={loading} />} />
    <ModuleMetrics label={financeT(locale, "financeMetrics")}>
      <ModuleMetric label={financeMetricLabel("openReceivables", locale)} value={metricDisplay(summary.openReceivables, locale)} /><ModuleMetric label={financeMetricLabel("openPayables", locale)} value={metricDisplay(summary.openPayables, locale)} /><ModuleMetric label={financeMetricLabel("unallocatedPayments", locale)} value={metricDisplay(summary.unallocatedPayments, locale)} /><ModuleMetric label={financeMetricLabel("openCashSessions", locale)} value={metricDisplay(summary.openCashSessions, locale)} /><ModuleMetric label={financeMetricLabel("pendingReconciliations", locale)} value={metricDisplay(summary.pendingReconciliations, locale)} /><ModuleMetric label={financeMetricLabel("pendingApprovals", locale)} value={metricDisplay(summary.pendingApprovals, locale)} />
    </ModuleMetrics>
    <ModuleContent>
      {message ? <div role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm font-bold text-emerald-800 dark:text-emerald-200">{message}</div> : null}
      {degradedMetrics > 0 ? <div role="status" className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm font-bold text-amber-800 dark:text-amber-200"><AlertTriangle className="h-5 w-5 shrink-0" />{degradedMetrics} {financeT(locale, "metricsUnavailable")}</div> : null}
      {error ? <ProfessionalError message={error} /> : null}
      {loading && !readiness ? <ProfessionalLoading /> : <>
        <ModuleSection title={financeT(locale, "setupAssistant")} description={financeT(locale, "setupAssistantDescription")}>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-y border-dtsc-border py-3"><div>{readinessSummary}</div><div className="text-sm font-bold text-dtsc-muted">{completedBlockers}/{blockerDiagnostics.length} {financeT(locale, "requiredPrerequisites")}</div></div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{diagnostics.map((diagnostic) => <DiagnosticCard key={diagnostic.code} diagnostic={diagnostic} locale={locale} canManage={canManage} openConfiguration={() => setConfigurationOpen(true)} />)}</div>
        </ModuleSection>
        <ModuleSection title={financeT(locale, "recommendedActions")}><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{actions.map((action) => <Link key={action.href} href={action.href} className="rounded-xl border border-dtsc-border p-4 hover:bg-dtsc-soft"><p className="text-2xl font-black text-dtsc-blue">{metricDisplay(action.metric, locale)}</p><p className="mt-1 font-black text-dtsc-ink">{action.label}</p></Link>)}</div></ModuleSection>
        <ModuleSection title={financeT(locale, "crossModuleContinuity")} description={financeT(locale, "crossModuleContinuityDescription")}>
          {projectionError ? <ProfessionalError message={projectionError} /> : <><div className="grid gap-3 sm:grid-cols-3"><article className="rounded-xl border border-dtsc-border p-4"><p className="text-xs font-black uppercase text-dtsc-muted">{financeT(locale, "completed")}</p><p className="mt-1 text-2xl font-black text-emerald-600">{projectionHealth.metrics.COMPLETED || 0}</p></article><article className="rounded-xl border border-dtsc-border p-4"><p className="text-xs font-black uppercase text-dtsc-muted">{financeT(locale, "retryNeeded")}</p><p className="mt-1 text-2xl font-black text-amber-600">{(projectionHealth.metrics.FAILED || 0) + (projectionHealth.metrics.DEAD || 0)}</p></article><article className="rounded-xl border border-dtsc-border p-4"><p className="text-xs font-black uppercase text-dtsc-muted">{financeT(locale, "observedTotal")}</p><p className="mt-1 text-2xl font-black text-dtsc-blue">{projectionHealth.pagination.total}</p></article></div><div className="mt-4 grid gap-3">{projectionHealth.items.filter((item) => ["FAILED", "DEAD"].includes(item.status)).length ? projectionHealth.items.filter((item) => ["FAILED", "DEAD"].includes(item.status)).map((item) => <article key={item.id} className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4"><div className="flex flex-wrap items-start gap-3"><Network className="mt-0.5 h-5 w-5 text-amber-700" /><div className="min-w-0 flex-1"><p className="font-black text-dtsc-ink">{item.eventType}</p><p className="mt-1 text-sm text-dtsc-muted">{item.lastErrorMessage || financeT(locale, "projectionAwaitingRetry")}</p><div className="mt-2 flex flex-wrap gap-3 text-xs font-bold">{item.sourceDeepLink ? <Link className="text-dtsc-blue underline" href={item.sourceDeepLink}>{financeT(locale, "openSource")}</Link> : null}{item.targetDeepLink ? <Link className="text-dtsc-blue underline" href={item.targetDeepLink}>{financeT(locale, "openTarget")}</Link> : null}<span className="text-dtsc-muted">{financeT(locale, "attempts")}: {item.attemptCount}</span></div></div>{canManage ? <Button type="button" variant="outline" disabled={retryingProjectionId === item.id} onClick={() => void retryProjection(item.id)}><RotateCcw className="h-4 w-4" />{financeT(locale, "retry")}</Button> : null}</div></article>) : <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm font-bold text-emerald-800 dark:text-emerald-200">{financeT(locale, "noFailedProjection")}</div>}</div></>}
        </ModuleSection>
        <ProfessionalHelp moduleCode="FINANCE_OVERVIEW" />
      </>}
    </ModuleContent>
    <Dialog open={configurationOpen} onClose={() => setConfigurationOpen(false)} title={financeT(locale, "financeConfiguration")} description={requestedConfiguration === "currency" ? financeT(locale, "functionalCurrencyShopDescription") : financeT(locale, "configurationRevisionDescription")} className="h-[94dvh] max-w-4xl">
      <form onSubmit={saveConfiguration} className="grid gap-6"><ProfessionalFormSection title={financeT(locale, "currenciesAndMethod")}><Field label={financeT(locale, "functionalCurrency")}><Input name="functionalCurrencyCode" defaultValue={readiness?.configuration?.functionalCurrencyCode || "USD"} maxLength={3} required /></Field><Field label={financeT(locale, "presentationCurrency")}><Input name="presentationCurrencyCode" defaultValue={readiness?.configuration?.presentationCurrencyCode || ""} maxLength={3} /></Field><Field label={financeT(locale, "inventoryValuation")}><NativeSelect name="inventoryValuationMethod" defaultValue={readiness?.configuration?.inventoryValuationMethod || "WEIGHTED_AVERAGE"} items={[{ id: "WEIGHTED_AVERAGE", label: financeEnumLabel("WEIGHTED_AVERAGE", locale) }, { id: "FIFO", label: financeEnumLabel("FIFO", locale) }]} required /></Field><Field label={financeT(locale, "reconciliationTolerance")}><Input name="reconciliationTolerance" inputMode="decimal" defaultValue={String(readiness?.configuration?.reconciliationTolerance || "0.01")} required /></Field></ProfessionalFormSection><ProfessionalFormSection title={financeT(locale, "posting")}><Field label={financeT(locale, "automation")}><label className="flex min-h-11 items-center gap-2 rounded-xl border border-dtsc-border px-3"><input name="automaticPostingEnabled" type="checkbox" defaultChecked={Boolean(readiness?.configuration?.automaticPostingEnabled)} />{financeT(locale, "automaticPostingAfterApprovals")}</label></Field></ProfessionalFormSection><div className="sticky bottom-0 flex justify-end gap-2 border-t border-dtsc-border bg-dtsc-surface py-3"><Button type="button" variant="outline" onClick={() => setConfigurationOpen(false)}>{financeT(locale, "cancel")}</Button><Button type="submit">{financeT(locale, "save")}</Button></div></form>
    </Dialog>
  </ModuleWorkspace>;
}
