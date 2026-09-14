"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ArrowRightLeft, Clock3, Pause, Play, Plus, Square, TimerReset } from "lucide-react";
import { Field, NativeSelect } from "@/components/enterprise/core-v2/erp-v2-ui";
import { gamingSessionsCopy } from "@/components/enterprise/gaming/gaming-sessions-i18n";
import { ProfessionalError, ProfessionalFormSection, ProfessionalLoading, ProfessionalSearch, ProfessionalTabs, professionalMutation, useProfessionalCollection } from "@/components/enterprise/professional/professional-erp-ui";
import { useAppLocale } from "@/components/i18n/locale-provider";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToastMessage } from "@/components/ui/use-toast-message";
import { BusinessList, BusinessListItem } from "@/components/workspace/business-list";
import { EmptyState } from "@/components/workspace/empty-state";
import { FullscreenEntityDetail } from "@/components/workspace/fullscreen-entity-detail";
import { ModuleMetric, ModuleMetrics } from "@/components/workspace/module-metrics";
import { ModuleContent, ModuleHeader, ModuleSection, ModuleToolbar, ModuleWorkspace } from "@/components/workspace/module-workspace";
import { StatusBadge, type StatusBadgeTone } from "@/components/workspace/status-badge";
import type { EnterpriseModuleDefinition } from "@/lib/enterprise/module-registry";

type SessionStatus = "WAITING" | "ACTIVE" | "PAUSED" | "ENDED" | "TO_CHECKOUT" | "PAID" | "CANCELLED";
type SessionTransition = { id: string; action: string; fromStatus: string | null; toStatus: string; occurredAt: string; metadataJson: unknown };
type SessionItem = {
  id: string;
  reference: string;
  stationId: string;
  status: SessionStatus;
  startedAt: string | null;
  expectedEndAt: string | null;
  pausedAt: string | null;
  endedAt: string | null;
  pausedSeconds: number;
  billableSeconds: number | null;
  timingPolicyJson: { pauseBillable?: boolean } | null;
  revision: number;
  station: { id: string; stationCode: string; displayName: string | null; consoleFamily: string | null; maxPlayers: number };
  transitions: SessionTransition[];
  timing: { elapsedSeconds: number; pausedSeconds: number; billableSeconds: number; remainingSeconds: number | null };
};
type SessionExtra = { serverNow?: string };
type Station = { id: string; stationCode: string; displayName: string | null; consoleFamily: string | null; effectiveStatus: string };
type Pagination = { page: number; pageSize: number; total: number; pageCount: number };
type Filter = "ALL" | SessionStatus;

function statusTone(status: SessionStatus): StatusBadgeTone {
  if (status === "ACTIVE") return "success";
  if (status === "PAUSED" || status === "WAITING") return "warning";
  if (status === "ENDED" || status === "TO_CHECKOUT") return "info";
  if (status === "PAID") return "success";
  return "danger";
}

function formatSeconds(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  const safe = Math.max(0, Math.floor(value));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  return [hours, minutes, seconds].map((part) => String(part).padStart(2, "0")).join(":");
}

function newCommandKey() {
  return globalThis.crypto.randomUUID();
}

export function EnterpriseGamingSessionsWorkspace({
  organizationId,
  organizationName,
  definition,
}: {
  organizationId: string;
  organizationName: string;
  definition: EnterpriseModuleDefinition;
}) {
  const locale = useAppLocale();
  const copy = gamingSessionsCopy(locale);
  const [filter, setFilter] = useState<Filter>("ALL");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [tick, setTick] = useState(0);
  const [anchorClientMs, setAnchorClientMs] = useState(() => Date.now());
  const [detail, setDetail] = useState<SessionItem | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [extendFor, setExtendFor] = useState<SessionItem | null>(null);
  const [transferFor, setTransferFor] = useState<SessionItem | null>(null);
  const [endFor, setEndFor] = useState<SessionItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState("");

  const [stationPage, setStationPage] = useState(1);
  const [stations, setStations] = useState<Station[]>([]);
  const [stationPagination, setStationPagination] = useState<Pagination>({ page: 1, pageSize: 20, total: 0, pageCount: 1 });
  const [stationLoading, setStationLoading] = useState(false);
  const [stationError, setStationError] = useState("");

  useToastMessage(message, "error");
  useToastMessage(success, "success");

  const params = useMemo(() => {
    const value = new URLSearchParams({ page: String(page), pageSize: "20" });
    if (search.trim()) value.set("search", search.trim());
    if (filter !== "ALL") value.set("status", filter);
    return value;
  }, [filter, page, search]);

  const collection = useProfessionalCollection<SessionItem, SessionExtra>({
    endpoint: `/api/enterprise/${organizationId}/gaming/sessions`,
    params,
    refreshKey,
  });

  useEffect(() => {
    if (!collection.extra.serverNow) return;
    setAnchorClientMs(Date.now());
    setTick(0);
  }, [collection.extra.serverNow]);

  useEffect(() => {
    const displayTimer = window.setInterval(() => setTick((value) => value + 1), 1_000);
    const reconciliationTimer = window.setInterval(() => { void collection.reload(); }, 30_000);
    return () => {
      window.clearInterval(displayTimer);
      window.clearInterval(reconciliationTimer);
    };
  }, [collection.reload]);

  useEffect(() => {
    const needsStations = createOpen || Boolean(transferFor);
    if (!needsStations) return;
    const controller = new AbortController();
    const query = new URLSearchParams({ page: String(stationPage), pageSize: "20", status: "AVAILABLE" });
    setStationLoading(true);
    setStationError("");
    fetch(`/api/enterprise/${organizationId}/gaming/stations?${query.toString()}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body = await response.json().catch(() => null) as { items?: Station[]; pagination?: Pagination; message?: string; error?: string } | null;
        if (!response.ok || !body?.items || !body.pagination) throw new Error(body?.message || body?.error || copy.loadStationsFailed);
        setStations(body.items);
        setStationPagination(body.pagination);
      })
      .catch((error: unknown) => {
        if ((error as { name?: string })?.name === "AbortError") return;
        setStationError(error instanceof Error ? error.message : copy.loadStationsFailed);
      })
      .finally(() => setStationLoading(false));
    return () => controller.abort();
  }, [copy.loadStationsFailed, createOpen, organizationId, refreshKey, stationPage, transferFor]);

  const projectedDelta = useMemo(() => Math.max(0, Math.floor((Date.now() - anchorClientMs) / 1000)), [anchorClientMs, tick]);

  function projectedTiming(item: SessionItem) {
    if (item.status === "ACTIVE") {
      return {
        elapsedSeconds: item.timing.elapsedSeconds + projectedDelta,
        pausedSeconds: item.timing.pausedSeconds,
        billableSeconds: item.timing.billableSeconds + projectedDelta,
        remainingSeconds: item.timing.remainingSeconds === null ? null : Math.max(0, item.timing.remainingSeconds - projectedDelta),
      };
    }
    if (item.status === "PAUSED") {
      return {
        elapsedSeconds: item.timing.elapsedSeconds + projectedDelta,
        pausedSeconds: item.timing.pausedSeconds + projectedDelta,
        billableSeconds: item.timing.billableSeconds + (item.timingPolicyJson?.pauseBillable ? projectedDelta : 0),
        remainingSeconds: item.timing.remainingSeconds,
      };
    }
    return item.timing;
  }

  function resetFeedback() {
    setMessage("");
    setSuccess("");
  }

  function refreshAndClose() {
    setDetail(null);
    setExtendFor(null);
    setTransferFor(null);
    setEndFor(null);
    setRefreshKey((value) => value + 1);
  }

  async function startSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    resetFeedback();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      await professionalMutation(`/api/enterprise/${organizationId}/gaming/sessions`, {
        stationId: String(form.get("stationId") || ""),
        durationMinutes: Number(form.get("durationMinutes") || 60),
        pauseBillable: form.get("pauseBillable") === "on",
        idempotencyKey: newCommandKey(),
      });
      setCreateOpen(false);
      setStationPage(1);
      setSuccess(copy.started);
      setRefreshKey((value) => value + 1);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : copy.started);
    } finally {
      setBusy(false);
    }
  }

  async function transition(item: SessionItem, action: "PAUSE" | "RESUME") {
    resetFeedback();
    setBusy(true);
    try {
      await professionalMutation(`/api/enterprise/${organizationId}/gaming/sessions/${item.id}`, {
        action,
        revision: item.revision,
        idempotencyKey: newCommandKey(),
      }, "PATCH");
      refreshAndClose();
      setSuccess(action === "PAUSE" ? copy.pausedSuccess : copy.resumed);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : copy.resumed);
    } finally {
      setBusy(false);
    }
  }

  async function extendSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!extendFor) return;
    resetFeedback();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      await professionalMutation(`/api/enterprise/${organizationId}/gaming/sessions/${extendFor.id}`, {
        action: "EXTEND",
        revision: extendFor.revision,
        extensionMinutes: Number(form.get("extensionMinutes") || 30),
        idempotencyKey: newCommandKey(),
      }, "PATCH");
      refreshAndClose();
      setSuccess(copy.extended);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : copy.extended);
    } finally {
      setBusy(false);
    }
  }

  async function transferSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!transferFor) return;
    resetFeedback();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      await professionalMutation(`/api/enterprise/${organizationId}/gaming/sessions/${transferFor.id}`, {
        action: "TRANSFER",
        revision: transferFor.revision,
        targetStationId: String(form.get("targetStationId") || ""),
        idempotencyKey: newCommandKey(),
      }, "PATCH");
      refreshAndClose();
      setSuccess(copy.transferred);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : copy.transferred);
    } finally {
      setBusy(false);
    }
  }

  async function endSession() {
    if (!endFor) return;
    resetFeedback();
    setBusy(true);
    try {
      await professionalMutation(`/api/enterprise/${organizationId}/gaming/sessions/${endFor.id}`, {
        action: "END",
        revision: endFor.revision,
        idempotencyKey: newCommandKey(),
      }, "PATCH");
      refreshAndClose();
      setSuccess(copy.endedSuccess);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : copy.endedSuccess);
    } finally {
      setBusy(false);
    }
  }

  function actions(item: SessionItem) {
    const live = item.status === "ACTIVE" || item.status === "PAUSED";
    return [
      { id: "pause", label: copy.pause, icon: Pause, hidden: !collection.canWrite || item.status !== "ACTIVE", disabled: busy, onSelect: () => void transition(item, "PAUSE") },
      { id: "resume", label: copy.resume, icon: Play, hidden: !collection.canWrite || item.status !== "PAUSED", disabled: busy, onSelect: () => void transition(item, "RESUME") },
      { id: "extend", label: copy.extend, icon: TimerReset, hidden: !collection.canWrite || !live, disabled: busy, onSelect: () => { setDetail(null); setExtendFor(item); } },
      { id: "transfer", label: copy.transfer, icon: ArrowRightLeft, hidden: !collection.canWrite || !live, disabled: busy, onSelect: () => { setDetail(null); setStationPage(1); setTransferFor(item); } },
      { id: "end", label: copy.end, icon: Square, destructive: true, separatorBefore: true, hidden: !collection.canWrite || !live, disabled: busy, onSelect: () => { setDetail(null); setEndFor(item); } },
    ];
  }

  const tabs: Array<{ id: Filter; label: string; count?: number }> = [
    { id: "ALL", label: copy.all, count: collection.metrics.total },
    { id: "ACTIVE", label: copy.active, count: collection.metrics.active },
    { id: "PAUSED", label: copy.paused, count: collection.metrics.paused },
    { id: "ENDED", label: copy.ended, count: collection.metrics.ended },
    { id: "TO_CHECKOUT", label: copy.toCheckout, count: collection.metrics.toCheckout },
  ];

  return (
    <ModuleWorkspace>
      <ModuleHeader
        eyebrow={`${copy.eyebrow} · ${organizationName}`}
        title={copy.title}
        description={locale === "en" ? definition.descriptionEn : definition.descriptionFr}
        count={copy.sessionCount(collection.pagination.total)}
        primaryAction={collection.canWrite ? <Button onClick={() => { resetFeedback(); setStationPage(1); setCreateOpen(true); }}><Plus className="h-4 w-4" />{copy.newSession}</Button> : undefined}
      />

      <ModuleMetrics label={copy.metricsLabel}>
        <ModuleMetric label={copy.active} value={collection.metrics.active || 0} />
        <ModuleMetric label={copy.paused} value={collection.metrics.paused || 0} />
        <ModuleMetric label={copy.ended} value={collection.metrics.ended || 0} />
        <ModuleMetric label={copy.toCheckout} value={collection.metrics.toCheckout || 0} />
      </ModuleMetrics>

      <ModuleToolbar
        search={<ProfessionalSearch value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder={copy.searchPlaceholder} />}
        controls={<ProfessionalTabs value={filter} onChange={(value) => { setFilter(value); setPage(1); }} items={tabs} label={copy.viewsLabel} />}
        summary={copy.page(collection.pagination.page, collection.pagination.pageCount)}
      />

      <ModuleContent>
        {message && !createOpen && !extendFor && !transferFor && !endFor ? <ProfessionalError message={message} /> : null}
        <div className="rounded-2xl border border-dtsc-border bg-dtsc-soft/60 p-4">
          <div className="flex items-center gap-2 text-sm font-black text-dtsc-ink"><Clock3 className="h-4 w-4 text-dtsc-blue" />{copy.serverAuthority}</div>
          <p className="mt-1 text-sm leading-6 text-dtsc-muted">{copy.serverAuthorityDescription}</p>
        </div>
        <ModuleSection id="gaming-sessions-board" title={copy.sectionTitle} description={copy.sectionDescription} defaultOpen>
          {collection.loading ? <ProfessionalLoading /> : collection.error ? <ProfessionalError message={collection.error} /> : collection.items.length ? (
            <>
              <BusinessList ariaLabel={copy.sectionTitle} className="grid gap-3 divide-y-0 border-0 bg-transparent sm:grid-cols-2 xl:grid-cols-3">
                {collection.items.map((item) => {
                  const timing = projectedTiming(item);
                  return (
                    <BusinessListItem
                      key={item.id}
                      className="rounded-2xl border border-dtsc-border bg-dtsc-surface px-4 shadow-sm"
                      leading={<Clock3 className="h-5 w-5 text-dtsc-blue" />}
                      title={item.station.displayName || item.station.stationCode}
                      status={<StatusBadge tone={statusTone(item.status)}>{copy.status[item.status] || item.status}</StatusBadge>}
                      meta={`${item.reference} · ${copy.remaining}: ${formatSeconds(timing.remainingSeconds)}`}
                      description={`${copy.elapsed}: ${formatSeconds(timing.elapsedSeconds)} · ${copy.billable}: ${formatSeconds(timing.billableSeconds)}`}
                      onOpen={() => { resetFeedback(); setDetail(item); }}
                      openLabel={`${copy.detailTitle} ${item.reference}`}
                    />
                  );
                })}
              </BusinessList>
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                <Button variant="secondary" disabled={collection.pagination.page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>{copy.previous}</Button>
                <span className="text-sm font-bold text-dtsc-muted">{copy.page(collection.pagination.page, collection.pagination.pageCount)}</span>
                <Button variant="secondary" disabled={collection.pagination.page >= collection.pagination.pageCount} onClick={() => setPage((value) => Math.min(collection.pagination.pageCount, value + 1))}>{copy.next}</Button>
              </div>
            </>
          ) : <EmptyState title={copy.emptyTitle} description={copy.emptyDescription} />}
        </ModuleSection>
      </ModuleContent>

      <FullscreenEntityDetail
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title={detail?.reference || copy.detailTitle}
        description={detail ? `${detail.station.stationCode} · ${detail.station.displayName || detail.station.consoleFamily || ""}` : undefined}
        actions={detail ? actions(detail) : []}
        actionLabel={copy.actions}
      >
        {detail ? <SessionDetail item={detail} timing={projectedTiming(detail)} copy={copy} locale={locale} /> : null}
      </FullscreenEntityDetail>

      <Dialog open={createOpen} onClose={() => !busy && setCreateOpen(false)} title={copy.createTitle} description={copy.createDescription} className="h-[92dvh]" footer={<><Button variant="secondary" disabled={busy} onClick={() => setCreateOpen(false)}>{copy.cancel}</Button><Button form="gaming-session-start" type="submit" disabled={busy || !stations.length}>{copy.save}</Button></>}>
        <form id="gaming-session-start" onSubmit={startSession} className="grid gap-5 p-4 sm:p-5">
          {message ? <ProfessionalError message={message} /> : null}
          <ProfessionalFormSection title={copy.availableStations} description={copy.createDescription}>
            {stationError ? <div className="md:col-span-2"><ProfessionalError message={stationError} /></div> : null}
            {stationLoading ? <div className="md:col-span-2"><ProfessionalLoading rows={2} /></div> : stations.length ? (
              <Field label={copy.station} required><NativeSelect name="stationId" required items={stations.map((station) => ({ id: station.id, label: `${station.stationCode} · ${station.displayName || station.consoleFamily || "PlayStation"}` }))} /></Field>
            ) : <div className="md:col-span-2 text-sm font-bold text-dtsc-muted">{copy.noAvailableStation}</div>}
            <Field label={copy.duration} required><Input name="durationMinutes" type="number" min={1} max={1440} defaultValue={60} required /></Field>
            <label className="flex min-h-11 items-center gap-3 rounded-xl border border-dtsc-border px-3 py-2 text-sm font-bold text-dtsc-ink md:col-span-2">
              <input name="pauseBillable" type="checkbox" className="h-4 w-4" />
              <span><span className="block">{copy.pauseBillable}</span><span className="block font-medium text-dtsc-muted">{copy.pauseBillableHelp}</span></span>
            </label>
            <div className="flex min-w-0 items-center justify-between gap-2 md:col-span-2">
              <Button type="button" variant="secondary" disabled={stationPage <= 1 || stationLoading} onClick={() => setStationPage((value) => Math.max(1, value - 1))}>{copy.previous}</Button>
              <span className="text-xs font-bold text-dtsc-muted">{copy.page(stationPagination.page, stationPagination.pageCount)}</span>
              <Button type="button" variant="secondary" disabled={stationPage >= stationPagination.pageCount || stationLoading} onClick={() => setStationPage((value) => Math.min(stationPagination.pageCount, value + 1))}>{copy.next}</Button>
            </div>
          </ProfessionalFormSection>
        </form>
      </Dialog>

      <Dialog open={Boolean(extendFor)} onClose={() => !busy && setExtendFor(null)} title={copy.extensionTitle} footer={<><Button variant="secondary" disabled={busy} onClick={() => setExtendFor(null)}>{copy.cancel}</Button><Button form="gaming-session-extend" type="submit" disabled={busy}>{copy.extend}</Button></>}>
        {extendFor ? <form id="gaming-session-extend" onSubmit={extendSession} className="grid gap-4 p-4 sm:p-5"><Field label={copy.extensionMinutes} required><Input name="extensionMinutes" type="number" min={1} max={720} defaultValue={30} required /></Field></form> : null}
      </Dialog>

      <Dialog open={Boolean(transferFor)} onClose={() => !busy && setTransferFor(null)} title={copy.transferTitle} footer={<><Button variant="secondary" disabled={busy} onClick={() => setTransferFor(null)}>{copy.cancel}</Button><Button form="gaming-session-transfer" type="submit" disabled={busy || !stations.length}>{copy.transfer}</Button></>}>
        {transferFor ? <form id="gaming-session-transfer" onSubmit={transferSession} className="grid gap-4 p-4 sm:p-5">
          {stationError ? <ProfessionalError message={stationError} /> : null}
          {stationLoading ? <ProfessionalLoading rows={2} /> : <Field label={copy.transferStation} required><NativeSelect name="targetStationId" required items={stations.filter((station) => station.id !== transferFor.stationId).map((station) => ({ id: station.id, label: `${station.stationCode} · ${station.displayName || station.consoleFamily || "PlayStation"}` }))} /></Field>}
          <div className="flex min-w-0 items-center justify-between gap-2">
            <Button type="button" variant="secondary" disabled={stationPage <= 1 || stationLoading} onClick={() => setStationPage((value) => Math.max(1, value - 1))}>{copy.previous}</Button>
            <span className="text-xs font-bold text-dtsc-muted">{copy.page(stationPagination.page, stationPagination.pageCount)}</span>
            <Button type="button" variant="secondary" disabled={stationPage >= stationPagination.pageCount || stationLoading} onClick={() => setStationPage((value) => Math.min(stationPagination.pageCount, value + 1))}>{copy.next}</Button>
          </div>
        </form> : null}
      </Dialog>

      <Dialog open={Boolean(endFor)} onClose={() => !busy && setEndFor(null)} title={copy.endTitle} description={copy.endDescription} footer={<><Button variant="secondary" disabled={busy} onClick={() => setEndFor(null)}>{copy.cancel}</Button><Button variant="destructive" disabled={busy} onClick={() => void endSession()}>{copy.confirmEnd}</Button></>}>
        <div className="p-4 text-sm font-bold text-dtsc-ink sm:p-5">{endFor ? `${endFor.reference} · ${endFor.station.stationCode}` : null}</div>
      </Dialog>
    </ModuleWorkspace>
  );
}

function SessionDetail({ item, timing, copy, locale }: { item: SessionItem; timing: SessionItem["timing"]; copy: ReturnType<typeof gamingSessionsCopy>; locale: string | null | undefined }) {
  const formatDate = (value: string | null) => value ? new Date(value).toLocaleString(locale === "en" ? "en" : "fr") : "—";
  return (
    <div className="grid min-w-0 gap-5">
      <div className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Detail label={copy.station} value={`${item.station.stationCode} · ${item.station.displayName || item.station.consoleFamily || "—"}`} />
        <Detail label={copy.remaining} value={formatSeconds(timing.remainingSeconds)} />
        <Detail label={copy.elapsed} value={formatSeconds(timing.elapsedSeconds)} />
        <Detail label={copy.billable} value={formatSeconds(timing.billableSeconds)} />
        <Detail label={copy.pausedTime} value={formatSeconds(timing.pausedSeconds)} />
        <Detail label={copy.startedAt} value={formatDate(item.startedAt)} />
        <Detail label={copy.expectedEndAt} value={formatDate(item.expectedEndAt)} />
        <Detail label={copy.endedAt} value={formatDate(item.endedAt)} />
      </div>
      <div>
        <h3 className="text-sm font-black uppercase tracking-wide text-dtsc-muted">{copy.transitionHistory}</h3>
        <div className="mt-3 grid gap-2">
          {item.transitions.length ? item.transitions.map((transition) => (
            <div key={transition.id} className="rounded-xl border border-dtsc-border bg-dtsc-surface p-3 text-sm">
              <div className="font-black text-dtsc-ink">{copy.action[transition.action] || transition.action}</div>
              <div className="mt-1 text-dtsc-muted">{formatDate(transition.occurredAt)} · {transition.fromStatus ? `${copy.status[transition.fromStatus] || transition.fromStatus} → ` : ""}{copy.status[transition.toStatus] || transition.toStatus}</div>
            </div>
          )) : <div className="text-sm text-dtsc-muted">{copy.noHistory}</div>}
        </div>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0 rounded-2xl border border-dtsc-border bg-dtsc-surface p-4"><div className="text-xs font-black uppercase tracking-wide text-dtsc-muted">{label}</div><div className="mt-1 break-words text-sm font-bold text-dtsc-ink">{value}</div></div>;
}
