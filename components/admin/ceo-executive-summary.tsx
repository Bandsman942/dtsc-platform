import Link from "next/link";
import { ModuleMetric, ModuleMetrics } from "@/components/workspace/module-metrics";
import { ModuleContent, ModuleHeader, ModuleSection, ModuleToolbar, ModuleWorkspace } from "@/components/workspace/module-workspace";

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
  const totalMetrics = groups.reduce((sum, group) => sum + group.metrics.length, 0);
  const hasFilters = Boolean(dateStart || dateEnd);

  return (
    <ModuleWorkspace>
      <ModuleHeader
        eyebrow="Tableau de bord exécutif"
        title="Vue CEO consolidée"
        count={`${totalMetrics} indicateur${totalMetrics > 1 ? "s" : ""}`}
        description="Lecture synthétique des finances, RH, opérations COO et activités SCO. Les brouillons ne sont pas comptabilisés dans les indicateurs financiers réels."
      />

      <form action="/admin">
        <input type="hidden" name="section" value="ceo" />
        <ModuleToolbar
          ariaLabel="Filtres du tableau de bord CEO"
          controls={(
            <>
              <label className="grid min-w-[8.5rem] flex-1 gap-1 text-[0.68rem] font-black uppercase tracking-[0.08em] text-dtsc-muted sm:flex-none sm:min-w-[9.5rem]">
                Début
                <input type="date" name="ceoStart" defaultValue={dateStart || ""} className="h-11 min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-bold text-dtsc-ink outline-none focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/20" />
              </label>
              <label className="grid min-w-[8.5rem] flex-1 gap-1 text-[0.68rem] font-black uppercase tracking-[0.08em] text-dtsc-muted sm:flex-none sm:min-w-[9.5rem]">
                Fin
                <input type="date" name="ceoEnd" defaultValue={dateEnd || ""} className="h-11 min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-bold text-dtsc-ink outline-none focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/20" />
              </label>
              <button type="submit" className="inline-flex h-11 items-center justify-center rounded-xl bg-dtsc-blue px-4 text-sm font-black text-white transition hover:opacity-90">Filtrer</button>
              {hasFilters ? <Link href="/admin?section=ceo" className="inline-flex h-11 items-center justify-center rounded-xl border border-dtsc-border bg-dtsc-surface px-4 text-sm font-black text-dtsc-blue transition hover:bg-dtsc-soft">Réinitialiser</Link> : null}
            </>
          )}
          activeFilters={<span>{hasFilters ? `Période : ${dateStart || "…"} → ${dateEnd || "…"}` : "Aucun filtre actif"}</span>}
          summary={`${groups.length} domaine${groups.length > 1 ? "s" : ""}`}
        />
      </form>

      <ModuleContent>
        {groups.map((group) => (
          <ModuleSection key={group.title} title={group.title} description={group.description} count={`${group.metrics.length}`}>
            <ModuleMetrics label={`Indicateurs ${group.title}`}>
              {group.metrics.map((metric) => (
                <ModuleMetric key={`${group.title}-${metric.label}`} label={metric.label} value={metric.value} hint={metric.detail} />
              ))}
            </ModuleMetrics>
          </ModuleSection>
        ))}
      </ModuleContent>
    </ModuleWorkspace>
  );
}
