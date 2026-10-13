import Link from "next/link";
import { Activity, ArrowUpRight, CircleHelp, Clock3, PlugZap, ShieldCheck } from "lucide-react";
import type { ConsoleAiDataset } from "@/lib/console/console-ai";
import { getConsoleSectionHref } from "@/lib/console/console-routes";

type Locale = "fr" | "en";

function displayNumber(value: number | null | undefined, locale: Locale) {
  return value === null || value === undefined ? "—" : new Intl.NumberFormat(locale === "en" ? "en-US" : "fr-FR", { maximumFractionDigits: 1 }).format(value);
}

function formatMoment(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "UTC" }).format(new Date(value)) + " UTC";
}

const PERIODS = [1, 7, 30, 90] as const;

export function ConsoleAiOverview({ data, locale, days }: { data: ConsoleAiDataset; locale: Locale; days: number }) {
  const en = locale === "en";
  const t = (fr: string, english: string) => en ? english : fr;
  const m = data.metrics;
  const periodLabel = days === 1 ? t("24 heures", "24 hours") : t(`${days} jours`, `${days} days`);
  const sourceMeta = (source: string, unit: string) => `${source} · ${unit} · ${periodLabel}`;
  const metrics = [
    { label: t("Appels IA", "Model calls"), value: displayNumber(m?.calls, locale), description: t("Appels réellement enregistrés, pas tentatives fournisseur.", "Recorded model calls, not provider attempts."), meta: sourceMeta("AiModelCall", t("appels", "calls")) },
    { label: t("Tokens", "Tokens"), value: displayNumber(m?.tokens, locale), description: t("Tokens des appels modèle réussis.", "Tokens from successful model calls."), meta: sourceMeta("AiModelCall.totalTokens", "tokens") },
    { label: t("Coût estimé USD", "Estimated USD cost"), value: m?.usdCost === null || m?.usdCost === undefined ? "—" : `${m.usdCost.toFixed(4)} USD`, description: m?.costCoverage === null || m?.costCoverage === undefined ? t("Couverture tarifaire inconnue.", "Pricing coverage unknown.") : t(`Couverture : ${m.costCoverage} % des appels réussis.`, `Coverage: ${m.costCoverage}% of successful calls.`), meta: sourceMeta("AiModelCall.estimatedCost", "USD") },
    { label: t("Succès", "Success rate"), value: m?.successRate === null || m?.successRate === undefined ? "—" : `${m.successRate} %`, description: t("Appels réussis / appels terminés ; sans échantillon : inconnu.", "Successful / completed calls; unknown without a sample."), meta: sourceMeta("AiModelCall.status", "%") },
    { label: t("Latence P95", "P95 latency"), value: m?.p95Ms === null || m?.p95Ms === undefined ? "—" : `${displayNumber(m.p95Ms, locale)} ms`, description: t("Durée au 95e percentile des appels réussis.", "95th percentile duration for successful calls."), meta: sourceMeta("AiModelCall.durationMs", "ms") },
    { label: t("Outils MCP opérationnels", "Operational MCP tools"), value: "—", description: t("Non mesuré : une certification ou un binding ne prouve pas l'accès distant.", "Not measured: certification or binding does not prove remote access."), meta: t("Contrôle E2E requis · état inconnu", "E2E check required · unknown") },
  ];

  return (
    <section className="min-w-0 space-y-4" aria-label={t("Pilotage de l'intelligence artificielle", "AI operations control")}>
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-black text-dtsc-ink">{t("Infrastructure IA", "AI infrastructure")}</h2>
          <p className="mt-1 max-w-3xl text-sm text-dtsc-muted">{t("Activité mesurée sur les systèmes de génération et les agents. Les données privées des utilisateurs ne sont pas affichées.", "Operational telemetry for model calls and agents. Private user data is never shown.")}</p>
        </div>
        <div className="flex max-w-full flex-wrap gap-1.5" role="group" aria-label={t("Période", "Period")}>
          {PERIODS.map((period) => (
            <Link
              key={period}
              href={getConsoleSectionHref("ai-control-center", { period })}
              aria-current={days === period ? "page" : undefined}
              className={`inline-flex min-h-10 items-center justify-center rounded-xl border px-3 text-xs font-bold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-500 ${days === period ? "border-cyan-500 bg-cyan-600 text-white" : "border-dtsc-border bg-dtsc-surface text-dtsc-ink hover:border-cyan-400"}`}
            >{period === 1 ? "24 h" : `${period} j`}</Link>
          ))}
        </div>
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {metrics.map((metric) => (
          <article key={metric.label} className="dtsc-card min-w-0 overflow-hidden p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-dtsc-muted">{metric.label}</p>
            <p className="mt-2 break-words text-2xl font-black text-dtsc-ink">{metric.value}</p>
            <p className="mt-2 min-h-8 text-xs leading-5 text-dtsc-muted">{metric.description}</p>
            <p className="mt-3 break-words border-t border-dtsc-border pt-2 text-[0.67rem] leading-5 text-dtsc-muted">{metric.meta}</p>
          </article>
        ))}
      </div>
      <p className="flex flex-wrap items-center gap-2 text-xs text-dtsc-muted"><Clock3 className="h-4 w-4 shrink-0" /> {t("Actualisé", "Refreshed")}: {formatMoment(data.period.refreshedAt, locale)} · {t("Début", "From")}: {formatMoment(data.period.from, locale)} · {t("Fin exclue", "Until (exclusive)")}: {formatMoment(data.period.to, locale)}</p>

      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        <article className="dtsc-card min-w-0 overflow-hidden p-4">
          <h3 className="flex items-center gap-2 text-base font-black text-dtsc-ink"><Activity className="h-4 w-4" />{t("Fournisseurs", "Providers")}</h3>
          <p className="mt-1 text-xs text-dtsc-muted">{t("Appels, sans additionner les tentatives ni les étapes d'agent.", "Model calls, without adding provider attempts or agent steps.")}</p>
          {data.providers === null ? <p className="mt-4 text-sm text-amber-600">{t("Indicateurs indisponibles.", "Metrics unavailable.")}</p>
            : data.providers.length === 0 ? <p className="mt-4 text-sm text-dtsc-muted">{t("Aucun appel enregistré sur cette période.", "No recorded calls in this period.")}</p>
            : <div className="mt-3 max-w-full overflow-x-auto"><table className="w-full min-w-[22rem] text-left text-sm"><thead><tr className="border-b border-dtsc-border text-xs text-dtsc-muted"><th className="py-2">{t("Fournisseur", "Provider")}</th><th className="py-2 text-right">{t("Appels", "Calls")}</th><th className="py-2 text-right">{t("Réussis", "Success")}</th><th className="py-2 text-right">{t("Échecs", "Failed")}</th></tr></thead><tbody>{data.providers.map((row) => <tr key={row.provider} className="border-b border-dtsc-border/50"><th scope="row" className="break-words py-2 font-medium text-dtsc-ink">{row.provider}</th><td className="py-2 text-right">{displayNumber(row.calls, locale)}</td><td className="py-2 text-right">{displayNumber(row.successful, locale)}</td><td className="py-2 text-right">{displayNumber(row.failed, locale)}</td></tr>)}</tbody></table></div>}
          <p className="mt-3 text-xs text-dtsc-muted">{t("Source", "Source")}: AiModelCall.providerCode · {periodLabel}</p>
        </article>
        <article className="dtsc-card min-w-0 p-4">
          <h3 className="flex items-center gap-2 text-base font-black text-dtsc-ink"><ShieldCheck className="h-4 w-4" />{t("Exécutions Agent", "Agent runs")}</h3>
          <p className="mt-1 text-xs text-dtsc-muted">{t("Départs de runs sur la période ; jamais additionnés aux appels modèle.", "Runs started during the period; never added to model calls.")}</p>
          <dl className="mt-3 grid grid-cols-2 gap-3">
            {[
              [t("Démarrés", "Started"), data.agent?.runs],
              [t("Terminés", "Completed"), data.agent?.completed],
              [t("Budget épuisé", "Budget exhausted"), data.agent?.budgetExhausted],
              [t("Échoués", "Failed"), data.agent?.failures],
            ].map(([label, value]) => <div key={String(label)} className="rounded-xl bg-dtsc-page p-3"><dt className="text-xs text-dtsc-muted">{label}</dt><dd className="mt-1 text-xl font-black text-dtsc-ink">{displayNumber(value as number | null | undefined, locale)}</dd></div>)}
          </dl>
          <p className="mt-3 text-xs text-dtsc-muted">{t("Source", "Source")}: AiAgentRun.status · {periodLabel}</p>
        </article>
      </div>

      <article className="dtsc-card min-w-0 p-4">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
          <h3 className="flex items-center gap-2 text-base font-black text-dtsc-ink"><PlugZap className="h-4 w-4" />{t("Intégrations MCP", "MCP integrations")}</h3>
          <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 px-2.5 py-1 text-xs font-bold text-amber-700 dark:text-amber-300"><CircleHelp className="h-3.5 w-3.5" />{t("Disponibilité non mesurée", "Availability not measured")}</span>
        </div>
        <dl className="mt-3 flex flex-wrap gap-6 text-sm">
          <div><dt className="text-xs text-dtsc-muted">{t("Serveurs certifiés", "Certified servers")}</dt><dd className="mt-1 text-xl font-black text-dtsc-ink">{displayNumber(data.mcp?.certifiedServers, locale)}</dd></div>
          <div><dt className="text-xs text-dtsc-muted">{t("Bindings activés", "Enabled bindings")}</dt><dd className="mt-1 text-xl font-black text-dtsc-ink">{displayNumber(data.mcp?.enabledBindings, locale)}</dd></div>
          <div><dt className="text-xs text-dtsc-muted">{t("Outils utilisables", "Usable tools")}</dt><dd className="mt-1 text-xl font-black text-dtsc-ink">—</dd></div>
        </dl>
        <p className="mt-3 text-xs text-dtsc-muted">{t("Une certification et un binding sont des configurations, pas une preuve OAuth ou un test réseau réussi.", "Certification and binding are configuration, not proof of OAuth or a successful network check.")}</p>
        <Link href="/ai/apps" className="mt-3 inline-flex min-h-10 items-center gap-1 rounded-xl border border-dtsc-border px-3 text-xs font-bold text-dtsc-blue hover:border-cyan-500">{t("Voir le catalogue utilisateur", "View user-facing catalog")}<ArrowUpRight className="h-4 w-4" /></Link>
      </article>
    </section>
  );
}
