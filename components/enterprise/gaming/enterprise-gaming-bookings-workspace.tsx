"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { CalendarClock, CheckCircle2, LogIn, Pencil, Play, Plus, UserX, XCircle } from "lucide-react";
import { Field, NativeSelect, formatEnterpriseAmount } from "@/components/enterprise/core-v2/erp-v2-ui";
import { gamingBookingsCopy } from "@/components/enterprise/gaming/gaming-bookings-i18n";
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

type BookingStatus = "DRAFT" | "CONFIRMED" | "CHECKED_IN" | "NO_SHOW" | "CANCELLED" | "CONVERTED";
type BookingTransition = { id: string; action: string; fromStatus: string | null; toStatus: string; occurredAt: string; metadataJson: unknown };
type BookingItem = {
  id: string;
  reference: string;
  stationId: string;
  businessPartyId: string | null;
  scheduledStartAt: string;
  scheduledEndAt: string;
  playerCount: number;
  status: BookingStatus;
  notes: string | null;
  confirmedAt: string | null;
  checkedInAt: string | null;
  noShowAt: string | null;
  cancelledAt: string | null;
  convertedAt: string | null;
  revision: number;
  createdAt: string;
  station: { id: string; assetId: string; stationCode: string; displayName: string | null; consoleFamily: string | null; maxPlayers: number; status: string };
  customer: { id: string; code: string; legalName: string; displayName: string | null; status: string } | null;
  site: { id: string; name: string } | null;
  session: { id: string; reference: string; status: string; startedAt: string | null; expectedEndAt: string | null } | null;
  transitions: BookingTransition[];
};
type Station = { id: string; stationCode: string; displayName: string | null; consoleFamily: string | null; effectiveStatus: string; maxPlayers?: number };
type Customer = { id: string; code: string; legalName: string; displayName: string | null; primaryEmail?: string | null };
type CatalogService = { id: string; code: string; name: string; itemType: string; status?: string };
type PricingQuote = { pricingRuleId: string; pricingRuleCode: string; currency: string; quotedAmount: string; service: { id: string; code: string; name: string } };
type Pagination = { page: number; pageSize: number; total: number; pageCount: number };
type Filter = "ALL" | BookingStatus;
type ViewMode = "LIST" | "CALENDAR";

type ConfirmState = { kind: "CONFIRM" | "CHECK_IN" | "CONVERT" | "NO_SHOW" | "CANCEL"; item: BookingItem } | null;

function statusTone(status: BookingStatus): StatusBadgeTone {
  if (status === "CONVERTED") return "success";
  if (status === "CONFIRMED") return "info";
  if (status === "CHECKED_IN" || status === "DRAFT") return "warning";
  if (status === "NO_SHOW") return "danger";
  return "neutral";
}

function newCommandKey() {
  return globalThis.crypto.randomUUID();
}

function toDateTimeLocal(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function minutesBetween(start: string, end: string) {
  return Math.max(1, Math.ceil((new Date(end).getTime() - new Date(start).getTime()) / 60_000));
}

export function EnterpriseGamingBookingsWorkspace({
  organizationId,
  organizationName,
  definition,
}: {
  organizationId: string;
  organizationName: string;
  definition: EnterpriseModuleDefinition;
}) {
  const locale = useAppLocale();
  const copy = gamingBookingsCopy(locale);
  const [filter, setFilter] = useState<Filter>("ALL");
  const [view, setView] = useState<ViewMode>("LIST");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [detail, setDetail] = useState<BookingItem | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editFor, setEditFor] = useState<BookingItem | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState("");

  const [stationPage, setStationPage] = useState(1);
  const [stations, setStations] = useState<Station[]>([]);
  const [stationPagination, setStationPagination] = useState<Pagination>({ page: 1, pageSize: 20, total: 0, pageCount: 1 });
  const [stationLoading, setStationLoading] = useState(false);
  const [stationError, setStationError] = useState("");

  const [customerSearch, setCustomerSearch] = useState("");
  const [customerPage, setCustomerPage] = useState(1);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerPagination, setCustomerPagination] = useState<Pagination>({ page: 1, pageSize: 20, total: 0, pageCount: 1 });
  const [customerLoading, setCustomerLoading] = useState(false);
  const [customerError, setCustomerError] = useState("");

  const [conversionServices, setConversionServices] = useState<CatalogService[]>([]);
  const [conversionServiceId, setConversionServiceId] = useState("");
  const [conversionServicePage, setConversionServicePage] = useState(1);
  const [conversionPagination, setConversionPagination] = useState<Pagination>({ page: 1, pageSize: 20, total: 0, pageCount: 1 });
  const [conversionLoading, setConversionLoading] = useState(false);
  const [conversionError, setConversionError] = useState("");
  const [conversionQuote, setConversionQuote] = useState<PricingQuote | null>(null);

  useToastMessage(message, "error");
  useToastMessage(success, "success");

  const params = useMemo(() => {
    const value = new URLSearchParams({ page: String(page), pageSize: "20" });
    if (search.trim()) value.set("search", search.trim());
    if (filter !== "ALL") value.set("status", filter);
    return value;
  }, [filter, page, search]);

  const collection = useProfessionalCollection<BookingItem>({
    endpoint: `/api/enterprise/${organizationId}/gaming/bookings`,
    params,
    refreshKey,
  });

  const lookupOpen = createOpen || Boolean(editFor);
  const conversionOpen = confirmState?.kind === "CONVERT";

  useEffect(() => {
    if (!lookupOpen) return;
    const controller = new AbortController();
    const query = new URLSearchParams({ page: String(stationPage), pageSize: "20" });
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
  }, [copy.loadStationsFailed, lookupOpen, organizationId, refreshKey, stationPage]);

  useEffect(() => {
    if (!lookupOpen) return;
    const controller = new AbortController();
    const query = new URLSearchParams({ page: String(customerPage), pageSize: "20", role: "CUSTOMER", status: "ACTIVE" });
    if (customerSearch.trim()) query.set("search", customerSearch.trim());
    setCustomerLoading(true);
    setCustomerError("");
    fetch(`/api/enterprise/${organizationId}/business-parties?${query.toString()}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body = await response.json().catch(() => null) as { items?: Customer[]; pagination?: Pagination; message?: string; error?: string } | null;
        if (!response.ok || !body?.items || !body.pagination) throw new Error(body?.message || body?.error || copy.loadCustomersFailed);
        setCustomers(body.items);
        setCustomerPagination(body.pagination);
      })
      .catch((error: unknown) => {
        if ((error as { name?: string })?.name === "AbortError") return;
        setCustomerError(error instanceof Error ? error.message : copy.loadCustomersFailed);
      })
      .finally(() => setCustomerLoading(false));
    return () => controller.abort();
  }, [copy.loadCustomersFailed, customerPage, customerSearch, lookupOpen, organizationId, refreshKey]);

  useEffect(() => {
    if (!conversionOpen) return;
    const controller = new AbortController();
    setConversionLoading(true);
    setConversionError("");
    fetch(`/api/enterprise/${organizationId}/catalog?page=${conversionServicePage}&pageSize=20&itemType=SERVICE&status=ACTIVE`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body = await response.json().catch(() => null) as { items?: CatalogService[]; pagination?: Pagination; message?: string; error?: string } | null;
        if (!response.ok || !body?.items || !body.pagination) throw new Error(body?.message || body?.error || copy.loadServicesFailed);
        setConversionServices(body.items);
        setConversionPagination(body.pagination);
        setConversionServiceId((current) => current && body.items.some((service) => service.id === current) ? current : body.items[0]?.id || "");
        setConversionQuote(null);
      })
      .catch((error: unknown) => {
        if ((error as { name?: string })?.name === "AbortError") return;
        setConversionError(error instanceof Error ? error.message : copy.loadServicesFailed);
      })
      .finally(() => setConversionLoading(false));
    return () => controller.abort();
  }, [conversionOpen, conversionServicePage, copy.loadServicesFailed, organizationId]);

  const calendarGroups = useMemo(() => {
    const formatter = new Intl.DateTimeFormat(locale === "en" ? "en" : "fr", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
    const sorted = [...collection.items].sort((a, b) => new Date(a.scheduledStartAt).getTime() - new Date(b.scheduledStartAt).getTime());
    const groups = new Map<string, { label: string; items: BookingItem[] }>();
    for (const item of sorted) {
      const date = new Date(item.scheduledStartAt);
      const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
      const group = groups.get(key) || { label: formatter.format(date), items: [] };
      group.items.push(item);
      groups.set(key, group);
    }
    return [...groups.values()];
  }, [collection.items, locale]);

  const initialSlot = useMemo(() => {
    const start = new Date(Date.now() + 15 * 60_000);
    start.setSeconds(0, 0);
    const end = new Date(start.getTime() + 60 * 60_000);
    return { start: toDateTimeLocal(start), end: toDateTimeLocal(end) };
  }, [createOpen]);

  function resetFeedback() {
    setMessage("");
    setSuccess("");
  }

  function resetConversion() {
    setConversionServicePage(1);
    setConversionServiceId("");
    setConversionQuote(null);
    setConversionError("");
  }

  function refreshAndClose() {
    setDetail(null);
    setEditFor(null);
    setConfirmState(null);
    resetConversion();
    setRefreshKey((value) => value + 1);
  }

  function customerItems(selected?: BookingItem | null) {
    const options = [{ id: "", label: copy.occasionalPlayer }, ...customers.map((customer) => ({ id: customer.id, label: `${customer.displayName || customer.legalName} · ${customer.code}` }))];
    if (selected?.customer && !options.some((option) => option.id === selected.customer?.id)) {
      options.push({ id: selected.customer.id, label: `${selected.customer.displayName || selected.customer.legalName} · ${selected.customer.code}` });
    }
    return options;
  }

  function stationItems(selected?: BookingItem | null) {
    const options = stations.map((station) => ({ id: station.id, label: `${station.stationCode} · ${station.displayName || station.consoleFamily || "Gaming"} · ${station.effectiveStatus}` }));
    if (selected && !options.some((option) => option.id === selected.station.id)) {
      options.push({ id: selected.station.id, label: `${selected.station.stationCode} · ${selected.station.displayName || selected.station.consoleFamily || "Gaming"} · ${selected.station.status}` });
    }
    return options;
  }

  async function createBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    resetFeedback();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      await professionalMutation(`/api/enterprise/${organizationId}/gaming/bookings`, {
        stationId: String(form.get("stationId") || ""),
        businessPartyId: String(form.get("businessPartyId") || "") || null,
        scheduledStartAt: new Date(String(form.get("scheduledStartAt") || "")).toISOString(),
        scheduledEndAt: new Date(String(form.get("scheduledEndAt") || "")).toISOString(),
        playerCount: Number(form.get("playerCount") || 1),
        notes: String(form.get("notes") || "") || null,
        status: String(form.get("status") || "CONFIRMED"),
        idempotencyKey: newCommandKey(),
      });
      setCreateOpen(false);
      setSuccess(copy.created);
      setStationPage(1);
      setCustomerPage(1);
      setCustomerSearch("");
      setRefreshKey((value) => value + 1);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : copy.created);
    } finally {
      setBusy(false);
    }
  }

  async function editBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editFor) return;
    resetFeedback();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      await professionalMutation(`/api/enterprise/${organizationId}/gaming/bookings/${editFor.id}`, {
        action: "UPDATE",
        revision: editFor.revision,
        stationId: String(form.get("stationId") || ""),
        businessPartyId: String(form.get("businessPartyId") || "") || null,
        scheduledStartAt: new Date(String(form.get("scheduledStartAt") || "")).toISOString(),
        scheduledEndAt: new Date(String(form.get("scheduledEndAt") || "")).toISOString(),
        playerCount: Number(form.get("playerCount") || 1),
        notes: String(form.get("notes") || "") || null,
        idempotencyKey: newCommandKey(),
      }, "PATCH");
      refreshAndClose();
      setSuccess(copy.updated);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : copy.updated);
    } finally {
      setBusy(false);
    }
  }

  async function previewConversionPrice() {
    if (!confirmState || confirmState.kind !== "CONVERT" || !conversionServiceId) return;
    resetFeedback();
    setBusy(true);
    setConversionQuote(null);
    try {
      const body = await professionalMutation(`/api/enterprise/${organizationId}/gaming/pricing/simulate`, {
        serviceCatalogItemId: conversionServiceId,
        stationId: confirmState.item.stationId,
        durationMinutes: minutesBetween(confirmState.item.scheduledStartAt, confirmState.item.scheduledEndAt),
        playerCount: confirmState.item.playerCount,
      }) as { quote?: PricingQuote };
      if (!body.quote) throw new Error(copy.previewRequired);
      setConversionQuote(body.quote);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : copy.previewRequired);
    } finally {
      setBusy(false);
    }
  }

  async function runCommand() {
    if (!confirmState) return;
    if (confirmState.kind === "CONVERT" && (!conversionServiceId || !conversionQuote || conversionQuote.service.id !== conversionServiceId)) {
      setMessage(copy.previewRequired);
      return;
    }
    resetFeedback();
    setBusy(true);
    try {
      await professionalMutation(`/api/enterprise/${organizationId}/gaming/bookings/${confirmState.item.id}`, {
        action: confirmState.kind,
        revision: confirmState.item.revision,
        idempotencyKey: newCommandKey(),
        ...(confirmState.kind === "CONVERT" ? { serviceCatalogItemId: conversionServiceId } : {}),
      }, "PATCH");
      const successByKind = {
        CONFIRM: copy.confirmedSuccess,
        CHECK_IN: copy.checkedInSuccess,
        CONVERT: copy.convertedSuccess,
        NO_SHOW: copy.noShowSuccess,
        CANCEL: copy.cancelledSuccess,
      } as const;
      refreshAndClose();
      setSuccess(successByKind[confirmState.kind]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : copy.updated);
    } finally {
      setBusy(false);
    }
  }

  function actions(item: BookingItem) {
    const editable = item.status === "DRAFT" || item.status === "CONFIRMED";
    const cancellable = item.status === "DRAFT" || item.status === "CONFIRMED" || item.status === "CHECKED_IN";
    return [
      { id: "edit", label: copy.edit, icon: Pencil, hidden: !collection.canWrite || !editable, disabled: busy, onSelect: () => { setDetail(null); resetFeedback(); setStationPage(1); setCustomerPage(1); setCustomerSearch(""); setEditFor(item); } },
      { id: "confirm", label: copy.confirm, icon: CheckCircle2, hidden: !collection.canWrite || item.status !== "DRAFT", disabled: busy, onSelect: () => { setDetail(null); setConfirmState({ kind: "CONFIRM", item }); } },
      { id: "check-in", label: copy.checkIn, icon: LogIn, hidden: !collection.canWrite || item.status !== "CONFIRMED", disabled: busy, onSelect: () => { setDetail(null); setConfirmState({ kind: "CHECK_IN", item }); } },
      { id: "convert", label: copy.convert, icon: Play, hidden: !collection.canWrite || item.status !== "CHECKED_IN", disabled: busy, onSelect: () => { setDetail(null); resetFeedback(); resetConversion(); setConfirmState({ kind: "CONVERT", item }); } },
      { id: "no-show", label: copy.markNoShow, icon: UserX, hidden: !collection.canWrite || item.status !== "CONFIRMED", disabled: busy, separatorBefore: true, onSelect: () => { setDetail(null); setConfirmState({ kind: "NO_SHOW", item }); } },
      { id: "cancel", label: copy.cancelBooking, icon: XCircle, hidden: !collection.canWrite || !cancellable, disabled: busy, destructive: true, onSelect: () => { setDetail(null); setConfirmState({ kind: "CANCEL", item }); } },
    ];
  }

  const statusTabs: Array<{ id: Filter; label: string; count?: number }> = [
    { id: "ALL", label: copy.all, count: collection.metrics.total },
    { id: "DRAFT", label: copy.draft, count: collection.metrics.draft },
    { id: "CONFIRMED", label: copy.confirmed, count: collection.metrics.confirmed },
    { id: "CHECKED_IN", label: copy.checkedIn, count: collection.metrics.checkedIn },
    { id: "NO_SHOW", label: copy.noShow, count: collection.metrics.noShow },
    { id: "CONVERTED", label: copy.converted, count: collection.metrics.converted },
  ];
  const viewTabs: Array<{ id: ViewMode; label: string }> = [
    { id: "LIST", label: copy.listView },
    { id: "CALENDAR", label: copy.calendarView },
  ];

  return (
    <ModuleWorkspace>
      <ModuleHeader
        eyebrow={`${copy.eyebrow} · ${organizationName}`}
        title={copy.title}
        description={locale === "en" ? definition.descriptionEn : definition.descriptionFr}
        count={copy.bookingCount(collection.pagination.total)}
        primaryAction={collection.canWrite ? <Button onClick={() => { resetFeedback(); setStationPage(1); setCustomerPage(1); setCustomerSearch(""); setCreateOpen(true); }}><Plus className="h-4 w-4" />{copy.newBooking}</Button> : undefined}
      />

      <ModuleMetrics label={copy.metricsLabel}>
        <ModuleMetric label={copy.draft} value={collection.metrics.draft || 0} />
        <ModuleMetric label={copy.confirmed} value={collection.metrics.confirmed || 0} />
        <ModuleMetric label={copy.checkedIn} value={collection.metrics.checkedIn || 0} />
        <ModuleMetric label={copy.converted} value={collection.metrics.converted || 0} />
      </ModuleMetrics>

      <ModuleToolbar
        search={<ProfessionalSearch value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder={copy.searchPlaceholder} />}
        controls={<div className="grid min-w-0 gap-2"><ProfessionalTabs value={filter} onChange={(value) => { setFilter(value); setPage(1); }} items={statusTabs} label={copy.viewsLabel} /><ProfessionalTabs value={view} onChange={setView} items={viewTabs} label={copy.viewsLabel} /></div>}
        summary={copy.page(collection.pagination.page, collection.pagination.pageCount)}
      />

      <ModuleContent>
        {message && !createOpen && !editFor && !confirmState ? <ProfessionalError message={message} /> : null}
        <ModuleSection id="gaming-bookings-board" title={copy.sectionTitle} description={view === "CALENDAR" ? copy.calendarHelp : copy.sectionDescription} defaultOpen>
          {collection.loading ? <ProfessionalLoading /> : collection.error ? <ProfessionalError message={collection.error} /> : collection.items.length ? (
            <>
              {view === "LIST" ? (
                <BusinessList ariaLabel={copy.sectionTitle} className="grid gap-3 divide-y-0 border-0 bg-transparent sm:grid-cols-2 xl:grid-cols-3">
                  {collection.items.map((item) => <BookingCard key={item.id} item={item} copy={copy} locale={locale} onOpen={() => { resetFeedback(); setDetail(item); }} />)}
                </BusinessList>
              ) : (
                <div className="grid gap-5">
                  {calendarGroups.map((group) => (
                    <section key={group.label} className="min-w-0 rounded-2xl border border-dtsc-border bg-dtsc-soft/40 p-3 sm:p-4">
                      <h3 className="text-sm font-black capitalize text-dtsc-ink">{group.label}</h3>
                      <div className="mt-3 grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-3">
                        {group.items.map((item) => <BookingCard key={item.id} item={item} copy={copy} locale={locale} onOpen={() => { resetFeedback(); setDetail(item); }} />)}
                      </div>
                    </section>
                  ))}
                </div>
              )}
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
        description={detail ? `${detail.station.stationCode} · ${detail.site?.name || copy.unnamedSite}` : undefined}
        actions={detail ? actions(detail) : []}
        actionLabel={copy.actions}
      >
        {detail ? <BookingDetail item={detail} copy={copy} locale={locale} /> : null}
      </FullscreenEntityDetail>

      <Dialog open={createOpen} onClose={() => !busy && setCreateOpen(false)} title={copy.createTitle} description={copy.createDescription} className="h-[92dvh]" footer={<><Button variant="secondary" disabled={busy} onClick={() => setCreateOpen(false)}>{copy.cancel}</Button><Button form="gaming-booking-create" type="submit" disabled={busy || !stations.length}>{copy.save}</Button></>}>
        <BookingForm
          id="gaming-booking-create"
          onSubmit={createBooking}
          copy={copy}
          stations={stationItems()}
          stationLoading={stationLoading}
          stationError={stationError}
          stationPage={stationPage}
          stationPagination={stationPagination}
          setStationPage={setStationPage}
          customers={customerItems()}
          customerSearch={customerSearch}
          setCustomerSearch={(value) => { setCustomerSearch(value); setCustomerPage(1); }}
          customerLoading={customerLoading}
          customerError={customerError}
          customerPage={customerPage}
          customerPagination={customerPagination}
          setCustomerPage={setCustomerPage}
          defaultStart={initialSlot.start}
          defaultEnd={initialSlot.end}
          busy={busy}
          message={message}
          showStatus
        />
      </Dialog>

      <Dialog open={Boolean(editFor)} onClose={() => !busy && setEditFor(null)} title={copy.editTitle} description={copy.editDescription} className="h-[92dvh]" footer={<><Button variant="secondary" disabled={busy} onClick={() => setEditFor(null)}>{copy.cancel}</Button><Button form="gaming-booking-edit" type="submit" disabled={busy || !stations.length}>{copy.save}</Button></>}>
        {editFor ? <BookingForm
          id="gaming-booking-edit"
          onSubmit={editBooking}
          copy={copy}
          stations={stationItems(editFor)}
          stationLoading={stationLoading}
          stationError={stationError}
          stationPage={stationPage}
          stationPagination={stationPagination}
          setStationPage={setStationPage}
          customers={customerItems(editFor)}
          customerSearch={customerSearch}
          setCustomerSearch={(value) => { setCustomerSearch(value); setCustomerPage(1); }}
          customerLoading={customerLoading}
          customerError={customerError}
          customerPage={customerPage}
          customerPagination={customerPagination}
          setCustomerPage={setCustomerPage}
          defaultStationId={editFor.stationId}
          defaultCustomerId={editFor.businessPartyId || ""}
          defaultStart={toDateTimeLocal(editFor.scheduledStartAt)}
          defaultEnd={toDateTimeLocal(editFor.scheduledEndAt)}
          defaultPlayers={editFor.playerCount}
          defaultNotes={editFor.notes || ""}
          busy={busy}
          message={message}
        /> : null}
      </Dialog>

      <BookingCommandDialog state={confirmState?.kind === "CONVERT" ? null : confirmState} copy={copy} busy={busy} onClose={() => !busy && setConfirmState(null)} onConfirm={() => void runCommand()} />
      <BookingConversionDialog
        item={conversionOpen ? confirmState?.item || null : null}
        copy={copy}
        locale={locale}
        busy={busy}
        services={conversionServices}
        selectedServiceId={conversionServiceId}
        setSelectedServiceId={(value) => { setConversionServiceId(value); setConversionQuote(null); setMessage(""); }}
        loading={conversionLoading}
        error={conversionError || message}
        quote={conversionQuote}
        page={conversionServicePage}
        pagination={conversionPagination}
        setPage={setConversionServicePage}
        onPreview={() => void previewConversionPrice()}
        onClose={() => { if (!busy) { setConfirmState(null); resetConversion(); setMessage(""); } }}
        onConfirm={() => void runCommand()}
      />
    </ModuleWorkspace>
  );
}

function BookingCard({ item, copy, locale, onOpen }: { item: BookingItem; copy: ReturnType<typeof gamingBookingsCopy>; locale: string | null | undefined; onOpen: () => void }) {
  const formatter = new Intl.DateTimeFormat(locale === "en" ? "en" : "fr", { dateStyle: "medium", timeStyle: "short" });
  const start = formatter.format(new Date(item.scheduledStartAt));
  const end = formatter.format(new Date(item.scheduledEndAt));
  return (
    <BusinessListItem
      className="rounded-2xl border border-dtsc-border bg-dtsc-surface px-4 shadow-sm"
      leading={<CalendarClock className="h-5 w-5 text-dtsc-blue" />}
      title={item.station.displayName || item.station.stationCode}
      status={<StatusBadge tone={statusTone(item.status)}>{copy.status[item.status] || item.status}</StatusBadge>}
      meta={`${start} → ${end}`}
      description={`${item.customer?.displayName || item.customer?.legalName || copy.occasional} · ${item.playerCount} · ${item.site?.name || copy.unnamedSite}`}
      onOpen={onOpen}
      openLabel={`${copy.detailTitle} ${item.reference}`}
    />
  );
}

function BookingForm({
  id,
  onSubmit,
  copy,
  stations,
  stationLoading,
  stationError,
  stationPage,
  stationPagination,
  setStationPage,
  customers,
  customerSearch,
  setCustomerSearch,
  customerLoading,
  customerError,
  customerPage,
  customerPagination,
  setCustomerPage,
  defaultStationId,
  defaultCustomerId,
  defaultStart,
  defaultEnd,
  defaultPlayers = 1,
  defaultNotes = "",
  busy,
  message,
  showStatus = false,
}: {
  id: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  copy: ReturnType<typeof gamingBookingsCopy>;
  stations: Array<{ id: string; label: string }>;
  stationLoading: boolean;
  stationError: string;
  stationPage: number;
  stationPagination: Pagination;
  setStationPage: (value: number | ((current: number) => number)) => void;
  customers: Array<{ id: string; label: string }>;
  customerSearch: string;
  setCustomerSearch: (value: string) => void;
  customerLoading: boolean;
  customerError: string;
  customerPage: number;
  customerPagination: Pagination;
  setCustomerPage: (value: number | ((current: number) => number)) => void;
  defaultStationId?: string;
  defaultCustomerId?: string;
  defaultStart: string;
  defaultEnd: string;
  defaultPlayers?: number;
  defaultNotes?: string;
  busy: boolean;
  message: string;
  showStatus?: boolean;
}) {
  return (
    <form id={id} onSubmit={onSubmit} className="grid gap-5 p-4 sm:p-5">
      {message ? <ProfessionalError message={message} /> : null}
      <ProfessionalFormSection title={copy.slot} description={copy.sectionDescription}>
        {stationError ? <div className="md:col-span-2"><ProfessionalError message={stationError} /></div> : null}
        {stationLoading ? <div className="md:col-span-2"><ProfessionalLoading rows={2} /></div> : stations.length ? <Field label={copy.station} required><NativeSelect name="stationId" required defaultValue={defaultStationId} items={stations} /></Field> : <div className="md:col-span-2 text-sm font-bold text-dtsc-muted">{copy.noStations}</div>}
        <Field label={copy.players} required><Input name="playerCount" type="number" min={1} max={16} defaultValue={defaultPlayers} required /></Field>
        <Field label={copy.startAt} required><Input name="scheduledStartAt" type="datetime-local" defaultValue={defaultStart} required /></Field>
        <Field label={copy.endAt} required><Input name="scheduledEndAt" type="datetime-local" defaultValue={defaultEnd} required /></Field>
        <div className="flex min-w-0 items-center justify-between gap-2 md:col-span-2">
          <Button type="button" variant="secondary" disabled={stationPage <= 1 || stationLoading} onClick={() => setStationPage((value) => Math.max(1, value - 1))}>{copy.previous}</Button>
          <span className="text-xs font-bold text-dtsc-muted">{copy.page(stationPagination.page, stationPagination.pageCount)}</span>
          <Button type="button" variant="secondary" disabled={stationPage >= stationPagination.pageCount || stationLoading} onClick={() => setStationPage((value) => Math.min(stationPagination.pageCount, value + 1))}>{copy.next}</Button>
        </div>
      </ProfessionalFormSection>

      <ProfessionalFormSection title={copy.customer} description={copy.customerHelp}>
        <Field label={copy.customerSearch}><Input value={customerSearch} onChange={(event) => setCustomerSearch(event.target.value)} placeholder={copy.customerSearch} /></Field>
        {customerError ? <div className="md:col-span-2"><ProfessionalError message={customerError} /></div> : null}
        {customerLoading ? <div className="md:col-span-2"><ProfessionalLoading rows={2} /></div> : <Field label={copy.customer}><NativeSelect name="businessPartyId" defaultValue={defaultCustomerId} items={customers} /></Field>}
        {!customerLoading && customers.length <= 1 ? <div className="text-sm font-bold text-dtsc-muted">{copy.noCustomers}</div> : null}
        <div className="flex min-w-0 items-center justify-between gap-2 md:col-span-2">
          <Button type="button" variant="secondary" disabled={customerPage <= 1 || customerLoading} onClick={() => setCustomerPage((value) => Math.max(1, value - 1))}>{copy.previous}</Button>
          <span className="text-xs font-bold text-dtsc-muted">{copy.page(customerPagination.page, customerPagination.pageCount)}</span>
          <Button type="button" variant="secondary" disabled={customerPage >= customerPagination.pageCount || customerLoading} onClick={() => setCustomerPage((value) => Math.min(customerPagination.pageCount, value + 1))}>{copy.next}</Button>
        </div>
      </ProfessionalFormSection>

      <ProfessionalFormSection title={copy.notes}>
        <Field label={copy.notes}><textarea name="notes" defaultValue={defaultNotes} rows={4} className="min-h-24 w-full min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-base text-dtsc-ink md:text-sm" /></Field>
        {showStatus ? <Field label={copy.initialStatus}><NativeSelect name="status" defaultValue="CONFIRMED" items={[{ id: "DRAFT", label: copy.saveDraft }, { id: "CONFIRMED", label: copy.confirmNow }]} /></Field> : null}
      </ProfessionalFormSection>
      <input type="hidden" aria-hidden="true" disabled={busy} />
    </form>
  );
}

function BookingCommandDialog({ state, copy, busy, onClose, onConfirm }: { state: ConfirmState; copy: ReturnType<typeof gamingBookingsCopy>; busy: boolean; onClose: () => void; onConfirm: () => void }) {
  if (!state) return <Dialog open={false} onClose={onClose} title={copy.detailTitle}><div /></Dialog>;
  const config = {
    CONFIRM: { title: copy.confirmTitle, description: copy.confirmDescription, label: copy.confirmAction, destructive: false },
    CHECK_IN: { title: copy.checkInTitle, description: copy.checkInDescription, label: copy.checkInAction, destructive: false },
    CONVERT: { title: copy.convertTitle, description: copy.convertDescription, label: copy.convertAction, destructive: false },
    NO_SHOW: { title: copy.noShowTitle, description: copy.noShowDescription, label: copy.noShowAction, destructive: true },
    CANCEL: { title: copy.cancelTitle, description: copy.cancelDescription, label: copy.cancelAction, destructive: true },
  }[state.kind];
  return (
    <Dialog open onClose={onClose} title={config.title} description={config.description} footer={<><Button variant="secondary" disabled={busy} onClick={onClose}>{copy.close}</Button><Button variant={config.destructive ? "destructive" : "default"} disabled={busy} onClick={onConfirm}>{config.label}</Button></>}>
      <div className="p-4 text-sm font-bold text-dtsc-ink sm:p-5">{state.item.reference} · {state.item.station.stationCode}</div>
    </Dialog>
  );
}

function BookingConversionDialog({
  item,
  copy,
  locale,
  busy,
  services,
  selectedServiceId,
  setSelectedServiceId,
  loading,
  error,
  quote,
  page,
  pagination,
  setPage,
  onPreview,
  onClose,
  onConfirm,
}: {
  item: BookingItem | null;
  copy: ReturnType<typeof gamingBookingsCopy>;
  locale: string | null | undefined;
  busy: boolean;
  services: CatalogService[];
  selectedServiceId: string;
  setSelectedServiceId: (value: string) => void;
  loading: boolean;
  error: string;
  quote: PricingQuote | null;
  page: number;
  pagination: Pagination;
  setPage: (value: number | ((current: number) => number)) => void;
  onPreview: () => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog
      open={Boolean(item)}
      onClose={onClose}
      title={copy.convertTitle}
      description={copy.convertDescription}
      className="h-[92dvh]"
      footer={<>
        <Button variant="secondary" disabled={busy} onClick={onClose}>{copy.close}</Button>
        <Button variant="secondary" disabled={busy || loading || !selectedServiceId} onClick={onPreview}>{copy.previewPrice}</Button>
        <Button disabled={busy || !quote || quote.service.id !== selectedServiceId} onClick={onConfirm}>{copy.convertAction}</Button>
      </>}
    >
      {item ? (
        <div className="grid gap-5 p-4 sm:p-5">
          {error ? <ProfessionalError message={error} /> : null}
          <div className="rounded-2xl border border-dtsc-border bg-dtsc-soft/50 p-4 text-sm font-bold text-dtsc-ink">
            {item.reference} · {item.station.stationCode} · {copy.minutes(minutesBetween(item.scheduledStartAt, item.scheduledEndAt))} · {item.playerCount} {copy.players.toLowerCase()}
          </div>
          {loading ? <ProfessionalLoading rows={2} /> : services.length ? (
            <ProfessionalFormSection title={copy.pricingPreview} description={copy.convertDescription}>
              <Field label={copy.catalogService} required>
                <NativeSelect value={selectedServiceId} onChange={setSelectedServiceId} required items={services.map((service) => ({ id: service.id, label: `${service.code} · ${service.name}` }))} />
              </Field>
            </ProfessionalFormSection>
          ) : <div className="text-sm font-bold text-dtsc-muted">{copy.noServices}</div>}
          <div className="flex min-w-0 items-center justify-between gap-2">
            <Button type="button" variant="secondary" disabled={page <= 1 || loading} onClick={() => setPage((value) => Math.max(1, value - 1))}>{copy.previous}</Button>
            <span className="text-xs font-bold text-dtsc-muted">{copy.catalogService} · {copy.page(pagination.page, pagination.pageCount)}</span>
            <Button type="button" variant="secondary" disabled={page >= pagination.pageCount || loading} onClick={() => setPage((value) => Math.min(pagination.pageCount, value + 1))}>{copy.next}</Button>
          </div>
          {quote ? (
            <div className="rounded-2xl border border-dtsc-border bg-dtsc-soft p-4">
              <div className="text-xs font-black uppercase tracking-wide text-dtsc-muted">{copy.estimatedAmount}</div>
              <div className="mt-2 text-2xl font-black text-dtsc-ink">{formatEnterpriseAmount(quote.quotedAmount, quote.currency, locale)}</div>
              <div className="mt-1 text-sm font-bold text-dtsc-muted">{copy.selectedPricingRule}: {quote.pricingRuleCode} · {quote.service.name}</div>
            </div>
          ) : null}
        </div>
      ) : <div />}
    </Dialog>
  );
}

function BookingDetail({ item, copy, locale }: { item: BookingItem; copy: ReturnType<typeof gamingBookingsCopy>; locale: string | null | undefined }) {
  const formatDate = (value: string | null) => value ? new Date(value).toLocaleString(locale === "en" ? "en" : "fr") : "—";
  const customerName = item.customer?.displayName || item.customer?.legalName || copy.occasional;
  return (
    <div className="grid min-w-0 gap-5">
      <div className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Detail label={copy.reference} value={item.reference} />
        <Detail label={copy.statusLabel} value={copy.status[item.status] || item.status} />
        <Detail label={copy.station} value={`${item.station.stationCode} · ${item.station.displayName || item.station.consoleFamily || "—"}`} />
        <Detail label={copy.site} value={item.site?.name || copy.unnamedSite} />
        <Detail label={copy.customerLabel} value={customerName} />
        <Detail label={copy.players} value={String(item.playerCount)} />
        <Detail label={copy.startAt} value={formatDate(item.scheduledStartAt)} />
        <Detail label={copy.endAt} value={formatDate(item.scheduledEndAt)} />
        <Detail label={copy.duration} value={copy.minutes(minutesBetween(item.scheduledStartAt, item.scheduledEndAt))} />
        <Detail label={copy.createdAt} value={formatDate(item.createdAt)} />
        <Detail label={copy.confirmedAt} value={formatDate(item.confirmedAt)} />
        <Detail label={copy.checkedInAt} value={formatDate(item.checkedInAt)} />
        <Detail label={copy.convertedAt} value={formatDate(item.convertedAt)} />
        <Detail label={copy.noShowAt} value={formatDate(item.noShowAt)} />
        <Detail label={copy.cancelledAt} value={formatDate(item.cancelledAt)} />
        <Detail label={copy.session} value={item.session ? `${item.session.reference} · ${item.session.status}` : "—"} />
      </div>
      {item.notes ? <div className="rounded-2xl border border-dtsc-border bg-dtsc-surface p-4 text-sm leading-6 text-dtsc-ink">{item.notes}</div> : null}
      <div>
        <h3 className="text-sm font-black uppercase tracking-wide text-dtsc-muted">{copy.history}</h3>
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
