"use client";

import { CheckCircle2, Eye, FilePlus2, PackageCheck, Pencil, Plus, Send, ShoppingCart, XCircle } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { BusinessList, BusinessListItem } from "@/components/workspace/business-list";
import { ContextActions, type BusinessContextAction } from "@/components/workspace/context-actions";
import { EmptyState } from "@/components/workspace/empty-state";
import { ModuleMetric, ModuleMetrics } from "@/components/workspace/module-metrics";
import { ModuleSection } from "@/components/workspace/module-workspace";
import { StatusBadge } from "@/components/workspace/status-badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToastMessage } from "@/components/ui/use-toast-message";
import {
  Field,
  NativeSelect,
  currencyChoices,
  formatEnterpriseAmount,
  formatEnterpriseDate,
  priorityChoices,
  statusLabel,
  statusTone,
  type EnterpriseChoice,
} from "@/components/enterprise/core-v2/erp-v2-ui";
import { enterpriseV2Mutation, useEnterpriseV2Collection } from "@/components/enterprise/core-v2/use-enterprise-v2-collection";
import { EnterpriseApproverSelect } from "@/components/enterprise/enterprise-approver-select";
import type { ProcurementUiCapabilities } from "@/components/enterprise/professional/enterprise-procurement-operations-workspace";
import { enterpriseCoreT, type EnterpriseCoreKey } from "@/lib/enterprise-core-i18n";
import { purchaseFormGuidance, type PurchaseFormGuidanceKey } from "@/lib/enterprise/purchase-form-i18n";

type PurchaseListItem = { id: string; reference: string; title: string; description: string | null; status: string; priority: string; supplierId: string | null; requestedByUserId: string; buyerUserId: string | null; createdByUserId: string; departmentId: string | null; requestId: string | null; budgetLineId: string | null; currency: string; totalAmount: string | number; expectedAt: string | null; revision: number; createdAt: string; supplier: { id: string; legalName: string; displayName: string | null; status: string } | null; budgetLine: { id: string; name: string; budget: { id: string; reference: string; title: string; currency: string; status: string } } | null; _count: { items: number; receipts: number } };
type PurchaseDetail = PurchaseListItem & { items: Array<{ id: string; description: string; quantity: string | number; unit: string; unitPrice: string | number; taxRate: string | number; lineTotal: string | number }>; receipts: Array<{ id: string; reference: string; receivedAt: string; items: Array<{ purchaseItemId: string; quantityReceived: string | number }> }>; supplier: PurchaseListItem["supplier"] };
type PurchaseOperationalLink = { id: string; siteId: string | null; destinationWarehouseId: string | null; expectedReceiptType: string } | null;
type PurchaseItemCatalogLink = { purchaseItemId: string; catalogItemId: string | null; unitOfMeasureId: string | null; expectedItemType: string };
type DetailPayload = { purchase: PurchaseDetail; approvals: Array<{ id: string; status: string; approverUserId: string; decisionComment: string | null }>; events: Array<{ id: string; summary: string; createdAt: string }>; comments: Array<{ id: string; content: string; createdAt: string }>; operationalLink: PurchaseOperationalLink; itemCatalogLinks: PurchaseItemCatalogLink[] };
type SupplierChoice = EnterpriseChoice & { status?: string };
type LegacyRecord = { id: string; title: string; description: string | null; status: string; updatedAt: string };
type CatalogChoice = { id: string; code: string; sku: string | null; name: string; itemType: string; currency: string | null; indicativeCost: string | number | null };
type SiteChoice = { id: string; code: string; name: string };
type WarehouseChoice = { id: string; siteId: string; code: string; name: string };
type LocationChoice = { id: string; warehouseId: string; code: string; name: string };
type DraftItem = { catalogItemId: string; description: string; quantity: string; unit: string; unitPrice: string; taxRate: string };
type PendingPurchaseAction = { item: PurchaseListItem; action: "ORDER" | "CLOSE" | "CANCEL"; label: string };

const purchaseStatuses = ["DRAFT", "PENDING_APPROVAL", "APPROVED", "ORDERED", "PARTIALLY_RECEIVED", "RECEIVED", "CLOSED", "REJECTED", "CANCELLED"];
const emptyDraftItem = (): DraftItem => ({ catalogItemId: "", description: "", quantity: "1", unit: "unit", unitPrice: "0", taxRate: "0" });

export function EnterprisePurchasesWorkspace({ organizationId, members, departments, capabilities, locale, legacyRecords = [] }: { organizationId: string; members: EnterpriseChoice[]; departments: EnterpriseChoice[]; capabilities: ProcurementUiCapabilities; locale?: string | null; legacyRecords?: LegacyRecord[] }) {
  const t = (key: EnterpriseCoreKey, vars?: Record<string, string | number>) => enterpriseCoreT(locale, key, vars);
  const guide = (key: PurchaseFormGuidanceKey) => purchaseFormGuidance(locale, key);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<DetailPayload | null>(null);
  const [approvalTarget, setApprovalTarget] = useState<PurchaseListItem | null>(null);
  const [detail, setDetail] = useState<DetailPayload | null>(null);
  const [receiveTarget, setReceiveTarget] = useState<DetailPayload | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingPurchaseAction | null>(null);
  const [actionReason, setActionReason] = useState("");
  const [actionSubmitting, setActionSubmitting] = useState(false);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [receiveSubmitting, setReceiveSubmitting] = useState(false);
  const [suppliers, setSuppliers] = useState<SupplierChoice[]>([]);
  const [requests, setRequests] = useState<EnterpriseChoice[]>([]);
  const [budgetLines, setBudgetLines] = useState<EnterpriseChoice[]>([]);
  const [catalogItems, setCatalogItems] = useState<CatalogChoice[]>([]);
  const [sites, setSites] = useState<SiteChoice[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseChoice[]>([]);
  const [locations, setLocations] = useState<LocationChoice[]>([]);
  const [purchaseSiteId, setPurchaseSiteId] = useState("");
  const [purchaseWarehouseId, setPurchaseWarehouseId] = useState("");
  const [receiveWarehouseId, setReceiveWarehouseId] = useState("");
  const [receiveLocationId, setReceiveLocationId] = useState("");
  const [draftItems, setDraftItems] = useState<DraftItem[]>([emptyDraftItem()]);
  const [message, setMessage] = useState("");
  useToastMessage(message);

  useEffect(() => {
    void Promise.all([
      fetch(`/api/enterprise/${organizationId}/suppliers?page=1&pageSize=100&status=ACTIVE`, { cache: "no-store" }).then((response) => response.ok ? response.json() : ({ items: [] })) as Promise<{ items?: Array<{ id: string; legalName: string; displayName: string | null }> }>,
      fetch(`/api/enterprise/${organizationId}/requests?page=1&pageSize=100&type=PURCHASE_REQUEST&status=APPROVED`, { cache: "no-store" }).then((response) => response.ok ? response.json() : ({ items: [] })) as Promise<{ items?: Array<{ id: string; title: string; status: string }> }>,
      fetch(`/api/enterprise/${organizationId}/budget-lines?page=1&pageSize=100&status=ACTIVE`, { cache: "no-store" }).then((response) => response.ok ? response.json() : ({ items: [] })) as Promise<{ items?: Array<{ id: string; name: string; budget: { reference: string; currency: string } }> }>,
      fetch(`/api/enterprise/${organizationId}/operational-lookups?module=SUPPLIERS_PURCHASES`, { cache: "no-store" }).then((response) => response.ok ? response.json() : ({ catalogItems: [], sites: [], warehouses: [], locations: [] })) as Promise<{ catalogItems?: CatalogChoice[]; sites?: SiteChoice[]; warehouses?: WarehouseChoice[]; locations?: LocationChoice[] }>,
    ]).then(([supplierBody, requestBody, budgetBody, lookupBody]) => {
      setSuppliers((supplierBody.items || []).map((item) => ({ id: item.id, label: item.displayName || item.legalName })));
      setRequests((requestBody.items || []).map((item) => ({ id: item.id, label: `${item.title} · ${statusLabel(locale, item.status)}` })));
      setBudgetLines((budgetBody.items || []).map((item) => ({ id: item.id, label: `${item.budget.reference} · ${item.name} · ${item.budget.currency}` })));
      setCatalogItems(lookupBody.catalogItems || []);
      setSites(lookupBody.sites || []);
      setWarehouses(lookupBody.warehouses || []);
      setLocations(lookupBody.locations || []);
    }).catch((error) => {
      setSuppliers([]); setRequests([]); setBudgetLines([]); setCatalogItems([]); setSites([]); setWarehouses([]); setLocations([]);
      setMessage(error instanceof Error ? error.message : "LOOKUPS_FAILED");
    });
  }, [organizationId, refreshKey, locale]);

  const params = useMemo(() => { const value = new URLSearchParams({ page: String(page), pageSize: "20" }); if (search.trim()) value.set("search", search.trim()); if (status) value.set("status", status); if (supplierFilter) value.set("supplier", supplierFilter); return value; }, [page, search, status, supplierFilter]);
  const collection = useEnterpriseV2Collection<PurchaseListItem>({ endpoint: `/api/enterprise/${organizationId}/purchases`, params, refreshKey });
  const metrics = collection.meta.metrics || {};
  const catalogChoices = useMemo(() => catalogItems.map((item) => ({ id: item.id, label: `${item.code}${item.sku ? ` / ${item.sku}` : ""} · ${item.name}` })), [catalogItems]);
  const siteChoices = useMemo(() => sites.map((item) => ({ id: item.id, label: `${item.code} · ${item.name}` })), [sites]);
  const purchaseWarehouseChoices = useMemo(() => warehouses.filter((item) => !purchaseSiteId || item.siteId === purchaseSiteId).map((item) => ({ id: item.id, label: `${item.code} · ${item.name}` })), [purchaseSiteId, warehouses]);
  const receiveWarehouseChoices = useMemo(() => warehouses.filter((item) => !receiveTarget?.operationalLink?.siteId || item.siteId === receiveTarget.operationalLink.siteId).map((item) => ({ id: item.id, label: `${item.code} · ${item.name}` })), [receiveTarget, warehouses]);
  const receiveLocationChoices = useMemo(() => locations.filter((item) => item.warehouseId === receiveWarehouseId).map((item) => ({ id: item.id, label: `${item.code} · ${item.name}` })), [locations, receiveWarehouseId]);

  function resetPurchaseForm() {
    setDraftItems([emptyDraftItem()]);
    setPurchaseSiteId("");
    setPurchaseWarehouseId("");
  }

  function startCreate() {
    setEditTarget(null);
    resetPurchaseForm();
    setCreateOpen(true);
  }

  function closePurchaseForm() {
    if (formSubmitting) return;
    setCreateOpen(false);
    setEditTarget(null);
    resetPurchaseForm();
  }

  async function loadDetail(item: PurchaseListItem) {
    const response = await fetch(`/api/enterprise/${organizationId}/purchases/${item.id}`, { cache: "no-store" });
    const body = await response.json() as DetailPayload & { message?: string };
    if (!response.ok) throw new Error(body.message || "LOAD_FAILED");
    return body;
  }

  async function openDetail(item: PurchaseListItem) {
    try { setDetail(await loadDetail(item)); }
    catch (error) { setMessage(error instanceof Error ? error.message : "LOAD_FAILED"); }
  }

  async function openEdit(item: PurchaseListItem) {
    try {
      const body = await loadDetail(item);
      const linkByItem = new Map(body.itemCatalogLinks.map((link) => [link.purchaseItemId, link]));
      setDraftItems(body.purchase.items.map((purchaseItem) => ({ catalogItemId: linkByItem.get(purchaseItem.id)?.catalogItemId || "", description: purchaseItem.description, quantity: String(purchaseItem.quantity), unit: purchaseItem.unit, unitPrice: String(purchaseItem.unitPrice), taxRate: String(purchaseItem.taxRate) })));
      setPurchaseSiteId(body.operationalLink?.siteId || "");
      setPurchaseWarehouseId(body.operationalLink?.destinationWarehouseId || "");
      setEditTarget(body);
      setCreateOpen(false);
    } catch (error) { setMessage(error instanceof Error ? error.message : "LOAD_FAILED"); }
  }

  async function submitPurchase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (formSubmitting) return;
    const form = Object.fromEntries(new FormData(event.currentTarget).entries());
    const items = draftItems.map((item) => ({ ...item, quantity: Number(item.quantity), unitPrice: Number(item.unitPrice), taxRate: Number(item.taxRate) }));
    setFormSubmitting(true);
    try {
      if (editTarget) await enterpriseV2Mutation(`/api/enterprise/${organizationId}/purchases/${editTarget.purchase.id}`, "PATCH", { ...form, revision: editTarget.purchase.revision, siteId: purchaseSiteId, destinationWarehouseId: purchaseWarehouseId, items });
      else await enterpriseV2Mutation(`/api/enterprise/${organizationId}/purchases`, "POST", { ...form, siteId: purchaseSiteId, destinationWarehouseId: purchaseWarehouseId, items });
      setCreateOpen(false); setEditTarget(null); resetPurchaseForm(); setRefreshKey((value) => value + 1); setMessage(editTarget ? t("purchases.updated") : t("purchases.draftCreated"));
    } catch (error) { setMessage(error instanceof Error ? error.message : "ACTION_FAILED"); }
    finally { setFormSubmitting(false); }
  }

  async function runAction(item: PurchaseListItem, action: string, approverUserId?: string, comment?: string) {
    await enterpriseV2Mutation(`/api/enterprise/${organizationId}/purchases/${item.id}/actions`, "POST", { action, revision: item.revision, approverUserId: approverUserId || "", comment: comment || "" });
    setApprovalTarget(null); setDetail(null); setRefreshKey((value) => value + 1); setMessage(t("purchases.updated"));
  }

  async function confirmPendingAction() {
    if (!pendingAction || actionSubmitting) return;
    const requiresReason = pendingAction.action === "CANCEL";
    if (requiresReason && actionReason.trim().length < 3) { setMessage(guide("actionReasonHelp")); return; }
    setActionSubmitting(true);
    try {
      await runAction(pendingAction.item, pendingAction.action, undefined, actionReason.trim());
      setPendingAction(null); setActionReason("");
    } catch (error) { setMessage(error instanceof Error ? error.message : "ACTION_FAILED"); }
    finally { setActionSubmitting(false); }
  }

  async function startReceive(item: PurchaseListItem) {
    try {
      const body = await loadDetail(item);
      setReceiveTarget(body);
      setReceiveWarehouseId(body.operationalLink?.destinationWarehouseId || "");
      setReceiveLocationId("");
    } catch (error) { setMessage(error instanceof Error ? error.message : "LOAD_FAILED"); }
  }

  function totalPreviouslyReceived(payload: DetailPayload, purchaseItemId: string) {
    return payload.purchase.receipts.reduce((sum, receipt) => sum + receipt.items.filter((item) => item.purchaseItemId === purchaseItemId).reduce((lineSum, item) => lineSum + Number(item.quantityReceived || 0), 0), 0);
  }

  async function receive(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!receiveTarget || receiveSubmitting) return;
    const form = new FormData(event.currentTarget);
    const items = receiveTarget.purchase.items.map((item) => ({ purchaseItemId: item.id, quantityReceived: Number(form.get(`quantity_${item.id}`) || 0) })).filter((item) => item.quantityReceived > 0);
    if (!items.length) { setMessage(guide("receiptQuantity")); return; }
    setReceiveSubmitting(true);
    try {
      await enterpriseV2Mutation(`/api/enterprise/${organizationId}/purchases/${receiveTarget.purchase.id}/receive`, "POST", { revision: receiveTarget.purchase.revision, receivedAt: new Date().toISOString(), warehouseId: receiveWarehouseId, storageLocationId: receiveLocationId, notes: String(form.get("notes") || ""), items });
      setReceiveTarget(null); setReceiveWarehouseId(""); setReceiveLocationId(""); setRefreshKey((value) => value + 1); setMessage(t("purchases.receiptSaved"));
    } catch (error) { setMessage(error instanceof Error ? error.message : "ACTION_FAILED"); }
    finally { setReceiveSubmitting(false); }
  }

  const actionsFor = (item: PurchaseListItem): BusinessContextAction[] => {
    const currentUserId = collection.meta.currentUserId;
    const related = Boolean(currentUserId && [item.requestedByUserId, item.buyerUserId, item.createdByUserId].includes(currentUserId));
    const buyer = Boolean(currentUserId && item.buyerUserId === currentUserId);
    const requesterOrCreator = Boolean(currentUserId && (item.requestedByUserId === currentUserId || item.createdByUserId === currentUserId));
    const canAct = capabilities.canWrite && (capabilities.canManage || related);
    const canBuyerAct = capabilities.canWrite && (capabilities.canManage || buyer);
    const canCancel = capabilities.canWrite && (capabilities.canManage || requesterOrCreator);
    return [
      { id: "open", label: t("purchases.action.open"), icon: Eye, onSelect: () => void openDetail(item) },
      ...(item.status === "DRAFT" && canAct ? [{ id: "edit", label: t("common.edit"), icon: Pencil, onSelect: () => void openEdit(item) }, { id: "submit", label: t("purchases.action.submit"), icon: Send, onSelect: () => setApprovalTarget(item) }] : []),
      ...(item.status === "APPROVED" && canBuyerAct ? [{ id: "order", label: t("purchases.action.order"), icon: ShoppingCart, onSelect: () => setPendingAction({ item, action: "ORDER", label: t("purchases.action.order") }) }] : []),
      ...(["ORDERED", "PARTIALLY_RECEIVED", "RECEIVED", "CLOSED"].includes(item.status) ? [{ id: "payable", label: t("documents.type.SUPPLIER_INVOICE"), icon: FilePlus2, onSelect: () => { window.location.href = `/enterprise-modules/FINANCE_PAYABLES?purchaseId=${encodeURIComponent(item.id)}`; } }] : []),
      ...(["ORDERED", "PARTIALLY_RECEIVED"].includes(item.status) && canBuyerAct ? [{ id: "receive", label: t("purchases.action.receive"), icon: PackageCheck, onSelect: () => void startReceive(item) }] : []),
      ...(item.status === "RECEIVED" && canBuyerAct ? [{ id: "close", label: t("purchases.action.close"), icon: CheckCircle2, onSelect: () => setPendingAction({ item, action: "CLOSE", label: t("purchases.action.close") }) }] : []),
      ...(["DRAFT", "APPROVED"].includes(item.status) && canCancel ? [{ id: "cancel", label: t("purchases.action.cancel"), icon: XCircle, destructive: true, separatorBefore: true, onSelect: () => setPendingAction({ item, action: "CANCEL", label: t("purchases.action.cancel") }) }] : []),
    ];
  };

  const formTarget = editTarget?.purchase || null;
  const receiveRequiresWarehouse = Boolean(receiveTarget?.itemCatalogLinks.some((link) => link.expectedItemType === "GOODS"));
  const actionRequiresReason = pendingAction?.action === "CANCEL";

  return <div className="grid min-w-0 gap-5">
    <ModuleMetrics label={t("purchases.indicators")}><ModuleMetric label={t("purchases.metric.drafts")} value={metrics.drafts || 0} /><ModuleMetric label={t("purchases.metric.pending")} value={metrics.pending || 0} /><ModuleMetric label={t("purchases.metric.ordered")} value={metrics.ordered || 0} /><ModuleMetric label={t("purchases.metric.receiving")} value={metrics.receiving || 0} /><ModuleMetric label={t("purchases.metric.received")} value={metrics.received || 0} /></ModuleMetrics>
    <ModuleSection title={t("purchases.section.title")} description={t("purchases.section.description")} count={`${collection.pagination.total}`} action={capabilities.canWrite ? <Button onClick={startCreate} className="bg-dtsc-blue text-white"><Plus className="h-4 w-4" />{t("purchases.new")}</Button> : undefined}>
      <div className="grid gap-2 border-y border-dtsc-border py-3 md:grid-cols-3"><Input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder={t("purchases.search")} /><NativeSelect value={status} onChange={setStatus} items={purchaseStatuses.map((id) => ({ id, label: statusLabel(locale, id) }))} /><NativeSelect value={supplierFilter} onChange={setSupplierFilter} items={suppliers} /></div>
      {collection.loading ? <p className="py-8 text-center text-sm text-dtsc-muted">{t("common.loading")}</p> : collection.items.length ? <BusinessList ariaLabel={t("purchases.aria")}>{collection.items.map((item) => <BusinessListItem key={item.id} title={`${item.reference} · ${item.title}`} status={<StatusBadge tone={statusTone(item.status)}>{statusLabel(locale, item.status)}</StatusBadge>} meta={`${item.supplier?.displayName || item.supplier?.legalName || t("purchases.supplierPending")} · ${formatEnterpriseAmount(item.totalAmount, item.currency, locale)}`} description={`${t("purchases.itemsCount", { count: item._count.items })}${item.budgetLine ? ` · ${item.budgetLine.budget.reference} / ${item.budgetLine.name}` : ` · ${t("purchases.unbudgeted")}`}${item.expectedAt ? ` · ${t("purchases.expected", { date: formatEnterpriseDate(item.expectedAt, locale) })}` : ""}`} onOpen={() => void openDetail(item)} openLabel={t("purchases.openNamed", { reference: item.reference })} actions={<ContextActions label={t("purchases.actions")} actions={actionsFor(item)} />} />)}</BusinessList> : <EmptyState compact title={t("purchases.noPurchases")} description={collection.error || t("purchases.noMatch")} />}
      <div className="mt-3 flex justify-between border-t border-dtsc-border pt-3 text-sm text-dtsc-muted"><span>{t("common.page", { current: collection.pagination.page, total: collection.pagination.pageCount })}</span><div className="flex gap-2"><Button variant="outline" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>{t("common.previous")}</Button><Button variant="outline" disabled={page >= collection.pagination.pageCount} onClick={() => setPage((value) => value + 1)}>{t("common.next")}</Button></div></div>
    </ModuleSection>
    {legacyRecords.length ? <ModuleSection title={t("purchases.historical.title")} description={t("purchases.historical.description")}><BusinessList ariaLabel={t("purchases.historical.aria")}>{legacyRecords.map((item) => <BusinessListItem key={item.id} title={item.title} status={<StatusBadge>{t("purchases.historyBadge")}</StatusBadge>} description={item.description || statusLabel(locale, item.status)} />)}</BusinessList></ModuleSection> : null}

    <Dialog open={createOpen || Boolean(editTarget)} onClose={closePurchaseForm} title={formTarget ? `${t("common.edit")} · ${formTarget.reference}` : t("purchases.form.title")} presentation="editor" className="max-w-5xl">
      <form key={formTarget?.id || "new"} onSubmit={submitPurchase} className="grid min-w-0 max-w-full grid-cols-[minmax(0,1fr)] gap-5" data-dtsc-guided-form="purchase">
        <Field label={t("purchases.form.subject")} help={guide("subject")} required><Input name="title" defaultValue={formTarget?.title || ""} required /></Field>
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2">
          <Field label={t("purchases.form.sourceRequest")} help={guide("sourceRequest")}><NativeSelect name={formTarget ? undefined : "requestId"} disabled={Boolean(formTarget)} defaultValue={formTarget?.requestId || ""} items={requests} /></Field>
          <Field label={t("purchases.form.supplier")} help={guide("supplier")} required><NativeSelect name="supplierId" defaultValue={formTarget?.supplierId || ""} items={suppliers} required /></Field>
          <Field label={t("purchases.form.budgetLine")} help={guide("budgetLine")}><NativeSelect name="budgetLineId" defaultValue={formTarget?.budgetLineId || ""} items={budgetLines} /></Field>
          <Field label={t("purchases.form.buyer")} help={guide("buyer")}><NativeSelect name="buyerUserId" defaultValue={formTarget?.buyerUserId || ""} items={members} /></Field>
          <Field label={t("purchases.form.department")} help={guide("department")}><NativeSelect name="departmentId" defaultValue={formTarget?.departmentId || ""} items={departments} /></Field>
          <Field label={t("purchases.form.priority")} help={guide("priority")}><NativeSelect name="priority" defaultValue={formTarget?.priority || "NORMAL"} items={priorityChoices(locale)} /></Field>
          <Field label={t("purchases.form.currency")} help={guide("currency")} required><NativeSelect name="currency" defaultValue={formTarget?.currency || "USD"} items={currencyChoices(locale)} required /></Field>
          <Field label={t("purchases.form.expectedDelivery")} help={guide("expectedDelivery")}><Input name="expectedAt" type="date" defaultValue={formTarget?.expectedAt ? new Date(formTarget.expectedAt).toISOString().slice(0, 10) : ""} /></Field>
          <Field label={guide("site")} help={guide("siteHelp")}><NativeSelect name="siteId" value={purchaseSiteId} onChange={(value) => { setPurchaseSiteId(value); const current = warehouses.find((warehouse) => warehouse.id === purchaseWarehouseId); if (current && value && current.siteId !== value) setPurchaseWarehouseId(""); }} items={siteChoices} /></Field>
          <Field label={guide("warehouse")} help={guide("warehouseHelp")}><NativeSelect name="destinationWarehouseId" value={purchaseWarehouseId} onChange={setPurchaseWarehouseId} items={purchaseWarehouseChoices} /></Field>
        </div>
        <Field label={t("purchases.form.description")} help={guide("description")}><textarea name="description" defaultValue={formTarget?.description || ""} className="min-h-24 max-w-full rounded-xl border border-dtsc-border bg-dtsc-surface p-3 text-base text-dtsc-ink md:text-sm" /></Field>
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 border-y border-dtsc-border py-4">
          <div className="flex min-w-0 flex-wrap items-start justify-between gap-3"><div className="min-w-0"><strong className="block break-words text-dtsc-ink">{t("purchases.form.items")}</strong><p className="mt-1 max-w-3xl break-words text-sm leading-6 text-dtsc-muted">{guide("items")}</p></div><Button type="button" variant="outline" onClick={() => setDraftItems((items) => [...items, emptyDraftItem()])}><Plus className="h-4 w-4" />{t("purchases.form.line")}</Button></div>
          {draftItems.map((item, index) => <div key={index} className="grid min-w-0 max-w-full grid-cols-[minmax(0,1fr)] gap-3 rounded-2xl border border-dtsc-border bg-dtsc-page p-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1.5fr)_minmax(0,.7fr)_minmax(0,1fr)_minmax(0,.8fr)]">
            <Field label={guide("catalogItem")} help={guide("catalogItemHelp")} required><NativeSelect value={item.catalogItemId} onChange={(value) => { const catalog = catalogItems.find((entry) => entry.id === value); setDraftItems((items) => items.map((entry, itemIndex) => itemIndex === index ? { ...entry, catalogItemId: value, description: catalog?.name || entry.description, unitPrice: catalog?.indicativeCost != null ? String(catalog.indicativeCost) : entry.unitPrice } : entry)); }} items={catalogChoices} required /></Field>
            <Field label={guide("lineDescription")} help={guide("lineDescriptionHelp")} required><Input value={item.description} onChange={(event) => setDraftItems((items) => items.map((entry, itemIndex) => itemIndex === index ? { ...entry, description: event.target.value } : entry))} required /></Field>
            <Field label={guide("quantity")} help={guide("quantityHelp")} required><Input value={item.quantity} onChange={(event) => setDraftItems((items) => items.map((entry, itemIndex) => itemIndex === index ? { ...entry, quantity: event.target.value } : entry))} type="number" min="0.001" step="0.001" required /></Field>
            <Field label={guide("unitPrice")} help={guide("unitPriceHelp")} required><Input value={item.unitPrice} onChange={(event) => setDraftItems((items) => items.map((entry, itemIndex) => itemIndex === index ? { ...entry, unitPrice: event.target.value } : entry))} type="number" min="0" step="0.01" required /></Field>
            <Field label={guide("taxRate")} help={guide("taxRateHelp")}><Input value={item.taxRate} onChange={(event) => setDraftItems((items) => items.map((entry, itemIndex) => itemIndex === index ? { ...entry, taxRate: event.target.value } : entry))} type="number" min="0" max="100" step="0.01" /></Field>
          </div>)}
        </div>
        <Button disabled={formSubmitting} className="bg-dtsc-blue text-white"><ShoppingCart className="h-4 w-4" />{formSubmitting ? t("common.loading") : formTarget ? t("common.save") : t("purchases.form.createDraft")}</Button>
      </form>
    </Dialog>

    <Dialog open={Boolean(approvalTarget)} onClose={() => setApprovalTarget(null)} title={t("purchases.approval.title")} description={approvalTarget?.title} presentation="editor"><form onSubmit={(event) => { event.preventDefault(); if (!approvalTarget) return; const approver = String(new FormData(event.currentTarget).get("approverUserId") || ""); void runAction(approvalTarget, "SUBMIT", approver).catch((error) => setMessage(error instanceof Error ? error.message : "ACTION_FAILED")); }} className="grid gap-4"><Field label={t("purchases.approval.designated")} help={guide("approver")} required><EnterpriseApproverSelect organizationId={organizationId} moduleCode="SUPPLIERS_PURCHASES" locale={locale} /></Field><Button className="bg-dtsc-blue text-white">{t("purchases.approval.submit")}</Button></form></Dialog>

    <Dialog open={Boolean(receiveTarget)} onClose={() => { if (!receiveSubmitting) { setReceiveTarget(null); setReceiveWarehouseId(""); setReceiveLocationId(""); } }} title={t("purchases.receive.title")} description={receiveTarget?.purchase.reference} presentation="editor" className="max-w-4xl"><form onSubmit={receive} className="grid gap-4">{receiveRequiresWarehouse ? <div className="grid gap-3 md:grid-cols-2"><Field label={guide("receiptWarehouse")} help={guide("receiptWarehouseHelp")} required><NativeSelect name="warehouseId" value={receiveWarehouseId} onChange={(value) => { setReceiveWarehouseId(value); setReceiveLocationId(""); }} items={receiveWarehouseChoices} required /></Field><Field label={guide("receiptLocation")} help={guide("receiptLocationHelp")}><NativeSelect name="storageLocationId" value={receiveLocationId} onChange={setReceiveLocationId} items={receiveLocationChoices} /></Field></div> : null}{receiveTarget?.purchase.items.map((item) => { const received = receiveTarget ? totalPreviouslyReceived(receiveTarget, item.id) : 0; const remaining = Math.max(0, Number(item.quantity) - received); return remaining > 0 ? <Field key={item.id} label={t("purchases.receive.ordered", { description: item.description, quantity: remaining, unit: item.unit })} help={guide("receiptQuantity")}><Input name={`quantity_${item.id}`} type="number" min="0" max={String(remaining)} step="0.001" defaultValue="0" inputMode="decimal" /></Field> : null; })}<Field label={t("purchases.receive.notes")} help={guide("receiptNotes")}><textarea name="notes" className="min-h-24 rounded-xl border border-dtsc-border bg-dtsc-surface p-3 text-base text-dtsc-ink md:text-sm" /></Field><Button disabled={receiveSubmitting} className="bg-dtsc-blue text-white"><PackageCheck className="h-4 w-4" />{receiveSubmitting ? t("common.loading") : t("purchases.receive.save")}</Button></form></Dialog>

    <Dialog open={Boolean(pendingAction)} onClose={() => { if (!actionSubmitting) { setPendingAction(null); setActionReason(""); } }} title={pendingAction?.label || ""} description={guide("actionReview")} presentation={actionRequiresReason ? "editor" : "default"}>{pendingAction ? <div className="grid gap-4"><div className="rounded-xl border border-dtsc-border bg-dtsc-page p-3 text-sm"><strong className="text-dtsc-ink">{pendingAction.item.reference} · {pendingAction.item.title}</strong><p className="mt-1 text-dtsc-muted">{formatEnterpriseAmount(pendingAction.item.totalAmount, pendingAction.item.currency, locale)}</p></div>{actionRequiresReason ? <Field label={guide("actionReason")} help={guide("actionReasonHelp")} required><textarea value={actionReason} onChange={(event) => setActionReason(event.target.value)} minLength={3} required className="min-h-28 rounded-xl border border-dtsc-border bg-dtsc-surface p-3 text-base text-dtsc-ink md:text-sm" /></Field> : null}<Button disabled={actionSubmitting} onClick={() => void confirmPendingAction()} className="bg-dtsc-blue text-white">{actionSubmitting ? t("common.loading") : t("common.confirm")}</Button></div> : null}</Dialog>

    <Dialog open={Boolean(detail)} onClose={() => setDetail(null)} title={detail?.purchase ? `${detail.purchase.reference} · ${detail.purchase.title}` : ""} presentation="editor" className="max-w-5xl">{detail ? <div className="grid gap-4 text-sm"><div className="flex flex-wrap gap-2"><StatusBadge tone={statusTone(detail.purchase.status)}>{statusLabel(locale, detail.purchase.status)}</StatusBadge><StatusBadge>{formatEnterpriseAmount(detail.purchase.totalAmount, detail.purchase.currency, locale)}</StatusBadge>{detail.purchase.budgetLine ? <StatusBadge>{detail.purchase.budgetLine.budget.reference} · {detail.purchase.budgetLine.name}</StatusBadge> : <StatusBadge>{t("purchases.unbudgeted")}</StatusBadge>}</div><p className="text-dtsc-muted">{detail.purchase.description || t("common.noDescription")}</p>{detail.operationalLink ? <p className="text-dtsc-muted">{guide("site")}: {sites.find((site) => site.id === detail.operationalLink?.siteId)?.name || t("common.notSpecified")} · {guide("warehouse")}: {warehouses.find((warehouse) => warehouse.id === detail.operationalLink?.destinationWarehouseId)?.name || t("common.notSpecified")}</p> : null}<div className="border-y border-dtsc-border py-3"><strong>{t("purchases.detail.items")}</strong>{detail.purchase.items.map((item) => { const link = detail.itemCatalogLinks.find((entry) => entry.purchaseItemId === item.id); const catalog = catalogItems.find((entry) => entry.id === link?.catalogItemId); return <p key={item.id} className="mt-2 text-dtsc-muted">{catalog ? `${catalog.code} · ${catalog.name} · ` : ""}{item.description} · {item.quantity} {item.unit} × {formatEnterpriseAmount(item.unitPrice, detail.purchase.currency, locale)} = {formatEnterpriseAmount(item.lineTotal, detail.purchase.currency, locale)}</p>; })}</div><p>{t("purchases.detail.receipts")}: {detail.purchase.receipts.length}</p><p>{t("purchases.detail.approvals")}: {detail.approvals.map((approval) => statusLabel(locale, approval.status)).join(", ") || "—"}</p>{detail.events.length ? <div className="border-t border-dtsc-border pt-3"><strong>{t("purchases.detail.timeline")}</strong>{detail.events.slice(0, 8).map((event) => <p key={event.id} className="mt-1 text-dtsc-muted">{event.summary}</p>)}</div> : null}</div> : null}</Dialog>
  </div>;
}
