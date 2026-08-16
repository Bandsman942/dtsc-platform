"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { CheckCircle2, Eye, PackageCheck, Plus, RefreshCcw, Send, ShoppingCart, XCircle } from "lucide-react";
import { Field, NativeSelect } from "@/components/enterprise/core-v2/erp-v2-ui";
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
import {
  professionalErpDate,
  professionalErpEnumLabel,
  professionalErpMoney,
  professionalErpT,
  useProfessionalErpLocale,
} from "@/components/enterprise/professional/professional-erp-i18n";
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

type QuoteLine = {
  id: string;
  catalogItemId: string;
  description: string;
  quantity: string;
  unitPrice: string;
  discountRate: string;
  taxRate: string;
};

type Quote = {
  id: string;
  reference: string;
  title: string;
  description: string | null;
  businessPartyId: string;
  status: string;
  currency: string;
  subtotal: string | number;
  discountTotal: string | number;
  taxTotal: string | number;
  totalAmount: string | number;
  validUntil: string | null;
  revision: number;
  items: Array<{ id: string; description: string; quantity: string | number; unitPrice: string | number; lineTotal: string | number }>;
};

type SalesOrder = {
  id: string;
  reference: string;
  title: string;
  status: string;
  businessPartyId: string;
  currency: string;
  totalAmount: string | number;
  expectedFulfillmentAt: string | null;
  revision: number;
  items: Array<{ id: string; description: string; quantityOrdered: string | number; quantityFulfilled: string | number; quantityRemaining: string | number }>;
  fulfillments: Array<{ id: string; reference: string; status: string; createdAt: string }>;
};

type Party = { id: string; legalName: string; displayName: string | null; roles?: Array<{ roleCode: string }> };
type CatalogItem = { id: string; code: string; name: string; itemType: string; salesPrice: string | number | null; currency: string | null };
type Warehouse = { id: string; code: string; name: string };
type Lookups = { parties: Party[]; warehouses: Warehouse[] };

const QUOTE_STATUSES = ["DRAFT", "SENT", "ACCEPTED", "REJECTED", "EXPIRED", "CONVERTED", "CANCELLED"] as const;
const ORDER_STATUSES = ["DRAFT", "PENDING_APPROVAL", "CONFIRMED", "PARTIALLY_FULFILLED", "FULFILLED", "CLOSED", "CANCELLED"] as const;

function statusTone(status: string) {
  if (["ACCEPTED", "CONVERTED", "FULFILLED", "CLOSED"].includes(status)) return "success" as const;
  if (["SENT", "PENDING_APPROVAL", "CONFIRMED", "PARTIALLY_FULFILLED"].includes(status)) return "warning" as const;
  if (["REJECTED", "EXPIRED", "CANCELLED"].includes(status)) return "danger" as const;
  return "neutral" as const;
}

function newLine(index: number): QuoteLine {
  return { id: `line-${Date.now()}-${index}`, catalogItemId: "", description: "", quantity: "1", unitPrice: "0", discountRate: "0", taxRate: "0" };
}

export function EnterpriseSalesOperationsWorkspace({
  organizationId,
  organizationName,
  definition,
}: {
  organizationId: string;
  organizationName: string;
  definition: EnterpriseModuleDefinition;
}) {
  const locale = useProfessionalErpLocale();
  const t = (key: Parameters<typeof professionalErpT>[1], values?: Record<string, string | number>) => professionalErpT(locale, key, values);
  const statusLabel = (value: string) => professionalErpEnumLabel(locale, "status", value);
  const [tab, setTab] = useState("QUOTES");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [quoteDetail, setQuoteDetail] = useState<Quote | null>(null);
  const [orderDetail, setOrderDetail] = useState<SalesOrder | null>(null);
  const [fulfillTarget, setFulfillTarget] = useState<SalesOrder | null>(null);
  const [lines, setLines] = useState<QuoteLine[]>([newLine(0)]);
  const [lookups, setLookups] = useState<Lookups>({ parties: [], warehouses: [] });
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    void Promise.all([
      fetch(`/api/enterprise/${organizationId}/professional-lookups?module=SALES_QUOTES_ORDERS`, { cache: "no-store" }).then((response) => response.json()) as Promise<Lookups>,
      fetch(`/api/enterprise/${organizationId}/catalog-items?page=1&pageSize=200&status=ACTIVE`, { cache: "no-store" }).then(async (response) => response.ok ? response.json() : ({ items: [] })) as Promise<{ items?: CatalogItem[] }>,
    ]).then(([lookupBody, catalogBody]) => {
      if (!active) return;
      setLookups({ parties: lookupBody.parties || [], warehouses: lookupBody.warehouses || [] });
      setCatalogItems(catalogBody.items || []);
    }).catch(() => {
      if (active) setMessage(professionalErpT(locale, "sales.selectorsUnavailable"));
    });
    return () => { active = false; };
  }, [locale, organizationId, refreshKey]);

  const params = useMemo(() => {
    const value = new URLSearchParams({ page: String(page), pageSize: "25" });
    if (search.trim()) value.set("search", search.trim());
    if (status) value.set("status", status);
    return value;
  }, [page, search, status]);
  const quotes = useProfessionalCollection<Quote>({ endpoint: `/api/enterprise/${organizationId}/quotes`, params, refreshKey });
  const orders = useProfessionalCollection<SalesOrder>({ endpoint: `/api/enterprise/${organizationId}/sales-orders`, params, refreshKey });
  const activeCollection = tab === "QUOTES" ? quotes : orders;

  function updateLine(lineId: string, key: keyof QuoteLine, value: string) {
    setLines((current) => current.map((line) => {
      if (line.id !== lineId) return line;
      const next = { ...line, [key]: value };
      if (key === "catalogItemId") {
        const item = catalogItems.find((candidate) => candidate.id === value);
        if (item) {
          next.description = item.name;
          next.unitPrice = String(item.salesPrice || 0);
        }
      }
      return next;
    }));
  }

  async function createQuote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    const form = new FormData(event.currentTarget);
    try {
      await professionalMutation(`/api/enterprise/${organizationId}/quotes`, {
        businessPartyId: String(form.get("businessPartyId") || ""),
        title: String(form.get("title") || ""),
        description: String(form.get("description") || "") || null,
        currency: String(form.get("currency") || "USD"),
        validUntil: String(form.get("validUntil") || "") || null,
        ownerUserId: String(form.get("ownerUserId") || "") || null,
        terms: String(form.get("terms") || "") || null,
        items: lines.map((line) => ({
          catalogItemId: line.catalogItemId || null,
          description: line.description,
          quantity: Number(line.quantity),
          unitPrice: Number(line.unitPrice),
          discountRate: Number(line.discountRate),
          taxRate: Number(line.taxRate),
        })),
      });
      setCreateOpen(false);
      setLines([newLine(0)]);
      setRefreshKey((value) => value + 1);
      setMessage(t("sales.quoteSaved"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("sales.quoteCreateFailed"));
    }
  }

  async function transitionQuote(quote: Quote, targetStatus: string) {
    try {
      await professionalMutation(`/api/enterprise/${organizationId}/quotes/${quote.id}/transition`, { targetStatus, revision: quote.revision });
      setQuoteDetail(null);
      setRefreshKey((value) => value + 1);
      setMessage(t("sales.quoteUpdated"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("sales.quoteTransitionFailed"));
    }
  }

  async function convertQuote(quote: Quote) {
    try {
      await professionalMutation(`/api/enterprise/${organizationId}/quotes/${quote.id}/convert`, { revision: quote.revision });
      setQuoteDetail(null);
      setTab("ORDERS");
      setRefreshKey((value) => value + 1);
      setMessage(t("sales.quoteConverted"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("sales.quoteConversionFailed"));
    }
  }

  async function fulfillOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!fulfillTarget) return;
    const form = new FormData(event.currentTarget);
    const items = fulfillTarget.items.map((item) => ({
      salesOrderItemId: item.id,
      quantityFulfilled: Number(form.get(`quantity_${item.id}`) || 0),
      notes: String(form.get(`notes_${item.id}`) || "") || null,
    })).filter((item) => item.quantityFulfilled > 0);
    try {
      await professionalMutation(`/api/enterprise/${organizationId}/sales-orders/${fulfillTarget.id}/fulfill`, {
        fulfillmentType: "PRODUCT_DELIVERY",
        warehouseId: String(form.get("warehouseId") || "") || null,
        acceptedByCustomer: form.get("acceptedByCustomer") === "on",
        acceptanceNotes: String(form.get("acceptanceNotes") || "") || null,
        idempotencyKey: crypto.randomUUID(),
        notes: String(form.get("notes") || "") || null,
        revision: fulfillTarget.revision,
        items,
      });
      setFulfillTarget(null);
      setRefreshKey((value) => value + 1);
      setMessage(t("sales.fulfillmentSaved"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("sales.fulfillmentFailed"));
    }
  }

  function quoteActions(quote: Quote): BusinessContextAction[] {
    return [
      { id: "open", label: t("sales.open"), icon: Eye, onSelect: () => setQuoteDetail(quote) },
      ...(quote.status === "DRAFT" ? [{ id: "send", label: t("sales.send"), icon: Send, onSelect: () => void transitionQuote(quote, "SENT") }] : []),
      ...(quote.status === "SENT" ? [
        { id: "accept", label: t("sales.markAccepted"), icon: CheckCircle2, onSelect: () => void transitionQuote(quote, "ACCEPTED") },
        { id: "reject", label: t("sales.markRejected"), icon: XCircle, destructive: true, onSelect: () => void transitionQuote(quote, "REJECTED") },
      ] : []),
      ...(quote.status === "ACCEPTED" ? [{ id: "convert", label: t("sales.convertOrder"), icon: ShoppingCart, onSelect: () => void convertQuote(quote) }] : []),
      ...(["DRAFT", "SENT", "ACCEPTED"].includes(quote.status) ? [{ id: "cancel", label: t("sales.cancel"), icon: XCircle, destructive: true, separatorBefore: true, onSelect: () => void transitionQuote(quote, "CANCELLED") }] : []),
    ];
  }

  function orderActions(order: SalesOrder): BusinessContextAction[] {
    return [
      { id: "open", label: t("sales.open"), icon: Eye, onSelect: () => setOrderDetail(order) },
      ...(["CONFIRMED", "PARTIALLY_FULFILLED"].includes(order.status) ? [{ id: "fulfill", label: t("sales.recordDelivery"), icon: PackageCheck, onSelect: () => setFulfillTarget(order) }] : []),
    ];
  }

  const statusItems = (tab === "QUOTES" ? QUOTE_STATUSES : ORDER_STATUSES).map((id) => ({ id, label: statusLabel(id) }));

  return (
    <ModuleWorkspace>
      <ModuleHeader
        eyebrow={t("sales.eyebrow", { organization: organizationName })}
        title={t("sales.title")}
        description={`${locale === "en" ? definition.descriptionEn : definition.descriptionFr} ${t("sales.descriptionSuffix")}`}
        count={t("sales.count", { quotes: quotes.pagination.total, orders: orders.pagination.total })}
        primaryAction={quotes.canManage ? <Button onClick={() => setCreateOpen(true)} className="bg-dtsc-blue text-white"><Plus className="h-4 w-4" />{t("sales.newQuote")}</Button> : undefined}
      />
      <ModuleMetrics label={t("sales.metrics")}>
        <ModuleMetric label={t("sales.metricDraftQuotes")} value={quotes.metrics.draft || 0} />
        <ModuleMetric label={t("sales.metricSentQuotes")} value={quotes.metrics.sent || 0} />
        <ModuleMetric label={t("sales.metricAcceptedQuotes")} value={quotes.metrics.accepted || 0} />
        <ModuleMetric label={t("sales.metricConfirmedOrders")} value={orders.metrics.confirmed || 0} />
        <ModuleMetric label={t("sales.metricPartial")} value={orders.metrics.partial || 0} />
      </ModuleMetrics>
      <ModuleToolbar
        search={<ProfessionalSearch value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder={t("sales.search")} />}
        controls={<><ProfessionalTabs value={tab} onChange={(value) => { setTab(value); setStatus(""); setPage(1); }} items={[{ id: "QUOTES", label: t("sales.quotes"), count: quotes.pagination.total }, { id: "ORDERS", label: t("sales.orders"), count: orders.pagination.total }]} /><NativeSelect value={status} onChange={(value) => { setStatus(value); setPage(1); }} items={[{ id: "", label: t("sales.allStatuses") }, ...statusItems]} /></>}
        summary={t("sales.toolbarSummary")}
      />
      <ModuleContent>
        {message ? <div role="status" className="rounded-xl border border-dtsc-border bg-dtsc-page px-4 py-3 text-sm font-semibold text-dtsc-ink">{message}</div> : null}
        <ModuleSection title={tab === "QUOTES" ? t("sales.quotesTitle") : t("sales.ordersTitle")} description={tab === "QUOTES" ? t("sales.quotesDescription") : t("sales.ordersDescription")}>
          {activeCollection.error ? <ProfessionalError message={activeCollection.error} /> : activeCollection.loading ? <ProfessionalLoading /> : tab === "QUOTES" ? (
            quotes.items.length ? <BusinessList ariaLabel={t("sales.quotesAria")}>{quotes.items.map((quote) => { const lineSuffix = locale === "en" ? (quote.items.length === 1 ? "" : "s") : (quote.items.length > 1 ? "s" : ""); return <BusinessListItem key={quote.id} title={`${quote.reference} · ${quote.title}`} status={<StatusBadge tone={statusTone(quote.status)}>{statusLabel(quote.status)}</StatusBadge>} meta={`${professionalErpMoney(quote.totalAmount, quote.currency, locale)}${quote.validUntil ? ` · ${t("sales.validUntil", { date: professionalErpDate(quote.validUntil, locale) })}` : ""}`} description={`${t("sales.lines", { count: quote.items.length, suffix: lineSuffix })} · ${t("sales.discounts", { amount: professionalErpMoney(quote.discountTotal, quote.currency, locale) })} · ${t("sales.taxes", { amount: professionalErpMoney(quote.taxTotal, quote.currency, locale) })}`} onOpen={() => setQuoteDetail(quote)} openLabel={t("sales.openQuote", { reference: quote.reference })} actions={<ContextActions label={t("sales.quoteActions")} actions={quoteActions(quote)} />} />; })}</BusinessList> : <EmptyState compact title={t("sales.noQuote")} description={t("sales.noQuoteHelp")} />
          ) : orders.items.length ? <BusinessList ariaLabel={t("sales.ordersAria")}>{orders.items.map((order) => { const lineSuffix = locale === "en" ? (order.items.length === 1 ? "" : "s") : (order.items.length > 1 ? "s" : ""); const deliverySuffix = locale === "en" ? (order.fulfillments.length === 1 ? "y" : "ies") : (order.fulfillments.length > 1 ? "s" : ""); return <BusinessListItem key={order.id} title={`${order.reference} · ${order.title}`} status={<StatusBadge tone={statusTone(order.status)}>{statusLabel(order.status)}</StatusBadge>} meta={`${professionalErpMoney(order.totalAmount, order.currency, locale)} · ${t("sales.lines", { count: order.items.length, suffix: lineSuffix })}`} description={t("sales.deliveries", { count: order.fulfillments.length, suffix: deliverySuffix })} onOpen={() => setOrderDetail(order)} openLabel={t("sales.openOrder", { reference: order.reference })} actions={<ContextActions label={t("sales.orderActions")} actions={orderActions(order)} />} />; })}</BusinessList> : <EmptyState compact title={t("sales.noOrder")} description={t("sales.noOrderHelp")} />}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-dtsc-border pt-3 text-sm text-dtsc-muted"><span>{t("sales.page", { page: activeCollection.pagination.page, pageCount: activeCollection.pagination.pageCount })}</span><div className="flex gap-2"><Button variant="outline" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>{t("common.previous")}</Button><Button variant="outline" disabled={page >= activeCollection.pagination.pageCount} onClick={() => setPage((value) => value + 1)}>{t("common.next")}</Button></div></div>
        </ModuleSection>
        <ProfessionalHelp moduleCode="SALES_QUOTES_ORDERS" />
      </ModuleContent>

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} title={t("sales.newQuote")} description={t("sales.newQuoteDescription")} className="h-[96dvh] max-w-5xl">
        <form onSubmit={createQuote} className="grid gap-6">
          <ProfessionalFormSection title={t("sales.customerTerms")}>
            <Field label={t("sales.customerOrProspect")}><NativeSelect name="businessPartyId" required items={[{ id: "", label: t("sales.selectParty") }, ...lookups.parties.map((party) => ({ id: party.id, label: party.displayName || party.legalName }))]} /></Field>
            <Field label={t("sales.quoteTitle")}><Input name="title" required /></Field>
            <Field label={t("sales.currency")}><Input name="currency" defaultValue="USD" maxLength={3} required /></Field>
            <Field label={t("sales.validity")}><Input name="validUntil" type="date" /></Field>
            <Field label={t("sales.description")}><textarea name="description" rows={3} className="w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-base" /></Field>
            <Field label={t("sales.terms")}><textarea name="terms" rows={3} className="w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-base" /></Field>
          </ProfessionalFormSection>
          <ProfessionalFormSection title={t("sales.productsServices")} description={t("sales.productsServicesHelp")}>
            <div className="md:col-span-2 grid gap-4">
              {lines.map((line, index) => <div key={line.id} className="grid gap-3 rounded-2xl border border-dtsc-border p-3 md:grid-cols-6"><div className="md:col-span-2"><Field label={t("sales.item", { index: index + 1 })}><NativeSelect value={line.catalogItemId} onChange={(value) => updateLine(line.id, "catalogItemId", value)} items={[{ id: "", label: t("sales.freeDescription") }, ...catalogItems.map((item) => ({ id: item.id, label: `${item.code} · ${item.name}` }))]} /></Field></div><div className="md:col-span-2"><Field label={t("sales.description")}><Input value={line.description} onChange={(event) => updateLine(line.id, "description", event.target.value)} required /></Field></div><Field label={t("sales.quantity")}><Input type="number" min="0.01" step="0.01" value={line.quantity} onChange={(event) => updateLine(line.id, "quantity", event.target.value)} required /></Field><Field label={t("sales.unitPrice")}><Input type="number" min="0" step="0.01" value={line.unitPrice} onChange={(event) => updateLine(line.id, "unitPrice", event.target.value)} required /></Field><Field label={t("sales.discount")}><Input type="number" min="0" max="100" step="0.01" value={line.discountRate} onChange={(event) => updateLine(line.id, "discountRate", event.target.value)} /></Field><Field label={t("sales.tax")}><Input type="number" min="0" max="100" step="0.01" value={line.taxRate} onChange={(event) => updateLine(line.id, "taxRate", event.target.value)} /></Field>{lines.length > 1 ? <div className="md:col-span-2 flex items-end"><Button type="button" variant="outline" onClick={() => setLines((current) => current.filter((candidate) => candidate.id !== line.id))}>{t("sales.removeLine")}</Button></div> : null}</div>)}
              <Button type="button" variant="outline" onClick={() => setLines((current) => [...current, newLine(current.length)])}><Plus className="h-4 w-4" />{t("sales.addLine")}</Button>
            </div>
          </ProfessionalFormSection>
          <div className="sticky bottom-0 flex justify-end gap-2 border-t border-dtsc-border bg-dtsc-surface py-3"><Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>{t("common.cancel")}</Button><Button type="submit">{t("sales.saveDraft")}</Button></div>
        </form>
      </Dialog>

      <Dialog open={Boolean(quoteDetail)} onClose={() => setQuoteDetail(null)} title={quoteDetail ? `${quoteDetail.reference} · ${quoteDetail.title}` : t("sales.quoteDetail")} className="h-[92dvh] max-w-4xl">
        {quoteDetail ? <div className="grid gap-5"><div className="flex flex-wrap gap-2"><StatusBadge tone={statusTone(quoteDetail.status)}>{statusLabel(quoteDetail.status)}</StatusBadge><StatusBadge>{professionalErpMoney(quoteDetail.totalAmount, quoteDetail.currency, locale)}</StatusBadge></div><BusinessList ariaLabel={t("sales.quoteLines")}>{quoteDetail.items.map((item) => <BusinessListItem key={item.id} title={item.description} meta={`${item.quantity} × ${professionalErpMoney(item.unitPrice, quoteDetail.currency, locale)}`} status={<StatusBadge>{professionalErpMoney(item.lineTotal, quoteDetail.currency, locale)}</StatusBadge>} />)}</BusinessList><div data-responsive-actions>{quoteActions(quoteDetail).filter((action) => action.id !== "open").map((action) => <Button key={action.id} type="button" variant={action.destructive ? "outline" : "default"} onClick={() => action.onSelect?.()}>{action.label}</Button>)}</div></div> : null}
      </Dialog>

      <Dialog open={Boolean(orderDetail)} onClose={() => setOrderDetail(null)} title={orderDetail ? `${orderDetail.reference} · ${orderDetail.title}` : t("sales.orderDetail")} className="h-[92dvh] max-w-4xl">
        {orderDetail ? <div className="grid gap-5"><div className="flex flex-wrap gap-2"><StatusBadge tone={statusTone(orderDetail.status)}>{statusLabel(orderDetail.status)}</StatusBadge><StatusBadge>{professionalErpMoney(orderDetail.totalAmount, orderDetail.currency, locale)}</StatusBadge></div><BusinessList ariaLabel={t("sales.orderQuantities")}>{orderDetail.items.map((item) => <BusinessListItem key={item.id} title={item.description} meta={t("sales.orderedDelivered", { ordered: item.quantityOrdered, fulfilled: item.quantityFulfilled })} status={<StatusBadge tone={Number(item.quantityRemaining) > 0 ? "warning" : "success"}>{t("sales.remaining", { remaining: item.quantityRemaining })}</StatusBadge>} />)}</BusinessList>{["CONFIRMED", "PARTIALLY_FULFILLED"].includes(orderDetail.status) ? <Button onClick={() => { setFulfillTarget(orderDetail); setOrderDetail(null); }}><PackageCheck className="h-4 w-4" />{t("sales.recordDelivery")}</Button> : null}</div> : null}
      </Dialog>

      <Dialog open={Boolean(fulfillTarget)} onClose={() => setFulfillTarget(null)} title={fulfillTarget ? t("sales.deliver", { reference: fulfillTarget.reference }) : t("sales.newDelivery")} description={t("sales.deliveryDescription")} className="h-[94dvh] max-w-4xl">
        {fulfillTarget ? <form onSubmit={fulfillOrder} className="grid gap-5"><ProfessionalFormSection title={t("sales.originReceipt")}><Field label={t("sales.warehouse")}><NativeSelect name="warehouseId" items={[{ id: "", label: t("sales.noWarehouseService") }, ...lookups.warehouses.map((warehouse) => ({ id: warehouse.id, label: `${warehouse.code} · ${warehouse.name}` }))]} /></Field><Field label={t("sales.idempotentReference")}><Input value={t("sales.generatedAutomatically")} disabled /></Field></ProfessionalFormSection><ProfessionalFormSection title={t("sales.deliveredQuantities")}><div className="md:col-span-2 grid gap-3">{fulfillTarget.items.map((item) => <div key={item.id} className="grid gap-3 rounded-xl border border-dtsc-border p-3 md:grid-cols-3"><div className="md:col-span-2"><p className="font-black text-dtsc-ink">{item.description}</p><p className="text-sm text-dtsc-muted">{t("sales.remainder", { remaining: item.quantityRemaining })}</p></div><Field label={t("sales.deliveredQuantity")}><Input name={`quantity_${item.id}`} type="number" min="0" max={Number(item.quantityRemaining)} step="0.01" defaultValue="0" /></Field></div>)}</div></ProfessionalFormSection><ProfessionalFormSection title={t("sales.proofConfirmation")}><Field label={t("sales.notes")}><textarea name="notes" rows={3} className="w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-base" /></Field><Field label={t("sales.customerConfirmation")}><label className="mt-3 flex min-h-11 items-center gap-2"><input name="acceptedByCustomer" type="checkbox" />{t("sales.recipientConfirms")}</label></Field><Field label={t("sales.recipientNotes")}><Input name="acceptanceNotes" /></Field></ProfessionalFormSection><div className="sticky bottom-0 flex justify-end gap-2 border-t border-dtsc-border bg-dtsc-surface py-3"><Button type="button" variant="outline" onClick={() => setFulfillTarget(null)}>{t("common.cancel")}</Button><Button type="submit"><RefreshCcw className="h-4 w-4" />{t("sales.saveDelivery")}</Button></div></form> : null}
      </Dialog>
    </ModuleWorkspace>
  );
}
