"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { CheckCircle2, FileMinus2, Plus, Send, ShieldCheck, XCircle } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Field, NativeSelect } from "@/components/enterprise/core-v2/erp-v2-ui";
import { EnterpriseApproverSelect } from "@/components/enterprise/enterprise-approver-select";
import {
  FinanceCollaboration,
  FinanceDetailGrid,
  FinanceDetailValue,
  FinancePaginationControls,
  FinanceRecordList,
  financeMutation,
  useFinanceLookups,
  type FinanceRecord,
} from "@/components/enterprise/professional/finance-professional-workspace-shared";
import { useOperationalFinanceCollection, fetchOperationalFinanceRecord } from "@/components/enterprise/professional/use-operational-finance-collection";
import { useOperationalFinanceSummary } from "@/components/enterprise/professional/use-operational-finance-summary";
import {
  ProfessionalError,
  ProfessionalFormSection,
  ProfessionalHelp,
  ProfessionalLoading,
  ProfessionalSearch,
  ProfessionalTabs,
} from "@/components/enterprise/professional/professional-erp-ui";
import { financeDate, financeMoney, financeStatusLabel, financeStatusTone, safeFinanceError, type FinanceLocale } from "@/components/enterprise/professional/finance-professional-ui";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToastMessage } from "@/components/ui/use-toast-message";
import { ModuleMetric, ModuleMetrics } from "@/components/workspace/module-metrics";
import { ModuleContent, ModuleHeader, ModuleSection, ModuleToolbar, ModuleWorkspace } from "@/components/workspace/module-workspace";
import { StatusBadge } from "@/components/workspace/status-badge";
import type { EnterpriseModuleDefinition } from "@/lib/enterprise/module-registry";
import { translateEnterpriseFinance, type EnterpriseFinanceKey } from "@/lib/i18n";

type Props = {
  organizationId: string;
  organizationName: string;
  definition: EnterpriseModuleDefinition;
  locale?: string | null;
  canCreate: boolean;
  canSubmit: boolean;
  canWrite: boolean;
  canApprove: boolean;
  canManage: boolean;
};

type RecordCapabilities = {
  canSubmit?: boolean;
  canReview?: boolean;
  canApprove?: boolean;
  canReject?: boolean;
  canPost?: boolean;
  canCreateCredit?: boolean;
};
type InvoiceRecord = FinanceRecord & {
  createdByUserId?: string;
  invoiceDate?: string;
  dueDate?: string | null;
  grandTotal?: string | number;
  outstandingAmount?: string | number;
  items?: Array<{ id: string; description: string; quantity: string | number; unitPrice: string | number; discountAmount?: string | number }>;
  capabilities?: RecordCapabilities;
  threeWayMatch?: { status?: string; quantityVariance?: string | number; priceVariance?: string | number; totalVariance?: string | number; overrideReason?: string | null } | null;
};
type InvoiceLine = { key: string; description: string; quantity: string; unitPrice: string; discountAmount: string; expenseAccountId: string };
type ActionTarget = { record: InvoiceRecord; action: string; kind: "invoice" | "credit" };

type FinanceSourceLookups = {
  salesOrders?: Array<{ id: string; reference: string; title: string; businessPartyId: string }>;
  fulfillments?: Array<{ id: string; reference: string; salesOrderId: string }>;
  commercialContracts?: Array<{ id: string; reference: string; title: string; businessPartyId?: string | null }>;
  purchases?: Array<{ id: string; reference: string; title: string; supplierId?: string | null }>;
  purchaseReceipts?: Array<{ id: string; reference: string; purchaseId: string }>;
  expenseAccounts?: Array<{ id: string; code: string; nameFr: string; nameEn: string }>;
};

const copy = (locale: FinanceLocale, key: EnterpriseFinanceKey) => translateEnterpriseFinance(locale, key);
const newLine = (index: number): InvoiceLine => ({ key: `invoice-${Date.now()}-${index}`, description: "", quantity: "1", unitPrice: "0", discountAmount: "0", expenseAccountId: "" });

function availableInvoiceActions(record: InvoiceRecord, isReceivables: boolean, locale: FinanceLocale) {
  const caps = record.capabilities || {};
  const actions: Array<{ action: string; label: string; icon: typeof Send; destructive?: boolean }> = [];
  if (caps.canSubmit) actions.push({ action: "SUBMIT", label: copy(locale, "actionSubmit"), icon: Send });
  if (!isReceivables && caps.canReview) actions.push({ action: "REVIEW", label: locale === "en" ? "Review" : "Revoir", icon: CheckCircle2 });
  if (caps.canApprove) actions.push({ action: "APPROVE", label: copy(locale, "actionApprove"), icon: CheckCircle2 });
  if (!isReceivables && caps.canReject) actions.push({ action: "REJECT", label: copy(locale, "actionReject"), icon: XCircle, destructive: true });
  if (caps.canPost) actions.push({ action: isReceivables ? "ISSUE" : "POST", label: isReceivables ? copy(locale, "actionIssueAndPost") : copy(locale, "post"), icon: ShieldCheck });
  return actions;
}

export function EnterpriseFinanceInvoicesWorkspaceHotfix(props: Props) {
  const { organizationId, organizationName, definition, locale: rawLocale, canCreate, canSubmit, canApprove, canManage } = props;
  const locale: FinanceLocale = rawLocale === "en" ? "en" : "fr";
  const t = (key: EnterpriseFinanceKey) => copy(locale, key);
  const moduleCode = definition.code as "FINANCE_RECEIVABLES" | "FINANCE_PAYABLES";
  const isReceivables = moduleCode === "FINANCE_RECEIVABLES";
  const searchParams = useSearchParams();
  const [tab, setTab] = useState(searchParams.get("tab") || "invoices");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [detail, setDetail] = useState<InvoiceRecord | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [actionTarget, setActionTarget] = useState<ActionTarget | null>(null);
  const [creditTarget, setCreditTarget] = useState<InvoiceRecord | null>(null);
  const [lines, setLines] = useState<InvoiceLine[]>([newLine(0)]);
  const [selectedPartyId, setSelectedPartyId] = useState("");
  const [selectedSupplierId, setSelectedSupplierId] = useState("");
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [selectedPurchaseId, setSelectedPurchaseId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  useToastMessage(message, "success");
  useToastMessage(errorMessage, "error");

  const endpointName = useMemo(() => {
    if (tab === "credits") return isReceivables ? "sales-credit-notes" : "supplier-credit-notes";
    if (tab === "invoices" || (!isReceivables && tab === "to-approve")) return isReceivables ? "sales-invoices" : "supplier-invoices";
    return isReceivables ? "receivables" : "payables";
  }, [isReceivables, tab]);
  const endpoint = `/api/enterprise/${organizationId}/${endpointName}`;
  const filters = useMemo<Record<string, string | boolean | undefined>>(() => ({
    overdue: tab === "overdue" ? true : undefined,
    workflowPending: !isReceivables && tab === "to-approve" ? true : undefined,
  }), [isReceivables, tab]);
  const effectiveStatus = useMemo(() => {
    if (status) return status;
    if (["ageing", "to-pay"].includes(tab)) return "OPEN";
    return "";
  }, [status, tab]);
  const collection = useOperationalFinanceCollection<InvoiceRecord>({ endpoint, page, search, status: effectiveStatus, filters, refreshKey });
  const { summary, error: summaryError } = useOperationalFinanceSummary(organizationId, moduleCode, refreshKey);
  const lookupData = useFinanceLookups(organizationId, moduleCode, refreshKey);
  const sources = lookupData.lookups as typeof lookupData.lookups & FinanceSourceLookups;
  const salesOrders = (sources.salesOrders || []).filter((item) => !selectedPartyId || item.businessPartyId === selectedPartyId);
  const fulfillments = (sources.fulfillments || []).filter((item) => !selectedOrderId || item.salesOrderId === selectedOrderId);
  const contracts = (sources.commercialContracts || []).filter((item) => !selectedPartyId || item.businessPartyId === selectedPartyId);
  const purchases = (sources.purchases || []).filter((item) => !selectedSupplierId || item.supplierId === selectedSupplierId);
  const receipts = (sources.purchaseReceipts || []).filter((item) => !selectedPurchaseId || item.purchaseId === selectedPurchaseId);
  const expenseAccounts = sources.expenseAccounts || [];

  useEffect(() => {
    const deepId = searchParams.get(isReceivables ? "invoiceId" : "supplierInvoiceId");
    if (!deepId) return;
    const directEndpoint = `/api/enterprise/${organizationId}/${isReceivables ? "sales-invoices" : "supplier-invoices"}`;
    fetchOperationalFinanceRecord<InvoiceRecord>(directEndpoint, deepId)
      .then((record) => { if (record) setDetail(record); })
      .catch((error) => setErrorMessage(safeFinanceError(error, t("financeDetails"))));
  }, [isReceivables, organizationId, searchParams]);

  function resetCreate() {
    setLines([newLine(0)]);
    setSelectedPartyId("");
    setSelectedSupplierId("");
    setSelectedOrderId("");
    setSelectedPurchaseId("");
  }

  async function createInvoice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true); setMessage(""); setErrorMessage("");
    const common = {
      invoiceDate: String(form.get("invoiceDate") || ""),
      dueDate: String(form.get("dueDate") || "") || undefined,
      currencyCode: String(form.get("currencyCode") || "USD").toUpperCase(),
      projectId: String(form.get("projectId") || "") || undefined,
      items: lines.map((line) => ({
        description: line.description,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        discountAmount: line.discountAmount,
        expenseAccountId: !isReceivables && line.expenseAccountId ? line.expenseAccountId : undefined,
      })),
    };
    const payload = isReceivables ? {
      ...common,
      businessPartyId: String(form.get("businessPartyId") || ""),
      salesOrderId: String(form.get("salesOrderId") || "") || undefined,
      fulfillmentId: String(form.get("fulfillmentId") || "") || undefined,
      contractId: String(form.get("contractId") || "") || undefined,
      paymentTerms: String(form.get("paymentTerms") || "") || undefined,
      notes: String(form.get("notes") || "") || undefined,
    } : {
      ...common,
      supplierId: String(form.get("supplierId") || ""),
      purchaseId: String(form.get("purchaseId") || "") || undefined,
      purchaseReceiptId: String(form.get("purchaseReceiptId") || "") || undefined,
    };
    try {
      await financeMutation(`/api/enterprise/${organizationId}/${isReceivables ? "sales-invoices" : "supplier-invoices"}`, payload);
      setCreateOpen(false); resetCreate(); setRefreshKey((v) => v + 1); setMessage(t("invoiceSavedDraft"));
    } catch (error) {
      setErrorMessage(safeFinanceError(error, t("creationFailed")));
    } finally { setBusy(false); }
  }

  async function transition(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!actionTarget) return;
    const form = new FormData(event.currentTarget);
    const { action, kind, record } = actionTarget;
    const baseName = kind === "credit" ? (isReceivables ? "sales-credit-notes" : "supplier-credit-notes") : (isReceivables ? "sales-invoices" : "supplier-invoices");
    const path = kind === "credit" && action === "POST" ? `/api/enterprise/${organizationId}/${baseName}/${record.id}/post` : `/api/enterprise/${organizationId}/${baseName}/${record.id}/transition`;
    const payload: Record<string, unknown> = { ...(kind === "credit" && action === "POST" ? {} : { action }), revision: record.revision, reason: String(form.get("reason") || "") || undefined };
    if (action === "SUBMIT" && kind === "invoice" && isReceivables) payload.approverUserId = String(form.get("approverUserId") || "");
    if (action === "SUBMIT" && kind === "invoice" && !isReceivables) {
      payload.reviewerUserId = String(form.get("reviewerUserId") || "");
      payload.approverUserId = String(form.get("approverUserId") || "");
    }
    if (action === "SUBMIT" && kind === "credit") payload.approverUserId = String(form.get("approverUserId") || "");
    setBusy(true); setErrorMessage("");
    try {
      await financeMutation(path, payload);
      setActionTarget(null); setDetail(null); setRefreshKey((v) => v + 1); setMessage(t("invoiceWorkflowUpdated"));
    } catch (error) {
      setErrorMessage(safeFinanceError(error, t("transitionFailed")));
    } finally { setBusy(false); }
  }

  async function createCredit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!creditTarget?.items?.length) return;
    const form = new FormData(event.currentTarget);
    setBusy(true); setErrorMessage("");
    try {
      await financeMutation(`/api/enterprise/${organizationId}/${isReceivables ? "sales-credit-notes" : "supplier-credit-notes"}`, {
        invoiceId: creditTarget.id,
        reason: String(form.get("reason") || ""),
        creditDate: String(form.get("creditDate") || ""),
        items: creditTarget.items.map((item) => ({ description: item.description, quantity: String(item.quantity), unitPrice: String(item.unitPrice), discountAmount: String(item.discountAmount || 0) })),
      });
      setCreditTarget(null); setDetail(null); setTab("credits"); setRefreshKey((v) => v + 1); setMessage(t("creditNoteCreated"));
    } catch (error) {
      setErrorMessage(safeFinanceError(error, t("creditNoteCreationFailed")));
    } finally { setBusy(false); }
  }

  const tabs = isReceivables ? [
    { id: "invoices", label: t("customerInvoices") }, { id: "balances", label: t("receivables") }, { id: "credits", label: t("creditNotes") }, { id: "ageing", label: t("dueDates") }, { id: "overdue", label: t("overdue") },
  ] : [
    { id: "invoices", label: t("supplierInvoices") }, { id: "balances", label: t("payables") }, { id: "credits", label: t("supplierCreditNotes") }, { id: "to-approve", label: t("toApprove") }, { id: "to-pay", label: t("toPay") }, { id: "overdue", label: t("overdue") },
  ];
  const pendingCount = isReceivables ? summary?.pendingApprovalCount || 0 : summary?.pendingDecisionCount || 0;

  return <ModuleWorkspace>
    <ModuleHeader
      eyebrow={`${isReceivables ? t("receivablesEyebrow") : t("payablesEyebrow")} · ${organizationName}`}
      title={t(isReceivables ? "receivablesTitle" : "payablesTitle")}
      description={locale === "en" ? definition.descriptionEn : definition.descriptionFr}
      count={`${collection.pagination.total}`}
      primaryAction={canCreate ? <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" />{t("newInvoice")}</Button> : undefined}
    />
    <ModuleMetrics label={t("financeCycleMetrics")}>
      <ModuleMetric label={t("openItems")} value={summary?.openCount || 0} />
      <ModuleMetric label={t("overdue")} value={summary?.overdueCount || 0} />
      <ModuleMetric label={t("toApprove")} value={pendingCount} />
      <ModuleMetric label={t("viewTotal")} value={collection.pagination.total} />
    </ModuleMetrics>
    <ModuleToolbar
      search={<ProfessionalSearch value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder={t("financeSearchPlaceholder")} />}
      controls={<div className="grid min-w-0 gap-2"><ProfessionalTabs value={tab} onChange={(value) => { setTab(value); setStatus(""); setPage(1); setDetail(null); }} items={tabs} label={t("financeViews")} /><NativeSelect value={status} onChange={(value) => { setStatus(value); setPage(1); }} items={[{ id: "", label: t("allStatuses") }, ...["DRAFT", "PENDING_REVIEW", "PENDING_APPROVAL", "APPROVED", "REJECTED", "ISSUED", "POSTED", "PARTIALLY_PAID", "PAID", "CANCELLED"].map((id) => ({ id, label: financeStatusLabel(id, locale) }))]} /></div>}
      summary={t("currenciesSeparated")}
    />
    <ModuleContent>
      {summaryError ? <ProfessionalError message={summaryError} /> : null}
      {lookupData.error ? <ProfessionalError message={lookupData.error} /> : null}
      <ModuleSection title={tabs.find((item) => item.id === tab)?.label || ""} description={t(isReceivables ? "receivablesSectionDescription" : "payablesSectionDescription")}>
        {collection.error ? <ProfessionalError message={collection.error} /> : collection.loading ? <ProfessionalLoading /> : tab === "ageing" ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{[
            ["TO_DUE", t("notDue")], ["D1_30", "1–30"], ["D31_60", "31–60"], ["D61_90", "61–90"], ["D90_PLUS", t("over90Days")],
          ].map(([id, label]) => <article key={id} className="rounded-xl border border-dtsc-border p-4"><p className="text-xs font-black uppercase text-dtsc-muted">{label}</p><p className="mt-2 text-2xl font-black text-dtsc-ink">{summary?.ageing?.[id as keyof NonNullable<typeof summary.ageing>] || 0}</p><p className="mt-1 text-sm text-dtsc-muted">{t("records")}</p></article>)}</div>
        ) : <FinanceRecordList items={collection.items} locale={locale} emptyTitle={t("noItemInView")} emptyDescription={t("professionalFormOrFilters")} onOpen={(record) => setDetail(record as InvoiceRecord)} />}
        {tab !== "ageing" ? <FinancePaginationControls pagination={collection.pagination} page={page} onPage={setPage} locale={locale} /> : null}
      </ModuleSection>
      <ProfessionalHelp moduleCode={moduleCode} />
    </ModuleContent>

    <Dialog open={createOpen} onClose={() => { if (!busy) { setCreateOpen(false); resetCreate(); } }} title={t(isReceivables ? "newCustomerInvoice" : "newSupplierInvoice")} description={t("sourcesRevalidated")} presentation="editor" className="max-w-5xl">
      <form onSubmit={createInvoice} className="grid gap-6">
        <ProfessionalFormSection title={t("partyAndSource")}>
          {isReceivables ? <>
            <Field label={t("customer")}><NativeSelect name="businessPartyId" value={selectedPartyId} onChange={setSelectedPartyId} required items={lookupData.lookups.parties.map((party) => ({ id: party.id, label: `${party.code || ""} ${party.displayName || party.legalName}`.trim() }))} /></Field>
            <Field label={t("sourceOrder")}><NativeSelect name="salesOrderId" value={selectedOrderId} onChange={setSelectedOrderId} items={salesOrders.map((item) => ({ id: item.id, label: `${item.reference} · ${item.title}` }))} /></Field>
            <Field label={t("sourceFulfillment")}><NativeSelect name="fulfillmentId" items={fulfillments.map((item) => ({ id: item.id, label: item.reference }))} /></Field>
            <Field label={t("sourceContract")}><NativeSelect name="contractId" items={contracts.map((item) => ({ id: item.id, label: `${item.reference} · ${item.title}` }))} /></Field>
          </> : <>
            <Field label={t("supplier")}><NativeSelect name="supplierId" value={selectedSupplierId} onChange={setSelectedSupplierId} required items={lookupData.lookups.suppliers.map((supplier) => ({ id: supplier.id, label: supplier.displayName || supplier.legalName }))} /></Field>
            <Field label={t("sourcePurchaseOrder")}><NativeSelect name="purchaseId" value={selectedPurchaseId} onChange={setSelectedPurchaseId} items={purchases.map((item) => ({ id: item.id, label: `${item.reference} · ${item.title}` }))} /></Field>
            <Field label={t("sourceReceipt")}><NativeSelect name="purchaseReceiptId" items={receipts.map((item) => ({ id: item.id, label: item.reference }))} /></Field>
          </>}
          <Field label={t("project")}><NativeSelect name="projectId" items={lookupData.lookups.projects.map((project) => ({ id: project.id, label: `${project.reference} · ${project.name}` }))} /></Field>
        </ProfessionalFormSection>
        <ProfessionalFormSection title={t("datesAndTerms")}>
          <Field label={t("invoiceDate")}><Input name="invoiceDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required /></Field>
          <Field label={t("dueDate")}><Input name="dueDate" type="date" /></Field>
          <Field label={t("currency")}><Input name="currencyCode" defaultValue="USD" maxLength={3} required /></Field>
          {isReceivables ? <Field label={t("paymentTerms")}><Input name="paymentTerms" /></Field> : null}
        </ProfessionalFormSection>
        <ProfessionalFormSection title={t("invoiceLines")}>
          <div className="grid gap-3 md:col-span-2">{lines.map((line, index) => <div key={line.key} className="grid gap-3 rounded-xl border border-dtsc-border p-3 md:grid-cols-12">
            <div className="md:col-span-5"><Field label={`${t("description")} ${index + 1}`}><Input value={line.description} onChange={(event) => setLines((current) => current.map((item) => item.key === line.key ? { ...item, description: event.target.value } : item))} required /></Field></div>
            {!isReceivables ? <div className="md:col-span-3"><Field label={t("expense")}><NativeSelect value={line.expenseAccountId} onChange={(value) => setLines((current) => current.map((item) => item.key === line.key ? { ...item, expenseAccountId: value } : item))} items={expenseAccounts.map((account) => ({ id: account.id, label: `${account.code} · ${locale === "fr" ? account.nameFr : account.nameEn}` }))} /></Field></div> : null}
            <div className="md:col-span-2"><Field label={t("quantityShort")}><Input type="number" min="0.000001" step="0.000001" value={line.quantity} onChange={(event) => setLines((current) => current.map((item) => item.key === line.key ? { ...item, quantity: event.target.value } : item))} required /></Field></div>
            <div className="md:col-span-2"><Field label={t("price")}><Input type="number" min="0" step="0.01" value={line.unitPrice} onChange={(event) => setLines((current) => current.map((item) => item.key === line.key ? { ...item, unitPrice: event.target.value } : item))} required /></Field></div>
            <div className="md:col-span-2"><Field label={t("discount")}><Input type="number" min="0" step="0.01" value={line.discountAmount} onChange={(event) => setLines((current) => current.map((item) => item.key === line.key ? { ...item, discountAmount: event.target.value } : item))} /></Field></div>
            <div className="flex items-end md:col-span-2"><Button type="button" variant="outline" disabled={busy || lines.length === 1} onClick={() => setLines((current) => current.filter((item) => item.key !== line.key))}>{t("remove")}</Button></div>
          </div>)}<Button type="button" variant="outline" disabled={busy} onClick={() => setLines((current) => [...current, newLine(current.length)])}><Plus className="h-4 w-4" />{t("addLine")}</Button></div>
        </ProfessionalFormSection>
        {isReceivables ? <ProfessionalFormSection title={t("notes")}><Field label={t("internalNotes")}><textarea name="notes" rows={4} className="w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2" /></Field></ProfessionalFormSection> : null}
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => { setCreateOpen(false); resetCreate(); }}>{t("cancel")}</Button><Button type="submit" disabled={busy}>{busy ? (locale === "en" ? "Saving…" : "Enregistrement…") : t("saveDraft")}</Button></div>
      </form>
    </Dialog>

    <Dialog open={Boolean(detail)} onClose={() => setDetail(null)} title={detail ? String(detail.number || detail.reference || t("financeDetails")) : ""} presentation="editor" className="max-w-5xl">
      {detail ? <div className="grid gap-5">
        <div className="flex flex-wrap gap-2">{detail.status ? <StatusBadge tone={financeStatusTone(detail.status)}>{financeStatusLabel(detail.status, locale)}</StatusBadge> : null}{detail.currencyCode ? <StatusBadge>{String(detail.currencyCode)}</StatusBadge> : null}</div>
        <FinanceDetailGrid>
          <FinanceDetailValue label={t("date")}>{financeDate(detail.invoiceDate || detail.dueDate || detail.createdAt, locale)}</FinanceDetailValue>
          <FinanceDetailValue label={t("total")}>{financeMoney(detail.grandTotal ?? detail.originalAmount, String(detail.currencyCode || "USD"), locale)}</FinanceDetailValue>
          {detail.outstandingAmount !== undefined ? <FinanceDetailValue label={t("outstanding")}>{financeMoney(detail.outstandingAmount, String(detail.currencyCode || "USD"), locale)}</FinanceDetailValue> : null}
          {detail.dueDate ? <FinanceDetailValue label={t("dueDate")}>{financeDate(detail.dueDate, locale)}</FinanceDetailValue> : null}
        </FinanceDetailGrid>
        {endpointName.includes("invoices") ? <div data-responsive-actions>{availableInvoiceActions(detail, isReceivables, locale).map(({ action, label, icon: Icon, destructive }) => <Button key={action} disabled={busy} variant={destructive ? "destructive" : "outline"} onClick={() => setActionTarget({ record: detail, action, kind: "invoice" })}><Icon className="h-4 w-4" />{label}</Button>)}{detail.capabilities?.canCreateCredit ? <Button variant="outline" disabled={busy} onClick={() => setCreditTarget(detail)}><FileMinus2 className="h-4 w-4" />{t("createCreditNote")}</Button> : null}</div> : null}
        <FinanceCollaboration organizationId={organizationId} moduleCode={moduleCode} record={detail} locale={locale} />
      </div> : null}
    </Dialog>

    <Dialog open={Boolean(actionTarget)} onClose={() => { if (!busy) setActionTarget(null); }} title={actionTarget ? `${actionTarget.action} · ${String(actionTarget.record.number || actionTarget.record.reference || "")}` : ""} description={t("sodAndPeriodChecked")} presentation="editor" className="max-w-xl">
      {actionTarget ? <form onSubmit={transition} className="grid gap-4">
        {actionTarget.action === "SUBMIT" && actionTarget.kind === "invoice" && isReceivables && canSubmit ? <EnterpriseApproverSelect organizationId={organizationId} moduleCode="FINANCE_RECEIVABLES" locale={rawLocale} /> : null}
        {actionTarget.action === "SUBMIT" && actionTarget.kind === "invoice" && !isReceivables && canSubmit ? <><EnterpriseApproverSelect organizationId={organizationId} moduleCode="FINANCE_PAYABLES" locale={rawLocale} name="reviewerUserId" label={locale === "en" ? "Reviewer" : "Responsable de revue"} /><EnterpriseApproverSelect organizationId={organizationId} moduleCode="FINANCE_PAYABLES" locale={rawLocale} name="approverUserId" label={locale === "en" ? "Final approver" : "Approbateur final"} /></> : null}
        {actionTarget.action === "SUBMIT" && actionTarget.kind === "credit" ? <EnterpriseApproverSelect organizationId={organizationId} moduleCode={moduleCode} locale={rawLocale} /> : null}
        {actionTarget.action !== "POST" && actionTarget.action !== "ISSUE" ? <Field label={t("decisionReasonComment")}><textarea name="reason" rows={4} minLength={actionTarget.action === "REJECT" ? 4 : undefined} required={actionTarget.action === "REJECT"} className="w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2" /></Field> : null}
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => setActionTarget(null)}>{t("cancel")}</Button><Button type="submit" disabled={busy || (actionTarget.action === "APPROVE" && !canApprove) || (["POST", "ISSUE"].includes(actionTarget.action) && !canManage)}>{busy ? (locale === "en" ? "Processing…" : "Traitement…") : t("confirmAction")}</Button></div>
      </form> : null}
    </Dialog>

    <Dialog open={Boolean(creditTarget)} onClose={() => { if (!busy) setCreditTarget(null); }} title={t("createCreditNote")} description={t("creditNoteKeepsOriginal")} presentation="editor" className="max-w-2xl">
      {creditTarget ? <form onSubmit={createCredit} className="grid gap-4"><Field label={t("creditDate")}><Input name="creditDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required /></Field><Field label={t("detailedReason")}><textarea name="reason" minLength={8} rows={4} className="w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2" required /></Field><div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => setCreditTarget(null)}>{t("cancel")}</Button><Button type="submit" disabled={busy}>{t("createCreditNote")}</Button></div></form> : null}
    </Dialog>
  </ModuleWorkspace>;
}
