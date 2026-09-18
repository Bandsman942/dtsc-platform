"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Banknote, LockKeyhole, Plus, ShieldCheck } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Field, NativeSelect } from "@/components/enterprise/core-v2/erp-v2-ui";
import { CashPhysicalCountFields, cashCountsFromForm } from "@/components/enterprise/professional/cash-physical-count-fields";
import { EnterpriseApproverSelect } from "@/components/enterprise/enterprise-approver-select";
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
import { financeMoney, financeStatusLabel, financeStatusTone, safeFinanceError, type FinanceLocale } from "@/components/enterprise/professional/finance-professional-ui";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToastMessage } from "@/components/ui/use-toast-message";
import { ModuleMetric, ModuleMetrics } from "@/components/workspace/module-metrics";
import { ModuleContent, ModuleHeader, ModuleSection, ModuleToolbar, ModuleWorkspace } from "@/components/workspace/module-workspace";
import { StatusBadge } from "@/components/workspace/status-badge";
import type { EnterpriseModuleDefinition } from "@/lib/enterprise/module-registry";
import { translateEnterpriseFinance, type EnterpriseFinanceKey } from "@/lib/i18n";

type CashSession = FinanceRecord & {
  financialAccountId: string;
  financialAccount?: { id: string; code: string; name: string; currencyCode: string };
  openingAmount: string | number;
  theoreticalClosingAmount?: string | number | null;
  countedClosingAmount?: string | number | null;
  discrepancyAmount?: string | number | null;
  openedAt: string;
  closedAt?: string | null;
  revision: number;
  approval?: { assigned: boolean; status: string | null; approverLabel: string | null };
  capabilities?: { canClose?: boolean; canAssignApprover?: boolean; canApprove?: boolean; canReject?: boolean };
};

export function EnterpriseFinanceCashWorkspace({ organizationId, organizationName, definition, locale: requestedLocale, canManage }: {
  organizationId: string;
  organizationName: string;
  definition: EnterpriseModuleDefinition;
  locale?: string | null;
  canManage: boolean;
}) {
  const locale: FinanceLocale = requestedLocale === "en" ? "en" : "fr";
  const t = (key: EnterpriseFinanceKey) => translateEnterpriseFinance(locale, key);
  const searchParams = useSearchParams();
  const [tab, setTab] = useState(searchParams.get("tab") || "all");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [detail, setDetail] = useState<CashSession | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [closeTarget, setCloseTarget] = useState<CashSession | null>(null);
  const [validateTarget, setValidateTarget] = useState<CashSession | null>(null);
  const [assignTarget, setAssignTarget] = useState<CashSession | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [cashDecision, setCashDecision] = useState("true");
  useToastMessage(message, "success");
  useToastMessage(error, "error");

  const effectiveStatus = status || (tab === "pending" ? "PENDING_VALIDATION" : tab === "open" ? "OPEN" : tab === "closed" ? "CLOSED" : "");
  const collection = useFinanceCollection<CashSession>({ endpoint: `/api/enterprise/${organizationId}/cash-sessions`, page, search, status: effectiveStatus, refreshKey });
  const lookupData = useFinanceLookups(organizationId, "FINANCE_CASH", refreshKey);
  const cashAccounts = lookupData.accounts.filter((account) => account.accountType === "CASH");
  const tabs = [
    { id: "all", label: t("allSessions") },
    { id: "open", label: t("openSessions") },
    { id: "pending", label: t("toValidate") },
    { id: "closed", label: t("closedSessions") },
  ];

  const openDetail = useCallback((record: CashSession) => setDetail(record), []);
  useEffect(() => {
    const deepId = searchParams.get("cashSessionId") || searchParams.get("session");
    if (!deepId) return;
    const found = collection.items.find((item) => item.id === deepId);
    if (found) openDetail(found);
  }, [collection.items, openDetail, searchParams]);

  async function openCashSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true); setMessage(""); setError("");
    try {
      await financeMutation(`/api/enterprise/${organizationId}/cash-sessions`, {
        financialAccountId: String(form.get("financialAccountId") || ""),
        siteId: String(form.get("siteId") || "") || undefined,
        openingAmount: String(form.get("openingAmount") || "0"),
      });
      setCreateOpen(false);
      setRefreshKey((value) => value + 1);
      setMessage(t("cashSessionOpened"));
    } catch (cashError) {
      setError(safeFinanceError(cashError, t("openingFailed")));
    } finally { setBusy(false); }
  }

  async function closeCashSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!closeTarget) return;
    const form = new FormData(event.currentTarget);
    const currency = String(closeTarget.financialAccount?.currencyCode || "USD");
    setBusy(true); setMessage(""); setError("");
    try {
      await financeMutation(`/api/enterprise/${organizationId}/cash-sessions/${closeTarget.id}/close`, {
        countedClosingAmount: String(form.get("countedClosingAmount") || "0"),
        closingReason: String(form.get("closingReason") || "") || undefined,
        counts: cashCountsFromForm(form, currency),
        revision: closeTarget.revision,
        approverUserId: String(form.get("approverUserId") || ""),
      });
      setCloseTarget(null);
      setDetail(null);
      setRefreshKey((value) => value + 1);
      setMessage(t("cashCloseSubmitted"));
    } catch (cashError) {
      setError(safeFinanceError(cashError, t("closeFailed")));
    } finally { setBusy(false); }
  }

  async function assignCashSessionApprover(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!assignTarget) return;
    const form = new FormData(event.currentTarget);
    setBusy(true); setMessage(""); setError("");
    try {
      await financeMutation(`/api/enterprise/${organizationId}/cash-sessions/${assignTarget.id}/approver`, {
        revision: assignTarget.revision,
        approverUserId: String(form.get("approverUserId") || ""),
      });
      setAssignTarget(null);
      setDetail(null);
      setRefreshKey((value) => value + 1);
      setMessage(t("cashApproverAssigned"));
    } catch (cashError) {
      setError(safeFinanceError(cashError, t("cashApproverAssignmentFailed")));
    } finally { setBusy(false); }
  }

  async function validateCashSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validateTarget) return;
    const form = new FormData(event.currentTarget);
    setBusy(true); setMessage(""); setError("");
    try {
      await financeMutation(`/api/enterprise/${organizationId}/cash-sessions/${validateTarget.id}/validate`, {
        approve: form.get("approve") === "true",
        reason: String(form.get("reason") || "") || undefined,
        revision: validateTarget.revision,
      });
      setValidateTarget(null);
      setDetail(null);
      setRefreshKey((value) => value + 1);
      setMessage(t("cashDecisionRecorded"));
    } catch (cashError) {
      setError(safeFinanceError(cashError, t("validationFailed")));
    } finally { setBusy(false); }
  }

  const openCount = collection.items.filter((item) => item.status === "OPEN").length;
  const pendingCount = collection.items.filter((item) => item.status === "PENDING_VALIDATION").length;

  return <ModuleWorkspace>
    <ModuleHeader
      eyebrow={`${t("cashOperations")} · ${organizationName}`}
      title={t("professionalCash")}
      description={locale === "en" ? definition.descriptionEn : definition.descriptionFr}
      count={`${collection.pagination.total}`}
      primaryAction={canManage ? <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" />{t("openCashSession")}</Button> : undefined}
    />
    <ModuleMetrics label={t("operationalMetrics")}>
      <ModuleMetric label={t("total")} value={collection.pagination.total} />
      <ModuleMetric label={t("openLabel")} value={openCount} />
      <ModuleMetric label={t("toValidate")} value={pendingCount} />
      <ModuleMetric label={t("compatibleAccounts")} value={cashAccounts.length} />
    </ModuleMetrics>
    <ModuleToolbar
      search={<ProfessionalSearch value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder={t("cashSearchPlaceholder")} />}
      controls={<div className="grid min-w-0 gap-2"><ProfessionalTabs value={tab} onChange={(value) => { setTab(value); setStatus(""); setPage(1); }} items={tabs} label={t("moduleViews")} /><NativeSelect value={status} onChange={(value) => { setStatus(value); setPage(1); }} items={[{ id: "", label: t("allStatuses") }, ...["OPEN", "PENDING_VALIDATION", "CLOSED", "REJECTED"].map((id) => ({ id, label: financeStatusLabel(id, locale) }))]} /></div>}
      summary={t("cashSectionDescription")}
    />
    <ModuleContent>
      {message ? <div role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm font-bold text-emerald-800 dark:text-emerald-200">{message}</div> : null}
      {error ? <ProfessionalError message={error} /> : null}
      {lookupData.error ? <ProfessionalError message={lookupData.error} /> : null}
      <ModuleSection title={tabs.find((item) => item.id === tab)?.label || ""} description={t("cashSectionDescription")}>
        {collection.error ? <ProfessionalError message={collection.error} /> : collection.loading ? <ProfessionalLoading /> : <FinanceRecordList items={collection.items} locale={locale} emptyTitle={t("noItem")} emptyDescription={t("createFirstOperationOrFilters")} onOpen={(record) => openDetail(record as CashSession)} />}
        <FinancePaginationControls pagination={collection.pagination} page={page} onPage={setPage} locale={locale} />
      </ModuleSection>
      <ProfessionalHelp moduleCode="FINANCE_CASH" />
    </ModuleContent>

    <Dialog open={createOpen} onClose={() => setCreateOpen(false)} title={t("openCashSessionTitle")} className="h-[94dvh] max-w-3xl">
      <form onSubmit={openCashSession} className="grid gap-5">
        <ProfessionalFormSection title={t("opening")}>
          <Field label={t("cashAccount")}><NativeSelect name="financialAccountId" required disabled={busy} items={cashAccounts.map((account) => ({ id: account.id, label: `${account.code} · ${account.name} · ${account.currencyCode}` }))} /></Field>
          <Field label={t("site")}><NativeSelect name="siteId" disabled={busy} items={lookupData.lookups.sites.map((site) => ({ id: site.id, label: `${site.code} · ${site.name}` }))} /></Field>
          <Field label={t("openingAmount")}><Input name="openingAmount" type="number" inputMode="decimal" min="0" step="0.01" required disabled={busy} /></Field>
        </ProfessionalFormSection>
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => setCreateOpen(false)}>{t("cancel")}</Button><Button type="submit" disabled={busy}><Banknote className="h-4 w-4" />{t("confirmOpening")}</Button></div>
      </form>
    </Dialog>

    <Dialog open={Boolean(detail)} onClose={() => setDetail(null)} title={detail ? String(detail.number || t("financeDetails")) : ""} className="h-[94dvh] max-w-3xl">
      {detail ? <div className="grid gap-5">
        <div className="flex flex-wrap gap-2"><StatusBadge tone={financeStatusTone(detail.status)}>{financeStatusLabel(detail.status, locale)}</StatusBadge></div>
        <FinanceDetailGrid>
          <FinanceDetailValue label={t("opening")}>{financeMoney(detail.openingAmount, String(detail.financialAccount?.currencyCode || "USD"), locale)}</FinanceDetailValue>
          {detail.theoreticalClosingAmount !== undefined ? <FinanceDetailValue label={t("theoretical")}>{financeMoney(detail.theoreticalClosingAmount, String(detail.financialAccount?.currencyCode || "USD"), locale)}</FinanceDetailValue> : null}
          {detail.countedClosingAmount !== undefined ? <FinanceDetailValue label={t("counted")}>{financeMoney(detail.countedClosingAmount, String(detail.financialAccount?.currencyCode || "USD"), locale)}</FinanceDetailValue> : null}
          {detail.discrepancyAmount !== undefined ? <FinanceDetailValue label={t("variance")}>{financeMoney(detail.discrepancyAmount, String(detail.financialAccount?.currencyCode || "USD"), locale)}</FinanceDetailValue> : null}
        </FinanceDetailGrid>
        {detail.status === "PENDING_VALIDATION" ? (
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 rounded-xl border border-dtsc-border bg-dtsc-page p-4">
            <p className="break-words text-sm font-semibold text-dtsc-muted">
              {detail.approval?.assigned
                ? `${t("cashAwaitingAssignedApprover")}${detail.approval.approverLabel ? ` · ${detail.approval.approverLabel}` : ""}`
                : t("cashApproverMissing")}
            </p>
            <div data-responsive-actions>
              {detail.capabilities?.canAssignApprover ? <Button disabled={busy} onClick={() => setAssignTarget(detail)}><ShieldCheck className="h-4 w-4" />{t("assignCashApprover")}</Button> : null}
              {detail.capabilities?.canApprove ? <Button disabled={busy} onClick={() => { setCashDecision("true"); setValidateTarget(detail); }}><ShieldCheck className="h-4 w-4" />{t("validateClose")}</Button> : null}
            </div>
          </div>
        ) : null}
        {detail.capabilities?.canClose ? <Button disabled={busy} onClick={() => setCloseTarget(detail)}><LockKeyhole className="h-4 w-4" />{t("closeCashSession")}</Button> : null}
        <FinanceCollaboration organizationId={organizationId} moduleCode="FINANCE_CASH" record={detail} locale={locale} />
      </div> : null}
    </Dialog>

    <Dialog open={Boolean(closeTarget)} onClose={() => setCloseTarget(null)} title={t("cashCloseAssistant")} className="h-[94dvh] max-w-5xl">
      {closeTarget ? <form onSubmit={closeCashSession} className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-5">
        <CashPhysicalCountFields
          organizationId={organizationId}
          currencyCode={String(closeTarget.financialAccount?.currencyCode || "USD")}
          expectedAmount={Number(closeTarget.theoreticalClosingAmount ?? closeTarget.openingAmount ?? 0)}
          locale={locale}
        />
        <p className="text-sm text-dtsc-muted">{t("cashCloseSod")}</p>
        <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => setCloseTarget(null)}>{t("cancel")}</Button><Button type="submit" disabled={busy}>{t("submitClose")}</Button></div>
      </form> : null}
    </Dialog>

    <Dialog open={Boolean(assignTarget)} onClose={() => setAssignTarget(null)} title={t("assignCashApprover")} className="max-w-xl">
      {assignTarget ? <form onSubmit={assignCashSessionApprover} className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4">
        <p className="text-sm font-semibold text-dtsc-muted">{t("cashApproverRecoveryHelp")}</p>
        <EnterpriseApproverSelect
          organizationId={organizationId}
          moduleCode="FINANCE_CASH"
          locale={locale}
          label={t("independentApproval")}
          candidatesEndpoint={`/api/enterprise/${organizationId}/cash-sessions/${assignTarget.id}/approver`}
        />
        <div data-responsive-actions><Button type="button" variant="outline" disabled={busy} onClick={() => setAssignTarget(null)}>{t("cancel")}</Button><Button type="submit" disabled={busy}><ShieldCheck className="h-4 w-4" />{t("confirmCashApproverAssignment")}</Button></div>
      </form> : null}
    </Dialog>

    <Dialog open={Boolean(validateTarget)} onClose={() => setValidateTarget(null)} title={t("independentValidation")} className="max-w-xl">
      {validateTarget ? <form onSubmit={validateCashSession} className="grid gap-4">
        <Field label={t("decision")}><NativeSelect name="approve" value={cashDecision} onChange={setCashDecision} required disabled={busy} items={[{ id: "true", label: t("approveClose") }, { id: "false", label: t("rejectRequestCorrection") }]} /></Field>
        <Field label={t("decisionReasonComment")}>
          <textarea name="reason" rows={4} minLength={cashDecision === "false" ? 4 : undefined} required={cashDecision === "false"} disabled={busy} className="w-full min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-base disabled:opacity-60" />
          <p className="mt-2 text-xs leading-5 text-dtsc-muted">{t(cashDecision === "false" ? "rejectionReasonMinimumHint" : "decisionCommentOptionalHint")}</p>
        </Field>
        <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => setValidateTarget(null)}>{t("cancel")}</Button><Button type="submit" disabled={busy}>{t("saveDecision")}</Button></div>
      </form> : null}
    </Dialog>
  </ModuleWorkspace>;
}
