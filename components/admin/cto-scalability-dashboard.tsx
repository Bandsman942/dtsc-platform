import Link from "next/link";
import { Activity, ArrowLeft, Bot, Database, Gauge, Layers3, ListTodo, ServerCog, ShieldCheck } from "lucide-react";
import type { getProductionObservabilitySnapshot } from "@/lib/scalability/production-observability";
import { translateScalabilityConsole } from "@/lib/scalability/console-i18n";

type Snapshot = Awaited<ReturnType<typeof getProductionObservabilitySnapshot>>;
type StatusTone = "measured" | "watch" | "not-measured";

function percent(value: number | null) {
  return value == null ? "—" : `${(value * 100).toFixed(value * 100 < 10 ? 2 : 1)}%`;
}

function milliseconds(value: number | null) {
  return value == null ? "—" : `${Math.round(value)} ms`;
}

function elapsed(value: number | null, secondsLabel: string) {
  if (value == null) return "—";
  if (value < 60_000) return `${Math.round(value / 1000)} ${secondsLabel}`;
  if (value < 3_600_000) return `${Math.round(value / 60_000)} min`;
  return `${(value / 3_600_000).toFixed(1)} h`;
}

function metricValue(value: number | null, suffix = "") {
  return value == null ? "—" : `${value.toFixed(value < 10 ? 2 : 1)}${suffix}`;
}

function StatusPill({ tone, label }: { tone: StatusTone; label: string }) {
  const classes = tone === "watch"
    ? "border-amber-300/70 bg-amber-50 text-amber-800 dark:border-amber-500/40 dark:bg-amber-950/30 dark:text-amber-200"
    : tone === "not-measured"
      ? "border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
      : "border-emerald-300/70 bg-emerald-50 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-950/30 dark:text-emerald-200";
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-[0.68rem] font-black uppercase tracking-[0.08em] ${classes}`}>{label}</span>;
}

function Metric({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-dtsc-border bg-dtsc-surface p-4 shadow-[0_10px_30px_rgba(0,43,91,0.05)]">
      <p className="break-words text-[0.68rem] font-black uppercase tracking-[0.08em] text-dtsc-muted">{label}</p>
      <p className="mt-2 break-words text-2xl font-black text-dtsc-ink">{value}</p>
      {hint ? <p className="mt-1 break-words text-xs leading-5 text-dtsc-muted">{hint}</p> : null}
    </div>
  );
}

function CacheGroup({
  title,
  requests,
  hit,
  miss,
  fallback,
  bypass,
  hitRate,
  locale,
}: {
  title: string;
  requests: number;
  hit: number;
  miss: number;
  fallback: number;
  bypass?: number;
  hitRate: number | null;
  locale: string;
}) {
  const t = (key: Parameters<typeof translateScalabilityConsole>[1]) => translateScalabilityConsole(locale, key);
  return (
    <section className="min-w-0 rounded-2xl border border-dtsc-border bg-dtsc-page p-3 sm:p-4">
      <h3 className="break-words font-black text-dtsc-ink">{title}</h3>
      <div className="mt-3 grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-[repeat(2,minmax(0,1fr))] xl:grid-cols-[repeat(3,minmax(0,1fr))]">
        <Metric label={t("cacheRequests")} value={requests} />
        <Metric label={t("cacheHit")} value={hit} />
        <Metric label={t("cacheMiss")} value={miss} />
        <Metric label={t("cacheFallback")} value={fallback} />
        {bypass == null ? null : <Metric label={t("cacheBypass")} value={bypass} />}
        <Metric label={t("cacheHitRate")} value={percent(hitRate)} />
      </div>
    </section>
  );
}

function WindowRail({ locale, active }: { locale: string; active: number }) {
  const t = (key: Parameters<typeof translateScalabilityConsole>[1]) => translateScalabilityConsole(locale, key);
  const options = [
    { hours: 1, label: t("oneHour") },
    { hours: 24, label: t("oneDay") },
    { hours: 168, label: t("sevenDays") },
  ];
  return (
    <div className="max-w-full overflow-x-auto pb-1" data-horizontal-rail>
      <div className="flex min-w-max gap-2" role="group" aria-label={t("window")}>
        {options.map((option) => (
          <Link
            key={option.hours}
            href={`/admin/cto/scalability?windowHours=${option.hours}`}
            aria-current={active === option.hours ? "page" : undefined}
            className={`rounded-full border px-4 py-2 text-sm font-black transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 ${active === option.hours ? "border-cyan-400 bg-[#002b5b] text-white" : "border-dtsc-border bg-dtsc-surface text-dtsc-ink hover:border-cyan-300 hover:bg-dtsc-soft"}`}
          >
            {option.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

export function CtoScalabilityDashboard({ snapshot, locale }: { snapshot: Snapshot; locale: string }) {
  const t = (key: Parameters<typeof translateScalabilityConsole>[1]) => translateScalabilityConsole(locale, key);
  const apiWatch = snapshot.api.sampleCount > 0 && ((snapshot.api.serverErrorRate ?? 0) >= 0.01 || (snapshot.api.latencyMs.p95 ?? 0) >= 1000 || (snapshot.api.latencyMs.p99 ?? 0) >= 2000);
  const dbPolicyWatch = snapshot.database.connectionPolicy.status !== "OK";
  const dbWatch =
    (snapshot.database.connectionUtilization ?? 0) >= 0.8 ||
    snapshot.database.idleInTransactionConnections > 0 ||
    snapshot.database.longRunningQueries > 0 ||
    dbPolicyWatch;
  const aiWatch = snapshot.ai.sampleCount > 0 && ((snapshot.ai.rateLimitedRate ?? 0) > 0 || (snapshot.ai.latencyMs.p99 ?? 0) >= 2000);
  const redisMeasured = snapshot.redis.status === "OK";
  const redisWatch = snapshot.redis.status === "DEGRADED" || snapshot.redis.status === "UNAVAILABLE";
  const rateLimitWatch = snapshot.rateLimit.distributedStatus !== "OK";
  const queueWatch = snapshot.queues.dead > 0 || (snapshot.queues.oldestReadyAgeMs ?? 0) >= 300_000;
  const cacheSamples = snapshot.readCache.finance.requests + snapshot.readCache.retail.requests;
  const cacheFallbacks = snapshot.readCache.finance.fallback + snapshot.readCache.retail.organization.fallback + snapshot.readCache.retail.period.fallback;
  const cacheWatch = cacheFallbacks > 0;

  const databaseModeLabel = (() => {
    switch (snapshot.database.connectionPolicy.mode) {
      case "NEON_POOLED": return t("pooled");
      case "NEON_DIRECT": return t("direct");
      case "POSTGRESQL_OTHER": return t("otherPostgres");
      case "UNCONFIGURED": return t("unconfigured");
      case "INVALID": return t("invalid");
    }
  })();

  return (
    <div className="w-full min-w-0 max-w-full space-y-5" data-dtsc-responsive-root>
      <section className="dtsc-panel min-w-0 max-w-full overflow-hidden p-4 sm:p-6">
        <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-black text-cyan-600">{t("eyebrow")}</p>
            <h1 className="mt-2 break-words text-3xl font-black tracking-tight text-dtsc-ink sm:text-4xl">{t("title")}</h1>
            <p className="mt-3 max-w-3xl break-words leading-7 text-dtsc-muted">{t("description")}</p>
          </div>
          <Link href="/admin/cto" className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-dtsc-border bg-dtsc-surface px-4 py-2 font-black text-dtsc-blue transition hover:border-cyan-300 hover:bg-dtsc-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {t("backToCto")}
          </Link>
        </div>
        <div className="mt-5 space-y-2">
          <p className="text-xs font-black uppercase tracking-[0.08em] text-dtsc-muted">{t("window")}</p>
          <WindowRail locale={locale} active={snapshot.window.hours} />
        </div>
      </section>

      <section className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[repeat(2,minmax(0,1fr))]">
        <article className="dtsc-panel min-w-0 max-w-full p-4 sm:p-5">
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3"><Activity className="h-5 w-5 shrink-0 text-cyan-600" aria-hidden="true" /><h2 className="break-words text-xl font-black text-dtsc-ink">{t("api")}</h2></div>
            <StatusPill tone={snapshot.api.sampleCount === 0 ? "not-measured" : apiWatch ? "watch" : "measured"} label={snapshot.api.sampleCount === 0 ? t("noSamples") : apiWatch ? t("watch") : t("measured")} />
          </div>
          <div className="mt-4 grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-[repeat(2,minmax(0,1fr))]">
            <Metric label={t("samples")} value={snapshot.api.sampleCount} />
            <Metric label={t("throughput")} value={`${metricValue(snapshot.api.throughput.perMinute)} ${t("requestsPerMinute")}`} />
            <Metric label={`${t("latency")} P50`} value={milliseconds(snapshot.api.latencyMs.p50)} />
            <Metric label={`${t("latency")} P95`} value={milliseconds(snapshot.api.latencyMs.p95)} hint={t("targetApiP95")} />
            <Metric label={`${t("latency")} P99`} value={milliseconds(snapshot.api.latencyMs.p99)} hint={t("targetCriticalP99")} />
            <Metric label={t("errorRate")} value={percent(snapshot.api.serverErrorRate)} hint={t("targetErrorRate")} />
          </div>
          <p className="mt-4 break-words text-xs leading-5 text-dtsc-muted"><strong>{t("coverage")}:</strong> {snapshot.api.coverage}</p>
        </article>

        <article className="dtsc-panel min-w-0 max-w-full p-4 sm:p-5">
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3"><Database className="h-5 w-5 shrink-0 text-cyan-600" aria-hidden="true" /><h2 className="break-words text-xl font-black text-dtsc-ink">{t("database")}</h2></div>
            <StatusPill tone={dbWatch ? "watch" : "measured"} label={dbWatch ? t("watch") : t("measured")} />
          </div>
          <div className="mt-4 grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-[repeat(2,minmax(0,1fr))]">
            <Metric label={t("dbProbe")} value={milliseconds(snapshot.database.probeLatencyMs)} />
            <Metric label={t("utilization")} value={percent(snapshot.database.connectionUtilization)} hint={t("targetNoExhaustion")} />
            <Metric label={t("current")} value={snapshot.database.currentConnections} />
            <Metric label={t("maximum")} value={snapshot.database.maxConnections} />
            <Metric label={t("activeConnections")} value={snapshot.database.activeConnections} />
            <Metric label={t("idleConnections")} value={snapshot.database.idleConnections} />
            <Metric label={t("idleInTransaction")} value={snapshot.database.idleInTransactionConnections} />
            <Metric label={t("longQueries")} value={snapshot.database.longRunningQueries} />
            <Metric label={t("poolingMode")} value={databaseModeLabel} hint={t("pooledHint")} />
            <Metric label={t("connectionLimit")} value={snapshot.database.connectionPolicy.parameters.connectionLimit ?? "—"} />
            <Metric label={t("poolTimeout")} value={snapshot.database.connectionPolicy.parameters.poolTimeoutSeconds == null ? "—" : `${snapshot.database.connectionPolicy.parameters.poolTimeoutSeconds} ${t("seconds")}`} />
            <Metric label={t("connectTimeout")} value={snapshot.database.connectionPolicy.parameters.connectTimeoutSeconds == null ? "—" : `${snapshot.database.connectionPolicy.parameters.connectTimeoutSeconds} ${t("seconds")}`} />
          </div>
        </article>

        <article className="dtsc-panel min-w-0 max-w-full p-4 sm:p-5">
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3"><Bot className="h-5 w-5 shrink-0 text-cyan-600" aria-hidden="true" /><h2 className="break-words text-xl font-black text-dtsc-ink">{t("ai")}</h2></div>
            <StatusPill tone={snapshot.ai.sampleCount === 0 ? "not-measured" : aiWatch ? "watch" : "measured"} label={snapshot.ai.sampleCount === 0 ? t("noSamples") : aiWatch ? t("watch") : t("measured")} />
          </div>
          <div className="mt-4 grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-[repeat(2,minmax(0,1fr))]">
            <Metric label={t("samples")} value={snapshot.ai.sampleCount} />
            <Metric label={t("throughput")} value={`${metricValue(snapshot.ai.throughput.perMinute)} ${t("callsPerMinute")}`} />
            <Metric label={t("success")} value={snapshot.ai.successCount} />
            <Metric label={t("failures")} value={snapshot.ai.failedCount} />
            <Metric label={`${t("latency")} P95`} value={milliseconds(snapshot.ai.latencyMs.p95)} />
            <Metric label={`${t("latency")} P99`} value={milliseconds(snapshot.ai.latencyMs.p99)} hint={t("targetCriticalP99")} />
            <Metric label={t("firstToken")} value={milliseconds(snapshot.ai.latencyMs.firstTokenP95)} />
            <Metric label={t("rateLimitRate")} value={percent(snapshot.ai.rateLimitedRate)} hint={`${t("rateLimited")}: ${snapshot.ai.rateLimitedCount}`} />
          </div>
        </article>

        <article className="dtsc-panel min-w-0 max-w-full p-4 sm:p-5">
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3"><ServerCog className="h-5 w-5 shrink-0 text-cyan-600" aria-hidden="true" /><h2 className="break-words text-xl font-black text-dtsc-ink">{t("redis")}</h2></div>
            <StatusPill tone={redisMeasured ? "measured" : redisWatch ? "watch" : "not-measured"} label={redisMeasured ? t("measured") : redisWatch ? t("watch") : t("notMeasured")} />
          </div>
          <div className="mt-4 grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-[repeat(2,minmax(0,1fr))]">
            <Metric label={t("redisProbe")} value={milliseconds(snapshot.redis.probeLatencyMs)} />
            <Metric label={t("redisPrecision")} value={`${snapshot.redis.bucketPrecisionMinutes} min`} hint={t("hourlyBuckets")} />
            <Metric label={t("presenceRedisLeases")} value={snapshot.redis.presence.redisLeaseCount} />
            <Metric label={t("presenceRedisReads")} value={snapshot.redis.presence.redisReadCount} />
            <Metric label={t("presenceDbCheckpoints")} value={snapshot.redis.presence.dbCheckpointCount} />
            <Metric label={t("presenceDbFallbacks")} value={snapshot.redis.presence.dbFallbackCount} />
            <Metric label={`${t("redisFirstRate")} · ${t("redis")}`} value={percent(snapshot.redis.presence.redisFirstRate)} />
            <Metric label={t("callRedisReads")} value={snapshot.redis.calls.redisInboxReadCount} />
            <Metric label={t("callRedisPublishes")} value={snapshot.redis.calls.redisPublishCount} />
            <Metric label={t("callDbReconciliations")} value={snapshot.redis.calls.dbReconciliationCount} />
            <Metric label={t("callDbFallbacks")} value={snapshot.redis.calls.dbFallbackCount} />
            <Metric label={t("callSettingsDb")} value={snapshot.redis.calls.settingsDbLoadCount} />
            <Metric label={`${t("redisFirstRate")} · ${t("callRedisReads")}`} value={percent(snapshot.redis.calls.redisFirstRate)} />
            <Metric label={t("callDbReadRate")} value={percent(snapshot.redis.calls.dbReadRate)} />
          </div>
          <p className="mt-4 break-words text-xs leading-5 text-dtsc-muted"><strong>{t("coverage")}:</strong> {t("redisSourceHint")}</p>
          {!redisMeasured ? <p className="mt-3 break-words rounded-xl border border-amber-300/60 bg-amber-50 p-3 text-sm font-semibold text-amber-900 dark:border-amber-600/40 dark:bg-amber-950/30 dark:text-amber-100">{t("redisUnavailable")}</p> : null}
        </article>

        <article className="dtsc-panel min-w-0 max-w-full p-4 sm:p-5">
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3"><ShieldCheck className="h-5 w-5 shrink-0 text-cyan-600" aria-hidden="true" /><h2 className="break-words text-xl font-black text-dtsc-ink">{t("rateLimit")}</h2></div>
            <StatusPill tone={rateLimitWatch ? "watch" : "measured"} label={rateLimitWatch ? t("watch") : t("measured")} />
          </div>
          <div className="mt-4 grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-[repeat(2,minmax(0,1fr))]">
            <Metric label={t("distributedLimiter")} value={rateLimitWatch ? t("degraded") : t("available")} />
            <Metric label={t("rateLimitPolicies")} value={snapshot.rateLimit.policyRules.total} />
            <Metric label={t("securityCritical")} value={snapshot.rateLimit.policyRules.securityCritical} />
            <Metric label={t("costCritical")} value={snapshot.rateLimit.policyRules.costCritical} />
            <Metric label={t("availabilityBalanced")} value={snapshot.rateLimit.policyRules.availabilityBalanced} />
            <Metric label={t("availabilityFirst")} value={snapshot.rateLimit.policyRules.availabilityFirst} />
            <Metric label={t("defaultFailureMode")} value={snapshot.rateLimit.defaultFailureMode === "local" ? t("localFallback") : snapshot.rateLimit.defaultFailureMode} />
            <Metric label={t("fallbackAggregation")} value={`${Math.round(snapshot.rateLimit.fallbackAggregationWindowMs / 1000)} ${t("seconds")}`} />
          </div>
          <p className="mt-4 break-words text-xs leading-5 text-dtsc-muted"><strong>{t("coverage")}:</strong> {t("rateLimitSourceHint")}</p>
        </article>

        <article className="dtsc-panel min-w-0 max-w-full p-4 sm:p-5">
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3"><ListTodo className="h-5 w-5 shrink-0 text-cyan-600" aria-hidden="true" /><h2 className="break-words text-xl font-black text-dtsc-ink">{t("queues")}</h2></div>
            <StatusPill tone={queueWatch ? "watch" : "measured"} label={queueWatch ? t("watch") : t("measured")} />
          </div>
          <div className="mt-4 grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-[repeat(2,minmax(0,1fr))]">
            <Metric label={t("queueReady")} value={snapshot.queues.ready} />
            <Metric label={t("queueProcessing")} value={snapshot.queues.processing} />
            <Metric label={t("queueDead")} value={snapshot.queues.dead} />
            <Metric label={t("oldestReadyAge")} value={elapsed(snapshot.queues.oldestReadyAgeMs, t("seconds"))} />
          </div>
          <p className="mt-4 break-words text-xs leading-5 text-dtsc-muted"><strong>{t("coverage")}:</strong> {t("queueSourceHint")}</p>
        </article>

        <article className="dtsc-panel min-w-0 max-w-full p-4 sm:p-5 xl:col-span-2">
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3"><Layers3 className="h-5 w-5 shrink-0 text-cyan-600" aria-hidden="true" /><h2 className="break-words text-xl font-black text-dtsc-ink">{t("readCache")}</h2></div>
            <StatusPill tone={cacheSamples === 0 ? "not-measured" : cacheWatch ? "watch" : "measured"} label={cacheSamples === 0 ? t("noSamples") : cacheWatch ? t("watch") : t("measured")} />
          </div>
          <div className="mt-4 grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 xl:grid-cols-[repeat(3,minmax(0,1fr))]">
            <CacheGroup title={t("financeOverviewCache")} requests={snapshot.readCache.finance.requests} hit={snapshot.readCache.finance.hit} miss={snapshot.readCache.finance.miss} fallback={snapshot.readCache.finance.fallback} hitRate={snapshot.readCache.finance.hitRate} locale={locale} />
            <CacheGroup title={t("retailOrganizationCache")} requests={snapshot.readCache.retail.requests} hit={snapshot.readCache.retail.organization.hit} miss={snapshot.readCache.retail.organization.miss} fallback={snapshot.readCache.retail.organization.fallback} hitRate={snapshot.readCache.retail.organization.hitRate} locale={locale} />
            <CacheGroup title={t("retailPeriodCache")} requests={snapshot.readCache.retail.requests} hit={snapshot.readCache.retail.period.hit} miss={snapshot.readCache.retail.period.miss} fallback={snapshot.readCache.retail.period.fallback} bypass={snapshot.readCache.retail.period.bypass} hitRate={snapshot.readCache.retail.period.hitRate} locale={locale} />
          </div>
          <p className="mt-4 break-words text-xs leading-5 text-dtsc-muted"><strong>{t("coverage")}:</strong> {t("readCacheSourceHint")}</p>
        </article>
      </section>

      <section className="dtsc-panel min-w-0 max-w-full p-4 sm:p-5">
        <div className="flex min-w-0 items-center gap-3"><Gauge className="h-5 w-5 shrink-0 text-cyan-600" aria-hidden="true" /><h2 className="break-words text-xl font-black text-dtsc-ink">{t("target")}</h2></div>
        <div className="mt-4 grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-[repeat(2,minmax(0,1fr))] lg:grid-cols-[repeat(4,minmax(0,1fr))]">
          {[t("targetApiP95"), t("targetCriticalP99"), t("targetErrorRate"), t("targetNoExhaustion")].map((target) => <div key={target} className="min-w-0 rounded-2xl border border-dtsc-border bg-dtsc-surface p-4"><p className="break-words font-black text-dtsc-ink">{target}</p></div>)}
        </div>
        <p className="mt-4 break-words rounded-2xl border border-cyan-200 bg-cyan-50 p-4 text-sm font-semibold leading-6 text-cyan-950 dark:border-cyan-800 dark:bg-cyan-950/30 dark:text-cyan-100">{t("notCertification")}</p>
        <p className="mt-3 break-words text-xs leading-5 text-dtsc-muted">{t("generatedAt")}: {new Intl.DateTimeFormat(locale === "en" ? "en" : "fr", { dateStyle: "medium", timeStyle: "medium" }).format(new Date(snapshot.generatedAt))}</p>
      </section>
    </div>
  );
}
