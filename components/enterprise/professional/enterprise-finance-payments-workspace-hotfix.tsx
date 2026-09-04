"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { CheckCircle2, CircleDollarSign, Plus, Send, ShieldCheck, Undo2, XCircle } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Field, NativeSelect } from "@/components/enterprise/core-v2/erp-v2-ui";
import { EnterpriseApproverSelect } from "@/components/enterprise/enterprise-approver-select";
import { FinanceBalanceTargetSelect } from "@/components/enterprise/professional/finance-balance-target-select";
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
import { ProfessionalError, ProfessionalFormSection, ProfessionalHelp, ProfessionalLoading, ProfessionalSearch, ProfessionalTabs } from "@/components/enterprise/professional/professional-erp-ui";
import { financeEnumLabel, financeMoney, financeStatusLabel, financeStatusTone, safeFinanceError, type FinanceLocale } from "@/components/enterprise/professional/finance-professional-ui";
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
type PaymentCapabilities = {
  canSubmit?: boolean;
  canApprove?: boolean;
  canCancel?: boolean;
  canConfirm?: boolean;
  canReconcile?: boolean;
  canReverse?: boolean;
  canAllocate?: boolean;
};
type Payment = FinanceRecord & {
  number: string;
  direction: string;
  paymentType: string;
  methodType: string;
  financialAccountId?: string | null;
  businessPartyId?: string | null;
  employeeId?: string | null;
  payrollRunId?: string | null;
  currencyCode: string;
  amount: string | number;
  unallocatedAmount: string | number;
  paymentDate: string;
  reference?: string | null;
  maskedExternalReference?: string | null;
  revision: number;
  capabilities?: PaymentCapabilities;
};
type ActionTarget = { record: Payment; action: string; label: string };

const financeT = (locale: FinanceLocale, key: EnterpriseFinanceKey) => translateEnterpriseFinance(locale, key);

function paymentActions(record: Payment, locale: FinanceLocale) {
  const caps = record.capabilities || {};
  const actions: Array<{ action: string; label: string; icon: typeof Send; destructive?: boolean }> = [];
  if (caps.canSubmit) actions.push({ action: "SUBMIT", label: financeT(locale, "actionSubmit"), icon: Send });
  if (caps.canApprove) actions.push({ action: "APPROVE", label: financeT(locale, "actionApprove"), icon: CheckCircle2 });
  if (caps.canCancel) actions.push({ action: "CANCEL", label: financeT(locale, "actionCancel"), icon: XCircle, destructive: true });
  if (caps.canConfirm) actions.push({ action: "CONFIRM", label: financeT(locale, "actionConfirm"), icon: ShieldCheck });
  if (caps.canReconcile) actions.push({ action: "RECONCILE", label: financeT(locale, "actionMarkReconciled"), icon: CheckCircle2 });
  if (caps.canReverse) actions.push({ action: "REVERSE", label: financeT(locale, "actionReverse"), icon: Undo2, destructive: true });
  return actions;
}

export function EnterpriseFinancePaymentsWorkspaceHotfix(props: Props) {
  const { organizationId, organizationName, definition, locale: rawLocale, canCreate, canSubmit, canApprove, canWrite, canManage } = props;
  const locale: FinanceLocale = rawLocale === "en" ? "en" : "fr";
  const t = (key: EnterpriseFinanceKey) => financeT(locale, key);
  const searchParams = useSearchParams();
  const [tab, setTab] = useState(searchParams.get("tab") || "all");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [detail, setDetail] = useState<Payment | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [allocationTarget, setAllocationTarget] = useState<Payment | null>(null);
  const [actionTarget, setActionTarget] = useState<ActionTarget | null>(null);
  const [paymentType, setPaymentType] = useState("CUSTOMER_PAYMENT");
  const [direction, setDirection] = useState("INBOUND");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  useToastMessage(message, "success");
  useToastMessage(errorMessage, "error");

  const filters = useMemo<Record<string, string | boolean | undefined>>(() => ({
    direction: tab === "inbound" ? "INBOUND" : tab === "outbound" ? "OUTBOUND" : undefined,
    unallocated: tab === "unallocated" ? true : undefined,
    workflowPending: tab === "approvals" ? true : undefined,
  }), [tab]);
  const collection = useOperationalFinanceCollection<Payment>({
    endpoint: `/api/enterprise/${organizationId}/payments`,
    page,
    search,
    status,
    filters,
    refreshKey,
  });
  const { summary, error: summaryError } = useOperationalFinanceSummary(organizationId, "FINANCE_PAYMENTS", refreshKey);
  const lookupData = useFinanceLookups(organizationId, "FINANCE_PAYMENTS", refreshKey);
  const customerParties = lookupData.lookups.parties.filter((party) => party.roles?.some((role) => role.roleCode === "CUSTOMER"));
  const supplierParties = lookupData.lookups.parties.filter((party) => party.roles?.some((role) => role.roleCode === "SUPPLIER"));
  const compatibleParties = paymentType === "CUSTOMER_PAYMENT" ? customerParties : paymentType === "SUPPLIER_PAYMENT" ? supplierParties : lookupData.lookups.parties;

  useEffect(() => {
    const deepId = searchParams.get("paymentId");
    if (!deepId) return;
    fetchOperationalFinanceRecord<Payment>(`/api/enterprise/${organizationId}/payments`, deepId)
      .then((record) => { if (record) setDetail(record); })
      .catch((error) => setErrorMessage(safeFinanceError(error, t("financeDetails"))));
  }, [organizationId, searchParams]);

  function changePaymentType(value: string) {
    setPaymentType(value);
    if (value === "CUSTOMER_PAYMENT") setDirection("INBOUND");
    else if (value === "SUPPLIER_PAYMENT" || value === "PAYROLL_PAYMENT" || value === "EXPENSE_REIMBURSEMENT" || value === "TAX_PAYMENT") setDirection("OUTBOUND");
  }

  async function createPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true); setMessage(""); setErrorMessage("");
    try {
      await financeMutation(`/api/enterprise/${organizationId}/payments`, {
        direction,
        paymentType,
        methodType: String(form.get("methodType") || "BANK_TRANSFER"),
        financialAccountId: String(form.get("financialAccountId") || "") || undefined,
        businessPartyId: ["CUSTOMER_PAYMENT", "SUPPLIER_PAYMENT"].includes(paymentType) ? String(form.get("businessPartyId") || "") || undefined : undefined,
        employeeId: paymentType === "EXPENSE_REIMBURSEMENT" ? String(form.get("employeeId") || "") || undefined : undefined,
        payrollRunId: paymentType === "PAYROLL_PAYMENT" ? String(form.get("payrollRunId") || "") || undefined : undefined,
        currencyCode: String(form.get("currencyCode") || "USD").toUpperCase(),
        amount: String(form.get("amount") || "0"),
        paymentDate: String(form.get("paymentDate") || ""),
        reference: String(form.get("reference") || "") || undefined,
        maskedExternalReference: String(form.get("maskedExternalReference") || "") || undefined,
        idempotencyKey: crypto.randomUUID(),
      });
      setCreateOpen(false); setRefreshKey((value) => value + 1); setMessage(t("paymentSavedDraft"));
    } catch (error) {
      setErrorMessage(safeFinanceError(error, t("paymentCreationFailed")));
    } finally { setBusy(false); }
  }

  async function transition(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!actionTarget) return;
    const form = new FormData(event.currentTarget);
    setBusy(true); setErrorMessage("");
    try {
      await financeMutation(`/api/enterprise/${organizationId}/payments/${actionTarget.record.id}/transition`, {
        action: actionTarget.action,
        reason: String(form.get("reason") || "") || undefined,
        revision: actionTarget.record.revision,
        ...(actionTarget.action === "SUBMIT" ? { approverUserId: String(form.get("approverUserId") || "") } : {}),
      });
      setActionTarget(null); setDetail(null); setRefreshKey((value) => value + 1); setMessage(t("financeWorkflowUpdated"));
    } catch (error) {
      setErrorMessage(safeFinanceError(error, t("transitionFailed")));
    } finally { setBusy(false); }
  }

  async function allocate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!allocationTarget) return;
    const form = new FormData(event.currentTarget);
    const targetId = String(form.get("targetId") || "");
    setBusy(true); setErrorMessage("");
    try {
      await financeMutation(`/api/enterprise/${organizationId}/payments/${allocationTarget.id}/allocations`, {
        receivableId: allocationTarget.direction === "INBOUND" ? targetId : undefined,
        payableId: allocationTarget.direction === "OUTBOUND" ? targetId : undefined,
        amount: String(form.get("amount") || "0"),
      });
      setAllocationTarget(null); setDetail(null); setRefreshKey((value) => value + 1); setMessage(t("allocationSaved"));
    } catch (error) {
      setErrorMessage(safeFinanceError(error, t("allocationFailed")));
    } finally { setBusy(false); }
  }

  const tabs = [
    { id: "all", label: t("allPayments") },
    { id: "inbound", label: t("collections") },
    { id: "outbound", label: t("disbursements") },
    { id: "unallocated", label: t("unallocated") },
    { id: "approvals", label: t("toApprove") },
  ];

  return <ModuleWorkspace>
    <ModuleHeader
      eyebrow={`${t("paymentsEyebrow")} · ${organizationName}`}
      title={t("paymentsTitle")}
      description={locale === "en" ? definition.descriptionEn : definition.descriptionFr}
      count={`${collection.pagination.total}`}
      primaryAction={canCreate ? <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" />{t("newPayment")}</Button> : undefined}
    />
    <ModuleMetrics label={t("financeCycleMetrics")}>
      <ModuleMetric label={t("collections")} value={summary?.inboundCount || 0} />
      <ModuleMetric label={t("disbursements")} value={summary?.outboundCount || 0} />
      <ModuleMetric label={t("unallocated")} value={summary?.unallocatedCount || 0} />
      <ModuleMetric label={t("toApprove")} value={summary?.pendingApprovalCount || 0} />
    </ModuleMetrics>
    <ModuleToolbar
      search={<ProfessionalSearch value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder={t("financeSearchPlaceholder")} />}
      controls={<div className="grid min-w-0 gap-2"><ProfessionalTabs value={tab} onChange={(value) => { setTab(value); setStatus(""); setPage(1); setDetail(null); }} items={tabs} label={t("financeViews")} /><NativeSelect value={status} onChange={(value) => { setStatus(value); setPage(1); }} items={[{ id: "", label: t("allStatuses") }, ...["DRAFT", "PENDING_APPROVAL", "APPROVED", "CONFIRMED", "RECONCILED", "CANCELLED", "REVERSED"].map((id) => ({ id, label: financeStatusLabel(id, locale) }))]} /></div>}
      summary={t("currenciesSeparated")}
    />
    <ModuleContent>
      {summaryError ? <ProfessionalError message={summaryError} /> : null}
      {lookupData.error ? <ProfessionalError message={lookupData.error} /> : null}
      <ModuleSection title={tabs.find((item) => item.id === tab)?.label || ""} description={t("paymentsSectionDescription")}>
        {collection.error ? <ProfessionalError message={collection.error} /> : collection.loading ? <ProfessionalLoading /> : <FinanceRecordList items={collection.items} locale={locale} emptyTitle={t("noItemInView")} emptyDescription={t("professionalFormOrFilters")} onOpen={(record) => setDetail(record as Payment)} />}
        <FinancePaginationControls pagination={collection.pagination} page={page} onPage={setPage} locale={locale} />
      </ModuleSection>
      <ProfessionalHelp moduleCode="FINANCE_PAYMENTS" />
    </ModuleContent>

    <Dialog open={createOpen} onClose={() => { if (!busy) setCreateOpen(false); }} title={t("newPayment")} description={t("paymentCreationDescription")} presentation="editor" className="max-w-4xl">
      <form onSubmit={createPayment} className="grid gap-6">
        <ProfessionalFormSection title={t("paymentNature")}>
          <Field label={t("type")}><NativeSelect name="paymentType" value={paymentType} onChange={changePaymentType} required items={["CUSTOMER_PAYMENT", "SUPPLIER_PAYMENT", "PAYROLL_PAYMENT", "EXPENSE_REIMBURSEMENT", "TAX_PAYMENT", "REFUND", "OTHER"].map((id) => ({ id, label: financeEnumLabel(id, locale) }))} /></Field>
          <Field label={t("direction")}><NativeSelect name="direction" value={direction} onChange={setDirection} disabled={["CUSTOMER_PAYMENT", "SUPPLIER_PAYMENT", "PAYROLL_PAYMENT"].includes(paymentType)} required items={["INBOUND", "OUTBOUND"].map((id) => ({ id, label: financeEnumLabel(id, locale) }))} /></Field>
          <Field label={t("method")}><NativeSelect name="methodType" defaultValue="BANK_TRANSFER" required items={["BANK_TRANSFER", "CASH", "MOBILE_MONEY", "CARD", "CHEQUE", "OTHER"].map((id) => ({ id, label: financeEnumLabel(id, locale) }))} /></Field>
          <Field label={t("financialAccount")}><NativeSelect name="financialAccountId" required items={lookupData.accounts.map((account) => ({ id: account.id, label: `${account.code} · ${account.name} · ${account.currencyCode}` }))} /></Field>
        </ProfessionalFormSection>
        <ProfessionalFormSection title={t("counterparty")}>
          {["CUSTOMER_PAYMENT", "SUPPLIER_PAYMENT"].includes(paymentType) ? <Field label={paymentType === "CUSTOMER_PAYMENT" ? t("customer") : t("supplier")}><NativeSelect name="businessPartyId" required items={compatibleParties.map((party) => ({ id: party.id, label: `${party.code || ""} ${party.displayName || party.legalName}`.trim() }))} /></Field> : null}
          {paymentType === "EXPENSE_REIMBURSEMENT" ? <Field label={t("employee")}><NativeSelect name="employeeId" required items={lookupData.lookups.employees.map((employee) => ({ id: employee.id, label: `${employee.employeeNumber} · ${employee.displayName}` }))} /></Field> : null}
          {paymentType === "PAYROLL_PAYMENT" ? <Field label={t("payroll")}><NativeSelect name="payrollRunId" required items={lookupData.lookups.payrollPeriods.map((period) => ({ id: period.id, label: `${period.code} · ${period.name}` }))} /></Field> : null}
        </ProfessionalFormSection>
        <ProfessionalFormSection title={t("amountAndReference")}>
          <Field label={t("amount")}><Input name="amount" type="number" min="0.01" step="0.01" required /></Field>
          <Field label={t("currency")}><Input name="currencyCode" defaultValue="USD" maxLength={3} required /></Field>
          <Field label={t("date")}><Input name="paymentDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required /></Field>
          <Field label={t("reference")}><Input name="reference" /></Field>
          <Field label={t("externalReference")}><Input name="maskedExternalReference" /></Field>
        </ProfessionalFormSection>
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => setCreateOpen(false)}>{t("cancel")}</Button><Button type="submit" disabled={busy}>{busy ? (locale === "en" ? "Saving…" : "Enregistrement…") : t("saveDraft")}</Button></div>
      </form>
    </Dialog>

    <Dialog open={Boolean(detail)} onClose={() => setDetail(null)} title={detail?.number || t("financeDetails")} presentation="editor" className="max-w-5xl">
      {detail ? <div className="grid gap-5">
        <div className="flex flex-wrap gap-2">{detail.status ? <StatusBadge tone={financeStatusTone(detail.status)}>{financeStatusLabel(detail.status, locale)}</StatusBadge> : null}<StatusBadge>{financeEnumLabel(detail.direction, locale)}</StatusBadge><StatusBadge>{detail.currencyCode}</StatusBadge></div>
        <FinanceDetailGrid>
          <FinanceDetailValue label={t("type")}>{financeEnumLabel(detail.paymentType, locale)}</FinanceDetailValue>
          <FinanceDetailValue label={t("method")}>{financeEnumLabel(detail.methodType, locale)}</FinanceDetailValue>
          <FinanceDetailValue label={t("amount")}>{financeMoney(detail.amount, detail.currencyCode, locale)}</FinanceDetailValue>
          <FinanceDetailValue label={t("unallocated")}>{financeMoney(detail.unallocatedAmount, detail.currencyCode, locale)}</FinanceDetailValue>
          <FinanceDetailValue label={t("date")}>{detail.paymentDate}</FinanceDetailValue>
        </FinanceDetailGrid>
        <div data-responsive-actions>{paymentActions(detail, locale).map(({ action, label, icon: Icon, destructive }) => <Button key={action} variant={destructive ? "destructive" : "outline"} disabled={busy} onClick={() => setActionTarget({ record: detail, action, label })}><Icon className="h-4 w-4" />{label}</Button>)}{detail.capabilities?.canAllocate ? <Button variant="outline" disabled={busy} onClick={() => setAllocationTarget(detail)}><CircleDollarSign className="h-4 w-4" />{t("allocate")}</Button> : null}</div>
        <FinanceCollaboration organizationId={organizationId} moduleCode="FINANCE_PAYMENTS" record={detail} locale={locale} />
      </div> : null}
    </Dialog>

    <Dialog open={Boolean(actionTarget)} onClose={() => { if (!busy) setActionTarget(null); }} title={actionTarget ? `${actionTarget.label} · ${actionTarget.record.number}` : ""} description={t("sodAndPeriodChecked")} presentation="editor" className="max-w-xl">
      {actionTarget ? <form onSubmit={transition} className="grid gap-4">
        {actionTarget.action === "SUBMIT" && canSubmit ? <EnterpriseApproverSelect organizationId={organizationId} moduleCode="FINANCE_PAYMENTS" locale={rawLocale} /> : null}
        {["CANCEL", "REVERSE"].includes(actionTarget.action) ? <Field label={t("decisionReasonComment")}><textarea name="reason" minLength={4} rows={4} required className="w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2" /></Field> : <Field label={t("decisionReasonComment")}><textarea name="reason" rows={3} className="w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2" /></Field>}
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => setActionTarget(null)}>{t("cancel")}</Button><Button type="submit" disabled={busy || (actionTarget.action === "APPROVE" && !canApprove) || (actionTarget.action === "CONFIRM" && !canWrite) || (["RECONCILE", "REVERSE"].includes(actionTarget.action) && !canManage)}>{busy ? (locale === "en" ? "Processing…" : "Traitement…") : t("confirmAction")}</Button></div>
      </form> : null}
    </Dialog>

    <Dialog open={Boolean(allocationTarget)} onClose={() => { if (!busy) setAllocationTarget(null); }} title={t("allocatePayment")} description={t("allocationServerControls")} presentation="editor" className="max-w-2xl">
      {allocationTarget ? <form onSubmit={allocate} className="grid gap-4">
        <Field label={t("type")}><NativeSelect name="targetType" disabled defaultValue={allocationTarget.direction === "INBOUND" ? "receivable" : "payable"} items={[{ id: allocationTarget.direction === "INBOUND" ? "receivable" : "payable", label: allocationTarget.direction === "INBOUND" ? t("customerReceivable") : t("supplierPayable") }]} /></Field>
        <FinanceBalanceTargetSelect organizationId={organizationId} direction={allocationTarget.direction} businessPartyId={allocationTarget.businessPartyId} currencyCode={allocationTarget.currencyCode} locale={locale} />
        <Field label={t("amount")}><Input name="amount" type="number" min="0.01" step="0.01" max={String(allocationTarget.unallocatedAmount)} defaultValue={String(allocationTarget.unallocatedAmount)} required /></Field>
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => setAllocationTarget(null)}>{t("cancel")}</Button><Button type="submit" disabled={busy}>{t("allocate")}</Button></div>
      </form> : null}
    </Dialog>
  </ModuleWorkspace>;
}
