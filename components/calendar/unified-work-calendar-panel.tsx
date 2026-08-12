"use client";

import Link from "next/link";
import { CalendarDays, ExternalLink, Filter, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/workspace/status-badge";
import { translateSharedWork, type SharedWorkKey } from "@/lib/i18n";
import { userLocale } from "@/lib/user-format";

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

const SOURCE_LABEL_KEYS: Record<string, SharedWorkKey> = {
  InternalCalendarEvent: "calendar.source.InternalCalendarEvent",
  EnterpriseTask: "calendar.source.EnterpriseTask",
  EnterpriseRequest: "calendar.source.EnterpriseRequest",
  EnterpriseApproval: "calendar.source.EnterpriseApproval",
  EnterpriseMeeting: "calendar.source.EnterpriseMeeting",
  EnterpriseWorkflowRun: "calendar.source.EnterpriseWorkflowRun",
  EnterpriseDocument: "calendar.source.EnterpriseDocument",
};

export function UnifiedWorkCalendarPanel({ initialEvents, locale = "fr" }: { initialEvents: UnifiedWorkCalendarItem[]; locale?: string | null }) {
  const [query, setQuery] = useState("");
  const [source, setSource] = useState("ALL");
  const sources = useMemo(() => [...new Set(initialEvents.map((event) => event.sourceType))], [initialEvents]);
  const events = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase(userLocale({ locale }));
    return initialEvents.filter((event) => {
      if (source !== "ALL" && event.sourceType !== source) return false;
      if (!normalized) return true;
      return [event.title, event.description, event.status, sourceLabel(locale, event.sourceType)]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase(userLocale({ locale }))
        .includes(normalized);
    });
  }, [initialEvents, locale, query, source]);

  return (
    <section className="dtsc-card min-w-0 overflow-hidden p-4 sm:p-6" aria-labelledby="unified-work-calendar-title">
      <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-600">{translateSharedWork(locale, "calendar.authorizedSources")}</p>
          <h2 id="unified-work-calendar-title" className="mt-1 break-words text-2xl font-black text-dtsc-ink">{translateSharedWork(locale, "calendar.unifiedAgenda")}</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-dtsc-muted">
            {translateSharedWork(locale, "calendar.unifiedDescription")}
          </p>
        </div>
        <div className="relative min-w-0 lg:w-80">
          <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-dtsc-muted" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} className="h-11 pl-9" placeholder={translateSharedWork(locale, "calendar.searchPlaceholder")} />
        </div>
      </div>

      <div className="mt-4 flex min-w-0 gap-2 overflow-x-auto pb-2" aria-label={translateSharedWork(locale, "calendar.sourceFilters")}>
        <button type="button" onClick={() => setSource("ALL")} className={filterClass(source === "ALL")}>
          <Filter className="h-4 w-4" />{translateSharedWork(locale, "calendar.all")}<span className="rounded-full bg-black/10 px-2 py-0.5 text-xs">{initialEvents.length}</span>
        </button>
        {sources.map((item) => (
          <button key={item} type="button" onClick={() => setSource(item)} className={filterClass(source === item)}>
            {sourceLabel(locale, item)}
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
                <StatusBadge>{sourceLabel(locale, event.sourceType)}</StatusBadge>
                <StatusBadge>{event.status}</StatusBadge>
              </div>
              <p className="mt-1 text-sm font-bold text-dtsc-muted">{formatRange(event, locale)}</p>
              {event.description ? <p className="mt-1 line-clamp-2 text-sm leading-6 text-dtsc-muted">{event.description}</p> : null}
            </div>
            <Link href={event.deepLink} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-dtsc-border bg-dtsc-page px-3 text-sm font-black text-dtsc-blue hover:bg-cyan-400/10">
              {translateSharedWork(locale, "calendar.openSource")}<ExternalLink className="h-4 w-4" />
            </Link>
          </article>
        )) : (
          <div className="rounded-2xl border border-dashed border-dtsc-border bg-dtsc-page p-6 text-center text-sm text-dtsc-muted">
            {translateSharedWork(locale, "calendar.empty")}
          </div>
        )}
      </div>
    </section>
  );
}

function sourceLabel(locale: string | null | undefined, sourceType: string) {
  const key = SOURCE_LABEL_KEYS[sourceType];
  return key ? translateSharedWork(locale, key) : sourceType;
}

function filterClass(active: boolean) {
  return `inline-flex h-10 shrink-0 items-center gap-2 rounded-xl px-3 text-sm font-black transition ${active ? "bg-cyan-400 text-[#001736]" : "border border-dtsc-border bg-dtsc-surface text-dtsc-muted hover:bg-cyan-400/10"}`;
}

function formatRange(event: UnifiedWorkCalendarItem, locale?: string | null) {
  const language = userLocale({ locale });
  const options: Intl.DateTimeFormatOptions = event.allDay
    ? { dateStyle: "medium", timeZone: event.timezone }
    : { dateStyle: "medium", timeStyle: "short", timeZone: event.timezone };
  const startsAt = new Intl.DateTimeFormat(language, options).format(new Date(event.startsAt));
  if (event.allDay) return startsAt;
  const endsAt = new Intl.DateTimeFormat(language, { timeStyle: "short", timeZone: event.timezone }).format(new Date(event.endsAt));
  return `${startsAt} — ${endsAt}`;
}
