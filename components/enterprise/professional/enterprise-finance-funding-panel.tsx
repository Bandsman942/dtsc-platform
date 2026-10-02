"use client";

import { useEffect, useState, type FormEvent } from "react";
import { CheckCircle2, Plus, RotateCcw, ShieldCheck, XCircle } from "lucide-react";
import { Field, NativeSelect } from "@/components/enterprise/core-v2/erp-v2-ui";
import { FinanceReferenceSelect, type FinanceReferenceOption } from "@/components/enterprise/core-v2/finance-reference-select";
import { EnterpriseApproverSelect } from "@/components/enterprise/enterprise-approver-select";
import {
  FinanceDetailGrid,
  FinanceDetailValue,
  FinancePaginationControls,
  FinanceRecordList,
  financeMutation,
  type FinanceRecord,
} from "@/components/enterprise/professional/finance-professional-workspace-shared";
import { ProfessionalError, ProfessionalFormSection, ProfessionalLoading } from "@/components/enterprise/professional/professional-erp-ui";
import { fetchOperationalFinanceRecord } from "@/components/enterprise/professional/use-operational-finance-collection";
import { financeDate, financeMoney, financeStatusLabel, financeStatusTone, safeFinanceError, type FinanceLocale } from "@/components/enterprise/professional/finance-professional-ui";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToastMessage } from "@/components/ui/use-toast-message";
import { ModuleSection } from "@/components/workspace/module-workspace";
import { StatusBadge } from "@/components/workspace/status-badge";
import { translateEnterpriseTreasury, type EnterpriseTreasuryCopyKey } from "@/lib/i18n/enterprise-treasury";

type FundingCapabilities = {
  canApprove?: boolean;
  canReject?: boolean;
  canConfirm?: boolean;
  canReverse?: boolean;
};

export type FundingOperationRecord = FinanceRecord & {
  number: string;
  fundingType: "CAPITAL_CONTRIBUTION" | "SHAREHOLDER_ADVANCE" | "LOAN_DRAW";
  financialAccountId: string;
  cashSessionId?: string | null;
  counterpartyLedgerAccountId?: string | null;
  currencyCode: string;
  amount: string | number;
  operationDate: string;
  reference?: string | null;
  description?: string | null;
  revision: number;
  financialAccount: { id: string; code: string; name: string; accountType: string; currencyCode: string };
  cashSession?: { id: string; number: string; status: string; cashierUserId: string } | null;
  counterpartyLedgerAccount?: { id: string; code: string; nameFr: string; nameEn: string; accountType: string } | null;
  approval?: { id: string; approverUserId: string; approverName: string; status: string; canAct: boolean } | null;
  capabilities?: FundingCapabilities;
};

type Props = {
  organizationId: string;
  locale: FinanceLocale;
  rawLocale?: string | null;
  canCreate: boolean;
  items: FundingOperationRecord[];
  pagination: { page: number; pageSize: number; total: number; pageCount: number };
  page: number;
  loading: boolean;
  error: string;
  onPage: (page: number) => void;
  onChanged: (message: string) => void;
  initialRecordId?: string | null;
};

type FundingAction = {
  record: FundingOperationRecord;
  action: "APPROVE" | "REJECT" | "CONFIRM" | "REVERSE";
};

function typeLabel(type: FundingOperationRecord["fundingType"], t: (key: EnterpriseTreasuryCopyKey) => string) {
  if (type === "CAPITAL_CONTRIBUTION") return t("capitalContribution");
  if (type === "SHAREHOLDER_ADVANCE") return t("shareholderAdvance");
  return t("loanDraw");
}

function newIdempotencyKey() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `funding-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function EnterpriseFinanceFundingPanel({
  organizationId,
  locale,
  rawLocale,
  canCreate,
  items,
  pagination,
  page,
  loading,
  error,
  onPage,
  onChanged,
  initialRecordId,
}: Props) {
  const t = (key: EnterpriseTreasuryCopyKey) => translateEnterpriseTreasury(locale, key);
  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState<FundingOperationRecord | null>(null);
  const [action, setAction] = useState<FundingAction | null>(null);
  const [fundingType, setFundingType] = useState<FundingOperationRecord["fundingType"]>("CAPITAL_CONTRIBUTION");
  const [selectedAccount, setSelectedAccount] = useState<FinanceReferenceOption | null>(null);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);
  const [deepLinkResolved, setDeepLinkResolved] = useState(false);
  useToastMessage(errorMessage, "error");

  useEffect(() => {
    if (!initialRecordId || deepLinkResolved) return;
    const visible = items.find((item) => item.id === initialRecordId);
    if (visible) {
      setDetail(visible);
      setDeepLinkResolved(true);
      return;
    }
    if (loading) return;
    void fetchOperationalFinanceRecord<FundingOperationRecord>(`/api/enterprise/${organizationId}/funding-operations`, initialRecordId)
      .then((record) => { if (record) setDetail(record); })
      .catch((requestError) => setErrorMessage(safeFinanceError(requestError, translateEnterpriseTreasury(locale, "operationError"), locale)))
      .finally(() => setDeepLinkResolved(true));
  }, [deepLinkResolved, initialRecordId, items, loading, locale, organizationId]);

  function resetCreate() {
    setFundingType("CAPITAL_CONTRIBUTION");
    setSelectedAccount(null);
    setIdempotencyKey(newIdempotencyKey());
  }

  async function createFunding(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setErrorMessage("");
    try {
      await financeMutation(`/api/enterprise/${organizationId}/funding-operations`, {
        fundingType,
        financialAccountId: String(form.get("financialAccountId") || ""),
        cashSessionId: selectedAccount?.accountType === "CASH" ? String(form.get("cashSessionId") || "") || undefined : undefined,
        counterpartyLedgerAccountId: fundingType === "SHAREHOLDER_ADVANCE" ? String(form.get("counterpartyLedgerAccountId") || "") || undefined : undefined,
        amount: String(form.get("amount") || "0"),
        operationDate: String(form.get("operationDate") || ""),
        reference: String(form.get("reference") || "") || undefined,
        description: String(form.get("description") || "") || undefined,
        approverUserId: String(form.get("approverUserId") || ""),
        idempotencyKey,
      });
      setCreateOpen(false);
      resetCreate();
      onChanged(t("fundingCreated"));
    } catch (requestError) {
      setErrorMessage(safeFinanceError(requestError, t("operationError"), locale));
    } finally {
      setBusy(false);
    }
  }

  async function transitionFunding(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!action) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setErrorMessage("");
    try {
      if (action.action === "REVERSE") {
        await financeMutation(
          `/api/enterprise/${organizationId}/funding-operations/${action.record.id}/reverse`,
          {
            revision: action.record.revision,
            reason: String(form.get("reason") || ""),
            accountingDate: String(form.get("accountingDate") || ""),
            cashSessionId: action.record.financialAccount.accountType === "CASH" ? String(form.get("cashSessionId") || "") || undefined : undefined,
          },
        );
      } else {
        await financeMutation(
          `/api/enterprise/${organizationId}/funding-operations/${action.record.id}/transition`,
          {
            action: action.action,
            revision: action.record.revision,
            ...(action.action === "REJECT" ? { reason: String(form.get("reason") || "") } : {}),
          },
        );
      }
      const success = action.action === "APPROVE"
        ? t("fundingApproved")
        : action.action === "REJECT"
          ? t("fundingRejected")
          : action.action === "CONFIRM"
            ? t("fundingConfirmed")
            : t("fundingReversed");
      setAction(null);
      setDetail(null);
      onChanged(success);
    } catch (requestError) {
      setErrorMessage(safeFinanceError(requestError, t("operationError"), locale));
    } finally {
      setBusy(false);
    }
  }

  return <>
    <ModuleSection title={t("fundingList")} description={t("fundingDescription")}>
      <div className="mb-4 grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 rounded-xl border border-dtsc-border bg-dtsc-surface/70 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <p className="min-w-0 break-words text-sm leading-6 text-dtsc-muted">{t("fundingNonRevenueNotice")}</p>
        {canCreate ? <Button className="w-full whitespace-normal text-center sm:w-auto" onClick={() => { resetCreate(); setCreateOpen(true); }}><Plus className="h-4 w-4 shrink-0" />{t("newFunding")}</Button> : null}
      </div>
      {error ? <ProfessionalError message={error} /> : loading ? <ProfessionalLoading /> : <FinanceRecordList items={items} locale={locale} emptyTitle={t("noItems")} emptyDescription={t("noItemsDescription")} onOpen={setDetail} />}
      <FinancePaginationControls pagination={pagination} page={page} onPage={onPage} locale={locale} />
    </ModuleSection>

    <Dialog open={Boolean(detail)} onClose={() => { if (!busy) setDetail(null); }} title={t("fundingDetails")} description={t("fundingDescription")} presentation="editor" className="max-w-4xl">
      {detail ? <div className="grid gap-5">
        <div data-responsive-actions>
          <StatusBadge tone={financeStatusTone(detail.status)}>{financeStatusLabel(detail.status, locale)}</StatusBadge>
          {detail.capabilities?.canApprove ? <Button onClick={() => setAction({ record: detail, action: "APPROVE" })}><CheckCircle2 className="h-4 w-4" />{t("approve")}</Button> : null}
          {detail.capabilities?.canReject ? <Button variant="outline" onClick={() => setAction({ record: detail, action: "REJECT" })}><XCircle className="h-4 w-4" />{locale === "en" ? "Reject" : "Refuser"}</Button> : null}
          {detail.capabilities?.canConfirm ? <Button onClick={() => setAction({ record: detail, action: "CONFIRM" })}><ShieldCheck className="h-4 w-4" />{t("confirm")}</Button> : null}
          {detail.capabilities?.canReverse ? <Button variant="outline" onClick={() => setAction({ record: detail, action: "REVERSE" })}><RotateCcw className="h-4 w-4" />{t("reverseFunding")}</Button> : null}
        </div>
        <FinanceDetailGrid>
          <FinanceDetailValue label={t("code")} value={detail.number} />
          <FinanceDetailValue label={t("fundingType")} value={typeLabel(detail.fundingType, t)} />
          <FinanceDetailValue label={t("fundingAccount")} value={`${detail.financialAccount.code} · ${detail.financialAccount.name}`} />
          <FinanceDetailValue label={t("fundingAmount")} value={financeMoney(detail.amount, detail.currencyCode, locale)} />
          <FinanceDetailValue label={t("operationDate")} value={financeDate(detail.operationDate, locale)} />
          <FinanceDetailValue label={t("fundingReference")} value={detail.reference || "—"} />
          <FinanceDetailValue label={t("cashSession")} value={detail.cashSession?.number || "—"} />
          <FinanceDetailValue label={t("counterpartAccount")} value={detail.counterpartyLedgerAccount ? `${detail.counterpartyLedgerAccount.code} · ${locale === "en" ? detail.counterpartyLedgerAccount.nameEn : detail.counterpartyLedgerAccount.nameFr}` : "—"} />
          <FinanceDetailValue label={t("validator")} value={detail.approval?.approverName || "—"} />
          <FinanceDetailValue label={t("fundingDescriptionLabel")} value={detail.description || "—"} />
        </FinanceDetailGrid>
      </div> : null}
    </Dialog>

    <Dialog open={createOpen} onClose={() => { if (!busy) { setCreateOpen(false); resetCreate(); } }} title={t("newFunding")} description={t("fundingNonRevenueNotice")} presentation="editor" className="max-w-4xl">
      <form onSubmit={createFunding} className="grid gap-6">
        <ProfessionalFormSection title={t("fundingDetails")} description={t("fundingDescription")}>
          <Field label={t("fundingType")} help={t("selectFundingType")}>
            <NativeSelect name="fundingType" value={fundingType} onChange={(value) => setFundingType(value as FundingOperationRecord["fundingType"])} required disabled={busy} items={[
              { id: "CAPITAL_CONTRIBUTION", label: t("capitalContribution") },
              { id: "SHAREHOLDER_ADVANCE", label: t("shareholderAdvance") },
              { id: "LOAN_DRAW", label: t("loanDraw") },
            ]} />
          </Field>
          <Field label={t("fundingAccount")} help={t("fundingAccountHelp")}>
            <FinanceReferenceSelect organizationId={organizationId} moduleCode="FINANCE_TREASURY" kind="financial-account" name="financialAccountId" label={t("fundingAccount")} locale={rawLocale} required disabled={busy} onOptionChange={setSelectedAccount} />
          </Field>
          {selectedAccount?.accountType === "CASH" ? <Field label={t("cashSession")} help={t("cashSessionHelp")}>
            <FinanceReferenceSelect
              organizationId={organizationId}
              moduleCode="FINANCE_TREASURY"
              kind="cash-session"
              name="cashSessionId"
              label={t("cashSession")}
              locale={rawLocale}
              parentId={selectedAccount.id}
              required
              disabled={busy}
              emptyLabel={t("cashSessionSelect")}
              emptyStateLabel={t("cashSessionEmpty")}
              autoSelectSingle
            />
          </Field> : null}
          {fundingType === "SHAREHOLDER_ADVANCE" ? <Field label={t("counterpartAccount")} help={t("counterpartAccountHelp")}>
            <FinanceReferenceSelect organizationId={organizationId} moduleCode="FINANCE_TREASURY" kind="funding-counterpart-account" name="counterpartyLedgerAccountId" label={t("counterpartAccount")} locale={rawLocale} required disabled={busy} />
          </Field> : null}
          <Field label={t("fundingAmount")}><Input name="amount" type="number" min="0.01" step="0.01" required disabled={busy} /></Field>
          <Field label={t("operationDate")}><Input name="operationDate" type="date" required disabled={busy} /></Field>
          <Field label={t("fundingReference")}><Input name="reference" maxLength={160} disabled={busy} /></Field>
          <Field label={t("fundingDescriptionLabel")}><textarea name="description" rows={4} maxLength={1000} disabled={busy} className="w-full min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-base text-dtsc-ink outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:opacity-60 md:text-sm" /></Field>
          <EnterpriseApproverSelect organizationId={organizationId} moduleCode="FINANCE_TREASURY" locale={rawLocale} label={t("validator")} disabled={busy} />
        </ProfessionalFormSection>
        <Button type="submit" disabled={busy || !selectedAccount}>{t("createFunding")}</Button>
      </form>
    </Dialog>

    <Dialog open={Boolean(action)} onClose={() => { if (!busy) setAction(null); }} title={action?.action === "REVERSE" ? t("reverseFunding") : action?.action === "APPROVE" ? t("approve") : action?.action === "CONFIRM" ? t("confirm") : t("rejectFunding")} description={t("fundingNonRevenueNotice")} presentation="editor" className="max-w-3xl">
      <form onSubmit={transitionFunding} className="grid gap-5">
        {action?.action === "REJECT" || action?.action === "REVERSE" ? <Field label={action.action === "REVERSE" ? t("reversalReason") : t("reason")}><textarea name="reason" rows={4} required minLength={4} maxLength={1000} disabled={busy} className="w-full min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-base text-dtsc-ink outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:opacity-60 md:text-sm" /></Field> : null}
        {action?.action === "REVERSE" ? <Field label={t("reversalDate")}><Input name="accountingDate" type="date" required disabled={busy} /></Field> : null}
        {action?.action === "REVERSE" && action.record.financialAccount.accountType === "CASH" ? <Field label={t("cashSession")} help={t("cashSessionHelp")}><FinanceReferenceSelect organizationId={organizationId} moduleCode="FINANCE_TREASURY" kind="cash-session" name="cashSessionId" label={t("cashSession")} locale={rawLocale} parentId={action.record.financialAccountId} required disabled={busy} emptyLabel={t("cashSessionSelect")} emptyStateLabel={t("cashSessionEmpty")} autoSelectSingle /></Field> : null}
        <Button type="submit" disabled={busy}>{action?.action === "REVERSE" ? t("reverseFunding") : action?.action === "APPROVE" ? t("approve") : action?.action === "CONFIRM" ? t("confirm") : t("reject")}</Button>
      </form>
    </Dialog>
  </>;
}
