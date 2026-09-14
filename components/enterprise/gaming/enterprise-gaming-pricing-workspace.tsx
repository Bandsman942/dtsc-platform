"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { BadgeDollarSign, Calculator, Pencil, PlayCircle, PowerOff, Plus, Trash2 } from "lucide-react";
import { Field, NativeSelect, formatEnterpriseAmount } from "@/components/enterprise/core-v2/erp-v2-ui";
import { gamingPricingCopy } from "@/components/enterprise/gaming/gaming-pricing-i18n";
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

type PricingStatus = "DRAFT" | "ACTIVE" | "INACTIVE";
type PricingMode = "FIXED_DURATION" | "PER_MINUTE" | "PER_HOUR" | "PACKAGE";
type Currency = { code: string; name: string; symbol: string | null; isActive: boolean };
type CatalogService = { id: string; code: string; name: string; itemType: string; status?: string };
type Station = { id: string; stationCode: string; displayName: string | null; consoleFamily: string | null; maxPlayers: number };
type Pagination = { page: number; pageSize: number; total: number; pageCount: number };
type PricingRule = {
  id: string;
  code: string;
  serviceCatalogItemId: string;
  stationId: string | null;
  pricingMode: PricingMode;
  amount: string;
  currency: string;
  durationMinutes: number | null;
  billingIncrementMinutes: number | null;
  validFrom: string | null;
  validUntil: string | null;
  dayOfWeekMask: number | null;
  startMinuteOfDay: number | null;
  endMinuteOfDay: number | null;
  priority: number;
  status: PricingStatus;
  revision: number;
  targeting: { consoleFamily: string | null; minPlayers: number | null; maxPlayers: number | null; label: string | null };
  station: Station | null;
  catalogService: CatalogService | null;
};
type PricingExtra = { currencies?: Currency[] };
type Filter = "ALL" | PricingStatus;
type Quote = {
  pricingRuleId: string;
  pricingRuleCode: string;
  service: { id: string; code: string; name: string };
  station: { id: string; stationCode: string; displayName: string | null; consoleFamily: string | null };
  currency: string;
  quotedAmount: string;
};

function statusTone(status: PricingStatus): StatusBadgeTone {
  if (status === "ACTIVE") return "success";
  if (status === "DRAFT") return "warning";
  return "neutral";
}

function optionalNumber(value: FormDataEntryValue | null) {
  const text = String(value || "").trim();
  return text ? Number(text) : null;
}

function optionalText(value: FormDataEntryValue | null) {
  const text = String(value || "").trim();
  return text || null;
}

function localDateTimeValue(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function pricingPayload(form: FormData) {
  return {
    code: String(form.get("code") || ""),
    serviceCatalogItemId: String(form.get("serviceCatalogItemId") || ""),
    stationId: optionalText(form.get("stationId")),
    pricingMode: String(form.get("pricingMode") || "PER_HOUR"),
    amount: Number(form.get("amount") || 0),
    currency: String(form.get("currency") || ""),
    durationMinutes: optionalNumber(form.get("durationMinutes")),
    billingIncrementMinutes: optionalNumber(form.get("billingIncrementMinutes")),
    validFrom: optionalText(form.get("validFrom")),
    validUntil: optionalText(form.get("validUntil")),
    dayOfWeekMask: optionalNumber(form.get("dayOfWeekMask")),
    startMinuteOfDay: optionalNumber(form.get("startMinuteOfDay")),
    endMinuteOfDay: optionalNumber(form.get("endMinuteOfDay")),
    priority: Number(form.get("priority") || 100),
    consoleFamily: optionalText(form.get("consoleFamily")),
    minPlayers: optionalNumber(form.get("minPlayers")),
    maxPlayers: optionalNumber(form.get("maxPlayers")),
    label: optionalText(form.get("label")),
  };
}

export function EnterpriseGamingPricingWorkspace({
  organizationId,
  organizationName,
  definition,
}: {
  organizationId: string;
  organizationName: string;
  definition: EnterpriseModuleDefinition;
}) {
  const locale = useAppLocale();
  const copy = gamingPricingCopy(locale);
  const [filter, setFilter] = useState<Filter>("ALL");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [editFor, setEditFor] = useState<PricingRule | null>(null);
  const [detail, setDetail] = useState<PricingRule | null>(null);
  const [simulateOpen, setSimulateOpen] = useState(false);
  const [simulation, setSimulation] = useState<Quote | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState("");
  const [services, setServices] = useState<CatalogService[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [servicePage, setServicePage] = useState(1);
  const [stationPage, setStationPage] = useState(1);
  const [servicePagination, setServicePagination] = useState<Pagination>({ page: 1, pageSize: 50, total: 0, pageCount: 1 });
  const [stationPagination, setStationPagination] = useState<Pagination>({ page: 1, pageSize: 50, total: 0, pageCount: 1 });
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState("");

  useToastMessage(message, "error");
  useToastMessage(success, "success");

  const params = useMemo(() => {
    const value = new URLSearchParams({ page: String(page), pageSize: "20" });
    if (search.trim()) value.set("search", search.trim());
    if (filter !== "ALL") value.set("status", filter);
    return value;
  }, [filter, page, search]);

  const collection = useProfessionalCollection<PricingRule, PricingExtra>({
    endpoint: `/api/enterprise/${organizationId}/gaming/pricing`,
    params,
    refreshKey,
  });

  const dialogOpen = createOpen || Boolean(editFor) || simulateOpen;
  useEffect(() => {
    if (!dialogOpen) return;
    const controller = new AbortController();
    setLookupLoading(true);
    setLookupError("");
    Promise.all([
      fetch(`/api/enterprise/${organizationId}/catalog?page=${servicePage}&pageSize=50&itemType=SERVICE&status=ACTIVE`, { cache: "no-store", signal: controller.signal }),
      fetch(`/api/enterprise/${organizationId}/gaming/stations?page=${stationPage}&pageSize=50`, { cache: "no-store", signal: controller.signal }),
    ]).then(async ([serviceResponse, stationResponse]) => {
      const serviceBody = await serviceResponse.json().catch(() => null) as { items?: CatalogService[]; pagination?: Pagination; message?: string; error?: string } | null;
      const stationBody = await stationResponse.json().catch(() => null) as { items?: Station[]; pagination?: Pagination; message?: string; error?: string } | null;
      if (!serviceResponse.ok || !serviceBody?.items || !serviceBody.pagination) throw new Error(serviceBody?.message || serviceBody?.error || copy.loadServicesFailed);
      if (!stationResponse.ok || !stationBody?.items || !stationBody.pagination) throw new Error(stationBody?.message || stationBody?.error || copy.loadStationsFailed);
      setServices(serviceBody.items);
      setServicePagination(serviceBody.pagination);
      setStations(stationBody.items);
      setStationPagination(stationBody.pagination);
    }).catch((error: unknown) => {
      if ((error as { name?: string })?.name === "AbortError") return;
      setLookupError(error instanceof Error ? error.message : copy.loadServicesFailed);
    }).finally(() => setLookupLoading(false));
    return () => controller.abort();
  }, [copy.loadServicesFailed, copy.loadStationsFailed, dialogOpen, organizationId, servicePage, stationPage]);

  function resetFeedback() {
    setMessage("");
    setSuccess("");
  }

  function openCreate() {
    resetFeedback();
    setServicePage(1);
    setStationPage(1);
    setCreateOpen(true);
  }

  function refreshAndClose() {
    setCreateOpen(false);
    setEditFor(null);
    setDetail(null);
    setRefreshKey((value) => value + 1);
  }

  async function createRule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    resetFeedback();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      await professionalMutation(`/api/enterprise/${organizationId}/gaming/pricing`, {
        ...pricingPayload(form),
        status: String(form.get("status") || "DRAFT"),
      });
      refreshAndClose();
      setSuccess(copy.created);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : copy.created);
    } finally {
      setBusy(false);
    }
  }

  async function updateRule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editFor) return;
    resetFeedback();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      await professionalMutation(`/api/enterprise/${organizationId}/gaming/pricing/${editFor.id}`, {
        action: "UPDATE",
        revision: editFor.revision,
        ...pricingPayload(form),
      }, "PATCH");
      refreshAndClose();
      setSuccess(copy.updated);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : copy.updated);
    } finally {
      setBusy(false);
    }
  }

  async function lifecycle(rule: PricingRule, action: "ACTIVATE" | "DEACTIVATE" | "ARCHIVE") {
    resetFeedback();
    setBusy(true);
    try {
      await professionalMutation(`/api/enterprise/${organizationId}/gaming/pricing/${rule.id}`, {
        action,
        revision: rule.revision,
      }, "PATCH");
      refreshAndClose();
      setSuccess(action === "ACTIVATE" ? copy.activated : action === "DEACTIVATE" ? copy.deactivated : copy.archived);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : copy.updated);
    } finally {
      setBusy(false);
    }
  }

  async function simulate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    resetFeedback();
    setSimulation(null);
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      const response = await professionalMutation(`/api/enterprise/${organizationId}/gaming/pricing/simulate`, {
        serviceCatalogItemId: String(form.get("serviceCatalogItemId") || ""),
        stationId: String(form.get("stationId") || ""),
        durationMinutes: Number(form.get("durationMinutes") || 60),
        playerCount: Number(form.get("playerCount") || 1),
        startAt: optionalText(form.get("startAt")),
      }) as { quote?: Quote };
      if (!response.quote) throw new Error("SIMULATION_RESULT_MISSING");
      setSimulation(response.quote);
      setSuccess(copy.simulated);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : copy.simulated);
    } finally {
      setBusy(false);
    }
  }

  function actions(rule: PricingRule) {
    return [
      { id: "edit", label: copy.edit, icon: Pencil, hidden: !collection.canWrite, disabled: busy, onSelect: () => { setDetail(null); setEditFor(rule); } },
      { id: "activate", label: copy.activate, icon: PlayCircle, hidden: !collection.canManage || rule.status === "ACTIVE", disabled: busy, onSelect: () => void lifecycle(rule, "ACTIVATE") },
      { id: "deactivate", label: copy.deactivate, icon: PowerOff, hidden: !collection.canManage || rule.status !== "ACTIVE", disabled: busy, onSelect: () => void lifecycle(rule, "DEACTIVATE") },
      { id: "archive", label: copy.archive, icon: Trash2, destructive: true, separatorBefore: true, hidden: !collection.canManage, disabled: busy, onSelect: () => void lifecycle(rule, "ARCHIVE") },
    ];
  }

  const tabs: Array<{ id: Filter; label: string; count?: number }> = [
    { id: "ALL", label: copy.all, count: collection.metrics.total },
    { id: "ACTIVE", label: copy.active, count: collection.metrics.active },
    { id: "DRAFT", label: copy.draft, count: collection.metrics.draft },
    { id: "INACTIVE", label: copy.inactive, count: collection.metrics.inactive },
  ];

  return (
    <ModuleWorkspace>
      <ModuleHeader
        eyebrow={`${copy.eyebrow} · ${organizationName}`}
        title={copy.title}
        description={locale === "en" ? definition.descriptionEn : definition.descriptionFr}
        count={copy.ruleCount(collection.pagination.total)}
        primaryAction={collection.canWrite ? <Button onClick={openCreate}><Plus className="h-4 w-4" />{copy.newRule}</Button> : undefined}
        secondaryActions={<Button variant="secondary" onClick={() => { resetFeedback(); setSimulation(null); setServicePage(1); setStationPage(1); setSimulateOpen(true); }}><Calculator className="h-4 w-4" />{copy.simulate}</Button>}
      />

      <ModuleMetrics label={copy.metricsLabel}>
        <ModuleMetric label={copy.active} value={collection.metrics.active || 0} />
        <ModuleMetric label={copy.draft} value={collection.metrics.draft || 0} />
        <ModuleMetric label={copy.inactive} value={collection.metrics.inactive || 0} />
      </ModuleMetrics>

      <ModuleToolbar
        search={<ProfessionalSearch value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder={copy.searchPlaceholder} />}
        controls={<ProfessionalTabs value={filter} onChange={(value) => { setFilter(value); setPage(1); }} items={tabs} label={copy.viewsLabel} />}
        summary={copy.page(collection.pagination.page, collection.pagination.pageCount)}
      />

      <ModuleContent>
        {message && !dialogOpen ? <ProfessionalError message={message} /> : null}
        <div className="rounded-2xl border border-dtsc-border bg-dtsc-soft/60 p-4">
          <div className="flex items-center gap-2 text-sm font-black text-dtsc-ink"><BadgeDollarSign className="h-4 w-4 text-dtsc-blue" />{copy.serverAuthority}</div>
          <p className="mt-1 text-sm leading-6 text-dtsc-muted">{copy.serverAuthorityDescription}</p>
        </div>
        <ModuleSection id="gaming-pricing-rules" title={copy.sectionTitle} description={copy.sectionDescription} defaultOpen>
          {collection.loading ? <ProfessionalLoading /> : collection.error ? <ProfessionalError message={collection.error} /> : collection.items.length ? (
            <>
              <BusinessList ariaLabel={copy.sectionTitle}>
                {collection.items.map((rule) => (
                  <BusinessListItem
                    key={rule.id}
                    leading={<BadgeDollarSign className="h-5 w-5 text-dtsc-blue" />}
                    title={rule.targeting.label || rule.catalogService?.name || rule.code}
                    status={<StatusBadge tone={statusTone(rule.status)}>{copy.statuses[rule.status] || rule.status}</StatusBadge>}
                    meta={`${rule.code} · ${copy.modes[rule.pricingMode] || rule.pricingMode} · ${formatEnterpriseAmount(rule.amount, rule.currency, locale)}`}
                    description={`${rule.catalogService?.code || rule.serviceCatalogItemId}${rule.station ? ` · ${rule.station.stationCode}` : ""} · ${copy.priority}: ${rule.priority}`}
                    onOpen={() => { resetFeedback(); setDetail(rule); }}
                    openLabel={`${copy.detailTitle} ${rule.code}`}
                  />
                ))}
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
        title={detail?.targeting.label || detail?.code || copy.detailTitle}
        description={detail ? `${detail.code} · ${detail.catalogService?.name || detail.serviceCatalogItemId}` : undefined}
        actions={detail ? actions(detail) : []}
        actionLabel={copy.actions}
      >
        {detail ? <PricingDetail rule={detail} copy={copy} locale={locale} /> : null}
      </FullscreenEntityDetail>

      <Dialog
        open={createOpen}
        onClose={() => !busy && setCreateOpen(false)}
        title={copy.createTitle}
        description={copy.createDescription}
        className="h-[92dvh]"
        footer={<><Button variant="secondary" disabled={busy} onClick={() => setCreateOpen(false)}>{copy.cancel}</Button><Button form="gaming-pricing-create" type="submit" disabled={busy || !services.length}>{copy.save}</Button></>}
      >
        <PricingRuleForm
          id="gaming-pricing-create"
          onSubmit={createRule}
          copy={copy}
          services={services}
          stations={stations}
          currencies={collection.extra.currencies || []}
          loading={lookupLoading}
          error={lookupError || message}
          servicePage={servicePage}
          stationPage={stationPage}
          servicePagination={servicePagination}
          stationPagination={stationPagination}
          setServicePage={setServicePage}
          setStationPage={setStationPage}
        />
      </Dialog>

      <Dialog
        open={Boolean(editFor)}
        onClose={() => !busy && setEditFor(null)}
        title={copy.editTitle}
        className="h-[92dvh]"
        footer={<><Button variant="secondary" disabled={busy} onClick={() => setEditFor(null)}>{copy.cancel}</Button><Button form="gaming-pricing-edit" type="submit" disabled={busy}>{copy.save}</Button></>}
      >
        {editFor ? <PricingRuleForm
          id="gaming-pricing-edit"
          onSubmit={updateRule}
          copy={copy}
          services={services}
          stations={stations}
          currencies={collection.extra.currencies || []}
          loading={lookupLoading}
          error={lookupError || message}
          rule={editFor}
          servicePage={servicePage}
          stationPage={stationPage}
          servicePagination={servicePagination}
          stationPagination={stationPagination}
          setServicePage={setServicePage}
          setStationPage={setStationPage}
        /> : null}
      </Dialog>

      <Dialog
        open={simulateOpen}
        onClose={() => !busy && setSimulateOpen(false)}
        title={copy.simulateTitle}
        description={copy.simulateDescription}
        className="h-[92dvh]"
        footer={<><Button variant="secondary" disabled={busy} onClick={() => setSimulateOpen(false)}>{copy.cancel}</Button><Button form="gaming-pricing-simulate" type="submit" disabled={busy || !services.length || !stations.length}><Calculator className="h-4 w-4" />{copy.simulate}</Button></>}
      >
        <form id="gaming-pricing-simulate" onSubmit={simulate} className="grid gap-5 p-4 sm:p-5">
          {lookupError || message ? <ProfessionalError message={lookupError || message} /> : null}
          {lookupLoading ? <ProfessionalLoading rows={2} /> : (
            <ProfessionalFormSection title={copy.simulateTitle} description={copy.simulateDescription}>
              <Field label={copy.service} required><NativeSelect name="serviceCatalogItemId" required items={services.map((service) => ({ id: service.id, label: `${service.code} · ${service.name}` }))} /></Field>
              <Field label={copy.station} required><NativeSelect name="stationId" required items={stations.map((station) => ({ id: station.id, label: `${station.stationCode} · ${station.displayName || station.consoleFamily || "Gaming"}` }))} /></Field>
              <Field label={copy.duration} required><Input name="durationMinutes" type="number" min={1} max={1440} defaultValue={60} required /></Field>
              <Field label={copy.playerCount} required><Input name="playerCount" type="number" min={1} max={16} defaultValue={1} required /></Field>
              <Field label={copy.validFrom}><Input name="startAt" type="datetime-local" /></Field>
            </ProfessionalFormSection>
          )}
          {simulation ? (
            <div className="rounded-2xl border border-dtsc-border bg-dtsc-soft p-4">
              <div className="text-xs font-black uppercase tracking-wide text-dtsc-muted">{copy.simulationResult}</div>
              <div className="mt-2 text-2xl font-black text-dtsc-ink">{formatEnterpriseAmount(simulation.quotedAmount, simulation.currency, locale)}</div>
              <div className="mt-1 text-sm font-bold text-dtsc-muted">{copy.selectedRule}: {simulation.pricingRuleCode} · {simulation.service.name} · {simulation.station.stationCode}</div>
            </div>
          ) : null}
          <LookupPagination copy={copy} servicePage={servicePage} stationPage={stationPage} servicePagination={servicePagination} stationPagination={stationPagination} setServicePage={setServicePage} setStationPage={setStationPage} loading={lookupLoading} />
        </form>
      </Dialog>
    </ModuleWorkspace>
  );
}

function PricingRuleForm({
  id,
  onSubmit,
  copy,
  services,
  stations,
  currencies,
  loading,
  error,
  rule,
  servicePage,
  stationPage,
  servicePagination,
  stationPagination,
  setServicePage,
  setStationPage,
}: {
  id: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  copy: ReturnType<typeof gamingPricingCopy>;
  services: CatalogService[];
  stations: Station[];
  currencies: Currency[];
  loading: boolean;
  error: string;
  rule?: PricingRule;
  servicePage: number;
  stationPage: number;
  servicePagination: Pagination;
  stationPagination: Pagination;
  setServicePage: (value: number | ((value: number) => number)) => void;
  setStationPage: (value: number | ((value: number) => number)) => void;
}) {
  const serviceItems = [...services.map((service) => ({ id: service.id, label: `${service.code} · ${service.name}` }))];
  if (rule?.catalogService && !serviceItems.some((item) => item.id === rule.catalogService!.id)) serviceItems.unshift({ id: rule.catalogService.id, label: `${rule.catalogService.code} · ${rule.catalogService.name}` });
  const stationItems = [{ id: "", label: copy.allStations }, ...stations.map((station) => ({ id: station.id, label: `${station.stationCode} · ${station.displayName || station.consoleFamily || "Gaming"}` }))];
  if (rule?.station && !stationItems.some((item) => item.id === rule.station!.id)) stationItems.push({ id: rule.station.id, label: `${rule.station.stationCode} · ${rule.station.displayName || rule.station.consoleFamily || "Gaming"}` });

  return (
    <form id={id} onSubmit={onSubmit} className="grid gap-5 p-4 sm:p-5">
      {error ? <ProfessionalError message={error} /> : null}
      {loading ? <ProfessionalLoading rows={2} /> : null}
      <ProfessionalFormSection title={copy.createTitle} description={copy.createDescription}>
        <Field label={copy.code} required><Input name="code" defaultValue={rule?.code || ""} maxLength={60} required /></Field>
        <Field label={copy.label}><Input name="label" defaultValue={rule?.targeting.label || ""} maxLength={240} /></Field>
        <Field label={copy.service} required><NativeSelect name="serviceCatalogItemId" required defaultValue={rule?.serviceCatalogItemId || ""} items={serviceItems} /></Field>
        <Field label={copy.station}><NativeSelect name="stationId" defaultValue={rule?.stationId || ""} items={stationItems} /></Field>
        <Field label={copy.consoleFamily}><Input name="consoleFamily" defaultValue={rule?.targeting.consoleFamily || ""} maxLength={80} /></Field>
        <Field label={copy.mode} required><NativeSelect name="pricingMode" required defaultValue={rule?.pricingMode || "PER_HOUR"} items={Object.entries(copy.modes).map(([id, label]) => ({ id, label }))} /></Field>
        <Field label={copy.amount} required><Input name="amount" type="number" min="0.01" step="0.01" defaultValue={rule?.amount || ""} required /></Field>
        <Field label={copy.currency} required><NativeSelect name="currency" required defaultValue={rule?.currency || ""} items={currencies.map((currency) => ({ id: currency.code, label: `${currency.code} · ${currency.name}` }))} /></Field>
        <Field label={copy.durationMinutes}><Input name="durationMinutes" type="number" min={1} max={1440} defaultValue={rule?.durationMinutes ?? ""} /></Field>
        <Field label={copy.billingIncrementMinutes}><Input name="billingIncrementMinutes" type="number" min={1} max={1440} defaultValue={rule?.billingIncrementMinutes ?? ""} /></Field>
        <Field label={copy.minPlayers}><Input name="minPlayers" type="number" min={1} max={16} defaultValue={rule?.targeting.minPlayers ?? ""} /></Field>
        <Field label={copy.maxPlayers}><Input name="maxPlayers" type="number" min={1} max={16} defaultValue={rule?.targeting.maxPlayers ?? ""} /></Field>
        <Field label={copy.priority} required><Input name="priority" type="number" min={0} max={10000} defaultValue={rule?.priority ?? 100} required /></Field>
        <Field label={copy.dayOfWeekMask}><Input name="dayOfWeekMask" type="number" min={1} max={127} defaultValue={rule?.dayOfWeekMask ?? ""} /></Field>
        <Field label={copy.startMinuteOfDay}><Input name="startMinuteOfDay" type="number" min={0} max={1439} defaultValue={rule?.startMinuteOfDay ?? ""} /></Field>
        <Field label={copy.endMinuteOfDay}><Input name="endMinuteOfDay" type="number" min={0} max={1439} defaultValue={rule?.endMinuteOfDay ?? ""} /></Field>
        <Field label={copy.validFrom}><Input name="validFrom" type="datetime-local" defaultValue={localDateTimeValue(rule?.validFrom || null)} /></Field>
        <Field label={copy.validUntil}><Input name="validUntil" type="datetime-local" defaultValue={localDateTimeValue(rule?.validUntil || null)} /></Field>
        {!rule ? <Field label={copy.statusLabel}><NativeSelect name="status" defaultValue="DRAFT" items={[{ id: "DRAFT", label: copy.statuses.DRAFT }, { id: "ACTIVE", label: copy.statuses.ACTIVE }, { id: "INACTIVE", label: copy.statuses.INACTIVE }]} /></Field> : null}
      </ProfessionalFormSection>
      <LookupPagination copy={copy} servicePage={servicePage} stationPage={stationPage} servicePagination={servicePagination} stationPagination={stationPagination} setServicePage={setServicePage} setStationPage={setStationPage} loading={loading} />
    </form>
  );
}

function LookupPagination({ copy, servicePage, stationPage, servicePagination, stationPagination, setServicePage, setStationPage, loading }: {
  copy: ReturnType<typeof gamingPricingCopy>;
  servicePage: number;
  stationPage: number;
  servicePagination: Pagination;
  stationPagination: Pagination;
  setServicePage: (value: number | ((value: number) => number)) => void;
  setStationPage: (value: number | ((value: number) => number)) => void;
  loading: boolean;
}) {
  return (
    <div className="grid gap-3 rounded-xl border border-dtsc-border p-3 text-xs font-bold text-dtsc-muted sm:grid-cols-2">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <Button type="button" variant="secondary" disabled={servicePage <= 1 || loading} onClick={() => setServicePage((value) => Math.max(1, value - 1))}>{copy.previous}</Button>
        <span>{copy.service} · {copy.page(servicePagination.page, servicePagination.pageCount)}</span>
        <Button type="button" variant="secondary" disabled={servicePage >= servicePagination.pageCount || loading} onClick={() => setServicePage((value) => Math.min(servicePagination.pageCount, value + 1))}>{copy.next}</Button>
      </div>
      <div className="flex min-w-0 items-center justify-between gap-2">
        <Button type="button" variant="secondary" disabled={stationPage <= 1 || loading} onClick={() => setStationPage((value) => Math.max(1, value - 1))}>{copy.previous}</Button>
        <span>{copy.station} · {copy.page(stationPagination.page, stationPagination.pageCount)}</span>
        <Button type="button" variant="secondary" disabled={stationPage >= stationPagination.pageCount || loading} onClick={() => setStationPage((value) => Math.min(stationPagination.pageCount, value + 1))}>{copy.next}</Button>
      </div>
    </div>
  );
}

function PricingDetail({ rule, copy, locale }: { rule: PricingRule; copy: ReturnType<typeof gamingPricingCopy>; locale: string | null | undefined }) {
  const date = (value: string | null) => value ? new Date(value).toLocaleString(locale === "en" ? "en" : "fr") : "—";
  return (
    <div className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-3">
      <Detail label={copy.service} value={rule.catalogService ? `${rule.catalogService.code} · ${rule.catalogService.name}` : rule.serviceCatalogItemId} />
      <Detail label={copy.mode} value={copy.modes[rule.pricingMode] || rule.pricingMode} />
      <Detail label={copy.amount} value={formatEnterpriseAmount(rule.amount, rule.currency, locale)} />
      <Detail label={copy.station} value={rule.station ? `${rule.station.stationCode} · ${rule.station.displayName || rule.station.consoleFamily || "—"}` : copy.allStations} />
      <Detail label={copy.consoleFamily} value={rule.targeting.consoleFamily || "—"} />
      <Detail label={copy.durationMinutes} value={rule.durationMinutes ? String(rule.durationMinutes) : "—"} />
      <Detail label={copy.billingIncrementMinutes} value={rule.billingIncrementMinutes ? String(rule.billingIncrementMinutes) : "—"} />
      <Detail label={copy.minPlayers} value={rule.targeting.minPlayers ? String(rule.targeting.minPlayers) : "—"} />
      <Detail label={copy.maxPlayers} value={rule.targeting.maxPlayers ? String(rule.targeting.maxPlayers) : "—"} />
      <Detail label={copy.dayOfWeekMask} value={rule.dayOfWeekMask ? String(rule.dayOfWeekMask) : "—"} />
      <Detail label={copy.startMinuteOfDay} value={rule.startMinuteOfDay !== null ? String(rule.startMinuteOfDay) : "—"} />
      <Detail label={copy.endMinuteOfDay} value={rule.endMinuteOfDay !== null ? String(rule.endMinuteOfDay) : "—"} />
      <Detail label={copy.validFrom} value={date(rule.validFrom)} />
      <Detail label={copy.validUntil} value={date(rule.validUntil)} />
      <Detail label={copy.priority} value={String(rule.priority)} />
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0 rounded-2xl border border-dtsc-border bg-dtsc-surface p-4"><div className="text-xs font-black uppercase tracking-wide text-dtsc-muted">{label}</div><div className="mt-1 break-words text-sm font-bold text-dtsc-ink">{value}</div></div>;
}
