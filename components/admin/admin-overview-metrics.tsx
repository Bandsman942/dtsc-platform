import Link from "next/link";
import { Activity, BarChart3, CreditCard, FileText, Gauge, Mail, MessageSquare, ShieldCheck, Ticket, Users, type LucideIcon } from "lucide-react";
import { StatCard } from "@/components/dashboard/stat-card";

type MetricPoint = {
  label: string;
  value: number;
};

type BreakdownItem = {
  label: string;
  value: number;
};

type TopModel = {
  model: string;
  count: number;
  tokens: number;
};

type AdminOverviewMetricsProps = {
  selectedPeriod: number;
  selectedDate?: string;
  totals: {
    users: number;
    activeUsers: number;
    conversations: number;
    messages: number;
    tokens: number;
  };
  period: {
    users: number;
    conversations: number;
    messages: number;
    tokens: number;
    tickets: number;
    resolvedTickets: number;
    visits: number;
    contacts: number;
    subscribers: number;
    payments: number;
    revenue: number;
    apiErrors: number;
    readyDocuments: number;
    publishedPublications: number;
    draftPublications: number;
  };
  series: {
    visits: MetricPoint[];
    messages: MetricPoint[];
    tokens: MetricPoint[];
  };
  breakdowns: {
    roles: BreakdownItem[];
    tickets: BreakdownItem[];
    payments: BreakdownItem[];
  };
  topModels: TopModel[];
};

export function AdminOverviewMetrics({
  selectedPeriod,
  selectedDate,
  totals,
  period,
  series,
  breakdowns,
  topModels,
}: AdminOverviewMetricsProps) {
  const periodLabel = selectedDate ? `le ${formatCompactDate(selectedDate)}` : `sur ${selectedPeriod} jours`;

  return (
    <div className="space-y-5">
      <section className="dtsc-card p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.18em] text-cyan-600">Vue générale</p>
            <h2 className="mt-2 text-2xl font-black text-dtsc-ink">Indicateurs de pilotage {periodLabel}</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-dtsc-muted">
              Filtrez la période pour suivre les comptes, l&apos;usage IA, les visites, les tickets, les paiements et les contenus publics avec des données recalculées à chaque chargement.
            </p>
          </div>
          <form action="/admin" className="grid gap-3 rounded-2xl border border-dtsc-border bg-dtsc-page p-3 sm:grid-cols-[1fr_1fr_auto]">
            <input type="hidden" name="section" value="overview" />
            <label className="grid gap-1 text-xs font-black uppercase tracking-[0.12em] text-dtsc-muted">
              Période
              <select name="period" defaultValue={String(selectedPeriod)} className="h-11 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-bold text-dtsc-ink">
                {[7, 30, 90, 200].map((days) => (
                  <option key={days} value={days}>{days} jours</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-xs font-black uppercase tracking-[0.12em] text-dtsc-muted">
              Date précise
              <input type="date" name="date" defaultValue={selectedDate || ""} className="h-11 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-bold text-dtsc-ink" />
            </label>
            <button className="rounded-xl bg-[#002b5b] px-5 py-3 text-sm font-black text-white shadow-[0_12px_28px_rgba(0,43,91,0.25)] transition hover:bg-[#001736]">
              Filtrer
            </button>
          </form>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {[7, 30, 90, 200].map((days) => (
            <Link
              key={days}
              href={`/admin?section=overview&period=${days}`}
              className={`rounded-full border px-4 py-2 text-sm font-black transition ${!selectedDate && selectedPeriod === days ? "border-cyan-300 bg-dtsc-blue text-white" : "border-dtsc-border bg-dtsc-surface text-dtsc-ink hover:border-cyan-300"}`}
            >
              {days} jours
            </Link>
          ))}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Utilisateurs" value={totals.users} helper={`${totals.activeUsers} actifs · ${period.users} nouveaux`} icon={Users} />
        <StatCard label="Conversations" value={totals.conversations} helper={`${period.conversations} nouvelles ${periodLabel}`} icon={MessageSquare} />
        <StatCard label="Messages" value={totals.messages} helper={`${period.messages} messages ${periodLabel}`} icon={MessageSquare} />
        <StatCard label="Tokens IA" value={totals.tokens} helper={`${period.tokens} tokens ${periodLabel}`} icon={BarChart3} />
        <StatCard label="Visites" value={period.visits} helper={`Audience publique ${periodLabel}`} icon={Activity} />
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <MiniChart title="Visites publiques" points={series.visits} tone="cyan" />
        <MiniChart title="Messages chatbot" points={series.messages} tone="blue" />
        <MiniChart title="Tokens consommés" points={series.tokens} tone="emerald" />
      </section>

      <section className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
        <KpiPanel
          icon={Ticket}
          title="Support"
          lines={[
            `${period.tickets} ticket(s) créés ${periodLabel}`,
            `${period.resolvedTickets} ticket(s) résolus ${periodLabel}`,
          ]}
          items={breakdowns.tickets}
        />
        <KpiPanel
          icon={CreditCard}
          title="Paiements"
          lines={[
            `${period.payments} paiement(s) confirmé(s) ${periodLabel}`,
            `${period.revenue.toFixed(2)} USD de revenu suivi`,
          ]}
          items={breakdowns.payments}
        />
        <KpiPanel
          icon={Mail}
          title="Prospects & comptes"
          lines={[
            `${period.contacts} demande(s) de contact`,
            `${period.subscribers} nouvel(le)s abonné(e)s newsletter`,
          ]}
          items={breakdowns.roles}
        />
        <KpiPanel
          icon={FileText}
          title="Contenus & documents"
          lines={[
            `${period.publishedPublications} publication(s) publique(s)`,
            `${period.draftPublications} brouillon(s), ${period.readyDocuments} document(s) prêt(s)`,
          ]}
          items={topModels.map((model) => ({ label: model.model, value: model.tokens || model.count }))}
        />
      </section>

      <section className="rounded-2xl border border-dtsc-border bg-[#001736] p-6 text-white">
        <div className="flex items-start gap-3">
          <ShieldCheck className="h-5 w-5 text-cyan-300" />
          <div>
            <h2 className="font-black">Points de vigilance opérationnels</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <Signal label="Erreurs API" value={period.apiErrors} helper="À surveiller dans Audits" />
              <Signal label="Conversion prospects" value={period.contacts + period.subscribers} helper="Contacts + newsletter" />
              <Signal label="Intensité IA" value={period.tokens} helper="Tokens sur la période" />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function MiniChart({ title, points, tone }: { title: string; points: MetricPoint[]; tone: "cyan" | "blue" | "emerald" }) {
  const max = Math.max(1, ...points.map((point) => point.value));
  const colorClass = tone === "cyan" ? "bg-cyan-400" : tone === "blue" ? "bg-blue-500" : "bg-emerald-400";

  return (
    <article className="dtsc-card overflow-hidden p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-black text-dtsc-ink">{title}</h3>
        <Gauge className="h-4 w-4 text-cyan-500" />
      </div>
      <div className="mt-4 h-48 overflow-x-auto rounded-2xl border border-dtsc-border bg-dtsc-page p-3">
        <div className="flex h-full min-w-max items-end gap-2">
          {points.map((point) => (
            <div key={`${title}-${point.label}`} className="flex h-full w-10 shrink-0 flex-col items-center justify-end gap-2">
              <span className="text-xs font-black text-dtsc-ink">{point.value}</span>
              <div className="flex h-28 w-7 items-end rounded-full bg-dtsc-surface">
                <div className={`w-full rounded-full ${colorClass}`} style={{ height: `${Math.max(6, (point.value / max) * 100)}%` }} />
              </div>
              <span className="text-[10px] font-bold text-dtsc-muted">{point.label}</span>
            </div>
          ))}
        </div>
      </div>
    </article>
  );
}

function KpiPanel({
  icon: Icon,
  title,
  lines,
  items,
}: {
  icon: LucideIcon;
  title: string;
  lines: string[];
  items: BreakdownItem[];
}) {
  const max = Math.max(1, ...items.map((item) => item.value));

  return (
    <article className="dtsc-card p-5">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-dtsc-soft text-dtsc-blue">
          <Icon className="h-4 w-4" />
        </span>
        <h3 className="font-black text-dtsc-ink">{title}</h3>
      </div>
      <div className="mt-4 space-y-2 text-sm leading-6 text-dtsc-muted">
        {lines.map((line) => <p key={line}>{line}</p>)}
      </div>
      {items.length > 0 && (
        <div className="mt-4 space-y-3">
          {items.map((item) => (
            <div key={`${title}-${item.label}`}>
              <div className="mb-1 flex items-center justify-between gap-3 text-xs font-black uppercase tracking-[0.1em] text-dtsc-muted">
                <span>{formatDisplayLabel(item.label)}</span>
                <span>{item.value}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-dtsc-page">
                <div className="h-full rounded-full bg-cyan-400" style={{ width: `${Math.max(4, (item.value / max) * 100)}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

function Signal({ label, value, helper }: { label: string; value: number; helper: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-200">{label}</p>
      <p className="mt-2 text-2xl font-black">{value}</p>
      <p className="mt-1 text-xs text-slate-300">{helper}</p>
    </div>
  );
}

function formatCompactDate(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatDisplayLabel(value: string) {
  return value
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
}
