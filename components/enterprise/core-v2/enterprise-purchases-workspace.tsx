"use client";

import { CheckCircle2, Eye, FilePlus2, PackageCheck, Plus, Send, ShoppingCart, XCircle } from "lucide-react";
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
import { Field, NativeSelect, formatEnterpriseAmount, formatEnterpriseDate, priorityChoices, statusLabel, statusTone, type EnterpriseChoice } from "@/components/enterprise/core-v2/erp-v2-ui";
import { enterpriseV2Mutation, useEnterpriseV2Collection } from "@/components/enterprise/core-v2/use-enterprise-v2-collection";
import type { ProcurementUiCapabilities } from "@/components/enterprise/professional/enterprise-procurement-operations-workspace";
import { enterpriseCoreT, type EnterpriseCoreKey } from "@/lib/enterprise-core-i18n";

type PurchaseListItem = { id: string; reference: string; title: string; description: string | null; status: string; priority: string; supplierId: string | null; requestedByUserId: string; buyerUserId: string | null; createdByUserId: string; departmentId: string | null; requestId: string | null; budgetLineId: string | null; currency: string; totalAmount: string | number; expectedAt: string | null; revision: number; createdAt: string; supplier: { id: string; legalName: string; displayName: string | null; status: string } | null; budgetLine: { id: string; name: string; budget: { id: string; reference: string; title: string; currency: string; status: string } } | null; _count: { items: number; receipts: number } };
type PurchaseDetail = PurchaseListItem & { items: Array<{ id: string; description: string; quantity: string | number; unit: string; unitPrice: string | number; taxRate: string | number; lineTotal: string | number }>; receipts: Array<{ id: string; reference: string; receivedAt: string; items: Array<{ purchaseItemId: string; quantityReceived: string | number }> }>; supplier: PurchaseListItem["supplier"] };
type DetailPayload = { purchase: PurchaseDetail; approvals: Array<{ id: string; status: string; approverUserId: string; decisionComment: string | null }>; events: Array<{ id: string; summary: string; createdAt: string }>; comments: Array<{ id: string; content: string; createdAt: string }> };
type SupplierChoice = EnterpriseChoice & { status?: string };
type LegacyRecord = { id: string; title: string; description: string | null; status: string; updatedAt: string };
type DraftItem = { description: string; quantity: string; unit: string; unitPrice: string; taxRate: string };

const purchaseStatuses = ["DRAFT", "PENDING_APPROVAL", "APPROVED", "ORDERED", "PARTIALLY_RECEIVED", "RECEIVED", "CLOSED", "REJECTED", "CANCELLED"];

export function EnterprisePurchasesWorkspace({ organizationId, members, departments, capabilities, locale, legacyRecords = [] }: { organizationId: string; members: EnterpriseChoice[]; departments: EnterpriseChoice[]; capabilities: ProcurementUiCapabilities; locale?: string | null; legacyRecords?: LegacyRecord[] }) {
  const t = (key: EnterpriseCoreKey, vars?: Record<string, string | number>) => enterpriseCoreT(locale, key, vars);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [approvalTarget, setApprovalTarget] = useState<PurchaseListItem | null>(null);
  const [detail, setDetail] = useState<DetailPayload | null>(null);
  const [receiveTarget, setReceiveTarget] = useState<PurchaseDetail | null>(null);
  const [suppliers, setSuppliers] = useState<SupplierChoice[]>([]);
  const [requests, setRequests] = useState<EnterpriseChoice[]>([]);
  const [budgetLines, setBudgetLines] = useState<EnterpriseChoice[]>([]);
  const [draftItems, setDraftItems] = useState<DraftItem[]>([{ description: "", quantity: "1", unit: "unit", unitPrice: "0", taxRate: "0" }]);
  const [message, setMessage] = useState("");
  useToastMessage(message);

  useEffect(() => {
    void Promise.all([
      fetch(`/api/enterprise/${organizationId}/suppliers?page=1&pageSize=100&status=ACTIVE`, { cache: "no-store" }).then((response) => response.json()) as Promise<{ items?: Array<{ id: string; legalName: string; displayName: string | null }> }>,
      fetch(`/api/enterprise/${organizationId}/requests?page=1&pageSize=100`, { cache: "no-store" }).then((response) => response.json()) as Promise<{ items?: Array<{ id: string; title: string; status: string }> }>,
      fetch(`/api/enterprise/${organizationId}/budget-lines?page=1&pageSize=100&status=ACTIVE`, { cache: "no-store" }).then((response) => response.ok ? response.json() : ({ items: [] })) as Promise<{ items?: Array<{ id: string; name: string; budget: { reference: string; currency: string } }> }>,
    ]).then(([supplierBody, requestBody, budgetBody]) => {
      setSuppliers((supplierBody.items || []).map((item) => ({ id: item.id, label: item.displayName || item.legalName })));
      setRequests((requestBody.items || []).filter((item) => !["REJECTED", "CANCELLED"].includes(item.status)).map((item) => ({ id: item.id, label: `${item.title} · ${statusLabel(locale, item.status)}` })));
      setBudgetLines((budgetBody.items || []).map((item) => ({ id: item.id, label: `${item.budget.reference} · ${item.name} · ${item.budget.currency}` })));
    }).catch(() => {
      setSuppliers([]);
      setRequests([]);
      setBudgetLines([]);
    });
  }, [organizationId, refreshKey, locale]);

  const params = useMemo(() => { const value = new URLSearchParams({ page: String(page), pageSize: "20" }); if (search.trim()) value.set("search", search.trim()); if (status) value.set("status", status); if (supplierFilter) value.set("supplier", supplierFilter); return value; }, [page, search, status, supplierFilter]);
  const collection = useEnterpriseV2Collection<PurchaseListItem>({ endpoint: `/api/enterprise/${organizationId}/purchases`, params, refreshKey });
  const metrics = collection.meta.metrics || {};

  async function createPurchase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = Object.fromEntries(new FormData(event.currentTarget).entries());
    const items = draftItems.map((item) => ({ ...item, quantity: Number(item.quantity), unitPrice: Number(item.unitPrice), taxRate: Number(item.taxRate) }));
    try {
      await enterpriseV2Mutation(`/api/enterprise/${organizationId}/purchases`, "POST", { ...form, items });
      setCreateOpen(false);
      setDraftItems([{ description: "", quantity: "1", unit: "unit", unitPrice: "0", taxRate: "0" }]);
      setRefreshKey((value) => value + 1);
      setMessage(t("purchases.draftCreated"));
    } catch (error) { setMessage(error instanceof Error ? error.message : "ACTION_FAILED"); }
  }

  async function runAction(item: PurchaseListItem, action: string, approverUserId?: string) {
    try {
      await enterpriseV2Mutation(`/api/enterprise/${organizationId}/purchases/${item.id}/actions`, "POST", { action, revision: item.revision, approverUserId: approverUserId || "" });
      setApprovalTarget(null);
      setDetail(null);
      setRefreshKey((value) => value + 1);
      setMessage(t("purchases.updated"));
    } catch (error) { setMessage(error instanceof Error ? error.message : "ACTION_FAILED"); }
  }

  async function openDetail(item: PurchaseListItem) {
    try {
      const response = await fetch(`/api/enterprise/${organizationId}/purchases/${item.id}`, { cache: "no-store" });
      const body = await response.json() as DetailPayload & { message?: string };
      if (!response.ok) throw new Error(body.message || "LOAD_FAILED");
      setDetail(body);
    } catch (error) { setMessage(error instanceof Error ? error.message : "LOAD_FAILED"); }
  }

  async function startReceive(item: PurchaseListItem) {
    try {
      const response = await fetch(`/api/enterprise/${organizationId}/purchases/${item.id}`, { cache: "no-store" });
      const body = await response.json() as DetailPayload & { message?: string };
      if (!response.ok) throw new Error(body.message || "LOAD_FAILED");
      setReceiveTarget(body.purchase);
    } catch (error) { setMessage(error instanceof Error ? error.message : "LOAD_FAILED"); }
  }

  async function receive(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!receiveTarget) return;
    const form = new FormData(event.currentTarget);
    const items = receiveTarget.items.map((item) => ({ purchaseItemId: item.id, quantityReceived: Number(form.get(`quantity_${item.id}`) || 0) })).filter((item) => item.quantityReceived > 0);
    try {
      await enterpriseV2Mutation(`/api/enterprise/${organizationId}/purchases/${receiveTarget.id}/receive`, "POST", { revision: receiveTarget.revision, receivedAt: new Date().toISOString(), notes: String(form.get("notes") || ""), items });
      setReceiveTarget(null);
      setRefreshKey((value) => value + 1);
      setMessage(t("purchases.receiptSaved"));
    } catch (error) { setMessage(error instanceof Error ? error.message : "ACTION_FAILED"); }
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
      ...(item.status === "DRAFT" && canAct ? [{ id: "submit", label: t("purchases.action.submit"), icon: Send, onSelect: () => setApprovalTarget(item) }] : []),
      ...(item.status === "APPROVED" && canBuyerAct ? [{ id: "order", label: t("purchases.action.order"), icon: ShoppingCart, onSelect: () => void runAction(item, "ORDER") }] : []),
      ...(["APPROVED", "ORDERED", "PARTIALLY_RECEIVED", "RECEIVED", "CLOSED"].includes(item.status) ? [{ id: "expense", label: t("purchases.action.expense"), icon: FilePlus2, onSelect: () => { window.location.href = `/enterprise-modules/FINANCE_BUDGETS?purchaseId=${encodeURIComponent(item.id)}`; } }] : []),
      ...(["ORDERED", "PARTIALLY_RECEIVED"].includes(item.status) && canBuyerAct ? [{ id: "receive", label: t("purchases.action.receive"), icon: PackageCheck, onSelect: () => void startReceive(item) }] : []),
      ...(item.status === "RECEIVED" && canBuyerAct ? [{ id: "close", label: t("purchases.action.close"), icon: CheckCircle2, onSelect: () => void runAction(item, "CLOSE") }] : []),
      ...(["DRAFT", "APPROVED"].includes(item.status) && canCancel ? [{ id: "cancel", label: t("purchases.action.cancel"), icon: XCircle, destructive: true, separatorBefore: true, onSelect: () => void runAction(item, "CANCEL") }] : []),
    ];
  };

  return <div className="grid min-w-0 gap-5">
    <ModuleMetrics label={t("purchases.indicators")}><ModuleMetric label={t("purchases.metric.drafts")} value={metrics.drafts || 0} /><ModuleMetric label={t("purchases.metric.pending")} value={metrics.pending || 0} /><ModuleMetric label={t("purchases.metric.ordered")} value={metrics.ordered || 0} /><ModuleMetric label={t("purchases.metric.receiving")} value={metrics.receiving || 0} /><ModuleMetric label={t("purchases.metric.received")} value={metrics.received || 0} /></ModuleMetrics>
    <ModuleSection title={t("purchases.section.title")} description={t("purchases.section.description")} count={`${collection.pagination.total}`} action={capabilities.canWrite ? <Button onClick={() => setCreateOpen(true)} className="bg-dtsc-blue text-white"><Plus className="h-4 w-4" />{t("purchases.new")}</Button> : undefined}>
      <div className="grid gap-2 border-y border-dtsc-border py-3 md:grid-cols-3"><Input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder={t("purchases.search")} /><NativeSelect value={status} onChange={setStatus} items={purchaseStatuses.map((id) => ({ id, label: statusLabel(locale, id) }))} /><NativeSelect value={supplierFilter} onChange={setSupplierFilter} items={suppliers} /></div>
      {collection.loading ? <p className="py-8 text-center text-sm text-dtsc-muted">{t("common.loading")}</p> : collection.items.length ? <BusinessList ariaLabel={t("purchases.aria")}>{collection.items.map((item) => <BusinessListItem key={item.id} title={`${item.reference} · ${item.title}`} status={<StatusBadge tone={statusTone(item.status)}>{statusLabel(locale, item.status)}</StatusBadge>} meta={`${item.supplier?.displayName || item.supplier?.legalName || t("purchases.supplierPending")} · ${formatEnterpriseAmount(item.totalAmount, item.currency, locale)}`} description={`${t("purchases.itemsCount", { count: item._count.items })}${item.budgetLine ? ` · ${item.budgetLine.budget.reference} / ${item.budgetLine.name}` : ` · ${t("purchases.unbudgeted")}`}${item.expectedAt ? ` · ${t("purchases.expected", { date: formatEnterpriseDate(item.expectedAt, locale) })}` : ""}`} onOpen={() => void openDetail(item)} openLabel={t("purchases.openNamed", { reference: item.reference })} actions={<ContextActions label={t("purchases.actions")} actions={actionsFor(item)} />} />)}</BusinessList> : <EmptyState compact title={t("purchases.noPurchases")} description={collection.error || t("purchases.noMatch")} />}
      <div className="mt-3 flex justify-between border-t border-dtsc-border pt-3 text-sm text-dtsc-muted"><span>{t("common.page", { current: collection.pagination.page, total: collection.pagination.pageCount })}</span><div className="flex gap-2"><Button variant="outline" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>{t("common.previous")}</Button><Button variant="outline" disabled={page >= collection.pagination.pageCount} onClick={() => setPage((value) => value + 1)}>{t("common.next")}</Button></div></div>
    </ModuleSection>
    {legacyRecords.length ? <ModuleSection title={t("purchases.historical.title")} description={t("purchases.historical.description")}><BusinessList ariaLabel={t("purchases.historical.aria")}>{legacyRecords.map((item) => <BusinessListItem key={item.id} title={item.title} status={<StatusBadge>{t("purchases.historyBadge")}</StatusBadge>} description={item.description || statusLabel(locale, item.status)} />)}</BusinessList></ModuleSection> : null}

    <Dialog open={createOpen} onClose={() => setCreateOpen(false)} title={t("purchases.form.title")} className="h-[96dvh] max-w-5xl"><form onSubmit={createPurchase} className="grid gap-4"><Field label={t("purchases.form.subject")}><Input name="title" required /></Field><div className="grid gap-3 md:grid-cols-2"><Field label={t("purchases.form.sourceRequest")}><NativeSelect name="requestId" items={requests} /></Field><Field label={t("purchases.form.supplier")}><NativeSelect name="supplierId" items={suppliers} required /></Field><Field label={t("purchases.form.budgetLine")}><NativeSelect name="budgetLineId" items={budgetLines} /></Field><Field label={t("purchases.form.buyer")}><NativeSelect name="buyerUserId" items={members} /></Field><Field label={t("purchases.form.department")}><NativeSelect name="departmentId" items={departments} /></Field><Field label={t("purchases.form.priority")}><NativeSelect name="priority" defaultValue="NORMAL" items={priorityChoices(locale)} /></Field><Field label={t("purchases.form.currency")}><Input name="currency" defaultValue="USD" maxLength={3} /></Field><Field label={t("purchases.form.expectedDelivery")}><Input name="expectedAt" type="date" /></Field></div><Field label={t("purchases.form.description")}><textarea name="description" className="min-h-20 rounded-xl border border-dtsc-border bg-dtsc-surface p-3 text-sm" /></Field><div className="grid gap-3 border-y border-dtsc-border py-3"><div className="flex items-center justify-between"><strong>{t("purchases.form.items")}</strong><Button type="button" variant="outline" onClick={() => setDraftItems((items) => [...items, { description: "", quantity: "1", unit: "unit", unitPrice: "0", taxRate: "0" }])}><Plus className="h-4 w-4" />{t("purchases.form.line")}</Button></div>{draftItems.map((item, index) => <div key={index} className="grid gap-2 md:grid-cols-[2fr_0.7fr_0.8fr_1fr_0.7fr]"><Input value={item.description} onChange={(event) => setDraftItems((items) => items.map((entry, itemIndex) => itemIndex === index ? { ...entry, description: event.target.value } : entry))} placeholder={t("purchases.form.description")} required /><Input value={item.quantity} onChange={(event) => setDraftItems((items) => items.map((entry, itemIndex) => itemIndex === index ? { ...entry, quantity: event.target.value } : entry))} type="number" min="0.001" step="0.001" required /><Input value={item.unit} onChange={(event) => setDraftItems((items) => items.map((entry, itemIndex) => itemIndex === index ? { ...entry, unit: event.target.value } : entry))} placeholder={t("purchases.form.unit")} required /><Input value={item.unitPrice} onChange={(event) => setDraftItems((items) => items.map((entry, itemIndex) => itemIndex === index ? { ...entry, unitPrice: event.target.value } : entry))} type="number" min="0" step="0.01" required /><Input value={item.taxRate} onChange={(event) => setDraftItems((items) => items.map((entry, itemIndex) => itemIndex === index ? { ...entry, taxRate: event.target.value } : entry))} type="number" min="0" max="100" step="0.01" /></div>)}</div><Button className="bg-dtsc-blue text-white"><ShoppingCart className="h-4 w-4" />{t("purchases.form.createDraft")}</Button></form></Dialog>
    <Dialog open={Boolean(approvalTarget)} onClose={() => setApprovalTarget(null)} title={t("purchases.approval.title")} description={approvalTarget?.title}><form onSubmit={(event) => { event.preventDefault(); if (!approvalTarget) return; const approver = String(new FormData(event.currentTarget).get("approverUserId") || ""); void runAction(approvalTarget, "SUBMIT", approver); }} className="grid gap-4"><Field label={t("purchases.approval.designated")}><NativeSelect name="approverUserId" required items={members.filter((member) => member.id !== approvalTarget?.requestedByUserId)} /></Field><Button className="bg-dtsc-blue text-white">{t("purchases.approval.submit")}</Button></form></Dialog>
    <Dialog open={Boolean(receiveTarget)} onClose={() => setReceiveTarget(null)} title={t("purchases.receive.title")} description={receiveTarget?.reference} className="h-[90dvh] max-w-3xl"><form onSubmit={receive} className="grid gap-4">{receiveTarget?.items.map((item) => <Field key={item.id} label={t("purchases.receive.ordered", { description: item.description, quantity: item.quantity, unit: item.unit })}><Input name={`quantity_${item.id}`} type="number" min="0" max={String(item.quantity)} step="0.001" defaultValue="0" /></Field>)}<Field label={t("purchases.receive.notes")}><textarea name="notes" className="min-h-20 rounded-xl border border-dtsc-border bg-dtsc-surface p-3 text-sm" /></Field><Button className="bg-dtsc-blue text-white"><PackageCheck className="h-4 w-4" />{t("purchases.receive.save")}</Button></form></Dialog>
    <Dialog open={Boolean(detail)} onClose={() => setDetail(null)} title={detail?.purchase ? `${detail.purchase.reference} · ${detail.purchase.title}` : ""} className="h-[90dvh] max-w-4xl">{detail ? <div className="grid gap-4 text-sm"><div className="flex flex-wrap gap-2"><StatusBadge tone={statusTone(detail.purchase.status)}>{statusLabel(locale, detail.purchase.status)}</StatusBadge><StatusBadge>{formatEnterpriseAmount(detail.purchase.totalAmount, detail.purchase.currency, locale)}</StatusBadge>{detail.purchase.budgetLine ? <StatusBadge>{detail.purchase.budgetLine.budget.reference} · {detail.purchase.budgetLine.name}</StatusBadge> : <StatusBadge>{t("purchases.unbudgeted")}</StatusBadge>}</div><p className="text-dtsc-muted">{detail.purchase.description || t("common.noDescription")}</p><div className="border-y border-dtsc-border py-3"><strong>{t("purchases.detail.items")}</strong>{detail.purchase.items.map((item) => <p key={item.id} className="mt-2 text-dtsc-muted">{item.description} · {item.quantity} {item.unit} × {formatEnterpriseAmount(item.unitPrice, detail.purchase.currency, locale)} = {formatEnterpriseAmount(item.lineTotal, detail.purchase.currency, locale)}</p>)}</div><p>{t("purchases.detail.receipts")}: {detail.purchase.receipts.length}</p><p>{t("purchases.detail.approvals")}: {detail.approvals.map((approval) => statusLabel(locale, approval.status)).join(", ") || "—"}</p>{detail.events.length ? <div className="border-t border-dtsc-border pt-3"><strong>{t("purchases.detail.timeline")}</strong>{detail.events.slice(0, 8).map((event) => <p key={event.id} className="mt-1 text-dtsc-muted">{event.summary}</p>)}</div> : null}</div> : null}</Dialog>
  </div>;
}
