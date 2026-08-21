"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { CheckCircle2, CircleDollarSign, FileMinus2, Plus, Send, ShieldCheck, XCircle } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Field, NativeSelect } from "@/components/enterprise/core-v2/erp-v2-ui";
import {
  FinanceCollaboration,
  FinanceDetailGrid,
  FinanceDetailValue,
  FinancePaginationControls,
  FinanceRecordList,
  financeMutation,
  useFinanceCollection,
  useFinanceLookups,
  type FinanceRecord,
} from "@/components/enterprise/professional/finance-professional-workspace-shared";
import {
  ProfessionalError,
  ProfessionalFormSection,
  ProfessionalHelp,
  ProfessionalLoading,
  ProfessionalSearch,
  ProfessionalTabs,
} from "@/components/enterprise/professional/professional-erp-ui";
import {
  financeDate,
  financeMoney,
  financeStatusLabel,
  financeStatusTone,
  safeFinanceError,
  type FinanceLocale,
} from "@/components/enterprise/professional/finance-professional-ui";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { BusinessList, BusinessListItem } from "@/components/workspace/business-list";
import { ModuleMetric, ModuleMetrics } from "@/components/workspace/module-metrics";
import { ModuleContent, ModuleHeader, ModuleSection, ModuleToolbar, ModuleWorkspace } from "@/components/workspace/module-workspace";
import { StatusBadge } from "@/components/workspace/status-badge";
import type { EnterpriseModuleDefinition } from "@/lib/enterprise/module-registry";
import { translateEnterpriseFinance, type EnterpriseFinanceKey } from "@/lib/i18n";

type InvoiceLine = {
  key: string;
  catalogItemId: string;
  description: string;
  quantity: string;
  unitPrice: string;
  discountAmount: string;
  expenseAccountId: string;
};
type InvoiceItem = {
  id: string;
  description: string;
  quantity: string | number;
  unitPrice: string | number;
  discountAmount?: string | number;
  lineTotal?: string | number;
};
type Receivable = FinanceRecord & {
  dueDate?: string | null;
  originalAmount?: string | number;
  allocatedAmount?: string | number;
  salesInvoiceId?: string;
};
type Payable = FinanceRecord & {
  dueDate?: string | null;
  originalAmount?: string | number;
  allocatedAmount?: string | number;
  supplierInvoiceId?: string;
};
type Invoice = FinanceRecord & {
  invoiceDate: string;
  dueDate?: string | null;
  subtotal: string | number;
  discountTotal?: string | number;
  taxTotal?: string | number;
  grandTotal: string | number;
  amountPaid?: string | number;
  amountCredited?: string | number;
  outstandingAmount: string | number;
  paymentTerms?: string | null;
  notes?: string | null;
  items?: InvoiceItem[];
  receivable?: Receivable | null;
  payable?: Payable | null;
  threeWayMatch?: {
    status?: string;
    matchedAt?: string | null;
    quantityVariance?: string | number;
    priceVariance?: string | number;
    totalVariance?: string | number;
    overrideReason?: string | null;
  } | null;
};
type CatalogLookup = {
  id: string;
  code: string;
  sku?: string | null;
  name: string;
  itemType: string;
  currency?: string | null;
  indicativeSalePrice?: string | number | null;
  indicativeCost?: string | number | null;
};
type SalesOrderLookup = {
  id: string;
  reference: string;
  title: string;
  businessPartyId: string;
  contractId?: string | null;
  status: string;
  currency?: string | null;
  totalAmount?: string | number | null;
};
type FulfillmentLookup = { id: string; reference: string; salesOrderId: string; status: string; fulfilledAt?: string | null };
type ContractLookup = {
  id: string;
  reference: string;
  title: string;
  businessPartyId?: string | null;
  status: string;
  currency?: string | null;
  indicativeAmount?: string | number | null;
};
type PurchaseLookup = {
  id: string;
  reference: string;
  title: string;
  supplierId?: string | null;
  status: string;
  currency?: string | null;
  totalAmount?: string | number | null;
};
type PurchaseReceiptLookup = { id: string; reference: string; purchaseId: string };
type ExpenseAccountLookup = { id: string; code: string; nameFr: string; nameEn: string; accountType: string };
type FinanceSourceLookups = {
  catalogItems?: CatalogLookup[];
  salesOrders?: SalesOrderLookup[];
  fulfillments?: FulfillmentLookup[];
  commercialContracts?: ContractLookup[];
  purchases?: PurchaseLookup[];
  purchaseReceipts?: PurchaseReceiptLookup[];
  expenseAccounts?: ExpenseAccountLookup[];
};

const MODULE_META: Record<"FINANCE_RECEIVABLES" | "FINANCE_PAYABLES", { titleKey: EnterpriseFinanceKey; eyebrowKey: EnterpriseFinanceKey }> = {
  FINANCE_RECEIVABLES: { titleKey: "receivablesTitle", eyebrowKey: "receivablesEyebrow" },
  FINANCE_PAYABLES: { titleKey: "payablesTitle", eyebrowKey: "payablesEyebrow" },
};

const invoiceT = (locale: FinanceLocale, key: EnterpriseFinanceKey) => translateEnterpriseFinance(locale, key);

const INVOICE_ACTION_KEYS: Record<string, EnterpriseFinanceKey> = {
  SUBMIT: "actionSubmit",
  APPROVE: "actionApprove",
  REJECT: "actionReject",
  ISSUE: "actionIssueAndPost",
};

function invoiceActionLabel(action: string, locale: FinanceLocale) {
  const key = INVOICE_ACTION_KEYS[action];
  return key ? invoiceT(locale, key) : action;
}

function newLine(index: number): InvoiceLine {
  return { key: `finance-line-${Date.now()}-${index}`, catalogItemId: "", description: "", quantity: "1", unitPrice: "0", discountAmount: "0", expenseAccountId: "" };
}

function ageBucket(dueDate?: string | null) {
  if (!dueDate) return "TO_DUE";
  const days = Math.floor((Date.now() - new Date(dueDate).getTime()) / 86_400_000);
  if (days <= 0) return "TO_DUE";
  if (days <= 30) return "D1_30";
  if (days <= 60) return "D31_60";
  if (days <= 90) return "D61_90";
  return "D90_PLUS";
}

function invoiceTransitionActions(status: string | undefined, locale: FinanceLocale) {
  if (status === "DRAFT") return [{ action: "SUBMIT", label: invoiceT(locale, "actionSubmit"), icon: Send }];
  if (["SUBMITTED", "IN_REVIEW", "PENDING_APPROVAL"].includes(String(status))) return [
    { action: "APPROVE", label: invoiceT(locale, "actionApprove"), icon: CheckCircle2 },
    { action: "REJECT", label: invoiceT(locale, "actionReject"), icon: XCircle },
  ];
  if (status === "APPROVED") return [{ action: "ISSUE", label: invoiceT(locale, "actionIssueAndPost"), icon: ShieldCheck }];
  return [];
}

function DetailLineItems({ items, currencyCode, locale }: { items: InvoiceItem[]; currencyCode: string; locale: FinanceLocale }) {
  return (
    <BusinessList ariaLabel={invoiceT(locale, "invoiceLines")}>
      {items.map((item) => (
        <BusinessListItem
          key={item.id}
          title={item.description}
          meta={`${item.quantity} × ${financeMoney(item.unitPrice, currencyCode, locale)}`}
          status={<StatusBadge>{financeMoney(item.lineTotal ?? Number(item.quantity) * Number(item.unitPrice), currencyCode, locale)}</StatusBadge>}
        />
      ))}
    </BusinessList>
  );
}

export function EnterpriseFinanceInvoicesWorkspace({
  organizationId,
  organizationName,
  definition,
  locale: requestedLocale,
  canManage,
}: {
  organizationId: string;
  organizationName: string;
  definition: EnterpriseModuleDefinition;
  locale?: string | null;
  canManage: boolean;
}) {
  const locale: FinanceLocale = requestedLocale === "en" ? "en" : "fr";
  const t = (key: EnterpriseFinanceKey) => invoiceT(locale, key);
  const moduleCode = definition.code as "FINANCE_RECEIVABLES" | "FINANCE_PAYABLES";
  const isReceivables = moduleCode === "FINANCE_RECEIVABLES";
  const meta = MODULE_META[moduleCode];
  const searchParams = useSearchParams();
  const [tab, setTab] = useState(searchParams.get("tab") || "invoices");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [detail, setDetail] = useState<FinanceRecord | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [creditTarget, setCreditTarget] = useState<Invoice | null>(null);
  const [actionTarget, setActionTarget] = useState<{ invoice: Invoice; action: string } | null>(null);
  const [lines, setLines] = useState<InvoiceLine[]>([newLine(0)]);
  const [selectedPartyId, setSelectedPartyId] = useState("");
  const [selectedSupplierId, setSelectedSupplierId] = useState("");
  const [selectedSalesOrderId, setSelectedSalesOrderId] = useState("");
  const [selectedPurchaseId, setSelectedPurchaseId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const endpoint = useMemo(() => {
    if (tab === "invoices") return isReceivables ? "sales-invoices" : "supplier-invoices";
    if (tab === "credits") return isReceivables ? "sales-credit-notes" : "supplier-credit-notes";
    return isReceivables ? "receivables" : "payables";
  }, [isReceivables, tab]);
  const effectiveStatus = useMemo(() => {
    if (status) return status;
    if (["overdue", "ageing", "to-pay"].includes(tab)) return "OPEN";
    if (tab === "to-approve") return "PENDING_APPROVAL";
    return "";
  }, [status, tab]);
  const collection = useFinanceCollection<FinanceRecord>({
    endpoint: `/api/enterprise/${organizationId}/${endpoint}`,
    page,
    search,
    status: effectiveStatus,
    refreshKey,
  });
  const lookupData = useFinanceLookups(organizationId, moduleCode, refreshKey);
  const sources = lookupData.lookups as typeof lookupData.lookups & FinanceSourceLookups;
  const catalogItems = sources.catalogItems || [];
  const expenseAccounts = sources.expenseAccounts || [];
  const salesOrders = (sources.salesOrders || []).filter((order) => !selectedPartyId || order.businessPartyId === selectedPartyId);
  const fulfillments = (sources.fulfillments || []).filter((fulfillment) => !selectedSalesOrderId || fulfillment.salesOrderId === selectedSalesOrderId);
  const contracts = (sources.commercialContracts || []).filter((contract) => !selectedPartyId || contract.businessPartyId === selectedPartyId);
  const purchases = (sources.purchases || []).filter((purchase) => !selectedSupplierId || purchase.supplierId === selectedSupplierId);
  const receipts = (sources.purchaseReceipts || []).filter((receipt) => !selectedPurchaseId || receipt.purchaseId === selectedPurchaseId);

  const visibleItems = useMemo(() => tab === "overdue"
    ? collection.items.filter((item) => ageBucket(String(item.dueDate || "")) !== "TO_DUE")
    : collection.items, [collection.items, tab]);

  useEffect(() => {
    const deepId = searchParams.get(isReceivables ? "invoiceId" : "supplierInvoiceId");
    if (!deepId) return;
    const found = collection.items.find((item) => item.id === deepId);
    if (found) setDetail(found);
  }, [collection.items, isReceivables, searchParams]);

  function resetCreateForm() {
    setLines([newLine(0)]);
    setSelectedPartyId("");
    setSelectedSupplierId("");
    setSelectedSalesOrderId("");
    setSelectedPurchaseId("");
  }

  function updateLine(key: string, field: keyof InvoiceLine, value: string) {
    setLines((current) => current.map((line) => line.key === key ? { ...line, [field]: value } : line));
  }

  function selectCatalogItem(lineKey: string, catalogItemId: string) {
    const catalogItem = catalogItems.find((item) => item.id === catalogItemId);
    setLines((current) => current.map((line) => line.key === lineKey ? {
      ...line,
      catalogItemId,
      description: catalogItem?.name || line.description,
      unitPrice: String((isReceivables ? catalogItem?.indicativeSalePrice : catalogItem?.indicativeCost) ?? line.unitPrice),
    } : line));
  }

  async function createInvoice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setMessage("");
    setError("");
    const common = {
      invoiceDate: String(form.get("invoiceDate") || ""),
      dueDate: String(form.get("dueDate") || "") || undefined,
      currencyCode: String(form.get("currencyCode") || "USD").toUpperCase(),
      projectId: String(form.get("projectId") || "") || undefined,
      items: lines.map((line) => ({
        catalogItemId: line.catalogItemId || undefined,
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
      expenseId: String(form.get("expenseId") || "") || undefined,
      assetId: String(form.get("assetId") || "") || undefined,
    };
    try {
      await financeMutation(`/api/enterprise/${organizationId}/${isReceivables ? "sales-invoices" : "supplier-invoices"}`, payload);
      setCreateOpen(false);
      resetCreateForm();
      setRefreshKey((value) => value + 1);
      setMessage(t("invoiceSavedDraft"));
    } catch (createError) {
      setError(safeFinanceError(createError, t("creationFailed")));
    }
  }

  async function transitionInvoice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!actionTarget) return;
    const form = new FormData(event.currentTarget);
    try {
      await financeMutation(`/api/enterprise/${organizationId}/${isReceivables ? "sales-invoices" : "supplier-invoices"}/${actionTarget.invoice.id}/transition`, {
        action: actionTarget.action,
        reason: String(form.get("reason") || "") || undefined,
        revision: actionTarget.invoice.revision,
      });
      setActionTarget(null);
      setDetail(null);
      setRefreshKey((value) => value + 1);
      setMessage(t("invoiceWorkflowUpdated"));
    } catch (transitionError) {
      setError(safeFinanceError(transitionError, t("transitionFailed")));
    }
  }

  async function createCreditNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!creditTarget) return;
    const form = new FormData(event.currentTarget);
    try {
      await financeMutation(`/api/enterprise/${organizationId}/${isReceivables ? "sales-credit-notes" : "supplier-credit-notes"}`, {
        invoiceId: creditTarget.id,
        reason: String(form.get("reason") || ""),
        creditDate: String(form.get("creditDate") || ""),
        items: (creditTarget.items || []).map((item) => ({
          description: item.description,
          quantity: String(item.quantity),
          unitPrice: String(item.unitPrice),
          discountAmount: String(item.discountAmount || 0),
        })),
      });
      setCreditTarget(null);
      setDetail(null);
      setTab("credits");
      setRefreshKey((value) => value + 1);
      setMessage(t("creditNoteCreated"));
    } catch (creditError) {
      setError(safeFinanceError(creditError, t("creditNoteCreationFailed")));
    }
  }

  const tabs = isReceivables ? [
    { id: "invoices", label: t("customerInvoices") },
    { id: "balances", label: t("receivables") },
    { id: "credits", label: t("creditNotes") },
    { id: "ageing", label: t("dueDates") },
    { id: "overdue", label: t("overdue") },
  ] : [
    { id: "invoices", label: t("supplierInvoices") },
    { id: "balances", label: t("payables") },
    { id: "credits", label: t("supplierCreditNotes") },
    { id: "to-approve", label: t("toApprove") },
    { id: "to-pay", label: t("toPay") },
    { id: "overdue", label: t("overdue") },
  ];
  const openCount = collection.items.filter((item) => ["OPEN", "ISSUED", "PARTIALLY_PAID"].includes(String(item.status))).length;
  const overdueCount = collection.items.filter((item) => ageBucket(String(item.dueDate || "")) !== "TO_DUE").length;
  const approvalCount = collection.items.filter((item) => ["SUBMITTED", "IN_REVIEW", "PENDING_APPROVAL"].includes(String(item.status))).length;

  return (
    <ModuleWorkspace>
      <ModuleHeader
        eyebrow={`${t(meta.eyebrowKey)} · ${organizationName}`}
        title={t(meta.titleKey)}
        description={locale === "en" ? definition.descriptionEn : definition.descriptionFr}
        count={`${collection.pagination.total}`}
        primaryAction={canManage ? <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" />{t("newInvoice")}</Button> : undefined}
      />
      <ModuleMetrics label={t("financeCycleMetrics")}>
        <ModuleMetric label={t("openItems")} value={openCount} />
        <ModuleMetric label={t("overdue")} value={overdueCount} />
        <ModuleMetric label={t("toApprove")} value={approvalCount} />
        <ModuleMetric label={t("viewTotal")} value={collection.pagination.total} />
      </ModuleMetrics>
      <ModuleToolbar
        search={<ProfessionalSearch value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder={t("financeSearchPlaceholder")} />}
        controls={<div className="grid min-w-0 gap-2"><ProfessionalTabs value={tab} onChange={(value) => { setTab(value); setStatus(""); setPage(1); }} items={tabs} label={t("financeViews")} /><NativeSelect value={status} onChange={(value) => { setStatus(value); setPage(1); }} items={[{ id: "", label: t("allStatuses") }, ...["DRAFT", "SUBMITTED", "IN_REVIEW", "PENDING_APPROVAL", "APPROVED", "ISSUED", "POSTED", "PARTIALLY_PAID", "PAID", "OVERDUE", "CANCELLED"].map((id) => ({ id, label: financeStatusLabel(id, locale) }))]} /></div>}
        summary={t("currenciesSeparated")}
      />
      <ModuleContent>
        {message ? <div role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm font-bold text-emerald-800 dark:text-emerald-200">{message}</div> : null}
        {error ? <ProfessionalError message={error} /> : null}
        {lookupData.error ? <ProfessionalError message={lookupData.error} /> : null}
        <ModuleSection title={tabs.find((item) => item.id === tab)?.label || ""} description={t(isReceivables ? "receivablesSectionDescription" : "payablesSectionDescription")}>
          {collection.error ? <ProfessionalError message={collection.error} /> : collection.loading ? <ProfessionalLoading /> : tab === "ageing" ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{[
              { id: "TO_DUE", label: t("notDue") },
              { id: "D1_30", label: "1–30" },
              { id: "D31_60", label: "31–60" },
              { id: "D61_90", label: "61–90" },
              { id: "D90_PLUS", label: t("over90Days") },
            ].map((bucket) => {
              const records = collection.items.filter((item) => ageBucket(String(item.dueDate || "")) === bucket.id);
              return <article key={bucket.id} className="rounded-xl border border-dtsc-border p-4"><p className="text-xs font-black uppercase text-dtsc-muted">{bucket.label}</p><p className="mt-2 text-2xl font-black text-dtsc-ink">{records.length}</p><p className="mt-1 text-sm text-dtsc-muted">{t("records")}</p></article>;
            })}</div>
          ) : <FinanceRecordList items={visibleItems} locale={locale} emptyTitle={t("noItemInView")} emptyDescription={t("professionalFormOrFilters")} onOpen={setDetail} />}
          <FinancePaginationControls pagination={collection.pagination} page={page} onPage={setPage} locale={locale} />
        </ModuleSection>
        <ProfessionalHelp moduleCode={moduleCode} />
      </ModuleContent>

      <Dialog open={createOpen} onClose={() => { setCreateOpen(false); resetCreateForm(); }} title={t(isReceivables ? "newCustomerInvoice" : "newSupplierInvoice")} description={t("sourcesRevalidated")} className="h-[96dvh] max-w-5xl">
        <form onSubmit={createInvoice} className="grid gap-6">
          <ProfessionalFormSection title={t("partyAndSource")}>
            {isReceivables ? <>
              <Field label={t("customer")}><NativeSelect name="businessPartyId" value={selectedPartyId} onChange={setSelectedPartyId} required items={lookupData.lookups.parties.map((party) => ({ id: party.id, label: `${party.code || ""} ${party.displayName || party.legalName}`.trim() }))} /></Field>
              <Field label={t("sourceOrder")}><NativeSelect name="salesOrderId" value={selectedSalesOrderId} onChange={setSelectedSalesOrderId} items={salesOrders.map((order) => ({ id: order.id, label: `${order.reference} · ${order.title}` }))} /></Field>
              <Field label={t("sourceFulfillment")}><NativeSelect name="fulfillmentId" items={fulfillments.map((fulfillment) => ({ id: fulfillment.id, label: `${fulfillment.reference} · ${financeStatusLabel(fulfillment.status, locale)}` }))} /></Field>
              <Field label={t("sourceContract")}><NativeSelect name="contractId" items={contracts.map((contract) => ({ id: contract.id, label: `${contract.reference} · ${contract.title}` }))} /></Field>
            </> : <>
              <Field label={t("supplier")}><NativeSelect name="supplierId" value={selectedSupplierId} onChange={setSelectedSupplierId} required items={lookupData.lookups.suppliers.map((supplier) => ({ id: supplier.id, label: supplier.displayName || supplier.legalName }))} /></Field>
              <Field label={t("sourcePurchaseOrder")}><NativeSelect name="purchaseId" value={selectedPurchaseId} onChange={setSelectedPurchaseId} items={purchases.map((purchase) => ({ id: purchase.id, label: `${purchase.reference} · ${purchase.title}` }))} /></Field>
              <Field label={t("sourceReceipt")}><NativeSelect name="purchaseReceiptId" items={receipts.map((receipt) => ({ id: receipt.id, label: receipt.reference }))} /></Field>
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
            <div className="grid gap-3 md:col-span-2">
              {lines.map((line, index) => (
                <div key={line.key} className="grid gap-3 rounded-xl border border-dtsc-border p-3 md:grid-cols-12">
                  <div className="md:col-span-4"><Field label={`${t("productOrService")} ${index + 1}`}><NativeSelect value={line.catalogItemId} onChange={(value) => selectCatalogItem(line.key, value)} items={catalogItems.map((item) => ({ id: item.id, label: `${item.code} · ${item.name}` }))} /></Field></div>
                  <div className="md:col-span-4"><Field label={t("description")}><Input value={line.description} onChange={(event) => updateLine(line.key, "description", event.target.value)} required /></Field></div>
                  {!isReceivables ? <div className="md:col-span-4"><Field label={t("expense")}><NativeSelect value={line.expenseAccountId} onChange={(value) => updateLine(line.key, "expenseAccountId", value)} items={expenseAccounts.map((account) => ({ id: account.id, label: `${account.code} · ${locale === "fr" ? account.nameFr : account.nameEn}` }))} /></Field></div> : null}
                  <div className={isReceivables ? "md:col-span-1" : "md:col-span-3"}><Field label={t("quantityShort")}><Input value={line.quantity} onChange={(event) => updateLine(line.key, "quantity", event.target.value)} type="number" inputMode="decimal" min="0.000001" step="0.000001" required /></Field></div>
                  <div className={isReceivables ? "md:col-span-1" : "md:col-span-3"}><Field label={t("price")}><Input value={line.unitPrice} onChange={(event) => updateLine(line.key, "unitPrice", event.target.value)} type="number" inputMode="decimal" min="0" step="0.01" required /></Field></div>
                  <div className={isReceivables ? "md:col-span-1" : "md:col-span-3"}><Field label={t("discount")}><Input value={line.discountAmount} onChange={(event) => updateLine(line.key, "discountAmount", event.target.value)} type="number" inputMode="decimal" min="0" step="0.01" /></Field></div>
                  <div className={`flex items-end ${isReceivables ? "md:col-span-1" : "md:col-span-3"}`}><Button type="button" variant="outline" disabled={lines.length === 1} onClick={() => setLines((current) => current.filter((item) => item.key !== line.key))}>{t("remove")}</Button></div>
                </div>
              ))}
              <Button type="button" variant="outline" onClick={() => setLines((current) => [...current, newLine(current.length)])}><Plus className="h-4 w-4" />{t("addLine")}</Button>
            </div>
          </ProfessionalFormSection>
          {isReceivables ? <ProfessionalFormSection title={t("notes")}><Field label={t("internalNotes")}><textarea name="notes" rows={4} className="w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-base" /></Field></ProfessionalFormSection> : null}
          <div className="sticky bottom-0 flex justify-end gap-2 border-t border-dtsc-border bg-dtsc-surface py-3"><Button type="button" variant="outline" onClick={() => { setCreateOpen(false); resetCreateForm(); }}>{t("cancel")}</Button><Button type="submit">{t("saveDraft")}</Button></div>
        </form>
      </Dialog>

      <Dialog open={Boolean(detail)} onClose={() => setDetail(null)} title={detail ? String(detail.number || detail.reference || t("financeDetails")) : ""} className="h-[94dvh] max-w-5xl">
        {detail ? <div className="grid gap-5">
          <div className="flex flex-wrap gap-2">{detail.status ? <StatusBadge tone={financeStatusTone(detail.status)}>{financeStatusLabel(detail.status, locale)}</StatusBadge> : null}{detail.currencyCode ? <StatusBadge>{String(detail.currencyCode)}</StatusBadge> : null}</div>
          <FinanceDetailGrid>
            <FinanceDetailValue label={t("date")}>{financeDate(detail.invoiceDate || detail.dueDate || detail.createdAt, locale)}</FinanceDetailValue>
            <FinanceDetailValue label={t("total")}>{financeMoney(detail.grandTotal ?? detail.originalAmount, String(detail.currencyCode || "USD"), locale)}</FinanceDetailValue>
            <FinanceDetailValue label={t("outstanding")}>{financeMoney(detail.outstandingAmount, String(detail.currencyCode || "USD"), locale)}</FinanceDetailValue>
            {detail.amountPaid !== undefined ? <FinanceDetailValue label={t("paidAmount")}>{financeMoney(detail.amountPaid, String(detail.currencyCode || "USD"), locale)}</FinanceDetailValue> : null}
            {detail.dueDate ? <FinanceDetailValue label={t("dueDate")}>{financeDate(detail.dueDate, locale)}</FinanceDetailValue> : null}
            {detail.revision ? <FinanceDetailValue label={t("revision")}>{t("version")} {detail.revision}</FinanceDetailValue> : null}
          </FinanceDetailGrid>
          {Array.isArray(detail.items) && detail.items.length ? <DetailLineItems items={detail.items as InvoiceItem[]} currencyCode={String(detail.currencyCode || "USD")} locale={locale} /> : null}
          {!isReceivables && (detail as Invoice).threeWayMatch ? <section className="rounded-xl border border-dtsc-border p-4"><h3 className="font-black text-dtsc-ink">{t("poReceiptInvoiceControl")}</h3><div className="mt-3 grid gap-3 sm:grid-cols-3"><FinanceDetailValue label={t("quantity")}>{String((detail as Invoice).threeWayMatch?.quantityVariance ?? 0)}</FinanceDetailValue><FinanceDetailValue label={t("price")}>{String((detail as Invoice).threeWayMatch?.priceVariance ?? 0)}</FinanceDetailValue><FinanceDetailValue label={t("totalVariance")}>{String((detail as Invoice).threeWayMatch?.totalVariance ?? 0)}</FinanceDetailValue></div></section> : null}
          {endpoint.includes("invoices") && canManage ? <div data-responsive-actions>{invoiceTransitionActions(detail.status, locale).map((action) => { const Icon = action.icon; return <Button key={action.action} variant={action.action === "REJECT" ? "destructive" : "outline"} onClick={() => setActionTarget({ invoice: detail as Invoice, action: action.action })}><Icon className="h-4 w-4" />{action.label}</Button>; })}{["ISSUED", "POSTED", "PARTIALLY_PAID", "PAID"].includes(String(detail.status)) ? <Button variant="outline" onClick={() => setCreditTarget(detail as Invoice)}><FileMinus2 className="h-4 w-4" />{t("createCreditNote")}</Button> : null}</div> : null}
          <FinanceCollaboration organizationId={organizationId} moduleCode={moduleCode} record={detail} locale={locale} />
        </div> : null}
      </Dialog>

      <Dialog open={Boolean(actionTarget)} onClose={() => setActionTarget(null)} title={actionTarget ? `${invoiceActionLabel(actionTarget.action, locale)} · ${actionTarget.invoice.number}` : ""} description={t("sodAndPeriodChecked")} className="max-w-xl">
        {actionTarget ? <form onSubmit={transitionInvoice} className="grid gap-4"><Field label={t("decisionReasonComment")}><textarea name="reason" rows={4} className="w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-base" /></Field><div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setActionTarget(null)}>{t("cancel")}</Button><Button type="submit">{t("confirmAction")}</Button></div></form> : null}
      </Dialog>

      <Dialog open={Boolean(creditTarget)} onClose={() => setCreditTarget(null)} title={t("createCreditNote")} description={t("creditNoteKeepsOriginal")} className="max-w-2xl">
        {creditTarget ? <form onSubmit={createCreditNote} className="grid gap-4"><Field label={t("creditDate")}><Input name="creditDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required /></Field><Field label={t("detailedReason")}><textarea name="reason" minLength={8} rows={4} className="w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-base" required /></Field><p className="text-sm text-dtsc-muted">{t("creditNoteServerControls")}</p><div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setCreditTarget(null)}>{t("cancel")}</Button><Button type="submit"><CircleDollarSign className="h-4 w-4" />{t("createCreditNote")}</Button></div></form> : null}
      </Dialog>
    </ModuleWorkspace>
  );
}
