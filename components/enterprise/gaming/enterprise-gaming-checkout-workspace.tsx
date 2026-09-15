"use client";

import { useMemo, useState, type FormEvent } from "react";
import { CreditCard, Plus, ReceiptText, RotateCcw, X } from "lucide-react";
import { Field, NativeSelect, formatEnterpriseAmount, formatEnterpriseDate } from "@/components/enterprise/core-v2/erp-v2-ui";
import { gamingCheckoutCopy } from "@/components/enterprise/gaming/gaming-checkout-i18n";
import { ProfessionalError, ProfessionalLoading, ProfessionalSearch, ProfessionalTabs, professionalMutation, useProfessionalCollection } from "@/components/enterprise/professional/professional-erp-ui";
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

type CheckoutStatus = "INVOICE_PENDING" | "AWAITING_PAYMENT" | "PARTIALLY_PAID" | "PAID" | "REFUND_PENDING" | "REFUNDED" | "CANCELLED";
type PaymentMethod = "CASH" | "BANK_TRANSFER" | "CARD" | "MOBILE_MONEY" | "CHEQUE" | "OTHER";
type Pagination = { page: number; pageSize: number; total: number; pageCount: number };
type SessionOption = { id: string; reference: string; status: string; currency: string | null; finalAmount: string | null; station: { stationCode: string; displayName: string | null } };
type Candidate = { userId: string; name: string; positionTitle: string | null; email: string };
type Account = { id: string; code: string; name: string; accountType: string; currencyCode: string; status: string; siteId: string | null };
type Product = { id: string; code: string; name: string; trackInventory: boolean; prices?: Array<{ amount: string; currency: string; status: string }> };
type Warehouse = { id: string; code: string; name: string; siteId: string; storageLocations: Array<{ id: string; code: string; name: string; status: string }> };
type CheckoutItem = {
  id: string;
  reference: string;
  sessionId: string;
  salesInvoiceId: string;
  status: CheckoutStatus;
  revision: number;
  createdAt: string;
  session: { reference: string; currency: string | null; finalAmount: string | null; station: { stationCode: string; displayName: string | null } };
  invoice: { number: string; status: string; currencyCode: string; grandTotal: string; outstandingAmount: string; receivable?: { outstandingAmount: string } | null } | null;
};
type InvoiceLine = { id: string; description: string; quantity: string; unitPrice: string; taxAmount: string; totalAmount: string };
type Payment = { id: string; number: string; status: string; direction: string; paymentType: string; methodType: string; amount: string; currencyCode: string; financialAccountId: string | null; paymentDate: string; maskedExternalReference: string | null };
type CheckoutDetail = {
  checkout: CheckoutItem & { refundReason?: string | null };
  invoice: CheckoutItem["invoice"] & { id: string; items: InvoiceLine[]; receivable: { id: string; outstandingAmount: string; paymentAllocations: unknown[] } | null; creditNotes: Array<{ id: string; number: string; status: string; grandTotal: string }> };
  payments: Payment[];
  canWrite?: boolean;
  canManage?: boolean;
};
type Receipt = {
  receiptReference: string;
  status: string;
  session: { reference: string; stationCode: string; stationName: string | null; startedAt: string | null; endedAt: string | null; currency: string | null; finalAmount: string | null };
  invoice: { number: string; currencyCode: string; subtotal: string; taxTotal: string; grandTotal: string; outstandingAmount: string; items: InvoiceLine[] };
  payments: Array<{ paymentId: string; paymentNumber: string; methodType: string; amount: string; currencyCode: string; paymentDate: string }>;
  refunds: Array<{ paymentId: string; paymentNumber: string; methodType: string; amount: string; currencyCode: string; paymentDate: string }>;
  creditNotes: Array<{ id: string; number: string; status: string; grandTotal: string }>;
  totals: { paidAmount: string; refundedAmount: string };
};
type LookupState = { sessions: SessionOption[]; invoiceApprovers: Candidate[]; paymentApprovers: Candidate[]; accounts: Account[]; products: Product[]; warehouses: Warehouse[] };
type Filter = "ALL" | CheckoutStatus;
type Modal = "create" | "payment" | "refund" | "cancel" | "approveRefund" | null;

const methods: PaymentMethod[] = ["CASH", "MOBILE_MONEY", "CARD", "BANK_TRANSFER", "CHEQUE", "OTHER"];

function tone(status: CheckoutStatus): StatusBadgeTone {
  if (status === "PAID") return "success";
  if (status === "CANCELLED") return "danger";
  if (status === "REFUNDED") return "neutral";
  if (status === "PARTIALLY_PAID" || status === "REFUND_PENDING" || status === "INVOICE_PENDING") return "warning";
  return "info";
}

function statusLabel(status: CheckoutStatus, copy: ReturnType<typeof gamingCheckoutCopy>) {
  return {
    INVOICE_PENDING: copy.invoicePending,
    AWAITING_PAYMENT: copy.awaitingPayment,
    PARTIALLY_PAID: copy.partiallyPaid,
    PAID: copy.paid,
    REFUND_PENDING: copy.refundPending,
    REFUNDED: copy.refunded,
    CANCELLED: copy.cancelled,
  }[status];
}

async function json<T>(url: string) {
  const response = await fetch(url, { cache: "no-store" });
  const body = await response.json().catch(() => null) as (T & { message?: string; error?: string }) | null;
  if (!response.ok || !body) throw new Error(body?.message || body?.error || "LOAD_FAILED");
  return body;
}

export function EnterpriseGamingCheckoutWorkspace({ organizationId, organizationName, definition }: { organizationId: string; organizationName: string; definition: EnterpriseModuleDefinition }) {
  const locale = useAppLocale();
  const copy = gamingCheckoutCopy(locale);
  const [filter, setFilter] = useState<Filter>("ALL");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [detail, setDetail] = useState<CheckoutDetail | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState("");
  const [lookups, setLookups] = useState<LookupState | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [extras, setExtras] = useState<Array<{ catalogItemId: string; quantity: number }>>([]);

  useToastMessage(message, "error");
  useToastMessage(success, "success");

  const params = useMemo(() => {
    const value = new URLSearchParams({ page: String(page), pageSize: "20" });
    if (search.trim()) value.set("search", search.trim());
    if (filter !== "ALL") value.set("status", filter);
    return value;
  }, [filter, page, search]);
  const collection = useProfessionalCollection<CheckoutItem>({ endpoint: `/api/enterprise/${organizationId}/gaming/checkouts`, params, refreshKey });

  async function loadLookups() {
    if (lookups) return lookups;
    setLookupLoading(true);
    try {
      const [toCheckout, ended, invoiceCandidates, paymentCandidates, accounts, products, warehouses] = await Promise.all([
        json<{ items: SessionOption[] }>(`/api/enterprise/${organizationId}/gaming/sessions?page=1&pageSize=50&status=TO_CHECKOUT`),
        json<{ items: SessionOption[] }>(`/api/enterprise/${organizationId}/gaming/sessions?page=1&pageSize=50&status=ENDED`),
        json<{ candidates: Candidate[] }>(`/api/enterprise/${organizationId}/approval-candidates?moduleCode=FINANCE_RECEIVABLES`),
        json<{ candidates: Candidate[] }>(`/api/enterprise/${organizationId}/approval-candidates?moduleCode=FINANCE_PAYMENTS`),
        json<{ items: Account[] }>(`/api/enterprise/${organizationId}/financial-accounts?page=1&pageSize=100&status=ACTIVE`),
        json<{ items: Product[] }>(`/api/enterprise/${organizationId}/catalog?page=1&pageSize=50&itemType=PRODUCT&status=ACTIVE`),
        json<{ items: Warehouse[] }>(`/api/enterprise/${organizationId}/warehouses?page=1&pageSize=50&status=ACTIVE`),
      ]);
      const state = {
        sessions: [...toCheckout.items, ...ended.items].filter((item, index, values) => values.findIndex((candidate) => candidate.id === item.id) === index && Boolean(item.finalAmount && item.currency)),
        invoiceApprovers: invoiceCandidates.candidates,
        paymentApprovers: paymentCandidates.candidates,
        accounts: accounts.items,
        products: products.items,
        warehouses: warehouses.items,
      };
      setLookups(state);
      return state;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : copy.loadLookupsFailed);
      return null;
    } finally {
      setLookupLoading(false);
    }
  }

  async function openCreate() { setMessage(""); await loadLookups(); setExtras([]); setModal("create"); }
  async function openAction(next: Exclude<Modal, "create" | null>) { setMessage(""); await loadLookups(); setModal(next); }

  async function openDetail(item: CheckoutItem) {
    setBusy(true);
    setMessage("");
    try {
      setDetail(await json<CheckoutDetail>(`/api/enterprise/${organizationId}/gaming/checkouts/${item.id}`));
    } catch (error) { setMessage(error instanceof Error ? error.message : copy.actionFailed); }
    finally { setBusy(false); }
  }

  async function refreshDetail(checkoutId?: string) {
    setRefreshKey((value) => value + 1);
    if (checkoutId || detail?.checkout.id) {
      const id = checkoutId || detail!.checkout.id;
      setDetail(await json<CheckoutDetail>(`/api/enterprise/${organizationId}/gaming/checkouts/${id}`));
    }
  }

  async function mutate(payload: unknown) {
    if (!detail) return;
    setBusy(true); setMessage(""); setSuccess("");
    try {
      await professionalMutation(`/api/enterprise/${organizationId}/gaming/checkouts/${detail.checkout.id}`, payload, "PATCH");
      await refreshDetail();
      setSuccess(copy.actionDone);
      setModal(null);
    } catch (error) { setMessage(error instanceof Error ? error.message : copy.actionFailed); }
    finally { setBusy(false); }
  }

  async function createCheckout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true); setMessage(""); setSuccess("");
    try {
      const body = await professionalMutation(`/api/enterprise/${organizationId}/gaming/checkouts`, {
        sessionId: String(form.get("sessionId") || ""),
        invoiceApproverUserId: String(form.get("invoiceApproverUserId") || ""),
        warehouseId: String(form.get("warehouseId") || "") || null,
        storageLocationId: String(form.get("storageLocationId") || "") || null,
        idempotencyKey: `gaming-checkout:${crypto.randomUUID()}`,
        extraItems: extras.filter((item) => item.catalogItemId && item.quantity > 0),
      });
      const checkout = (body as { checkout?: CheckoutItem }).checkout;
      setModal(null); setExtras([]); setSuccess(copy.actionDone); setRefreshKey((value) => value + 1);
      if (checkout) await openDetail(checkout);
    } catch (error) { setMessage(error instanceof Error ? error.message : copy.actionFailed); }
    finally { setBusy(false); }
  }

  async function paymentSubmit(event: FormEvent<HTMLFormElement>, refund = false) {
    event.preventDefault();
    if (!detail) return;
    const form = new FormData(event.currentTarget);
    const payload = refund ? {
      action: "REQUEST_REFUND",
      revision: detail.checkout.revision,
      reason: String(form.get("reason") || ""),
      methodType: String(form.get("methodType") || ""),
      financialAccountId: String(form.get("financialAccountId") || ""),
      refundApproverUserId: String(form.get("approverUserId") || ""),
      reference: String(form.get("reference") || "") || null,
      maskedExternalReference: String(form.get("reference") || "") || null,
      idempotencyKey: `gaming-refund:${crypto.randomUUID()}`,
    } : {
      action: "ADD_PAYMENT",
      revision: detail.checkout.revision,
      paymentApproverUserId: String(form.get("approverUserId") || ""),
      methodType: String(form.get("methodType") || ""),
      financialAccountId: String(form.get("financialAccountId") || ""),
      amount: Number(form.get("amount") || 0),
      reference: String(form.get("reference") || "") || null,
      maskedExternalReference: String(form.get("reference") || "") || null,
      idempotencyKey: `gaming-payment:${crypto.randomUUID()}`,
    };
    await mutate(payload);
  }

  async function reasonSubmit(event: FormEvent<HTMLFormElement>, action: "CANCEL" | "APPROVE_REFUND") {
    event.preventDefault();
    if (!detail) return;
    const form = new FormData(event.currentTarget);
    await mutate({ action, revision: detail.checkout.revision, reason: String(form.get("reason") || "") });
  }

  async function loadReceipt() {
    if (!detail) return;
    setBusy(true); setMessage("");
    try {
      const body = await json<{ receipt: Receipt }>(`/api/enterprise/${organizationId}/gaming/checkouts/${detail.checkout.id}/receipt`);
      setReceipt(body.receipt);
    } catch (error) { setMessage(error instanceof Error ? error.message : copy.actionFailed); }
    finally { setBusy(false); }
  }

  const labels = { CASH: "Cash", MOBILE_MONEY: "Mobile Money", CARD: "Card", BANK_TRANSFER: "Bank transfer", CHEQUE: "Cheque", OTHER: "Other" } as const;
  const activeInvoiceCurrency = detail?.invoice?.currencyCode || "";
  const compatibleAccounts = (lookups?.accounts || []).filter((account) => !activeInvoiceCurrency || account.currencyCode === activeInvoiceCurrency);
  const selectedWarehouseId = typeof document !== "undefined" ? undefined : undefined;
  void selectedWarehouseId;

  return (
    <ModuleWorkspace>
      <ModuleHeader eyebrow={copy.eyebrow} title={copy.title} description={`${copy.description} · ${organizationName}`} count={collection.pagination.total} primaryAction={collection.canWrite ? <Button onClick={() => void openCreate()}><Plus className="h-4 w-4" />{copy.newCheckout}</Button> : undefined} />
      <ModuleMetrics>
        <ModuleMetric label={copy.invoicePending} value={collection.metrics.INVOICE_PENDING || 0} />
        <ModuleMetric label={copy.awaitingPayment} value={(collection.metrics.AWAITING_PAYMENT || 0) + (collection.metrics.PARTIALLY_PAID || 0)} />
        <ModuleMetric label={copy.paid} value={collection.metrics.PAID || 0} />
        <ModuleMetric label={copy.refundPending} value={collection.metrics.REFUND_PENDING || 0} />
      </ModuleMetrics>
      <ModuleToolbar search={<ProfessionalSearch value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder={copy.search} />} controls={<ProfessionalTabs value={filter} onChange={(value) => { setFilter(value); setPage(1); }} items={[
        { id: "ALL", label: copy.all }, { id: "INVOICE_PENDING", label: copy.invoicePending }, { id: "AWAITING_PAYMENT", label: copy.awaitingPayment }, { id: "PARTIALLY_PAID", label: copy.partiallyPaid }, { id: "PAID", label: copy.paid }, { id: "REFUND_PENDING", label: copy.refundPending }, { id: "REFUNDED", label: copy.refunded },
      ]} />} summary={`${copy.page} ${collection.pagination.page}/${collection.pagination.pageCount}`} />
      <ModuleContent>
        <ModuleSection title={copy.title} description={definition.descriptionFr} count={collection.pagination.total} defaultOpen>
          {collection.error ? <ProfessionalError message={collection.error} /> : collection.loading ? <ProfessionalLoading /> : collection.items.length === 0 ? <EmptyState title={copy.empty} /> : <BusinessList>{collection.items.map((item) => <BusinessListItem key={item.id} title={item.reference} status={<StatusBadge tone={tone(item.status)}>{statusLabel(item.status, copy)}</StatusBadge>} meta={`${copy.session}: ${item.session.reference} · ${copy.station}: ${item.session.station.displayName || item.session.station.stationCode}`} description={item.invoice ? `${item.invoice.number} · ${formatEnterpriseAmount(item.invoice.grandTotal, item.invoice.currencyCode, locale)} · ${copy.outstanding}: ${formatEnterpriseAmount(item.invoice.outstandingAmount, item.invoice.currencyCode, locale)}` : undefined} onOpen={() => void openDetail(item)} openLabel={`${copy.detail} ${item.reference}`} />)}</BusinessList>}
          <div className="mt-4 flex justify-end gap-2"><Button variant="outline" disabled={page <= 1 || collection.loading} onClick={() => setPage((value) => Math.max(1, value - 1))}>{copy.previous}</Button><Button variant="outline" disabled={page >= collection.pagination.pageCount || collection.loading} onClick={() => setPage((value) => value + 1)}>{copy.next}</Button></div>
        </ModuleSection>
      </ModuleContent>

      <FullscreenEntityDetail open={Boolean(detail)} onClose={() => setDetail(null)} title={detail?.checkout.reference || copy.detail} description={detail ? `${detail.checkout.session.reference} · ${detail.invoice?.number || ""}` : undefined}>
        {detail ? <div className="grid gap-5">
          <div className="flex flex-wrap items-center gap-2"><StatusBadge tone={tone(detail.checkout.status)}>{statusLabel(detail.checkout.status, copy)}</StatusBadge><span className="text-sm text-dtsc-muted">{formatEnterpriseDate(detail.checkout.createdAt, locale)}</span></div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div><p className="text-xs font-black uppercase text-dtsc-muted">{copy.session}</p><p className="font-bold">{detail.checkout.session.reference}</p></div>
            <div><p className="text-xs font-black uppercase text-dtsc-muted">{copy.station}</p><p className="font-bold">{detail.checkout.session.station.displayName || detail.checkout.session.station.stationCode}</p></div>
            <div><p className="text-xs font-black uppercase text-dtsc-muted">{copy.invoice}</p><p className="font-bold">{detail.invoice?.number}</p></div>
            <div><p className="text-xs font-black uppercase text-dtsc-muted">{copy.total}</p><p className="font-bold">{detail.invoice ? formatEnterpriseAmount(detail.invoice.grandTotal, detail.invoice.currencyCode, locale) : "—"}</p></div>
          </div>
          <div className="flex flex-wrap gap-2">
            {detail.checkout.status === "INVOICE_PENDING" && detail.canManage ? <Button onClick={() => void mutate({ action: "APPROVE_INVOICE", revision: detail.checkout.revision })}>{copy.approveInvoice}</Button> : null}
            {["AWAITING_PAYMENT", "PARTIALLY_PAID"].includes(detail.checkout.status) && detail.canWrite ? <Button onClick={() => void openAction("payment")}><CreditCard className="h-4 w-4" />{copy.addPayment}</Button> : null}
            {detail.checkout.status === "PAID" ? <Button variant="outline" onClick={() => void loadReceipt()}><ReceiptText className="h-4 w-4" />{copy.receipt}</Button> : null}
            {detail.checkout.status === "PAID" && detail.canManage ? <Button variant="outline" onClick={() => void openAction("refund")}><RotateCcw className="h-4 w-4" />{copy.requestRefund}</Button> : null}
            {detail.checkout.status === "REFUND_PENDING" && detail.canManage ? <Button onClick={() => void openAction("approveRefund")}>{copy.approveRefund}</Button> : null}
            {detail.checkout.status === "INVOICE_PENDING" && detail.canManage ? <Button variant="outline" onClick={() => void openAction("cancel")}><X className="h-4 w-4" />{copy.cancel}</Button> : null}
          </div>
          <div className="border-t border-dtsc-border pt-4"><h3 className="font-black">{copy.payments}</h3><div className="mt-3 grid gap-2">{detail.payments.filter((payment) => payment.paymentType === "CUSTOMER_PAYMENT").length ? detail.payments.filter((payment) => payment.paymentType === "CUSTOMER_PAYMENT").map((payment) => <div key={payment.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-dtsc-border py-2 text-sm"><span>{payment.number} · {labels[payment.methodType as PaymentMethod] || payment.methodType}</span><span className="font-black">{formatEnterpriseAmount(payment.amount, payment.currencyCode, locale)}</span>{payment.status === "PENDING_APPROVAL" && detail.canManage ? <Button size="sm" onClick={() => void mutate({ action: "APPROVE_PAYMENT", paymentId: payment.id, revision: detail.checkout.revision })}>{copy.approvePayment}</Button> : <StatusBadge tone={payment.status === "CONFIRMED" || payment.status === "RECONCILED" ? "success" : "warning"}>{payment.status}</StatusBadge>}</div>) : <p className="text-sm text-dtsc-muted">{copy.noPayments}</p>}</div></div>
          {busy ? <ProfessionalLoading rows={1} /> : null}
        </div> : null}
      </FullscreenEntityDetail>

      <Dialog open={modal === "create"} onClose={() => setModal(null)} title={copy.newCheckout} className="h-[92dvh] max-w-3xl">
        <form className="grid gap-5 p-1" onSubmit={createCheckout}>
          <Field label={copy.sessionToCheckout} required><NativeSelect name="sessionId" required items={(lookups?.sessions || []).map((item) => ({ id: item.id, label: `${item.reference} · ${item.station.displayName || item.station.stationCode} · ${item.finalAmount && item.currency ? formatEnterpriseAmount(item.finalAmount, item.currency, locale) : "—"}` }))} disabled={lookupLoading} /></Field>
          <Field label={copy.invoiceApprover} required><NativeSelect name="invoiceApproverUserId" required items={(lookups?.invoiceApprovers || []).map((item) => ({ id: item.userId, label: `${item.name}${item.positionTitle ? ` · ${item.positionTitle}` : ""}` }))} disabled={lookupLoading} /></Field>
          <div className="border-t border-dtsc-border pt-4"><div className="flex items-center justify-between gap-2"><h3 className="font-black">{copy.extras}</h3><Button type="button" variant="outline" size="sm" onClick={() => setExtras((items) => [...items, { catalogItemId: "", quantity: 1 }])}>{copy.addExtra}</Button></div>{extras.length === 0 ? <p className="mt-2 text-sm text-dtsc-muted">{copy.noExtras}</p> : <div className="mt-3 grid gap-3">{extras.map((extra, index) => <div key={index} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_8rem_auto]"><NativeSelect value={extra.catalogItemId} onChange={(value) => setExtras((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, catalogItemId: value } : item))} items={(lookups?.products || []).map((item) => ({ id: item.id, label: `${item.name}${item.trackInventory ? " · stock" : ""}` }))} /><Input type="number" min="0.001" step="0.001" value={extra.quantity} onChange={(event) => setExtras((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, quantity: Number(event.target.value) } : item))} /><Button type="button" variant="outline" onClick={() => setExtras((items) => items.filter((_, itemIndex) => itemIndex !== index))}>{copy.close}</Button></div>)}</div>}</div>
          {extras.some((extra) => (lookups?.products || []).find((product) => product.id === extra.catalogItemId)?.trackInventory) ? <Field label={copy.warehouse} required><NativeSelect name="warehouseId" required items={(lookups?.warehouses || []).map((item) => ({ id: item.id, label: `${item.code} · ${item.name}` }))} /></Field> : null}
          {lookupLoading ? <ProfessionalLoading rows={1} /> : null}
          <Button type="submit" disabled={busy || lookupLoading}>{copy.submit}</Button>
        </form>
      </Dialog>

      <Dialog open={modal === "payment" || modal === "refund"} onClose={() => setModal(null)} title={modal === "refund" ? copy.requestRefund : copy.addPayment} className="h-[92dvh] max-w-xl">
        <form className="grid gap-4 p-1" onSubmit={(event) => void paymentSubmit(event, modal === "refund")}>
          <Field label={copy.method} required><NativeSelect name="methodType" required items={methods.map((method) => ({ id: method, label: labels[method] }))} /></Field>
          <Field label={copy.account} required><NativeSelect name="financialAccountId" required items={compatibleAccounts.map((account) => ({ id: account.id, label: `${account.code} · ${account.name} · ${account.currencyCode}` }))} /></Field>
          {modal === "payment" ? <Field label={copy.amount} required><Input name="amount" type="number" min="0.01" step="0.01" required defaultValue={detail?.invoice?.outstandingAmount || ""} /></Field> : null}
          <Field label={modal === "refund" ? copy.refundApprover : copy.paymentApprover} required><NativeSelect name="approverUserId" required items={(lookups?.paymentApprovers || []).map((item) => ({ id: item.userId, label: `${item.name}${item.positionTitle ? ` · ${item.positionTitle}` : ""}` }))} /></Field>
          {modal === "refund" ? <Field label={copy.reason} required><Input name="reason" required minLength={8} /></Field> : null}
          <Field label={copy.reference}><Input name="reference" /></Field>
          <Button type="submit" disabled={busy}>{copy.submit}</Button>
        </form>
      </Dialog>

      <Dialog open={modal === "cancel" || modal === "approveRefund"} onClose={() => setModal(null)} title={modal === "cancel" ? copy.cancel : copy.approveRefund} className="max-w-lg">
        <form className="grid gap-4 p-1" onSubmit={(event) => void reasonSubmit(event, modal === "cancel" ? "CANCEL" : "APPROVE_REFUND")}><Field label={copy.reason} required><Input name="reason" required minLength={8} /></Field><Button type="submit" disabled={busy}>{copy.submit}</Button></form>
      </Dialog>

      <Dialog open={Boolean(receipt)} onClose={() => setReceipt(null)} title={copy.receiptTitle} className="h-[92dvh] max-w-3xl">
        {receipt ? <div className="grid gap-5 p-1"><div className="grid gap-2 sm:grid-cols-2"><div><p className="text-xs font-black uppercase text-dtsc-muted">{copy.receipt}</p><p className="font-black">{receipt.receiptReference}</p></div><div><p className="text-xs font-black uppercase text-dtsc-muted">{copy.invoice}</p><p className="font-black">{receipt.invoice.number}</p></div></div><div className="grid gap-3 sm:grid-cols-3"><div><p className="text-xs font-black uppercase text-dtsc-muted">{copy.total}</p><p className="font-black">{formatEnterpriseAmount(receipt.invoice.grandTotal, receipt.invoice.currencyCode, locale)}</p></div><div><p className="text-xs font-black uppercase text-dtsc-muted">{copy.grossPaid}</p><p className="font-black">{formatEnterpriseAmount(receipt.totals.paidAmount, receipt.invoice.currencyCode, locale)}</p></div><div><p className="text-xs font-black uppercase text-dtsc-muted">{copy.refundedAmount}</p><p className="font-black">{formatEnterpriseAmount(receipt.totals.refundedAmount, receipt.invoice.currencyCode, locale)}</p></div></div><div className="border-t border-dtsc-border pt-4">{receipt.invoice.items.map((item) => <div key={item.id} className="flex justify-between gap-3 border-b border-dtsc-border py-2 text-sm"><span>{item.description} × {item.quantity}</span><span className="font-black">{formatEnterpriseAmount(item.totalAmount, receipt.invoice.currencyCode, locale)}</span></div>)}</div></div> : null}
      </Dialog>
    </ModuleWorkspace>
  );
}
