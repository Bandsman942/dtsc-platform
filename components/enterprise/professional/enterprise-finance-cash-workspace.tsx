"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Banknote, LockKeyhole, Plus, ShieldCheck } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Field, NativeSelect } from "@/components/enterprise/core-v2/erp-v2-ui";
import { fetchOperationalFinanceRecord, useOperationalFinanceCollection } from "@/components/enterprise/professional/use-operational-finance-collection";
import { CashHandoverPanel } from "@/components/enterprise/professional/cash-handover-panel";
import { CashPhysicalCountFields, cashCountsFromForm } from "@/components/enterprise/professional/cash-physical-count-fields";
import { FinanceAmountScopes, FinanceDateFilter, FinanceExportControls, formatAnalyticsAmount, type FinanceExportColumn } from "@/components/enterprise/professional/finance-design2-controls";
import { EnterpriseApproverSelect } from "@/components/enterprise/enterprise-approver-select";
import {
  FinanceCollaboration,
  FinanceDetailGrid,
  FinanceDetailValue,
  FinancePaginationControls,
  financeMutation,
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
import { FinanceCriticalStepUpFields, performFinanceCriticalStepUp } from "@/components/enterprise/professional/finance-critical-step-up";
import { useToastMessage } from "@/components/ui/use-toast-message";
import { ModuleMetric, ModuleMetrics } from "@/components/workspace/module-metrics";
import { ModuleContent, ModuleHeader, ModuleSection, ModuleToolbar, ModuleWorkspace } from "@/components/workspace/module-workspace";
import { StatusBadge } from "@/components/workspace/status-badge";
import type { EnterpriseModuleDefinition } from "@/lib/enterprise/module-registry";
import { inventoryQuantityExportValue as exactDecimalExportValue } from "@/lib/enterprise/inventory/quantity-display";
import { translateEnterpriseFinance, type EnterpriseFinanceKey } from "@/lib/i18n";

type CashSession = FinanceRecord & {
  financialAccountId: string;
  financialAccount?: { id: string; code: string; name: string; currencyCode: string };
  openingAmount: string | number;
  inboundAmount?: string | null;
  outboundAmount?: string | null;
  expectedCurrentAmount?: string | null;
  theoreticalClosingAmount?: string | number | null;
  countedClosingAmount?: string | number | null;
  discrepancyAmount?: string | number | null;
  varianceQualificationPending?: boolean;
  varianceReviews?: Array<{id:string;status:string;amount:string|number;reason:string;journalEntryId?:string|null;canonicalSourceHref?:string|null;canReview?:boolean;updatedAt:string}>;
  canLinkCanonical?:boolean;
  canReviewVariance?: boolean;
  canViewHandover?: boolean;
  openedAt: string;
  openedByLabel?: string;
  submittedAt?: string | null;
  submittedByLabel?: string | null;
  validatedAt?: string | null;
  closedByLabel?: string | null;
  closedAt?: string | null;
  revision: number;
  approval?: { assigned: boolean; status: string | null; approverLabel: string | null };
  capabilities?: { canClose?: boolean; canAssignApprover?: boolean; canApprove?: boolean; canReject?: boolean };
};

type CashSessionCounts = { total: number; open: number; pending: number };

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
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
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
  const [varianceTarget,setVarianceTarget] = useState<{session:CashSession; variance:NonNullable<CashSession["varianceReviews"]>[number]} | null>(null);
  const [varianceDecision,setVarianceDecision] = useState("CORRECT_COUNT");
  const [canonicalCandidates,setCanonicalCandidates] = useState<Array<{id:string;number:string;amount:string;currencyCode:string}>>([]);
  const [canonicalPage,setCanonicalPage] = useState(1);
  const [canonicalHasMore,setCanonicalHasMore] = useState(false);
  const [canonicalLoading,setCanonicalLoading] = useState(false);
  const [canonicalTransaction,setCanonicalTransaction] = useState("");
  useEffect(()=>{
    if(!varianceTarget || varianceDecision!=="LINK_CANONICAL")return;
    const controller=new AbortController();
    setCanonicalLoading(true);setCanonicalTransaction("");setCanonicalCandidates([]);
    void fetch(`/api/enterprise/${organizationId}/cash-sessions/${varianceTarget.session.id}/variance-review?page=${canonicalPage}`,{signal:controller.signal,cache:"no-store"}).then(async response=>{
      if(!response.ok)throw new Error("CASH_VARIANCE_CANONICAL_PROOF_REQUIRED");
      const data=await response.json();
      if(!controller.signal.aborted){setCanonicalCandidates(data.items);setCanonicalHasMore(data.hasMore);}
    }).catch(error=>{if(!controller.signal.aborted)setError(safeFinanceError(error, translateEnterpriseFinance(locale, "cashVarianceReviewFailed"), locale));})
      .finally(()=>{if(!controller.signal.aborted)setCanonicalLoading(false);});
    return ()=>controller.abort();
  },[varianceTarget,varianceDecision,canonicalPage,organizationId,locale]);
  useToastMessage(message, "success");
  useToastMessage(error, "error");

  const effectiveStatus = status || (tab === "pending" ? "PENDING_VALIDATION" : tab === "open" ? "OPEN" : tab === "closed" ? "CLOSED" : "");
  const endpoint = `/api/enterprise/${organizationId}/cash-sessions`;
  const collection = useOperationalFinanceCollection<CashSession>({ endpoint, page, search, status: effectiveStatus, filters: { dateFrom, dateTo }, refreshKey });
  const ready = !collection.loading && !collection.error;
  const metrics = collection.metrics as Partial<CashSessionCounts> & { general?: CashSessionCounts; page?: CashSessionCounts };
  const metricHint = (key: keyof CashSessionCounts) => ready && metrics.general && metrics.page
    ? `${t("cashAuthorizedTotal")} ${metrics.general[key]} · ${t("cashDisplayedPage")} ${metrics.page[key]}` : undefined;
  const cashAmount = (amount: unknown, currency: string | undefined) =>
    amount != null && currency ? formatAnalyticsAmount({ amount: String(amount), currencyCode: currency }, locale) : "—";
  const exportColumns: FinanceExportColumn[] = [
    { key: "reference", labelFr: "Référence", labelEn: "Reference", get: (row) => String(row.number ?? "") },
    { key: "status", labelFr: "Statut", labelEn: "Status", get: (row) => financeStatusLabel(String(row.status || ""), locale) },
    { key: "currency", labelFr: "Devise", labelEn: "Currency", get: (row) => String(row.currencyCode ?? "") },
    { key: "opened", labelFr: "Ouverture", labelEn: "Opened on", get: (row) => String(row.openedAt || "") },
    { key: "closed", labelFr: "Clôture", labelEn: "Closed on", get: (row) => String(row.closedAt || "") },
    { key: "opening", labelFr: "Solde d’ouverture", labelEn: "Opening balance", get: (row) => exactDecimalExportValue(String(row.openingAmount ?? "")) },
    { key: "inbound", labelFr: "Entrées", labelEn: "Inflow", get: (row) => exactDecimalExportValue(String(row.inboundAmount ?? "")) },
    { key: "outbound", labelFr: "Sorties", labelEn: "Outflow", get: (row) => exactDecimalExportValue(String(row.outboundAmount ?? "")) },
    { key: "theoretical", labelFr: "Théorique", labelEn: "Expected", get: (row) => exactDecimalExportValue(String(row.theoreticalClosingAmount ?? "")) },
    { key: "counted", labelFr: "Compté", labelEn: "Counted", get: (row) => exactDecimalExportValue(String(row.countedClosingAmount ?? "")) },
    { key: "difference", labelFr: "Écart", labelEn: "Difference", get: (row) => exactDecimalExportValue(String(row.discrepancyAmount ?? "")) },
    { key: "movementEvidence", labelFr: "État des mouvements", labelEn: "Movement evidence", get: (row) => row.expectedCurrentAmount === null ? t("cashMovementEvidenceUnavailable") : "" },
  ];
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
    const deepId = searchParams.get("recordId") || searchParams.get("cashSessionId") || searchParams.get("session");
    if (!deepId) return;
    let active = true;
    void fetchOperationalFinanceRecord<CashSession>(`/api/enterprise/${organizationId}/cash-sessions`,deepId).then(record => {
      if (!active) return;
      if (record) openDetail(record);
      else setError(locale === "fr" ? "Session introuvable ou non autorisée." : "Session not found or not authorized.");
    }).catch(error => { if (active) setError(safeFinanceError(error,locale === "fr" ? "Impossible d’ouvrir la session." : "Unable to open the session.", locale)); });
    return () => { active = false; };
  }, [organizationId, openDetail, searchParams, locale]);

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
      setError(safeFinanceError(cashError, t("openingFailed"), locale));
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
      setError(safeFinanceError(cashError, t("closeFailed"), locale));
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
      setError(safeFinanceError(cashError, t("cashApproverAssignmentFailed"), locale));
    } finally { setBusy(false); }
  }

  async function validateCashSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validateTarget) return;
    const form = new FormData(event.currentTarget);
    setBusy(true); setMessage(""); setError("");
    try {
      await performFinanceCriticalStepUp(form, "APPROVE");
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
      setError(safeFinanceError(cashError, t("validationFailed"), locale));
    } finally { setBusy(false); }
  }

  async function submitVarianceReview(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!varianceTarget || busy) return;
    const form=new FormData(event.currentTarget);
    setBusy(true);setMessage("");setError("");
    try {
      await performFinanceCriticalStepUp(form,"APPROVE");
      await financeMutation(`/api/enterprise/${organizationId}/cash-sessions/${varianceTarget.session.id}/variance-review`,{discrepancyId:varianceTarget.variance.id,revision:varianceTarget.session.revision,decision:varianceDecision,...(varianceDecision==="LINK_CANONICAL"?{canonicalTreasuryTransactionId:canonicalTransaction}:{}),verifiedCount:String(form.get("verifiedCount")||""),evidenceReference:String(form.get("evidenceReference")||""),reason:String(form.get("reason")||""),attest:form.get("attest")==="on"});
      const fresh=await fetchOperationalFinanceRecord<CashSession>(`/api/enterprise/${organizationId}/cash-sessions`,varianceTarget.session.id);
      setVarianceTarget(null);setDetail(fresh);setRefreshKey(value=>value+1);setMessage(t("cashVarianceReviewed"));
    } catch(error) {setError(safeFinanceError(error,t("cashVarianceReviewFailed"), locale));}
    finally {setBusy(false);}
  }

  return <ModuleWorkspace>
    <ModuleHeader
      eyebrow={`${t("cashOperations")} · ${organizationName}`}
      title={t("professionalCash")}
      description={locale === "en" ? definition.descriptionEn : definition.descriptionFr}
      count={ready ? `${collection.pagination.total}` : undefined}
      primaryAction={canManage ? <Button disabled={busy} onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" />{t("openCashSession")}</Button> : undefined}
    />
    <div className="min-w-0">
      <p className="mb-1 text-xs font-semibold text-dtsc-muted">{t("cashFilteredIndicators")}</p>
      <ModuleMetrics label={t("cashFilteredIndicators")}>
        <ModuleMetric label={t("total")} value={ready ? collection.pagination.total : "—"} hint={metricHint("total")} />
        <ModuleMetric label={t("openLabel")} value={ready ? metrics.open ?? "—" : "—"} hint={metricHint("open")} />
        <ModuleMetric label={t("toValidate")} value={ready ? metrics.pending ?? "—" : "—"} hint={metricHint("pending")} />
      </ModuleMetrics>
    </div>
    <ModuleToolbar
      search={<ProfessionalSearch value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder={t("cashSearchPlaceholder")} />}
      controls={<div className="grid min-w-0 gap-2">
        <ProfessionalTabs value={tab} onChange={(value) => { setTab(value); setStatus(""); setPage(1); }} items={tabs} label={t("moduleViews")} />
        <div className="flex min-w-0 flex-wrap items-end gap-2">
          <NativeSelect value={status} onChange={(value) => { setStatus(value); setPage(1); }} items={[
            { id: "", label: t("allStatuses") },
            ...["OPEN", "PENDING_VALIDATION", "CLOSED", "REJECTED"].map((id) => ({ id, label: financeStatusLabel(id, locale) })),
          ]} />
          <FinanceDateFilter locale={locale} from={dateFrom} to={dateTo} onChange={(from, to) => { setDateFrom(from); setDateTo(to); setPage(1); }} />
          <FinanceExportControls endpoint={endpoint} organizationName={organizationName}
            title={locale === "en" ? definition.labelEn : definition.labelFr} locale={locale}
            filters={{ search, status: effectiveStatus, dateFrom, dateTo }}
            reportFilters={[
              { label: locale === "en" ? "Search" : "Recherche", value: search },
              { label: t("status"), value: effectiveStatus ? financeStatusLabel(effectiveStatus, locale) : "" },
              { label: locale === "en" ? "Opened from" : "Ouverture à partir du", value: dateFrom },
              { label: locale === "en" ? "Opened through" : "Ouverture jusqu’au", value: dateTo },
            ].filter(filter => filter.value)}
            columns={exportColumns} disabled={!ready} />
        </div>
      </div>}
      summary={t("cashSectionDescription")}
    />
    <ModuleContent>
      {message ? <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm font-bold text-emerald-800 dark:text-emerald-200">{message}</div> : null}
      {error ? <ProfessionalError message={error} /> : null}
      {lookupData.error ? <ProfessionalError message={lookupData.error} /> : null}
      {ready ? <div className="grid min-w-0 gap-2">
        <p className="text-xs text-dtsc-muted">{t("cashSummaryBasis")}</p>
        <FinanceAmountScopes totals={collection} locale={locale} />
      </div> : null}
      <ModuleSection title={tabs.find((item) => item.id === tab)?.label || ""} description={t("cashSectionDescription")}>
        {collection.error ? <ProfessionalError message={collection.error} /> : collection.loading ? <ProfessionalLoading /> : !collection.items.length ? <p className="rounded-xl bg-dtsc-page p-4 text-sm text-dtsc-muted">{t("noItem")}</p> : <div className="grid min-w-0 gap-2">{collection.items.map((session) => <button key={session.id} type="button" onClick={() => openDetail(session)} className="min-w-0 rounded-xl border border-dtsc-border bg-dtsc-page p-3 text-left hover:border-cyan-500 focus-visible:outline-2 focus-visible:outline-cyan-500"><div className="flex flex-wrap items-center justify-between gap-2"><strong className="break-all text-sm text-dtsc-ink">{session.number}</strong><span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2 py-1 text-xs font-bold text-dtsc-ink">{financeStatusLabel(session.status, locale)} · {session.status === "CLOSED" ? (session.closedByLabel || "—") : session.openedByLabel || "—"}</span></div><div className="mt-2 grid gap-1 text-xs text-dtsc-muted sm:grid-cols-2"><span>{locale === "fr" ? "Ouverture" : "Opened"} : {new Date(session.openedAt).toLocaleString(locale === "fr" ? "fr-FR" : "en-US")} · {session.openedByLabel || "—"}</span>{session.submittedAt ? <span>{locale === "fr" ? "Clôture soumise" : "Closing submitted"} : {new Date(session.submittedAt).toLocaleString(locale === "fr" ? "fr-FR" : "en-US")} · {session.submittedByLabel || "—"}</span> : null}{session.validatedAt ? <span>{locale === "fr" ? "Clôture validée" : "Closing approved"} : {new Date(session.validatedAt).toLocaleString(locale === "fr" ? "fr-FR" : "en-US")} · {session.closedByLabel || "—"}</span> : null}</div></button>)}</div>}
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
        <div className="flex flex-wrap gap-2"><StatusBadge tone={financeStatusTone(detail.status)}>{financeStatusLabel(detail.status, locale)} · {detail.status === "CLOSED" ? detail.closedByLabel || "—" : detail.openedByLabel || "—"}</StatusBadge></div>
        <div className="grid gap-1 rounded-xl bg-dtsc-page p-3 text-xs text-dtsc-muted"><p>{locale === "fr" ? "Ouverte le" : "Opened on"} {new Date(detail.openedAt).toLocaleString(locale === "fr" ? "fr-FR" : "en-US")} · {detail.openedByLabel || "—"}</p>{detail.submittedAt ? <p>{locale === "fr" ? "Clôture soumise le" : "Closing submitted on"} {new Date(detail.submittedAt).toLocaleString(locale === "fr" ? "fr-FR" : "en-US")} · {detail.submittedByLabel || "—"}</p> : null}{detail.validatedAt ? <p>{locale === "fr" ? "Clôture validée le" : "Closing approved on"} {new Date(detail.validatedAt).toLocaleString(locale === "fr" ? "fr-FR" : "en-US")} · {detail.closedByLabel || "—"}</p> : null}</div>
        <FinanceDetailGrid>
          <FinanceDetailValue label={t("opening")}>{cashAmount(detail.openingAmount, detail.financialAccount?.currencyCode)}</FinanceDetailValue>
          {detail.theoreticalClosingAmount !== undefined ? <FinanceDetailValue label={t("theoretical")}>{cashAmount(detail.theoreticalClosingAmount, detail.financialAccount?.currencyCode)}</FinanceDetailValue> : null}
          {detail.countedClosingAmount !== undefined ? <FinanceDetailValue label={t("counted")}>{cashAmount(detail.countedClosingAmount, detail.financialAccount?.currencyCode)}</FinanceDetailValue> : null}
          {detail.discrepancyAmount !== undefined ? <FinanceDetailValue label={t("variance")}>{cashAmount(detail.discrepancyAmount, detail.financialAccount?.currencyCode)}</FinanceDetailValue> : null}
        </FinanceDetailGrid>
        {detail.expectedCurrentAmount === null ? <p role="status" className="text-sm text-dtsc-muted">{t("cashMovementEvidenceUnavailable")}</p> : null}
        {detail.varianceQualificationPending ? <p role="status" className="rounded-xl border border-amber-500/30 p-3 text-sm text-dtsc-ink">{t("cashVarianceQualificationPending")}</p> : null}
        {(detail.varianceReviews || []).map(variance => <section key={variance.id} className="grid min-w-0 gap-2 rounded-xl border border-dtsc-border p-3">
          <strong>{t("cashVarianceReviewTitle")}</strong>
          <p className="text-sm">{financeMoney(variance.amount,String(detail.financialAccount?.currencyCode || ""), locale)} · {t(variance.status==="RESOLVED_CANONICAL"?"cashVarianceCanonicalResolved":variance.status==="PENDING_QUALIFICATION"?"cashVarianceAwaitingReview":variance.status==="APPROVED"?"cashVarianceLegacy":variance.status==="POSTED"?"cashVariancePosted":variance.status==="LEGACY_REVERSED"?"cashVarianceLegacyReversed":variance.status==="REAL_REVERSED"?"cashVarianceRealReversed":"cashVarianceCountCorrected")}</p>
          <p className="break-words text-xs text-dtsc-muted">{variance.reason}</p>
          {variance.canonicalSourceHref?<a href={variance.canonicalSourceHref} className="break-words text-sm text-dtsc-primary underline hover:opacity-80 focus-visible:outline focus-visible:outline-2 active:opacity-70">{t("cashVarianceCanonicalSource")}</a>:null}
          {detail.canReviewVariance && variance.canReview!==false && ["PENDING_QUALIFICATION","APPROVED","POSTED","RESOLVED_CANONICAL"].includes(variance.status) ? <Button variant="outline" disabled={busy} onClick={()=>{setCanonicalPage(1);setCanonicalTransaction("");setVarianceDecision(variance.status==="RESOLVED_CANONICAL"?"UNLINK_CANONICAL":variance.status==="POSTED"?"REVERSE_REAL":"CORRECT_COUNT");setVarianceTarget({session:detail,variance});setDetail(null);}}>{t("cashVarianceReviewTitle")}</Button> : null}
        </section>)}
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
        {detail.canViewHandover?<CashHandoverPanel key={detail.id} organizationId={organizationId} sessionId={detail.id} locale={locale} onChanged={async()=>{setDetail(await fetchOperationalFinanceRecord<CashSession>(`/api/enterprise/${organizationId}/cash-sessions`,detail.id));setRefreshKey(v=>v+1);}}/>:null}
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
          disabled={busy}
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
          disabled={busy}
        />
        <div data-responsive-actions><Button type="button" variant="outline" disabled={busy} onClick={() => setAssignTarget(null)}>{t("cancel")}</Button><Button type="submit" disabled={busy}><ShieldCheck className="h-4 w-4" />{t("confirmCashApproverAssignment")}</Button></div>
      </form> : null}
    </Dialog>

    <Dialog open={Boolean(varianceTarget)} onClose={()=>{if(!busy)setVarianceTarget(null);}} title={t("cashVarianceReviewTitle")} presentation="editor" className="max-w-xl">
      {varianceTarget ? <form onSubmit={submitVarianceReview} className="grid min-w-0 gap-4">
        <p className="text-sm text-dtsc-muted">{t("cashVarianceReviewHelp")}</p>
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-dtsc-ink">{t("cashVarianceCanonicalHelp")}</p>
        <Field label={t("decision")}><NativeSelect name="decision" value={varianceDecision} onChange={setVarianceDecision} disabled={busy} required items={varianceTarget.variance.status==="RESOLVED_CANONICAL"?[{id:"UNLINK_CANONICAL",label:t("cashVarianceCanonicalUnlink")}]:varianceTarget.variance.status==="POSTED"?[{id:"REVERSE_REAL",label:t("cashVarianceReverseReal")}]:[{id:"CORRECT_COUNT",label:t("cashVarianceCorrectCount")},...(varianceTarget.variance.status==="PENDING_QUALIFICATION"?[...(varianceTarget.session.canLinkCanonical?[{id:"LINK_CANONICAL",label:t("cashVarianceCanonicalLink")}]:[]),{id:"REAL_VARIANCE",label:t("cashVarianceReal")}]:[])]}/></Field>
        {varianceDecision==="LINK_CANONICAL"?<div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2">
          <Field label={t("cashVarianceCanonicalSource")}><NativeSelect name="canonicalTreasuryTransactionId" value={canonicalTransaction} onChange={setCanonicalTransaction} disabled={busy||canonicalLoading} required items={[{id:"",label:t(canonicalLoading?"cashVarianceCanonicalLoading":"cashVarianceCanonicalChoose")},...canonicalCandidates.map(item=>({id:item.id,label:`${item.number} · ${financeMoney(item.amount,item.currencyCode,locale)}`}))]}/></Field>
          {!canonicalLoading&&!canonicalCandidates.length?<p className="text-sm text-dtsc-muted">{t("cashVarianceCanonicalEmpty")}</p>:null}
          <div data-responsive-actions><Button type="button" variant="outline" disabled={busy||canonicalLoading||canonicalPage===1} onClick={()=>setCanonicalPage(p=>p-1)}>{t("previous")}</Button><Button type="button" variant="outline" disabled={busy||canonicalLoading||!canonicalHasMore} onClick={()=>setCanonicalPage(p=>p+1)}>{t("next")}</Button></div>
        </div>:null}
        <Field label={t("cashVarianceVerifiedCount")}><Input name="verifiedCount" type="number" min="0" step="0.000001" required disabled={busy}/></Field>
        <Field label={t("cashVarianceEvidence")}><Input name="evidenceReference" minLength={3} maxLength={200} required disabled={busy}/></Field>
        <Field label={t("decisionReasonComment")}><textarea name="reason" minLength={10} maxLength={1000} required rows={4} disabled={busy} className="w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2"/></Field>
        <p className="text-sm text-dtsc-muted">{t(["LINK_CANONICAL","UNLINK_CANONICAL"].includes(varianceDecision)?"cashVarianceCanonicalNoEffect":varianceDecision==="CORRECT_COUNT"?"cashVarianceNoCashEffect":varianceDecision==="REVERSE_REAL"?"cashVarianceReverseRealEffect":"cashVarianceRealEffect")}</p>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="attest" required disabled={busy}/>{t("cashVarianceAttest")}</label>
        <FinanceCriticalStepUpFields action="APPROVE" locale={locale}/>
        <div data-responsive-actions><Button type="button" variant="outline" disabled={busy} onClick={()=>setVarianceTarget(null)}>{t("cancel")}</Button><Button type="submit" disabled={busy||(varianceDecision==="LINK_CANONICAL"&&(canonicalLoading||!canonicalTransaction))}>{t("saveDecision")}</Button></div>
      </form> : null}
    </Dialog>
    <Dialog open={Boolean(validateTarget)} onClose={() => setValidateTarget(null)} title={t("independentValidation")} className="max-w-xl">
      {validateTarget ? <form onSubmit={validateCashSession} className="grid gap-4">
        <Field label={t("decision")}><NativeSelect name="approve" value={cashDecision} onChange={setCashDecision} required disabled={busy} items={[{ id: "true", label: t("approveClose") }, { id: "false", label: t("rejectRequestCorrection") }]} /></Field>
        <Field label={t("decisionReasonComment")}>
          <textarea name="reason" rows={4} minLength={cashDecision === "false" ? 4 : undefined} required={cashDecision === "false"} disabled={busy} className="w-full min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-base disabled:opacity-60" />
          <p className="mt-2 text-xs leading-5 text-dtsc-muted">{t(cashDecision === "false" ? "rejectionReasonMinimumHint" : "decisionCommentOptionalHint")}</p>
        </Field>
        <FinanceCriticalStepUpFields action="APPROVE" locale={locale} />
        <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => setValidateTarget(null)}>{t("cancel")}</Button><Button type="submit" disabled={busy}>{t("saveDecision")}</Button></div>
      </form> : null}
    </Dialog>
  </ModuleWorkspace>;
}
