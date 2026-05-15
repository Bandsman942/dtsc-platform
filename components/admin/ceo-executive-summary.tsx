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

export function CeoExecutiveSummary({
  groups,
  dateStart,
  dateEnd,
}: {
  groups: CeoExecutiveGroup[];
  dateStart?: string;
  dateEnd?: string;
}) {
  return (
    <section className="space-y-4">
      <div className="dtsc-card bg-[#001736] p-6 text-white">
        <p className="text-sm font-black uppercase tracking-[0.18em] text-cyan-300">Tableau de bord exécutif</p>
        <h2 className="mt-2 text-3xl font-black">Vue CEO consolidée</h2>
        <p className="mt-3 max-w-4xl text-sm leading-7 text-slate-300">
          Lecture synthétique des finances, RH, opérations COO et activités SCO. Les brouillons ne sont pas comptabilisés dans les indicateurs financiers réels.
        </p>
        <form action="/admin" className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4">
          <input type="hidden" name="section" value="ceo" />
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <h3 className="font-black text-white">Filtre de période CEO</h3>
              <p className="mt-1 text-sm leading-6 text-slate-300">
                Filtre les résumés financiers, RH, COO et SCO selon les dates réellement suivies.
              </p>
            </div>
            <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto]">
              <label className="grid min-w-0 gap-1 text-xs font-black uppercase tracking-[0.1em] text-cyan-100">
                Début
                <input
                  type="date"
                  name="ceoStart"
                  defaultValue={dateStart || ""}
                  className="h-11 min-w-0 rounded-xl border border-white/15 bg-[#001022] px-3 text-sm font-bold text-white outline-none focus:border-cyan-300"
                />
              </label>
              <label className="grid min-w-0 gap-1 text-xs font-black uppercase tracking-[0.1em] text-cyan-100">
                Fin
                <input
                  type="date"
                  name="ceoEnd"
                  defaultValue={dateEnd || ""}
                  className="h-11 min-w-0 rounded-xl border border-white/15 bg-[#001022] px-3 text-sm font-bold text-white outline-none focus:border-cyan-300"
                />
              </label>
              <button type="submit" className="h-11 self-end rounded-xl bg-cyan-400 px-4 text-sm font-black text-[#001736] transition hover:bg-cyan-300">
                Filtrer
              </button>
              <a href="/admin?section=ceo" className="inline-flex h-11 items-center justify-center self-end rounded-xl border border-white/15 px-4 text-sm font-black text-cyan-100 transition hover:bg-white/10">
                Tout afficher
              </a>
            </div>
          </div>
        </form>
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
