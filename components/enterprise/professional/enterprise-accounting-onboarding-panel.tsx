"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, CircleDashed, Loader2, RefreshCw, ShieldAlert } from "lucide-react";
import { ProfessionalFormSection } from "@/components/enterprise/professional/professional-erp-ui";
import { financeStatusLabel, safeFinanceError, type FinanceLocale } from "@/components/enterprise/professional/finance-professional-ui";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { ForegroundToast } from "@/components/ui/foreground-toast";
import { Input } from "@/components/ui/input";
import { ModuleSection } from "@/components/workspace/module-workspace";
import { getAccountingWorkspaceCopy } from "@/lib/enterprise/accounting/accounting-workspace-copy";
import { translateEnterpriseFinance, type EnterpriseFinanceKey } from "@/lib/i18n";

type Template = {
  reference: string;
  frameworkCode: string;
  nameFr: string;
  nameEn: string;
  effectiveFrom: string;
  countryScope: string[];
  sourceKind: string;
  sourceAuthority: string;
  accountCount: number;
  semanticMappingCount: number;
  journalCount: number;
  statementMappingCount: number;
  isDefault: boolean;
  productionReadiness: { ready: boolean; status: string; blockers: readonly string[] };
};
type Chart = { id: string; code: string; nameFr: string; nameEn: string; status: string; templateCode: string | null; revision: number; _count?: { accounts?: number } };
type Diagnostic = {
  code: string;
  severity: "BLOCKER" | "WARNING";
  ready: boolean;
  labelFr: string;
  labelEn: string;
  messageFr: string;
  messageEn: string;
  actionFr?: string;
  actionEn?: string;
  actionKind: "CONFIGURATION" | "LINK" | "NONE";
  actionHref?: string;
};
type SetupPayload = {
  templates: Template[];
  defaultTemplateReference: string;
  charts: Chart[];
  selectedChartId: string | null;
  readiness: { ready: boolean; diagnostics: Diagnostic[]; blockers: Diagnostic[]; warnings: Diagnostic[] } | null;
  regulatorySupport: { supported: boolean; reasonCode: string | null; messageFr: string; messageEn: string; templateReference: string | null; statementTypes: string[] };
  countryOverlays: unknown[];
  governance: { bootstrapWarning: boolean; officialDefaultReference: string; futureVersionsRequireControlledMigration: boolean; messageFr: string; messageEn: string };
};
type Props = { organizationId: string; locale?: string | null; canManage: boolean };
type ToastState = { tone: "error" | "success"; title: string; message: string } | null;

async function jsonRequest(url: string, options?: RequestInit) {
  const response = await fetch(url, { cache: "no-store", ...options });
  const body = await response.json().catch(() => ({})) as { error?: string; message?: string; [key: string]: unknown };
  if (!response.ok) throw new Error(String(body.message || body.error || "FINANCE_OPERATION_FAILED"));
  return body as Record<string, unknown>;
}

function diagnosticHref(diagnostic: Diagnostic) {
  if (diagnostic.actionKind === "CONFIGURATION") return "/enterprise-modules/FINANCE_OVERVIEW?configure=finance";
  if (!diagnostic.actionHref) return null;
  if (diagnostic.actionHref.includes("FINANCE_ACCOUNTING?tab=overview")) return "/enterprise-modules/FINANCE_ACCOUNTING?tab=setup";
  return diagnostic.actionHref;
}

export function EnterpriseAccountingOnboardingPanel({ organizationId, locale, canManage }: Props) {
  const financeLocale: FinanceLocale = locale === "en" ? "en" : "fr";
  const en = financeLocale === "en";
  const copy = getAccountingWorkspaceCopy(financeLocale);
  const t = useCallback((key: EnterpriseFinanceKey) => translateEnterpriseFinance(financeLocale, key), [financeLocale]);
  const [payload, setPayload] = useState<SetupPayload | null>(null);
  const [selectedChartId, setSelectedChartId] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState("OHADA_SYSCOHADA@0.1.0");
  const [chartCode, setChartCode] = useState("MAIN");
  const [chartNameFr, setChartNameFr] = useState("Plan comptable principal");
  const [chartNameEn, setChartNameEn] = useState("Main chart of accounts");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [chartDialogOpen, setChartDialogOpen] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);

  const load = useCallback(async (chartId?: string, templateRef?: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (chartId) params.set("chartId", chartId);
      if (templateRef) params.set("previewTemplate", templateRef);
      const body = await jsonRequest(`/api/enterprise/${organizationId}/accounting-setup${params.size ? `?${params}` : ""}`) as unknown as SetupPayload;
      setPayload(body);
      setSelectedChartId(chartId || body.selectedChartId || body.charts[0]?.id || "");
      const requested = templateRef || selectedTemplate;
      if (!body.templates.some((template) => template.reference === requested)) setSelectedTemplate(body.defaultTemplateReference || body.templates[0]?.reference || "");
    } catch (loadError) {
      setToast({ tone: "error", title: copy.errorTitle, message: safeFinanceError(loadError, copy.loadFailed, financeLocale) });
    } finally {
      setLoading(false);
    }
  }, [copy.errorTitle, copy.loadFailed, financeLocale, organizationId, selectedTemplate]);

  useEffect(() => { void load(); }, [load]);

  const selectedChart = useMemo(() => payload?.charts.find((chart) => chart.id === selectedChartId) || null, [payload, selectedChartId]);
  const selectedTemplateItem = useMemo(() => payload?.templates.find((template) => template.reference === selectedTemplate) || null, [payload, selectedTemplate]);
  const diagnostics = payload?.readiness?.diagnostics || [];
  const blocked = Boolean(payload?.readiness && !payload.readiness.ready);

  async function createChart() {
    setSaving(true);
    try {
      const body = await jsonRequest(`/api/enterprise/${organizationId}/charts-of-accounts`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: chartCode, nameFr: chartNameFr, nameEn: chartNameEn }),
      });
      const chart = body.chart as Chart;
      setChartDialogOpen(false);
      setToast({ tone: "success", title: copy.successTitle, message: t("chartCreatedApplyDefault") });
      await load(chart.id, selectedTemplate);
    } catch (saveError) {
      setToast({ tone: "error", title: copy.errorTitle, message: safeFinanceError(saveError, t("chartCouldNotCreate"), financeLocale) });
    } finally { setSaving(false); }
  }

  async function mutate(body: Record<string, unknown>, successKey: EnterpriseFinanceKey) {
    setSaving(true);
    try {
      await jsonRequest(`/api/enterprise/${organizationId}/accounting-setup`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      setToast({ tone: "success", title: copy.successTitle, message: t(successKey) });
      await load(selectedChartId, selectedTemplate);
    } catch (saveError) {
      setToast({ tone: "error", title: copy.errorTitle, message: safeFinanceError(saveError, copy.saveFailed, financeLocale) });
    } finally { setSaving(false); }
  }

  return (
    <div className="min-w-0 space-y-5">
      <ForegroundToast open={Boolean(toast)} tone={toast?.tone || "success"} title={toast?.title || ""} message={toast?.message || ""} closeLabel={copy.closeToast} onClose={() => setToast(null)} />

      <ModuleSection title={copy.setup} description={copy.setupDescription}>
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.8fr)]">
          <div className="min-w-0 space-y-4">
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2">
              <label className="min-w-0 text-sm font-semibold text-dtsc-ink">{t("companyChart")}
                <select className="mt-2 min-h-11 w-full min-w-0 rounded-xl border border-dtsc-border bg-dtsc-page px-3 text-base text-dtsc-ink" value={selectedChartId} onChange={(event) => { setSelectedChartId(event.target.value); void load(event.target.value, selectedTemplate); }}>
                  <option value="">{copy.noChart}</option>
                  {payload?.charts.map((chart) => <option key={chart.id} value={chart.id}>{chart.code} · {en ? chart.nameEn : chart.nameFr} · {financeStatusLabel(chart.status, financeLocale)}</option>)}
                </select>
                <span className="mt-1.5 block text-xs leading-5 text-dtsc-muted">{copy.chartsDescription}</span>
              </label>
              <label className="min-w-0 text-sm font-semibold text-dtsc-ink">{copy.template}
                <select className="mt-2 min-h-11 w-full min-w-0 rounded-xl border border-dtsc-border bg-dtsc-page px-3 text-base text-dtsc-ink" value={selectedTemplate} onChange={(event) => { setSelectedTemplate(event.target.value); void load(selectedChartId, event.target.value); }}>
                  {payload?.templates.map((template) => <option key={template.reference} value={template.reference}>{template.isDefault ? `${t("defaultLabel")} · ` : ""}{en ? template.nameEn : template.nameFr} · {template.reference}</option>)}
                </select>
                <span className="mt-1.5 block text-xs leading-5 text-dtsc-muted">{t("chartVersion")}</span>
              </label>
            </div>

            {!selectedChart ? (
              <div className="rounded-2xl border border-dashed border-dtsc-border bg-dtsc-page p-4 sm:p-5">
                <p className="font-black text-dtsc-ink">{copy.noChart}</p>
                <p className="mt-1 text-sm leading-6 text-dtsc-muted">{t("createCompanyChartStep")}</p>
                {canManage ? <Button className="mt-4" onClick={() => setChartDialogOpen(true)}>{copy.createChart}</Button> : null}
              </div>
            ) : (
              <div className="rounded-2xl border border-dtsc-border bg-dtsc-page p-4 sm:p-5">
                <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-black uppercase tracking-[0.12em] text-dtsc-muted">{copy.currentChart}</p>
                    <h3 className="mt-1 break-words text-lg font-black text-dtsc-ink">{selectedChart.code} · {en ? selectedChart.nameEn : selectedChart.nameFr}</h3>
                    <p className="mt-1 break-words text-sm text-dtsc-muted">{selectedChart.templateCode || t("noChartVersionApplied")} · {financeStatusLabel(selectedChart.status, financeLocale)}</p>
                  </div>
                  <span className="rounded-full border border-dtsc-border bg-dtsc-surface px-3 py-1 text-xs font-black">{selectedChart._count?.accounts || 0} {copy.accounts.toLowerCase()}</span>
                </div>
                <div data-responsive-actions className="mt-4 flex min-w-0 flex-wrap gap-2">
                  {canManage && !selectedChart.templateCode ? <Button disabled={saving || !selectedTemplate} onClick={() => void mutate({ action: "ADOPT_TEMPLATE", chartId: selectedChart.id, templateReference: selectedTemplate }, "officialChartApplied")}>{copy.applyTemplate}</Button> : null}
                  {canManage ? <Button variant="outline" disabled={saving} onClick={() => void mutate({ action: "APPLY_RECOMMENDED_JOURNALS" }, "recommendedJournalsConfigured")}>{copy.installJournals}</Button> : null}
                  {canManage && selectedChart.templateCode && selectedChart.status !== "ACTIVE" ? <Button disabled={saving || blocked} onClick={() => void mutate({ action: "ACTIVATE_CHART", chartId: selectedChart.id, revision: selectedChart.revision }, "chartActivated")}>{copy.activateChart}</Button> : null}
                  <Button asChild variant="outline"><Link href="/enterprise-modules/FINANCE_ACCOUNTING?tab=charts">{copy.openDetails}</Link></Button>
                </div>
              </div>
            )}

            {selectedTemplateItem ? (
              <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Metric label={t("jurisdiction")} value={selectedTemplateItem.countryScope.join(", ") || "—"} />
                <Metric label={t("effectiveFrom")} value={selectedTemplateItem.effectiveFrom} />
                <Metric label={copy.accounts} value={String(selectedTemplateItem.accountCount)} />
                <Metric label={t("businessMappings")} value={String(selectedTemplateItem.semanticMappingCount)} />
              </div>
            ) : null}
          </div>

          <aside className="min-w-0 space-y-3">
            <div className={`rounded-2xl border p-4 ${payload?.readiness?.ready ? "border-emerald-500/30 bg-emerald-500/5" : "border-amber-500/30 bg-amber-500/5"}`}>
              <div className="flex min-w-0 items-start gap-3">
                {payload?.readiness?.ready ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" /> : <CircleDashed className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />}
                <div className="min-w-0"><h3 className="font-black text-dtsc-ink">{payload?.readiness?.ready ? copy.configurationReady : copy.configurationRequired}</h3><p className="mt-1 text-xs leading-5 text-dtsc-muted">{t("everyBlockingRuleChecked")}</p></div>
              </div>
            </div>
            <div className="space-y-2">
              {diagnostics.map((diagnostic) => <DiagnosticRow key={diagnostic.code} diagnostic={diagnostic} locale={financeLocale} copy={copy} />)}
              {!diagnostics.length && !loading ? <p className="rounded-xl border border-dashed border-dtsc-border p-4 text-sm text-dtsc-muted">{t("createOrSelectChartChecks")}</p> : null}
              {loading ? <div className="grid place-items-center rounded-xl border border-dtsc-border p-6"><Loader2 className="h-5 w-5 animate-spin text-dtsc-blue" /></div> : null}
            </div>
            <Button type="button" variant="outline" className="w-full" onClick={() => void load(selectedChartId, selectedTemplate)} disabled={loading || saving}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}{copy.refresh}
            </Button>
          </aside>
        </div>
      </ModuleSection>

      <Dialog
        open={chartDialogOpen}
        title={copy.createChart}
        description={copy.setupDescription}
        onClose={() => setChartDialogOpen(false)}
        className="h-[92dvh] sm:max-w-4xl"
        footer={<><Button variant="outline" onClick={() => setChartDialogOpen(false)}>{copy.cancel}</Button><Button onClick={() => void createChart()} disabled={saving || !chartCode.trim() || !chartNameFr.trim() || !chartNameEn.trim()}>{saving ? copy.processing : copy.create}</Button></>}
      >
        <ProfessionalFormSection title={copy.createChart} description={copy.formHelp}>
          <FieldWithHelp label={copy.chartCode} help={copy.chartCodeHelp}><Input value={chartCode} onChange={(event) => setChartCode(event.target.value.toUpperCase())} required /></FieldWithHelp>
          <FieldWithHelp label={copy.chartNameFr} help={copy.chartNameHelp}><Input value={chartNameFr} onChange={(event) => setChartNameFr(event.target.value)} required /></FieldWithHelp>
          <FieldWithHelp label={copy.chartNameEn} help={copy.chartNameHelp}><Input value={chartNameEn} onChange={(event) => setChartNameEn(event.target.value)} required /></FieldWithHelp>
        </ProfessionalFormSection>
      </Dialog>
    </div>
  );
}

function DiagnosticRow({ diagnostic, locale, copy }: { diagnostic: Diagnostic; locale: FinanceLocale; copy: ReturnType<typeof getAccountingWorkspaceCopy> }) {
  const label = locale === "fr" ? diagnostic.labelFr : diagnostic.labelEn;
  const message = locale === "fr" ? diagnostic.messageFr : diagnostic.messageEn;
  const action = locale === "fr" ? diagnostic.actionFr : diagnostic.actionEn;
  const href = diagnosticHref(diagnostic);
  const content = (
    <div className={`flex min-w-0 items-start gap-3 rounded-xl border p-3 transition ${diagnostic.ready ? "border-emerald-500/30 bg-emerald-500/5" : diagnostic.severity === "BLOCKER" ? "border-red-500/30 bg-red-500/5 hover:border-red-500/60" : "border-amber-500/30 bg-amber-500/5 hover:border-amber-500/60"}`}>
      {diagnostic.ready ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <ShieldAlert className={`mt-0.5 h-4 w-4 shrink-0 ${diagnostic.severity === "BLOCKER" ? "text-red-600" : "text-amber-600"}`} />}
      <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-black text-dtsc-ink">{label}</p><span className="text-[0.65rem] font-black uppercase tracking-[0.1em] text-dtsc-muted">{diagnostic.ready ? copy.done : diagnostic.severity === "BLOCKER" ? copy.required : copy.recommended}</span></div><p className="mt-1 text-xs leading-5 text-dtsc-muted">{message}</p>{!diagnostic.ready ? <p className="mt-2 text-xs font-bold text-dtsc-ink">{action || copy.configurationUnavailable}</p> : null}</div>
      {!diagnostic.ready && href ? <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-dtsc-blue" /> : null}
    </div>
  );
  if (!diagnostic.ready && href) return <Link href={href} className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60">{content}</Link>;
  return content;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0 border-l-2 border-dtsc-blue pl-3"><p className="text-[0.68rem] font-black uppercase tracking-[0.12em] text-dtsc-muted">{label}</p><p className="mt-1 break-words text-sm font-black text-dtsc-ink">{value}</p></div>;
}

function FieldWithHelp({ label, help, children }: { label: string; help: string; children: React.ReactNode }) {
  return <label className="min-w-0 text-sm font-bold text-dtsc-ink">{label}<div className="mt-2">{children}</div><span className="mt-1.5 block text-xs leading-5 text-dtsc-muted">{help}</span></label>;
}
