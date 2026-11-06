import { EmptyState } from "@/components/workspace/empty-state";
import { ModuleMetric, ModuleMetrics } from "@/components/workspace/module-metrics";
import { ModuleContent, ModuleHeader, ModuleSection, ModuleWorkspace } from "@/components/workspace/module-workspace";
import { translateInternalAdminStatus, translateInternalAdminSystemCopy } from "@/lib/i18n";

type LegalMetric = {
  label: string;
  value: string | number;
  detail: string;
};

type LegalChart = {
  title: string;
  items: Array<{ label: string; value: number }>;
};

const legalEnumCharts = new Set(["Dossiers juridiques par statut", "Risques juridiques par niveau", "Contrats par type", "Demandes juridiques par priorité"]);

export function LegalDashboardSummary({ metrics, charts, locale = "fr", embedded = false }: { metrics: LegalMetric[]; charts: LegalChart[]; locale?: string; embedded?: boolean }) {
  const maxChartValue = Math.max(1, ...charts.flatMap((chart) => chart.items.map((item) => item.value)));
  const copy = (value: string) => translateInternalAdminSystemCopy(locale, value);

  return (
    <ModuleWorkspace>
      {!embedded ? (
      <ModuleHeader
        eyebrow={copy("Tableau de bord juridique")}
        title={copy("Vue LA consolidée")}
        count={`${metrics.length} ${copy(metrics.length > 1 ? "indicateurs" : "indicateur")}`}
        description={copy("Suivi des dossiers, contrats, risques, documents officiels, litiges et demandes juridiques avec alertes CEO sur les points critiques.")}
      />
      ) : null}

      <ModuleMetrics label={copy("Indicateurs juridiques")}>
        {metrics.map((metric) => <ModuleMetric key={metric.label} label={copy(metric.label)} value={metric.value} hint={copy(metric.detail)} />)}
      </ModuleMetrics>

      <ModuleContent>
        {charts.map((chart) => (
          <ModuleSection key={chart.title} title={copy(chart.title)} count={`${chart.items.length}`}>
            {chart.items.length ? (
              <div className="grid gap-x-6 gap-y-3 md:grid-cols-2">
                {chart.items.slice(0, 8).map((item) => (
                  <div key={`${chart.title}-${item.label}`} className="min-w-0 border-b border-dtsc-border pb-3">
                    <div className="flex items-center justify-between gap-3 text-xs font-black uppercase tracking-[0.1em] text-dtsc-muted">
                      <span className="min-w-0 truncate">{legalEnumCharts.has(chart.title) ? translateInternalAdminStatus(locale, item.label) : copy(item.label)}</span>
                      <span>{item.value}</span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-dtsc-soft">
                      <div className="h-full rounded-full bg-cyan-400" style={{ width: `${Math.max(6, (item.value / maxChartValue) * 100)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            ) : <EmptyState compact title={copy("Aucune donnée juridique")} description={copy("Aucun élément n'alimente encore cette synthèse.")} />}
          </ModuleSection>
        ))}
      </ModuleContent>
    </ModuleWorkspace>
  );
}
