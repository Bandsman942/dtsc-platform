"use client";

import Link from "next/link";
import { CalendarDays, ExternalLink, Filter, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/workspace/status-badge";

export type UnifiedWorkCalendarItem = {
  id: string;
  sourceType: string;
  sourceId: string;
  title: string;
  description: string | null;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  timezone: string;
  status: string;
  priority: string;
  contextType: string;
  organizationId: string;
  ownerId: string | null;
  participantIds: string[];
  deepLink: string;
  canEdit: boolean;
  canDelete: boolean;
};

const SOURCE_LABELS: Record<string, string> = {
  InternalCalendarEvent: "Calendrier",
  EnterpriseTask: "Tâches",
  EnterpriseRequest: "Demandes",
  EnterpriseApproval: "Validations",
  EnterpriseMeeting: "Réunions",
  EnterpriseWorkflowRun: "Workflows",
  EnterpriseDocument: "Documents",
};

export function UnifiedWorkCalendarPanel({ initialEvents, locale = "fr" }: { initialEvents: UnifiedWorkCalendarItem[]; locale?: string | null }) {
  const en = locale === "en";
  const [query, setQuery] = useState("");
  const [source, setSource] = useState("ALL");
  const sources = useMemo(() => [...new Set(initialEvents.map((event) => event.sourceType))], [initialEvents]);
  const events = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return initialEvents.filter((event) => {
      if (source !== "ALL" && event.sourceType !== source) return false;
      if (!normalized) return true;
      return [event.title, event.description, event.status, SOURCE_LABELS[event.sourceType] || event.sourceType]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase()
        .includes(normalized);
    });
  }, [initialEvents, query, source]);

  return (
    <section className="dtsc-card min-w-0 overflow-hidden p-4 sm:p-6" aria-labelledby="unified-work-calendar-title">
      <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-600">{en ? "Authorized work sources" : "Sources de travail autorisées"}</p>
          <h2 id="unified-work-calendar-title" className="mt-1 break-words text-2xl font-black text-dtsc-ink">{en ? "Unified work agenda" : "Agenda de travail unifié"}</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-dtsc-muted">
            {en
              ? "Tasks, requests, approvals, meetings, workflows and document deadlines remain owned by their source modules."
              : "Les tâches, demandes, validations, réunions, workflows et échéances documentaires restent pilotés par leurs modules sources."}
          </p>
        </div>
        <div className="relative min-w-0 lg:w-80">
          <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-dtsc-muted" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} className="h-11 pl-9" placeholder={en ? "Search the agenda…" : "Rechercher dans l’agenda…"} />
        </div>
      </div>

      <div className="mt-4 flex min-w-0 gap-2 overflow-x-auto pb-2" aria-label={en ? "Source filters" : "Filtres par source"}>
        <button type="button" onClick={() => setSource("ALL")} className={filterClass(source === "ALL")}>
          <Filter className="h-4 w-4" />{en ? "All" : "Tout"}<span className="rounded-full bg-black/10 px-2 py-0.5 text-xs">{initialEvents.length}</span>
        </button>
        {sources.map((item) => (
          <button key={item} type="button" onClick={() => setSource(item)} className={filterClass(source === item)}>
            {SOURCE_LABELS[item] || item}
            <span className="rounded-full bg-black/10 px-2 py-0.5 text-xs">{initialEvents.filter((event) => event.sourceType === item).length}</span>
          </button>
        ))}
      </div>

      <div className="mt-2 grid min-w-0 gap-3">
        {events.length ? events.map((event) => (
          <article key={event.id} className="grid min-w-0 gap-3 rounded-2xl border border-dtsc-border bg-dtsc-surface p-4 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-cyan-400/10 text-cyan-700"><CalendarDays className="h-5 w-5" /></div>
            <div className="min-w-0">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <h3 className="min-w-0 break-words font-black text-dtsc-ink">{event.title}</h3>
                <StatusBadge>{SOURCE_LABELS[event.sourceType] || event.sourceType}</StatusBadge>
                <StatusBadge>{event.status}</StatusBadge>
              </div>
              <p className="mt-1 text-sm font-bold text-dtsc-muted">{formatRange(event, locale)}</p>
              {event.description ? <p className="mt-1 line-clamp-2 text-sm leading-6 text-dtsc-muted">{event.description}</p> : null}
            </div>
            <Link href={event.deepLink} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-dtsc-border bg-dtsc-page px-3 text-sm font-black text-dtsc-blue hover:bg-cyan-400/10">
              {en ? "Open source" : "Ouvrir la source"}<ExternalLink className="h-4 w-4" />
            </Link>
          </article>
        )) : (
          <div className="rounded-2xl border border-dashed border-dtsc-border bg-dtsc-page p-6 text-center text-sm text-dtsc-muted">
            {en ? "No authorized work item matches these filters." : "Aucun objet de travail autorisé ne correspond à ces filtres."}
          </div>
        )}
      </div>
    </section>
  );
}

function filterClass(active: boolean) {
  return `inline-flex h-10 shrink-0 items-center gap-2 rounded-xl px-3 text-sm font-black transition ${active ? "bg-cyan-400 text-[#001736]" : "border border-dtsc-border bg-dtsc-surface text-dtsc-muted hover:bg-cyan-400/10"}`;
}

function formatRange(event: UnifiedWorkCalendarItem, locale?: string | null) {
  const language = locale === "en" ? "en-GB" : "fr-FR";
  const options: Intl.DateTimeFormatOptions = event.allDay
    ? { dateStyle: "medium", timeZone: event.timezone }
    : { dateStyle: "medium", timeStyle: "short", timeZone: event.timezone };
  const startsAt = new Intl.DateTimeFormat(language, options).format(new Date(event.startsAt));
  if (event.allDay) return startsAt;
  const endsAt = new Intl.DateTimeFormat(language, { timeStyle: "short", timeZone: event.timezone }).format(new Date(event.endsAt));
  return `${startsAt} — ${endsAt}`;
}
