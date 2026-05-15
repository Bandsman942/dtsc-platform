type CeoExecutiveMetric = {
  label: string;
  value: string | number;
  detail: string;
};

type CeoExecutiveGroup = {
  title: string;
  description: string;
  metrics: CeoExecutiveMetric[];
};

export function CeoExecutiveSummary({ groups }: { groups: CeoExecutiveGroup[] }) {
  return (
    <section className="space-y-4">
      <div className="dtsc-card bg-[#001736] p-6 text-white">
        <p className="text-sm font-black uppercase tracking-[0.18em] text-cyan-300">Tableau de bord exécutif</p>
        <h2 className="mt-2 text-3xl font-black">Vue CEO consolidée</h2>
        <p className="mt-3 max-w-4xl text-sm leading-7 text-slate-300">
          Lecture synthétique des finances, RH, opérations COO et activités SCO. Les brouillons ne sont pas comptabilisés dans les indicateurs financiers réels.
        </p>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        {groups.map((group) => (
          <article key={group.title} className="dtsc-card min-w-0 p-5">
            <div className="mb-4">
              <h3 className="text-xl font-black text-dtsc-ink">{group.title}</h3>
              <p className="mt-1 text-sm leading-6 text-dtsc-muted">{group.description}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {group.metrics.map((metric) => (
                <div key={`${group.title}-${metric.label}`} className="min-w-0 rounded-2xl border border-dtsc-border bg-dtsc-page p-4">
                  <p className="text-xs font-black uppercase tracking-[0.12em] text-dtsc-muted">{metric.label}</p>
                  <p className="mt-2 text-2xl font-black text-dtsc-ink">{metric.value}</p>
                  <p className="mt-1 text-xs leading-5 text-dtsc-muted">{metric.detail}</p>
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
