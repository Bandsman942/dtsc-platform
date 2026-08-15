"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, CircleDashed, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { financeStatusLabel, safeFinanceError, type FinanceLocale } from "@/components/enterprise/professional/finance-professional-ui";
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
type Diagnostic = { code: string; severity: "BLOCKER" | "WARNING"; ready: boolean; messageFr: string; messageEn: string; actionFr?: string; actionEn?: string };
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

async function jsonRequest(url: string, options?: RequestInit) {
  const response = await fetch(url, { cache: "no-store", ...options });
  const body = await response.json().catch(() => ({})) as { error?: string; [key: string]: unknown };
  if (!response.ok) throw new Error(String(body.error || "FINANCE_OPERATION_FAILED"));
  return body as Record<string, unknown>;
}

export function EnterpriseAccountingOnboardingPanel({ organizationId, locale, canManage }: Props) {
  const financeLocale: FinanceLocale = locale === "en" ? "en" : "fr";
  const en = financeLocale === "en";
  const t = (key: EnterpriseFinanceKey) => translateEnterpriseFinance(financeLocale, key);
  const [payload, setPayload] = useState<SetupPayload | null>(null);
  const [selectedChartId, setSelectedChartId] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState("OHADA_SYSCOHADA@0.1.0");
  const [chartCode, setChartCode] = useState("MAIN");
  const [chartNameFr, setChartNameFr] = useState("Plan comptable principal");
  const [chartNameEn, setChartNameEn] = useState("Main chart of accounts");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async (chartId?: string, templateRef?: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (chartId) params.set("chartId", chartId);
      if (templateRef) params.set("previewTemplate", templateRef);
      const body = await jsonRequest(`/api/enterprise/${organizationId}/accounting-setup${params.size ? `?${params}` : ""}`) as unknown as SetupPayload;
      setPayload(body);
      const nextChartId = chartId || body.selectedChartId || body.charts[0]?.id || "";
      setSelectedChartId(nextChartId);
      const requested = templateRef || selectedTemplate;
      if (!body.templates.some((template) => template.reference === requested)) setSelectedTemplate(body.defaultTemplateReference || body.templates[0]?.reference || "");
      else if (!templateRef && !selectedTemplate) setSelectedTemplate(body.defaultTemplateReference);
    } catch (loadError) {
      setError(safeFinanceError(loadError, t("accountingSetupLoadFailed"), financeLocale));
    } finally {
      setLoading(false);
    }
  }, [financeLocale, organizationId, selectedTemplate]);

  useEffect(() => { void load(); }, [load]);

  const selectedChart = useMemo(() => payload?.charts.find((chart) => chart.id === selectedChartId) || null, [payload, selectedChartId]);
  const selectedTemplateItem = useMemo(() => payload?.templates.find((template) => template.reference === selectedTemplate) || null, [payload, selectedTemplate]);

  async function createChart() {
    setSaving(true); setError(null); setNotice(null);
    try {
      const body = await jsonRequest(`/api/enterprise/${organizationId}/charts-of-accounts`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: chartCode, nameFr: chartNameFr, nameEn: chartNameEn }) });
      const chart = body.chart as Chart;
      setNotice(t("chartCreatedApplyDefault"));
      await load(chart.id, selectedTemplate);
    } catch (saveError) {
      setError(safeFinanceError(saveError, t("chartCouldNotCreate"), financeLocale));
    } finally { setSaving(false); }
  }

  async function mutate(body: Record<string, unknown>, successKey: EnterpriseFinanceKey) {
    setSaving(true); setError(null); setNotice(null);
    try {
      await jsonRequest(`/api/enterprise/${organizationId}/accounting-setup`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      setNotice(t(successKey));
      await load(selectedChartId, selectedTemplate);
    } catch (saveError) {
      setError(safeFinanceError(saveError, t("requestedActionCouldNotComplete"), financeLocale));
    } finally { setSaving(false); }
  }

  const diagnostics = payload?.readiness?.diagnostics || [];
  const blocked = Boolean(payload?.readiness && !payload.readiness.ready);

  return (
    <section className="mx-auto mb-6 w-full min-w-0 max-w-[1600px] px-4 sm:px-6 lg:px-8" aria-labelledby="accounting-onboarding-title">
      <div className="min-w-0 overflow-hidden rounded-3xl border border-dtsc-border bg-dtsc-surface text-dtsc-ink shadow-sm">
        <div className="border-b border-dtsc-border bg-gradient-to-r from-cyan-500/10 via-dtsc-surface to-violet-500/10 p-5 sm:p-7">
          <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-700 dark:text-cyan-300">{t("accountingOnboarding")}</p>
              <h2 id="accounting-onboarding-title" className="mt-2 break-words text-xl font-black text-dtsc-ink sm:text-2xl">{t("configureValidateActivate")}</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-dtsc-muted">{t("accountingOnboardingDescription")}</p>
            </div>
            <Button type="button" variant="outline" className="rounded-full border-dtsc-border bg-dtsc-surface text-dtsc-blue" onClick={() => void load(selectedChartId, selectedTemplate)} disabled={loading || saving}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}{t("refresh")}
            </Button>
          </div>
        </div>

        <div className="grid min-w-0 gap-5 p-5 sm:p-7 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.8fr)]">
          <div className="min-w-0 space-y-5">
            <div className="grid min-w-0 gap-4 md:grid-cols-2">
              <label className="min-w-0 text-sm font-semibold text-dtsc-ink">{t("companyChart")}
                <select className="mt-2 h-11 w-full min-w-0 rounded-xl border border-dtsc-border bg-dtsc-page px-3 text-sm text-dtsc-ink" value={selectedChartId} onChange={(event) => { setSelectedChartId(event.target.value); void load(event.target.value, selectedTemplate); }}>
                  <option value="">{t("noChartYet")}</option>
                  {payload?.charts.map((chart) => <option key={chart.id} value={chart.id}>{chart.code} · {en ? chart.nameEn : chart.nameFr} · {financeStatusLabel(chart.status, financeLocale)}</option>)}
                </select>
              </label>
              <label className="min-w-0 text-sm font-semibold text-dtsc-ink">{t("chartVersion")}
                <select className="mt-2 h-11 w-full min-w-0 rounded-xl border border-dtsc-border bg-dtsc-page px-3 text-sm text-dtsc-ink" value={selectedTemplate} onChange={(event) => { setSelectedTemplate(event.target.value); void load(selectedChartId, event.target.value); }}>
                  {payload?.templates.map((template) => <option key={template.reference} value={template.reference}>{template.isDefault ? `${t("defaultLabel")} · ` : ""}{en ? template.nameEn : template.nameFr} · {template.reference}</option>)}
                </select>
              </label>
            </div>

            {!selectedChart ? (
              <div className="min-w-0 rounded-2xl border border-dashed border-dtsc-border bg-dtsc-page p-4 sm:p-5">
                <h3 className="font-bold text-dtsc-ink">{t("createCompanyChartStep")}</h3>
                <div className="mt-4 grid min-w-0 gap-3 md:grid-cols-3">
                  <label className="min-w-0 text-xs font-semibold text-dtsc-ink">{t("code")}<Input className="mt-1 min-w-0 border-dtsc-border bg-dtsc-surface text-dtsc-ink" value={chartCode} onChange={(event) => setChartCode(event.target.value.toUpperCase())} /></label>
                  <label className="min-w-0 text-xs font-semibold text-dtsc-ink">{t("frenchName")}<Input className="mt-1 min-w-0 border-dtsc-border bg-dtsc-surface text-dtsc-ink" value={chartNameFr} onChange={(event) => setChartNameFr(event.target.value)} /></label>
                  <label className="min-w-0 text-xs font-semibold text-dtsc-ink">{t("englishName")}<Input className="mt-1 min-w-0 border-dtsc-border bg-dtsc-surface text-dtsc-ink" value={chartNameEn} onChange={(event) => setChartNameEn(event.target.value)} /></label>
                </div>
                {canManage ? <Button className="mt-4 rounded-full" disabled={saving || !chartCode.trim() || !chartNameFr.trim() || !chartNameEn.trim()} onClick={() => void createChart()}>{t("createChart")}</Button> : null}
              </div>
            ) : (
              <div className="min-w-0 rounded-2xl border border-dtsc-border bg-dtsc-page p-4 sm:p-5">
                <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0"><p className="text-xs font-semibold uppercase text-dtsc-muted">{t("currentChart")}</p><h3 className="mt-1 break-words font-black text-dtsc-ink">{selectedChart.code} · {en ? selectedChart.nameEn : selectedChart.nameFr}</h3><p className="mt-1 break-words text-xs text-dtsc-muted">{selectedChart.templateCode || t("noChartVersionApplied")} · {financeStatusLabel(selectedChart.status, financeLocale)}</p></div>
                  <span className="rounded-full border border-dtsc-border bg-dtsc-surface px-3 py-1 text-xs font-bold text-dtsc-ink">{selectedChart._count?.accounts || 0} {t("accounts").toLowerCase()}</span>
                </div>
                <div data-responsive-actions className="mt-4 flex min-w-0 flex-wrap gap-2">
                  {canManage && !selectedChart.templateCode ? <Button className="rounded-full" disabled={saving || !selectedTemplate} onClick={() => void mutate({ action: "ADOPT_TEMPLATE", chartId: selectedChart.id, templateReference: selectedTemplate }, "officialChartApplied")}>{t("applyChartVersion")}</Button> : null}
                  {canManage ? <Button variant="outline" className="rounded-full border-dtsc-border bg-dtsc-surface text-dtsc-blue" disabled={saving} onClick={() => void mutate({ action: "APPLY_RECOMMENDED_JOURNALS" }, "recommendedJournalsConfigured")}>{t("configureRecommendedJournals")}</Button> : null}
                  {canManage && selectedChart.templateCode && selectedChart.status !== "ACTIVE" ? <Button className="rounded-full" disabled={saving || blocked} onClick={() => void mutate({ action: "ACTIVATE_CHART", chartId: selectedChart.id, revision: selectedChart.revision }, "chartActivated")}>{t("activateAccounting")}</Button> : null}
                </div>
              </div>
            )}

            {selectedTemplateItem ? (
              <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <Metric label={t("jurisdiction")} value={selectedTemplateItem.countryScope.join(", ") || "—"} />
                <Metric label={t("effectiveFrom")} value={selectedTemplateItem.effectiveFrom} />
                <Metric label={t("accounts")} value={String(selectedTemplateItem.accountCount)} />
                <Metric label={t("businessMappings")} value={String(selectedTemplateItem.semanticMappingCount)} />
                <Metric label={t("statementLineCount")} value={String(selectedTemplateItem.statementMappingCount)} />
              </div>
            ) : null}
          </div>

          <aside className="min-w-0 space-y-4">
            <div className={`rounded-2xl border p-4 ${payload?.readiness?.ready ? "border-emerald-500/30 bg-emerald-500/5" : "border-amber-500/30 bg-amber-500/5"}`}>
              <div className="flex min-w-0 items-start gap-3">{payload?.readiness?.ready ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" /> : <CircleDashed className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />}<div className="min-w-0"><h3 className="break-words font-black text-dtsc-ink">{payload?.readiness?.ready ? t("readyToActivate") : t("configurationToComplete")}</h3><p className="mt-1 text-xs leading-5 text-dtsc-muted">{t("everyBlockingRuleChecked")}</p></div></div>
            </div>

            <div className="max-h-80 min-w-0 space-y-2 overflow-y-auto pr-1">
              {diagnostics.map((diagnostic) => <DiagnosticRow key={diagnostic.code} diagnostic={diagnostic} en={en} />)}
              {!diagnostics.length && !loading ? <p className="rounded-xl border border-dashed border-dtsc-border bg-dtsc-page p-4 text-sm text-dtsc-muted">{t("createOrSelectChartChecks")}</p> : null}
            </div>

            {payload?.regulatorySupport ? (
              <div className={`rounded-2xl border p-4 ${payload.regulatorySupport.supported ? "border-emerald-500/30 bg-emerald-500/5" : "border-violet-500/30 bg-violet-500/5"}`}>
                <div className="flex min-w-0 items-start gap-3">{payload.regulatorySupport.supported ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" /> : <CircleDashed className="mt-0.5 h-5 w-5 shrink-0 text-violet-600" />}<div className="min-w-0"><h3 className="font-black text-dtsc-ink">{t("financialStatements")}</h3><p className="mt-1 break-words text-xs leading-5 text-dtsc-muted">{en ? payload.regulatorySupport.messageEn : payload.regulatorySupport.messageFr}</p></div></div>
              </div>
            ) : null}
          </aside>
        </div>

        {payload?.governance ? <div className="flex min-w-0 items-start gap-3 border-t border-emerald-500/20 bg-emerald-500/5 px-5 py-4 text-sm text-dtsc-ink sm:px-7"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /><span className="min-w-0 break-words">{en ? payload.governance.messageEn : payload.governance.messageFr}</span></div> : null}
        {notice ? <div className="border-t border-emerald-500/20 bg-emerald-500/5 px-5 py-3 text-sm text-dtsc-ink sm:px-7">{notice}</div> : null}
        {error ? <div className="border-t border-red-500/20 bg-red-500/5 px-5 py-3 text-sm text-red-700 dark:text-red-300 sm:px-7">{error}</div> : null}
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0 rounded-xl border border-dtsc-border bg-dtsc-page p-3"><p className="text-[11px] font-bold uppercase tracking-wide text-dtsc-muted">{label}</p><p className="mt-1 break-words text-sm font-black text-dtsc-ink">{value}</p></div>;
}

function DiagnosticRow({ diagnostic, en }: { diagnostic: Diagnostic; en: boolean }) {
  return <div className="flex min-w-0 items-start gap-3 rounded-xl border border-dtsc-border bg-dtsc-page p-3">{diagnostic.ready ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : diagnostic.severity === "BLOCKER" ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" /> : <CircleDashed className="mt-0.5 h-4 w-4 shrink-0 text-dtsc-muted" />}<div className="min-w-0"><p className="break-words text-xs font-bold text-dtsc-ink">{en ? diagnostic.messageEn : diagnostic.messageFr}</p>{!diagnostic.ready && (diagnostic.actionFr || diagnostic.actionEn) ? <p className="mt-1 break-words text-[11px] leading-4 text-dtsc-muted">{en ? diagnostic.actionEn : diagnostic.actionFr}</p> : null}</div></div>;
}
