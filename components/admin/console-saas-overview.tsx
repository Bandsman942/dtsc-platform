import Link from "next/link";
import { AlertTriangle, Building2, CreditCard, Gauge, Layers3, ShieldCheck, Ticket, Users } from "lucide-react";
import { StatCard } from "@/components/dashboard/stat-card";

type ConsoleMetric = {
  label: string;
  value: number | string;
  helper: string;
  icon: "organizations" | "subscriptions" | "expiring" | "tickets" | "critical" | "users" | "modules" | "platform";
};

type ConsoleEvent = {
  id: string;
  title: string;
  detail: string;
  createdAt: string;
  severity: string;
};

type ConsoleSaasOverviewProps = {
  metrics: ConsoleMetric[];
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

export function ConsoleSaasOverview({ metrics, incidents, sensitiveAudits, securityEvents }: ConsoleSaasOverviewProps) {
  return (
    <section className="min-w-0 space-y-5">
      <div className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => {
          const Icon = icons[metric.icon];
          return <StatCard key={metric.label} label={metric.label} value={metric.value} helper={metric.helper} icon={Icon} />;
        })}
      </div>

      <div className="grid min-w-0 gap-4 xl:grid-cols-3">
        <ConsoleEventPanel title="Incidents récents" description="Erreurs API et webhooks à surveiller." events={incidents} href="/admin?section=audits" />
        <ConsoleEventPanel title="Activités audit sensibles" description="Actions critiques ou à forte portée opérationnelle." events={sensitiveAudits} href="/admin?section=audits" />
        <ConsoleEventPanel title="Événements sécurité récents" description="Signaux d'accès refusé, rôles, permissions et authentification." events={securityEvents} href="/admin?section=audits" />
      </div>
    </section>
  );
}

function ConsoleEventPanel({ title, description, events, href }: { title: string; description: string; events: ConsoleEvent[]; href: string }) {
  return (
    <article className="dtsc-card min-w-0 overflow-hidden p-4 sm:p-5">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="break-words text-xs font-black uppercase tracking-[0.16em] text-cyan-600">{title}</p>
          <p className="mt-2 text-sm leading-6 text-dtsc-muted">{description}</p>
        </div>
        <ShieldCheck className="h-5 w-5 shrink-0 text-cyan-500" />
      </div>
      <div className="mt-4 max-h-72 min-w-0 space-y-3 overflow-y-auto pr-1">
        {events.map((event) => (
          <div key={event.id} className="min-w-0 overflow-hidden rounded-2xl border border-dtsc-border bg-dtsc-page p-3">
            <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <p className="min-w-0 break-words text-sm font-black leading-snug text-dtsc-ink [overflow-wrap:anywhere]">{event.title}</p>
              <span className="max-w-full shrink-0 self-start break-words rounded-full bg-dtsc-soft px-2 py-1 text-center text-[0.62rem] font-black uppercase tracking-[0.08em] text-dtsc-blue">
                {event.severity}
              </span>
            </div>
            <p className="mt-1 line-clamp-2 break-words text-xs leading-5 text-dtsc-muted [overflow-wrap:anywhere]">{event.detail}</p>
            <p className="mt-2 break-words text-[0.68rem] font-bold text-dtsc-muted">{new Date(event.createdAt).toLocaleString("fr-FR")}</p>
          </div>
        ))}
        {!events.length && <p className="rounded-2xl bg-dtsc-page p-3 text-sm text-dtsc-muted">Aucun signal récent dans cette catégorie.</p>}
      </div>
      <Link href={href} className="mt-4 inline-flex max-w-full justify-center rounded-full border border-dtsc-border px-4 py-2 text-center text-xs font-black text-dtsc-blue hover:bg-dtsc-soft">
        Voir les journaux
      </Link>
    </article>
  );
}
