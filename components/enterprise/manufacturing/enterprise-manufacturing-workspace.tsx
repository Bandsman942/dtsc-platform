"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Factory, PackageSearch, PlayCircle, Plus, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import { EnterpriseApproverSelect } from "@/components/enterprise/enterprise-approver-select";
import { Field, NativeSelect, priorityChoices, statusTone } from "@/components/enterprise/core-v2/erp-v2-ui";
import { ProfessionalError, ProfessionalHelp, ProfessionalLoading, ProfessionalTabs, professionalMutation } from "@/components/enterprise/professional/professional-erp-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToastMessage } from "@/components/ui/use-toast-message";
import { ModuleMetric, ModuleMetrics } from "@/components/workspace/module-metrics";
import { ModuleContent, ModuleHeader, ModuleSection, ModuleWorkspace } from "@/components/workspace/module-workspace";
import { StatusBadge } from "@/components/workspace/status-badge";
import type { ManufacturingModuleCode } from "@/lib/enterprise/manufacturing/constants";
import type { EnterpriseModuleDefinition } from "@/lib/enterprise/module-registry";

type Numeric = string | number;
type CatalogItem = { id: string; code: string; name: string; itemType: string; trackInventory: boolean; unitOfMeasure: { code: string; name: string; symbol: string | null }; inventoryItems: Array<{ id: string }> };
type Warehouse = { id: string; code: string; name: string; siteId: string; site: { id: string; name: string } };
type SalesOrder = { id: string; reference: string; title: string; status: string; items: Array<{ id: string; catalogItemId: string | null; description: string; quantityOrdered: Numeric; quantityFulfilled: Numeric }> };
type Employee = { id: string; employeeNumber: string; displayName: string };
type Asset = { id: string; code: string; name: string; status: string };
type Supplier = { id: string; legalName: string; displayName: string | null };
type WorkCenter = { id: string; code: string; name: string; status: string; siteId: string | null; assetId: string | null; capacityPerDay: Numeric | null; capacityUnit: string | null; revision: number };
type BomLine = { id: string; catalogItemId: string; quantity: Numeric; scrapRate: Numeric; issueMethod: string; sequence: number };
type Bom = { id: string; code: string; name: string; catalogItemId: string; version: number; outputQuantity: Numeric; status: string; revision: number; lines: BomLine[] };
type RoutingOperation = { id: string; code: string; name: string; sequence: number; workCenterId: string | null; setupMinutes: number; standardMinutes: number | null; requiresQualityCheck: boolean };
type Routing = { id: string; code: string; name: string; catalogItemId: string | null; version: number; status: string; revision: number; operations: RoutingOperation[] };
type Requirement = { id: string; catalogItemId: string; inventoryItemId: string; warehouseId: string; requiredQuantity: Numeric; consumedQuantity: Numeric; shortageQuantity: Numeric; status: string; purchaseId: string | null; revision: number };
type Execution = { id: string; executionType: string; quantityCompleted: Numeric | null; minutesWorked: number | null; createdAt: string };
type QualityCheck = { id: string; result: string; checkType: string; quantityChecked: Numeric; quantityAccepted: Numeric; quantityRejected: Numeric; createdAt: string };
type Scrap = { id: string; catalogItemId: string; quantity: Numeric; reasonCode: string; affectsInventory: boolean; occurredAt: string };
type ProductionOrder = {
  id: string;
  reference: string;
  title: string;
  status: string;
  priority: string;
  revision: number;
  outputCatalogItemId: string;
  plannedQuantity: Numeric;
  producedQuantity: Numeric;
  scrappedQuantity: Numeric;
  materialWarehouseId: string;
  outputWarehouseId: string;
  bom: { id: string; code: string; name: string; version: number };
  routing: { id: string; code: string; name: string; version: number } | null;
  requirements: Requirement[];
  executions: Execution[];
  qualityChecks: QualityCheck[];
  scraps: Scrap[];
};
type ManufacturingReferences = {
  configuration: { defaultMaterialWarehouseId: string | null; defaultOutputWarehouseId: string | null; qualityRequiredByDefault: boolean; allowOverproduction: boolean } | null;
  catalogItems: CatalogItem[];
  warehouses: Warehouse[];
  salesOrders: SalesOrder[];
  employees: Employee[];
  assets: Asset[];
  approvedTimesheetEntries: Array<{ id: string; workDate: string; approvedMinutes: number | null; timesheet: { employeeId: string; reference: string } }>;
  suppliers: Supplier[];
  boms: Array<{ id: string; code: string; name: string; catalogItemId: string; version: number; outputQuantity: Numeric }>;
  routings: Array<{ id: string; code: string; name: string; catalogItemId: string | null; version: number }>;
  workCenters: Array<{ id: string; code: string; name: string; siteId: string | null; assetId: string | null }>;
};
type Overview = {
  metrics: { plannedQuantity: number; producedQuantity: number; completionRate: number; scrappedQuantity: number; shortageQuantity: number; executions: number; scrapEvents: number; scrapEventQuantity: number };
  ordersByStatus: Array<{ status: string; _count: { _all: number } }>;
  requirementsByStatus: Array<{ status: string; _count: { _all: number } }>;
  qualityByResult: Array<{ result: string; _count: { _all: number } }>;
  recentOrders: Array<{ id: string; reference: string; title: string; status: string; priority: string; plannedQuantity: Numeric; producedQuantity: Numeric }>;
};
type ReportData = Overview & { inventory: Record<string, unknown>; labor: { minutesWorked: number; entries: number } };
type ManufacturingPayload = {
  moduleCode: ManufacturingModuleCode;
  capabilities: { canWrite: boolean; canApprove: boolean; canManage: boolean };
  overview: Overview;
  report: ReportData | null;
  references: ManufacturingReferences | null;
  boms: Bom[];
  routings: Routing[];
  workCenters: WorkCenter[];
  orders: ProductionOrder[];
};
type BomDraftLine = { catalogItemId: string; quantity: string; scrapRate: string };
type RoutingDraftOperation = { code: string; name: string; workCenterId: string; standardMinutes: string; requiresQualityCheck: boolean };

const MODULES: Array<{ id: ManufacturingModuleCode; fr: string; en: string }> = [
  { id: "MANUFACTURING_OVERVIEW", fr: "Vue d’ensemble", en: "Overview" },
  { id: "BILL_OF_MATERIALS", fr: "Nomenclatures", en: "Bills of materials" },
  { id: "PRODUCTION_ORDERS", fr: "Ordres", en: "Orders" },
  { id: "PRODUCTION_ROUTINGS", fr: "Gammes", en: "Routings" },
  { id: "WORK_CENTERS", fr: "Centres de travail", en: "Work centers" },
  { id: "MATERIAL_REQUIREMENTS", fr: "Besoins matières", en: "Material requirements" },
  { id: "PRODUCTION_EXECUTION", fr: "Exécution", en: "Execution" },
  { id: "QUALITY_CONTROL", fr: "Qualité", en: "Quality" },
  { id: "SCRAP_WASTE", fr: "Rebuts & pertes", en: "Scrap & waste" },
  { id: "PRODUCTION_REPORTS", fr: "Rapports", en: "Reports" },
];

function numberValue(value: Numeric | null | undefined) { return Number(value || 0); }
function tx(locale: string | null | undefined, fr: string, en: string) { return locale === "en" ? en : fr; }
function statusLabel(locale: string | null | undefined, value: string) {
  const fr: Record<string, string> = { DRAFT: "Brouillon", SUBMITTED: "Soumis", RELEASED: "Libéré", IN_PROGRESS: "En cours", COMPLETED: "Terminé", REJECTED: "Rejeté", CANCELLED: "Annulé", ACTIVE: "Actif", INACTIVE: "Inactif", MAINTENANCE: "Maintenance", RETIRED: "Retiré", PLANNED: "Planifié", AVAILABLE: "Disponible", SHORTAGE: "Pénurie", PARTIALLY_CONSUMED: "Partiellement consommé", CONSUMED: "Consommé", PASS: "Conforme", FAIL: "Non conforme", HOLD: "Bloqué" };
  const en: Record<string, string> = { DRAFT: "Draft", SUBMITTED: "Submitted", RELEASED: "Released", IN_PROGRESS: "In progress", COMPLETED: "Completed", REJECTED: "Rejected", CANCELLED: "Cancelled", ACTIVE: "Active", INACTIVE: "Inactive", MAINTENANCE: "Maintenance", RETIRED: "Retired", PLANNED: "Planned", AVAILABLE: "Available", SHORTAGE: "Shortage", PARTIALLY_CONSUMED: "Partially consumed", CONSUMED: "Consumed", PASS: "Pass", FAIL: "Fail", HOLD: "Hold" };
  return (locale === "en" ? en : fr)[value] || value;
}
function itemLabel(items: CatalogItem[], id: string) { const item = items.find((candidate) => candidate.id === id); return item ? `${item.code} · ${item.name}` : id; }
function warehouseLabel(items: Warehouse[], id: string) { const item = items.find((candidate) => candidate.id === id); return item ? `${item.code} · ${item.name}` : id; }

export function EnterpriseManufacturingWorkspace({
  organizationId,
  organizationName,
  definition,
  initialFocus,
  locale,
}: {
  organizationId: string;
  organizationName: string;
  definition: EnterpriseModuleDefinition;
  initialFocus: ManufacturingModuleCode;
  locale?: string | null;
}) {
  const router = useRouter();
  const [data, setData] = useState<ManufacturingPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [selectedSalesOrderId, setSelectedSalesOrderId] = useState("");
  const [executionOrderId, setExecutionOrderId] = useState("");
  const [requirementOrderId, setRequirementOrderId] = useState("");
  const [qualityOrderId, setQualityOrderId] = useState("");
  const [scrapOrderId, setScrapOrderId] = useState("");
  const [bomLines, setBomLines] = useState<BomDraftLine[]>([{ catalogItemId: "", quantity: "1", scrapRate: "0" }]);
  const [routingOperations, setRoutingOperations] = useState<RoutingDraftOperation[]>([{ code: "OP10", name: "", workCenterId: "", standardMinutes: "", requiresQualityCheck: false }]);
  useToastMessage(message);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    fetch(`/api/enterprise/${organizationId}/manufacturing?moduleCode=${encodeURIComponent(initialFocus)}`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => null) as (ManufacturingPayload & { message?: string; error?: string }) | null;
        if (!response.ok || !body) throw new Error(body?.message || body?.error || tx(locale, "Chargement Manufacturing impossible.", "Unable to load Manufacturing."));
        if (active) setData(body);
      })
      .catch((loadError) => { if (active) setError(loadError instanceof Error ? loadError.message : tx(locale, "Chargement Manufacturing impossible.", "Unable to load Manufacturing.")); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [initialFocus, locale, organizationId, refreshKey]);

  const references = data?.references;
  const activeOrders = useMemo(() => (data?.orders || []).filter((order) => ["RELEASED", "IN_PROGRESS"].includes(order.status)), [data?.orders]);
  const inProgressOrders = useMemo(() => (data?.orders || []).filter((order) => order.status === "IN_PROGRESS"), [data?.orders]);
  const executionOrder = useMemo(() => (data?.orders || []).find((order) => order.id === executionOrderId) || null, [data?.orders, executionOrderId]);
  const requirementOrder = useMemo(() => (data?.orders || []).find((order) => order.id === requirementOrderId) || null, [data?.orders, requirementOrderId]);
  const qualityOrder = useMemo(() => (data?.orders || []).find((order) => order.id === qualityOrderId) || null, [data?.orders, qualityOrderId]);
  const scrapOrder = useMemo(() => (data?.orders || []).find((order) => order.id === scrapOrderId) || null, [data?.orders, scrapOrderId]);
  const selectedSalesOrder = references?.salesOrders.find((order) => order.id === selectedSalesOrderId) || null;

  async function mutate(action: string, payload: unknown, entityId?: string) {
    setSubmitting(true); setMessage("");
    try {
      const result = await professionalMutation(`/api/enterprise/${organizationId}/manufacturing?moduleCode=${encodeURIComponent(initialFocus)}`, { action, payload, entityId });
      setRefreshKey((value) => value + 1);
      setMessage(tx(locale, "Opération de production enregistrée.", "Manufacturing operation saved."));
      return result;
    } catch (mutationError) {
      setMessage(mutationError instanceof Error ? mutationError.message : tx(locale, "Opération impossible.", "Operation failed."));
      return null;
    } finally { setSubmitting(false); }
  }

  async function orderMutate(orderId: string, action: string, payload: unknown = {}) {
    setSubmitting(true); setMessage("");
    try {
      const result = await professionalMutation(`/api/enterprise/${organizationId}/manufacturing/orders/${orderId}`, { action, payload });
      setRefreshKey((value) => value + 1);
      setMessage(tx(locale, "Ordre de production mis à jour.", "Production order updated."));
      return result;
    } catch (mutationError) {
      setMessage(mutationError instanceof Error ? mutationError.message : tx(locale, "Action impossible sur cet ordre.", "Unable to update this order."));
      return null;
    } finally { setSubmitting(false); }
  }

  if (loading && !data) return <ModuleWorkspace><ProfessionalLoading rows={6} /></ModuleWorkspace>;
  if (error || !data) return <ModuleWorkspace><ProfessionalError message={error || tx(locale, "Données Manufacturing indisponibles.", "Manufacturing data unavailable.")} /></ModuleWorkspace>;

  const metrics = data.overview.metrics;
  const catalogChoices = (references?.catalogItems || []).map((item) => ({ id: item.id, label: `${item.code} · ${item.name}` }));
  const warehouseChoices = (references?.warehouses || []).map((item) => ({ id: item.id, label: `${item.code} · ${item.name}` }));
  const employeeChoices = (references?.employees || []).map((item) => ({ id: item.id, label: `${item.employeeNumber} · ${item.displayName}` }));
  const assetChoices = (references?.assets || []).map((item) => ({ id: item.id, label: `${item.code} · ${item.name}` }));
  const workCenterChoices = data.workCenters.map((item) => ({ id: item.id, label: `${item.code} · ${item.name}` }));

  async function createBom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    await mutate("CREATE_BOM", { code: form.get("code"), name: form.get("name"), catalogItemId: form.get("catalogItemId"), version: Number(form.get("version") || 1), outputQuantity: Number(form.get("outputQuantity") || 1), lines: bomLines.map((line) => ({ catalogItemId: line.catalogItemId, quantity: Number(line.quantity || 0), scrapRate: Number(line.scrapRate || 0), issueMethod: "MANUAL" })) });
  }
  async function createRouting(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    await mutate("CREATE_ROUTING", { code: form.get("code"), name: form.get("name"), catalogItemId: form.get("catalogItemId") || null, version: Number(form.get("version") || 1), operations: routingOperations.map((operation) => ({ code: operation.code, name: operation.name, workCenterId: operation.workCenterId || null, setupMinutes: 0, standardMinutes: operation.standardMinutes ? Number(operation.standardMinutes) : null, requiresQualityCheck: operation.requiresQualityCheck })) });
  }
  async function createWorkCenter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    await mutate("CREATE_WORK_CENTER", { code: form.get("code"), name: form.get("name"), siteId: form.get("siteId") || null, assetId: form.get("assetId") || null, status: "ACTIVE", capacityPerDay: form.get("capacityPerDay") ? Number(form.get("capacityPerDay")) : null, capacityUnit: form.get("capacityUnit") || null, costRate: null, currency: null });
  }
  async function createOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    await mutate("CREATE_ORDER", { title: form.get("title"), bomId: form.get("bomId"), routingId: form.get("routingId") || null, salesOrderId: form.get("salesOrderId") || null, salesOrderItemId: form.get("salesOrderItemId") || null, materialWarehouseId: form.get("materialWarehouseId"), outputWarehouseId: form.get("outputWarehouseId"), priority: form.get("priority") || "NORMAL", plannedQuantity: Number(form.get("plannedQuantity") || 0), idempotencyKey: crypto.randomUUID() });
  }
  async function saveConfiguration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    await mutate("SAVE_CONFIGURATION", { defaultMaterialWarehouseId: form.get("defaultMaterialWarehouseId") || null, defaultOutputWarehouseId: form.get("defaultOutputWarehouseId") || null, qualityRequiredByDefault: form.get("qualityRequiredByDefault") === "on", allowOverproduction: form.get("allowOverproduction") === "on" });
  }
  async function createQuality(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    await mutate("CREATE_QUALITY_CHECK", { productionOrderId: form.get("productionOrderId"), routingOperationId: form.get("routingOperationId") || null, checkType: form.get("checkType"), result: form.get("result"), quantityChecked: Number(form.get("quantityChecked") || 0), quantityAccepted: Number(form.get("quantityAccepted") || 0), quantityRejected: Number(form.get("quantityRejected") || 0), inspectedEmployeeId: form.get("inspectedEmployeeId") || null, notes: form.get("notes") || null });
  }
  async function createScrap(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); const affectsInventory = form.get("affectsInventory") === "on";
    await mutate("CREATE_SCRAP", { productionOrderId: form.get("productionOrderId"), materialRequirementId: form.get("materialRequirementId") || null, catalogItemId: form.get("catalogItemId"), warehouseId: form.get("warehouseId") || null, quantity: Number(form.get("quantity") || 0), reasonCode: form.get("reasonCode"), notes: form.get("notes") || null, affectsInventory, idempotencyKey: crypto.randomUUID() });
  }
  async function createShortagePurchase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    await mutate("CREATE_SHORTAGE_PURCHASE", { productionOrderId: form.get("productionOrderId"), supplierId: form.get("supplierId") || null, currency: form.get("currency") || "USD", prices: [{ requirementId: form.get("requirementId"), unitPrice: Number(form.get("unitPrice") || 0), taxRate: Number(form.get("taxRate") || 0) }] });
  }

  return <ModuleWorkspace>
    <ModuleHeader eyebrow={tx(locale, "Secteur Manufacturing", "Manufacturing sector")} title={locale === "en" ? definition.labelEn : definition.labelFr} description={`${organizationName} · ${locale === "en" ? definition.descriptionEn : definition.descriptionFr}`} count={data.orders.length ? `${data.orders.length} ${tx(locale, "ordre(s)", "order(s)")}` : undefined} />
    <ProfessionalTabs value={initialFocus} onChange={(value) => router.push(`/enterprise-modules/${value}`)} items={MODULES.map((item) => ({ id: item.id, label: locale === "en" ? item.en : item.fr }))} />
    <ModuleMetrics>
      <ModuleMetric label={tx(locale, "Planifié", "Planned")} value={metrics.plannedQuantity.toFixed(3)} />
      <ModuleMetric label={tx(locale, "Produit", "Produced")} value={metrics.producedQuantity.toFixed(3)} />
      <ModuleMetric label={tx(locale, "Avancement", "Completion")} value={`${metrics.completionRate.toFixed(1)} %`} />
      <ModuleMetric label={tx(locale, "Pénuries", "Shortage")} value={metrics.shortageQuantity.toFixed(3)} />
    </ModuleMetrics>
    <ModuleContent>
      {initialFocus === "MANUFACTURING_OVERVIEW" ? <>
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-2xl border border-dtsc-border bg-dtsc-surface p-5"><h2 className="text-lg font-black text-dtsc-ink">{tx(locale, "État des ordres", "Order status")}</h2><div className="mt-4 grid gap-2">{data.overview.ordersByStatus.map((row) => <div key={row.status} className="flex items-center justify-between rounded-xl bg-dtsc-soft px-3 py-2"><StatusBadge tone={statusTone(row.status)}>{statusLabel(locale, row.status)}</StatusBadge><strong>{row._count._all}</strong></div>)}</div></section>
          <section className="rounded-2xl border border-dtsc-border bg-dtsc-surface p-5"><h2 className="text-lg font-black text-dtsc-ink">{tx(locale, "Besoins matières", "Material requirements")}</h2><div className="mt-4 grid gap-2">{data.overview.requirementsByStatus.map((row) => <div key={row.status} className="flex items-center justify-between rounded-xl bg-dtsc-soft px-3 py-2"><StatusBadge tone={statusTone(row.status)}>{statusLabel(locale, row.status)}</StatusBadge><strong>{row._count._all}</strong></div>)}</div></section>
        </div>
        <ModuleSection title={tx(locale, "Ordres récents", "Recent orders")} count={data.overview.recentOrders.length}>{<div className="grid gap-3">{data.overview.recentOrders.map((order) => <div key={order.id} className="rounded-xl border border-dtsc-border p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><div className="font-black text-dtsc-ink">{order.reference} · {order.title}</div><div className="mt-1 text-sm text-dtsc-muted">{numberValue(order.producedQuantity)} / {numberValue(order.plannedQuantity)}</div></div><StatusBadge tone={statusTone(order.status)}>{statusLabel(locale, order.status)}</StatusBadge></div></div>)}</div>}</ModuleSection>
        {data.capabilities.canManage && references ? <ModuleSection title={tx(locale, "Configuration Manufacturing", "Manufacturing configuration")} description={tx(locale, "Les entrepôts restent ceux du module Sites & entrepôts.", "Warehouses remain owned by Sites & warehouses.")}><form className="grid gap-4 md:grid-cols-2" onSubmit={saveConfiguration}><Field label={tx(locale, "Entrepôt matières par défaut", "Default material warehouse")}><NativeSelect name="defaultMaterialWarehouseId" defaultValue={references.configuration?.defaultMaterialWarehouseId || ""} items={warehouseChoices} /></Field><Field label={tx(locale, "Entrepôt produits finis par défaut", "Default output warehouse")}><NativeSelect name="defaultOutputWarehouseId" defaultValue={references.configuration?.defaultOutputWarehouseId || ""} items={warehouseChoices} /></Field><label className="flex items-center gap-2 text-sm font-semibold"><input name="qualityRequiredByDefault" type="checkbox" defaultChecked={references.configuration?.qualityRequiredByDefault !== false} />{tx(locale, "Contrôle qualité requis par défaut", "Quality required by default")}</label><label className="flex items-center gap-2 text-sm font-semibold"><input name="allowOverproduction" type="checkbox" defaultChecked={references.configuration?.allowOverproduction === true} />{tx(locale, "Autoriser la surproduction", "Allow overproduction")}</label><Button disabled={submitting} type="submit">{tx(locale, "Enregistrer", "Save")}</Button></form></ModuleSection> : null}
      </> : null}

      {initialFocus === "BILL_OF_MATERIALS" ? <>
        {data.capabilities.canWrite && references ? <ModuleSection title={tx(locale, "Nouvelle nomenclature", "New bill of materials")} description={tx(locale, "Les produits et composants proviennent du catalogue commun.", "Products and components come from the shared catalog.")}><form onSubmit={createBom} className="grid gap-4"><div className="grid gap-4 md:grid-cols-2"><Field label={tx(locale, "Code", "Code")}><Input name="code" required /></Field><Field label={tx(locale, "Nom", "Name")}><Input name="name" required /></Field><Field label={tx(locale, "Produit fabriqué", "Manufactured product")}><NativeSelect name="catalogItemId" required items={catalogChoices} /></Field><Field label={tx(locale, "Version", "Version")}><Input name="version" type="number" min="1" defaultValue="1" required /></Field><Field label={tx(locale, "Quantité de sortie de référence", "Reference output quantity")}><Input name="outputQuantity" type="number" step="0.001" min="0.001" defaultValue="1" required /></Field></div><div className="grid gap-3"><div className="flex items-center justify-between"><h3 className="font-black">{tx(locale, "Composants", "Components")}</h3><Button type="button" variant="outline" onClick={() => setBomLines((lines) => [...lines, { catalogItemId: "", quantity: "1", scrapRate: "0" }])}><Plus className="mr-2 h-4 w-4" />{tx(locale, "Ajouter", "Add")}</Button></div>{bomLines.map((line, index) => <div key={index} className="grid gap-3 rounded-xl border border-dtsc-border p-3 md:grid-cols-[minmax(0,1fr)_8rem_8rem_auto]"><NativeSelect value={line.catalogItemId} onChange={(value) => setBomLines((lines) => lines.map((entry, i) => i === index ? { ...entry, catalogItemId: value } : entry))} items={catalogChoices} required /><Input type="number" step="0.001" min="0.001" value={line.quantity} onChange={(event) => setBomLines((lines) => lines.map((entry, i) => i === index ? { ...entry, quantity: event.target.value } : entry))} /><Input type="number" step="0.01" min="0" max="100" value={line.scrapRate} onChange={(event) => setBomLines((lines) => lines.map((entry, i) => i === index ? { ...entry, scrapRate: event.target.value } : entry))} /><Button type="button" variant="ghost" disabled={bomLines.length === 1} onClick={() => setBomLines((lines) => lines.filter((_, i) => i !== index))}><Trash2 className="h-4 w-4" /></Button></div>)}</div><Button disabled={submitting} type="submit">{tx(locale, "Créer la nomenclature", "Create BOM")}</Button></form></ModuleSection> : null}
        <ModuleSection title={tx(locale, "Nomenclatures", "Bills of materials")} count={data.boms.length}><div className="grid gap-3">{data.boms.map((bom) => <article key={bom.id} className="rounded-xl border border-dtsc-border p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><div className="font-black">{bom.code} · {bom.name} · v{bom.version}</div><div className="text-sm text-dtsc-muted">{itemLabel(references?.catalogItems || [], bom.catalogItemId)} · {bom.lines.length} {tx(locale, "composant(s)", "component(s)")}</div></div><StatusBadge tone={statusTone(bom.status)}>{statusLabel(locale, bom.status)}</StatusBadge></div>{data.capabilities.canManage && bom.status !== "RETIRED" ? <div className="mt-3 flex gap-2">{bom.status === "DRAFT" ? <Button size="sm" onClick={() => void mutate("CHANGE_BOM_STATUS", { action: "ACTIVATE", revision: bom.revision }, bom.id)}>{tx(locale, "Activer", "Activate")}</Button> : <Button size="sm" variant="outline" onClick={() => void mutate("CHANGE_BOM_STATUS", { action: "RETIRE", revision: bom.revision }, bom.id)}>{tx(locale, "Retirer", "Retire")}</Button>}</div> : null}</article>)}</div></ModuleSection>
      </> : null}

      {initialFocus === "WORK_CENTERS" ? <>
        {data.capabilities.canWrite && references ? <ModuleSection title={tx(locale, "Nouveau centre de travail", "New work center")}><form onSubmit={createWorkCenter} className="grid gap-4 md:grid-cols-2"><Field label={tx(locale, "Code", "Code")}><Input name="code" required /></Field><Field label={tx(locale, "Nom", "Name")}><Input name="name" required /></Field><Field label={tx(locale, "Site", "Site")}><NativeSelect name="siteId" items={(references.warehouses.reduce<Array<{ id: string; label: string }>>((acc, warehouse) => acc.some((item) => item.id === warehouse.site.id) ? acc : [...acc, { id: warehouse.site.id, label: warehouse.site.name }], []))} /></Field><Field label={tx(locale, "Actif / équipement", "Asset / equipment")}><NativeSelect name="assetId" items={assetChoices} /></Field><Field label={tx(locale, "Capacité / jour", "Capacity / day")}><Input name="capacityPerDay" type="number" step="0.001" min="0" /></Field><Field label={tx(locale, "Unité de capacité", "Capacity unit")}><Input name="capacityUnit" /></Field><Button disabled={submitting} type="submit">{tx(locale, "Créer", "Create")}</Button></form></ModuleSection> : null}
        <ModuleSection title={tx(locale, "Centres de travail", "Work centers")} count={data.workCenters.length}><div className="grid gap-3 md:grid-cols-2">{data.workCenters.map((center) => <article key={center.id} className="rounded-xl border border-dtsc-border p-4"><div className="flex items-center justify-between gap-2"><strong>{center.code} · {center.name}</strong><StatusBadge tone={statusTone(center.status)}>{statusLabel(locale, center.status)}</StatusBadge></div><p className="mt-2 text-sm text-dtsc-muted">{center.capacityPerDay ? `${numberValue(center.capacityPerDay)} ${center.capacityUnit || ""}` : tx(locale, "Capacité non définie", "Capacity not defined")}</p></article>)}</div></ModuleSection>
      </> : null}

      {initialFocus === "PRODUCTION_ROUTINGS" ? <>
        {data.capabilities.canWrite && references ? <ModuleSection title={tx(locale, "Nouvelle gamme", "New routing")}><form onSubmit={createRouting} className="grid gap-4"><div className="grid gap-4 md:grid-cols-2"><Field label={tx(locale, "Code", "Code")}><Input name="code" required /></Field><Field label={tx(locale, "Nom", "Name")}><Input name="name" required /></Field><Field label={tx(locale, "Produit associé", "Linked product")}><NativeSelect name="catalogItemId" items={catalogChoices} /></Field><Field label={tx(locale, "Version", "Version")}><Input name="version" type="number" min="1" defaultValue="1" /></Field></div><div className="grid gap-3"><div className="flex items-center justify-between"><h3 className="font-black">{tx(locale, "Opérations", "Operations")}</h3><Button type="button" variant="outline" onClick={() => setRoutingOperations((items) => [...items, { code: `OP${(items.length + 1) * 10}`, name: "", workCenterId: "", standardMinutes: "", requiresQualityCheck: false }])}><Plus className="mr-2 h-4 w-4" />{tx(locale, "Ajouter", "Add")}</Button></div>{routingOperations.map((operation, index) => <div key={index} className="grid gap-3 rounded-xl border border-dtsc-border p-3 lg:grid-cols-[8rem_minmax(0,1fr)_minmax(0,1fr)_8rem_auto]"><Input value={operation.code} onChange={(event) => setRoutingOperations((items) => items.map((entry, i) => i === index ? { ...entry, code: event.target.value } : entry))} /><Input placeholder={tx(locale, "Nom de l’opération", "Operation name")} value={operation.name} onChange={(event) => setRoutingOperations((items) => items.map((entry, i) => i === index ? { ...entry, name: event.target.value } : entry))} /><NativeSelect value={operation.workCenterId} onChange={(value) => setRoutingOperations((items) => items.map((entry, i) => i === index ? { ...entry, workCenterId: value } : entry))} items={workCenterChoices} /><Input type="number" min="1" placeholder={tx(locale, "Minutes", "Minutes")} value={operation.standardMinutes} onChange={(event) => setRoutingOperations((items) => items.map((entry, i) => i === index ? { ...entry, standardMinutes: event.target.value } : entry))} /><label className="flex items-center gap-2 text-xs font-bold"><input type="checkbox" checked={operation.requiresQualityCheck} onChange={(event) => setRoutingOperations((items) => items.map((entry, i) => i === index ? { ...entry, requiresQualityCheck: event.target.checked } : entry))} />QC</label></div>)}</div><Button disabled={submitting} type="submit">{tx(locale, "Créer la gamme", "Create routing")}</Button></form></ModuleSection> : null}
        <ModuleSection title={tx(locale, "Gammes", "Routings")} count={data.routings.length}><div className="grid gap-3">{data.routings.map((routing) => <article key={routing.id} className="rounded-xl border border-dtsc-border p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><strong>{routing.code} · {routing.name} · v{routing.version}</strong><div className="text-sm text-dtsc-muted">{routing.operations.length} {tx(locale, "opération(s)", "operation(s)")}</div></div><StatusBadge tone={statusTone(routing.status)}>{statusLabel(locale, routing.status)}</StatusBadge></div>{data.capabilities.canManage && routing.status !== "RETIRED" ? <div className="mt-3">{routing.status === "DRAFT" ? <Button size="sm" onClick={() => void mutate("CHANGE_ROUTING_STATUS", { action: "ACTIVATE", revision: routing.revision }, routing.id)}>{tx(locale, "Activer", "Activate")}</Button> : <Button size="sm" variant="outline" onClick={() => void mutate("CHANGE_ROUTING_STATUS", { action: "RETIRE", revision: routing.revision }, routing.id)}>{tx(locale, "Retirer", "Retire")}</Button>}</div> : null}</article>)}</div></ModuleSection>
      </> : null}

      {initialFocus === "PRODUCTION_ORDERS" ? <>
        {data.capabilities.canWrite && references ? <ModuleSection title={tx(locale, "Nouvel ordre de production", "New production order")}><form onSubmit={createOrder} className="grid gap-4 md:grid-cols-2"><Field label={tx(locale, "Titre", "Title")}><Input name="title" required /></Field><Field label={tx(locale, "Nomenclature active", "Active BOM")}><NativeSelect name="bomId" required items={references.boms.map((item) => ({ id: item.id, label: `${item.code} · ${item.name} · v${item.version}` }))} /></Field><Field label={tx(locale, "Gamme", "Routing")}><NativeSelect name="routingId" items={references.routings.map((item) => ({ id: item.id, label: `${item.code} · ${item.name} · v${item.version}` }))} /></Field><Field label={tx(locale, "Priorité", "Priority")}><NativeSelect name="priority" defaultValue="NORMAL" items={priorityChoices(locale)} /></Field><Field label={tx(locale, "Quantité planifiée", "Planned quantity")}><Input name="plannedQuantity" type="number" min="0.001" step="0.001" required /></Field><Field label={tx(locale, "Entrepôt matières", "Material warehouse")}><NativeSelect name="materialWarehouseId" defaultValue={references.configuration?.defaultMaterialWarehouseId || ""} required items={warehouseChoices} /></Field><Field label={tx(locale, "Entrepôt produits finis", "Output warehouse")}><NativeSelect name="outputWarehouseId" defaultValue={references.configuration?.defaultOutputWarehouseId || ""} required items={warehouseChoices} /></Field><Field label={tx(locale, "Commande client liée", "Linked sales order")}><NativeSelect name="salesOrderId" value={selectedSalesOrderId} onChange={setSelectedSalesOrderId} items={references.salesOrders.map((item) => ({ id: item.id, label: `${item.reference} · ${item.title}` }))} /></Field><Field label={tx(locale, "Ligne de commande", "Sales order line")}><NativeSelect name="salesOrderItemId" items={(selectedSalesOrder?.items || []).map((item) => ({ id: item.id, label: `${item.description} · ${numberValue(item.quantityOrdered)}` }))} /></Field><Button disabled={submitting} type="submit">{tx(locale, "Créer l’ordre", "Create order")}</Button></form></ModuleSection> : null}
        <ModuleSection title={tx(locale, "Ordres de production", "Production orders")} count={data.orders.length}><div className="grid gap-3">{data.orders.map((order) => <article key={order.id} className="rounded-2xl border border-dtsc-border p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-black text-dtsc-ink">{order.reference} · {order.title}</h3><p className="mt-1 text-sm text-dtsc-muted">{order.bom.code} · {numberValue(order.producedQuantity)} / {numberValue(order.plannedQuantity)} · {warehouseLabel(references?.warehouses || [], order.outputWarehouseId)}</p></div><StatusBadge tone={statusTone(order.status)}>{statusLabel(locale, order.status)}</StatusBadge></div><div className="mt-3 flex flex-wrap gap-2">{order.status === "DRAFT" && data.capabilities.canWrite ? <form className="flex flex-wrap items-end gap-2" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); void orderMutate(order.id, "SUBMIT", { revision: order.revision, approverUserId: form.get("approverUserId") }); }}><EnterpriseApproverSelect organizationId={organizationId} moduleCode="PRODUCTION_ORDERS" locale={locale} /><Button disabled={submitting} type="submit">{tx(locale, "Soumettre", "Submit")}</Button></form> : null}{order.status === "SUBMITTED" && data.capabilities.canApprove ? <><Button disabled={submitting} onClick={() => void orderMutate(order.id, "APPROVE", { revision: order.revision })}>{tx(locale, "Approuver", "Approve")}</Button><Button disabled={submitting} variant="outline" onClick={() => { const comment = window.prompt(tx(locale, "Motif du rejet", "Rejection reason")); if (comment) void orderMutate(order.id, "REJECT", { revision: order.revision, comment }); }}>{tx(locale, "Rejeter", "Reject")}</Button></> : null}{order.status === "RELEASED" && data.capabilities.canWrite ? <><Button disabled={submitting} onClick={() => void orderMutate(order.id, "START", { revision: order.revision })}>{tx(locale, "Démarrer", "Start")}</Button><Button disabled={submitting} variant="outline" onClick={() => { const comment = window.prompt(tx(locale, "Motif de l’annulation", "Cancellation reason")); if (comment) void orderMutate(order.id, "CANCEL", { revision: order.revision, comment }); }}>{tx(locale, "Annuler", "Cancel")}</Button></> : null}{order.status === "IN_PROGRESS" && data.capabilities.canWrite ? <Button disabled={submitting} onClick={() => void orderMutate(order.id, "COMPLETE", { revision: order.revision })}>{tx(locale, "Terminer", "Complete")}</Button> : null}</div></article>)}</div></ModuleSection>
      </> : null}

      {initialFocus === "MATERIAL_REQUIREMENTS" ? <>
        <ModuleSection title={tx(locale, "Besoins et pénuries", "Requirements and shortages")} count={data.orders.reduce((sum, order) => sum + order.requirements.length, 0)}><div className="grid gap-4">{data.orders.filter((order) => order.requirements.length).map((order) => <article key={order.id} className="rounded-xl border border-dtsc-border p-4"><div className="flex flex-wrap justify-between gap-2"><strong>{order.reference} · {order.title}</strong>{data.capabilities.canWrite ? <Button size="sm" variant="outline" onClick={() => void orderMutate(order.id, "REFRESH_REQUIREMENTS")}><RefreshCw className="mr-2 h-4 w-4" />{tx(locale, "Recalculer", "Refresh")}</Button> : null}</div><div className="mt-3 grid gap-2">{order.requirements.map((requirement) => <div key={requirement.id} className="grid gap-2 rounded-lg bg-dtsc-soft p-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]"><span>{itemLabel(references?.catalogItems || [], requirement.catalogItemId)}</span><span>{numberValue(requirement.consumedQuantity)} / {numberValue(requirement.requiredQuantity)}</span><StatusBadge tone={statusTone(requirement.status)}>{statusLabel(locale, requirement.status)}{numberValue(requirement.shortageQuantity) > 0 ? ` · -${numberValue(requirement.shortageQuantity)}` : ""}</StatusBadge></div>)}</div></article>)}</div></ModuleSection>
        {data.capabilities.canWrite && references ? <ModuleSection title={tx(locale, "Créer un achat depuis une pénurie", "Create purchase from shortage")} description={tx(locale, "L’achat créé appartient au module Fournisseurs & achats.", "The generated purchase remains owned by Suppliers & purchases.")}><form onSubmit={createShortagePurchase} className="grid gap-4 md:grid-cols-2"><Field label={tx(locale, "Ordre", "Order")}><NativeSelect name="productionOrderId" value={requirementOrderId} onChange={setRequirementOrderId} items={activeOrders.map((order) => ({ id: order.id, label: `${order.reference} · ${order.title}` }))} required /></Field><Field label={tx(locale, "Besoin en pénurie", "Shortage requirement")}><NativeSelect name="requirementId" required items={(requirementOrder?.requirements || []).filter((item) => numberValue(item.shortageQuantity) > 0 && !item.purchaseId).map((item) => ({ id: item.id, label: `${itemLabel(references.catalogItems, item.catalogItemId)} · ${numberValue(item.shortageQuantity)}` }))} /></Field><Field label={tx(locale, "Fournisseur", "Supplier")}><NativeSelect name="supplierId" items={references.suppliers.map((item) => ({ id: item.id, label: item.displayName || item.legalName }))} /></Field><Field label={tx(locale, "Devise", "Currency")}><Input name="currency" defaultValue="USD" maxLength={3} /></Field><Field label={tx(locale, "Prix unitaire estimé", "Estimated unit price")}><Input name="unitPrice" type="number" min="0" step="0.01" required /></Field><Field label={tx(locale, "Taxe %", "Tax %")}><Input name="taxRate" type="number" min="0" max="100" step="0.01" defaultValue="0" /></Field><Button disabled={submitting} type="submit">{tx(locale, "Créer l’achat", "Create purchase")}</Button></form></ModuleSection> : null}
      </> : null}

      {initialFocus === "PRODUCTION_EXECUTION" ? <>
        {data.capabilities.canWrite && references ? <ModuleSection title={tx(locale, "Exécuter un ordre", "Execute an order")}><div className="grid gap-6"><Field label={tx(locale, "Ordre en cours", "In-progress order")}><NativeSelect value={executionOrderId} onChange={setExecutionOrderId} items={inProgressOrders.map((order) => ({ id: order.id, label: `${order.reference} · ${order.title}` }))} /></Field><form className="grid gap-4 rounded-xl border border-dtsc-border p-4 md:grid-cols-2" onSubmit={(event) => { event.preventDefault(); if (!executionOrder) return; const form = new FormData(event.currentTarget); void orderMutate(executionOrder.id, "CONSUME_MATERIAL", { requirementId: form.get("requirementId"), quantity: Number(form.get("quantity") || 0), employeeId: form.get("employeeId") || null, assetId: form.get("assetId") || null, timesheetEntryId: form.get("timesheetEntryId") || null, idempotencyKey: crypto.randomUUID() }); }}><h3 className="md:col-span-2 font-black"><PackageSearch className="mr-2 inline h-4 w-4" />{tx(locale, "Consommation matière", "Material consumption")}</h3><Field label={tx(locale, "Besoin matière", "Material requirement")}><NativeSelect name="requirementId" required items={(executionOrder?.requirements || []).filter((item) => item.status !== "CONSUMED").map((item) => ({ id: item.id, label: `${itemLabel(references.catalogItems, item.catalogItemId)} · ${numberValue(item.requiredQuantity) - numberValue(item.consumedQuantity)}` }))} /></Field><Field label={tx(locale, "Quantité", "Quantity")}><Input name="quantity" type="number" min="0.001" step="0.001" required /></Field><Field label={tx(locale, "Opérateur", "Operator")}><NativeSelect name="employeeId" items={employeeChoices} /></Field><Field label={tx(locale, "Équipement", "Equipment")}><NativeSelect name="assetId" items={assetChoices} /></Field><Field label={tx(locale, "Temps approuvé", "Approved time")}><NativeSelect name="timesheetEntryId" items={references.approvedTimesheetEntries.map((item) => ({ id: item.id, label: `${item.timesheet.reference} · ${new Date(item.workDate).toLocaleDateString(locale === "en" ? "en-US" : "fr-FR")}` }))} /></Field><Button disabled={submitting || !executionOrder} type="submit">{tx(locale, "Consommer", "Consume")}</Button></form><form className="grid gap-4 rounded-xl border border-dtsc-border p-4 md:grid-cols-2" onSubmit={(event) => { event.preventDefault(); if (!executionOrder) return; const form = new FormData(event.currentTarget); void orderMutate(executionOrder.id, "RECEIVE_OUTPUT", { quantity: Number(form.get("quantity") || 0), employeeId: form.get("employeeId") || null, assetId: form.get("assetId") || null, timesheetEntryId: form.get("timesheetEntryId") || null, idempotencyKey: crypto.randomUUID() }); }}><h3 className="md:col-span-2 font-black"><PlayCircle className="mr-2 inline h-4 w-4" />{tx(locale, "Réception du produit fini", "Receive finished output")}</h3><Field label={tx(locale, "Quantité", "Quantity")}><Input name="quantity" type="number" min="0.001" step="0.001" required /></Field><Field label={tx(locale, "Opérateur", "Operator")}><NativeSelect name="employeeId" items={employeeChoices} /></Field><Field label={tx(locale, "Équipement", "Equipment")}><NativeSelect name="assetId" items={assetChoices} /></Field><Field label={tx(locale, "Temps approuvé", "Approved time")}><NativeSelect name="timesheetEntryId" items={references.approvedTimesheetEntries.map((item) => ({ id: item.id, label: item.timesheet.reference }))} /></Field><Button disabled={submitting || !executionOrder} type="submit">{tx(locale, "Réceptionner", "Receive")}</Button></form></div></ModuleSection> : null}
        <ModuleSection title={tx(locale, "Journal d’exécution", "Execution log")}><div className="grid gap-3">{data.orders.flatMap((order) => order.executions.map((execution) => <div key={execution.id} className="rounded-xl border border-dtsc-border p-3"><strong>{order.reference} · {execution.executionType}</strong><div className="text-sm text-dtsc-muted">{execution.quantityCompleted ? `${numberValue(execution.quantityCompleted)} · ` : ""}{execution.minutesWorked ? `${execution.minutesWorked} min` : ""}</div></div>))}</div></ModuleSection>
      </> : null}

      {initialFocus === "QUALITY_CONTROL" ? <>
        {data.capabilities.canWrite && references ? <ModuleSection title={tx(locale, "Nouveau contrôle qualité", "New quality check")}><form onSubmit={createQuality} className="grid gap-4 md:grid-cols-2"><Field label={tx(locale, "Ordre", "Order")}><NativeSelect name="productionOrderId" value={qualityOrderId} onChange={setQualityOrderId} required items={activeOrders.map((order) => ({ id: order.id, label: `${order.reference} · ${order.title}` }))} /></Field><Field label={tx(locale, "Opération de gamme", "Routing operation")}><NativeSelect name="routingOperationId" items={(data.routings.find((routing) => routing.id === qualityOrder?.routing?.id)?.operations || []).map((operation) => ({ id: operation.id, label: `${operation.code} · ${operation.name}` }))} /></Field><Field label={tx(locale, "Type de contrôle", "Check type")}><Input name="checkType" defaultValue="FINAL" required /></Field><Field label={tx(locale, "Résultat", "Result")}><NativeSelect name="result" required items={[{ id: "PASS", label: statusLabel(locale, "PASS") }, { id: "FAIL", label: statusLabel(locale, "FAIL") }, { id: "HOLD", label: statusLabel(locale, "HOLD") }]} /></Field><Field label={tx(locale, "Quantité contrôlée", "Checked quantity")}><Input name="quantityChecked" type="number" min="0.001" step="0.001" required /></Field><Field label={tx(locale, "Acceptée", "Accepted")}><Input name="quantityAccepted" type="number" min="0" step="0.001" defaultValue="0" /></Field><Field label={tx(locale, "Rejetée", "Rejected")}><Input name="quantityRejected" type="number" min="0" step="0.001" defaultValue="0" /></Field><Field label={tx(locale, "Employé contrôlé", "Inspected employee")}><NativeSelect name="inspectedEmployeeId" items={employeeChoices} /></Field><Field label={tx(locale, "Notes", "Notes")}><Input name="notes" /></Field><Button disabled={submitting} type="submit"><ShieldCheck className="mr-2 h-4 w-4" />{tx(locale, "Enregistrer", "Save")}</Button></form></ModuleSection> : null}
        <ModuleSection title={tx(locale, "Contrôles enregistrés", "Recorded checks")}><div className="grid gap-3">{data.orders.flatMap((order) => order.qualityChecks.map((check) => <div key={check.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-dtsc-border p-3"><div><strong>{order.reference} · {check.checkType}</strong><div className="text-sm text-dtsc-muted">{numberValue(check.quantityAccepted)} / {numberValue(check.quantityChecked)}</div></div><StatusBadge tone={statusTone(check.result)}>{statusLabel(locale, check.result)}</StatusBadge></div>))}</div></ModuleSection>
      </> : null}

      {initialFocus === "SCRAP_WASTE" ? <>
        {data.capabilities.canWrite && references ? <ModuleSection title={tx(locale, "Enregistrer un rebut ou une perte", "Record scrap or waste")}><form onSubmit={createScrap} className="grid gap-4 md:grid-cols-2"><Field label={tx(locale, "Ordre en cours", "In-progress order")}><NativeSelect name="productionOrderId" value={scrapOrderId} onChange={setScrapOrderId} required items={inProgressOrders.map((order) => ({ id: order.id, label: `${order.reference} · ${order.title}` }))} /></Field><Field label={tx(locale, "Besoin matière lié", "Linked material requirement")}><NativeSelect name="materialRequirementId" items={(scrapOrder?.requirements || []).map((item) => ({ id: item.id, label: itemLabel(references.catalogItems, item.catalogItemId) }))} /></Field><Field label={tx(locale, "Article", "Item")}><NativeSelect name="catalogItemId" required items={catalogChoices} /></Field><Field label={tx(locale, "Quantité", "Quantity")}><Input name="quantity" type="number" min="0.001" step="0.001" required /></Field><Field label={tx(locale, "Motif", "Reason")}><Input name="reasonCode" defaultValue="SCRAP" required /></Field><Field label={tx(locale, "Entrepôt si impact stock", "Warehouse if inventory impact")}><NativeSelect name="warehouseId" items={warehouseChoices} /></Field><label className="flex items-center gap-2 text-sm font-semibold"><input name="affectsInventory" type="checkbox" />{tx(locale, "Sortir physiquement du stock", "Physically remove from inventory")}</label><Field label={tx(locale, "Notes", "Notes")}><Input name="notes" /></Field><Button disabled={submitting} type="submit"><Trash2 className="mr-2 h-4 w-4" />{tx(locale, "Enregistrer", "Record")}</Button></form></ModuleSection> : null}
        <ModuleSection title={tx(locale, "Historique des rebuts", "Scrap history")}><div className="grid gap-3">{data.orders.flatMap((order) => order.scraps.map((scrap) => <div key={scrap.id} className="rounded-xl border border-dtsc-border p-3"><strong>{order.reference} · {itemLabel(references?.catalogItems || [], scrap.catalogItemId)}</strong><div className="text-sm text-dtsc-muted">{numberValue(scrap.quantity)} · {scrap.reasonCode} · {scrap.affectsInventory ? tx(locale, "stock impacté", "inventory affected") : tx(locale, "sans mouvement stock", "no inventory movement")}</div></div>))}</div></ModuleSection>
      </> : null}

      {initialFocus === "PRODUCTION_REPORTS" ? <>
        <section className="rounded-2xl border border-dtsc-border bg-dtsc-surface p-5"><div className="flex items-center gap-2"><Factory className="h-5 w-5 text-dtsc-blue" /><h2 className="text-lg font-black">{tx(locale, "Performance de production", "Manufacturing performance")}</h2></div><div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><div><div className="text-xs font-black uppercase text-dtsc-muted">{tx(locale, "Exécutions", "Executions")}</div><div className="mt-1 text-2xl font-black">{metrics.executions}</div></div><div><div className="text-xs font-black uppercase text-dtsc-muted">{tx(locale, "Rebuts", "Scrap")}</div><div className="mt-1 text-2xl font-black">{metrics.scrapEventQuantity.toFixed(3)}</div></div><div><div className="text-xs font-black uppercase text-dtsc-muted">{tx(locale, "Temps main-d’œuvre", "Labor time")}</div><div className="mt-1 text-2xl font-black">{data.report?.labor.minutesWorked || 0} min</div></div><div><div className="text-xs font-black uppercase text-dtsc-muted">{tx(locale, "Taux d’avancement", "Completion rate")}</div><div className="mt-1 text-2xl font-black">{metrics.completionRate.toFixed(1)} %</div></div></div></section>
        <ModuleSection title={tx(locale, "Qualité", "Quality")}><div className="grid gap-3 sm:grid-cols-3">{data.overview.qualityByResult.map((row) => <div key={row.result} className="rounded-xl border border-dtsc-border p-4"><StatusBadge tone={statusTone(row.result)}>{statusLabel(locale, row.result)}</StatusBadge><div className="mt-2 text-2xl font-black">{row._count._all}</div></div>)}</div></ModuleSection>
      </> : null}
    </ModuleContent>
    <ProfessionalHelp moduleCode={initialFocus} />
  </ModuleWorkspace>;
}
