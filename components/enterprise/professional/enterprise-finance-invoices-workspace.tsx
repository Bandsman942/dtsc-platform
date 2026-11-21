"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { CheckCircle2, Eye, FileMinus2, Plus, Printer, Send, ShieldCheck, XCircle } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEnterpriseBusinessContext } from "@/components/enterprise/use-enterprise-business-context";
import { Field, NativeSelect } from "@/components/enterprise/core-v2/erp-v2-ui";
import { FinanceReferenceSelect } from "@/components/enterprise/core-v2/finance-reference-select";
import { EnterpriseApproverSelect } from "@/components/enterprise/enterprise-approver-select";
import {
  FinanceCollaboration,
  FinanceDetailGrid,
  FinanceDetailValue,
  FinancePaginationControls,
  FinanceRecordList,
  financeMutation,
  type FinanceRecord,
} from "@/components/enterprise/professional/finance-professional-workspace-shared";
import { useOperationalFinanceCollection, fetchOperationalFinanceRecord } from "@/components/enterprise/professional/use-operational-finance-collection";
import { FinanceDateFilter, FinanceExportControls, type FinanceExportColumn } from "@/components/enterprise/professional/finance-design2-controls";
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
import { purchaseFormGuidance } from "@/lib/enterprise/purchase-form-i18n";
import { SupplierClaimCompensationPanel } from "@/components/enterprise/professional/supplier-claim-compensation-panel";

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
  creditDate?: string;
  dueDate?: string | null;
  grandTotal?: string | number;
  outstandingAmount?: string | number;
  supplierReturnReservedAmount?: string;
  compensationReservedAmount?: string;
  payableAllocatableAmount?: string;
  supplierReturnAllocatableAmount?: string;
  supplierReturn?: { id:string; reference:string; status:string; purchaseId:string; sourceMovementId:string; currencyCode:string; totalCost:string; recoverableTaxAmount?:string; supplierCreditNoteId:string|null; settlementPayableAmount?:string|null; settlementClaimAmount?:string|null } | null;
  salesInvoiceId?: string;
  supplierInvoiceId?: string;
  replacementCreditNoteId?: string|null;
  items?: Array<{ id: string; description: string; quantity: string | number; unitPrice: string | number; discountAmount?: string | number }>;
  pendingApproverName?: string | null;
  capabilities?: RecordCapabilities;
  threeWayMatch?: { status?: string; quantityVariance?: string | number; priceVariance?: string | number; totalVariance?: string | number; overrideReason?: string | null } | null;
};
type RefundClaim = {id:string;reference:string;invoiceReference:string;businessPartyId:string;currencyCode:string;creditDate:string;original:string;refunded:string;compensated:string;compensationReserved:string;reserved:string;remaining:string;available:string;canCreate:boolean};
type InvoiceLine = {
  key: string;
  catalogItemId: string;
  description: string;
  quantity: string;
  unitPrice: string;
  discountAmount: string;
  expenseAccountId: string;
  taxCodeId: string;
  additionalTaxCodeIds: string[];
  taxCalculationMode: "NET" | "SEQUENTIAL";
  taxEvidenceReference: string;
  taxRecoveryRequested: boolean;
};
type AvailableTax = { id: string; code: string; nameFr: string; nameEn: string; taxTreatment: string; category: string };
type ActionTarget = { record: InvoiceRecord; action: string; kind: "invoice" | "credit" };

const invoiceT = (locale: FinanceLocale, key: EnterpriseFinanceKey) => translateEnterpriseFinance(locale, key);
const copy = invoiceT;
const newLine = (index: number): InvoiceLine => ({ key: `invoice-${Date.now()}-${index}`, catalogItemId: "", description: "", quantity: "1", unitPrice: "0", discountAmount: "0", expenseAccountId: "", taxCodeId: "", additionalTaxCodeIds: [], taxCalculationMode: "NET", taxEvidenceReference: "", taxRecoveryRequested: false });

function actionLabel(action: string, locale: FinanceLocale) {
  if (action === "SUBMIT") return invoiceT(locale, "actionSubmit");
  if (action === "APPROVE") return invoiceT(locale, "actionApprove");
  if (action === "REJECT") return invoiceT(locale, "actionReject");
  if (action === "REQUEST_CORRECTION") return invoiceT(locale, "actionRequestCorrection");
  if (action === "ISSUE") return invoiceT(locale, "actionIssueAndPost");
  if (action === "POST") return invoiceT(locale, "post");
  if (action === "REVIEW") return locale === "en" ? "Review" : "Revoir";
  return action;
}

function invoiceTransitionActions(status: string | undefined, locale: FinanceLocale, isReceivables: boolean) {
  if (status === "DRAFT" || status === "REJECTED") return [{ action: "SUBMIT", label: actionLabel("SUBMIT", locale), icon: Send }];
  if (isReceivables && status === "PENDING_APPROVAL") return [
    { action: "APPROVE", label: actionLabel("APPROVE", locale), icon: CheckCircle2 },
    { action: "REQUEST_CORRECTION", label: actionLabel("REQUEST_CORRECTION", locale), icon: Send },
    { action: "REJECT", label: actionLabel("REJECT", locale), icon: XCircle, destructive: true },
  ];
  if (!isReceivables && status === "PENDING_REVIEW") return [
    { action: "REVIEW", label: actionLabel("REVIEW", locale), icon: CheckCircle2 },
    { action: "REJECT", label: actionLabel("REJECT", locale), icon: XCircle, destructive: true },
  ];
  if (!isReceivables && status === "PENDING_APPROVAL") return [
    { action: "APPROVE", label: actionLabel("APPROVE", locale), icon: CheckCircle2 },
    { action: "REJECT", label: actionLabel("REJECT", locale), icon: XCircle, destructive: true },
  ];
  if (status === "APPROVED") return [{ action: isReceivables ? "ISSUE" : "POST", label: actionLabel(isReceivables ? "ISSUE" : "POST", locale), icon: ShieldCheck }];
  return [];
}

function creditTransitionActions(status: string | undefined, locale: FinanceLocale) {
  if (status === "DRAFT" || status === "REJECTED") return [{ action: "SUBMIT", label: actionLabel("SUBMIT", locale), icon: Send }];
  if (status === "PENDING_APPROVAL") return [
    { action: "APPROVE", label: actionLabel("APPROVE", locale), icon: CheckCircle2 },
    { action: "REJECT", label: actionLabel("REJECT", locale), icon: XCircle, destructive: true },
  ];
  if (status === "APPROVED") return [{ action: "POST", label: actionLabel("POST", locale), icon: ShieldCheck }];
  return [];
}

function capabilityAllowsAction(record: InvoiceRecord, action: string) {
  const caps = record.capabilities || {};
  if (action === "SUBMIT") return Boolean(caps.canSubmit);
  if (action === "REVIEW") return Boolean(caps.canReview);
  if (action === "APPROVE") return Boolean(caps.canApprove);
  if (action === "REJECT") return Boolean(caps.canReject);
  if (action === "REQUEST_CORRECTION") return Boolean(caps.canReject);
  if (action === "POST" || action === "ISSUE") return Boolean(caps.canPost);
  return false;
}

export function EnterpriseFinanceInvoicesWorkspace(props: Props) {
  const { organizationId, organizationName, definition, locale: rawLocale, canCreate, canSubmit, canWrite, canApprove, canManage } = props;
  const locale: FinanceLocale = rawLocale === "en" ? "en" : "fr";
  const t = (key: EnterpriseFinanceKey) => copy(locale, key);
  const { context: businessContext } = useEnterpriseBusinessContext(organizationId);
  const moduleCode = definition.code as "FINANCE_RECEIVABLES" | "FINANCE_PAYABLES";
  const isReceivables = moduleCode === "FINANCE_RECEIVABLES";
  const searchParams = useSearchParams();
  const [tab, setTab] = useState(searchParams.get("tab") || "invoices");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [ageBucket, setAgeBucket] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [detail, setDetail] = useState<InvoiceRecord | null>(null);
  const [refundClaim,setRefundClaim]=useState<RefundClaim|null>(null);
  const [refundPaymentId,setRefundPaymentId]=useState<string|null>(null);
  const [refundBankValid,setRefundBankValid]=useState(false);
  const [refundKey,setRefundKey]=useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [actionTarget, setActionTarget] = useState<ActionTarget | null>(null);
  const [creditTarget, setCreditTarget] = useState<InvoiceRecord | null>(null);
  const [lines, setLines] = useState<InvoiceLine[]>([newLine(0)]);
  const [availableTaxes, setAvailableTaxes] = useState<AvailableTax[]>([]);
  const [taxSelectorMessage, setTaxSelectorMessage] = useState("");
  const [selectedPartyId, setSelectedPartyId] = useState("");
  const [selectedSupplierId, setSelectedSupplierId] = useState("");
  const [selectedSupplierPartyId, setSelectedSupplierPartyId] = useState("");
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [selectedPurchaseId, setSelectedPurchaseId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  useToastMessage(message, "success");
  useToastMessage(errorMessage, "error");

  useEffect(() => {
    if (!createOpen) return;
    const controller = new AbortController();
    void fetch(`/api/enterprise/${organizationId}/taxes?pageSize=100`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("FINANCE_TAX_VIEW_REQUIRED");
        return response.json() as Promise<{ items?: AvailableTax[] }>;
      })
      .then((data) => { if (!controller.signal.aborted) { setAvailableTaxes(data.items || []); setTaxSelectorMessage(""); } })
      .catch((error: unknown) => { if (!(error instanceof Error && error.name === "AbortError")) setTaxSelectorMessage(locale === "en" ? "Tax catalog access requires Finance Tax permission." : "Accès au référentiel fiscal soumis à la permission Finance Taxes."); });
    return () => controller.abort();
  }, [createOpen, organizationId, locale]);

  const endpointName = useMemo(() => {
    if (tab === "credits") return isReceivables ? "sales-credit-notes" : "supplier-credit-notes";
    if (tab === "invoices" || (!isReceivables && tab === "to-approve")) return isReceivables ? "sales-invoices" : "supplier-invoices";
    return isReceivables ? "receivables" : "payables";
  }, [isReceivables, tab]);
  const endpoint = `/api/enterprise/${organizationId}/${endpointName}`;
  const filters = useMemo<Record<string, string | boolean | undefined>>(() => ({
    overdue: tab === "overdue" ? true : undefined,
    ageBucket: tab === "ageing" && ageBucket ? ageBucket : undefined,
    workflowPending: !isReceivables && tab === "to-approve" ? true : undefined,
    dateFrom, dateTo,
  }), [ageBucket, dateFrom, dateTo, isReceivables, tab]);
  const effectiveStatus = useMemo(() => {
    if (status) return status;
    if (["ageing", "to-pay"].includes(tab)) return "OPEN";
    return "";
  }, [status, tab]);
  const collection = useOperationalFinanceCollection<InvoiceRecord>({ endpoint, page, search, status: effectiveStatus, filters, refreshKey });
  const exportColumns: FinanceExportColumn[] = [
    { key: "reference", labelFr: "Référence", labelEn: "Reference", get: (row) => String(row.number || row.reference || row.id || "") },
    { key: "status", labelFr: "Statut", labelEn: "Status", get: (row) => financeStatusLabel(String(row.status || ""), locale) },
    { key: "date", labelFr: "Date de la pièce / échéance", labelEn: "Document date / due date", get: (row) => financeDate(row.invoiceDate || row.creditDate || row.dueDate, locale) },
    { key: "currency", labelFr: "Devise", labelEn: "Currency", get: (row) => String(row.currencyCode || row.currency || "") },
    { key: "total", labelFr: "Total", labelEn: "Total", get: (row) => String(row.totalAmount || row.amount || row.balanceDue || "") },
    ...(!isReceivables && endpointName !== "supplier-credit-notes" ? [
      { key: "returnReserved", labelFr: purchaseFormGuidance("fr","returnFinanceExportReserved"),labelEn:purchaseFormGuidance("en","returnFinanceExportReserved"),get:(row:Record<string,unknown>)=>String(row.supplierReturnReservedAmount ?? "") },
      { key: "returnAllocatable", labelFr: purchaseFormGuidance("fr","returnFinanceExportAllocatable"),labelEn:purchaseFormGuidance("en","returnFinanceExportAllocatable"),get:(row:Record<string,unknown>)=>String(row.supplierReturnAllocatableAmount ?? "") },
      { key: "claimOffsetReserved", labelFr: "Compensations réservées", labelEn: "Reserved claim offsets",get:(row:Record<string,unknown>)=>String(row.compensationReservedAmount ?? "") },
      { key: "payableAvailable", labelFr: "Dette mobilisable", labelEn: "Available payable",get:(row:Record<string,unknown>)=>String(row.payableAllocatableAmount ?? "") },
      { key: "returnClaim", labelFr: purchaseFormGuidance("fr","returnSettlementRecognized"),labelEn:purchaseFormGuidance("en","returnSettlementRecognized"),get:(row:Record<string,unknown>)=>{const linked=row.supplierReturn as InvoiceRecord["supplierReturn"];return linked?.status==="RECONCILED"?String(linked.settlementClaimAmount ?? ""):"";} },
    ] : []),
  ];
  const { summary, error: summaryError } = useOperationalFinanceSummary(organizationId, moduleCode, refreshKey);

  useEffect(() => {
    const invoiceKey = isReceivables ? "invoiceId" : "supplierInvoiceId";
    const creditKey = isReceivables ? "creditNoteId" : "supplierCreditNoteId";
    const invoiceId = searchParams.get(invoiceKey);
    const creditId = searchParams.get(creditKey) || (!isReceivables ? searchParams.get("creditNote") : null);
    const deepId = creditId || invoiceId;
    if (!deepId) return;
    const directName = creditId
      ? (isReceivables ? "sales-credit-notes" : "supplier-credit-notes")
      : (isReceivables ? "sales-invoices" : "supplier-invoices");
    fetchOperationalFinanceRecord<InvoiceRecord>(`/api/enterprise/${organizationId}/${directName}`, deepId)
      .then((record) => { if (record) setDetail(record); })
      .catch((error) => setErrorMessage(safeFinanceError(error, translateEnterpriseFinance(locale, "financeDetails"), locale)));
  }, [isReceivables, organizationId, searchParams, locale]);

  function resetCreate() {
    setLines([newLine(0)]);
    setSelectedPartyId("");
    setSelectedSupplierId("");
    setSelectedSupplierPartyId("");
    setSelectedOrderId("");
    setSelectedPurchaseId("");
  }

  function updateLine(key: string, patch: Partial<InvoiceLine>) {
    setLines((current) => current.map((item) => item.key === key ? { ...item, ...patch } : item));
  }

  async function createInvoice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true); setMessage(""); setErrorMessage("");
    const common = {
      invoiceDate: String(form.get("invoiceDate") || ""),
      dueDate: String(form.get("dueDate") || "") || undefined,
      currencyCode: String(form.get("currencyCode") || "").toUpperCase(),
      projectId: String(form.get("projectId") || "") || undefined,
      items: lines.map((line) => ({
        catalogItemId: line.catalogItemId || undefined,
        description: line.description,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        discountAmount: line.discountAmount,
        expenseAccountId: !isReceivables && line.expenseAccountId ? line.expenseAccountId : undefined,
        taxCodeId: line.taxCodeId || undefined,
        additionalTaxCodeIds: line.additionalTaxCodeIds.length ? line.additionalTaxCodeIds : undefined,
        taxCalculationMode: line.taxCalculationMode === "SEQUENTIAL" ? "SEQUENTIAL" : undefined,
        taxEvidenceReference: line.taxEvidenceReference.trim() || undefined,
        taxRecoveryRequested: !isReceivables && line.taxRecoveryRequested ? true : undefined,
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
      businessPartyId: selectedSupplierPartyId || undefined,
      purchaseId: String(form.get("purchaseId") || "") || undefined,
      purchaseReceiptId: String(form.get("purchaseReceiptId") || "") || undefined,
      expenseId: String(form.get("expenseId") || "") || undefined,
      assetId: String(form.get("assetId") || "") || undefined,
    };
    try {
      await financeMutation(`/api/enterprise/${organizationId}/${isReceivables ? "sales-invoices" : "supplier-invoices"}`, payload);
      setCreateOpen(false); resetCreate(); setRefreshKey((value) => value + 1); setMessage(t("invoiceSavedDraft"));
    } catch (error) {
      setErrorMessage(safeFinanceError(error, t("creationFailed"), locale));
    } finally { setBusy(false); }
  }

  async function transition(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!actionTarget) return;
    const form = new FormData(event.currentTarget);
    const isCredit = actionTarget.kind === "credit";
    const action = actionTarget.action;
    const record = actionTarget.record;
    const baseName = isCredit ? (isReceivables ? "sales-credit-notes" : "supplier-credit-notes") : (isReceivables ? "sales-invoices" : "supplier-invoices");
    const path = isCredit && action === "POST" ? `/api/enterprise/${organizationId}/${baseName}/${record.id}/post` : `/api/enterprise/${organizationId}/${baseName}/${record.id}/transition`;
    const payload: Record<string, unknown> = { ...(isCredit && action === "POST" ? {} : { action }), revision: record.revision, reason: String(form.get("reason") || "") || undefined };
    if (action === "SUBMIT" && !isCredit && isReceivables) payload.approverUserId = String(form.get("approverUserId") || "");
    if (action === "SUBMIT" && !isCredit && !isReceivables) {
      payload.reviewerUserId = String(form.get("reviewerUserId") || "");
      payload.approverUserId = String(form.get("approverUserId") || "");
    }
    if (action === "SUBMIT" && isCredit) payload.approverUserId = String(form.get("approverUserId") || "");
    if (!isCredit && !isReceivables && action === "REVIEW") payload.verifyInputTaxEvidence = form.get("verifyInputTaxEvidence") === "on";
    setBusy(true); setErrorMessage("");
    try {
      await financeMutation(path, payload);
      setActionTarget(null); setDetail(null); setRefreshKey((value) => value + 1); setMessage(t("invoiceWorkflowUpdated"));
    } catch (error) {
      setErrorMessage(safeFinanceError(error, t("transitionFailed"), locale));
    } finally { setBusy(false); }
  }

  async function openClaimRefund(claimId:string) {
    setBusy(true);setErrorMessage("");setRefundPaymentId(null);setRefundBankValid(false);
    try {
      const response=await fetch(`/api/enterprise/${organizationId}/payments?supplierReturnClaimId=${encodeURIComponent(claimId)}`,{cache:"no-store"});
      const body=await response.json();
      if(!response.ok||!body.claim)throw new Error("CLAIM_UNAVAILABLE");
      setRefundClaim(body.claim as RefundClaim);setRefundKey(crypto.randomUUID());setDetail(null);
    }catch{setErrorMessage(locale==="en"?"Unable to open the supplier claim. Check Finance access and accounting evidence.":"Impossible d’ouvrir la créance fournisseur. Vérifiez les droits Finance et les pièces comptables.");}
    finally{setBusy(false);}
  }

  async function createClaimRefund(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if(!refundClaim?.canCreate||!refundBankValid||!refundKey)return;
    const form=new FormData(event.currentTarget);
    setBusy(true);setErrorMessage("");
    try{
      const result=await financeMutation(`/api/enterprise/${organizationId}/payments`,{
        paymentType:"SUPPLIER_RETURN_REFUND",direction:"INBOUND",methodType:"BANK_TRANSFER",
        supplierReturnClaimId:refundClaim.id,businessPartyId:refundClaim.businessPartyId,
        financialAccountId:String(form.get("financialAccountId")||""),currencyCode:refundClaim.currencyCode,
        amount:String(form.get("amount")||""),paymentDate:String(form.get("paymentDate")||""),
        reference:String(form.get("reference")||""),idempotencyKey:refundKey,
      });
      const payment=result.payment as {id?:string}|undefined;
      if(!payment?.id)throw new Error("PAYMENT_ID_MISSING");
      setRefundPaymentId(payment.id);setRefreshKey(value=>value+1);
      setMessage(locale==="en"?"Supplier refund draft created. Submit it for independent approval.":"Brouillon de remboursement créé. Soumettez-le pour validation indépendante.");
    }catch(error){setErrorMessage(safeFinanceError(error, locale === "en" ? "Unable to prepare refund" : "Impossible de préparer le remboursement", locale));}
    finally{setBusy(false);}
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
        items: creditTarget.items.map((item) => ({ sourceInvoiceItemId: item.id, description: item.description, quantity: String(item.quantity), unitPrice: String(item.unitPrice), discountAmount: String(item.discountAmount || 0) })),
      });
      setCreditTarget(null); setDetail(null); setTab("credits"); setRefreshKey((value) => value + 1); setMessage(t("creditNoteCreated"));
    } catch (error) {
      setErrorMessage(safeFinanceError(error, t("creditNoteCreationFailed"), locale));
    } finally { setBusy(false); }
  }

  const tabs = isReceivables ? [
    { id: "invoices", label: t("customerInvoices") }, { id: "balances", label: t("receivables") }, { id: "credits", label: t("creditNotes") }, { id: "ageing", label: t("dueDates") }, { id: "overdue", label: t("overdue") },
  ] : [
    { id: "invoices", label: t("supplierInvoices") }, { id: "balances", label: t("payables") }, { id: "credits", label: t("supplierCreditNotes") }, { id: "to-approve", label: t("toApprove") }, { id: "to-pay", label: t("toPay") }, { id: "overdue", label: t("overdue") },
  ];
  const pendingCount = isReceivables ? summary?.pendingApprovalCount || 0 : summary?.pendingDecisionCount || 0;
  const detailKind: "invoice" | "credit" = endpointName.includes("credit-notes") || Boolean(detail?.creditDate) ? "credit" : "invoice";
  const detailHasWorkflow = detailKind === "credit" || endpointName.includes("invoices");
  const actionRequiresReason = Boolean(actionTarget && ["REJECT", "REQUEST_CORRECTION", "CANCEL", "VOID"].includes(actionTarget.action));
  const printCustomerInvoice = (id: string) => window.open(`/api/enterprise/${organizationId}/sales-invoices/${encodeURIComponent(id)}/print?lang=${locale}`, "_blank", "noopener,noreferrer");

  const invoiceIdFor = (record: InvoiceRecord) => isReceivables && detailKind !== "credit"
    ? (endpointName === "sales-invoices" ? record.id : record.salesInvoiceId || null)
    : null;

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
      controls={<div className="grid min-w-0 gap-2"><ProfessionalTabs value={tab} onChange={(value) => { setTab(value); setStatus(""); setAgeBucket(""); setPage(1); setDetail(null); }} items={tabs} label={t("financeViews")} /><div className="flex min-w-0 flex-wrap items-end gap-2"><NativeSelect value={status} onChange={(value) => { setStatus(value); setPage(1); }} items={[{ id: "", label: t("allStatuses") }, ...["DRAFT", "PENDING_REVIEW", "PENDING_APPROVAL", "APPROVED", "REJECTED", "ISSUED", "POSTED", "PARTIALLY_PAID", "PAID", "CANCELLED"].map((id) => ({ id, label: financeStatusLabel(id, locale) }))]} /><FinanceDateFilter locale={locale} from={dateFrom} to={dateTo} onChange={(from, to) => { setDateFrom(from); setDateTo(to); setPage(1); }} /><FinanceExportControls endpoint={endpoint} organizationName={organizationName} title={`${locale === "en" ? definition.labelEn : definition.labelFr} · ${tab}`} locale={locale} filters={{ search, status: effectiveStatus, overdue: tab === "overdue" ? "true" : "", workflowPending: !isReceivables && tab === "to-approve" ? "true" : "", dateFrom, dateTo }} columns={exportColumns} disabled={collection.loading} /></div></div>}
      summary={t("currenciesSeparated")}
    />
    <ModuleContent>
      {summaryError ? <ProfessionalError message={summaryError} /> : null}
      <ModuleSection title={tabs.find((item) => item.id === tab)?.label || ""} description={t(isReceivables ? "receivablesSectionDescription" : "payablesSectionDescription")}>
        {collection.error ? <ProfessionalError message={collection.error} /> : collection.loading ? <ProfessionalLoading /> : <div className="grid gap-3">
          {tab === "ageing" ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            {[
              ["", t("allDueDates")],
              ["TO_DUE", t("notDue")], ["D1_30", "1–30"], ["D31_60", "31–60"], ["D61_90", "61–90"], ["D90_PLUS", t("over90Days")],
            ].map(([id, label]) => <button type="button" key={id} aria-pressed={ageBucket === id}
              onClick={() => { setAgeBucket(id); setPage(1); }}
              className={`rounded-xl border p-4 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 ${ageBucket === id ? "border-sky-500 bg-sky-500/10" : "border-dtsc-border hover:border-sky-500/60"}`}>
              <span className="block text-xs font-black uppercase text-dtsc-muted">{label}</span>
              <span className="mt-2 block text-2xl font-black text-dtsc-ink">{id ? summary?.ageing?.[id as keyof NonNullable<typeof summary.ageing>] || 0 : summary?.openCount || 0}</span>
              <span className="mt-1 block text-xs text-dtsc-muted">{t("records")}</span>
            </button>)}
          </div> : null}
          <FinanceRecordList items={collection.items} locale={locale} emptyTitle={t("noItemInView")}
            emptyDescription={t("professionalFormOrFilters")} onOpen={(record) => setDetail(record as InvoiceRecord)}
            actions={isReceivables && (endpointName === "sales-invoices" || endpointName === "receivables") ? (record) => {
              const invoiceId = endpointName === "sales-invoices" ? record.id : (record as InvoiceRecord).salesInvoiceId;
              return invoiceId ? <div data-responsive-actions className="flex min-w-0 flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => setDetail(record as InvoiceRecord)}><Eye className="h-4 w-4" />{t("detailsLabel")}</Button>
                <Button size="sm" variant="outline" onClick={() => printCustomerInvoice(invoiceId)}><Printer className="h-4 w-4" />{t("printInvoicePreview")}</Button>
              </div> : null;
            } : !isReceivables ? (record) => {
              const row=record as InvoiceRecord;
              return <div className="flex min-w-0 flex-wrap items-center gap-2" data-responsive-actions>
                {row.supplierReturn?.status==="DISPATCHED"?<StatusBadge tone="warning">{purchaseFormGuidance(locale,"returnFinanceReserved")} : {financeMoney(row.supplierReturnReservedAmount,String(row.currencyCode),locale)}</StatusBadge>:null}
                <Button size="sm" variant="outline" onClick={()=>setDetail(row)}><Eye className="h-4 w-4"/>{t("detailsLabel")}</Button>
              </div>;
            } : undefined}
          />
        </div>}
        <FinancePaginationControls pagination={collection.pagination} page={page} onPage={setPage} locale={locale} />
      </ModuleSection>
      <ProfessionalHelp moduleCode={moduleCode} />
    </ModuleContent>

    <Dialog open={createOpen} onClose={() => { if (!busy) { setCreateOpen(false); resetCreate(); } }} title={t(isReceivables ? "newCustomerInvoice" : "newSupplierInvoice")} description={t("sourcesRevalidated")} presentation="editor" className="h-[96dvh] max-w-5xl">
      <form onSubmit={createInvoice} className="grid gap-6">
        <ProfessionalFormSection title={t("partyAndSource")}>
          {isReceivables ? <>
            <Field label={t("customer")}><FinanceReferenceSelect organizationId={organizationId} moduleCode="FINANCE_RECEIVABLES" kind="customer" name="businessPartyId" label={t("customer")} locale={rawLocale} required disabled={busy} onOptionChange={(option) => { setSelectedPartyId(option?.id || ""); setSelectedOrderId(""); }} /></Field>
            <Field label={t("sourceOrder")}><FinanceReferenceSelect organizationId={organizationId} moduleCode="FINANCE_RECEIVABLES" kind="sales-order" name="salesOrderId" label={t("sourceOrder")} locale={rawLocale} parentId={selectedPartyId} disabled={busy} onOptionChange={(option) => setSelectedOrderId(option?.id || "")} /></Field>
            <Field label={t("sourceFulfillment")}><FinanceReferenceSelect organizationId={organizationId} moduleCode="FINANCE_RECEIVABLES" kind="fulfillment" name="fulfillmentId" label={t("sourceFulfillment")} locale={rawLocale} parentId={selectedOrderId} disabled={busy} /></Field>
            <Field label={t("sourceContract")}><FinanceReferenceSelect organizationId={organizationId} moduleCode="FINANCE_RECEIVABLES" kind="contract" name="contractId" label={t("sourceContract")} locale={rawLocale} parentId={selectedPartyId} disabled={busy} /></Field>
          </> : <>
            <Field label={t("supplier")}><FinanceReferenceSelect organizationId={organizationId} moduleCode="FINANCE_PAYABLES" kind="supplier" name="supplierId" label={t("supplier")} locale={rawLocale} required disabled={busy} onOptionChange={(option) => { setSelectedSupplierId(option?.id || ""); setSelectedSupplierPartyId(option?.businessPartyId || ""); setSelectedPurchaseId(""); }} /></Field>
            <Field label={t("sourcePurchaseOrder")}><FinanceReferenceSelect organizationId={organizationId} moduleCode="FINANCE_PAYABLES" kind="purchase" name="purchaseId" label={t("sourcePurchaseOrder")} locale={rawLocale} parentId={selectedSupplierId} disabled={busy} onOptionChange={(option) => setSelectedPurchaseId(option?.id || "")} /></Field>
            <Field label={t("sourceReceipt")}><FinanceReferenceSelect organizationId={organizationId} moduleCode="FINANCE_PAYABLES" kind="purchase-receipt" name="purchaseReceiptId" label={t("sourceReceipt")} locale={rawLocale} parentId={selectedPurchaseId} disabled={busy} /></Field>
            <Field label={locale === "en" ? "Approved expense" : "Dépense approuvée"}><FinanceReferenceSelect organizationId={organizationId} moduleCode="FINANCE_PAYABLES" kind="expense" name="expenseId" label={locale === "en" ? "approved expense" : "dépense approuvée"} locale={rawLocale} parentId={selectedSupplierId} disabled={busy} /></Field>
            <Field label={locale === "en" ? "Related asset" : "Actif lié"}><FinanceReferenceSelect organizationId={organizationId} moduleCode="FINANCE_PAYABLES" kind="asset" name="assetId" label={locale === "en" ? "related asset" : "actif lié"} locale={rawLocale} parentId={selectedSupplierId} disabled={busy} /></Field>
          </>}
          <Field label={t("project")}><FinanceReferenceSelect organizationId={organizationId} moduleCode={moduleCode} kind="project" name="projectId" label={t("project")} locale={rawLocale} disabled={busy} /></Field>
        </ProfessionalFormSection>
        <ProfessionalFormSection title={t("datesAndTerms")}>
          <Field label={t("invoiceDate")}><Input name="invoiceDate" type="date" defaultValue={businessContext?.businessDate || ""} required disabled={busy} /></Field>
          <Field label={t("dueDate")}><Input name="dueDate" type="date" disabled={busy} /></Field>
          <Field label={t("currency")}><Input name="currencyCode" defaultValue={businessContext?.functionalCurrencyCode || ""} maxLength={3} required disabled={busy} /></Field>
          {isReceivables ? <Field label={t("paymentTerms")}><Input name="paymentTerms" disabled={busy} /></Field> : null}
        </ProfessionalFormSection>
        <ProfessionalFormSection title={t("invoiceLines")}>
          {taxSelectorMessage ? <p role="status" className="text-sm text-amber-600 md:col-span-2">{taxSelectorMessage}</p> : null}
          <div className="grid gap-3 md:col-span-2">{lines.map((line, index) => <div key={line.key} className="grid gap-3 rounded-xl border border-dtsc-border p-3 md:grid-cols-12">
            <div className="md:col-span-4"><Field label={`${t("productOrService")} ${index + 1}`}><FinanceReferenceSelect organizationId={organizationId} moduleCode={moduleCode} kind="catalog-item" name={`catalog-${line.key}`} label={t("productOrService")} locale={rawLocale} disabled={busy} onOptionChange={(option) => updateLine(line.key, { catalogItemId: option?.id || "", ...(option ? { description: option.label, unitPrice: option.amount !== null && option.amount !== undefined ? String(option.amount) : line.unitPrice } : {}) })} /></Field></div>
            <div className="md:col-span-4"><Field label={`${t("description")} ${index + 1}`}><Input value={line.description} onChange={(event) => updateLine(line.key, { description: event.target.value })} required disabled={busy} /></Field></div>
            {!isReceivables ? <div className="md:col-span-4"><Field label={t("expense")}><FinanceReferenceSelect organizationId={organizationId} moduleCode="FINANCE_PAYABLES" kind="expense-account" name={`expenseAccount-${line.key}`} label={t("expense")} locale={rawLocale} disabled={busy} onOptionChange={(option) => updateLine(line.key, { expenseAccountId: option?.id || "" })} /></Field></div> : null}
            <div className="md:col-span-2"><Field label={t("quantityShort")}><Input type="number" min="0.000001" step="0.000001" value={line.quantity} onChange={(event) => updateLine(line.key, { quantity: event.target.value })} required disabled={busy} /></Field></div>
            <div className="md:col-span-2"><Field label={t("price")}><Input type="number" min="0" step="0.01" value={line.unitPrice} onChange={(event) => updateLine(line.key, { unitPrice: event.target.value })} required disabled={busy} /></Field></div>
            <div className="md:col-span-2"><Field label={t("discount")}><Input type="number" min="0" step="0.01" value={line.discountAmount} onChange={(event) => updateLine(line.key, { discountAmount: event.target.value })} disabled={busy} /></Field></div>
            <div className="md:col-span-4"><Field label={locale === "en" ? "Primary tax" : "Taxe principale"}>
              <NativeSelect value={line.taxCodeId} onChange={(value) => updateLine(line.key, { taxCodeId: value, additionalTaxCodeIds: line.additionalTaxCodeIds.filter((id) => id !== value) })}
                items={[{ id: "", label: locale === "en" ? "Use item tax policy" : "Règle fiscale de l'article" }, ...availableTaxes.map((tax) => ({ id: tax.id, label: `${tax.code} — ${locale === "en" ? tax.nameEn : tax.nameFr}` }))]} />
            </Field></div>
            <div className="md:col-span-4"><Field label={locale === "en" ? "Additional tax" : "Taxe complémentaire"}>
              <NativeSelect value={line.additionalTaxCodeIds[0] || ""} onChange={(value) => updateLine(line.key, { additionalTaxCodeIds: value ? [value] : [] })}
                items={[{ id: "", label: locale === "en" ? "None" : "Aucune" }, ...availableTaxes.filter((tax) => tax.id !== line.taxCodeId).map((tax) => ({ id: tax.id, label: `${tax.code} — ${locale === "en" ? tax.nameEn : tax.nameFr}` }))]} />
            </Field></div>
            <div className="md:col-span-4"><Field label={locale === "en" ? "Tax basis" : "Assiette fiscale"}>
              <NativeSelect value={line.taxCalculationMode} onChange={(value) => updateLine(line.key, { taxCalculationMode: value === "SEQUENTIAL" ? "SEQUENTIAL" : "NET" })}
                items={[{ id: "NET", label: locale === "en" ? "Same net amount" : "Même montant HT" }, { id: "SEQUENTIAL", label: locale === "en" ? "Sequential (approved rule)" : "Cumul séquentiel (règle approuvée)" }]} />
            </Field></div>
            <div className="md:col-span-7"><Field label={locale === "en" ? "Tax evidence reference" : "Référence justificative fiscale"}>
              <Input value={line.taxEvidenceReference} maxLength={180} disabled={busy} placeholder={locale === "en" ? "Document / decision / legal reference" : "Document / décision / référence légale"} onChange={(event) => updateLine(line.key, { taxEvidenceReference: event.target.value })}/>
            </Field></div>
            {!isReceivables ? <label className="flex items-center gap-2 rounded-lg border border-dtsc-border p-2 text-sm md:col-span-5"><input type="checkbox" checked={line.taxRecoveryRequested} disabled={busy} onChange={(event) => updateLine(line.key, { taxRecoveryRequested: event.target.checked })}/><span>{locale === "en" ? "Request input VAT recovery (proof + review)" : "Demander la TVA récupérable (preuve et revue exigées)"}</span></label> : null}
            <p className="text-xs text-dtsc-muted md:col-span-12">{locale === "en" ? "Codes are company-specific. Withholding, unsupported cross-border regimes remain blocked." : "Codes propres à l'entreprise. Retenues et régimes transfrontaliers non qualifiés restent bloqués."}</p>
            <div className="flex items-end md:col-span-2"><Button type="button" variant="outline" disabled={busy || lines.length === 1} onClick={() => setLines((current) => current.filter((item) => item.key !== line.key))}>{t("remove")}</Button></div>
          </div>)}<Button type="button" variant="outline" disabled={busy} onClick={() => setLines((current) => [...current, newLine(current.length)])}><Plus className="h-4 w-4" />{t("addLine")}</Button></div>
        </ProfessionalFormSection>
        {isReceivables ? <ProfessionalFormSection title={t("notes")}><Field label={t("internalNotes")}><textarea name="notes" rows={4} disabled={busy} className="w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 disabled:opacity-60" /></Field></ProfessionalFormSection> : null}
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => { setCreateOpen(false); resetCreate(); }}>{t("cancel")}</Button><Button type="submit" disabled={busy}>{busy ? (locale === "en" ? "Saving…" : "Enregistrement…") : t("saveDraft")}</Button></div>
      </form>
    </Dialog>

    <Dialog open={Boolean(detail)} onClose={() => setDetail(null)} title={detail ? String(detail.number || detail.reference || t("financeDetails")) : ""} presentation="editor" className="max-w-5xl">
      {detail ? <div className="grid gap-5">
        <div className="flex flex-wrap gap-2">{detail.status ? <StatusBadge tone={financeStatusTone(detail.status)}>{financeStatusLabel(detail.status, locale)}{detail.status === "PENDING_APPROVAL" && detail.pendingApproverName ? ` (${detail.pendingApproverName})` : ""}</StatusBadge> : null}{detail.currencyCode ? <StatusBadge>{String(detail.currencyCode)}</StatusBadge> : null}</div>
        <FinanceDetailGrid>
          <FinanceDetailValue label={t("date")}>{financeDate(detail.invoiceDate || detail.creditDate || detail.dueDate || detail.createdAt, locale)}</FinanceDetailValue>
          <FinanceDetailValue label={t("total")}>{financeMoney(detail.grandTotal ?? detail.originalAmount, String(detail.currencyCode || "USD"), locale)}</FinanceDetailValue>
          {detail.outstandingAmount !== undefined ? <FinanceDetailValue label={t("outstanding")}>{financeMoney(detail.outstandingAmount, String(detail.currencyCode || "USD"), locale)}</FinanceDetailValue> : null}
          {detail.dueDate ? <FinanceDetailValue label={t("dueDate")}>{financeDate(detail.dueDate, locale)}</FinanceDetailValue> : null}
        </FinanceDetailGrid>
        {!isReceivables && detail.replacementCreditNoteId ? <div className="min-w-0 rounded-xl border border-dtsc-border p-3"><a className="break-words text-sm font-semibold text-dtsc-blue underline" href={`/enterprise-modules/FINANCE_PAYABLES?supplierCreditNoteId=${encodeURIComponent(detail.replacementCreditNoteId)}`}>{purchaseFormGuidance(locale,"returnCreditReplacementLink")}</a></div>:null}
        {!isReceivables && detail.supplierReturn ? <section className="grid min-w-0 gap-2 rounded-xl border border-dtsc-border p-3" data-supplier-return-finance>
          <div className="flex min-w-0 flex-wrap justify-between gap-2"><h3 className="font-semibold break-words">{purchaseFormGuidance(locale,"returnFinanceTitle")} · {detail.supplierReturn.reference}</h3><StatusBadge tone={detail.supplierReturn.status==="RECONCILED"?"success":"warning"}>{purchaseFormGuidance(locale,detail.supplierReturn.status==="RECONCILED"?"returnReconciled":"returnDispatched")}</StatusBadge></div>
          <FinanceDetailGrid>
            <FinanceDetailValue label={purchaseFormGuidance(locale,"returnCreditStockValue")}>{financeMoney(detail.supplierReturn.totalCost,String(detail.currencyCode),locale)}</FinanceDetailValue>
            {Number(detail.supplierReturn.recoverableTaxAmount)>0?<FinanceDetailValue label={purchaseFormGuidance(locale,"returnCreditRecoverableTax")}>{financeMoney(detail.supplierReturn.recoverableTaxAmount,String(detail.currencyCode),locale)}</FinanceDetailValue>:null}
            {detail.supplierReturn.settlementClaimAmount?<><FinanceDetailValue label={purchaseFormGuidance(locale,"returnSettlementPayableReduction")}>{financeMoney(detail.supplierReturn.settlementPayableAmount,String(detail.currencyCode),locale)}</FinanceDetailValue><FinanceDetailValue label={purchaseFormGuidance(locale,detail.supplierReturn.status==="RECONCILED"?"returnSettlementRecognized":"returnSettlementClaim")}>{financeMoney(detail.supplierReturn.settlementClaimAmount,String(detail.currencyCode),locale)}</FinanceDetailValue></>:null}
            <FinanceDetailValue label={purchaseFormGuidance(locale,"returnFinanceReserved")}>{financeMoney(detail.supplierReturnReservedAmount,String(detail.currencyCode),locale)}</FinanceDetailValue>
            <FinanceDetailValue label={purchaseFormGuidance(locale,"returnFinanceAllocatable")}>{financeMoney(detail.supplierReturnAllocatableAmount,String(detail.currencyCode),locale)}</FinanceDetailValue>
          </FinanceDetailGrid>
          <p className="text-xs text-dtsc-muted">{purchaseFormGuidance(locale,detail.supplierReturn.settlementClaimAmount?(detail.supplierReturn.status==="RECONCILED"?"returnFinanceClaimMatched":"returnSettlementClaimReadyHelp"):detail.supplierReturn.status==="RECONCILED"?"returnFinanceMatched":"returnFinanceExplain")}</p>
          <div data-responsive-actions className="flex min-w-0 flex-wrap gap-2">
            <a className="break-words text-sm text-dtsc-blue underline" href={`/enterprise-modules/SUPPLIERS_PURCHASES?purchase=${encodeURIComponent(detail.supplierReturn.purchaseId)}&returnMovement=${encodeURIComponent(detail.supplierReturn.sourceMovementId)}`}>{purchaseFormGuidance(locale,"returnFinanceSource")}</a>
            {detail.supplierReturn.status==="RECONCILED"&&Number(detail.supplierReturn.settlementClaimAmount)>0?<Button type="button" variant="outline" size="sm" disabled={busy} onClick={()=>void openClaimRefund(detail.supplierReturn!.id)}>{locale==="en"?"View or record supplier refund":"Consulter ou enregistrer le remboursement fournisseur"}</Button>:null}
            {detail.supplierReturn.supplierCreditNoteId?<a className="break-words text-sm text-dtsc-blue underline" href={`/enterprise-modules/FINANCE_PAYABLES?supplierCreditNoteId=${encodeURIComponent(detail.supplierReturn.supplierCreditNoteId)}`}>{purchaseFormGuidance(locale,"returnCreditReview")}</a>:null}
          </div>
        </section>:null}
        {!isReceivables && detailKind === "invoice" && detail.threeWayMatch ? <section className="rounded-xl border border-dtsc-border p-4"><h3 className="font-black text-dtsc-ink">{t("poReceiptInvoiceControl")}</h3><div className="mt-3 grid gap-3 sm:grid-cols-3"><FinanceDetailValue label={t("quantity")}>{String(detail.threeWayMatch.quantityVariance ?? 0)}</FinanceDetailValue><FinanceDetailValue label={t("price")}>{String(detail.threeWayMatch.priceVariance ?? 0)}</FinanceDetailValue><FinanceDetailValue label={t("totalVariance")}>{String(detail.threeWayMatch.totalVariance ?? 0)}</FinanceDetailValue></div></section> : null}
        {invoiceIdFor(detail) ? <div data-responsive-actions><Button variant="outline" onClick={() => printCustomerInvoice(invoiceIdFor(detail)!)}><Printer className="h-4 w-4" />{t("printInvoicePreview")}</Button></div> : null}
        {detailHasWorkflow ? <div data-responsive-actions>{(detailKind === "credit" ? creditTransitionActions(detail.status, locale) : invoiceTransitionActions(detail.status, locale, isReceivables)).filter((action) => capabilityAllowsAction(detail, action.action)).map((action) => { const Icon = action.icon; return <Button key={action.action} disabled={busy} variant={action.destructive ? "destructive" : "outline"} onClick={() => setActionTarget({ record: detail, action: action.action, kind: detailKind })}><Icon className="h-4 w-4" />{action.label}</Button>; })}{detailKind === "invoice" && detail.capabilities?.canCreateCredit ? <Button variant="outline" disabled={busy} onClick={() => setCreditTarget(detail)}><FileMinus2 className="h-4 w-4" />{t("createCreditNote")}</Button> : null}</div> : null}
        <FinanceCollaboration organizationId={organizationId} moduleCode={moduleCode} record={detail} locale={locale} />
      </div> : null}
    </Dialog>

    <Dialog open={Boolean(refundClaim)} onClose={()=>{if(!busy){setRefundClaim(null);setRefundPaymentId(null);}}} title={locale==="en"?"Supplier return claim":"Créance sur fournisseur — retour"} presentation="editor" className="max-w-5xl">
      {refundClaim?<div className="grid min-w-0 gap-4">
        <p className="break-words font-semibold">{refundClaim.reference} · {refundClaim.invoiceReference}</p>
        <FinanceDetailGrid>
          <FinanceDetailValue label={locale==="en"?"Recognized claim":"Créance reconnue"}>{financeMoney(refundClaim.original,refundClaim.currencyCode,locale)}</FinanceDetailValue>
          <FinanceDetailValue label={locale==="en"?"Refunded":"Remboursé"}>{financeMoney(refundClaim.refunded,refundClaim.currencyCode,locale)}</FinanceDetailValue>
          <FinanceDetailValue label={locale==="en"?"Offset against supplier debt":"Compensé avec une dette fournisseur"}>{financeMoney(refundClaim.compensated||"0",refundClaim.currencyCode,locale)}</FinanceDetailValue>
          <FinanceDetailValue label={locale==="en"?"Reserved for non-cash offset":"Réservé aux compensations"}>{financeMoney(refundClaim.compensationReserved||"0",refundClaim.currencyCode,locale)}</FinanceDetailValue>
          <FinanceDetailValue label={locale==="en"?"Pending settlements reserved":"Règlements en attente réservés"}>{financeMoney(refundClaim.reserved,refundClaim.currencyCode,locale)}</FinanceDetailValue>
          <FinanceDetailValue label={locale==="en"?"Remaining claim":"Créance restante"}>{financeMoney(refundClaim.remaining,refundClaim.currencyCode,locale)}</FinanceDetailValue>
          <FinanceDetailValue label={locale==="en"?"Available for new refund":"Disponible pour un nouveau remboursement"}>{financeMoney(refundClaim.available,refundClaim.currencyCode,locale)}</FinanceDetailValue>
        </FinanceDetailGrid>
        {refundPaymentId?<section className="grid gap-2 rounded-xl border border-dtsc-border p-3"><p>{locale==="en"?"Draft saved; the claim has not yet been reduced.":"Brouillon enregistré ; la créance n’a pas encore été réduite."}</p><a className="font-semibold text-dtsc-blue underline" href={`/enterprise-modules/FINANCE_PAYMENTS?paymentId=${encodeURIComponent(refundPaymentId)}`}>{locale==="en"?"Open payment for approval":"Ouvrir le paiement pour validation"}</a></section>:refundClaim.canCreate?<form onSubmit={createClaimRefund} className="grid min-w-0 gap-3">
          <p className="text-sm text-dtsc-muted">{locale==="en"?"Record only an actual bank receipt in the original claim currency. A different approver and confirmer are required.":"Enregistrez un remboursement bancaire réellement reçu dans la devise de la créance. Un validateur et un confirmateur distincts sont requis."}</p>
          <Field label={locale==="en"?"Receiving bank account":"Compte bancaire de réception"}><FinanceReferenceSelect organizationId={organizationId} moduleCode="FINANCE_PAYMENTS" kind="financial-account" name="financialAccountId" label={locale==="en"?"Bank account":"Compte bancaire"} locale={rawLocale} required disabled={busy} onOptionChange={option=>setRefundBankValid(Boolean(option?.accountType==="BANK"&&option.currency===refundClaim.currencyCode))}/></Field>
          <Field label={locale==="en"?"Amount received":"Montant reçu"}><Input name="amount" type="number" min="0.000001" step="0.000001" max={refundClaim.available} required disabled={busy}/></Field>
          <Field label={locale==="en"?"Bank receipt date":"Date de réception bancaire"}><Input name="paymentDate" type="date" defaultValue={businessContext?.businessDate||""} min={refundClaim.creditDate.slice(0,10)} required disabled={busy}/></Field>
          <Field label={locale==="en"?"Bank transaction reference":"Référence de transaction bancaire"}><Input name="reference" required maxLength={160} disabled={busy}/></Field>
          <Button type="submit" disabled={busy||!refundBankValid}>{locale==="en"?"Prepare refund draft":"Préparer le brouillon de remboursement"}</Button>
        </form>:<p className="text-sm text-dtsc-muted">{locale==="en"?"No refundable amount is available or payment creation is not authorized.":"Aucun montant disponible ou création de paiement non autorisée."}</p>}
        <SupplierClaimCompensationPanel organizationId={organizationId} claim={refundClaim} locale={locale}
          businessDate={businessContext?.businessDate} canWrite={canWrite} canSubmit={canSubmit} canApprove={canApprove}
          onMutated={()=>{setRefreshKey(value=>value+1);void openClaimRefund(refundClaim.id);}} />
      </div>:null}
    </Dialog>

    <Dialog open={Boolean(actionTarget)} onClose={() => { if (!busy) setActionTarget(null); }} title={actionTarget ? `${actionLabel(actionTarget.action, locale)} · ${String(actionTarget.record.number || actionTarget.record.reference || "")}` : ""} description={t("sodAndPeriodChecked")} presentation="editor" className="max-w-xl">
      {actionTarget ? <form onSubmit={transition} className="grid gap-4">
        {actionTarget.action === "SUBMIT" && actionTarget.kind === "invoice" && isReceivables && canSubmit ? <EnterpriseApproverSelect organizationId={organizationId} moduleCode="FINANCE_RECEIVABLES" locale={rawLocale} /> : null}
        {actionTarget.action === "SUBMIT" && actionTarget.kind === "invoice" && !isReceivables && canSubmit ? <><EnterpriseApproverSelect organizationId={organizationId} moduleCode="FINANCE_PAYABLES" locale={rawLocale} name="reviewerUserId" label={locale === "en" ? "Reviewer" : "Responsable de revue"} /><EnterpriseApproverSelect organizationId={organizationId} moduleCode="FINANCE_PAYABLES" locale={rawLocale} name="approverUserId" label={locale === "en" ? "Final approver" : "Approbateur final"} /></> : null}
        {actionTarget.action === "SUBMIT" && actionTarget.kind === "credit" ? <EnterpriseApproverSelect organizationId={organizationId} moduleCode={moduleCode} locale={rawLocale} /> : null}
        {actionTarget.action === "REVIEW" && actionTarget.kind === "invoice" && !isReceivables ? <label className="flex items-start gap-3 rounded-xl border border-dtsc-border p-3 text-sm"><input type="checkbox" name="verifyInputTaxEvidence" className="mt-1" /><span>{locale === "en" ? "I checked the supplier invoice and input tax evidence." : "Je confirme la vérification de la facture fournisseur et des justificatifs fiscaux."}</span></label> : null}
        {actionTarget.action !== "POST" && actionTarget.action !== "ISSUE" ? <Field label={t("decisionReasonComment")}><textarea name="reason" rows={4} minLength={actionRequiresReason ? 4 : undefined} required={actionRequiresReason} disabled={busy} className="w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 disabled:opacity-60" /><p className="mt-2 text-xs leading-5 text-dtsc-muted">{t(actionRequiresReason ? "rejectionReasonMinimumHint" : "decisionCommentOptionalHint")}</p></Field> : null}
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => setActionTarget(null)}>{t("cancel")}</Button><Button type="submit" disabled={busy || (actionTarget.action === "APPROVE" && !canApprove) || (["POST", "ISSUE"].includes(actionTarget.action) && !canManage)}>{busy ? (locale === "en" ? "Processing…" : "Traitement…") : t("confirmAction")}</Button></div>
      </form> : null}
    </Dialog>

    <Dialog open={Boolean(creditTarget)} onClose={() => { if (!busy) setCreditTarget(null); }} title={t("createCreditNote")} description={t("creditNoteKeepsOriginal")} presentation="editor" className="max-w-2xl">
      {creditTarget ? <form onSubmit={createCredit} className="grid gap-4"><Field label={t("creditDate")}><Input name="creditDate" type="date" defaultValue={businessContext?.businessDate || ""} required disabled={busy} /></Field><Field label={t("detailedReason")}><textarea name="reason" minLength={8} rows={4} required disabled={busy} className="w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 disabled:opacity-60" /></Field><div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => setCreditTarget(null)}>{t("cancel")}</Button><Button type="submit" disabled={busy}>{t("createCreditNote")}</Button></div></form> : null}
    </Dialog>
  </ModuleWorkspace>;
}
