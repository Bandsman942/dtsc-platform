"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { AlertTriangle, CheckCircle2, Eye, PackageCheck, Plus, RotateCcw, Wrench } from "lucide-react";
import { Field, NativeSelect } from "@/components/enterprise/core-v2/erp-v2-ui";
import {
  professionalErpDate,
  professionalErpEnumLabel,
  professionalErpMoney,
  professionalErpT,
  useProfessionalErpLocale,
} from "@/components/enterprise/professional/professional-erp-i18n";
import {
  ProfessionalError,
  ProfessionalFormSection,
  ProfessionalHelp,
  ProfessionalLoading,
  ProfessionalSearch,
  professionalMutation,
  useProfessionalCollection,
} from "@/components/enterprise/professional/professional-erp-ui";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { BusinessList, BusinessListItem } from "@/components/workspace/business-list";
import { ContextActions, type BusinessContextAction } from "@/components/workspace/context-actions";
import { EmptyState } from "@/components/workspace/empty-state";
import { ModuleMetric, ModuleMetrics } from "@/components/workspace/module-metrics";
import { ModuleContent, ModuleHeader, ModuleSection, ModuleToolbar, ModuleWorkspace } from "@/components/workspace/module-workspace";
import { StatusBadge } from "@/components/workspace/status-badge";
import type { EnterpriseModuleDefinition } from "@/lib/enterprise/module-registry";

type Employee = { id: string; employeeNumber: string; displayName: string };
type Member = { id: string; label: string; role: string; positionTitle: string | null };
type Department = { id: string; labelFr: string; departmentCode: string };
type Site = { id: string; code: string; name: string };
type Location = { id: string; warehouseId: string; code: string; name: string };
type Supplier = { id: string; legalName: string; displayName: string | null };
type AssetCategory = { id: string; code: string; name: string };
type Lookups = { employees: Employee[]; members: Member[]; departments: Department[]; sites: Site[]; locations: Location[]; suppliers: Supplier[]; assetCategories: AssetCategory[] };
type AssetListItem = { id: string; code: string; name: string; description: string | null; serialNumber: string | null; status: string; condition: string; indicativeValue: string | number | null; currency: string | null; revision: number; category: AssetCategory | null; site: Site | null; assignments: Array<{ id: string; employeeId: string | null; departmentId: string | null; status: string }>; _count: { maintenanceRecords: number; incidents: number } };
type Assignment = { id: string; employeeId: string | null; departmentId: string | null; assignedAt: string; expectedReturnAt: string | null; returnedAt: string | null; initialCondition: string; returnCondition: string | null; status: string; notes: string | null; revision: number; employee: Employee | null };
type Maintenance = { id: string; reference: string; maintenanceType: string; title: string; description: string | null; status: string; priority: string; plannedAt: string | null; dueAt: string | null; indicativeCost: string | number | null; currency: string | null; notes: string | null; revision: number };
type Incident = { id: string; reference: string; incidentType: string; title: string; description: string; severity: string; status: string; occurredAt: string | null; reportedAt: string; resolution: string | null; revision: number };
type AssetOverview = Omit<AssetListItem, "assignments"> & { acquisitionDate: string | null; warrantyEndsAt: string | null; notes: string | null; storageLocation: { id: string; code: string; name: string } | null; assignments: Assignment[]; maintenanceRecords: Maintenance[]; incidents: Incident[] };

const ASSET_STATUSES = ["DRAFT", "AVAILABLE", "ASSIGNED", "MAINTENANCE", "OUT_OF_SERVICE", "DISPOSED", "ACTIVE", "RETURNED", "PLANNED", "IN_PROGRESS", "COMPLETED", "CANCELLED", "OPEN", "RESOLVED"];
const ASSET_CONDITIONS = ["NEW", "GOOD", "FAIR", "POOR", "DAMAGED"];
const PRIORITIES = ["LOW", "NORMAL", "HIGH", "CRITICAL"];
const SEVERITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
function statusTone(status: string) {
  if (["AVAILABLE", "COMPLETED", "RESOLVED", "RETURNED"].includes(status)) return "success" as const;
  if (["ASSIGNED", "MAINTENANCE", "PLANNED", "IN_PROGRESS", "OPEN"].includes(status)) return "warning" as const;
  if (["OUT_OF_SERVICE", "DISPOSED", "CANCELLED"].includes(status)) return "danger" as const;
  return "neutral" as const;
}

export function EnterpriseAssetsMaintenanceWorkspace({ organizationId, organizationName, definition }: { organizationId: string; organizationName: string; definition: EnterpriseModuleDefinition }) {
  const locale = useProfessionalErpLocale();
  const t = (key: Parameters<typeof professionalErpT>[1], values?: Record<string, string | number>) => professionalErpT(locale, key, values);
  const suffix = (count: number) => (count === 1 ? "" : "s");
  const memberLabel = (member: Member) => member.positionTitle ? `${member.label} · ${member.positionTitle}` : member.label;
  const incidentTypeLabel = (value: string) => value === "DAMAGE" ? t("assets.damage") : value;
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [lookups, setLookups] = useState<Lookups>({ employees: [], members: [], departments: [], sites: [], locations: [], suppliers: [], assetCategories: [] });
  const [assetOpen, setAssetOpen] = useState(false);
  const [overview, setOverview] = useState<AssetOverview | null>(null);
  const [subform, setSubform] = useState<"ASSIGN" | "RETURN" | "MAINTENANCE" | "INCIDENT" | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    void fetch(`/api/enterprise/${organizationId}/operational-lookups?module=ASSETS_MAINTENANCE`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => null) as Lookups & { message?: string } | null;
        if (!response.ok || !body) throw new Error(body?.message || t("assets.selectorsUnavailable"));
        if (active) setLookups({ employees: body.employees || [], members: body.members || [], departments: body.departments || [], sites: body.sites || [], locations: body.locations || [], suppliers: body.suppliers || [], assetCategories: body.assetCategories || [] });
      })
      .catch((error) => { if (active) setMessage(error instanceof Error ? error.message : t("assets.selectorsUnavailable")); });
    return () => { active = false; };
  }, [organizationId, refreshKey, locale]);

  const params = useMemo(() => { const value = new URLSearchParams({ page: String(page), pageSize: "25" }); if (search.trim()) value.set("search", search.trim()); if (status) value.set("status", status); return value; }, [page, search, status]);
  const assets = useProfessionalCollection<AssetListItem>({ endpoint: `/api/enterprise/${organizationId}/assets`, params, refreshKey });
  const statusItems = [{ id: "", label: t("assets.allStatuses") }, ...ASSET_STATUSES.map((id) => ({ id, label: professionalErpEnumLabel(locale, "assetStatus", id) }))];
  const conditionItems = ASSET_CONDITIONS.map((id) => ({ id, label: professionalErpEnumLabel(locale, "assetCondition", id) }));
  const priorityItems = PRIORITIES.map((id) => ({ id, label: professionalErpEnumLabel(locale, "priority", id) }));
  const severityItems = SEVERITIES.map((id) => ({ id, label: professionalErpEnumLabel(locale, "riskLevel", id) }));
  const maintenanceTypeItems = ["PREVENTIVE", "CORRECTIVE"].map((id) => ({ id, label: professionalErpEnumLabel(locale, "maintenanceType", id) }));

  async function openAsset(asset: AssetListItem) {
    try {
      const response = await fetch(`/api/enterprise/${organizationId}/assets/${asset.id}/overview`, { cache: "no-store" });
      const body = await response.json().catch(() => null) as { asset?: AssetOverview; message?: string } | null;
      if (!response.ok || !body?.asset) throw new Error(body?.message || t("assets.openFailed"));
      setOverview(body.asset);
    } catch (error) { setMessage(error instanceof Error ? error.message : t("assets.openFailed")); }
  }

  async function reloadOverview() {
    if (!overview) return;
    const response = await fetch(`/api/enterprise/${organizationId}/assets/${overview.id}/overview`, { cache: "no-store" });
    const body = await response.json().catch(() => null) as { asset?: AssetOverview } | null;
    if (response.ok && body?.asset) setOverview(body.asset);
    setRefreshKey((value) => value + 1);
  }

  async function createAsset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    try {
      await professionalMutation(`/api/enterprise/${organizationId}/assets`, { code: String(form.get("code") || ""), name: String(form.get("name") || ""), description: String(form.get("description") || "") || null, categoryId: String(form.get("categoryId") || "") || null, serialNumber: String(form.get("serialNumber") || "") || null, siteId: String(form.get("siteId") || "") || null, storageLocationId: String(form.get("storageLocationId") || "") || null, responsibleEmployeeId: String(form.get("responsibleEmployeeId") || "") || null, supplierId: String(form.get("supplierId") || "") || null, acquisitionDate: String(form.get("acquisitionDate") || "") || null, indicativeValue: String(form.get("indicativeValue") || "") ? Number(form.get("indicativeValue")) : null, currency: String(form.get("currency") || "") || null, condition: String(form.get("condition") || "GOOD"), warrantyEndsAt: String(form.get("warrantyEndsAt") || "") || null, notes: String(form.get("notes") || "") || null });
      setAssetOpen(false); setRefreshKey((value) => value + 1); setMessage(t("assets.created"));
    } catch (error) { setMessage(error instanceof Error ? error.message : t("assets.createFailed")); }
  }

  async function submitSubform(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!overview || !subform) return; const form = new FormData(event.currentTarget);
    try {
      if (subform === "ASSIGN") await professionalMutation(`/api/enterprise/${organizationId}/assets/${overview.id}/assignments`, { employeeId: String(form.get("employeeId") || "") || null, departmentId: String(form.get("departmentId") || "") || null, assignedAt: String(form.get("assignedAt") || "") || new Date().toISOString(), expectedReturnAt: String(form.get("expectedReturnAt") || "") || null, initialCondition: String(form.get("initialCondition") || overview.condition), notes: String(form.get("notes") || "") || null });
      if (subform === "RETURN") {
        const active = overview.assignments.find((assignment) => assignment.status === "ACTIVE");
        if (!active) throw new Error(t("assets.noActiveAssignment"));
        await professionalMutation(`/api/enterprise/${organizationId}/asset-assignments/${active.id}/return`, { revision: active.revision, returnedAt: String(form.get("returnedAt") || "") || new Date().toISOString(), returnCondition: String(form.get("returnCondition") || "GOOD"), notes: String(form.get("notes") || "") || null });
      }
      if (subform === "MAINTENANCE") await professionalMutation(`/api/enterprise/${organizationId}/assets/${overview.id}/maintenance`, { maintenanceType: String(form.get("maintenanceType") || "PREVENTIVE"), title: String(form.get("title") || ""), description: String(form.get("description") || "") || null, priority: String(form.get("priority") || "NORMAL"), responsibleUserId: String(form.get("responsibleUserId") || "") || null, supplierId: String(form.get("supplierId") || "") || null, plannedAt: String(form.get("plannedAt") || "") || null, dueAt: String(form.get("dueAt") || "") || null, indicativeCost: String(form.get("indicativeCost") || "") ? Number(form.get("indicativeCost")) : null, currency: String(form.get("currency") || "") || null, notes: String(form.get("notes") || "") || null });
      if (subform === "INCIDENT") await professionalMutation(`/api/enterprise/${organizationId}/assets/${overview.id}/incidents`, { incidentType: String(form.get("incidentType") || "DAMAGE"), title: String(form.get("title") || ""), description: String(form.get("description") || ""), severity: String(form.get("severity") || "MEDIUM"), responsibleUserId: String(form.get("responsibleUserId") || "") || null, occurredAt: String(form.get("occurredAt") || "") || null });
      setSubform(null); await reloadOverview(); setMessage(t("assets.historyUpdated"));
    } catch (error) { setMessage(error instanceof Error ? error.message : t("assets.operationFailed")); }
  }

  async function transitionMaintenance(item: Maintenance, action: "START" | "COMPLETE" | "CANCEL") {
    const comment = action === "CANCEL" ? window.prompt(t("assets.cancelReason")) || t("assets.maintenanceCancelled") : action === "COMPLETE" ? t("assets.maintenanceCompleted") : t("assets.maintenanceStarted");
    try {
      await professionalMutation(`/api/enterprise/${organizationId}/asset-maintenance/${item.id}/transition`, { action, revision: item.revision, comment });
      await reloadOverview(); setMessage(t("assets.maintenanceUpdated"));
    } catch (error) { setMessage(error instanceof Error ? error.message : t("assets.maintenanceUpdateFailed")); }
  }

  async function resolveIncident(item: Incident) {
    const resolution = window.prompt(t("assets.resolvePrompt"));
    if (!resolution || resolution.trim().length < 3) return;
    try {
      await professionalMutation(`/api/enterprise/${organizationId}/asset-incidents/${item.id}/resolve`, { revision: item.revision, resolution });
      await reloadOverview(); setMessage(t("assets.incidentResolved"));
    } catch (error) { setMessage(error instanceof Error ? error.message : t("assets.incidentResolveFailed")); }
  }

  const actionsFor = (asset: AssetListItem): BusinessContextAction[] => [
    { id: "open", label: t("assets.open"), icon: Eye, onSelect: () => void openAsset(asset) },
    ...(["AVAILABLE", "DRAFT"].includes(asset.status) ? [{ id: "assign", label: t("assets.assign"), icon: PackageCheck, onSelect: async () => { await openAsset(asset); setSubform("ASSIGN"); } }] : []),
  ];

  return <ModuleWorkspace>
    <ModuleHeader eyebrow={t("assets.eyebrow", { organization: organizationName })} title={t("assets.title")} description={`${locale === "en" ? definition.descriptionEn : definition.descriptionFr} ${t("assets.descriptionSuffix")}`} count={t("assets.count", { count: assets.pagination.total, suffix: suffix(assets.pagination.total) })} primaryAction={<Button onClick={() => setAssetOpen(true)}><Plus className="h-4 w-4" />{t("assets.newAsset")}</Button>} />
    <ModuleMetrics label={t("assets.metrics")}><ModuleMetric label={t("assets.registered")} value={assets.pagination.total} /><ModuleMetric label={t("assets.assigned")} value={assets.metrics.assigned || 0} /><ModuleMetric label={t("assets.inMaintenance")} value={assets.metrics.maintenance || 0} /><ModuleMetric label={t("assets.openIncidents")} value={assets.metrics.openIncidents || 0} /></ModuleMetrics>
    <ModuleToolbar search={<ProfessionalSearch value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder={t("assets.search")} />} controls={<NativeSelect value={status} onChange={(value) => { setStatus(value); setPage(1); }} items={statusItems} />} summary={t("assets.summary")} />
    <ModuleContent>
      {message ? <div role="status" className="rounded-xl border border-dtsc-border bg-dtsc-page px-4 py-3 text-sm font-semibold">{message}</div> : null}
      <ModuleSection title={t("assets.register")} description={t("assets.registerDescription")}>
        {assets.error ? <ProfessionalError message={assets.error} /> : assets.loading ? <ProfessionalLoading /> : assets.items.length ? <BusinessList ariaLabel={t("assets.registerAria")}>{assets.items.map((asset) => <BusinessListItem key={asset.id} title={`${asset.code} · ${asset.name}`} status={<StatusBadge tone={statusTone(asset.status)}>{professionalErpEnumLabel(locale, "assetStatus", asset.status)}</StatusBadge>} meta={`${asset.category?.name || t("assets.noCategory")} · ${professionalErpEnumLabel(locale, "assetCondition", asset.condition)} · ${professionalErpMoney(asset.indicativeValue, asset.currency, locale)}`} description={`${asset.site?.name || t("assets.noSite")}${asset.serialNumber ? ` · ${t("assets.serial", { serial: asset.serialNumber })}` : ""} · ${t("assets.maintenanceCount", { count: asset._count.maintenanceRecords, suffix: suffix(asset._count.maintenanceRecords) })} · ${t("assets.incidentCount", { count: asset._count.incidents, suffix: suffix(asset._count.incidents) })}`} onOpen={() => void openAsset(asset)} openLabel={t("assets.openAsset", { code: asset.code })} actions={<ContextActions label={t("assets.assetActions")} actions={actionsFor(asset)} />} />)}</BusinessList> : <EmptyState compact title={t("assets.noAsset")} description={t("assets.noAssetDescription")} />}
      </ModuleSection>
      <ProfessionalHelp moduleCode="ASSETS_MAINTENANCE" />
    </ModuleContent>

    <Dialog open={assetOpen} onClose={() => setAssetOpen(false)} title={t("assets.newAssetTitle")} className="h-[96dvh] max-w-5xl"><form onSubmit={createAsset} className="grid gap-5"><ProfessionalFormSection title={t("assets.identification")}><Field label={t("assets.reference")}><Input name="code" required /></Field><Field label={t("assets.name")}><Input name="name" required /></Field><Field label={t("assets.category")}><NativeSelect name="categoryId" items={[{ id: "", label: t("assets.noCategory") }, ...lookups.assetCategories.map((category) => ({ id: category.id, label: `${category.code} · ${category.name}` }))]} /></Field><Field label={t("assets.serialNumber")}><Input name="serialNumber" /></Field><Field label={t("assets.description")}><textarea name="description" rows={3} className="w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-base" /></Field></ProfessionalFormSection><ProfessionalFormSection title={t("assets.acquisitionLocation")}><Field label={t("assets.supplier")}><NativeSelect name="supplierId" items={[{ id: "", label: t("assets.notProvided") }, ...lookups.suppliers.map((supplier) => ({ id: supplier.id, label: supplier.displayName || supplier.legalName }))]} /></Field><Field label={t("assets.acquisitionDate")}><Input name="acquisitionDate" type="date" /></Field><Field label={t("assets.indicativeValue")}><Input name="indicativeValue" type="number" min="0" step="0.01" /></Field><Field label={t("assets.currency")}><Input name="currency" maxLength={3} defaultValue="USD" /></Field><Field label={t("assets.warrantyUntil")}><Input name="warrantyEndsAt" type="date" /></Field><Field label={t("assets.site")}><NativeSelect name="siteId" items={[{ id: "", label: t("assets.notProvided") }, ...lookups.sites.map((site) => ({ id: site.id, label: `${site.code} · ${site.name}` }))]} /></Field><Field label={t("assets.location")}><NativeSelect name="storageLocationId" items={[{ id: "", label: t("assets.notProvided") }, ...lookups.locations.map((location) => ({ id: location.id, label: `${location.code} · ${location.name}` }))]} /></Field><Field label={t("assets.responsible")}><NativeSelect name="responsibleEmployeeId" items={[{ id: "", label: t("assets.unassigned") }, ...lookups.employees.map((employee) => ({ id: employee.id, label: `${employee.employeeNumber} · ${employee.displayName}` }))]} /></Field><Field label={t("assets.condition")}><NativeSelect name="condition" defaultValue="GOOD" items={conditionItems} /></Field><Field label={t("assets.notes")}><Input name="notes" /></Field></ProfessionalFormSection><div className="sticky bottom-0 flex justify-end gap-2 border-t border-dtsc-border bg-dtsc-surface py-3"><Button type="button" variant="outline" onClick={() => setAssetOpen(false)}>{t("assets.cancel")}</Button><Button type="submit">{t("assets.saveAsset")}</Button></div></form></Dialog>

    <Dialog open={Boolean(overview)} onClose={() => { setOverview(null); setSubform(null); }} title={overview ? `${overview.code} · ${overview.name}` : t("assets.assetDetail")} className="h-[96dvh] max-w-6xl">{overview ? <div className="grid gap-6"><div className="flex flex-wrap gap-2"><StatusBadge tone={statusTone(overview.status)}>{professionalErpEnumLabel(locale, "assetStatus", overview.status)}</StatusBadge><StatusBadge>{professionalErpEnumLabel(locale, "assetCondition", overview.condition)}</StatusBadge><StatusBadge>{professionalErpMoney(overview.indicativeValue, overview.currency, locale)}</StatusBadge></div><div data-responsive-actions>{["AVAILABLE", "DRAFT"].includes(overview.status) ? <Button variant="outline" onClick={() => setSubform("ASSIGN")}><PackageCheck className="h-4 w-4" />{t("assets.assign")}</Button> : null}{overview.assignments.some((assignment) => assignment.status === "ACTIVE") ? <Button variant="outline" onClick={() => setSubform("RETURN")}><RotateCcw className="h-4 w-4" />{t("assets.returnAsset")}</Button> : null}<Button variant="outline" onClick={() => setSubform("MAINTENANCE")}><Wrench className="h-4 w-4" />{t("assets.planMaintenance")}</Button><Button onClick={() => setSubform("INCIDENT")}><AlertTriangle className="h-4 w-4" />{t("assets.reportIncident")}</Button></div><ModuleSection title={t("assets.assignments")}><BusinessList ariaLabel={t("assets.assignmentsAria")}>{overview.assignments.map((assignment) => <BusinessListItem key={assignment.id} title={assignment.employee ? `${assignment.employee.employeeNumber} · ${assignment.employee.displayName}` : t("assets.department")} status={<StatusBadge tone={statusTone(assignment.status)}>{professionalErpEnumLabel(locale, "assetStatus", assignment.status)}</StatusBadge>} meta={t("assets.assignedOn", { date: professionalErpDate(assignment.assignedAt, locale) })} description={`${professionalErpEnumLabel(locale, "assetCondition", assignment.initialCondition)}${assignment.returnCondition ? ` → ${professionalErpEnumLabel(locale, "assetCondition", assignment.returnCondition)}` : ""}${assignment.notes ? ` · ${assignment.notes}` : ""}`} />)}</BusinessList></ModuleSection><ModuleSection title={t("assets.maintenances")}><BusinessList ariaLabel={t("assets.maintenancesAria")}>{overview.maintenanceRecords.map((item) => <BusinessListItem key={item.id} title={`${item.reference} · ${item.title}`} status={<StatusBadge tone={statusTone(item.status)}>{professionalErpEnumLabel(locale, "assetStatus", item.status)}</StatusBadge>} meta={`${professionalErpEnumLabel(locale, "maintenanceType", item.maintenanceType)} · ${professionalErpEnumLabel(locale, "priority", item.priority)}${item.dueAt ? ` · ${t("assets.dueOn", { date: professionalErpDate(item.dueAt, locale) })}` : ""}`} description={`${item.description || t("assets.noDescription")}${item.indicativeCost !== null ? ` · ${professionalErpMoney(item.indicativeCost, item.currency, locale)}` : ""}`} actions={<ContextActions label={t("assets.maintenanceActions")} actions={[{ id: "start", label: t("assets.start"), icon: Wrench, disabled: item.status !== "PLANNED", onSelect: () => void transitionMaintenance(item, "START") }, { id: "complete", label: t("assets.complete"), icon: CheckCircle2, disabled: item.status !== "IN_PROGRESS", onSelect: () => void transitionMaintenance(item, "COMPLETE") }]} />} />)}</BusinessList></ModuleSection><ModuleSection title={t("assets.incidents")}><BusinessList ariaLabel={t("assets.incidentsAria")}>{overview.incidents.map((item) => <BusinessListItem key={item.id} title={`${item.reference} · ${item.title}`} status={<StatusBadge tone={item.status === "RESOLVED" ? "success" : item.severity === "HIGH" || item.severity === "CRITICAL" ? "danger" : "warning"}>{professionalErpEnumLabel(locale, "assetStatus", item.status)}</StatusBadge>} meta={`${incidentTypeLabel(item.incidentType)} · ${professionalErpEnumLabel(locale, "riskLevel", item.severity)}`} description={item.resolution || item.description} actions={item.status === "OPEN" ? <ContextActions label={t("assets.incidentActions")} actions={[{ id: "resolve", label: t("assets.markResolved"), icon: CheckCircle2, onSelect: () => void resolveIncident(item) }]} /> : undefined} />)}</BusinessList></ModuleSection></div> : null}</Dialog>

    <Dialog open={Boolean(subform)} onClose={() => setSubform(null)} title={subform === "ASSIGN" ? t("assets.assignTitle") : subform === "RETURN" ? t("assets.returnTitle") : subform === "MAINTENANCE" ? t("assets.maintenanceTitle") : t("assets.incidentTitle")} className="h-[92dvh] max-w-4xl">{overview && subform ? <form onSubmit={submitSubform} className="grid gap-5"><ProfessionalFormSection title={t("assets.information")}><>{subform === "ASSIGN" ? <><Field label={t("assets.collaborator")}><NativeSelect name="employeeId" items={[{ id: "", label: t("assets.none") }, ...lookups.employees.map((employee) => ({ id: employee.id, label: `${employee.employeeNumber} · ${employee.displayName}` }))]} /></Field><Field label={t("assets.department")}><NativeSelect name="departmentId" items={[{ id: "", label: t("assets.none") }, ...lookups.departments.map((department) => ({ id: department.id, label: department.labelFr }))]} /></Field><Field label={t("assets.assignmentDate")}><Input name="assignedAt" type="date" /></Field><Field label={t("assets.expectedReturn")}><Input name="expectedReturnAt" type="date" /></Field><Field label={t("assets.initialCondition")}><NativeSelect name="initialCondition" defaultValue={overview.condition} items={conditionItems} /></Field></> : null}{subform === "RETURN" ? <><Field label={t("assets.returnDate")}><Input name="returnedAt" type="date" /></Field><Field label={t("assets.returnCondition")}><NativeSelect name="returnCondition" defaultValue="GOOD" items={conditionItems} /></Field></> : null}{subform === "MAINTENANCE" ? <><Field label={t("assets.maintenanceType")}><NativeSelect name="maintenanceType" defaultValue="PREVENTIVE" items={maintenanceTypeItems} /></Field><Field label={t("projects.title")}><Input name="title" required /></Field><Field label={t("assets.description")}><Input name="description" /></Field><Field label={t("assets.priority")}><NativeSelect name="priority" defaultValue="NORMAL" items={priorityItems} /></Field><Field label={t("assets.responsible")}><NativeSelect name="responsibleUserId" items={[{ id: "", label: t("assets.unassigned") }, ...lookups.members.map((member) => ({ id: member.id, label: memberLabel(member) }))]} /></Field><Field label={t("assets.supplier")}><NativeSelect name="supplierId" items={[{ id: "", label: t("assets.none") }, ...lookups.suppliers.map((supplier) => ({ id: supplier.id, label: supplier.displayName || supplier.legalName }))]} /></Field><Field label={t("assets.plannedDate")}><Input name="plannedAt" type="datetime-local" /></Field><Field label={t("assets.dueDate")}><Input name="dueAt" type="datetime-local" /></Field><Field label={t("assets.indicativeCost")}><Input name="indicativeCost" type="number" min="0" step="0.01" /></Field><Field label={t("assets.currency")}><Input name="currency" maxLength={3} defaultValue="USD" /></Field></> : null}{subform === "INCIDENT" ? <><Field label={t("assets.incidentType")}><Input name="incidentType" placeholder={t("assets.damage")} /></Field><Field label={t("projects.title")}><Input name="title" required /></Field><Field label={t("assets.description")}><textarea name="description" rows={4} className="w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-base" required /></Field><Field label={t("assets.severity")}><NativeSelect name="severity" defaultValue="MEDIUM" items={severityItems} /></Field><Field label={t("assets.responsible")}><NativeSelect name="responsibleUserId" items={[{ id: "", label: t("assets.unassigned") }, ...lookups.members.map((member) => ({ id: member.id, label: memberLabel(member) }))]} /></Field><Field label={t("assets.incidentDate")}><Input name="occurredAt" type="datetime-local" /></Field></> : null}<Field label={t("assets.notes")}><Input name="notes" /></Field></></ProfessionalFormSection><div className="sticky bottom-0 flex justify-end gap-2 border-t border-dtsc-border bg-dtsc-surface py-3"><Button type="button" variant="outline" onClick={() => setSubform(null)}>{t("assets.cancel")}</Button><Button type="submit">{t("assets.save")}</Button></div></form> : null}</Dialog>
  </ModuleWorkspace>;
}
