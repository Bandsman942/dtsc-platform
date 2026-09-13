import type { getScale5cReadPathObservability } from "@/lib/scalability/scale5c-read-path-observability";

type Snapshot = Awaited<ReturnType<typeof getScale5cReadPathObservability>>;

const copy = {
  fr: {
    eyebrow: "SCALE-5C · Lecture Finance",
    title: "Finance · synthèse budgets & dépenses",
    description: "Projection tenant-scoped réservée aux vues organisationnelles complètes. Les vues restreintes par utilisateur restent volontairement sur PostgreSQL.",
    measured: "Mesuré",
    noSamples: "Non mesuré",
    watch: "À surveiller",
    requests: "Lectures observées",
    hit: "HIT",
    miss: "MISS",
    fallback: "FALLBACK",
    bypass: "BYPASS utilisateur",
    hitRate: "Taux de HIT",
    hitP95: "P95 cache HIT",
    databaseP95: "P95 lecture DB",
    coverage: "Couverture SCALE-5",
    optimized: "Read paths optimisés",
    intentionalBypass: "Bypass intentionnels",
    safety: "Les métriques sont agrégées : aucun identifiant d’entreprise/utilisateur, clé Redis ou secret n’est exposé.",
  },
  en: {
    eyebrow: "SCALE-5C · Finance reads",
    title: "Finance · budget & expense summary",
    description: "Tenant-scoped projection limited to full organization visibility. User-restricted views deliberately remain on PostgreSQL.",
    measured: "Measured",
    noSamples: "Not measured",
    watch: "Watch",
    requests: "Observed reads",
    hit: "HIT",
    miss: "MISS",
    fallback: "FALLBACK",
    bypass: "User BYPASS",
    hitRate: "HIT rate",
    hitP95: "Cache HIT P95",
    databaseP95: "DB read P95",
    coverage: "SCALE-5 coverage",
    optimized: "Optimized read paths",
    intentionalBypass: "Intentional bypasses",
    safety: "Metrics are aggregated: no organization/user identifier, Redis key or secret is exposed.",
  },
} as const;

function percent(value: number | null) {
  return value == null ? "—" : `${(value * 100).toFixed(value * 100 < 10 ? 2 : 1)}%`;
}

function milliseconds(value: number | null) {
  return value == null ? "—" : `${Math.round(value)} ms`;
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="min-w-0 rounded-2xl border border-dtsc-border bg-dtsc-surface p-4">
      <p className="break-words text-[0.68rem] font-black uppercase tracking-[0.08em] text-dtsc-muted">{label}</p>
      <p className="mt-2 break-words text-2xl font-black text-dtsc-ink">{value}</p>
    </div>
  );
}

export function CtoScale5cReadCachePanel({ snapshot, locale }: { snapshot: Snapshot; locale: string }) {
  const t = locale === "en" ? copy.en : copy.fr;
  const hasSamples = snapshot.financeSummary.requests > 0;
  const watch = snapshot.financeSummary.fallback > 0;
  const statusLabel = !hasSamples ? t.noSamples : watch ? t.watch : t.measured;

  return (
    <section className="dtsc-panel w-full min-w-0 max-w-full overflow-hidden p-4 sm:p-5" data-dtsc-responsive-root>
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-black text-cyan-600">{t.eyebrow}</p>
          <h2 className="mt-1 break-words text-xl font-black text-dtsc-ink sm:text-2xl">{t.title}</h2>
          <p className="mt-2 max-w-4xl break-words text-sm leading-6 text-dtsc-muted">{t.description}</p>
        </div>
        <span className="inline-flex rounded-full border border-dtsc-border bg-dtsc-soft px-3 py-1 text-xs font-black uppercase tracking-[0.08em] text-dtsc-ink">{statusLabel}</span>
      </div>

      <div className="mt-4 grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-[repeat(2,minmax(0,1fr))] xl:grid-cols-[repeat(4,minmax(0,1fr))]">
        <Metric label={t.requests} value={snapshot.financeSummary.requests} />
        <Metric label={t.hit} value={snapshot.financeSummary.hit} />
        <Metric label={t.miss} value={snapshot.financeSummary.miss} />
        <Metric label={t.fallback} value={snapshot.financeSummary.fallback} />
        <Metric label={t.bypass} value={snapshot.financeSummary.bypass} />
        <Metric label={t.hitRate} value={percent(snapshot.financeSummary.hitRate)} />
        <Metric label={t.hitP95} value={milliseconds(snapshot.financeSummary.latencyMs.hitP95)} />
        <Metric label={t.databaseP95} value={milliseconds(snapshot.financeSummary.latencyMs.databaseP95)} />
      </div>

      <div className="mt-4 grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-[repeat(3,minmax(0,1fr))]">
        <Metric label={t.coverage} value={`${snapshot.coverage.scale5a ? "5A ✓" : "5A —"} · ${snapshot.coverage.scale5b ? "5B ✓" : "5B —"} · ${snapshot.coverage.scale5c ? "5C ✓" : "5C —"}`} />
        <Metric label={t.optimized} value={snapshot.coverage.optimizedReadPaths} />
        <Metric label={t.intentionalBypass} value={snapshot.coverage.intentionalBypassReadPaths} />
      </div>

      <p className="mt-4 break-words text-xs leading-5 text-dtsc-muted">{t.safety}</p>
    </section>
  );
}
