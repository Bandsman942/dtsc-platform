"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, CircleDashed, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { financeStatusLabel, safeFinanceError, type FinanceLocale } from "@/components/enterprise/professional/finance-professional-ui";

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
      setError(safeFinanceError(loadError, en ? "Accounting setup could not be loaded." : "La configuration comptable n’a pas pu être chargée.", financeLocale));
    } finally {
      setLoading(false);
    }
  }, [en, financeLocale, organizationId, selectedTemplate]);

  useEffect(() => { void load(); }, [load]);

  const selectedChart = useMemo(() => payload?.charts.find((chart) => chart.id === selectedChartId) || null, [payload, selectedChartId]);
  const selectedTemplateItem = useMemo(() => payload?.templates.find((template) => template.reference === selectedTemplate) || null, [payload, selectedTemplate]);

  async function createChart() {
    setSaving(true); setError(null); setNotice(null);
    try {
      const body = await jsonRequest(`/api/enterprise/${organizationId}/charts-of-accounts`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: chartCode, nameFr: chartNameFr, nameEn: chartNameEn }) });
      const chart = body.chart as Chart;
      setNotice(en ? "Chart created. You can now apply the official DTSC default." : "Plan créé. Vous pouvez maintenant appliquer le plan officiel par défaut de DTSC.");
      await load(chart.id, selectedTemplate);
    } catch (saveError) {
      setError(safeFinanceError(saveError, en ? "The chart could not be created." : "Le plan n’a pas pu être créé.", financeLocale));
    } finally { setSaving(false); }
  }

  async function mutate(body: Record<string, unknown>, successFr: string, successEn: string) {
    setSaving(true); setError(null); setNotice(null);
    try {
      await jsonRequest(`/api/enterprise/${organizationId}/accounting-setup`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      setNotice(en ? successEn : successFr);
      await load(selectedChartId, selectedTemplate);
    } catch (saveError) {
      setError(safeFinanceError(saveError, en ? "The requested action could not be completed." : "L’action demandée n’a pas pu être terminée.", financeLocale));
    } finally { setSaving(false); }
  }

  const diagnostics = payload?.readiness?.diagnostics || [];
  const blocked = Boolean(payload?.readiness && !payload.readiness.ready);

  return (
    <section className="mx-auto mb-6 w-full max-w-[1600px] px-4 sm:px-6 lg:px-8" aria-labelledby="accounting-onboarding-title">
      <div className="overflow-hidden rounded-3xl border border-cyan-500/20 bg-card shadow-sm">
        <div className="border-b border-border/70 bg-gradient-to-r from-cyan-500/10 via-background to-violet-500/10 p-5 sm:p-7">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-700 dark:text-cyan-300">{en ? "Accounting onboarding" : "Mise en service comptable"}</p>
              <h2 id="accounting-onboarding-title" className="mt-2 text-xl font-black sm:text-2xl">{en ? "Configure, validate, then activate" : "Configurer, valider, puis activer"}</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{en ? "DTSC starts with the official SYSCOHADA default while keeping each company chart independent and versioned. Every blocker explains the next action before posting is enabled." : "DTSC propose SYSCOHADA comme plan officiel par défaut tout en gardant le plan de chaque entreprise indépendant et versionné. Chaque blocage indique l’action à effectuer avant l’activation de la comptabilisation."}</p>
            </div>
            <Button type="button" variant="outline" className="rounded-full" onClick={() => void load(selectedChartId, selectedTemplate)} disabled={loading || saving}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}{en ? "Refresh" : "Actualiser"}
            </Button>
          </div>
        </div>

        <div className="grid gap-5 p-5 sm:p-7 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.8fr)]">
          <div className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-sm font-semibold">{en ? "Company chart" : "Plan de l’entreprise"}
                <select className="mt-2 h-11 w-full rounded-xl border bg-background px-3 text-sm" value={selectedChartId} onChange={(event) => { setSelectedChartId(event.target.value); void load(event.target.value, selectedTemplate); }}>
                  <option value="">{en ? "No chart yet" : "Aucun plan pour l’instant"}</option>
                  {payload?.charts.map((chart) => <option key={chart.id} value={chart.id}>{chart.code} · {en ? chart.nameEn : chart.nameFr} · {financeStatusLabel(chart.status, financeLocale)}</option>)}
                </select>
              </label>
              <label className="text-sm font-semibold">{en ? "Chart version" : "Version du plan"}
                <select className="mt-2 h-11 w-full rounded-xl border bg-background px-3 text-sm" value={selectedTemplate} onChange={(event) => { setSelectedTemplate(event.target.value); void load(selectedChartId, event.target.value); }}>
                  {payload?.templates.map((template) => <option key={template.reference} value={template.reference}>{template.isDefault ? (en ? "Default · " : "Par défaut · ") : ""}{en ? template.nameEn : template.nameFr} · {template.reference}</option>)}
                </select>
              </label>
            </div>

            {!selectedChart ? (
              <div className="rounded-2xl border border-dashed p-4 sm:p-5">
                <h3 className="font-bold">{en ? "1. Create the company chart" : "1. Créer le plan de l’entreprise"}</h3>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <label className="text-xs font-semibold">Code<Input className="mt-1" value={chartCode} onChange={(event) => setChartCode(event.target.value.toUpperCase())} /></label>
                  <label className="text-xs font-semibold">{en ? "French name" : "Nom français"}<Input className="mt-1" value={chartNameFr} onChange={(event) => setChartNameFr(event.target.value)} /></label>
                  <label className="text-xs font-semibold">{en ? "English name" : "Nom anglais"}<Input className="mt-1" value={chartNameEn} onChange={(event) => setChartNameEn(event.target.value)} /></label>
                </div>
                {canManage ? <Button className="mt-4 rounded-full" disabled={saving || !chartCode.trim() || !chartNameFr.trim() || !chartNameEn.trim()} onClick={() => void createChart()}>{en ? "Create chart" : "Créer le plan"}</Button> : null}
              </div>
            ) : (
              <div className="rounded-2xl border p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div><p className="text-xs font-semibold uppercase text-muted-foreground">{en ? "Current chart" : "Plan actuel"}</p><h3 className="mt-1 font-black">{selectedChart.code} · {en ? selectedChart.nameEn : selectedChart.nameFr}</h3><p className="mt-1 text-xs text-muted-foreground">{selectedChart.templateCode || (en ? "No chart version applied" : "Aucune version appliquée")} · {financeStatusLabel(selectedChart.status, financeLocale)}</p></div>
                  <span className="rounded-full border px-3 py-1 text-xs font-bold">{selectedChart._count?.accounts || 0} {en ? "accounts" : "comptes"}</span>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {canManage && !selectedChart.templateCode ? <Button className="rounded-full" disabled={saving || !selectedTemplate} onClick={() => void mutate({ action: "ADOPT_TEMPLATE", chartId: selectedChart.id, templateReference: selectedTemplate }, "Plan officiel appliqué au brouillon de l’entreprise.", "Official chart applied to the company draft.")}>{en ? "Apply chart version" : "Appliquer la version"}</Button> : null}
                  {canManage ? <Button variant="outline" className="rounded-full" disabled={saving} onClick={() => void mutate({ action: "APPLY_RECOMMENDED_JOURNALS" }, "Journaux recommandés configurés.", "Recommended journals configured.")}>{en ? "Configure recommended journals" : "Configurer les journaux recommandés"}</Button> : null}
                  {canManage && selectedChart.templateCode && selectedChart.status !== "ACTIVE" ? <Button className="rounded-full" disabled={saving || blocked} onClick={() => void mutate({ action: "ACTIVATE_CHART", chartId: selectedChart.id, revision: selectedChart.revision }, "Plan comptable activé.", "Chart of accounts activated.")}>{en ? "Activate accounting" : "Activer la comptabilité"}</Button> : null}
                </div>
              </div>
            )}

            {selectedTemplateItem ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <Metric label={en ? "Jurisdiction" : "Juridiction"} value={selectedTemplateItem.countryScope.join(", ") || "—"} />
                <Metric label={en ? "Effective from" : "Applicable depuis"} value={selectedTemplateItem.effectiveFrom} />
                <Metric label={en ? "Accounts" : "Comptes"} value={String(selectedTemplateItem.accountCount)} />
                <Metric label={en ? "Business mappings" : "Mappings métier"} value={String(selectedTemplateItem.semanticMappingCount)} />
                <Metric label={en ? "Statement lines" : "Rubriques d’états"} value={String(selectedTemplateItem.statementMappingCount)} />
              </div>
            ) : null}
          </div>

          <aside className="space-y-4">
            <div className={`rounded-2xl border p-4 ${payload?.readiness?.ready ? "border-emerald-500/30 bg-emerald-500/5" : "border-amber-500/30 bg-amber-500/5"}`}>
              <div className="flex items-start gap-3">{payload?.readiness?.ready ? <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600" /> : <CircleDashed className="mt-0.5 h-5 w-5 text-amber-600" />}<div><h3 className="font-black">{payload?.readiness?.ready ? (en ? "Ready to activate" : "Prêt à activer") : (en ? "Configuration to complete" : "Configuration à compléter")}</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">{en ? "Every blocking rule is checked by the Finance service." : "Chaque règle bloquante est vérifiée par le service Finance."}</p></div></div>
            </div>

            <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
              {diagnostics.map((diagnostic) => <DiagnosticRow key={diagnostic.code} diagnostic={diagnostic} en={en} />)}
              {!diagnostics.length && !loading ? <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">{en ? "Create or select a chart to display activation checks." : "Créez ou sélectionnez un plan pour afficher les vérifications d’activation."}</p> : null}
            </div>

            {payload?.regulatorySupport ? (
              <div className={`rounded-2xl border p-4 ${payload.regulatorySupport.supported ? "border-emerald-500/30 bg-emerald-500/5" : "border-violet-500/30 bg-violet-500/5"}`}>
                <div className="flex items-start gap-3">{payload.regulatorySupport.supported ? <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600" /> : <CircleDashed className="mt-0.5 h-5 w-5 text-violet-600" />}<div><h3 className="font-black">{en ? "Financial statements" : "États financiers"}</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">{en ? payload.regulatorySupport.messageEn : payload.regulatorySupport.messageFr}</p></div></div>
              </div>
            ) : null}
          </aside>
        </div>

        {payload?.governance ? <div className="flex items-start gap-3 border-t border-emerald-500/20 bg-emerald-500/5 px-5 py-4 text-sm sm:px-7"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /><span>{en ? payload.governance.messageEn : payload.governance.messageFr}</span></div> : null}
        {notice ? <div className="border-t border-emerald-500/20 bg-emerald-500/5 px-5 py-3 text-sm sm:px-7">{notice}</div> : null}
        {error ? <div className="border-t border-destructive/20 bg-destructive/5 px-5 py-3 text-sm text-destructive sm:px-7">{error}</div> : null}
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border bg-background/70 p-3"><p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-1 truncate text-sm font-black">{value}</p></div>;
}

function DiagnosticRow({ diagnostic, en }: { diagnostic: Diagnostic; en: boolean }) {
  return <div className="flex items-start gap-3 rounded-xl border bg-background/70 p-3">{diagnostic.ready ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : diagnostic.severity === "BLOCKER" ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" /> : <CircleDashed className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}<div className="min-w-0"><p className="text-xs font-bold">{en ? diagnostic.messageEn : diagnostic.messageFr}</p>{!diagnostic.ready && (diagnostic.actionFr || diagnostic.actionEn) ? <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{en ? diagnostic.actionEn : diagnostic.actionFr}</p> : null}</div></div>;
}
