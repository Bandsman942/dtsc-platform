"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ArrowRightLeft, CheckCircle2, CircleDollarSign, Plus, Send, ShieldCheck, Undo2, XCircle } from "lucide-react";
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
  type OpenBalanceLookup,
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
  financeEnumLabel,
  financeMoney,
  financeStatusLabel,
  financeStatusTone,
  safeFinanceError,
  type FinanceLocale,
} from "@/components/enterprise/professional/finance-professional-ui";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ModuleMetric, ModuleMetrics } from "@/components/workspace/module-metrics";
import { ModuleContent, ModuleHeader, ModuleSection, ModuleToolbar, ModuleWorkspace } from "@/components/workspace/module-workspace";
import { StatusBadge } from "@/components/workspace/status-badge";
import type { EnterpriseModuleDefinition } from "@/lib/enterprise/module-registry";
import { translateEnterpriseFinance, type EnterpriseFinanceKey } from "@/lib/i18n";

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
};

type FinanceAction = { action: string; label: string; icon: typeof Send };
type ActionTarget = { record: FinanceRecord; action: string; label: string; kind: "payment" | "transfer" };

const financeT = (locale: FinanceLocale, key: EnterpriseFinanceKey) => translateEnterpriseFinance(locale, key);

function paymentActions(status: string | undefined, locale: FinanceLocale): FinanceAction[] {
  if (status === "DRAFT") return [
    { action: "SUBMIT", label: financeT(locale, "actionSubmit"), icon: Send },
    { action: "CANCEL", label: financeT(locale, "actionCancel"), icon: XCircle },
  ];
  if (status === "PENDING_APPROVAL") return [
    { action: "APPROVE", label: financeT(locale, "actionApprove"), icon: CheckCircle2 },
    { action: "CANCEL", label: financeT(locale, "actionReject"), icon: XCircle },
  ];
  if (status === "APPROVED") return [{ action: "CONFIRM", label: financeT(locale, "actionConfirm"), icon: ShieldCheck }];
  if (status === "CONFIRMED") return [
    { action: "RECONCILE", label: financeT(locale, "actionMarkReconciled"), icon: CheckCircle2 },
    { action: "REVERSE", label: financeT(locale, "actionReverse"), icon: Undo2 },
  ];
  if (status === "RECONCILED") return [{ action: "REVERSE", label: financeT(locale, "actionReverse"), icon: Undo2 }];
  return [];
}

function transferActions(status: string | undefined, locale: FinanceLocale): FinanceAction[] {
  if (status === "DRAFT" || status === "PENDING_APPROVAL") return [{ action: "APPROVE", label: financeT(locale, "actionApprove"), icon: CheckCircle2 }];
  if (status === "APPROVED") return [{ action: "CONFIRM", label: financeT(locale, "actionExecuteAndConfirm"), icon: ShieldCheck }];
  return [];
}

export function EnterpriseFinancePaymentsTreasuryWorkspace({
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
  const t = (key: EnterpriseFinanceKey) => financeT(locale, key);
  const moduleCode = definition.code as "FINANCE_PAYMENTS" | "FINANCE_TREASURY";
  const isPayments = moduleCode === "FINANCE_PAYMENTS";
  const searchParams = useSearchParams();
  const [tab, setTab] = useState(searchParams.get("tab") || (isPayments ? "all" : "accounts"));
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [detail, setDetail] = useState<FinanceRecord | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [allocationTarget, setAllocationTarget] = useState<Payment | null>(null);
  const [actionTarget, setActionTarget] = useState<ActionTarget | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const endpoint = isPayments ? "payments" : tab === "transfers" ? "account-transfers" : "financial-accounts";
  const effectiveStatus = status || (isPayments && tab === "approvals" ? "PENDING_APPROVAL" : "");
  const collection = useFinanceCollection<FinanceRecord>({
    endpoint: `/api/enterprise/${organizationId}/${endpoint}`,
    page,
    search,
    status: effectiveStatus,
    refreshKey,
  });
  const lookupData = useFinanceLookups(organizationId, moduleCode, refreshKey);

  const visibleItems = useMemo(() => {
    if (!isPayments) return collection.items;
    if (tab === "inbound") return collection.items.filter((item) => item.direction === "INBOUND");
    if (tab === "outbound") return collection.items.filter((item) => item.direction === "OUTBOUND");
    if (tab === "unallocated") return collection.items.filter((item) => Number(item.unallocatedAmount || 0) > 0 && ["CONFIRMED", "RECONCILED"].includes(String(item.status)));
    return collection.items;
  }, [collection.items, isPayments, tab]);

  useEffect(() => {
    const key = isPayments ? "paymentId" : tab === "transfers" ? "transferId" : "accountId";
    const deepId = searchParams.get(key);
    if (!deepId) return;
    const found = collection.items.find((item) => item.id === deepId);
    if (found) setDetail(found);
  }, [collection.items, isPayments, searchParams, tab]);

  async function createPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError("");
    try {
      await financeMutation(`/api/enterprise/${organizationId}/payments`, {
        direction: String(form.get("direction") || "INBOUND"),
        paymentType: String(form.get("paymentType") || "CUSTOMER_PAYMENT"),
        methodType: String(form.get("methodType") || "BANK_TRANSFER"),
        financialAccountId: String(form.get("financialAccountId") || "") || undefined,
        businessPartyId: String(form.get("businessPartyId") || "") || undefined,
        employeeId: String(form.get("employeeId") || "") || undefined,
        payrollRunId: String(form.get("payrollRunId") || "") || undefined,
        currencyCode: String(form.get("currencyCode") || "USD").toUpperCase(),
        amount: String(form.get("amount") || "0"),
        paymentDate: String(form.get("paymentDate") || ""),
        reference: String(form.get("reference") || "") || undefined,
        maskedExternalReference: String(form.get("maskedExternalReference") || "") || undefined,
        idempotencyKey: crypto.randomUUID(),
      });
      setCreateOpen(false);
      setRefreshKey((value) => value + 1);
      setMessage(t("paymentSavedDraft"));
    } catch (createError) {
      setError(safeFinanceError(createError, t("paymentCreationFailed")));
    }
  }

  async function createFinancialAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await financeMutation(`/api/enterprise/${organizationId}/financial-accounts`, {
        code: String(form.get("code") || ""),
        name: String(form.get("name") || ""),
        accountType: String(form.get("accountType") || "BANK"),
        currencyCode: String(form.get("currencyCode") || "USD").toUpperCase(),
        maskedReference: String(form.get("maskedReference") || "") || undefined,
        openingBalance: String(form.get("openingBalance") || "0"),
        ledgerAccountId: String(form.get("ledgerAccountId") || ""),
        responsibleUserId: String(form.get("responsibleUserId") || "") || undefined,
        siteId: String(form.get("siteId") || "") || undefined,
      });
      setCreateOpen(false);
      setRefreshKey((value) => value + 1);
      setMessage(t("financialAccountCreated"));
    } catch (createError) {
      setError(safeFinanceError(createError, t("accountCreationFailed")));
    }
  }

  async function createTransfer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await financeMutation(`/api/enterprise/${organizationId}/account-transfers`, {
        sourceFinancialAccountId: String(form.get("sourceFinancialAccountId") || ""),
        targetFinancialAccountId: String(form.get("targetFinancialAccountId") || ""),
        sourceAmount: String(form.get("sourceAmount") || "0"),
        targetAmount: String(form.get("targetAmount") || "0"),
        exchangeRate: String(form.get("exchangeRate") || "") || undefined,
        transferDate: String(form.get("transferDate") || ""),
      });
      setTransferOpen(false);
      setTab("transfers");
      setRefreshKey((value) => value + 1);
      setMessage(t("transferPrepared"));
    } catch (createError) {
      setError(safeFinanceError(createError, t("transferCreationFailed")));
    }
  }

  async function transition(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!actionTarget) return;
    const form = new FormData(event.currentTarget);
    const endpointPath = actionTarget.kind === "payment"
      ? `/api/enterprise/${organizationId}/payments/${actionTarget.record.id}/transition`
      : `/api/enterprise/${organizationId}/account-transfers/${actionTarget.record.id}/transition`;
    try {
      await financeMutation(endpointPath, {
        action: actionTarget.action,
        reason: String(form.get("reason") || "") || undefined,
        revision: actionTarget.record.revision,
      });
      setActionTarget(null);
      setDetail(null);
      setRefreshKey((value) => value + 1);
      setMessage(t("financeWorkflowUpdated"));
    } catch (transitionError) {
      setError(safeFinanceError(transitionError, t("transitionFailed")));
    }
  }

  async function allocate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!allocationTarget) return;
    const form = new FormData(event.currentTarget);
    const targetType = String(form.get("targetType") || "");
    const targetId = String(form.get("targetId") || "");
    try {
      await financeMutation(`/api/enterprise/${organizationId}/payments/${allocationTarget.id}/allocations`, {
        receivableId: targetType === "receivable" ? targetId : undefined,
        payableId: targetType === "payable" ? targetId : undefined,
        amount: String(form.get("amount") || "0"),
      });
      setAllocationTarget(null);
      setDetail(null);
      setRefreshKey((value) => value + 1);
      setMessage(t("paymentAllocated"));
    } catch (allocationError) {
      setError(safeFinanceError(allocationError, t("allocationFailed")));
    }
  }

  const paymentTabs = [
    { id: "all", label: t("allPayments") },
    { id: "inbound", label: t("receipts") },
    { id: "outbound", label: t("disbursements") },
    { id: "unallocated", label: t("unallocated") },
    { id: "approvals", label: t("toApprove") },
  ];
  const treasuryTabs = [
    { id: "accounts", label: t("financialAccounts") },
    { id: "transfers", label: t("transfers") },
  ];
  const tabs = isPayments ? paymentTabs : treasuryTabs;
  const unallocatedCount = collection.items.filter((item) => Number(item.unallocatedAmount || 0) > 0).length;
  const pendingCount = collection.items.filter((item) => ["DRAFT", "PENDING_APPROVAL", "APPROVED"].includes(String(item.status))).length;

  const compatibleTargets = useMemo(() => {
    if (!allocationTarget) return [] as Array<{ type: "receivable" | "payable"; item: OpenBalanceLookup }>;
    const source = allocationTarget.direction === "INBOUND" ? lookupData.receivables : lookupData.payables;
    const type = allocationTarget.direction === "INBOUND" ? "receivable" : "payable";
    return source
      .filter((item) => item.currencyCode === allocationTarget.currencyCode)
      .filter((item) => !allocationTarget.businessPartyId || item.businessPartyId === allocationTarget.businessPartyId)
      .map((item) => ({ type: type as "receivable" | "payable", item }));
  }, [allocationTarget, lookupData.payables, lookupData.receivables]);

  return (
    <ModuleWorkspace>
      <ModuleHeader
        eyebrow={`${t(isPayments ? "paymentsAllocationsEyebrow" : "treasuryEyebrow")} · ${organizationName}`}
        title={t(isPayments ? "professionalPaymentsTitle" : "accountsTransfersTitle")}
        description={locale === "en" ? definition.descriptionEn : definition.descriptionFr}
        count={`${collection.pagination.total}`}
        primaryAction={canManage ? <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" />{t(isPayments ? "newPayment" : "newAccount")}</Button> : undefined}
        secondaryActions={!isPayments && canManage ? <Button variant="outline" onClick={() => setTransferOpen(true)}><ArrowRightLeft className="h-4 w-4" />{t("newTransfer")}</Button> : undefined}
      />
      <ModuleMetrics label={t("operationalMetrics")}>
        <ModuleMetric label={t("viewTotal")} value={collection.pagination.total} />
        <ModuleMetric label={t("pending")} value={pendingCount} />
        <ModuleMetric label={t("unallocated")} value={isPayments ? unallocatedCount : 0} />
        <ModuleMetric label={t("activeAccounts")} value={isPayments ? lookupData.accounts.length : collection.items.filter((item) => item.status === "ACTIVE").length} />
      </ModuleMetrics>
      <ModuleToolbar
        search={<ProfessionalSearch value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder={t("paymentSearchPlaceholder")} />}
        controls={<div className="grid min-w-0 gap-2"><ProfessionalTabs value={tab} onChange={(value) => { setTab(value); setStatus(""); setPage(1); }} items={tabs} label={t("moduleViews")} /><NativeSelect value={status} onChange={(value) => { setStatus(value); setPage(1); }} items={[{ id: "", label: t("allStatuses") }, ...["DRAFT", "PENDING_APPROVAL", "APPROVED", "CONFIRMED", "RECONCILED", "CANCELLED", "REVERSED", "ACTIVE", "INACTIVE"].map((id) => ({ id, label: financeStatusLabel(id, locale) }))]} /></div>}
        summary={t("amountsAccountsControlled")}
      />
      <ModuleContent>
        {message ? <div role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm font-bold text-emerald-800 dark:text-emerald-200">{message}</div> : null}
        {error ? <ProfessionalError message={error} /> : null}
        {lookupData.error ? <ProfessionalError message={lookupData.error} /> : null}
        <ModuleSection title={tabs.find((item) => item.id === tab)?.label || ""} description={t(isPayments ? "paymentSectionDescription" : "treasurySectionDescription")}>
          {collection.error ? <ProfessionalError message={collection.error} /> : collection.loading ? <ProfessionalLoading /> : <FinanceRecordList items={visibleItems} locale={locale} emptyTitle={t("noItem")} emptyDescription={t("firstAuthorizedOrFilters")} onOpen={setDetail} />}
          <FinancePaginationControls pagination={collection.pagination} page={page} onPage={setPage} locale={locale} />
        </ModuleSection>
        <ProfessionalHelp moduleCode={moduleCode} />
      </ModuleContent>

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} title={t(isPayments ? "newPayment" : "newFinancialAccount")} className="h-[94dvh] max-w-4xl">
        {isPayments ? <form onSubmit={createPayment} className="grid gap-6">
          <ProfessionalFormSection title={t("paymentNature")}>
            <Field label={t("direction")}><NativeSelect name="direction" defaultValue="INBOUND" required items={[{ id: "INBOUND", label: financeEnumLabel("INBOUND", locale) }, { id: "OUTBOUND", label: financeEnumLabel("OUTBOUND", locale) }]} /></Field>
            <Field label={t("type")}><NativeSelect name="paymentType" defaultValue="CUSTOMER_PAYMENT" required items={["CUSTOMER_PAYMENT", "SUPPLIER_PAYMENT", "PAYROLL_PAYMENT", "EXPENSE_REIMBURSEMENT", "TAX_PAYMENT", "REFUND", "OTHER"].map((id) => ({ id, label: financeEnumLabel(id, locale) }))} /></Field>
            <Field label={t("paymentMethod")}><NativeSelect name="methodType" defaultValue="BANK_TRANSFER" required items={["CASH", "BANK_TRANSFER", "CARD", "MOBILE_MONEY", "CHEQUE", "CREDIT", "OTHER"].map((id) => ({ id, label: financeEnumLabel(id, locale) }))} /></Field>
            <Field label={t("financialAccount")}><NativeSelect name="financialAccountId" items={lookupData.accounts.map((account) => ({ id: account.id, label: `${account.code} · ${account.name} · ${account.currencyCode}` }))} /></Field>
          </ProfessionalFormSection>
          <ProfessionalFormSection title={t("partyOrEmployee")}>
            <Field label={t("party")}><NativeSelect name="businessPartyId" items={lookupData.lookups.parties.map((party) => ({ id: party.id, label: party.displayName || party.legalName }))} /></Field>
            <Field label={t("employee")}><NativeSelect name="employeeId" items={lookupData.lookups.employees.map((employee) => ({ id: employee.id, label: `${employee.employeeNumber} · ${employee.displayName}` }))} /></Field>
            <Field label={t("payrollPeriod")}><NativeSelect name="payrollRunId" items={lookupData.lookups.payrollPeriods.map((period) => ({ id: period.id, label: `${period.code} · ${period.name}` }))} /></Field>
          </ProfessionalFormSection>
          <ProfessionalFormSection title={t("amountAndReferences")}>
            <Field label={t("amount")}><Input name="amount" type="number" inputMode="decimal" min="0.01" step="0.01" required /></Field>
            <Field label={t("currency")}><Input name="currencyCode" defaultValue="USD" maxLength={3} required /></Field>
            <Field label={t("date")}><Input name="paymentDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required /></Field>
            <Field label={t("externalReference")}><Input name="maskedExternalReference" /></Field>
            <Field label={t("purpose")}><Input name="reference" /></Field>
          </ProfessionalFormSection>
          <div className="sticky bottom-0 flex justify-end gap-2 border-t border-dtsc-border bg-dtsc-surface py-3"><Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>{t("cancel")}</Button><Button type="submit">{t("saveDraft")}</Button></div>
        </form> : <form onSubmit={createFinancialAccount} className="grid gap-6">
          <ProfessionalFormSection title={t("identification")}>
            <Field label={t("code")}><Input name="code" required /></Field>
            <Field label={t("name")}><Input name="name" required /></Field>
            <Field label={t("accountType")}><NativeSelect name="accountType" defaultValue="BANK" required items={["BANK", "CASH", "MOBILE_MONEY", "CLEARING"].map((id) => ({ id, label: financeEnumLabel(id, locale) }))} /></Field>
            <Field label={t("currency")}><Input name="currencyCode" defaultValue="USD" maxLength={3} required /></Field>
          </ProfessionalFormSection>
          <ProfessionalFormSection title={t("linkageAndSecurity")}>
            <Field label={t("linkedLedgerAccount")}><NativeSelect name="ledgerAccountId" required items={lookupData.ledgerAccounts.map((account) => ({ id: account.id, label: `${account.code} · ${locale === "fr" ? account.nameFr : account.nameEn}` }))} /></Field>
            <Field label={t("owner")}><NativeSelect name="responsibleUserId" items={lookupData.lookups.members.map((member) => ({ id: member.id, label: member.label }))} /></Field>
            <Field label={t("site")}><NativeSelect name="siteId" items={lookupData.lookups.sites.map((site) => ({ id: site.id, label: `${site.code} · ${site.name}` }))} /></Field>
            <Field label={t("maskedReference")}><Input name="maskedReference" placeholder="•••• 1234" /></Field>
            <Field label={t("openingBalance")}><Input name="openingBalance" type="number" inputMode="decimal" defaultValue="0" step="0.01" /></Field>
          </ProfessionalFormSection>
          <div className="sticky bottom-0 flex justify-end gap-2 border-t border-dtsc-border bg-dtsc-surface py-3"><Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>{t("cancel")}</Button><Button type="submit">{t("createAccount")}</Button></div>
        </form>}
      </Dialog>

      <Dialog open={transferOpen} onClose={() => setTransferOpen(false)} title={t("newTransfer")} description={t("transferDescription")} className="max-w-3xl">
        <form onSubmit={createTransfer} className="grid gap-5">
          <ProfessionalFormSection title={t("accounts")}>
            <Field label={t("sourceAccount")}><NativeSelect name="sourceFinancialAccountId" required items={lookupData.accounts.map((account) => ({ id: account.id, label: `${account.code} · ${account.name} · ${account.currencyCode}` }))} /></Field>
            <Field label={t("targetAccount")}><NativeSelect name="targetFinancialAccountId" required items={lookupData.accounts.map((account) => ({ id: account.id, label: `${account.code} · ${account.name} · ${account.currencyCode}` }))} /></Field>
          </ProfessionalFormSection>
          <ProfessionalFormSection title={t("amounts")}>
            <Field label={t("sourceAmount")}><Input name="sourceAmount" type="number" inputMode="decimal" min="0.01" step="0.01" required /></Field>
            <Field label={t("targetAmount")}><Input name="targetAmount" type="number" inputMode="decimal" min="0.01" step="0.01" required /></Field>
            <Field label={t("exchangeRate")}><Input name="exchangeRate" type="number" inputMode="decimal" min="0.000001" step="0.000001" /></Field>
            <Field label={t("date")}><Input name="transferDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required /></Field>
          </ProfessionalFormSection>
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setTransferOpen(false)}>{t("cancel")}</Button><Button type="submit"><ArrowRightLeft className="h-4 w-4" />{t("prepareTransfer")}</Button></div>
        </form>
      </Dialog>

      <Dialog open={Boolean(detail)} onClose={() => setDetail(null)} title={detail ? String(detail.number || detail.reference || detail.name || detail.code || "") : ""} className="h-[92dvh] max-w-4xl">
        {detail ? <div className="grid gap-5">
          <div className="flex flex-wrap gap-2">{detail.status ? <StatusBadge tone={financeStatusTone(detail.status)}>{financeStatusLabel(detail.status, locale)}</StatusBadge> : null}{detail.currencyCode ? <StatusBadge>{String(detail.currencyCode)}</StatusBadge> : null}</div>
          <FinanceDetailGrid>
            <FinanceDetailValue label={t("amount")}>{financeMoney(detail.amount ?? detail.operationalBalance ?? detail.sourceAmount, String(detail.currencyCode || detail.sourceCurrencyCode || "USD"), locale)}</FinanceDetailValue>
            {detail.unallocatedAmount !== undefined ? <FinanceDetailValue label={t("unallocatedAmount")}>{financeMoney(detail.unallocatedAmount, String(detail.currencyCode || "USD"), locale)}</FinanceDetailValue> : null}
            {detail.availableBalance !== undefined ? <FinanceDetailValue label={t("available")}>{financeMoney(detail.availableBalance, String(detail.currencyCode || "USD"), locale)}</FinanceDetailValue> : null}
            {detail.accountType ? <FinanceDetailValue label={t("accountType")}>{financeEnumLabel(String(detail.accountType), locale)}</FinanceDetailValue> : null}
            {detail.methodType ? <FinanceDetailValue label={t("method")}>{financeEnumLabel(String(detail.methodType), locale)}</FinanceDetailValue> : null}
            {detail.maskedReference ? <FinanceDetailValue label={t("maskedReference")}>{String(detail.maskedReference)}</FinanceDetailValue> : null}
          </FinanceDetailGrid>
          {canManage && isPayments && ["CONFIRMED", "RECONCILED"].includes(String(detail.status)) && Number(detail.unallocatedAmount || 0) > 0 ? <Button onClick={() => setAllocationTarget(detail as Payment)}><CircleDollarSign className="h-4 w-4" />{t("allocatePayment")}</Button> : null}
          {canManage ? <div data-responsive-actions>{(isPayments ? paymentActions(detail.status, locale) : tab === "transfers" ? transferActions(detail.status, locale) : []).map((action) => { const Icon = action.icon; return <Button key={action.action} variant={["CANCEL", "REVERSE"].includes(action.action) ? "destructive" : "outline"} onClick={() => setActionTarget({ record: detail, action: action.action, label: action.label, kind: isPayments ? "payment" : "transfer" })}><Icon className="h-4 w-4" />{action.label}</Button>; })}</div> : null}
          <FinanceCollaboration organizationId={organizationId} moduleCode={moduleCode} record={detail} locale={locale} />
        </div> : null}
      </Dialog>

      <Dialog open={Boolean(actionTarget)} onClose={() => setActionTarget(null)} title={actionTarget ? `${actionTarget.label} · ${String(actionTarget.record.number || actionTarget.record.reference || "")}` : ""} className="max-w-xl">
        {actionTarget ? <form onSubmit={transition} className="grid gap-4"><Field label={t("reason")}><textarea name="reason" rows={4} className="w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-base" /></Field><p className="text-sm text-dtsc-muted">{t("sodSelfApprovalBlocked")}</p><div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setActionTarget(null)}>{t("cancel")}</Button><Button type="submit">{t("confirm")}</Button></div></form> : null}
      </Dialog>

      <Dialog open={Boolean(allocationTarget)} onClose={() => setAllocationTarget(null)} title={t("allocatePayment")} description={allocationTarget ? `${financeMoney(allocationTarget.unallocatedAmount, allocationTarget.currencyCode, locale)} ${t("stillAvailable")}` : ""} className="max-w-3xl">
        {allocationTarget ? <form onSubmit={allocate} className="grid gap-5">
          <ProfessionalFormSection title={t("allocationTarget")}>
            <Field label={t("type")}><NativeSelect name="targetType" required defaultValue={allocationTarget.direction === "INBOUND" ? "receivable" : "payable"} items={[{ id: allocationTarget.direction === "INBOUND" ? "receivable" : "payable", label: allocationTarget.direction === "INBOUND" ? t("customerReceivable") : t("supplierPayable") }]} /></Field>
            <Field label={t("openInvoice")}><NativeSelect name="targetId" required items={compatibleTargets.map(({ item }) => ({ id: item.id, label: `${item.salesInvoice?.number || item.supplierInvoice?.number || t("openBalance")} · ${financeMoney(item.outstandingAmount, item.currencyCode, locale)}` }))} /></Field>
            <Field label={t("amountToAllocate")}><Input name="amount" type="number" inputMode="decimal" min="0.01" max={Number(allocationTarget.unallocatedAmount)} step="0.01" required /></Field>
          </ProfessionalFormSection>
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setAllocationTarget(null)}>{t("cancel")}</Button><Button type="submit">{t("confirmAllocation")}</Button></div>
        </form> : null}
      </Dialog>
    </ModuleWorkspace>
  );
}