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
  scheduledAt: string | null;
  warehouse: { id: string; code: string; name: string };
  lines: Array<{ id: string; inventoryItemId: string; theoreticalQuantity: string | number; countedQuantity: string | number | null; varianceQuantity: string | number | null }>;
};

const INVENTORY_STATUSES = ["DRAFT", "PENDING_APPROVAL", "APPROVED", "REJECTED", "IN_TRANSIT", "COMPLETED", "CANCELLED", "OPEN", "COUNTING", "CLOSED"];
function statusTone(status: string) {
  if (["APPROVED", "COMPLETED", "CLOSED"].includes(status)) return "success" as const;
  if (["PENDING_APPROVAL", "IN_TRANSIT", "OPEN", "COUNTING"].includes(status)) return "warning" as const;
  if (["REJECTED", "CANCELLED"].includes(status)) return "danger" as const;
  return "neutral" as const;
}

export function EnterpriseInventoryOperationsWorkspace({ organizationId, organizationName, definition }: { organizationId: string; organizationName: string; definition: EnterpriseModuleDefinition }) {
  const locale = useProfessionalErpLocale();
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
  const [detail, setDetail] = useState<InventoryItem | Transfer | Count | null>(null);
  const [message, setMessage] = useState("");

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
  const activeCollection = tab === "STOCK" ? stock : tab === "TRANSFERS" ? transfers : counts;

  async function createTransfer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await professionalMutation(`/api/enterprise/${organizationId}/stock-transfers`, {
        sourceWarehouseId: String(form.get("sourceWarehouseId") || ""),
        destinationWarehouseId: String(form.get("destinationWarehouseId") || ""),
        approverUserId: String(form.get("approverUserId") || ""),
        notes: String(form.get("notes") || "") || null,
        lines: [{ inventoryItemId: String(form.get("inventoryItemId") || ""), sourceLocationId: String(form.get("sourceLocationId") || "") || null, destinationLocationId: String(form.get("destinationLocationId") || "") || null, quantity: Number(form.get("quantity") || 0) }],
      });
      setTransferOpen(false); setTab("TRANSFERS"); setRefreshKey((value) => value + 1); setMessage(t("inventory.transferSubmitted"));
    } catch (error) { setMessage(error instanceof Error ? error.message : t("inventory.transferCreateFailed")); }
  }

  async function createCount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await professionalMutation(`/api/enterprise/${organizationId}/inventory-counts`, {
        warehouseId: String(form.get("warehouseId") || ""), storageLocationId: String(form.get("storageLocationId") || "") || null,
        countType: String(form.get("countType") || "FULL"), approverUserId: String(form.get("approverUserId") || ""), notes: String(form.get("notes") || "") || null,
        lines: [{ inventoryItemId: String(form.get("inventoryItemId") || ""), countedQuantity: Number(form.get("countedQuantity") || 0), notes: String(form.get("lineNotes") || "") || null }],
      });
      setCountOpen(false); setTab("COUNTS"); setRefreshKey((value) => value + 1); setMessage(t("inventory.countCreated"));
    } catch (error) { setMessage(error instanceof Error ? error.message : t("inventory.countCreateFailed")); }
  }

  async function createAdjustment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await professionalMutation(`/api/enterprise/${organizationId}/stock-adjustments`, {
        inventoryItemId: String(form.get("inventoryItemId") || ""), warehouseId: String(form.get("warehouseId") || ""), storageLocationId: String(form.get("storageLocationId") || "") || null,
        adjustmentType: String(form.get("adjustmentType") || "IN"), quantity: Number(form.get("quantity") || 0), reason: String(form.get("reason") || ""), approverUserId: String(form.get("approverUserId") || ""), idempotencyKey: crypto.randomUUID(),
      });
      setAdjustOpen(false); setRefreshKey((value) => value + 1); setMessage(t("inventory.adjustmentPending"));
    } catch (error) { setMessage(error instanceof Error ? error.message : t("inventory.adjustmentCreateFailed")); }
  }

  async function decide(entity: Transfer | Count, decision: "APPROVE" | "REJECT") {
    const endpoint = "sourceWarehouse" in entity ? `stock-transfers/${entity.id}/decision` : `inventory-counts/${entity.id}/decision`;
    try {
      await professionalMutation(`/api/enterprise/${organizationId}/${endpoint}`, { decision, revision: entity.revision });
      setDetail(null); setRefreshKey((value) => value + 1); setMessage(decision === "APPROVE" ? t("inventory.operationApproved") : t("inventory.operationRejected"));
    } catch (error) { setMessage(error instanceof Error ? error.message : t("inventory.decisionFailed")); }
  }

  const transferActions = (item: Transfer): BusinessContextAction[] => [
    { id: "open", label: t("inventory.open"), icon: Eye, onSelect: () => setDetail(item) },
    ...(item.status === "PENDING_APPROVAL" ? [
      { id: "approve", label: t("inventory.approve"), icon: CheckCircle2, onSelect: () => void decide(item, "APPROVE") },
      { id: "reject", label: t("inventory.reject"), icon: XCircle, destructive: true, onSelect: () => void decide(item, "REJECT") },
    ] : []),
  ];
  const countActions = (item: Count): BusinessContextAction[] => [
    { id: "open", label: t("inventory.open"), icon: Eye, onSelect: () => setDetail(item) },
    ...(item.status === "PENDING_APPROVAL" ? [
      { id: "approve", label: t("inventory.approveVariances"), icon: CheckCircle2, onSelect: () => void decide(item, "APPROVE") },
      { id: "reject", label: t("inventory.reject"), icon: XCircle, destructive: true, onSelect: () => void decide(item, "REJECT") },
    ] : []),
  ];
  const inventoryStatusItems = [{ id: "", label: t("inventory.allStatuses") }, ...INVENTORY_STATUSES.map((id) => ({ id, label: professionalErpEnumLabel(locale, "inventoryStatus", id) }))];
  const countTypeItems = ["FULL", "CYCLE", "SPOT"].map((id) => ({ id, label: professionalErpEnumLabel(locale, "countType", id) }));
  const adjustmentItems = ["IN", "OUT"].map((id) => ({ id, label: professionalErpEnumLabel(locale, "adjustmentType", id) }));

  return <ModuleWorkspace>
    <ModuleHeader eyebrow={t("inventory.eyebrow", { organization: organizationName })} title={t("inventory.title")} description={`${locale === "en" ? definition.descriptionEn : definition.descriptionFr} ${t("inventory.descriptionSuffix")}`} count={t("inventory.count", { count: stock.pagination.total, suffix: suffix(stock.pagination.total) })} primaryAction={<div data-responsive-actions><Button variant="outline" onClick={() => setAdjustOpen(true)}><PackageSearch className="h-4 w-4" />{t("inventory.adjustment")}</Button><Button variant="outline" onClick={() => setCountOpen(true)}><ClipboardCheck className="h-4 w-4" />{t("inventory.newCount")}</Button><Button onClick={() => setTransferOpen(true)}><Truck className="h-4 w-4" />{t("inventory.newTransfer")}</Button></div>} />
    <ModuleMetrics label={t("inventory.metrics")}><ModuleMetric label={t("inventory.trackedItems")} value={stock.pagination.total} /><ModuleMetric label={t("inventory.lowStock")} value={stock.metrics.lowStockCount || 0} /><ModuleMetric label={t("inventory.warehouses")} value={stock.metrics.warehouseCount || 0} /><ModuleMetric label={t("inventory.pendingTransfers")} value={transfers.metrics.pending || 0} /><ModuleMetric label={t("inventory.openCounts")} value={counts.metrics.open || counts.metrics.pending || 0} /></ModuleMetrics>
    <ModuleToolbar search={<ProfessionalSearch value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder={t("inventory.search")} />} controls={<><ProfessionalTabs value={tab} onChange={(value) => { setTab(value); setStatus(""); setPage(1); }} items={[{ id: "STOCK", label: t("inventory.tabStock"), count: stock.pagination.total }, { id: "TRANSFERS", label: t("inventory.tabTransfers"), count: transfers.pagination.total }, { id: "COUNTS", label: t("inventory.tabCounts"), count: counts.pagination.total }]} />{tab !== "STOCK" ? <NativeSelect value={status} onChange={setStatus} items={inventoryStatusItems} /> : null}</>} summary={t("inventory.mobileSummary")} />
    <ModuleContent>
      {message ? <div role="status" className="rounded-xl border border-dtsc-border bg-dtsc-page px-4 py-3 text-sm font-semibold">{message}</div> : null}
      <ModuleSection title={tab === "STOCK" ? t("inventory.stockSection") : tab === "TRANSFERS" ? t("inventory.transferSection") : t("inventory.countSection")} description={tab === "STOCK" ? t("inventory.stockDescription") : tab === "TRANSFERS" ? t("inventory.transferDescription") : t("inventory.countDescription")}>
        {activeCollection.error ? <ProfessionalError message={activeCollection.error} /> : activeCollection.loading ? <ProfessionalLoading /> : tab === "STOCK" ? (
          stock.items.length ? <BusinessList ariaLabel={t("inventory.stockAria")}>{stock.items.map((item) => <BusinessListItem key={item.id} title={`${item.catalogItem.code} · ${item.catalogItem.name}`} status={<StatusBadge tone={item.isLowStock ? "danger" : "success"}>{item.isLowStock ? t("inventory.lowStock") : t("inventory.available")}</StatusBadge>} meta={`${t("inventory.availableQuantity", { value: quantity(item.quantityAvailable, item.catalogItem.unitOfMeasure?.symbol) })} · ${t("inventory.reservedQuantity", { value: quantity(item.quantityReserved, item.catalogItem.unitOfMeasure?.symbol) })}`} description={item.balances.map((balance) => `${balance.warehouse.name}${balance.storageLocation ? ` / ${balance.storageLocation.name}` : ""}: ${quantity(balance.quantityOnHand, item.catalogItem.unitOfMeasure?.symbol)}`).join(" · ") || t("inventory.noBalance")} onOpen={() => setDetail(item)} openLabel={t("inventory.openStock", { name: item.catalogItem.name })} />)}</BusinessList> : <EmptyState compact title={t("inventory.noTrackedItem")} description={t("inventory.noTrackedItemDescription")} />
        ) : tab === "TRANSFERS" ? (
          transfers.items.length ? <BusinessList ariaLabel={t("inventory.transfersAria")}>{transfers.items.map((item) => <BusinessListItem key={item.id} title={item.reference} leading={<Truck className="h-5 w-5 text-dtsc-blue" />} status={<StatusBadge tone={statusTone(item.status)}>{professionalErpEnumLabel(locale, "inventoryStatus", item.status)}</StatusBadge>} meta={`${item.sourceWarehouse.name} → ${item.destinationWarehouse.name}`} description={`${t("inventory.lines", { count: item.lines.length, suffix: suffix(item.lines.length) })} · ${t("inventory.requestedOn", { date: professionalErpDate(item.requestedAt, locale) })}`} onOpen={() => setDetail(item)} actions={<ContextActions label={t("inventory.transferActions")} actions={transferActions(item)} />} />)}</BusinessList> : <EmptyState compact title={t("inventory.noTransfer")} description={t("inventory.noTransferDescription")} />
        ) : counts.items.length ? <BusinessList ariaLabel={t("inventory.countsAria")}>{counts.items.map((item) => <BusinessListItem key={item.id} title={item.reference} leading={<ClipboardCheck className="h-5 w-5 text-dtsc-blue" />} status={<StatusBadge tone={statusTone(item.status)}>{professionalErpEnumLabel(locale, "inventoryStatus", item.status)}</StatusBadge>} meta={`${item.warehouse.name} · ${professionalErpEnumLabel(locale, "countType", item.countType)}`} description={t("inventory.countedItems", { count: item.lines.length, suffix: suffix(item.lines.length) })} onOpen={() => setDetail(item)} actions={<ContextActions label={t("inventory.countActions")} actions={countActions(item)} />} />)}</BusinessList> : <EmptyState compact title={t("inventory.noCount")} description={t("inventory.noCountDescription")} />}
      </ModuleSection>
      <ProfessionalHelp moduleCode="INVENTORY_LOGISTICS" />
    </ModuleContent>

    <Dialog open={transferOpen} onClose={() => setTransferOpen(false)} title={t("inventory.newTransferTitle")} description={t("inventory.newTransferDescription")} className="h-[94dvh] max-w-4xl"><form onSubmit={createTransfer} className="grid gap-5"><ProfessionalFormSection title={t("inventory.route")}><Field label={t("inventory.sourceWarehouse")}><NativeSelect name="sourceWarehouseId" required items={[{ id: "", label: t("inventory.select") }, ...lookups.warehouses.map((item) => ({ id: item.id, label: `${item.code} · ${item.name}` }))]} /></Field><Field label={t("inventory.targetWarehouse")}><NativeSelect name="destinationWarehouseId" required items={[{ id: "", label: t("inventory.select") }, ...lookups.warehouses.map((item) => ({ id: item.id, label: `${item.code} · ${item.name}` }))]} /></Field><Field label={t("inventory.approver")}><NativeSelect name="approverUserId" required items={[{ id: "", label: t("inventory.selectOtherPerson") }, ...lookups.members.map((item) => ({ id: item.id, label: memberLabel(item) }))]} /></Field><Field label={t("inventory.reason")}><Input name="notes" /></Field></ProfessionalFormSection><ProfessionalFormSection title={t("inventory.itemAndQuantity")}><Field label={t("inventory.item")}><NativeSelect name="inventoryItemId" required items={[{ id: "", label: t("inventory.select") }, ...lookups.inventoryItems.map((item) => ({ id: item.id, label: `${item.code}${item.sku ? ` / ${item.sku}` : ""} · ${item.name}` }))]} /></Field><Field label={t("inventory.quantity")}><Input name="quantity" type="number" min="0.01" step="0.01" required /></Field><Field label={t("inventory.sourceLocation")}><NativeSelect name="sourceLocationId" items={[{ id: "", label: t("inventory.notSpecified") }, ...lookups.locations.map((item) => ({ id: item.id, label: `${item.code} · ${item.name}` }))]} /></Field><Field label={t("inventory.targetLocation")}><NativeSelect name="destinationLocationId" items={[{ id: "", label: t("inventory.notSpecified") }, ...lookups.locations.map((item) => ({ id: item.id, label: `${item.code} · ${item.name}` }))]} /></Field></ProfessionalFormSection><div className="sticky bottom-0 flex justify-end gap-2 border-t border-dtsc-border bg-dtsc-surface py-3"><Button type="button" variant="outline" onClick={() => setTransferOpen(false)}>{t("inventory.cancel")}</Button><Button type="submit">{t("inventory.submitTransfer")}</Button></div></form></Dialog>

    <Dialog open={countOpen} onClose={() => setCountOpen(false)} title={t("inventory.newCountTitle")} className="h-[94dvh] max-w-4xl"><form onSubmit={createCount} className="grid gap-5"><ProfessionalFormSection title={t("inventory.scopeResponsibility")}><Field label={t("inventory.warehouse")}><NativeSelect name="warehouseId" required items={[{ id: "", label: t("inventory.select") }, ...lookups.warehouses.map((item) => ({ id: item.id, label: `${item.code} · ${item.name}` }))]} /></Field><Field label={t("inventory.countType")}><NativeSelect name="countType" defaultValue="FULL" items={countTypeItems} /></Field><Field label={t("inventory.approver")}><NativeSelect name="approverUserId" required items={[{ id: "", label: t("inventory.select") }, ...lookups.members.map((item) => ({ id: item.id, label: memberLabel(item) }))]} /></Field><Field label={t("inventory.notes")}><Input name="notes" /></Field></ProfessionalFormSection><ProfessionalFormSection title={t("inventory.firstCount")}><Field label={t("inventory.item")}><NativeSelect name="inventoryItemId" required items={[{ id: "", label: t("inventory.select") }, ...lookups.inventoryItems.map((item) => ({ id: item.id, label: `${item.code} · ${item.name}` }))]} /></Field><Field label={t("inventory.countedQuantity")}><Input name="countedQuantity" type="number" min="0" step="0.01" required /></Field><Field label={t("inventory.observation")}><Input name="lineNotes" /></Field></ProfessionalFormSection><div className="sticky bottom-0 flex justify-end gap-2 border-t border-dtsc-border bg-dtsc-surface py-3"><Button type="button" variant="outline" onClick={() => setCountOpen(false)}>{t("inventory.cancel")}</Button><Button type="submit">{t("inventory.createCount")}</Button></div></form></Dialog>

    <Dialog open={adjustOpen} onClose={() => setAdjustOpen(false)} title={t("inventory.controlledAdjustment")} description={t("inventory.controlledAdjustmentDescription")} className="h-[92dvh] max-w-3xl"><form onSubmit={createAdjustment} className="grid gap-5"><ProfessionalFormSection title={t("inventory.adjustment")}><Field label={t("inventory.item")}><NativeSelect name="inventoryItemId" required items={[{ id: "", label: t("inventory.select") }, ...lookups.inventoryItems.map((item) => ({ id: item.id, label: `${item.code} · ${item.name}` }))]} /></Field><Field label={t("inventory.warehouse")}><NativeSelect name="warehouseId" required items={[{ id: "", label: t("inventory.select") }, ...lookups.warehouses.map((item) => ({ id: item.id, label: `${item.code} · ${item.name}` }))]} /></Field><Field label={t("inventory.direction")}><NativeSelect name="adjustmentType" defaultValue="IN" items={adjustmentItems} /></Field><Field label={t("inventory.quantity")}><Input name="quantity" type="number" min="0.01" step="0.01" required /></Field><Field label={t("inventory.reason")}><Input name="reason" minLength={3} required /></Field><Field label={t("inventory.approver")}><NativeSelect name="approverUserId" required items={[{ id: "", label: t("inventory.select") }, ...lookups.members.map((item) => ({ id: item.id, label: memberLabel(item) }))]} /></Field></ProfessionalFormSection><div className="sticky bottom-0 flex justify-end gap-2 border-t border-dtsc-border bg-dtsc-surface py-3"><Button type="button" variant="outline" onClick={() => setAdjustOpen(false)}>{t("inventory.cancel")}</Button><Button type="submit">{t("inventory.submitAdjustment")}</Button></div></form></Dialog>

    <Dialog open={Boolean(detail)} onClose={() => setDetail(null)} title={detail && "reference" in detail ? detail.reference : detail && "catalogItem" in detail ? detail.catalogItem.name : t("inventory.operationalDetail")} className="h-[88dvh] max-w-4xl">{detail && "catalogItem" in detail ? <BusinessList ariaLabel={t("inventory.balancesAria")}>{detail.balances.map((balance) => <BusinessListItem key={balance.id} title={`${balance.warehouse.code} · ${balance.warehouse.name}`} meta={balance.storageLocation ? `${balance.storageLocation.code} · ${balance.storageLocation.name}` : t("inventory.noLocation")} description={balance.stockLot ? `${t("inventory.lot", { number: balance.stockLot.lotNumber })}${balance.stockLot.expiryDate ? ` · ${t("inventory.expiresOn", { date: professionalErpDate(balance.stockLot.expiryDate, locale) })}` : ""}` : t("inventory.noLot")} status={<StatusBadge>{quantity(balance.quantityOnHand)}</StatusBadge>} />)}</BusinessList> : detail && "sourceWarehouse" in detail ? <div className="grid gap-4"><p className="text-sm text-dtsc-muted">{detail.sourceWarehouse.name} → {detail.destinationWarehouse.name}</p><BusinessList ariaLabel={t("inventory.transferLines")}>{detail.lines.map((line) => <BusinessListItem key={line.id} title={lookups.inventoryItems.find((item) => item.id === line.inventoryItemId)?.name || t("inventory.item")} status={<StatusBadge>{quantity(line.quantity)}</StatusBadge>} />)}</BusinessList></div> : detail && "warehouse" in detail ? <BusinessList ariaLabel={t("inventory.inventoryVariances")}>{detail.lines.map((line) => <BusinessListItem key={line.id} title={lookups.inventoryItems.find((item) => item.id === line.inventoryItemId)?.name || t("inventory.item")} meta={`${t("inventory.theoretical", { value: professionalErpNumber(line.theoreticalQuantity, locale) })} · ${t("inventory.counted", { value: line.countedQuantity == null ? "—" : professionalErpNumber(line.countedQuantity, locale) })}`} status={<StatusBadge tone={Number(line.varianceQuantity || 0) === 0 ? "success" : "warning"}>{t("inventory.variance", { value: line.varianceQuantity == null ? "—" : professionalErpNumber(line.varianceQuantity, locale) })}</StatusBadge>} />)}</BusinessList> : null}</Dialog>
  </ModuleWorkspace>;
}
