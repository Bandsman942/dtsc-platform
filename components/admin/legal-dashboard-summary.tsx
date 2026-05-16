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
    <section className="space-y-4">
      <div className="dtsc-card bg-[#001736] p-6 text-white">
        <p className="text-sm font-black uppercase tracking-[0.18em] text-cyan-300">Tableau de bord juridique</p>
        <h2 className="mt-2 text-3xl font-black">Vue LA consolidée</h2>
        <p className="mt-3 max-w-4xl text-sm leading-7 text-slate-300">
          Suivi des dossiers, contrats, risques, documents officiels, litiges et demandes juridiques avec alertes CEO sur les points critiques.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <article key={metric.label} className="dtsc-card min-w-0 p-4">
            <p className="text-xs font-black uppercase tracking-[0.12em] text-dtsc-muted">{metric.label}</p>
            <p className="mt-2 text-2xl font-black text-dtsc-ink">{metric.value}</p>
            <p className="mt-1 text-xs leading-5 text-dtsc-muted">{metric.detail}</p>
          </article>
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        {charts.map((chart) => (
          <article key={chart.title} className="dtsc-card min-w-0 overflow-hidden p-5">
            <h3 className="font-black text-dtsc-ink">{chart.title}</h3>
            <div className="mt-4 space-y-3">
              {chart.items.slice(0, 8).map((item) => (
                <div key={`${chart.title}-${item.label}`} className="min-w-0">
                  <div className="mb-1 flex items-center justify-between gap-3 text-xs font-black uppercase tracking-[0.1em] text-dtsc-muted">
                    <span className="min-w-0 truncate">{item.label}</span>
                    <span>{item.value}</span>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-dtsc-page">
                    <div className="h-full rounded-full bg-cyan-400" style={{ width: `${Math.max(6, (item.value / maxChartValue) * 100)}%` }} />
                  </div>
                </div>
              ))}
              {chart.items.length === 0 && <p className="text-sm text-dtsc-muted">Aucune donnée juridique suivie.</p>}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
