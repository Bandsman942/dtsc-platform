import { EmptyState } from "@/components/workspace/empty-state";
import { ModuleMetric, ModuleMetrics } from "@/components/workspace/module-metrics";
import { ModuleContent, ModuleHeader, ModuleSection, ModuleWorkspace } from "@/components/workspace/module-workspace";

type LegalMetric = {
  label: string;
  value: string | number;
  detail: string;
};

type LegalChart = {
  title: string;
  items: Array<{ label: string; value: number }>;
};

export function LegalDashboardSummary({ metrics, charts }: { metrics: LegalMetric[]; charts: LegalChart[] }) {
  const maxChartValue = Math.max(1, ...charts.flatMap((chart) => chart.items.map((item) => item.value)));

  return (
    <ModuleWorkspace>
      <ModuleHeader
        eyebrow="Tableau de bord juridique"
        title="Vue LA consolidée"
        count={`${metrics.length} indicateur${metrics.length > 1 ? "s" : ""}`}
        description="Suivi des dossiers, contrats, risques, documents officiels, litiges et demandes juridiques avec alertes CEO sur les points critiques."
      />

      <ModuleMetrics label="Indicateurs juridiques">
        {metrics.map((metric) => <ModuleMetric key={metric.label} label={metric.label} value={metric.value} hint={metric.detail} />)}
      </ModuleMetrics>

      <ModuleContent>
        {charts.map((chart) => (
          <ModuleSection key={chart.title} title={chart.title} count={`${chart.items.length}`}>
            {chart.items.length ? (
              <div className="grid gap-x-6 gap-y-3 md:grid-cols-2">
                {chart.items.slice(0, 8).map((item) => (
                  <div key={`${chart.title}-${item.label}`} className="min-w-0 border-b border-dtsc-border pb-3">
                    <div className="flex items-center justify-between gap-3 text-xs font-black uppercase tracking-[0.1em] text-dtsc-muted">
                      <span className="min-w-0 truncate">{item.label}</span>
                      <span>{item.value}</span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-dtsc-soft">
                      <div className="h-full rounded-full bg-cyan-400" style={{ width: `${Math.max(6, (item.value / maxChartValue) * 100)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            ) : <EmptyState compact title="Aucune donnée juridique" description="Aucun élément n'alimente encore cette synthèse." />}
          </ModuleSection>
        ))}
      </ModuleContent>
    </ModuleWorkspace>
  );
}
