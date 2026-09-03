"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { AlertTriangle, CheckCircle2, Eye, PackageCheck, Plus, RotateCcw, Wrench, XCircle } from "lucide-react";
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
import { ProfessionalPager } from "@/components/enterprise/professional/professional-pager";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToastMessage } from "@/components/ui/use-toast-message";
import { BusinessList, BusinessListItem } from "@/components/workspace/business-list";
import { ContextActions, type BusinessContextAction } from "@/components/workspace/context-actions";
import { EmptyState } from "@/components/workspace/empty-state";
import { ModuleMetric, ModuleMetrics } from "@/components/workspace/module-metrics";
import { ModuleContent, ModuleHeader, ModuleSection, ModuleToolbar, ModuleWorkspace } from "@/components/workspace/module-workspace";
import { StatusBadge } from "@/components/workspace/status-badge";
import type { EnterpriseModuleDefinition } from "@/lib/enterprise/module-registry";

type Employee = { id: string; employeeNumber: string; displayName: string };
type Member = { id: string; label: string; role: string; positionTitle: string | null };
type Department = { id: string; labelFr: string; labelEn?: string | null; departmentCode: string };
type Site = { id: string; code: string; name: string };
type Location = { id: string; warehouseId: string; code: string; name: string; warehouse: { siteId: string | null } };
type Supplier = { id: string; legalName: string; displayName: string | null };
type Purchase = { id: string; reference: string; title: string; supplierId: string | null; status: string; currency: string; totalAmount: string | number };
type AssetCategory = { id: string; code: string; name: string };
type Lookups = { employees: Employee[]; members: Member[]; departments: Department[]; sites: Site[]; locations: Location[]; suppliers: Supplier[]; assetCategories: AssetCategory[]; purchases: Purchase[] };
type AssetListItem = { id: string; code: string; name: string; description: string | null; serialNumber: string | null; status: string; condition: string; indicativeValue: string | number | null; currency: string | null; revision: number; category: AssetCategory | null; site: Site | null; assignments: Array<{ id: string; employeeId: string | null; departmentId: string | null; status: string }>; _count: { maintenanceRecords: number; incidents: number } };
type Assignment = { id: string; employeeId: string | null; departmentId: string | null; assignedAt: string; expectedReturnAt: string | null; returnedAt: string | null; initialCondition: string; returnCondition: string | null; status: string; notes: string | null; revision: number; employee: Employee | null };
type Maintenance = { id: string; reference: string; maintenanceType: string; title: string; description: string | null; status: string; priority: string; plannedAt: string | null; dueAt: string | null; indicativeCost: string | number | null; currency: string | null; notes: string | null; revision: number };
type Incident = { id: string; reference: string; incidentType: string; title: string; description: string; severity: string; status: string; occurredAt: string | null; reportedAt: string; resolution: string | null; revision: number };
type AssetOverview = Omit<AssetListItem, "assignments"> & { acquisitionDate: string | null; warrantyEndsAt: string | null; notes: string | null; storageLocation: { id: string; code: string; name: string } | null; assignments: Assignment[]; maintenanceRecords: Maintenance[]; incidents: Incident[] };
type Subform = "ASSIGN" | "RETURN" | "MAINTENANCE" | "INCIDENT";
type Review = { kind: "MAINTENANCE"; item: Maintenance; action: "START" | "COMPLETE" | "CANCEL" } | { kind: "INCIDENT"; item: Incident; action: "RESOLVE" };

const ASSET_STATUSES = ["DRAFT", "ACTIVE", "AVAILABLE", "ASSIGNED", "MAINTENANCE", "OUT_OF_SERVICE", "DISPOSED"];
const ASSET_CONDITIONS = ["NEW", "GOOD", "FAIR", "POOR", "DAMAGED"];
const PRIORITIES = ["LOW", "NORMAL", "HIGH", "CRITICAL"];
const SEVERITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

function statusTone(status: string) {
  if (["AVAILABLE", "COMPLETED", "RESOLVED", "RETURNED"].includes(status)) return "success" as const;
  if (["ASSIGNED", "MAINTENANCE", "PLANNED", "IN_PROGRESS", "OPEN"].includes(status)) return "warning" as const;
  if (["OUT_OF_SERVICE", "DISPOSED", "CANCELLED"].includes(status)) return "danger" as const;
  return "neutral" as const;
}

export function EnterpriseAssetsMaintenanceWorkspaceV2({ organizationId, organizationName, definition }: { organizationId: string; organizationName: string; definition: EnterpriseModuleDefinition }) {
  const locale = useProfessionalErpLocale();
  const t = (key: Parameters<typeof professionalErpT>[1], values?: Record<string, string | number>) => professionalErpT(locale, key, values);
  const tr = (fr: string, en: string) => locale === "en" ? en : fr;
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [lookups, setLookups] = useState<Lookups>({ employees: [], members: [], departments: [], sites: [], locations: [], suppliers: [], assetCategories: [], purchases: [] });
  const [assetOpen, setAssetOpen] = useState(false);
  const [assetSiteId, setAssetSiteId] = useState("");
  const [overview, setOverview] = useState<AssetOverview | null>(null);
  const [subform, setSubform] = useState<Subform | null>(null);
  const [assignmentTarget, setAssignmentTarget] = useState<"EMPLOYEE" | "DEPARTMENT">("EMPLOYEE");
  const [review, setReview] = useState<Review | null>(null);
  const [reviewComment, setReviewComment] = useState("");
  const [busyAction, setBusyAction] = useState("");
  const [message, setMessage] = useState("");
  useToastMessage(message);

  useEffect(() => {
    let active = true;
    void fetch(`/api/enterprise/${organizationId}/projects-assets-lookups?module=ASSETS_MAINTENANCE`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => null) as Lookups & { message?: string } | null;
        if (!response.ok || !body) throw new Error(body?.message || t("assets.selectorsUnavailable"));
        if (active) setLookups({ employees: body.employees || [], members: body.members || [], departments: body.departments || [], sites: body.sites || [], locations: body.locations || [], suppliers: body.suppliers || [], assetCategories: body.assetCategories || [], purchases: body.purchases || [] });
      })
      .catch((error) => { if (active) setMessage(error instanceof Error ? error.message : t("assets.selectorsUnavailable")); });
    return () => { active = false; };
  }, [organizationId, locale, refreshKey]);

  const params = useMemo(() => { const value = new URLSearchParams({ page: String(page), pageSize: "25" }); if (search.trim()) value.set("search", search.trim()); if (status) value.set("status", status); return value; }, [page, search, status]);
  const assets = useProfessionalCollection<AssetListItem>({ endpoint: `/api/enterprise/${organizationId}/assets`, params, refreshKey });
  const statusItems = [{ id: "", label: t("assets.allStatuses") }, ...ASSET_STATUSES.map((id) => ({ id, label: professionalErpEnumLabel(locale, "assetStatus", id) }))];
  const conditionItems = ASSET_CONDITIONS.map((id) => ({ id, label: professionalErpEnumLabel(locale, "assetCondition", id) }));
  const priorityItems = PRIORITIES.map((id) => ({ id, label: professionalErpEnumLabel(locale, "priority", id) }));
  const severityItems = SEVERITIES.map((id) => ({ id, label: professionalErpEnumLabel(locale, "riskLevel", id) }));
  const maintenanceTypeItems = ["PREVENTIVE", "CORRECTIVE"].map((id) => ({ id, label: professionalErpEnumLabel(locale, "maintenanceType", id) }));
  const filteredLocations = assetSiteId ? lookups.locations.filter((location) => !location.warehouse.siteId || location.warehouse.siteId === assetSiteId) : lookups.locations;

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
    event.preventDefault();
    if (busyAction) return;
    const form = new FormData(event.currentTarget);
    setBusyAction("create-asset");
    try {
      await professionalMutation(`/api/enterprise/${organizationId}/assets`, {
        code: String(form.get("code") || ""), name: String(form.get("name") || ""), description: String(form.get("description") || "") || null,
        categoryId: String(form.get("categoryId") || "") || null, serialNumber: String(form.get("serialNumber") || "") || null,
        siteId: assetSiteId || null, storageLocationId: String(form.get("storageLocationId") || "") || null,
        responsibleEmployeeId: String(form.get("responsibleEmployeeId") || "") || null, supplierId: String(form.get("supplierId") || "") || null,
        purchaseId: String(form.get("purchaseId") || "") || null, acquisitionDate: String(form.get("acquisitionDate") || "") || null,
        indicativeValue: String(form.get("indicativeValue") || "") ? Number(form.get("indicativeValue")) : null,
        currency: String(form.get("currency") || "") || null, condition: String(form.get("condition") || "GOOD"),
        warrantyEndsAt: String(form.get("warrantyEndsAt") || "") || null, notes: String(form.get("notes") || "") || null,
      });
      setAssetOpen(false); setAssetSiteId(""); setRefreshKey((value) => value + 1); setMessage(t("assets.created"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("assets.createFailed"));
    } finally {
      setBusyAction("");
    }
  }

  async function submitSubform(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!overview || !subform || busyAction) return;
    const form = new FormData(event.currentTarget);
    setBusyAction(`asset-${subform.toLowerCase()}`);
    try {
      if (subform === "ASSIGN") await professionalMutation(`/api/enterprise/${organizationId}/assets/${overview.id}/assignments`, {
        employeeId: assignmentTarget === "EMPLOYEE" ? String(form.get("employeeId") || "") || null : null,
        departmentId: assignmentTarget === "DEPARTMENT" ? String(form.get("departmentId") || "") || null : null,
        assignedAt: String(form.get("assignedAt") || "") || new Date().toISOString(), expectedReturnAt: String(form.get("expectedReturnAt") || "") || null,
        initialCondition: String(form.get("initialCondition") || overview.condition), notes: String(form.get("notes") || "") || null,
      });
      if (subform === "RETURN") {
        const active = overview.assignments.find((assignment) => assignment.status === "ACTIVE");
        if (!active) throw new Error(t("assets.noActiveAssignment"));
        await professionalMutation(`/api/enterprise/${organizationId}/asset-assignments/${active.id}/return`, { revision: active.revision, returnedAt: String(form.get("returnedAt") || "") || new Date().toISOString(), returnCondition: String(form.get("returnCondition") || "GOOD"), notes: String(form.get("notes") || "") || null });
      }
      if (subform === "MAINTENANCE") await professionalMutation(`/api/enterprise/${organizationId}/assets/${overview.id}/maintenance`, { maintenanceType: String(form.get("maintenanceType") || "PREVENTIVE"), title: String(form.get("title") || ""), description: String(form.get("description") || "") || null, priority: String(form.get("priority") || "NORMAL"), responsibleUserId: String(form.get("responsibleUserId") || "") || null, supplierId: String(form.get("supplierId") || "") || null, plannedAt: String(form.get("plannedAt") || "") || null, dueAt: String(form.get("dueAt") || "") || null, indicativeCost: String(form.get("indicativeCost") || "") ? Number(form.get("indicativeCost")) : null, currency: String(form.get("currency") || "") || null, notes: String(form.get("notes") || "") || null });
      if (subform === "INCIDENT") await professionalMutation(`/api/enterprise/${organizationId}/assets/${overview.id}/incidents`, { incidentType: "DAMAGE", title: String(form.get("title") || ""), description: String(form.get("description") || ""), severity: String(form.get("severity") || "MEDIUM"), responsibleUserId: String(form.get("responsibleUserId") || "") || null, occurredAt: String(form.get("occurredAt") || "") || null });
      setSubform(null); await reloadOverview(); setMessage(t("assets.historyUpdated"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("assets.operationFailed"));
    } finally {
      setBusyAction("");
    }
  }

  function openMaintenanceReview(item: Maintenance, action: "START" | "COMPLETE" | "CANCEL") { setReview({ kind: "MAINTENANCE", item, action }); setReviewComment(""); }
  function openIncidentReview(item: Incident) { setReview({ kind: "INCIDENT", item, action: "RESOLVE" }); setReviewComment(""); }

  async function confirmReview() {
    if (!overview || !review || busyAction) return;
    const requiresComment = review.kind === "INCIDENT" || (review.kind === "MAINTENANCE" && review.action === "CANCEL");
    if (requiresComment && reviewComment.trim().length < 3) return;
    setBusyAction(`asset-review:${review.item.id}`);
    try {
      if (review.kind === "MAINTENANCE") await professionalMutation(`/api/enterprise/${organizationId}/asset-maintenance/${review.item.id}/transition`, { action: review.action, revision: review.item.revision, comment: reviewComment.trim() || null });
      if (review.kind === "INCIDENT") await professionalMutation(`/api/enterprise/${organizationId}/asset-incidents/${review.item.id}/resolve`, { revision: review.item.revision, resolution: reviewComment.trim() });
      setReview(null); setReviewComment(""); await reloadOverview(); setMessage(review.kind === "INCIDENT" ? t("assets.incidentResolved") : t("assets.maintenanceUpdated"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("assets.operationFailed"));
    } finally {
      setBusyAction("");
    }
  }

  const actionsFor = (asset: AssetListItem): BusinessContextAction[] => [
    { id: "open", label: t("assets.open"), icon: Eye, onSelect: () => void openAsset(asset) },
    ...(assets.canManage && ["AVAILABLE", "ACTIVE", "DRAFT"].includes(asset.status) ? [{ id: "assign", label: t("assets.assign"), icon: PackageCheck, disabled: Boolean(busyAction), onSelect: async () => { await openAsset(asset); setSubform("ASSIGN"); } }] : []),
  ];
  const reviewRequiresComment = Boolean(review && (review.kind === "INCIDENT" || (review.kind === "MAINTENANCE" && review.action === "CANCEL")));
  const departmentName = (id: string | null) => lookups.departments.find((department) => department.id === id)?.[locale === "en" ? "labelEn" : "labelFr"] || lookups.departments.find((department) => department.id === id)?.labelFr || tr("Département", "Department");

  return <ModuleWorkspace>
    <ModuleHeader eyebrow={t("assets.eyebrow", { organization: organizationName })} title={t("assets.title")} description={`${locale === "en" ? definition.descriptionEn : definition.descriptionFr} ${tr("Le statut de l’actif est synchronisé depuis ses affectations, maintenances et incidents actifs.", "Asset status is synchronized from active assignments, maintenance and incidents.")}`} count={t("assets.count", { count: assets.pagination.total, suffix: assets.pagination.total === 1 ? "" : "s" })} primaryAction={assets.canWrite ? <Button disabled={Boolean(busyAction)} onClick={() => setAssetOpen(true)}><Plus className="h-4 w-4" />{t("assets.newAsset")}</Button> : undefined} />
    <ModuleMetrics label={t("assets.metrics")}><ModuleMetric label={t("assets.registered")} value={assets.pagination.total} /><ModuleMetric label={t("assets.assigned")} value={assets.metrics.assigned || 0} /><ModuleMetric label={t("assets.inMaintenance")} value={assets.metrics.maintenance || 0} /><ModuleMetric label={t("assets.openIncidents")} value={assets.metrics.openIncidents || 0} /></ModuleMetrics>
    <ModuleToolbar search={<ProfessionalSearch value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder={t("assets.search")} />} controls={<NativeSelect value={status} onChange={(value) => { setStatus(value); setPage(1); }} items={statusItems} />} summary={tr("Registre des actifs, affectations, retours, maintenances et incidents avec historique conservé.", "Register of assets, assignments, returns, maintenance and incidents with preserved history.")} />
    <ModuleContent>
      {message ? <div role="status" className="rounded-xl border border-dtsc-border bg-dtsc-page px-4 py-3 text-sm font-semibold">{message}</div> : null}
      <ModuleSection title={t("assets.register")} description={t("assets.registerDescription")}>
        {assets.error ? <ProfessionalError message={assets.error} /> : assets.loading ? <ProfessionalLoading /> : assets.items.length ? <>
          <BusinessList ariaLabel={t("assets.registerAria")}>{assets.items.map((asset) => <BusinessListItem key={asset.id} title={`${asset.code} · ${asset.name}`} status={<StatusBadge tone={statusTone(asset.status)}>{professionalErpEnumLabel(locale, "assetStatus", asset.status)}</StatusBadge>} meta={`${asset.category?.name || t("assets.noCategory")} · ${professionalErpEnumLabel(locale, "assetCondition", asset.condition)} · ${professionalErpMoney(asset.indicativeValue, asset.currency, locale)}`} description={`${asset.site?.name || t("assets.noSite")}${asset.serialNumber ? ` · ${t("assets.serial", { serial: asset.serialNumber })}` : ""} · ${t("assets.maintenanceCount", { count: asset._count.maintenanceRecords, suffix: asset._count.maintenanceRecords === 1 ? "" : "s" })} · ${t("assets.incidentCount", { count: asset._count.incidents, suffix: asset._count.incidents === 1 ? "" : "s" })}`} onOpen={() => void openAsset(asset)} openLabel={t("assets.openAsset", { code: asset.code })} actions={<ContextActions label={t("assets.assetActions")} actions={actionsFor(asset)} />} />)}</BusinessList>
          <ProfessionalPager pagination={assets.pagination} onPageChange={setPage} locale={locale} />
        </> : <EmptyState compact title={t("assets.noAsset")} description={t("assets.noAssetDescription")} />}
      </ModuleSection>
      <ProfessionalHelp moduleCode="ASSETS_MAINTENANCE" />
    </ModuleContent>

    <Dialog open={assetOpen} onClose={() => { if (!busyAction) setAssetOpen(false); }} title={t("assets.newAssetTitle")} presentation="editor" className="max-w-5xl">
      <form onSubmit={createAsset} className="grid gap-5 p-4 sm:p-5"><ProfessionalFormSection title={t("assets.identification")}><Field label={t("assets.reference")}><Input name="code" required /></Field><Field label={t("assets.name")}><Input name="name" required /></Field><Field label={t("assets.category")}><NativeSelect name="categoryId" items={[{ id: "", label: t("assets.noCategory") }, ...lookups.assetCategories.map((category) => ({ id: category.id, label: `${category.code} · ${category.name}` }))]} /></Field><Field label={t("assets.serialNumber")}><Input name="serialNumber" /></Field><Field label={t("assets.description")}><textarea name="description" rows={3} className="w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-base" /></Field></ProfessionalFormSection><ProfessionalFormSection title={t("assets.acquisitionLocation")}><Field label={tr("Achat d’origine", "Source purchase")}><NativeSelect name="purchaseId" items={[{ id: "", label: tr("Aucun achat lié", "No linked purchase") }, ...lookups.purchases.map((purchase) => ({ id: purchase.id, label: `${purchase.reference} · ${purchase.title} · ${purchase.currency}` }))]} /></Field><Field label={t("assets.supplier")}><NativeSelect name="supplierId" items={[{ id: "", label: t("assets.notProvided") }, ...lookups.suppliers.map((supplier) => ({ id: supplier.id, label: supplier.displayName || supplier.legalName }))]} /></Field><Field label={t("assets.acquisitionDate")}><Input name="acquisitionDate" type="date" /></Field><Field label={t("assets.indicativeValue")}><Input name="indicativeValue" type="number" min="0" step="0.01" /></Field><Field label={t("assets.currency")}><Input name="currency" maxLength={3} defaultValue="USD" /></Field><Field label={t("assets.warrantyUntil")}><Input name="warrantyEndsAt" type="date" /></Field><Field label={t("assets.site")}><NativeSelect value={assetSiteId} onChange={setAssetSiteId} items={[{ id: "", label: t("assets.notProvided") }, ...lookups.sites.map((site) => ({ id: site.id, label: `${site.code} · ${site.name}` }))]} /></Field><Field label={t("assets.location")}><NativeSelect name="storageLocationId" items={[{ id: "", label: t("assets.notProvided") }, ...filteredLocations.map((location) => ({ id: location.id, label: `${location.code} · ${location.name}` }))]} /></Field><Field label={tr("Affecter dès la création", "Assign on creation")}><NativeSelect name="responsibleEmployeeId" items={[{ id: "", label: t("assets.unassigned") }, ...lookups.employees.map((employee) => ({ id: employee.id, label: `${employee.employeeNumber} · ${employee.displayName}` }))]} /></Field><Field label={t("assets.condition")}><NativeSelect name="condition" defaultValue="GOOD" items={conditionItems} /></Field><Field label={t("assets.notes")}><Input name="notes" /></Field></ProfessionalFormSection><div className="sticky bottom-0 flex justify-end gap-2 border-t border-dtsc-border bg-dtsc-surface py-3"><Button type="button" variant="outline" disabled={Boolean(busyAction)} onClick={() => setAssetOpen(false)}>{t("assets.cancel")}</Button><Button type="submit" disabled={Boolean(busyAction)}>{busyAction === "create-asset" ? tr("Enregistrement…", "Saving…") : t("assets.saveAsset")}</Button></div></form>
    </Dialog>

    <Dialog open={Boolean(overview)} onClose={() => { if (!busyAction) { setOverview(null); setSubform(null); } }} title={overview ? `${overview.code} · ${overview.name}` : t("assets.assetDetail")} presentation="editor" className="max-w-6xl">
      {overview ? <div className="grid gap-6 p-4 sm:p-5"><div className="flex flex-wrap gap-2"><StatusBadge tone={statusTone(overview.status)}>{professionalErpEnumLabel(locale, "assetStatus", overview.status)}</StatusBadge><StatusBadge>{professionalErpEnumLabel(locale, "assetCondition", overview.condition)}</StatusBadge><StatusBadge>{professionalErpMoney(overview.indicativeValue, overview.currency, locale)}</StatusBadge></div><div data-responsive-actions className="flex flex-wrap gap-2">{assets.canManage && ["AVAILABLE", "ACTIVE", "DRAFT"].includes(overview.status) ? <Button variant="outline" disabled={Boolean(busyAction)} onClick={() => setSubform("ASSIGN")}><PackageCheck className="h-4 w-4" />{t("assets.assign")}</Button> : null}{assets.canManage && overview.assignments.some((assignment) => assignment.status === "ACTIVE") ? <Button variant="outline" disabled={Boolean(busyAction)} onClick={() => setSubform("RETURN")}><RotateCcw className="h-4 w-4" />{t("assets.returnAsset")}</Button> : null}{assets.canWrite && overview.status !== "DISPOSED" ? <><Button variant="outline" disabled={Boolean(busyAction)} onClick={() => setSubform("MAINTENANCE")}><Wrench className="h-4 w-4" />{t("assets.planMaintenance")}</Button><Button disabled={Boolean(busyAction)} onClick={() => setSubform("INCIDENT")}><AlertTriangle className="h-4 w-4" />{t("assets.reportIncident")}</Button></> : null}</div>
        <ModuleSection title={t("assets.assignments")}><BusinessList ariaLabel={t("assets.assignmentsAria")}>{overview.assignments.map((assignment) => <BusinessListItem key={assignment.id} title={assignment.employee ? `${assignment.employee.employeeNumber} · ${assignment.employee.displayName}` : departmentName(assignment.departmentId)} status={<StatusBadge tone={statusTone(assignment.status)}>{professionalErpEnumLabel(locale, "assetStatus", assignment.status)}</StatusBadge>} meta={t("assets.assignedOn", { date: professionalErpDate(assignment.assignedAt, locale) })} description={`${professionalErpEnumLabel(locale, "assetCondition", assignment.initialCondition)}${assignment.returnCondition ? ` → ${professionalErpEnumLabel(locale, "assetCondition", assignment.returnCondition)}` : ""}${assignment.notes ? ` · ${assignment.notes}` : ""}`} />)}</BusinessList></ModuleSection>
        <ModuleSection title={t("assets.maintenances")}><BusinessList ariaLabel={t("assets.maintenancesAria")}>{overview.maintenanceRecords.map((item) => { const maintenanceActions: BusinessContextAction[] = []; if (assets.canManage && item.status === "PLANNED") maintenanceActions.push({ id: "start", label: t("assets.start"), icon: Wrench, disabled: Boolean(busyAction), onSelect: () => openMaintenanceReview(item, "START") }, { id: "cancel", label: t("assets.cancel"), icon: XCircle, destructive: true, disabled: Boolean(busyAction), onSelect: () => openMaintenanceReview(item, "CANCEL") }); if (assets.canManage && item.status === "IN_PROGRESS") maintenanceActions.push({ id: "complete", label: t("assets.complete"), icon: CheckCircle2, disabled: Boolean(busyAction), onSelect: () => openMaintenanceReview(item, "COMPLETE") }, { id: "cancel", label: t("assets.cancel"), icon: XCircle, destructive: true, disabled: Boolean(busyAction), onSelect: () => openMaintenanceReview(item, "CANCEL") }); return <BusinessListItem key={item.id} title={`${item.reference} · ${item.title}`} status={<StatusBadge tone={statusTone(item.status)}>{professionalErpEnumLabel(locale, "assetStatus", item.status)}</StatusBadge>} meta={`${professionalErpEnumLabel(locale, "maintenanceType", item.maintenanceType)} · ${professionalErpEnumLabel(locale, "priority", item.priority)}${item.dueAt ? ` · ${t("assets.dueOn", { date: professionalErpDate(item.dueAt, locale) })}` : ""}`} description={`${item.description || t("assets.noDescription")}${item.indicativeCost !== null ? ` · ${professionalErpMoney(item.indicativeCost, item.currency, locale)}` : ""}`} actions={maintenanceActions.length ? <ContextActions label={t("assets.maintenanceActions")} actions={maintenanceActions} /> : undefined} />; })}</BusinessList></ModuleSection>
        <ModuleSection title={t("assets.incidents")}><BusinessList ariaLabel={t("assets.incidentsAria")}>{overview.incidents.map((item) => <BusinessListItem key={item.id} title={`${item.reference} · ${item.title}`} status={<StatusBadge tone={item.status === "RESOLVED" ? "success" : item.severity === "HIGH" || item.severity === "CRITICAL" ? "danger" : "warning"}>{professionalErpEnumLabel(locale, "assetStatus", item.status)}</StatusBadge>} meta={`${tr("Dommage", "Damage")} · ${professionalErpEnumLabel(locale, "riskLevel", item.severity)}`} description={item.resolution || item.description} actions={assets.canManage && item.status === "OPEN" ? <ContextActions label={t("assets.incidentActions")} actions={[{ id: "resolve", label: t("assets.markResolved"), icon: CheckCircle2, disabled: Boolean(busyAction), onSelect: () => openIncidentReview(item) }]} /> : undefined} />)}</BusinessList></ModuleSection>
      </div> : null}
    </Dialog>

    <Dialog open={Boolean(subform)} onClose={() => { if (!busyAction) setSubform(null); }} title={subform === "ASSIGN" ? t("assets.assignTitle") : subform === "RETURN" ? t("assets.returnTitle") : subform === "MAINTENANCE" ? t("assets.maintenanceTitle") : t("assets.incidentTitle")} presentation="editor" className="max-w-4xl">
      {overview && subform ? <form onSubmit={submitSubform} className="grid gap-5 p-4 sm:p-5"><ProfessionalFormSection title={t("assets.information")}>
        {subform === "ASSIGN" ? <><Field label={tr("Type d’affectation", "Assignment target")}><NativeSelect value={assignmentTarget} onChange={(value) => setAssignmentTarget(value as "EMPLOYEE" | "DEPARTMENT")} items={[{ id: "EMPLOYEE", label: tr("Collaborateur", "Employee") }, { id: "DEPARTMENT", label: tr("Département", "Department") }]} /></Field>{assignmentTarget === "EMPLOYEE" ? <Field label={t("assets.collaborator")}><NativeSelect name="employeeId" required items={[{ id: "", label: t("assets.none") }, ...lookups.employees.map((employee) => ({ id: employee.id, label: `${employee.employeeNumber} · ${employee.displayName}` }))]} /></Field> : <Field label={t("assets.department")}><NativeSelect name="departmentId" required items={[{ id: "", label: t("assets.none") }, ...lookups.departments.map((department) => ({ id: department.id, label: locale === "en" && department.labelEn ? department.labelEn : department.labelFr }))]} /></Field>}<Field label={t("assets.assignmentDate")}><Input name="assignedAt" type="date" /></Field><Field label={t("assets.expectedReturn")}><Input name="expectedReturnAt" type="date" /></Field><Field label={t("assets.initialCondition")}><NativeSelect name="initialCondition" defaultValue={overview.condition} items={conditionItems} /></Field></> : null}
        {subform === "RETURN" ? <><Field label={t("assets.returnDate")}><Input name="returnedAt" type="date" /></Field><Field label={t("assets.returnCondition")}><NativeSelect name="returnCondition" defaultValue="GOOD" items={conditionItems} /></Field></> : null}
        {subform === "MAINTENANCE" ? <><Field label={t("assets.maintenanceType")}><NativeSelect name="maintenanceType" defaultValue="PREVENTIVE" items={maintenanceTypeItems} /></Field><Field label={t("assets.title")}><Input name="title" required /></Field><Field label={t("assets.description")}><textarea name="description" rows={3} className="w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-base" /></Field><Field label={t("assets.priority")}><NativeSelect name="priority" defaultValue="NORMAL" items={priorityItems} /></Field><Field label={t("assets.responsible")}><NativeSelect name="responsibleUserId" items={[{ id: "", label: t("assets.unassigned") }, ...lookups.members.map((member) => ({ id: member.id, label: `${member.label}${member.positionTitle ? ` · ${member.positionTitle}` : ""}` }))]} /></Field><Field label={t("assets.supplier")}><NativeSelect name="supplierId" items={[{ id: "", label: t("assets.notProvided") }, ...lookups.suppliers.map((supplier) => ({ id: supplier.id, label: supplier.displayName || supplier.legalName }))]} /></Field><Field label={t("assets.plannedAt")}><Input name="plannedAt" type="date" /></Field><Field label={t("assets.dueAt")}><Input name="dueAt" type="date" /></Field><Field label={t("assets.indicativeCost")}><Input name="indicativeCost" type="number" min="0" step="0.01" /></Field><Field label={t("assets.currency")}><Input name="currency" maxLength={3} defaultValue={overview.currency || "USD"} /></Field></> : null}
        {subform === "INCIDENT" ? <><Field label={t("assets.title")}><Input name="title" required /></Field><Field label={t("assets.description")}><textarea name="description" rows={4} required className="w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-base" /></Field><Field label={t("assets.severity")}><NativeSelect name="severity" defaultValue="MEDIUM" items={severityItems} /></Field><Field label={t("assets.responsible")}><NativeSelect name="responsibleUserId" items={[{ id: "", label: t("assets.unassigned") }, ...lookups.members.map((member) => ({ id: member.id, label: `${member.label}${member.positionTitle ? ` · ${member.positionTitle}` : ""}` }))]} /></Field><Field label={t("assets.occurredAt")}><Input name="occurredAt" type="date" /></Field></> : null}
        <Field label={t("assets.notes")}><textarea name="notes" rows={3} className="w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-base" /></Field>
      </ProfessionalFormSection><div className="sticky bottom-0 flex justify-end gap-2 border-t border-dtsc-border bg-dtsc-surface py-3"><Button type="button" variant="outline" disabled={Boolean(busyAction)} onClick={() => setSubform(null)}>{t("assets.cancel")}</Button><Button type="submit" disabled={Boolean(busyAction)}>{busyAction ? tr("Enregistrement…", "Saving…") : t("assets.save")}</Button></div></form> : null}
    </Dialog>

    <Dialog open={Boolean(review)} onClose={() => { if (!busyAction) setReview(null); }} title={review?.kind === "INCIDENT" ? t("assets.markResolved") : review?.action === "CANCEL" ? t("assets.cancel") : review?.action === "COMPLETE" ? t("assets.complete") : t("assets.start")} presentation="editor" className="max-w-3xl">
      {review ? <div className="grid gap-5 p-4 sm:p-5"><ProfessionalFormSection title={tr("Revue de l’action", "Action review")} description={tr("Vérifiez l’action avant de confirmer. Elle sera versionnée et auditée côté serveur.", "Review the action before confirming. It will be versioned and audited server-side.")}><div className="md:col-span-2 rounded-xl border border-dtsc-border bg-dtsc-page p-4"><p className="font-black">{review.item.reference} · {review.item.title}</p><p className="mt-1 text-sm text-dtsc-muted">{review.kind === "INCIDENT" ? professionalErpEnumLabel(locale, "riskLevel", review.item.severity) : professionalErpEnumLabel(locale, "maintenanceType", review.item.maintenanceType)}</p></div><Field label={review.kind === "INCIDENT" ? t("assets.resolvePrompt") : review.action === "CANCEL" ? t("assets.cancelReason") : t("assets.notes")}><textarea value={reviewComment} onChange={(event) => setReviewComment(event.target.value)} rows={5} required={reviewRequiresComment} className="w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-base" /></Field></ProfessionalFormSection><div className="sticky bottom-0 flex justify-end gap-2 border-t border-dtsc-border bg-dtsc-surface py-3"><Button type="button" variant="outline" disabled={Boolean(busyAction)} onClick={() => setReview(null)}>{t("assets.cancel")}</Button><Button type="button" disabled={Boolean(busyAction) || (reviewRequiresComment && reviewComment.trim().length < 3)} onClick={() => void confirmReview()}>{busyAction ? tr("Traitement…", "Processing…") : tr("Confirmer", "Confirm")}</Button></div></div> : null}
    </Dialog>
  </ModuleWorkspace>;
}