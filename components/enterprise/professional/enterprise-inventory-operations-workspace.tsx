"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { CheckCircle2, ClipboardCheck, Eye, PackageSearch, Truck, XCircle } from "lucide-react";
import { Field, NativeSelect } from "@/components/enterprise/core-v2/erp-v2-ui";
import {
  professionalErpDate,
  professionalErpEnumLabel,
  professionalErpNumber,
  professionalErpT,
  useProfessionalErpLocale,
} from "@/components/enterprise/professional/professional-erp-i18n";
import {
  ProfessionalError,
  ProfessionalFormSection,
  ProfessionalHelp,
  ProfessionalLoading,
  ProfessionalSearch,
  ProfessionalTabs,
  professionalMutation,
  useProfessionalCollection,
} from "@/components/enterprise/professional/professional-erp-ui";
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

type Member = { id: string; label: string; role: string; positionTitle: string | null };
type Warehouse = { id: string; code: string; name: string; siteId: string };
type Location = { id: string; code: string; name: string; warehouseId: string };
type InventoryChoice = { id: string; code: string; sku: string | null; name: string; minimumQuantity: string | number | null };
type Lookups = { members: Member[]; warehouses: Warehouse[]; locations: Location[]; inventoryItems: InventoryChoice[] };
type InventoryItem = {
  id: string;
  quantityOnHand: number;
  quantityReserved: number;
  quantityAvailable: number;
  isLowStock: boolean;
  minimumQuantity: string | number | null;
  catalogItem: { id: string; code: string; sku: string | null; name: string; unitOfMeasure: { symbol: string } | null; category: { name: string } | null };
  balances: Array<{ id: string; quantityOnHand: string | number; quantityReserved: string | number; warehouse: { id: string; code: string; name: string }; storageLocation: { id: string; code: string; name: string } | null; stockLot: { id: string; lotNumber: string; expiryDate: string | null } | null }>;
};
type Transfer = {
  id: string;
  reference: string;
  status: string;
  revision: number;
  requestedAt: string;
  approvedByUserId: string | null;
  sourceWarehouse: { id: string; code: string; name: string };
  destinationWarehouse: { id: string; code: string; name: string };
  lines: Array<{ id: string; inventoryItemId: string; quantity: string | number; sourceLocationId: string | null; destinationLocationId: string | null }>;
};
type Count = {
  id: string;
  reference: string;
  status: string;
  countType: string;
  revision: number;
  plannedAt: string | null;
  submittedAt: string | null;
  approvedByUserId: string | null;
  warehouseId: string;
  storageLocationId: string | null;
  lines: Array<{ id: string; inventoryItemId: string; expectedQuantity: string | number; countedQuantity: string | number | null; varianceQuantity: string | number | null }>;
};
type Adjustment = {
  id: string;
  reference: string;
  status: string;
  revision: number;
  inventoryItemId: string;
  warehouseId: string;
  storageLocationId: string | null;
  adjustmentType: string;
  quantity: string | number;
  reason: string;
  requestedByUserId: string;
  approvedByUserId: string | null;
  inventoryItem?: { catalogItem?: { code: string; sku: string | null; name: string } };
};
type DecisionTarget = { kind: "TRANSFER" | "COUNT" | "ADJUSTMENT"; entity: Transfer | Count | Adjustment; decision: "APPROVE" | "REJECT" };

const INVENTORY_STATUSES = ["PENDING_APPROVAL", "SUBMITTED", "COMPLETED", "REJECTED", "CANCELLED"];

function statusTone(status: string) {
  if (["APPROVED", "COMPLETED", "CLOSED"].includes(status)) return "success" as const;
  if (["PENDING_APPROVAL", "SUBMITTED", "IN_TRANSIT", "OPEN", "COUNTING"].includes(status)) return "warning" as const;
  if (["REJECTED", "CANCELLED"].includes(status)) return "danger" as const;
  return "neutral" as const;
}

export function EnterpriseInventoryOperationsWorkspace({ organizationId, organizationName, definition }: { organizationId: string; organizationName: string; definition: EnterpriseModuleDefinition }) {
  const locale = useProfessionalErpLocale();
  const isEn = locale === "en";
  const t = (key: Parameters<typeof professionalErpT>[1], values?: Record<string, string | number>) => professionalErpT(locale, key, values);
  const suffix = (count: number) => (count === 1 ? "" : "s");
  const quantity = (value: string | number, symbol?: string | null) => `${professionalErpNumber(value, locale)} ${symbol || ""}`.trim();
  const memberLabel = (item: Member) => `${item.label} · ${item.positionTitle || professionalErpEnumLabel(locale, "role", item.role)}`;
  const [tab, setTab] = useState("STOCK");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [lookups, setLookups] = useState<Lookups>({ members: [], warehouses: [], locations: [], inventoryItems: [] });
  const [transferOpen, setTransferOpen] = useState(false);
  const [countOpen, setCountOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [detail, setDetail] = useState<InventoryItem | Transfer | Count | Adjustment | null>(null);
  const [decisionTarget, setDecisionTarget] = useState<DecisionTarget | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [sourceWarehouseId, setSourceWarehouseId] = useState("");
  const [destinationWarehouseId, setDestinationWarehouseId] = useState("");
  const [countWarehouseId, setCountWarehouseId] = useState("");
  const [adjustWarehouseId, setAdjustWarehouseId] = useState("");
  useToastMessage(message);

  useEffect(() => {
    let active = true;
    void fetch(`/api/enterprise/${organizationId}/operational-lookups?module=INVENTORY_LOGISTICS`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => null) as Lookups & { message?: string } | null;
        if (!response.ok || !body) throw new Error(body?.message || t("inventory.selectorsUnavailable"));
        if (active) setLookups({ members: body.members || [], warehouses: body.warehouses || [], locations: body.locations || [], inventoryItems: body.inventoryItems || [] });
      })
      .catch((error) => { if (active) setMessage(error instanceof Error ? error.message : t("inventory.selectorsUnavailable")); });
    return () => { active = false; };
  }, [organizationId, refreshKey, locale]);

  const params = useMemo(() => {
    const value = new URLSearchParams({ page: String(page), pageSize: "25" });
    if (search.trim() && tab === "STOCK") value.set("search", search.trim());
    if (status && tab !== "STOCK") value.set("status", status);
    return value;
  }, [page, search, status, tab]);
  const stock = useProfessionalCollection<InventoryItem>({ endpoint: `/api/enterprise/${organizationId}/inventory`, params, refreshKey });
  const transfers = useProfessionalCollection<Transfer>({ endpoint: `/api/enterprise/${organizationId}/stock-transfers`, params, refreshKey });
  const counts = useProfessionalCollection<Count>({ endpoint: `/api/enterprise/${organizationId}/inventory-counts`, params, refreshKey });
  const adjustments = useProfessionalCollection<Adjustment>({ endpoint: `/api/enterprise/${organizationId}/stock-adjustments`, params, refreshKey });
  const activeCollection = tab === "STOCK" ? stock : tab === "TRANSFERS" ? transfers : tab === "COUNTS" ? counts : adjustments;

  const sourceLocations = lookups.locations.filter((item) => item.warehouseId === sourceWarehouseId);
  const destinationLocations = lookups.locations.filter((item) => item.warehouseId === destinationWarehouseId);
  const countLocations = lookups.locations.filter((item) => item.warehouseId === countWarehouseId);
  const adjustLocations = lookups.locations.filter((item) => item.warehouseId === adjustWarehouseId);

  function resetTransfer() { setSourceWarehouseId(""); setDestinationWarehouseId(""); }
  function resetCount() { setCountWarehouseId(""); }
  function resetAdjustment() { setAdjustWarehouseId(""); }

  async function createTransfer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSubmitting(true);
    try {
      await professionalMutation(`/api/enterprise/${organizationId}/stock-transfers`, {
        sourceWarehouseId: String(form.get("sourceWarehouseId") || ""),
        destinationWarehouseId: String(form.get("destinationWarehouseId") || ""),
        approverUserId: String(form.get("approverUserId") || ""),
        notes: String(form.get("notes") || "") || null,
        lines: [{
          inventoryItemId: String(form.get("inventoryItemId") || ""),
          sourceLocationId: String(form.get("sourceLocationId") || "") || null,
          destinationLocationId: String(form.get("destinationLocationId") || "") || null,
          quantity: Number(form.get("quantity") || 0),
        }],
      });
      setTransferOpen(false); resetTransfer(); setTab("TRANSFERS"); setRefreshKey((value) => value + 1); setMessage(t("inventory.transferSubmitted"));
    } catch (error) { setMessage(error instanceof Error ? error.message : t("inventory.transferCreateFailed")); }
    finally { setSubmitting(false); }
  }

  async function createCount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSubmitting(true);
    try {
      await professionalMutation(`/api/enterprise/${organizationId}/inventory-counts`, {
        warehouseId: String(form.get("warehouseId") || ""),
        storageLocationId: String(form.get("storageLocationId") || "") || null,
        countType: String(form.get("countType") || "FULL"),
        approverUserId: String(form.get("approverUserId") || ""),
        notes: String(form.get("notes") || "") || null,
        lines: [{ inventoryItemId: String(form.get("inventoryItemId") || ""), countedQuantity: Number(form.get("countedQuantity") || 0), notes: String(form.get("lineNotes") || "") || null }],
      });
      setCountOpen(false); resetCount(); setTab("COUNTS"); setRefreshKey((value) => value + 1); setMessage(t("inventory.countCreated"));
    } catch (error) { setMessage(error instanceof Error ? error.message : t("inventory.countCreateFailed")); }
    finally { setSubmitting(false); }
  }

  async function createAdjustment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSubmitting(true);
    try {
      await professionalMutation(`/api/enterprise/${organizationId}/stock-adjustments`, {
        inventoryItemId: String(form.get("inventoryItemId") || ""),
        warehouseId: String(form.get("warehouseId") || ""),
        storageLocationId: String(form.get("storageLocationId") || "") || null,
        adjustmentType: String(form.get("adjustmentType") || "IN"),
        quantity: Number(form.get("quantity") || 0),
        reason: String(form.get("reason") || ""),
        approverUserId: String(form.get("approverUserId") || ""),
        idempotencyKey: crypto.randomUUID(),
      });
      setAdjustOpen(false); resetAdjustment(); setTab("ADJUSTMENTS"); setRefreshKey((value) => value + 1); setMessage(t("inventory.adjustmentPending"));
    } catch (error) { setMessage(error instanceof Error ? error.message : t("inventory.adjustmentCreateFailed")); }
    finally { setSubmitting(false); }
  }

  async function decide(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!decisionTarget) return;
    const form = new FormData(event.currentTarget);
    const comment = String(form.get("comment") || "").trim();
    if (decisionTarget.decision === "REJECT" && !comment) {
      setMessage(isEn ? "A rejection reason is required." : "Un motif est obligatoire pour rejeter l’opération.");
      return;
    }
    const entity = decisionTarget.entity;
    const endpoint = decisionTarget.kind === "TRANSFER"
      ? `stock-transfers/${entity.id}/decision`
      : decisionTarget.kind === "COUNT"
        ? `inventory-counts/${entity.id}/decision`
        : `stock-adjustments/${entity.id}/decision`;
    setSubmitting(true);
    try {
      await professionalMutation(`/api/enterprise/${organizationId}/${endpoint}`, { decision: decisionTarget.decision, revision: entity.revision, comment: comment || null });
      setDecisionTarget(null); setDetail(null); setRefreshKey((value) => value + 1);
      setMessage(decisionTarget.decision === "APPROVE" ? t("inventory.operationApproved") : t("inventory.operationRejected"));
    } catch (error) { setMessage(error instanceof Error ? error.message : t("inventory.decisionFailed")); }
    finally { setSubmitting(false); }
  }

  function review(kind: DecisionTarget["kind"], entity: DecisionTarget["entity"], decision: DecisionTarget["decision"]) {
    setDecisionTarget({ kind, entity, decision });
  }

  const transferActions = (item: Transfer): BusinessContextAction[] => [
    { id: "open", label: t("inventory.open"), icon: Eye, onSelect: () => setDetail(item) },
    ...(item.status === "PENDING_APPROVAL" ? [
      { id: "approve", label: t("inventory.approve"), icon: CheckCircle2, onSelect: () => review("TRANSFER", item, "APPROVE") },
      { id: "reject", label: t("inventory.reject"), icon: XCircle, destructive: true, onSelect: () => review("TRANSFER", item, "REJECT") },
    ] : []),
  ];
  const countActions = (item: Count): BusinessContextAction[] => [
    { id: "open", label: t("inventory.open"), icon: Eye, onSelect: () => setDetail(item) },
    ...(item.status === "SUBMITTED" ? [
      { id: "approve", label: t("inventory.approveVariances"), icon: CheckCircle2, onSelect: () => review("COUNT", item, "APPROVE") },
      { id: "reject", label: t("inventory.reject"), icon: XCircle, destructive: true, onSelect: () => review("COUNT", item, "REJECT") },
    ] : []),
  ];
  const adjustmentActions = (item: Adjustment): BusinessContextAction[] => [
    { id: "open", label: t("inventory.open"), icon: Eye, onSelect: () => setDetail(item) },
    ...(item.status === "PENDING_APPROVAL" ? [
      { id: "approve", label: t("inventory.approve"), icon: CheckCircle2, onSelect: () => review("ADJUSTMENT", item, "APPROVE") },
      { id: "reject", label: t("inventory.reject"), icon: XCircle, destructive: true, onSelect: () => review("ADJUSTMENT", item, "REJECT") },
    ] : []),
  ];

  const inventoryStatusItems = [{ id: "", label: t("inventory.allStatuses") }, ...INVENTORY_STATUSES.map((id) => ({ id, label: professionalErpEnumLabel(locale, "inventoryStatus", id) }))];
  const countTypeItems = ["FULL", "CYCLE", "SPOT"].map((id) => ({ id, label: professionalErpEnumLabel(locale, "countType", id) }));
  const adjustmentItems = ["IN", "OUT"].map((id) => ({ id, label: professionalErpEnumLabel(locale, "adjustmentType", id) }));
  const warehouseItems = [{ id: "", label: t("inventory.select") }, ...lookups.warehouses.map((item) => ({ id: item.id, label: `${item.code} · ${item.name}` }))];
  const inventoryItemChoices = [{ id: "", label: t("inventory.select") }, ...lookups.inventoryItems.map((item) => ({ id: item.id, label: `${item.code}${item.sku ? ` / ${item.sku}` : ""} · ${item.name}` }))];
  const approverItems = [{ id: "", label: t("inventory.selectOtherPerson") }, ...lookups.members.map((item) => ({ id: item.id, label: memberLabel(item) }))];

  return <ModuleWorkspace>
    <ModuleHeader
      eyebrow={t("inventory.eyebrow", { organization: organizationName })}
      title={t("inventory.title")}
      description={`${locale === "en" ? definition.descriptionEn : definition.descriptionFr} ${t("inventory.descriptionSuffix")}`}
      count={t("inventory.count", { count: stock.pagination.total, suffix: suffix(stock.pagination.total) })}
      primaryAction={<div data-responsive-actions><Button variant="outline" onClick={() => setAdjustOpen(true)}><PackageSearch className="h-4 w-4" />{t("inventory.adjustment")}</Button><Button variant="outline" onClick={() => setCountOpen(true)}><ClipboardCheck className="h-4 w-4" />{t("inventory.newCount")}</Button><Button onClick={() => setTransferOpen(true)}><Truck className="h-4 w-4" />{t("inventory.newTransfer")}</Button></div>}
    />
    <ModuleMetrics label={t("inventory.metrics")}><ModuleMetric label={t("inventory.trackedItems")} value={stock.pagination.total} /><ModuleMetric label={t("inventory.lowStock")} value={stock.metrics.lowStockCount || 0} /><ModuleMetric label={t("inventory.warehouses")} value={stock.metrics.warehouseCount || 0} /><ModuleMetric label={t("inventory.pendingTransfers")} value={transfers.metrics.pending || 0} /><ModuleMetric label={isEn ? "Pending adjustments" : "Ajustements en attente"} value={adjustments.metrics.pending || 0} /></ModuleMetrics>
    <ModuleToolbar
      search={<ProfessionalSearch value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder={t("inventory.search")} />}
      controls={<><ProfessionalTabs value={tab} onChange={(value) => { setTab(value); setStatus(""); setPage(1); }} items={[{ id: "STOCK", label: t("inventory.tabStock"), count: stock.pagination.total }, { id: "TRANSFERS", label: t("inventory.tabTransfers"), count: transfers.pagination.total }, { id: "COUNTS", label: t("inventory.tabCounts"), count: counts.pagination.total }, { id: "ADJUSTMENTS", label: isEn ? "Adjustments" : "Ajustements", count: adjustments.pagination.total }]} />{tab !== "STOCK" ? <NativeSelect value={status} onChange={setStatus} items={inventoryStatusItems} /> : null}</>}
      summary={t("inventory.mobileSummary")}
    />
    <ModuleContent>
      <ModuleSection title={tab === "STOCK" ? t("inventory.stockSection") : tab === "TRANSFERS" ? t("inventory.transferSection") : tab === "COUNTS" ? t("inventory.countSection") : (isEn ? "Controlled stock adjustments" : "Ajustements de stock contrôlés")} description={tab === "STOCK" ? t("inventory.stockDescription") : tab === "TRANSFERS" ? t("inventory.transferDescription") : tab === "COUNTS" ? t("inventory.countDescription") : (isEn ? "Every adjustment is independently reviewed before the stock journal is changed." : "Chaque ajustement est revu indépendamment avant de modifier le journal de stock.")}>
        {activeCollection.error ? <ProfessionalError message={activeCollection.error} /> : activeCollection.loading ? <ProfessionalLoading /> : tab === "STOCK" ? (
          stock.items.length ? <BusinessList ariaLabel={t("inventory.stockAria")}>{stock.items.map((item) => <BusinessListItem key={item.id} title={`${item.catalogItem.code} · ${item.catalogItem.name}`} status={<StatusBadge tone={item.isLowStock ? "danger" : "success"}>{item.isLowStock ? t("inventory.lowStock") : t("inventory.available")}</StatusBadge>} meta={`${t("inventory.availableQuantity", { value: quantity(item.quantityAvailable, item.catalogItem.unitOfMeasure?.symbol) })} · ${t("inventory.reservedQuantity", { value: quantity(item.quantityReserved, item.catalogItem.unitOfMeasure?.symbol) })}`} description={item.balances.map((balance) => `${balance.warehouse.name}${balance.storageLocation ? ` / ${balance.storageLocation.name}` : ""}: ${quantity(balance.quantityOnHand, item.catalogItem.unitOfMeasure?.symbol)}`).join(" · ") || t("inventory.noBalance")} onOpen={() => setDetail(item)} openLabel={t("inventory.openStock", { name: item.catalogItem.name })} />)}</BusinessList> : <EmptyState compact title={t("inventory.noTrackedItem")} description={t("inventory.noTrackedItemDescription")} />
        ) : tab === "TRANSFERS" ? (
          transfers.items.length ? <BusinessList ariaLabel={t("inventory.transfersAria")}>{transfers.items.map((item) => <BusinessListItem key={item.id} title={item.reference} leading={<Truck className="h-5 w-5 text-dtsc-blue" />} status={<StatusBadge tone={statusTone(item.status)}>{professionalErpEnumLabel(locale, "inventoryStatus", item.status)}</StatusBadge>} meta={`${item.sourceWarehouse.name} → ${item.destinationWarehouse.name}`} description={`${t("inventory.lines", { count: item.lines.length, suffix: suffix(item.lines.length) })} · ${t("inventory.requestedOn", { date: professionalErpDate(item.requestedAt, locale) })}`} onOpen={() => setDetail(item)} actions={<ContextActions label={t("inventory.transferActions")} actions={transferActions(item)} />} />)}</BusinessList> : <EmptyState compact title={t("inventory.noTransfer")} description={t("inventory.noTransferDescription")} />
        ) : tab === "COUNTS" ? (
          counts.items.length ? <BusinessList ariaLabel={t("inventory.countsAria")}>{counts.items.map((item) => <BusinessListItem key={item.id} title={item.reference} leading={<ClipboardCheck className="h-5 w-5 text-dtsc-blue" />} status={<StatusBadge tone={statusTone(item.status)}>{professionalErpEnumLabel(locale, "inventoryStatus", item.status)}</StatusBadge>} meta={`${lookups.warehouses.find((warehouse) => warehouse.id === item.warehouseId)?.name || t("inventory.warehouse")} · ${professionalErpEnumLabel(locale, "countType", item.countType)}`} description={t("inventory.countedItems", { count: item.lines.length, suffix: suffix(item.lines.length) })} onOpen={() => setDetail(item)} actions={<ContextActions label={t("inventory.countActions")} actions={countActions(item)} />} />)}</BusinessList> : <EmptyState compact title={t("inventory.noCount")} description={t("inventory.noCountDescription")} />
        ) : adjustments.items.length ? <BusinessList ariaLabel={isEn ? "Stock adjustments" : "Ajustements de stock"}>{adjustments.items.map((item) => <BusinessListItem key={item.id} title={item.reference} leading={<PackageSearch className="h-5 w-5 text-dtsc-blue" />} status={<StatusBadge tone={statusTone(item.status)}>{professionalErpEnumLabel(locale, "inventoryStatus", item.status)}</StatusBadge>} meta={`${item.inventoryItem?.catalogItem?.code || "—"} · ${item.inventoryItem?.catalogItem?.name || t("inventory.item")}`} description={`${professionalErpEnumLabel(locale, "adjustmentType", item.adjustmentType)} · ${quantity(item.quantity)} · ${item.reason}`} onOpen={() => setDetail(item)} actions={<ContextActions label={isEn ? "Adjustment actions" : "Actions ajustement"} actions={adjustmentActions(item)} />} />)}</BusinessList> : <EmptyState compact title={isEn ? "No adjustment" : "Aucun ajustement"} description={isEn ? "Controlled stock adjustments will appear here." : "Les ajustements de stock contrôlés apparaîtront ici."} />}
      </ModuleSection>
      {activeCollection.pagination.pageCount > 1 ? <div className="flex items-center justify-between gap-2 text-sm text-dtsc-muted"><span>{isEn ? `Page ${page} of ${activeCollection.pagination.pageCount}` : `Page ${page} sur ${activeCollection.pagination.pageCount}`}</span><div className="flex gap-2"><Button variant="outline" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>{isEn ? "Previous" : "Précédent"}</Button><Button variant="outline" disabled={page >= activeCollection.pagination.pageCount} onClick={() => setPage((value) => value + 1)}>{isEn ? "Next" : "Suivant"}</Button></div></div> : null}
      <ProfessionalHelp moduleCode="INVENTORY_LOGISTICS" />
    </ModuleContent>

    <Dialog presentation="editor" open={transferOpen} onClose={() => { setTransferOpen(false); resetTransfer(); }} title={t("inventory.newTransferTitle")} description={t("inventory.newTransferDescription")} className="max-w-4xl"><form onSubmit={createTransfer} className="grid gap-5"><ProfessionalFormSection title={t("inventory.route")}><Field label={t("inventory.sourceWarehouse")}><NativeSelect name="sourceWarehouseId" required value={sourceWarehouseId} onChange={setSourceWarehouseId} items={warehouseItems} /></Field><Field label={t("inventory.targetWarehouse")}><NativeSelect name="destinationWarehouseId" required value={destinationWarehouseId} onChange={setDestinationWarehouseId} items={warehouseItems.filter((item) => !item.id || item.id !== sourceWarehouseId)} /></Field><Field label={t("inventory.approver")}><NativeSelect name="approverUserId" required items={approverItems} /></Field><Field label={t("inventory.reason")}><Input name="notes" /></Field></ProfessionalFormSection><ProfessionalFormSection title={t("inventory.itemAndQuantity")}><Field label={t("inventory.item")}><NativeSelect name="inventoryItemId" required items={inventoryItemChoices} /></Field><Field label={t("inventory.quantity")}><Input name="quantity" type="number" min="0.001" step="0.001" required /></Field><Field label={t("inventory.sourceLocation")}><NativeSelect name="sourceLocationId" disabled={!sourceWarehouseId} items={[{ id: "", label: t("inventory.notSpecified") }, ...sourceLocations.map((item) => ({ id: item.id, label: `${item.code} · ${item.name}` }))]} /></Field><Field label={t("inventory.targetLocation")}><NativeSelect name="destinationLocationId" disabled={!destinationWarehouseId} items={[{ id: "", label: t("inventory.notSpecified") }, ...destinationLocations.map((item) => ({ id: item.id, label: `${item.code} · ${item.name}` }))]} /></Field></ProfessionalFormSection><div className="sticky bottom-0 flex justify-end gap-2 border-t border-dtsc-border bg-dtsc-surface py-3"><Button type="button" variant="outline" onClick={() => { setTransferOpen(false); resetTransfer(); }}>{t("inventory.cancel")}</Button><Button type="submit" disabled={submitting || !sourceWarehouseId || !destinationWarehouseId}>{submitting ? (isEn ? "Submitting…" : "Envoi…") : t("inventory.submitTransfer")}</Button></div></form></Dialog>

    <Dialog presentation="editor" open={countOpen} onClose={() => { setCountOpen(false); resetCount(); }} title={t("inventory.newCountTitle")} className="max-w-4xl"><form onSubmit={createCount} className="grid gap-5"><ProfessionalFormSection title={t("inventory.scopeResponsibility")}><Field label={t("inventory.warehouse")}><NativeSelect name="warehouseId" required value={countWarehouseId} onChange={setCountWarehouseId} items={warehouseItems} /></Field><Field label={t("inventory.sourceLocation")}><NativeSelect name="storageLocationId" disabled={!countWarehouseId} items={[{ id: "", label: t("inventory.notSpecified") }, ...countLocations.map((item) => ({ id: item.id, label: `${item.code} · ${item.name}` }))]} /></Field><Field label={t("inventory.countType")}><NativeSelect name="countType" defaultValue="FULL" items={countTypeItems} /></Field><Field label={t("inventory.approver")}><NativeSelect name="approverUserId" required items={approverItems} /></Field><Field label={t("inventory.notes")}><Input name="notes" /></Field></ProfessionalFormSection><ProfessionalFormSection title={t("inventory.firstCount")}><Field label={t("inventory.item")}><NativeSelect name="inventoryItemId" required items={inventoryItemChoices} /></Field><Field label={t("inventory.countedQuantity")}><Input name="countedQuantity" type="number" min="0" step="0.001" required /></Field><Field label={t("inventory.observation")}><Input name="lineNotes" /></Field></ProfessionalFormSection><div className="sticky bottom-0 flex justify-end gap-2 border-t border-dtsc-border bg-dtsc-surface py-3"><Button type="button" variant="outline" onClick={() => { setCountOpen(false); resetCount(); }}>{t("inventory.cancel")}</Button><Button type="submit" disabled={submitting || !countWarehouseId}>{submitting ? (isEn ? "Submitting…" : "Envoi…") : t("inventory.createCount")}</Button></div></form></Dialog>

    <Dialog presentation="editor" open={adjustOpen} onClose={() => { setAdjustOpen(false); resetAdjustment(); }} title={t("inventory.controlledAdjustment")} description={t("inventory.controlledAdjustmentDescription")} className="max-w-3xl"><form onSubmit={createAdjustment} className="grid gap-5"><ProfessionalFormSection title={t("inventory.adjustment")}><Field label={t("inventory.item")}><NativeSelect name="inventoryItemId" required items={inventoryItemChoices} /></Field><Field label={t("inventory.warehouse")}><NativeSelect name="warehouseId" required value={adjustWarehouseId} onChange={setAdjustWarehouseId} items={warehouseItems} /></Field><Field label={t("inventory.sourceLocation")}><NativeSelect name="storageLocationId" disabled={!adjustWarehouseId} items={[{ id: "", label: t("inventory.notSpecified") }, ...adjustLocations.map((item) => ({ id: item.id, label: `${item.code} · ${item.name}` }))]} /></Field><Field label={t("inventory.direction")}><NativeSelect name="adjustmentType" defaultValue="IN" items={adjustmentItems} /></Field><Field label={t("inventory.quantity")}><Input name="quantity" type="number" min="0.001" step="0.001" required /></Field><Field label={t("inventory.reason")}><Input name="reason" minLength={3} required /></Field><Field label={t("inventory.approver")}><NativeSelect name="approverUserId" required items={approverItems} /></Field></ProfessionalFormSection><div className="sticky bottom-0 flex justify-end gap-2 border-t border-dtsc-border bg-dtsc-surface py-3"><Button type="button" variant="outline" onClick={() => { setAdjustOpen(false); resetAdjustment(); }}>{t("inventory.cancel")}</Button><Button type="submit" disabled={submitting || !adjustWarehouseId}>{submitting ? (isEn ? "Submitting…" : "Envoi…") : t("inventory.submitAdjustment")}</Button></div></form></Dialog>

    <Dialog presentation="editor" open={Boolean(detail)} onClose={() => setDetail(null)} title={detail && "reference" in detail ? detail.reference : detail && "catalogItem" in detail ? detail.catalogItem.name : t("inventory.operationalDetail")} className="max-w-4xl">{detail && "catalogItem" in detail ? <BusinessList ariaLabel={t("inventory.balancesAria")}>{detail.balances.map((balance) => <BusinessListItem key={balance.id} title={`${balance.warehouse.code} · ${balance.warehouse.name}`} meta={balance.storageLocation ? `${balance.storageLocation.code} · ${balance.storageLocation.name}` : t("inventory.noLocation")} description={balance.stockLot ? `${t("inventory.lot", { number: balance.stockLot.lotNumber })}${balance.stockLot.expiryDate ? ` · ${t("inventory.expiresOn", { date: professionalErpDate(balance.stockLot.expiryDate, locale) })}` : ""}` : t("inventory.noLot")} status={<StatusBadge>{quantity(balance.quantityOnHand)}</StatusBadge>} />)}</BusinessList> : detail && "sourceWarehouse" in detail ? <div className="grid gap-4"><p className="text-sm text-dtsc-muted">{detail.sourceWarehouse.name} → {detail.destinationWarehouse.name}</p><BusinessList ariaLabel={t("inventory.transferLines")}>{detail.lines.map((line) => <BusinessListItem key={line.id} title={lookups.inventoryItems.find((item) => item.id === line.inventoryItemId)?.name || t("inventory.item")} status={<StatusBadge>{quantity(line.quantity)}</StatusBadge>} />)}</BusinessList></div> : detail && "countType" in detail ? <BusinessList ariaLabel={t("inventory.inventoryVariances")}>{detail.lines.map((line) => <BusinessListItem key={line.id} title={lookups.inventoryItems.find((item) => item.id === line.inventoryItemId)?.name || t("inventory.item")} meta={`${t("inventory.theoretical", { value: professionalErpNumber(line.expectedQuantity, locale) })} · ${t("inventory.counted", { value: line.countedQuantity == null ? "—" : professionalErpNumber(line.countedQuantity, locale) })}`} status={<StatusBadge tone={Number(line.varianceQuantity || 0) === 0 ? "success" : "warning"}>{t("inventory.variance", { value: line.varianceQuantity == null ? "—" : professionalErpNumber(line.varianceQuantity, locale) })}</StatusBadge>} />)}</BusinessList> : detail && "adjustmentType" in detail ? <div className="grid gap-3 text-sm"><p><strong>{isEn ? "Item" : "Article"}:</strong> {detail.inventoryItem?.catalogItem?.name || lookups.inventoryItems.find((item) => item.id === detail.inventoryItemId)?.name || "—"}</p><p><strong>{t("inventory.direction")}:</strong> {professionalErpEnumLabel(locale, "adjustmentType", detail.adjustmentType)}</p><p><strong>{t("inventory.quantity")}:</strong> {quantity(detail.quantity)}</p><p><strong>{t("inventory.reason")}:</strong> {detail.reason}</p><StatusBadge tone={statusTone(detail.status)}>{professionalErpEnumLabel(locale, "inventoryStatus", detail.status)}</StatusBadge></div> : null}</Dialog>

    <Dialog open={Boolean(decisionTarget)} onClose={() => !submitting && setDecisionTarget(null)} title={decisionTarget?.decision === "APPROVE" ? (isEn ? "Review and approve" : "Revoir et approuver") : (isEn ? "Review and reject" : "Revoir et rejeter")} description={isEn ? "Check the operation before recording your independent decision." : "Vérifiez l’opération avant d’enregistrer votre décision indépendante."}>
      {decisionTarget ? <form onSubmit={decide} className="grid gap-4"><div className="rounded-xl border border-dtsc-border bg-dtsc-page p-4 text-sm"><strong>{"reference" in decisionTarget.entity ? decisionTarget.entity.reference : "—"}</strong><p className="mt-1 text-dtsc-muted">{decisionTarget.kind === "TRANSFER" ? (isEn ? "Stock transfer" : "Transfert de stock") : decisionTarget.kind === "COUNT" ? (isEn ? "Inventory count" : "Inventaire") : (isEn ? "Stock adjustment" : "Ajustement de stock")}</p></div><Field label={decisionTarget.decision === "REJECT" ? (isEn ? "Rejection reason" : "Motif du rejet") : (isEn ? "Decision comment" : "Commentaire de décision")}><textarea name="comment" required={decisionTarget.decision === "REJECT"} className="min-h-28 rounded-xl border border-dtsc-border bg-dtsc-surface p-3 text-base" /></Field><div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={submitting} onClick={() => setDecisionTarget(null)}>{t("inventory.cancel")}</Button><Button type="submit" variant={decisionTarget.decision === "REJECT" ? "destructive" : "default"} disabled={submitting}>{submitting ? (isEn ? "Saving…" : "Enregistrement…") : decisionTarget.decision === "APPROVE" ? t("inventory.approve") : t("inventory.reject")}</Button></div></form> : null}
    </Dialog>
  </ModuleWorkspace>;
}
