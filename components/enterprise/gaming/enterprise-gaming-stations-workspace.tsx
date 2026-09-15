"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Archive, CheckCircle2, ExternalLink, Gamepad2, Pencil, Plus, ShieldAlert } from "lucide-react";
import { Field, NativeSelect } from "@/components/enterprise/core-v2/erp-v2-ui";
import { gamingStationsCopy } from "@/components/enterprise/gaming/gaming-stations-i18n";
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

type StationStatus = "AVAILABLE" | "IN_USE" | "RESERVED" | "MAINTENANCE" | "OUT_OF_SERVICE";
type Site = { id: string; code: string; name: string } | null;
type Asset = {
  id: string;
  code: string;
  name: string;
  serialNumber: string | null;
  status: string;
  condition: string;
  archivedAt: string | null;
  site: Site;
  category: { id: string; code: string; name: string } | null;
};
type Station = {
  id: string;
  assetId: string;
  stationCode: string;
  displayName: string | null;
  consoleFamily: string | null;
  maxPlayers: number;
  sortOrder: number;
  status: StationStatus;
  effectiveStatus: StationStatus;
  notes: string | null;
  revision: number;
  asset: Asset;
  blockers: {
    incident: { id: string; reference: string; severity: string; title: string } | null;
    maintenance: { id: string; reference: string; title: string } | null;
  };
};
type CandidateAsset = Omit<Asset, "archivedAt">;
type Pagination = { page: number; pageSize: number; total: number; pageCount: number };
type StationExtra = { canReportIncident?: boolean };

type StationFilter = "ALL" | StationStatus;

function statusTone(status: StationStatus): StatusBadgeTone {
  if (status === "AVAILABLE") return "success";
  if (status === "IN_USE") return "info";
  if (status === "RESERVED" || status === "MAINTENANCE") return "warning";
  return "danger";
}

function inputText(form: FormData, name: string) {
  return String(form.get(name) || "").trim();
}

export function EnterpriseGamingStationsWorkspace({
  organizationId,
  organizationName,
  definition,
}: {
  organizationId: string;
  organizationName: string;
  definition: EnterpriseModuleDefinition;
}) {
  const locale = useAppLocale();
  const copy = gamingStationsCopy(locale);
  const [filter, setFilter] = useState<StationFilter>("ALL");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [detail, setDetail] = useState<Station | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [edit, setEdit] = useState<Station | null>(null);
  const [incidentFor, setIncidentFor] = useState<Station | null>(null);
  const [archiveFor, setArchiveFor] = useState<Station | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState("");

  const [candidateSearch, setCandidateSearch] = useState("");
  const [candidatePage, setCandidatePage] = useState(1);
  const [candidateItems, setCandidateItems] = useState<CandidateAsset[]>([]);
  const [candidatePagination, setCandidatePagination] = useState<Pagination>({ page: 1, pageSize: 20, total: 0, pageCount: 1 });
  const [candidateLoading, setCandidateLoading] = useState(false);
  const [candidateError, setCandidateError] = useState("");

  useToastMessage(message, "error");
  useToastMessage(success, "success");

  const params = useMemo(() => {
    const value = new URLSearchParams({ page: String(page), pageSize: "20" });
    if (search.trim()) value.set("search", search.trim());
    if (filter !== "ALL") value.set("status", filter);
    return value;
  }, [filter, page, search]);

  const collection = useProfessionalCollection<Station, StationExtra>({
    endpoint: `/api/enterprise/${organizationId}/gaming/stations`,
    params,
    refreshKey,
  });

  useEffect(() => {
    if (!createOpen) return;
    const controller = new AbortController();
    const query = new URLSearchParams({ page: String(candidatePage), pageSize: "20" });
    if (candidateSearch.trim()) query.set("search", candidateSearch.trim());
    setCandidateLoading(true);
    setCandidateError("");
    fetch(`/api/enterprise/${organizationId}/gaming/stations/candidates?${query.toString()}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body = await response.json().catch(() => null) as { items?: CandidateAsset[]; pagination?: Pagination; message?: string; error?: string } | null;
        if (!response.ok || !body?.items || !body.pagination) throw new Error(body?.message || body?.error || copy.loadCandidatesFailed);
        setCandidateItems(body.items);
        setCandidatePagination(body.pagination);
      })
      .catch((error: unknown) => {
        if ((error as { name?: string })?.name === "AbortError") return;
        setCandidateError(error instanceof Error ? error.message : copy.loadCandidatesFailed);
      })
      .finally(() => setCandidateLoading(false));
    return () => controller.abort();
  }, [candidatePage, candidateSearch, copy.loadCandidatesFailed, createOpen, organizationId, refreshKey]);

  function resetFeedback() {
    setMessage("");
    setSuccess("");
  }

  function refreshAndClose() {
    setDetail(null);
    setEdit(null);
    setIncidentFor(null);
    setArchiveFor(null);
    setRefreshKey((value) => value + 1);
  }

  async function createStation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    resetFeedback();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      await professionalMutation(`/api/enterprise/${organizationId}/gaming/stations`, {
        assetId: inputText(form, "assetId"),
        stationCode: inputText(form, "stationCode"),
        displayName: inputText(form, "displayName") || null,
        consoleFamily: inputText(form, "consoleFamily"),
        maxPlayers: Number(form.get("maxPlayers") || 2),
        sortOrder: Number(form.get("sortOrder") || 0),
        notes: inputText(form, "notes") || null,
      });
      setCreateOpen(false);
      setCandidateSearch("");
      setCandidatePage(1);
      setRefreshKey((value) => value + 1);
      setSuccess(copy.created);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : copy.loadCandidatesFailed);
    } finally {
      setBusy(false);
    }
  }

  async function updateStation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!edit) return;
    resetFeedback();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      await professionalMutation(`/api/enterprise/${organizationId}/gaming/stations/${edit.id}`, {
        action: "UPDATE",
        revision: edit.revision,
        stationCode: inputText(form, "stationCode"),
        displayName: inputText(form, "displayName") || null,
        consoleFamily: inputText(form, "consoleFamily"),
        maxPlayers: Number(form.get("maxPlayers") || edit.maxPlayers),
        sortOrder: Number(form.get("sortOrder") || 0),
        notes: inputText(form, "notes") || null,
      }, "PATCH");
      refreshAndClose();
      setSuccess(copy.updated);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : copy.updated);
    } finally {
      setBusy(false);
    }
  }

  async function stationTransition(station: Station, action: "BLOCK" | "SET_AVAILABLE") {
    resetFeedback();
    setBusy(true);
    try {
      await professionalMutation(`/api/enterprise/${organizationId}/gaming/stations/${station.id}`, {
        action,
        revision: station.revision,
      }, "PATCH");
      refreshAndClose();
      setSuccess(action === "BLOCK" ? copy.blocked : copy.availableSuccess);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : copy.updated);
    } finally {
      setBusy(false);
    }
  }

  async function reportIncident(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!incidentFor) return;
    resetFeedback();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      await professionalMutation(`/api/enterprise/${organizationId}/assets/${incidentFor.asset.id}/incidents`, {
        incidentType: "DAMAGE",
        title: inputText(form, "title"),
        description: inputText(form, "description"),
        severity: inputText(form, "severity") || "MEDIUM",
      });
      refreshAndClose();
      setSuccess(copy.incidentCreated);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : copy.incidentCreated);
    } finally {
      setBusy(false);
    }
  }

  async function archiveStation() {
    if (!archiveFor) return;
    resetFeedback();
    setBusy(true);
    try {
      await professionalMutation(`/api/enterprise/${organizationId}/gaming/stations/${archiveFor.id}`, {
        action: "ARCHIVE",
        revision: archiveFor.revision,
      }, "PATCH");
      refreshAndClose();
      setSuccess(copy.archived);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : copy.archived);
    } finally {
      setBusy(false);
    }
  }

  function stationActions(station: Station) {
    return [
      { id: "edit", label: copy.edit, icon: Pencil, hidden: !collection.canWrite, onSelect: () => { setDetail(null); setEdit(station); } },
      { id: "available", label: copy.makeAvailable, icon: CheckCircle2, hidden: !collection.canWrite || station.effectiveStatus === "AVAILABLE", disabled: Boolean(station.blockers.incident || station.blockers.maintenance), onSelect: () => void stationTransition(station, "SET_AVAILABLE") },
      { id: "block", label: copy.block, icon: ShieldAlert, hidden: !collection.canWrite || station.status === "OUT_OF_SERVICE", onSelect: () => void stationTransition(station, "BLOCK") },
      { id: "incident", label: copy.reportIncident, icon: ShieldAlert, hidden: !collection.extra.canReportIncident, onSelect: () => { setDetail(null); setIncidentFor(station); } },
      { id: "asset", label: copy.openAssets, icon: ExternalLink, onSelect: () => { window.location.href = `/enterprise-modules/ASSETS_MAINTENANCE?assetId=${encodeURIComponent(station.assetId)}`; } },
      { id: "archive", label: copy.archive, icon: Archive, destructive: true, separatorBefore: true, hidden: !collection.canManage, onSelect: () => { setDetail(null); setArchiveFor(station); } },
    ];
  }

  const tabs: Array<{ id: StationFilter; label: string; count?: number }> = [
    { id: "ALL", label: copy.all, count: collection.metrics.total },
    { id: "AVAILABLE", label: copy.available, count: collection.metrics.available },
    { id: "IN_USE", label: copy.inUse, count: collection.metrics.inUse },
    { id: "RESERVED", label: copy.reserved, count: collection.metrics.reserved },
    { id: "MAINTENANCE", label: copy.maintenance, count: collection.metrics.maintenance },
    { id: "OUT_OF_SERVICE", label: copy.outOfService, count: collection.metrics.outOfService },
  ];

  const unavailable = (collection.metrics.maintenance || 0) + (collection.metrics.outOfService || 0);

  return (
    <ModuleWorkspace>
      <ModuleHeader
        eyebrow={`${copy.eyebrow} · ${organizationName}`}
        title={copy.title}
        description={locale === "en" ? definition.descriptionEn : definition.descriptionFr}
        count={copy.stationCount(collection.pagination.total)}
        primaryAction={collection.canWrite ? <Button onClick={() => { resetFeedback(); setCandidatePage(1); setCreateOpen(true); }}><Plus className="h-4 w-4" />{copy.newStation}</Button> : undefined}
      />

      <ModuleMetrics label={copy.metricsLabel}>
        <ModuleMetric label={copy.available} value={collection.metrics.available || 0} />
        <ModuleMetric label={copy.inUse} value={collection.metrics.inUse || 0} />
        <ModuleMetric label={copy.reserved} value={collection.metrics.reserved || 0} />
        <ModuleMetric label={copy.unavailable} value={unavailable} />
      </ModuleMetrics>

      <ModuleToolbar
        search={<ProfessionalSearch value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder={copy.searchPlaceholder} />}
        controls={<ProfessionalTabs value={filter} onChange={(value) => { setFilter(value); setPage(1); }} items={tabs} label={copy.viewsLabel} />}
        summary={copy.page(collection.pagination.page, collection.pagination.pageCount)}
      />

      <ModuleContent>
        {message && !createOpen && !edit && !incidentFor && !archiveFor ? <ProfessionalError message={message} /> : null}
        <ModuleSection id="gaming-stations-board" title={copy.sectionTitle} description={copy.sectionDescription} defaultOpen>
          {collection.loading ? <ProfessionalLoading /> : collection.error ? <ProfessionalError message={collection.error} /> : collection.items.length ? (
            <>
              <BusinessList ariaLabel={copy.sectionTitle} className="grid gap-3 divide-y-0 border-0 bg-transparent sm:grid-cols-2 xl:grid-cols-3">
                {collection.items.map((station) => (
                  <BusinessListItem
                    key={station.id}
                    className="rounded-2xl border border-dtsc-border bg-dtsc-surface px-4 shadow-sm"
                    leading={<Gamepad2 className="h-5 w-5 text-dtsc-blue" />}
                    title={station.displayName || station.stationCode}
                    status={<StatusBadge tone={statusTone(station.effectiveStatus)}>{copy.status[station.effectiveStatus] || station.effectiveStatus}</StatusBadge>}
                    meta={`${station.stationCode} · ${station.consoleFamily || copy.noValue} · ${copy.players}: ${station.maxPlayers}`}
                    description={`${copy.asset}: ${station.asset.code} · ${station.asset.name} · ${station.asset.site?.name || copy.noSite}`}
                    onOpen={() => { resetFeedback(); setDetail(station); }}
                    openLabel={copy.openStation(station.displayName || station.stationCode)}
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
        title={detail?.displayName || detail?.stationCode || copy.detailTitle}
        description={detail ? `${detail.stationCode} · ${detail.consoleFamily || copy.noValue}` : undefined}
        actions={detail ? stationActions(detail) : []}
        actionLabel={copy.actions}
      >
        {detail ? (
          <div className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Detail label={copy.operationalStatus} value={copy.status[detail.effectiveStatus] || detail.effectiveStatus} />
            <Detail label={copy.asset} value={`${detail.asset.code} · ${detail.asset.name}`} />
            <Detail label={copy.assetStatus} value={detail.asset.status} />
            <Detail label={copy.condition} value={detail.asset.condition} />
            <Detail label={copy.site} value={detail.asset.site?.name || copy.noSite} />
            <Detail label={copy.category} value={detail.asset.category?.name || copy.noValue} />
            <Detail label={copy.serial} value={detail.asset.serialNumber || copy.noValue} />
            <Detail label={copy.players} value={String(detail.maxPlayers)} />
            {detail.blockers.incident ? <Detail label={copy.incidentBlocking} value={`${detail.blockers.incident.reference} · ${detail.blockers.incident.title}`} danger /> : null}
            {detail.blockers.maintenance ? <Detail label={copy.maintenanceBlocking} value={`${detail.blockers.maintenance.reference} · ${detail.blockers.maintenance.title}`} danger /> : null}
            {detail.status === "OUT_OF_SERVICE" && !detail.blockers.incident && !detail.blockers.maintenance ? <Detail label={copy.manualBlock} value={copy.outOfService} danger /> : null}
          </div>
        ) : null}
      </FullscreenEntityDetail>

      <Dialog open={createOpen} onClose={() => !busy && setCreateOpen(false)} title={copy.createTitle} description={copy.createDescription} className="h-[92dvh]" footer={<><Button variant="secondary" disabled={busy} onClick={() => setCreateOpen(false)}>{copy.cancel}</Button><Button form="gaming-station-create" type="submit" disabled={busy || !candidateItems.length}>{copy.save}</Button></>}>
        <form id="gaming-station-create" onSubmit={createStation} className="grid gap-5 p-4 sm:p-5">
          {message ? <ProfessionalError message={message} /> : null}
          <ProfessionalFormSection title={copy.asset} description={copy.createDescription}>
            <div className="md:col-span-2"><ProfessionalSearch value={candidateSearch} onChange={(value) => { setCandidateSearch(value); setCandidatePage(1); }} placeholder={copy.assetSearch} /></div>
            {candidateError ? <div className="md:col-span-2"><ProfessionalError message={candidateError} /></div> : null}
            {candidateLoading ? <div className="md:col-span-2"><ProfessionalLoading rows={2} /></div> : (
              <Field label={copy.assetChoice} required>
                <NativeSelect name="assetId" required items={candidateItems.map((asset) => ({ id: asset.id, label: `${asset.code} · ${asset.name}${asset.site?.name ? ` · ${asset.site.name}` : ""}` }))} />
              </Field>
            )}
            <div className="flex min-w-0 items-center justify-between gap-2 md:col-span-2">
              <Button type="button" variant="secondary" disabled={candidatePage <= 1 || candidateLoading} onClick={() => setCandidatePage((value) => Math.max(1, value - 1))}>{copy.previous}</Button>
              <span className="text-xs font-bold text-dtsc-muted">{copy.candidatePage(candidatePagination.page, candidatePagination.pageCount)}</span>
              <Button type="button" variant="secondary" disabled={candidatePage >= candidatePagination.pageCount || candidateLoading} onClick={() => setCandidatePage((value) => Math.min(candidatePagination.pageCount, value + 1))}>{copy.next}</Button>
            </div>
          </ProfessionalFormSection>
          <StationFields copy={copy} />
        </form>
      </Dialog>

      <Dialog open={Boolean(edit)} onClose={() => !busy && setEdit(null)} title={copy.editTitle} footer={<><Button variant="secondary" disabled={busy} onClick={() => setEdit(null)}>{copy.cancel}</Button><Button form="gaming-station-edit" type="submit" disabled={busy}>{copy.save}</Button></>}>
        {edit ? <form id="gaming-station-edit" onSubmit={updateStation} className="grid gap-5 p-4 sm:p-5"><StationFields copy={copy} station={edit} /></form> : null}
      </Dialog>

      <Dialog open={Boolean(incidentFor)} onClose={() => !busy && setIncidentFor(null)} title={copy.incidentTitle} description={copy.incidentDescription} footer={<><Button variant="secondary" disabled={busy} onClick={() => setIncidentFor(null)}>{copy.cancel}</Button><Button form="gaming-station-incident" type="submit" disabled={busy}>{copy.save}</Button></>}>
        {incidentFor ? <form id="gaming-station-incident" onSubmit={reportIncident} className="grid gap-4 p-4 sm:p-5">
          <Field label={copy.incidentName} required><Input name="title" required minLength={2} maxLength={240} /></Field>
          <Field label={copy.severity} required><NativeSelect name="severity" required defaultValue="MEDIUM" items={[{ id: "LOW", label: copy.low }, { id: "MEDIUM", label: copy.medium }, { id: "HIGH", label: copy.high }, { id: "CRITICAL", label: copy.critical }]} /></Field>
          <Field label={copy.incidentDetails} required><textarea name="description" required minLength={2} maxLength={6000} className="min-h-32 w-full min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-base text-dtsc-ink md:text-sm" /></Field>
        </form> : null}
      </Dialog>

      <Dialog open={Boolean(archiveFor)} onClose={() => !busy && setArchiveFor(null)} title={copy.archiveTitle} description={copy.archiveDescription} footer={<><Button variant="secondary" disabled={busy} onClick={() => setArchiveFor(null)}>{copy.cancel}</Button><Button variant="destructive" disabled={busy} onClick={() => void archiveStation()}>{copy.confirmArchive}</Button></>}>
        <div className="p-4 text-sm leading-6 text-dtsc-muted sm:p-5">{archiveFor ? `${archiveFor.stationCode} · ${archiveFor.asset.code} · ${archiveFor.asset.name}` : null}</div>
      </Dialog>
    </ModuleWorkspace>
  );
}

function StationFields({ copy, station }: { copy: ReturnType<typeof gamingStationsCopy>; station?: Station }) {
  return (
    <ProfessionalFormSection title={copy.detailTitle}>
      <Field label={copy.stationCode} required><Input name="stationCode" required maxLength={40} defaultValue={station?.stationCode || ""} /></Field>
      <Field label={copy.displayName}><Input name="displayName" maxLength={240} defaultValue={station?.displayName || ""} /></Field>
      <Field label={copy.consoleFamily} required><Input name="consoleFamily" required maxLength={80} defaultValue={station?.consoleFamily || "PlayStation"} /></Field>
      <Field label={copy.players} required><Input name="maxPlayers" type="number" min={1} max={16} defaultValue={station?.maxPlayers || 2} required /></Field>
      <Field label={copy.sortOrder}><Input name="sortOrder" type="number" min={0} max={1000000} defaultValue={station?.sortOrder || 0} /></Field>
      <Field label={copy.notes}><textarea name="notes" maxLength={4000} defaultValue={station?.notes || ""} className="min-h-28 w-full min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-base text-dtsc-ink md:text-sm" /></Field>
    </ProfessionalFormSection>
  );
}

function Detail({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) {
  return <div className={`min-w-0 rounded-2xl border p-4 ${danger ? "border-red-500/30 bg-red-500/5" : "border-dtsc-border bg-dtsc-surface"}`}><div className="text-xs font-black uppercase tracking-wide text-dtsc-muted">{label}</div><div className="mt-1 break-words text-sm font-bold text-dtsc-ink">{value}</div></div>;
}
