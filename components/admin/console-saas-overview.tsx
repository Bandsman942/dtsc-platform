import Link from "next/link";
import { AlertTriangle, Building2, Clock3, CreditCard, Database, Gauge, Layers3, ShieldCheck, Ticket, Users } from "lucide-react";
import type { ConsoleActionItem, ConsoleHealthSignal, ConsoleMetric } from "@/lib/console/console-overview";

export type ConsoleEvent = {
  id: string;
  title: string;
  detail: string;
  createdAt: string;
  severity: string;
};

type ConsoleSaasOverviewProps = {
  metrics: ConsoleMetric[];
  actionQueue: ConsoleActionItem[];
  healthSignals: ConsoleHealthSignal[];
  incidents: ConsoleEvent[];
  sensitiveAudits: ConsoleEvent[];
  securityEvents: ConsoleEvent[];
};

const icons = {
  organizations: Building2,
  subscriptions: CreditCard,
  expiring: AlertTriangle,
  tickets: Ticket,
  critical: AlertTriangle,
  users: Users,
  modules: Layers3,
  platform: Gauge,
} as const;

export function ConsoleSaasOverview({ metrics, actionQueue, healthSignals, incidents, sensitiveAudits, securityEvents }: ConsoleSaasOverviewProps) {
  return (
    <section className="min-w-0 max-w-full space-y-5">
      <div className="max-w-full overflow-x-auto overscroll-x-contain pb-2" aria-label="Indicateurs principaux de la Console">
        <div className="flex min-w-max snap-x snap-mandatory gap-4 lg:grid lg:min-w-0 lg:grid-cols-4 xl:grid-cols-5">
          {metrics.map((metric) => {
            const Icon = icons[metric.icon];
            return (
              <Link
                key={metric.code}
                href={metric.href}
                className="dtsc-card w-[min(82vw,19rem)] shrink-0 snap-start overflow-hidden p-4 transition hover:-translate-y-0.5 hover:border-cyan-300 lg:w-auto"
              >
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="break-words text-xs font-black uppercase tracking-[0.12em] text-dtsc-muted">{metric.label}</p>
                    <p className="mt-2 break-words text-2xl font-black text-dtsc-ink">{metric.value}</p>
                  </div>
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-dtsc-soft text-dtsc-blue"><Icon className="h-4 w-4" /></span>
                </div>
                <p className="mt-3 break-words text-xs leading-5 text-dtsc-muted">{metric.helper}</p>
                <dl className="mt-3 space-y-1 border-t border-dtsc-border pt-3 text-[0.7rem] leading-5 text-dtsc-muted">
                  <div className="flex min-w-0 justify-between gap-3"><dt className="font-black">Source</dt><dd className="min-w-0 break-words text-right">{metric.source}</dd></div>
                  <div className="flex min-w-0 justify-between gap-3"><dt className="font-black">Période</dt><dd className="min-w-0 break-words text-right">{metric.period}</dd></div>
                  <div className="flex min-w-0 justify-between gap-3"><dt className="font-black">Unité</dt><dd className="min-w-0 break-words text-right">{metric.unit}</dd></div>
                </dl>
                <p className="mt-2 flex min-w-0 items-center gap-1 text-[0.68rem] font-semibold text-dtsc-muted"><Clock3 className="h-3 w-3 shrink-0" /><span className="min-w-0 break-words">{formatDateTime(metric.freshness)}</span></p>
              </Link>
            );
          })}
        </div>
      </div>

      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <ActionQueue actions={actionQueue} />
        <PlatformHealth signals={healthSignals} />
      </div>

      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-3">
        <ConsoleEventPanel title="Incidents récents" description="Incidents persistés et signaux techniques réels." events={incidents} href="/admin/security-audit?source=API" />
        <ConsoleEventPanel title="Activités audit sensibles" description="Actions critiques ou à forte portée opérationnelle." events={sensitiveAudits} href="/admin/security-audit?source=AUDIT" />
        <ConsoleEventPanel title="Événements de sécurité" description="Accès refusés, authentification et alertes." events={securityEvents} href="/admin/security-audit?source=AUDIT&result=SECURITY" />
      </div>
    </section>
  );
}

function ActionQueue({ actions }: { actions: ConsoleActionItem[] }) {
  return (
    <article className="dtsc-card min-w-0 max-w-full overflow-hidden p-4 sm:p-5">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-cyan-600">Centre d’actions</p>
          <h2 className="mt-1 break-words text-lg font-black text-dtsc-ink">Décisions administratives attendues</h2>
        </div>
        <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500" />
      </div>
      <div className="mt-4 space-y-2">
        {actions.map((action) => (
          <Link key={action.id} href={action.href} className="flex min-w-0 items-start justify-between gap-3 rounded-2xl border border-dtsc-border bg-dtsc-page p-3 transition hover:border-cyan-300">
            <span className="min-w-0">
              <span className="flex min-w-0 flex-wrap items-center gap-2">
                <span className={`rounded-full px-2.5 py-1 text-[0.65rem] font-black ${priorityClassName(action.priority)}`}>{action.priority}</span>
                <span className="break-words text-sm font-black text-dtsc-ink">{action.title}</span>
              </span>
              <span className="mt-1 block break-words text-xs leading-5 text-dtsc-muted">{action.detail}</span>
              <span className="mt-1 block break-all text-[0.68rem] font-semibold text-dtsc-muted">{action.source} · {action.capability}</span>
            </span>
            <span className="shrink-0 rounded-xl bg-[#001736] px-3 py-2 text-sm font-black text-white">{action.count}</span>
          </Link>
        ))}
        {!actions.length ? <p className="rounded-2xl border border-dashed border-dtsc-border bg-dtsc-page p-5 text-sm text-dtsc-muted">Aucune action critique calculée à partir des sources disponibles.</p> : null}
      </div>
    </article>
  );
}

function PlatformHealth({ signals }: { signals: ConsoleHealthSignal[] }) {
  return (
    <article className="dtsc-card min-w-0 max-w-full overflow-hidden p-4 sm:p-5">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-cyan-600">Santé plateforme</p>
          <h2 className="mt-1 break-words text-lg font-black text-dtsc-ink">Signaux observables</h2>
        </div>
        <Database className="h-5 w-5 shrink-0 text-cyan-600" />
      </div>
      <div className="mt-4 max-w-full overflow-x-auto rounded-2xl border border-dtsc-border">
        <table className="w-full min-w-[42rem] text-left text-sm">
          <thead className="bg-dtsc-page text-xs uppercase tracking-[0.1em] text-dtsc-muted"><tr><th className="px-3 py-3">Composant</th><th className="px-3 py-3">Statut</th><th className="px-3 py-3">Signal réel</th><th className="px-3 py-3">Actualisé</th></tr></thead>
          <tbody className="divide-y divide-dtsc-border">
            {signals.map((signal) => (
              <tr key={signal.code}>
                <td className="px-3 py-3 font-black text-dtsc-ink">{signal.label}</td>
                <td className="px-3 py-3"><span className={`rounded-full px-2.5 py-1 text-[0.65rem] font-black ${healthClassName(signal.status)}`}>{signal.status}</span></td>
                <td className="max-w-md px-3 py-3"><p className="break-words text-dtsc-muted">{signal.detail}</p><p className="mt-1 break-words text-[0.68rem] font-semibold text-dtsc-muted">{signal.source}</p></td>
                <td className="whitespace-nowrap px-3 py-3 text-xs text-dtsc-muted">{formatDateTime(signal.checkedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}

function ConsoleEventPanel({ title, description, events, href }: { title: string; description: string; events: ConsoleEvent[]; href: string }) {
  return (
    <article className="dtsc-card min-w-0 max-w-full overflow-hidden p-4 sm:p-5">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0"><h2 className="break-words font-black text-dtsc-ink">{title}</h2><p className="mt-1 break-words text-xs leading-5 text-dtsc-muted">{description}</p></div>
        <ShieldCheck className="h-5 w-5 shrink-0 text-cyan-600" />
      </div>
      <div className="mt-4 space-y-2">
        {events.map((event) => (
          <div key={`${event.id}-${event.createdAt}`} className="min-w-0 rounded-2xl border border-dtsc-border bg-dtsc-page p-3">
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-2"><p className="min-w-0 break-words text-sm font-black text-dtsc-ink">{event.title}</p><span className={`rounded-full px-2.5 py-1 text-[0.65rem] font-black ${severityClassName(event.severity)}`}>{event.severity}</span></div>
            <p className="mt-1 break-words text-xs leading-5 text-dtsc-muted">{event.detail}</p><p className="mt-1 text-[0.68rem] text-dtsc-muted">{formatDateTime(event.createdAt)}</p>
          </div>
        ))}
        {!events.length ? <p className="rounded-2xl border border-dashed border-dtsc-border bg-dtsc-page p-4 text-sm text-dtsc-muted">Aucun événement correspondant.</p> : null}
      </div>
      <Link href={href} className="mt-4 inline-flex min-h-10 items-center rounded-xl border border-dtsc-border px-4 text-sm font-black text-dtsc-blue hover:bg-dtsc-soft">Ouvrir la section</Link>
    </article>
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function severityClassName(value: string) {
  if (/CRITICAL|MAJOR/i.test(value)) return "bg-red-900 text-white";
  if (/ERROR|FAILED|HIGH/i.test(value)) return "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-200";
  if (/WARNING|MEDIUM|DEGRADED/i.test(value)) return "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200";
  if (/SUCCESS|OPERATIONAL|LOW/i.test(value)) return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200";
  return "bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-200";
}

function priorityClassName(value: ConsoleActionItem["priority"]) { return severityClassName(value); }
function healthClassName(value: ConsoleHealthSignal["status"]) { return severityClassName(value); }
