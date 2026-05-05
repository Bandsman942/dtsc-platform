import Link from "next/link";

export type VisitPoint = {
  date: string;
  label: string;
  count: number;
};

export function SiteVisitsChart({
  points,
  selectedPeriod,
  selectedDate,
}: {
  points: VisitPoint[];
  selectedPeriod: number;
  selectedDate?: string;
}) {
  const maxCount = Math.max(1, ...points.map((point) => point.count));
  const total = points.reduce((sum, point) => sum + point.count, 0);
  const periodLabel = selectedDate ? `le ${selectedDate}` : `sur ${selectedPeriod} jours`;

  return (
    <section className="dtsc-card p-6">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <h2 className="font-black text-dtsc-ink">Visites du site</h2>
          <p className="text-sm text-dtsc-muted">Suivez l&apos;évolution des visites publiques et filtrez une date précise.</p>
          <p className="mt-2 text-sm font-black text-dtsc-blue">{total} visite(s) {periodLabel}</p>
        </div>
        <form className="flex flex-wrap items-end gap-2" action="/admin">
          <label className="grid gap-1 text-xs font-bold text-dtsc-muted">
            Date précise
            <input name="date" type="date" defaultValue={selectedDate || ""} className="h-10 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm text-dtsc-ink" />
          </label>
          <button className="h-10 rounded-xl bg-[#002b5b] px-4 text-sm font-bold text-white">Filtrer</button>
        </form>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-4">
        {["7", "30", "90", "200"].map((days) => (
          <Link key={days} href={`/admin?period=${days}`} className="rounded-xl border border-dtsc-border bg-dtsc-page px-4 py-3 text-sm font-bold text-dtsc-ink hover:border-cyan-300">
            {days} jours
          </Link>
        ))}
      </div>
      <div className="mt-5 overflow-hidden rounded-2xl border border-dtsc-border bg-dtsc-page p-4">
        <div className="h-56 w-full overflow-x-auto overflow-y-hidden">
          <div className="flex h-full min-w-full items-end gap-2">
            {points.map((point) => (
              <div key={point.date} className="flex h-full min-w-10 flex-1 flex-col justify-end gap-2">
                <div className="text-center text-xs font-black text-dtsc-ink">{point.count}</div>
                <div className="flex h-36 items-end rounded-xl bg-dtsc-surface p-1">
                  <div
                    className="w-full rounded-lg bg-cyan-400"
                    style={{ height: `${Math.max(6, Math.round((point.count / maxCount) * 132))}px` }}
                    title={`${point.count} visite(s) le ${point.label}`}
                  />
                </div>
                <div className="truncate text-center text-[10px] font-bold text-dtsc-muted">{point.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
