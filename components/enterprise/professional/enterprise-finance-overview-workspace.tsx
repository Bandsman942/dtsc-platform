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
function metricDisplay(metric: MetricValue, locale: FinanceLocale): ReactNode { return metric.state === "error" ? <span className="text-sm font-black text-amber-700 dark:text-amber-300">{locale === "fr" ? "Indisponible" : "Unavailable"}</span> : metric.value; }

function DiagnosticCard({ diagnostic, locale, canManage, openConfiguration }: { diagnostic: ReadinessDiagnostic; locale: FinanceLocale; canManage: boolean; openConfiguration: () => void }) {
  const label = locale === "fr" ? diagnostic.labelFr : diagnostic.labelEn;
  const description = locale === "fr" ? diagnostic.messageFr : diagnostic.messageEn;
  const action = locale === "fr" ? diagnostic.actionFr : diagnostic.actionEn;
  const content = <div className={`flex min-h-32 items-start gap-3 rounded-xl border p-4 ${diagnostic.ready ? "border-emerald-500/30 bg-emerald-500/5" : diagnostic.severity === "BLOCKER" ? "border-red-500/30 bg-red-500/5" : "border-amber-500/30 bg-amber-500/5"}`}>
    {diagnostic.ready ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" /> : <ShieldAlert className={`mt-0.5 h-5 w-5 shrink-0 ${diagnostic.severity === "BLOCKER" ? "text-red-600" : "text-amber-600"}`} />}
    <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-black text-dtsc-ink">{label}</p><span className="text-[0.65rem] font-black uppercase tracking-[0.12em] text-dtsc-muted">{diagnostic.ready ? (locale === "fr" ? "Terminé" : "Done") : diagnostic.severity === "BLOCKER" ? (locale === "fr" ? "Requis" : "Required") : (locale === "fr" ? "Recommandé" : "Recommended")}</span></div><p className="mt-1 text-sm leading-5 text-dtsc-muted">{description}</p>{!diagnostic.ready && action ? <p className="mt-2 text-xs font-bold text-dtsc-ink">{action}</p> : null}</div>
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
      if (!readinessResponse.ok || !body) throw new Error(body?.message || body?.error || "La préparation Finance ne peut pas être chargée.");
      setReadiness(body);
      setSummary({
        openReceivables: metricFrom(receivables), openPayables: metricFrom(payables),
        unallocatedPayments: metricFrom(payments, payments.state === "error" ? null : payments.items.filter((item) => Number(item.unallocatedAmount || 0) > 0).length),
        openCashSessions: metricFrom(cash), pendingReconciliations: metricFrom(reconciliations), invoicesToPost: metricFrom(approvedInvoices), pendingApprovals: metricFrom(pendingPayments),
      });
      if (!projectionsResponse) {
        setProjectionHealth(EMPTY_PROJECTION_HEALTH); setProjectionError(locale === "fr" ? "La santé des projections inter-modules est indisponible." : "Cross-module projection health is unavailable.");
      } else {
        const projectionsBody = await projectionsResponse.json().catch(() => null) as (ProjectionHealth & { message?: string; error?: string }) | null;
        if (!projectionsResponse.ok || !projectionsBody) {
          setProjectionHealth(EMPTY_PROJECTION_HEALTH); setProjectionError(projectionsBody?.message || projectionsBody?.error || (locale === "fr" ? "La santé des projections inter-modules est indisponible." : "Cross-module projection health is unavailable."));
        } else setProjectionHealth(projectionsBody);
      }
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : "La préparation Finance ne peut pas être chargée."); }
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
      if (!response.ok) throw new Error(body?.message || "La projection ne peut pas être relancée.");
      setMessage(locale === "fr" ? "Projection inter-module relancée." : "Cross-module projection retried."); await load();
    } catch (retryError) { setError(retryError instanceof Error ? retryError.message : "La projection ne peut pas être relancée."); }
    finally { setRetryingProjectionId(null); }
  }

  async function saveConfiguration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); setMessage(""); setError("");
    try {
      await financeMutation(`/api/enterprise/${organizationId}/finance/configuration`, { functionalCurrencyCode: String(form.get("functionalCurrencyCode") || "USD").toUpperCase(), presentationCurrencyCode: String(form.get("presentationCurrencyCode") || "").toUpperCase() || null, inventoryValuationMethod: String(form.get("inventoryValuationMethod") || "WEIGHTED_AVERAGE"), reconciliationTolerance: String(form.get("reconciliationTolerance") || "0.01"), automaticPostingEnabled: form.get("automaticPostingEnabled") === "on", revision: readiness?.configuration?.revision || undefined }, "PATCH");
      setConfigurationOpen(false); setMessage(locale === "fr" ? "Configuration financière enregistrée." : "Finance configuration saved."); await load();
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : "Enregistrement impossible."); }
  }

  const readinessSummary: ReactNode = readiness?.ready ? <span className="font-black text-emerald-700 dark:text-emerald-300">{locale === "fr" ? "Finance prête pour la comptabilisation" : "Finance ready for posting"}</span> : <span className="font-black text-amber-700 dark:text-amber-300">{locale === "fr" ? `${blockerDiagnostics.length - completedBlockers} prérequis restant(s)` : `${blockerDiagnostics.length - completedBlockers} prerequisite(s) remaining`}</span>;
  const actions = [
    { href: "/enterprise-modules/FINANCE_RECEIVABLES?tab=overdue", label: locale === "fr" ? "Traiter les créances en retard" : "Handle overdue receivables", metric: summary.openReceivables },
    { href: "/enterprise-modules/FINANCE_PAYABLES?tab=to-pay", label: locale === "fr" ? "Préparer les paiements fournisseurs" : "Prepare supplier payments", metric: summary.openPayables },
    { href: "/enterprise-modules/FINANCE_PAYMENTS?tab=unallocated", label: locale === "fr" ? "Affecter les paiements" : "Allocate payments", metric: summary.unallocatedPayments },
    { href: "/enterprise-modules/FINANCE_RECONCILIATION?tab=pending", label: locale === "fr" ? "Finaliser les rapprochements" : "Complete reconciliations", metric: summary.pendingReconciliations },
  ];

  return <ModuleWorkspace>
    <ModuleHeader eyebrow={`${locale === "fr" ? "Préparation financière" : "Finance readiness"} · ${organizationName}`} title={locale === "fr" ? "Vue d’ensemble financière" : "Finance overview"} description={definition.descriptionFr} count={`${percentage}%`} primaryAction={canManage ? <Button onClick={() => setConfigurationOpen(true)}><Settings2 className="h-4 w-4" />{locale === "fr" ? "Configurer Finance" : "Configure Finance"}</Button> : undefined} secondaryActions={<ReloadButton onClick={() => void load()} locale={locale} loading={loading} />} />
    <ModuleMetrics label={locale === "fr" ? "Indicateurs financiers" : "Finance metrics"}>
      <ModuleMetric label={financeMetricLabel("openReceivables", locale)} value={metricDisplay(summary.openReceivables, locale)} /><ModuleMetric label={financeMetricLabel("openPayables", locale)} value={metricDisplay(summary.openPayables, locale)} /><ModuleMetric label={financeMetricLabel("unallocatedPayments", locale)} value={metricDisplay(summary.unallocatedPayments, locale)} /><ModuleMetric label={financeMetricLabel("openCashSessions", locale)} value={metricDisplay(summary.openCashSessions, locale)} /><ModuleMetric label={financeMetricLabel("pendingReconciliations", locale)} value={metricDisplay(summary.pendingReconciliations, locale)} /><ModuleMetric label={financeMetricLabel("pendingApprovals", locale)} value={metricDisplay(summary.pendingApprovals, locale)} />
    </ModuleMetrics>
    <ModuleContent>
      {message ? <div role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm font-bold text-emerald-800 dark:text-emerald-200">{message}</div> : null}
      {degradedMetrics > 0 ? <div role="status" className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm font-bold text-amber-800 dark:text-amber-200"><AlertTriangle className="h-5 w-5 shrink-0" />{locale === "fr" ? `${degradedMetrics} indicateur(s) sont indisponibles. Les valeurs ne sont pas remplacées par zéro.` : `${degradedMetrics} metric(s) are unavailable. Values are not replaced with zero.`}</div> : null}
      {error ? <ProfessionalError message={error} /> : null}
      {loading && !readiness ? <ProfessionalLoading /> : <>
        <ModuleSection title={locale === "fr" ? "Assistant de mise en service" : "Setup assistant"} description={locale === "fr" ? "Les étapes sont calculées par le serveur. Une case se coche automatiquement dès que la configuration correspondante est réellement valide." : "Steps are calculated by the server. A checkmark appears automatically as soon as the corresponding configuration is truly valid."}>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-y border-dtsc-border py-3"><div>{readinessSummary}</div><div className="text-sm font-bold text-dtsc-muted">{completedBlockers}/{blockerDiagnostics.length} {locale === "fr" ? "prérequis obligatoires" : "required prerequisites"}</div></div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{diagnostics.map((diagnostic) => <DiagnosticCard key={diagnostic.code} diagnostic={diagnostic} locale={locale} canManage={canManage} openConfiguration={() => setConfigurationOpen(true)} />)}</div>
        </ModuleSection>
        <ModuleSection title={locale === "fr" ? "Actions recommandées" : "Recommended actions"}><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{actions.map((action) => <Link key={action.href} href={action.href} className="rounded-xl border border-dtsc-border p-4 hover:bg-dtsc-soft"><p className="text-2xl font-black text-dtsc-blue">{metricDisplay(action.metric, locale)}</p><p className="mt-1 font-black text-dtsc-ink">{action.label}</p></Link>)}</div></ModuleSection>
        <ModuleSection title={locale === "fr" ? "Continuité inter-module" : "Cross-module continuity"} description={locale === "fr" ? "Les projections relient les objets ERP sans créer de facture, paiement, mouvement de stock ou écriture en double." : "Projections connect ERP objects without creating duplicate invoices, payments, stock movements or journal entries."}>
          {projectionError ? <ProfessionalError message={projectionError} /> : <><div className="grid gap-3 sm:grid-cols-3"><article className="rounded-xl border border-dtsc-border p-4"><p className="text-xs font-black uppercase text-dtsc-muted">{locale === "fr" ? "Terminées" : "Completed"}</p><p className="mt-1 text-2xl font-black text-emerald-600">{projectionHealth.metrics.COMPLETED || 0}</p></article><article className="rounded-xl border border-dtsc-border p-4"><p className="text-xs font-black uppercase text-dtsc-muted">{locale === "fr" ? "À reprendre" : "Retry needed"}</p><p className="mt-1 text-2xl font-black text-amber-600">{(projectionHealth.metrics.FAILED || 0) + (projectionHealth.metrics.DEAD || 0)}</p></article><article className="rounded-xl border border-dtsc-border p-4"><p className="text-xs font-black uppercase text-dtsc-muted">{locale === "fr" ? "Total observé" : "Observed total"}</p><p className="mt-1 text-2xl font-black text-dtsc-blue">{projectionHealth.pagination.total}</p></article></div><div className="mt-4 grid gap-3">{projectionHealth.items.filter((item) => ["FAILED", "DEAD"].includes(item.status)).length ? projectionHealth.items.filter((item) => ["FAILED", "DEAD"].includes(item.status)).map((item) => <article key={item.id} className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4"><div className="flex flex-wrap items-start gap-3"><Network className="mt-0.5 h-5 w-5 text-amber-700" /><div className="min-w-0 flex-1"><p className="font-black text-dtsc-ink">{item.eventType}</p><p className="mt-1 text-sm text-dtsc-muted">{item.lastErrorMessage || (locale === "fr" ? "Projection en attente de reprise contrôlée." : "Projection awaiting controlled retry.")}</p><div className="mt-2 flex flex-wrap gap-3 text-xs font-bold">{item.sourceDeepLink ? <Link className="text-dtsc-blue underline" href={item.sourceDeepLink}>{locale === "fr" ? "Ouvrir la source" : "Open source"}</Link> : null}{item.targetDeepLink ? <Link className="text-dtsc-blue underline" href={item.targetDeepLink}>{locale === "fr" ? "Ouvrir la cible" : "Open target"}</Link> : null}<span className="text-dtsc-muted">{locale === "fr" ? "Tentatives" : "Attempts"}: {item.attemptCount}</span></div></div>{canManage ? <Button type="button" variant="outline" disabled={retryingProjectionId === item.id} onClick={() => void retryProjection(item.id)}><RotateCcw className="h-4 w-4" />{locale === "fr" ? "Relancer" : "Retry"}</Button> : null}</div></article>) : <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm font-bold text-emerald-800 dark:text-emerald-200">{locale === "fr" ? "Aucune projection inter-module en échec dans les éléments récents." : "No failed cross-module projection in recent items."}</div>}</div></>}
        </ModuleSection>
        <ProfessionalHelp moduleCode="FINANCE_OVERVIEW" />
      </>}
    </ModuleContent>
    <Dialog open={configurationOpen} onClose={() => setConfigurationOpen(false)} title={locale === "fr" ? "Configuration financière" : "Finance configuration"} description={requestedConfiguration === "currency" ? (locale === "fr" ? "Définissez ici la devise fonctionnelle utilisée par Finance et par la mise en service du Shop." : "Set the functional currency used by Finance and Shop setup here.") : (locale === "fr" ? "Les mutations sont contrôlées par révision et les périodes financières." : "Changes are controlled by revision and finance periods.")} className="h-[94dvh] max-w-4xl">
      <form onSubmit={saveConfiguration} className="grid gap-6"><ProfessionalFormSection title={locale === "fr" ? "Devises et méthode" : "Currencies and method"}><Field label={locale === "fr" ? "Devise fonctionnelle" : "Functional currency"}><Input name="functionalCurrencyCode" defaultValue={readiness?.configuration?.functionalCurrencyCode || "USD"} maxLength={3} required /></Field><Field label={locale === "fr" ? "Devise de présentation" : "Presentation currency"}><Input name="presentationCurrencyCode" defaultValue={readiness?.configuration?.presentationCurrencyCode || ""} maxLength={3} /></Field><Field label={locale === "fr" ? "Valorisation du stock" : "Inventory valuation"}><NativeSelect name="inventoryValuationMethod" defaultValue={readiness?.configuration?.inventoryValuationMethod || "WEIGHTED_AVERAGE"} items={[{ id: "WEIGHTED_AVERAGE", label: financeEnumLabel("WEIGHTED_AVERAGE", locale) }, { id: "FIFO", label: financeEnumLabel("FIFO", locale) }]} required /></Field><Field label={locale === "fr" ? "Tolérance de rapprochement" : "Reconciliation tolerance"}><Input name="reconciliationTolerance" inputMode="decimal" defaultValue={String(readiness?.configuration?.reconciliationTolerance || "0.01")} required /></Field></ProfessionalFormSection><ProfessionalFormSection title={locale === "fr" ? "Comptabilisation" : "Posting"}><Field label={locale === "fr" ? "Automatisation" : "Automation"}><label className="flex min-h-11 items-center gap-2 rounded-xl border border-dtsc-border px-3"><input name="automaticPostingEnabled" type="checkbox" defaultChecked={Boolean(readiness?.configuration?.automaticPostingEnabled)} />{locale === "fr" ? "Comptabiliser automatiquement après les validations requises" : "Post automatically after required approvals"}</label></Field></ProfessionalFormSection><div className="sticky bottom-0 flex justify-end gap-2 border-t border-dtsc-border bg-dtsc-surface py-3"><Button type="button" variant="outline" onClick={() => setConfigurationOpen(false)}>{locale === "fr" ? "Annuler" : "Cancel"}</Button><Button type="submit">{locale === "fr" ? "Enregistrer" : "Save"}</Button></div></form>
    </Dialog>
  </ModuleWorkspace>;
}
