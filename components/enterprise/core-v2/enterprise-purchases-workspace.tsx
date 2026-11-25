"use client";

import { CheckCircle2, Eye, FilePlus2, PackageCheck, Pencil, Plus, Send, ShoppingCart, XCircle, ShieldCheck, ShieldX, Printer } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { BusinessList, BusinessListItem } from "@/components/workspace/business-list";
import { ContextActions, type BusinessContextAction } from "@/components/workspace/context-actions";
import { EmptyState } from "@/components/workspace/empty-state";
import { ModuleMetrics } from "@/components/workspace/module-metrics";
import { ErpDesign2Metric, ErpDesign2RegisterSection } from "@/components/enterprise/professional/erp-design2-register";
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
import { PurchaseReceiptTrace } from "@/components/enterprise/core-v2/purchase-receipt-trace";
import { FinanceAmountScopes, FinanceDateFilter, FinanceExportControls } from "@/components/enterprise/professional/finance-design2-controls";
import type { ProcurementUiCapabilities } from "@/components/enterprise/professional/enterprise-procurement-operations-workspace";
import { enterpriseCoreT, type EnterpriseCoreKey } from "@/lib/enterprise-core-i18n";
import { inventoryQuantityMicrounits, inventoryQuantityStep, isInventoryQuantityInputValid, localizeInventoryQuantity } from "@/lib/enterprise/inventory/quantity-display";
import { purchaseFormGuidance, type PurchaseFormGuidanceKey } from "@/lib/enterprise/purchase-form-i18n";

type PurchaseListItem = { pendingAssignedApproval?: { id: string; revision: number } | null; id: string; reference: string; title: string; description: string | null; status: string; priority: string; supplierId: string | null; requestedByUserId: string; buyerUserId: string | null; createdByUserId: string; departmentId: string | null; requestId: string | null; budgetLineId: string | null; currency: string; totalAmount: string | number; expectedAt: string | null; revision: number; createdAt: string; supplier: { id: string; legalName: string; displayName: string | null; status: string } | null; budgetLine: { id: string; name: string; budget: { id: string; reference: string; title: string; currency: string; status: string } } | null; _count: { items: number; receipts: number } };
type PurchaseDetail = PurchaseListItem & { items: Array<{ id: string; description: string; quantity: string | number; unit: string; unitPrice: string | number; taxRate: string | number; lineTotal: string | number }>; receipts: Array<{ id: string; reference: string; receivedAt: string; items: Array<{ purchaseItemId: string; quantityReceived: string | number }> }>; supplier: PurchaseListItem["supplier"] };
type PurchaseOperationalLink = { id: string; siteId: string | null; destinationWarehouseId: string | null; expectedReceiptType: string } | null;
type PurchaseItemCatalogLink = { purchaseItemId: string; catalogItemId: string | null; unitOfMeasureId: string | null; expectedItemType: string };
type ReceiptQuantity = { purchaseItemId: string; remaining: string; decimalScale: number | null };
type DetailPayload = { purchase: PurchaseDetail; approvals: Array<{ id: string; status: string; revision: number; approverUserId: string; decisionComment: string | null }>; events: Array<{ id: string; summary: string; createdAt: string }>; comments: Array<{ id: string; content: string; createdAt: string }>; operationalLink: PurchaseOperationalLink; itemCatalogLinks: PurchaseItemCatalogLink[]; inventoryRules?: Array<{ catalogItemId: string; lotTracking: boolean; expiryTracking: boolean }>; receiptQuantities: ReceiptQuantity[] };
type SupplierChoice = EnterpriseChoice & { status?: string };
type LegacyRecord = { id: string; title: string; description: string | null; status: string; updatedAt: string };
type CatalogChoice = { id: string; code: string; sku: string | null; name: string; itemType: string; currency: string | null; indicativeCost: string | number | null; unitOfMeasure: { id: string; code: string; symbol: string; name: string; decimalScale: number } };
type SiteChoice = { id: string; code: string; name: string };
type WarehouseChoice = { id: string; siteId: string; code: string; name: string };
type LocationChoice = { id: string; warehouseId: string; code: string; name: string };
type ReceiptBatchDraft = { lotNumber: string; productionDate: string; expiryDate: string; quantity: string };
const emptyReceiptBatch = (): ReceiptBatchDraft => ({ lotNumber: "", productionDate: "", expiryDate: "", quantity: "" });
function receiptRule(payload: DetailPayload | null, purchaseItemId: string) {
  const catalogId = payload?.itemCatalogLinks.find((entry) => entry.purchaseItemId === purchaseItemId)?.catalogItemId;
  return catalogId ? payload?.inventoryRules?.find((rule) => rule.catalogItemId === catalogId) : undefined;
}
type DraftItem = { catalogItemId: string; description: string; quantity: string; unit: string; unitPrice: string; taxRate: string };
type PendingPurchaseAction = { item: PurchaseListItem; action: "ORDER" | "CLOSE" | "CANCEL"; label: string };

const purchaseStatuses = ["DRAFT", "PENDING_APPROVAL", "APPROVED", "ORDERED", "PARTIALLY_RECEIVED", "RECEIVED", "CLOSED", "REJECTED", "CANCELLED"];
const emptyDraftItem = (): DraftItem => ({ catalogItemId: "", description: "", quantity: "1", unit: "", unitPrice: "0", taxRate: "0" });

export function EnterprisePurchasesWorkspace({ organizationId, organizationName = "Entreprise", members, departments, capabilities, locale, legacyRecords = [] }: { organizationId: string; organizationName?: string; members: EnterpriseChoice[]; departments: EnterpriseChoice[]; capabilities: ProcurementUiCapabilities; locale?: string | null; legacyRecords?: LegacyRecord[] }) {
  const t = (key: EnterpriseCoreKey, vars?: Record<string, string | number>) => enterpriseCoreT(locale, key, vars);
  const guide = (key: PurchaseFormGuidanceKey) => purchaseFormGuidance(locale, key);
  const displayLocale: "fr" | "en" = locale === "en" ? locale : "fr";
  const sourceParams = useSearchParams();
  const linkedPurchaseId = sourceParams.get("purchase");
  const linkedMovementId = sourceParams.get("returnMovement");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [reviewTarget, setReviewTarget] = useState<{ purchase: PurchaseListItem; detail: DetailPayload; approval: { id: string; revision: number } } | null>(null);
  const [reviewChecked, setReviewChecked] = useState(false);
  const [reviewReason, setReviewReason] = useState("");
  const [reviewBusy, setReviewBusy] = useState(false);
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
  const [receiptBatches, setReceiptBatches] = useState<Record<string, ReceiptBatchDraft[]>>({});
  const [draftItems, setDraftItems] = useState<DraftItem[]>([emptyDraftItem()]);
  const [message, setMessage] = useState("");
  useToastMessage(message);
  const catalogById = useMemo(() => new Map(catalogItems.map((item) => [item.id, item])), [catalogItems]);
  const receiptLines = (receiveTarget?.receiptQuantities ?? []).filter((line) => line.remaining !== "0" && !line.remaining.startsWith("-"));

  useEffect(() => {
    if (!linkedPurchaseId) return;
    let active = true;
    void fetch(`/api/enterprise/${encodeURIComponent(organizationId)}/purchases/${encodeURIComponent(linkedPurchaseId)}`, { cache: "no-store" }).then(async (response) => {
      const body = await response.json() as DetailPayload & { message?: string };
      if (!response.ok || !body.purchase) throw new Error(body.message || purchaseFormGuidance(locale, "receiptTraceError"));
      if (active) setDetail(body);
    }).catch((error) => { if (active) setMessage(error instanceof Error ? error.message : purchaseFormGuidance(locale, "receiptTraceError")); });
    return () => { active = false; };
  }, [organizationId, linkedPurchaseId, locale]);

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

  const params = useMemo(() => { const value = new URLSearchParams({ page: String(page), pageSize: "20" }); if (search.trim()) value.set("search", search.trim()); if (status) value.set("status", status); if (supplierFilter) value.set("supplier", supplierFilter); if (dateFrom) value.set("from", dateFrom); if (dateTo) value.set("to", dateTo); return value; }, [page, search, status, supplierFilter, dateFrom, dateTo]);
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
    if (draftItems.some((item) => !isInventoryQuantityInputValid(item.quantity, catalogById.get(item.catalogItemId)?.unitOfMeasure.decimalScale))) {
      setMessage(guide("quantityPrecisionInvalid"));
      return;
    }
    const form = Object.fromEntries(new FormData(event.currentTarget).entries());
    const items = draftItems.map((item) => ({ ...item, unitPrice: Number(item.unitPrice), taxRate: Number(item.taxRate) }));
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

  async function startReview(item: PurchaseListItem) {
    if (!item.pendingAssignedApproval || item.status !== "PENDING_APPROVAL") return;
    try {
      const detail = await loadDetail(item);
      const found = detail.approvals.find((approval) => approval.id === item.pendingAssignedApproval?.id && approval.approverUserId === collection.meta.currentUserId && approval.status === "PENDING");
      if (!found) throw new Error(t("purchases.review.notAssigned"));
      setReviewTarget({ purchase: item, detail, approval: { id: found.id, revision: found.revision } });
      setReviewChecked(false); setReviewReason("");
    } catch (error) { setMessage(error instanceof Error ? error.message : "APPROVAL_LOAD_FAILED"); }
  }

  async function decidePurchase(action: "APPROVE" | "REJECT") {
    if (!reviewTarget || reviewBusy || !reviewChecked || (action === "REJECT" && reviewReason.trim().length < 4)) return;
    setReviewBusy(true);
    try {
      const url = `/api/enterprise/${organizationId}/approvals/${encodeURIComponent(reviewTarget.approval.id)}/actions`;
      const prepared = await enterpriseV2Mutation(url, "POST", { action: "PREPARE_REVIEW", revision: reviewTarget.approval.revision });
      const version = prepared?.submissionVersion as { id?: string } | undefined;
      if (!version?.id) throw new Error(t("purchases.review.versionUnavailable"));
      await enterpriseV2Mutation(url, "POST", { action, revision: reviewTarget.approval.revision, reviewedVersionId: version.id, decisionComment: reviewReason.trim() });
      setReviewTarget(null); setReviewChecked(false); setReviewReason(""); setRefreshKey((value) => value + 1);
      setMessage(action === "APPROVE" ? t("purchases.review.approved") : t("purchases.review.rejected"));
    } catch (error) { setMessage(error instanceof Error ? error.message : "APPROVAL_DECISION_FAILED"); }
    finally { setReviewBusy(false); }
  }

  async function startReceive(item: PurchaseListItem) {
    try {
      const body = await loadDetail(item);
      setReceiptBatches(Object.fromEntries(body.purchase.items.filter((line) => receiptRule(body, line.id)?.lotTracking).map((line) => [line.id, [emptyReceiptBatch()]])));
      setReceiveTarget(body);
      setReceiveWarehouseId(body.operationalLink?.destinationWarehouseId || "");
      setReceiveLocationId("");
    } catch (error) { setMessage(error instanceof Error ? error.message : "LOAD_FAILED"); }
  }

  async function receive(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!receiveTarget || receiveSubmitting) return;
    const form = new FormData(event.currentTarget);
    const items: Array<{ purchaseItemId: string; quantityReceived: string }> = [];
    const lotAllocations: Array<{ purchaseItemId: string; batches: Array<{ lotNumber: string; productionDate: string | null; expiryDate: string | null; quantity: string }> }> = [];
    for (const { purchaseItemId, decimalScale, remaining } of receiptLines) {
      const quantityReceived = String(form.get(`quantity_${purchaseItemId}`) ?? "").trim();
      if (!quantityReceived || /^0+(?:\.0+)?$/.test(quantityReceived)) continue;
      const scale = decimalScale ?? undefined;
      if (!isInventoryQuantityInputValid(quantityReceived, scale)) {
        setMessage(guide("quantityPrecisionInvalid"));
        return;
      }
      const requested = inventoryQuantityMicrounits(quantityReceived);
      if (requested > inventoryQuantityMicrounits(remaining)) {
        setMessage(guide("receiptQuantity"));
        return;
      }
      items.push({ purchaseItemId, quantityReceived });
      const rule = receiptRule(receiveTarget, purchaseItemId);
      if (!rule?.lotTracking) continue;
      const batches = (receiptBatches[purchaseItemId] || [])
        .filter((batch) => batch.lotNumber.trim() || batch.quantity || batch.productionDate || batch.expiryDate)
        .map((batch) => ({ lotNumber: batch.lotNumber.trim(), productionDate: batch.productionDate || null, expiryDate: batch.expiryDate || null, quantity: batch.quantity.trim() }));
      if (!batches.length || batches.some((batch) => !batch.lotNumber || !isInventoryQuantityInputValid(batch.quantity, scale) || (rule.expiryTracking && !batch.expiryDate))
        || new Set(batches.map((batch) => batch.lotNumber)).size !== batches.length
        || batches.reduce((sum, batch) => sum + inventoryQuantityMicrounits(batch.quantity), BigInt(0)) !== requested) {
        setMessage(guide("receiptBatchInvalid"));
        return;
      }
      lotAllocations.push({ purchaseItemId, batches });
    }
    if (!items.length) { setMessage(guide("receiptQuantity")); return; }
    setReceiveSubmitting(true);
    try {
      await enterpriseV2Mutation(`/api/enterprise/${organizationId}/purchases/${receiveTarget.purchase.id}/receive`, "POST", { revision: receiveTarget.purchase.revision, receivedAt: new Date().toISOString(), warehouseId: receiveWarehouseId, storageLocationId: receiveLocationId, notes: String(form.get("notes") || ""), items, lotAllocations });
      setReceiveTarget(null); setReceiveWarehouseId(""); setReceiveLocationId(""); setReceiptBatches({}); setRefreshKey((value) => value + 1); setMessage(t("purchases.receiptSaved"));
    } catch (error) { setMessage(error instanceof Error ? error.message : "ACTION_FAILED"); }
    finally { setReceiveSubmitting(false); }
  }

  const openPrintablePurchase = (id: string) => {
    const language = locale === "en" ? locale : "fr";
    window.open(`/api/enterprise/${organizationId}/purchases/${encodeURIComponent(id)}/print?lang=${language}`, "_blank", "noopener,noreferrer");
  };

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
      { id: "print", label: t("purchases.action.print"), icon: Printer, onSelect: () => openPrintablePurchase(item.id) },
      ...(item.status === "DRAFT" && canAct ? [{ id: "edit", label: t("common.edit"), icon: Pencil, onSelect: () => void openEdit(item) }, { id: "submit", label: t("purchases.action.submit"), icon: Send, onSelect: () => setApprovalTarget(item) }] : []),
      ...(item.status === "PENDING_APPROVAL" && item.pendingAssignedApproval && capabilities.canApprove ? [{ id: "review", label: t("purchases.review.open"), icon: ShieldCheck, onSelect: () => void startReview(item) }] : []),
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

  return <div className="grid min-w-0 gap-3">
    <ModuleMetrics className="lg:[&>div]:grid-cols-5" label={t("purchases.indicators")}><ErpDesign2Metric tone="slate" label={t("purchases.metric.drafts")} value={collection.loading || collection.error ? "—" : metrics.drafts ?? 0} /><ErpDesign2Metric tone="amber" label={t("purchases.metric.pending")} value={collection.loading || collection.error ? "—" : metrics.pending ?? 0} /><ErpDesign2Metric tone="sky" label={t("purchases.metric.ordered")} value={collection.loading || collection.error ? "—" : metrics.ordered ?? 0} /><ErpDesign2Metric tone="violet" label={t("purchases.metric.receiving")} value={collection.loading || collection.error ? "—" : metrics.receiving ?? 0} /><ErpDesign2Metric tone="emerald" label={t("purchases.metric.received")} value={collection.loading || collection.error ? "—" : metrics.received ?? 0} /></ModuleMetrics>
    <ErpDesign2RegisterSection title={t("purchases.section.title")} description={t("purchases.section.description")} count={`${collection.pagination.total}`} action={capabilities.canWrite ? <Button onClick={startCreate} className="bg-dtsc-blue text-white"><Plus className="h-4 w-4" />{t("purchases.new")}</Button> : undefined}>
      <div data-purchase-design2 className="grid gap-3 border-y border-dtsc-border py-3">
        <div role="group" aria-label={t("purchases.filter.status")} className="flex min-w-0 gap-2 overflow-x-auto pb-1">{["", ...purchaseStatuses].map((value) => <button type="button" key={value} aria-pressed={status === value} onClick={() => { setStatus(value); setPage(1); }} className={`min-h-10 shrink-0 rounded-full border px-3 text-xs font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-500 ${status === value ? "border-dtsc-blue bg-dtsc-blue text-white" : "border-dtsc-border bg-dtsc-page text-dtsc-ink"}`}>{value ? statusLabel(locale, value) : t("purchases.filter.all")}</button>)}</div>
        <div className="grid gap-2 md:grid-cols-2"><Input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} aria-label={t("purchases.filter.search")} placeholder={t("purchases.search")} /><NativeSelect value={supplierFilter} onChange={(value) => { setSupplierFilter(value); setPage(1); }} items={suppliers} /></div>
        <div className="flex min-w-0 flex-wrap items-end justify-between gap-2"><FinanceDateFilter locale={displayLocale} from={dateFrom} to={dateTo} onChange={(from, to) => { setDateFrom(from); setDateTo(to); setPage(1); }} />
          <FinanceExportControls endpoint={`/api/enterprise/${organizationId}/purchases`} organizationName={organizationName} title={t("purchases.export.title")} locale={displayLocale} filters={{ search, status, supplier: supplierFilter, from: dateFrom, to: dateTo }} columns={[
            { key: "reference", labelFr: enterpriseCoreT("fr", "purchases.export.reference"), labelEn: enterpriseCoreT("en", "purchases.export.reference"), get: (row) => String(row.reference || "") },
            { key: "title", labelFr: enterpriseCoreT("fr", "purchases.export.order"), labelEn: enterpriseCoreT("en", "purchases.export.order"), get: (row) => String(row.title || "") },
            { key: "status", labelFr: enterpriseCoreT("fr", "purchases.export.status"), labelEn: enterpriseCoreT("en", "purchases.export.status"), get: (row) => statusLabel(locale, String(row.status || "")) },
            { key: "currency", labelFr: enterpriseCoreT("fr", "purchases.export.currency"), labelEn: enterpriseCoreT("en", "purchases.export.currency"), get: (row) => String(row.currency || "") },
            { key: "totalAmount", labelFr: enterpriseCoreT("fr", "purchases.export.amount"), labelEn: enterpriseCoreT("en", "purchases.export.amount"), get: (row) => String(row.totalAmount || "0") },
            { key: "createdAt", labelFr: enterpriseCoreT("fr", "purchases.export.created"), labelEn: enterpriseCoreT("en", "purchases.export.created"), get: (row) => String(row.createdAt || "") },
          ]} />
        </div>
      </div>
      {!collection.loading && !collection.error ? <FinanceAmountScopes totals={collection.meta} locale={displayLocale} /> : null}
      {collection.loading ? <p className="py-8 text-center text-sm text-dtsc-muted">{t("common.loading")}</p> : collection.items.length ? <BusinessList ariaLabel={t("purchases.aria")}>{collection.items.map((item) => <BusinessListItem key={item.id} title={`${item.reference} · ${item.title}`} status={<StatusBadge tone={statusTone(item.status)}>{statusLabel(locale, item.status)}</StatusBadge>} meta={`${item.supplier?.displayName || item.supplier?.legalName || t("purchases.supplierPending")} · ${formatEnterpriseAmount(item.totalAmount, item.currency, locale)}`} description={`${t("purchases.itemsCount", { count: item._count.items })}${item.budgetLine ? ` · ${item.budgetLine.budget.reference} / ${item.budgetLine.name}` : ` · ${t("purchases.unbudgeted")}`}${item.expectedAt ? ` · ${t("purchases.expected", { date: formatEnterpriseDate(item.expectedAt, locale) })}` : ""}`} onOpen={() => void openDetail(item)} openLabel={t("purchases.openNamed", { reference: item.reference })} actions={<ContextActions label={t("purchases.actions")} actions={actionsFor(item)} />} />)}</BusinessList> : <EmptyState compact title={t("purchases.noPurchases")} description={collection.error || t("purchases.noMatch")} />}
      <div className="mt-3 flex justify-between border-t border-dtsc-border pt-3 text-sm text-dtsc-muted"><span>{t("common.page", { current: collection.pagination.page, total: collection.pagination.pageCount })}</span><div className="flex gap-2"><Button variant="outline" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>{t("common.previous")}</Button><Button variant="outline" disabled={page >= collection.pagination.pageCount} onClick={() => setPage((value) => value + 1)}>{t("common.next")}</Button></div></div>
    </ErpDesign2RegisterSection>
    {legacyRecords.length ? <ModuleSection title={t("purchases.historical.title")} description={t("purchases.historical.description")}><BusinessList ariaLabel={t("purchases.historical.aria")}>{legacyRecords.map((item) => <BusinessListItem key={item.id} title={item.title} status={<StatusBadge>{t("purchases.historyBadge")}</StatusBadge>} description={item.description || statusLabel(locale, item.status)} />)}</BusinessList></ModuleSection> : null}

    <Dialog open={Boolean(reviewTarget)} onClose={() => { if (!reviewBusy) setReviewTarget(null); }} title={t("purchases.review.title")} description={reviewTarget?.purchase.reference} presentation="editor" className="max-w-3xl">{reviewTarget ? <div data-purchase-review className="grid min-w-0 gap-4">
      <div className="rounded-xl border border-dtsc-border bg-dtsc-page p-3"><strong className="text-dtsc-ink">{reviewTarget.purchase.reference} · {reviewTarget.purchase.title}</strong><p className="mt-1 text-sm text-dtsc-muted">{reviewTarget.purchase.supplier?.displayName || reviewTarget.purchase.supplier?.legalName || "—"} · {formatEnterpriseAmount(reviewTarget.purchase.totalAmount, reviewTarget.purchase.currency, locale)}</p><p className="mt-2 text-xs text-amber-800 dark:text-amber-300">{t("purchases.review.explain")}</p></div>
      <div className="max-h-56 space-y-2 overflow-y-auto rounded-xl border border-dtsc-border p-3">{reviewTarget.detail.purchase.items.map((item) => <div key={item.id} className="flex flex-wrap justify-between gap-2 border-b border-dtsc-border pb-2 text-sm"><span className="min-w-0 flex-1 break-words">{item.description} · {item.quantity} {item.unit}</span><strong>{formatEnterpriseAmount(item.lineTotal, reviewTarget.purchase.currency, locale)}</strong></div>)}</div>
      <label className="flex items-start gap-2 rounded-xl bg-cyan-500/5 p-3 text-sm text-dtsc-ink"><input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-cyan-600" checked={reviewChecked} onChange={(event) => setReviewChecked(event.target.checked)} />{t("purchases.review.confirmation")}</label>
      <label className="grid gap-1 text-sm font-semibold text-dtsc-ink">{t("purchases.review.reason")}<textarea maxLength={3000} className="min-h-24 rounded-xl border border-dtsc-border bg-dtsc-page p-3 text-base" value={reviewReason} onChange={(event) => setReviewReason(event.target.value)} disabled={reviewBusy} /></label>
      <div data-responsive-actions className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" disabled={reviewBusy} onClick={() => setReviewTarget(null)}>{t("purchases.review.back")}</Button><Button type="button" variant="outline" disabled={!reviewChecked || reviewBusy || reviewReason.trim().length < 4} onClick={() => void decidePurchase("REJECT")}><ShieldX className="h-4 w-4" />{t("purchases.review.reject")}</Button><Button type="button" disabled={!reviewChecked || reviewBusy} onClick={() => void decidePurchase("APPROVE")}><ShieldCheck className="h-4 w-4" />{t("purchases.review.approve")}</Button></div>
      </div> : null}</Dialog>
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
          <Field label={t("purchases.form.currency")} help={guide("currency")} required><NativeSelect name="currency" defaultValue={formTarget?.currency || ""} items={currencyChoices(locale)} required /></Field>
          <Field label={t("purchases.form.expectedDelivery")} help={guide("expectedDelivery")}><Input name="expectedAt" type="date" defaultValue={formTarget?.expectedAt ? new Date(formTarget.expectedAt).toISOString().slice(0, 10) : ""} /></Field>
          <Field label={guide("site")} help={guide("siteHelp")}><NativeSelect name="siteId" value={purchaseSiteId} onChange={(value) => { setPurchaseSiteId(value); const current = warehouses.find((warehouse) => warehouse.id === purchaseWarehouseId); if (current && value && current.siteId !== value) setPurchaseWarehouseId(""); }} items={siteChoices} /></Field>
          <Field label={guide("warehouse")} help={guide("warehouseHelp")}><NativeSelect name="destinationWarehouseId" value={purchaseWarehouseId} onChange={setPurchaseWarehouseId} items={purchaseWarehouseChoices} /></Field>
        </div>
        <Field label={t("purchases.form.description")} help={guide("description")}><textarea name="description" defaultValue={formTarget?.description || ""} className="min-h-24 max-w-full rounded-xl border border-dtsc-border bg-dtsc-surface p-3 text-base text-dtsc-ink md:text-sm" /></Field>
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 border-y border-dtsc-border py-4">
          <div className="flex min-w-0 flex-wrap items-start justify-between gap-3"><div className="min-w-0"><strong className="block break-words text-dtsc-ink">{t("purchases.form.items")}</strong><p className="mt-1 max-w-3xl break-words text-sm leading-6 text-dtsc-muted">{guide("items")}</p></div><Button type="button" variant="outline" onClick={() => setDraftItems((items) => [...items, emptyDraftItem()])}><Plus className="h-4 w-4" />{t("purchases.form.line")}</Button></div>
          {draftItems.map((item, index) => {
            const step = inventoryQuantityStep(catalogById.get(item.catalogItemId)?.unitOfMeasure.decimalScale);
            return <div key={index} className="grid min-w-0 max-w-full grid-cols-[minmax(0,1fr)] gap-3 rounded-2xl border border-dtsc-border bg-dtsc-page p-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1.5fr)_minmax(0,.7fr)_minmax(0,.8fr)_minmax(0,1fr)_minmax(0,.8fr)]">
            <Field label={guide("catalogItem")} help={guide("catalogItemHelp")} required><NativeSelect value={item.catalogItemId} onChange={(value) => { const catalog = catalogItems.find((entry) => entry.id === value); setDraftItems((items) => items.map((entry, itemIndex) => itemIndex === index ? { ...entry, catalogItemId: value, description: catalog?.name || entry.description, unit: catalog ? (catalog.unitOfMeasure.symbol || catalog.unitOfMeasure.code) : "", unitPrice: catalog?.indicativeCost != null ? String(catalog.indicativeCost) : entry.unitPrice } : entry)); }} items={catalogChoices} required /></Field>
            <Field label={guide("lineDescription")} help={guide("lineDescriptionHelp")} required><Input value={item.description} onChange={(event) => setDraftItems((items) => items.map((entry, itemIndex) => itemIndex === index ? { ...entry, description: event.target.value } : entry))} required /></Field>
            <Field label={guide("quantity")} help={guide("quantityHelp")} required><Input value={item.quantity} onChange={(event) => setDraftItems((items) => items.map((entry, itemIndex) => itemIndex === index ? { ...entry, quantity: event.target.value } : entry))} type="number" min={step} step={step} max="1000000" inputMode="decimal" disabled={!step} required /></Field>
            <Field label={guide("unit")} help={guide("unitHelp")} required><div data-dtsc-canonical-unit aria-live="polite" className="flex h-11 min-w-0 items-center rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-base font-semibold text-dtsc-ink md:text-sm">{item.unit || t("common.notSpecified")}</div></Field>
            <Field label={guide("unitPrice")} help={guide("unitPriceHelp")} required><Input value={item.unitPrice} onChange={(event) => setDraftItems((items) => items.map((entry, itemIndex) => itemIndex === index ? { ...entry, unitPrice: event.target.value } : entry))} type="number" min="0" step="0.01" required /></Field>
            <Field label={guide("taxRate")} help={guide("taxRateHelp")}><Input value={item.taxRate} onChange={(event) => setDraftItems((items) => items.map((entry, itemIndex) => itemIndex === index ? { ...entry, taxRate: event.target.value } : entry))} type="number" min="0" max="100" step="0.01" /></Field>
            </div>;
          })}
        </div>
        <Button disabled={formSubmitting} className="bg-dtsc-blue text-white"><ShoppingCart className="h-4 w-4" />{formSubmitting ? t("common.loading") : formTarget ? t("common.save") : t("purchases.form.createDraft")}</Button>
      </form>
    </Dialog>

    <Dialog open={Boolean(approvalTarget)} onClose={() => setApprovalTarget(null)} title={t("purchases.approval.title")} description={approvalTarget?.title} presentation="editor"><form onSubmit={(event) => { event.preventDefault(); if (!approvalTarget) return; const approver = String(new FormData(event.currentTarget).get("approverUserId") || ""); void runAction(approvalTarget, "SUBMIT", approver).catch((error) => setMessage(error instanceof Error ? error.message : "ACTION_FAILED")); }} className="grid gap-4"><Field label={t("purchases.approval.designated")} help={guide("approver")} required><EnterpriseApproverSelect organizationId={organizationId} moduleCode="SUPPLIERS_PURCHASES" locale={locale} /></Field><Button className="bg-dtsc-blue text-white">{t("purchases.approval.submit")}</Button></form></Dialog>

    <Dialog open={Boolean(receiveTarget)} onClose={() => { if (!receiveSubmitting) { setReceiveTarget(null); setReceiveWarehouseId(""); setReceiveLocationId(""); } }} title={t("purchases.receive.title")} description={receiveTarget?.purchase.reference} presentation="editor" className="max-w-4xl">
      <form onSubmit={receive} className="grid min-w-0 gap-4">
        {receiveRequiresWarehouse ? <div className="grid min-w-0 gap-3 md:grid-cols-2">
          <Field label={guide("receiptWarehouse")} help={guide("receiptWarehouseHelp")} required><NativeSelect name="warehouseId" value={receiveWarehouseId} onChange={(value) => { setReceiveWarehouseId(value); setReceiveLocationId(""); }} items={receiveWarehouseChoices} required /></Field>
          <Field label={guide("receiptLocation")} help={guide("receiptLocationHelp")}><NativeSelect name="storageLocationId" value={receiveLocationId} onChange={setReceiveLocationId} items={receiveLocationChoices} /></Field>
        </div> : null}
        {receiptLines.map(({ purchaseItemId, decimalScale, remaining }) => {
          const item = receiveTarget?.purchase.items.find((line) => line.id === purchaseItemId);
          if (!item) return null;
          const step = inventoryQuantityStep(decimalScale ?? undefined);
          const rule = receiptRule(receiveTarget, item.id);
          const displayRemaining = localizeInventoryQuantity(remaining, displayLocale === "fr" ? "fr-FR" : "en-GB");
          return <div key={item.id} className="grid min-w-0 gap-2 border-b border-dtsc-border pb-3">
            <Field label={t("purchases.receive.ordered", { description: item.description, quantity: displayRemaining, unit: item.unit })} help={step ? guide("receiptQuantity") : guide("receiptUnitUnverified")}>
              <Input name={`quantity_${item.id}`} type="number" min="0" max={remaining} step={step} disabled={!step} defaultValue="0" inputMode="decimal" />
            </Field>
            {step && rule?.lotTracking ? <div className="grid min-w-0 gap-2">
              <p className="text-xs font-semibold text-dtsc-muted">{guide("receiptBatchHelp")}</p>
              {(receiptBatches[item.id] || []).map((batch, index) => <div key={index} className="grid min-w-0 gap-2 rounded-xl border border-dtsc-border p-2 sm:grid-cols-2">
                {([
                  ["lotNumber", guide("receiptBatchNumber"), "text"],
                  ["quantity", guide("receiptBatchQuantity"), "number"],
                  ["productionDate", guide("receiptBatchProduction"), "date"],
                  ["expiryDate", guide(rule.expiryTracking ? "receiptBatchExpiryRequired" : "receiptBatchExpiry"), "date"],
                ] as const).map(([field, label, type]) => <Field key={field} label={label}>
                  <Input type={type} min={type === "number" ? step : undefined} step={type === "number" ? step : undefined} max={type === "number" ? remaining : undefined} inputMode={type === "number" ? "decimal" : undefined} maxLength={field === "lotNumber" ? 120 : undefined} value={batch[field]} onChange={(event) => {
                    const value = event.target.value;
                    setReceiptBatches((previous) => ({ ...previous, [item.id]: (previous[item.id] || []).map((row, rowIndex) => rowIndex === index ? { ...row, [field]: value } : row) }));
                  }} />
                </Field>)}
                <Button type="button" variant="outline" className="sm:col-span-2" onClick={() => setReceiptBatches((previous) => ({ ...previous, [item.id]: (previous[item.id] || []).filter((_, rowIndex) => rowIndex !== index) }))}>{guide("receiptBatchRemove")}</Button>
              </div>)}
              <Button type="button" variant="outline" disabled={(receiptBatches[item.id] || []).length >= 100} onClick={() => setReceiptBatches((previous) => ({ ...previous, [item.id]: [...(previous[item.id] || []), emptyReceiptBatch()] }))}><Plus className="h-4 w-4" />{guide("receiptBatchAdd")}</Button>
            </div> : null}
          </div>;
        })}
        <Field label={t("purchases.receive.notes")} help={guide("receiptNotes")}><textarea name="notes" className="min-h-24 rounded-xl border border-dtsc-border bg-dtsc-surface p-3 text-base text-dtsc-ink md:text-sm" /></Field>
        <Button disabled={receiveSubmitting || !receiptLines.some((line) => line.decimalScale !== null)} className="bg-dtsc-blue text-white"><PackageCheck className="h-4 w-4" />{receiveSubmitting ? t("common.loading") : t("purchases.receive.save")}</Button>
      </form>
    </Dialog>

    <Dialog open={Boolean(pendingAction)} onClose={() => { if (!actionSubmitting) { setPendingAction(null); setActionReason(""); } }} title={pendingAction?.label || ""} description={guide("actionReview")} presentation={actionRequiresReason ? "editor" : "default"}>{pendingAction ? <div className="grid gap-4"><div className="rounded-xl border border-dtsc-border bg-dtsc-page p-3 text-sm"><strong className="text-dtsc-ink">{pendingAction.item.reference} · {pendingAction.item.title}</strong><p className="mt-1 text-dtsc-muted">{formatEnterpriseAmount(pendingAction.item.totalAmount, pendingAction.item.currency, locale)}</p></div>{actionRequiresReason ? <Field label={guide("actionReason")} help={guide("actionReasonHelp")} required><textarea value={actionReason} onChange={(event) => setActionReason(event.target.value)} minLength={3} required className="min-h-28 rounded-xl border border-dtsc-border bg-dtsc-surface p-3 text-base text-dtsc-ink md:text-sm" /></Field> : null}<Button disabled={actionSubmitting} onClick={() => void confirmPendingAction()} className="bg-dtsc-blue text-white">{actionSubmitting ? t("common.loading") : t("common.confirm")}</Button></div> : null}</Dialog>

    <Dialog open={Boolean(detail)} onClose={() => setDetail(null)} title={detail?.purchase ? `${detail.purchase.reference} · ${detail.purchase.title}` : ""} presentation="editor" className="max-w-5xl">{detail ? <div className="grid gap-4 text-sm"><div data-responsive-actions><Button type="button" variant="outline" onClick={() => openPrintablePurchase(detail.purchase.id)}><Printer className="mr-1 h-4 w-4" />{t("purchases.action.previewA4")}</Button></div><div className="flex flex-wrap gap-2"><StatusBadge tone={statusTone(detail.purchase.status)}>{statusLabel(locale, detail.purchase.status)}</StatusBadge><StatusBadge>{formatEnterpriseAmount(detail.purchase.totalAmount, detail.purchase.currency, locale)}</StatusBadge>{detail.purchase.budgetLine ? <StatusBadge>{detail.purchase.budgetLine.budget.reference} · {detail.purchase.budgetLine.name}</StatusBadge> : <StatusBadge>{t("purchases.unbudgeted")}</StatusBadge>}</div><p className="text-dtsc-muted">{detail.purchase.description || t("common.noDescription")}</p>{detail.operationalLink ? <p className="text-dtsc-muted">{guide("site")}: {sites.find((site) => site.id === detail.operationalLink?.siteId)?.name || t("common.notSpecified")} · {guide("warehouse")}: {warehouses.find((warehouse) => warehouse.id === detail.operationalLink?.destinationWarehouseId)?.name || t("common.notSpecified")}</p> : null}<div className="border-y border-dtsc-border py-3"><strong>{t("purchases.detail.items")}</strong>{detail.purchase.items.map((item) => { const link = detail.itemCatalogLinks.find((entry) => entry.purchaseItemId === item.id); const catalog = catalogItems.find((entry) => entry.id === link?.catalogItemId); return <p key={item.id} className="mt-2 text-dtsc-muted">{catalog ? `${catalog.code} · ${catalog.name} · ` : ""}{item.description} · {item.quantity} {item.unit} × {formatEnterpriseAmount(item.unitPrice, detail.purchase.currency, locale)} = {formatEnterpriseAmount(item.lineTotal, detail.purchase.currency, locale)}</p>; })}</div><p>{t("purchases.detail.receipts")}: {detail.purchase.receipts.length}</p>{detail.purchase.receipts.length ? <PurchaseReceiptTrace key={detail.purchase.id} organizationId={organizationId} purchaseId={detail.purchase.id} locale={locale || "fr"} focusMovementId={detail.purchase.id === linkedPurchaseId ? linkedMovementId : null} /> : null}<p>{t("purchases.detail.approvals")}: {detail.approvals.map((approval) => statusLabel(locale, approval.status)).join(", ") || "—"}</p>{detail.events.length ? <div className="border-t border-dtsc-border pt-3"><strong>{t("purchases.detail.timeline")}</strong>{detail.events.slice(0, 8).map((event) => <p key={event.id} className="mt-1 text-dtsc-muted">{event.summary}</p>)}</div> : null}</div> : null}</Dialog>
  </div>;
}
