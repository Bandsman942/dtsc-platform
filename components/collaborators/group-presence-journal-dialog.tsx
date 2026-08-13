"use client";

import { Activity, Clock3, MonitorSmartphone, RefreshCw, UserRoundCheck, Wifi, WifiOff } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ConversationAvatar } from "@/components/chat/ConversationAvatar";
import { SearchBar } from "@/components/chat/SearchBar";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { translateSharedWork, type SharedWorkKey } from "@/lib/i18n";
import { formatUserDateTime, type UserDatePreferences } from "@/lib/user-format";

export type PresenceJournalMember = {
  userId: string;
  status: string;
  role: string;
  joinedAt: string;
  leftAt?: string | null;
  user: {
    id: string;
    name: string;
    email: string;
    avatarUrl?: string | null;
    jobTitle?: string | null;
    lastSeenAt?: string | null;
  };
};

type PresenceSession = {
  id: string;
  userId: string;
  clientType: string;
  connectedAt: string;
  lastHeartbeatAt: string;
  disconnectedAt?: string | null;
  disconnectReason?: string | null;
  online: boolean;
  durationSeconds: number;
  member: PresenceJournalMember;
};

type PresenceResponse = {
  sessions?: PresenceSession[];
  members?: PresenceJournalMember[];
  metrics?: {
    totalSessions: number;
    onlineNow: number;
    totalConnectedSeconds: number;
    averageSessionSeconds: number;
  };
  page?: number;
  pageSize?: number;
  total?: number;
  hasMore?: boolean;
  truncated?: boolean;
  message?: string;
};

type Filters = {
  search: string;
  userId: string;
  status: "ALL" | "ONLINE" | "OFFLINE";
  clientType: "ALL" | "MOBILE" | "TABLET" | "DESKTOP" | "PWA" | "UNKNOWN";
  duration: "ALL" | "UNDER_5" | "5_60" | "OVER_60";
  from: string;
  to: string;
  sort: "RECENT" | "OLDEST" | "LONGEST";
};

const initialFilters: Filters = {
  search: "",
  userId: "",
  status: "ALL",
  clientType: "ALL",
  duration: "ALL",
  from: "",
  to: "",
  sort: "RECENT",
};

export function GroupPresenceJournalDialog({
  open,
  groupId,
  groupName,
  locale,
  userPreferences,
  onClose,
}: {
  open: boolean;
  groupId: string;
  groupName: string;
  locale?: string | null;
  userPreferences: UserDatePreferences;
  onClose: () => void;
}) {
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [appliedFilters, setAppliedFilters] = useState<Filters>(initialFilters);
  const [sessions, setSessions] = useState<PresenceSession[]>([]);
  const [members, setMembers] = useState<PresenceJournalMember[]>([]);
  const [metrics, setMetrics] = useState<NonNullable<PresenceResponse["metrics"]>>({ totalSessions: 0, onlineNow: 0, totalConnectedSeconds: 0, averageSessionSeconds: 0 });
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [truncated, setTruncated] = useState(false);
  const t = useCallback((key: SharedWorkKey) => translateSharedWork(locale, key), [locale]);

  const query = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: "30", status: appliedFilters.status, clientType: appliedFilters.clientType, duration: appliedFilters.duration, sort: appliedFilters.sort });
    if (appliedFilters.search.trim()) params.set("search", appliedFilters.search.trim());
    if (appliedFilters.userId) params.set("userId", appliedFilters.userId);
    if (appliedFilters.from) params.set("from", appliedFilters.from);
    if (appliedFilters.to) params.set("to", appliedFilters.to);
    return params.toString();
  }, [appliedFilters, page]);

  const load = useCallback(async () => {
    if (!open || !groupId) return;
    setLoading(true);
    setError("");
    const response = await fetch(`/api/collaborators/groups/${encodeURIComponent(groupId)}/presence-journal?${query}`, { cache: "no-store" });
    const body = await response.json().catch(() => null) as PresenceResponse | null;
    setLoading(false);
    if (!response.ok || !body) {
      setError(body?.message || t("collaboration.presence.loadError"));
      return;
    }
    setSessions(body.sessions || []);
    setMembers(body.members || []);
    setMetrics(body.metrics || { totalSessions: 0, onlineNow: 0, totalConnectedSeconds: 0, averageSessionSeconds: 0 });
    setHasMore(Boolean(body.hasMore));
    setTotal(body.total || 0);
    setTruncated(Boolean(body.truncated));
  }, [groupId, open, query, t]);

  useEffect(() => {
    if (open) void load();
  }, [load, open]);

  useEffect(() => {
    if (!open) {
      setPage(1);
      setFilters(initialFilters);
      setAppliedFilters(initialFilters);
      setError("");
    }
  }, [open]);

  function applyFilters() {
    setPage(1);
    setAppliedFilters(filters);
  }

  function resetFilters() {
    setPage(1);
    setFilters(initialFilters);
    setAppliedFilters(initialFilters);
  }

  return (
    <Dialog
      open={open}
      title={t("collaboration.presence.title")}
      description={`${groupName} · ${t("collaboration.presence.ownersOnly")}`}
      onClose={onClose}
      className="h-[94dvh] max-w-5xl"
    >
      <div className="grid gap-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Metric icon={Activity} label={t("collaboration.presence.sessions")} value={String(metrics.totalSessions)} />
          <Metric icon={UserRoundCheck} label={t("collaboration.presence.onlineNow")} value={String(metrics.onlineNow)} />
          <Metric icon={Clock3} label={t("collaboration.presence.average")} value={formatDuration(metrics.averageSessionSeconds, locale)} />
          <Metric icon={MonitorSmartphone} label={t("collaboration.presence.connectedTime")} value={formatDuration(metrics.totalConnectedSeconds, locale)} />
        </div>

        <div className="grid gap-2 rounded-2xl border border-dtsc-border bg-dtsc-page p-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2 lg:col-span-4">
            <SearchBar value={filters.search} onChange={(search) => setFilters((current) => ({ ...current, search }))} placeholder={t("collaboration.presence.searchPlaceholder")} />
          </div>
          <FilterSelect label={t("collaboration.presence.member")} value={filters.userId} onChange={(userId) => setFilters((current) => ({ ...current, userId }))}>
            <option value="">{t("collaboration.presence.allMembers")}</option>
            {members.map((member) => <option key={member.userId} value={member.userId}>{member.user.name}</option>)}
          </FilterSelect>
          <FilterSelect label={t("collaboration.presence.status")} value={filters.status} onChange={(status) => setFilters((current) => ({ ...current, status: status as Filters["status"] }))}>
            <option value="ALL">{t("collaboration.presence.all")}</option><option value="ONLINE">{t("collaboration.presence.online")}</option><option value="OFFLINE">{t("collaboration.presence.offline")}</option>
          </FilterSelect>
          <FilterSelect label={t("collaboration.presence.device")} value={filters.clientType} onChange={(clientType) => setFilters((current) => ({ ...current, clientType: clientType as Filters["clientType"] }))}>
            <option value="ALL">{t("collaboration.presence.allDevices")}</option><option value="MOBILE">Mobile</option><option value="TABLET">{t("collaboration.presence.tablet")}</option><option value="DESKTOP">Desktop</option><option value="PWA">PWA</option><option value="UNKNOWN">{t("collaboration.presence.unknown")}</option>
          </FilterSelect>
          <FilterSelect label={t("collaboration.presence.duration")} value={filters.duration} onChange={(duration) => setFilters((current) => ({ ...current, duration: duration as Filters["duration"] }))}>
            <option value="ALL">{t("collaboration.presence.anyDuration")}</option><option value="UNDER_5">&lt; 5 min</option><option value="5_60">5–60 min</option><option value="OVER_60">&gt; 60 min</option>
          </FilterSelect>
          <label className="grid gap-1 text-xs font-bold text-dtsc-muted">{t("collaboration.presence.from")}<input type="date" value={filters.from} onChange={(event) => setFilters((current) => ({ ...current, from: event.target.value }))} className="h-10 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm text-dtsc-ink" /></label>
          <label className="grid gap-1 text-xs font-bold text-dtsc-muted">{t("collaboration.presence.to")}<input type="date" value={filters.to} onChange={(event) => setFilters((current) => ({ ...current, to: event.target.value }))} className="h-10 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm text-dtsc-ink" /></label>
          <FilterSelect label={t("collaboration.presence.sort")} value={filters.sort} onChange={(sort) => setFilters((current) => ({ ...current, sort: sort as Filters["sort"] }))}>
            <option value="RECENT">{t("collaboration.presence.mostRecent")}</option><option value="OLDEST">{t("collaboration.presence.oldest")}</option><option value="LONGEST">{t("collaboration.presence.longest")}</option>
          </FilterSelect>
          <div className="flex items-end gap-2"><Button type="button" onClick={applyFilters} className="flex-1">{t("collaboration.presence.apply")}</Button><Button type="button" variant="outline" onClick={resetFilters}>{t("collaboration.presence.reset")}</Button></div>
        </div>

        {error ? <p className="rounded-xl border border-red-300/50 bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-700 dark:text-red-200">{error}</p> : null}
        {truncated ? <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">{t("collaboration.presence.truncated")}</p> : null}

        <div className="min-h-0 rounded-2xl border border-dtsc-border bg-dtsc-surface">
          {loading ? <p className="p-8 text-center text-sm font-semibold text-dtsc-muted">{t("collaboration.presence.loading")}</p> : sessions.length ? <div className="divide-y divide-dtsc-border">{sessions.map((session) => <PresenceRow key={session.id} session={session} preferences={userPreferences} locale={locale} />)}</div> : <p className="p-8 text-center text-sm font-semibold text-dtsc-muted">{t("collaboration.presence.empty")}</p>}
        </div>

        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-semibold text-dtsc-muted">{total} {t("collaboration.presence.sessionCount")}</p>
          <div className="flex items-center gap-2"><Button type="button" variant="outline" disabled={page <= 1 || loading} onClick={() => setPage((current) => Math.max(1, current - 1))}>{t("collaboration.presence.previous")}</Button><span className="text-xs font-black text-dtsc-ink">{page}</span><Button type="button" variant="outline" disabled={!hasMore || loading} onClick={() => setPage((current) => current + 1)}>{t("collaboration.presence.next")}</Button><Button type="button" variant="ghost" size="icon" disabled={loading} onClick={() => void load()} aria-label={t("collaboration.presence.refresh")}><RefreshCw className="h-4 w-4" /></Button></div>
        </div>
      </div>
    </Dialog>
  );
}

function PresenceRow({ session, preferences, locale }: { session: PresenceSession; preferences: UserDatePreferences; locale?: string | null }) {
  const t = (key: SharedWorkKey) => translateSharedWork(locale, key);
  return <div className="flex min-w-0 items-start gap-3 px-3 py-3 sm:px-4"><ConversationAvatar title={session.member.user.name} avatarUrl={session.member.user.avatarUrl} isOnline={session.online} className="h-10 w-10 shrink-0" /><div className="min-w-0 flex-1"><div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1"><strong className="truncate text-sm text-dtsc-ink">{session.member.user.name}</strong><span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.65rem] font-black ${session.online ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300" : "bg-dtsc-soft text-dtsc-muted"}`}>{session.online ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}{session.online ? t("collaboration.presence.online") : t("collaboration.presence.offline")}</span><span className="rounded-full bg-dtsc-soft px-2 py-0.5 text-[0.65rem] font-bold text-dtsc-muted">{clientTypeLabel(session.clientType, locale)}</span></div><p className="mt-1 text-xs leading-5 text-dtsc-muted">{t("collaboration.presence.connected")} : <strong className="text-dtsc-ink">{formatUserDateTime(session.connectedAt, preferences, { second: "2-digit" })}</strong><br />{t("collaboration.presence.disconnected")} : <strong className="text-dtsc-ink">{session.disconnectedAt ? formatUserDateTime(session.disconnectedAt, preferences, { second: "2-digit" }) : t("collaboration.presence.activeSession")}</strong> · {t("collaboration.presence.duration")} {formatDuration(session.durationSeconds, locale)}</p></div></div>;
}

function Metric({ icon: Icon, label, value }: { icon: typeof Activity; label: string; value: string }) {
  return <div className="min-w-0 rounded-2xl border border-dtsc-border bg-dtsc-page p-3"><Icon className="h-4 w-4 text-cyan-600" /><p className="mt-2 truncate text-[0.68rem] font-black uppercase tracking-wide text-dtsc-muted">{label}</p><p className="mt-1 truncate text-base font-black text-dtsc-ink">{value}</p></div>;
}

function FilterSelect({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: React.ReactNode }) {
  return <label className="grid gap-1 text-xs font-bold text-dtsc-muted">{label}<select value={value} onChange={(event) => onChange(event.target.value)} className="h-10 min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm text-dtsc-ink">{children}</select></label>;
}

function formatDuration(seconds: number, locale?: string | null) {
  const safe = Math.max(0, Math.round(seconds || 0));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  if (hours) return `${hours} h ${minutes} min`;
  if (minutes) return `${minutes} min`;
  return `${safe} ${translateSharedWork(locale, "collaboration.presence.seconds")}`;
}

function clientTypeLabel(value: string, locale?: string | null) {
  if (value === "MOBILE") return "Mobile";
  if (value === "TABLET") return translateSharedWork(locale, "collaboration.presence.tablet");
  if (value === "DESKTOP") return "Desktop";
  if (value === "PWA") return "PWA";
  return translateSharedWork(locale, "collaboration.presence.unknown");
}
