"use client";

import { useEffect, useState, type FormEvent } from "react";
import { CheckCircle2, Plus, RefreshCw, RotateCcw, Settings2, Send } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { FinanceAccountingReferenceSelect } from "@/components/enterprise/core-v2/finance-accounting-reference-select";
import { AssignedApprovalSubmitPanel } from "@/components/enterprise/professional/assigned-approval-submit-panel";
import { FinancialStatementReportDialog } from "@/components/reports/financial-statement-report-dialog";
import { ProfessionalError, ProfessionalHelp, ProfessionalLoading, ProfessionalSearch } from "@/components/enterprise/professional/professional-erp-ui";
import { fetchOperationalFinanceRecord, useOperationalFinanceCollection } from "@/components/enterprise/professional/use-operational-finance-collection";
import { financeMutation, type FinanceRecord } from "@/components/enterprise/professional/finance-professional-workspace-shared";
import { financeDate, financeEnumLabel, financeMoney, financeStatusLabel, financeStatusTone, safeFinanceError, type FinanceLocale } from "@/components/enterprise/professional/finance-professional-ui";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToastMessage } from "@/components/ui/use-toast-message";
import { ModuleContent, ModuleHeader, ModuleSection, ModuleToolbar, ModuleWorkspace } from "@/components/workspace/module-workspace";
import { StatusBadge } from "@/components/workspace/status-badge";
import type { EnterpriseModuleDefinition } from "@/lib/enterprise/module-registry";
import { translateEnterpriseFinance, type EnterpriseFinanceKey } from "@/lib/i18n";

type ModuleCode = "FINANCE_TAX" | "FINANCE_CLOSE" | "FINANCE_STATEMENTS" | "FINANCE_ASSETS";
type Props = {
  organizationId: string;
  organizationName: string;
  organizationLogoUrl?: string | null;
  definition: EnterpriseModuleDefinition;
  locale?: string | null;
  canCreate: boolean;
  canSubmit: boolean;
  canWrite: boolean;
  canApprove: boolean;
  canManage: boolean;
};
type CloseCapabilities = { canSubmit?: boolean; canApprove?: boolean; canClose?: boolean; canReopen?: boolean };
type AssetCapabilities = { canRunDepreciation?: boolean; canDispose?: boolean };
type Item = FinanceRecord & {
  nameFr?: string; nameEn?: string; category?: string; jurisdiction?: string; statementType?: string; periodStart?: string; periodEnd?: string; checksum?: string;
  fiscalPeriod?: { id?: string; code?: string; fiscalYear?: { code?: string } | null } | null;
  asset?: { id?: string; code?: string; name?: string; serialNumber?: string | null; status?: string } | null;
  depreciationMethod?: string; usefulLifeMonths?: number; originalCost?: string | number; residualValue?: string | number;
  capabilities?: CloseCapabilities & AssetCapabilities;
};
type CloseAction = { item: Item; action: "APPROVE" | "CLOSE" | "REOPEN" };

const CONFIG: Record<ModuleCode, { endpoint: string; deepLink: string; help: string }> = {
  FINANCE_TAX: { endpoint: "taxes", deepLink: "taxId", help: "FINANCE_TAX" },
  FINANCE_CLOSE: { endpoint: "financial-close", deepLink: "closeId", help: "FINANCE_CLOSE" },
  FINANCE_STATEMENTS: { endpoint: "financial-statements", deepLink: "statementId", help: "FINANCE_STATEMENTS" },
  FINANCE_ASSETS: { endpoint: "asset-accounting", deepLink: "assetProfileId", help: "FINANCE_ASSETS" },
};

function itemTitle(item: Item, moduleCode: ModuleCode, locale: FinanceLocale) {
  if (moduleCode === "FINANCE_TAX") return `${item.code || ""} · ${locale === "en" ? item.nameEn || item.nameFr || "" : item.nameFr || item.nameEn || ""}`;
  if (moduleCode === "FINANCE_CLOSE") return `${item.fiscalPeriod?.fiscalYear?.code ? `${item.fiscalPeriod.fiscalYear.code} · ` : ""}${item.fiscalPeriod?.code || item.id}`;
  if (moduleCode === "FINANCE_STATEMENTS") return financeEnumLabel(item.statementType || "", locale);
  return `${item.asset?.code || ""} · ${item.asset?.name || item.id}`;
}
function itemSubtitle(item: Item, moduleCode: ModuleCode, locale: FinanceLocale) {
  if (moduleCode === "FINANCE_TAX") return `${financeEnumLabel(item.category || "", locale)}${item.jurisdiction ? ` · ${item.jurisdiction}` : ""}`;
  if (moduleCode === "FINANCE_CLOSE") return financeStatusLabel(item.status || "DRAFT", locale);
  if (moduleCode === "FINANCE_STATEMENTS") return `${financeDate(item.periodStart, locale)} → ${financeDate(item.periodEnd, locale)} · ${item.currencyCode || ""}`;
  return `${financeEnumLabel(item.depreciationMethod || "STRAIGHT_LINE", locale)} · ${item.usefulLifeMonths || 0} ${locale === "en" ? "months" : "mois"}`;
}

export function EnterpriseFinanceAdvancedWorkspaceHotfix(props: Props) {
  const { organizationId, organizationName, organizationLogoUrl, definition, locale: rawLocale, canCreate, canManage } = props;
  const locale: FinanceLocale = rawLocale === "en" ? "en" : "fr";
  const moduleCode = definition.code as ModuleCode;
  const config = CONFIG[moduleCode];
  const t = (key: EnterpriseFinanceKey) => translateEnterpriseFinance(locale, key);
  const detailsLabel = locale === "en" ? "Details" : "Détails";
  const accumulatedDepreciationAccountLabel = locale === "en" ? "Accumulated depreciation account" : "Compte d’amortissements cumulés";
  const searchParams = useSearchParams();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [detail, setDetail] = useState<Item | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [approvalTarget, setApprovalTarget] = useState<Item | null>(null);
  const [closeAction, setCloseAction] = useState<CloseAction | null>(null);
  const [depreciationOpen, setDepreciationOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  useToastMessage(message, "success"); useToastMessage(errorMessage, "error");

  const collection = useOperationalFinanceCollection<Item>({ endpoint: `/api/enterprise/${organizationId}/${config.endpoint}`, page, search, status, refreshKey });

  useEffect(() => {
    const recordId = searchParams.get(config.deepLink);
    if (!recordId) return;
    void fetchOperationalFinanceRecord<Item>(`/api/enterprise/${organizationId}/${config.endpoint}`, recordId)
      .then((record) => { if (record) setDetail(record); })
      .catch((error) => setErrorMessage(safeFinanceError(error, translateEnterpriseFinance(locale, "accountingLoadFailed"), locale)));
  }, [config.deepLink, config.endpoint, locale, organizationId, searchParams]);

  function refresh(success?: string) { setDetail(null); setRefreshKey((value) => value + 1); if (success) setMessage(success); }
  const primaryAllowed = moduleCode === "FINANCE_ASSETS" ? canManage : canCreate;

  async function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(true); setErrorMessage("");
    try {
      const base = `/api/enterprise/${organizationId}`;
      if (moduleCode === "FINANCE_TAX") {
        await financeMutation(`${base}/taxes`, { code: String(form.get("code") || ""), nameFr: String(form.get("nameFr") || ""), nameEn: String(form.get("nameEn") || ""), category: String(form.get("category") || "VAT"), jurisdiction: String(form.get("jurisdiction") || "") || undefined, payableAccountId: String(form.get("payableAccountId") || "") || undefined, recoverableAccountId: String(form.get("recoverableAccountId") || "") || undefined, roundingRule: "HALF_UP", rate: String(form.get("rate") || "0"), effectiveFrom: String(form.get("effectiveFrom") || "") });
      } else if (moduleCode === "FINANCE_CLOSE") {
        await financeMutation(`${base}/financial-close`, { fiscalPeriodId: String(form.get("fiscalPeriodId") || "") });
      } else if (moduleCode === "FINANCE_STATEMENTS") {
        const publish = canManage && form.get("publish") === "on";
        await financeMutation(`${base}/financial-statements`, { statementType: String(form.get("statementType") || "TRIAL_BALANCE"), periodStart: String(form.get("periodStart") || ""), periodEnd: String(form.get("periodEnd") || ""), currencyCode: String(form.get("currencyCode") || ""), publish });
      } else {
        await financeMutation(`${base}/asset-accounting`, { assetId: String(form.get("assetId") || ""), capitalizationSourceType: "OPERATIONAL_ASSET", currencyCode: String(form.get("currencyCode") || ""), originalCost: String(form.get("originalCost") || "0"), residualValue: String(form.get("residualValue") || "0"), usefulLifeMonths: Number(form.get("usefulLifeMonths") || 60), inServiceDate: String(form.get("inServiceDate") || ""), assetAccountId: String(form.get("assetAccountId") || ""), accumulatedDepreciationAccountId: String(form.get("accumulatedDepreciationAccountId") || ""), depreciationExpenseAccountId: String(form.get("depreciationExpenseAccountId") || "") });
      }
      setFormOpen(false); refresh(t(moduleCode === "FINANCE_TAX" ? "taxCodeCreated" : moduleCode === "FINANCE_CLOSE" ? "closeChecklistPrepared" : moduleCode === "FINANCE_STATEMENTS" ? "financialPreviewGenerated" : "assetCapitalized"));
    } catch (error) { setErrorMessage(safeFinanceError(error, t("accountingActionFailed"), locale)); } finally { setBusy(false); }
  }

  async function submitCloseApproval(approverUserId: string) {
    if (!approvalTarget) return; setBusy(true); setErrorMessage("");
    try { await financeMutation(`/api/enterprise/${organizationId}/financial-close/${approvalTarget.id}/transition`, { action: "SUBMIT", revision: approvalTarget.revision, approverUserId }); setApprovalTarget(null); refresh(t("closeWorkflowUpdated")); }
    catch (error) { setErrorMessage(safeFinanceError(error, t("accountingActionFailed"), locale)); } finally { setBusy(false); }
  }

  async function submitCloseAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!closeAction) return; const form = new FormData(event.currentTarget); setBusy(true); setErrorMessage("");
    try { await financeMutation(`/api/enterprise/${organizationId}/financial-close/${closeAction.item.id}/transition`, { action: closeAction.action, revision: closeAction.item.revision, ...(closeAction.action === "REOPEN" ? { reason: String(form.get("reason") || "") } : {}) }); setCloseAction(null); refresh(t(closeAction.action === "REOPEN" ? "periodReopened" : "closeWorkflowUpdated")); }
    catch (error) { setErrorMessage(safeFinanceError(error, t("accountingActionFailed"), locale)); } finally { setBusy(false); }
  }

  async function runDepreciation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(true); setErrorMessage("");
    try { await financeMutation(`/api/enterprise/${organizationId}/asset-depreciation/run`, { throughDate: String(form.get("throughDate") || "") }); setDepreciationOpen(false); refresh(t("depreciationPosted")); }
    catch (error) { setErrorMessage(safeFinanceError(error, t("accountingActionFailed"), locale)); } finally { setBusy(false); }
  }

  return <ModuleWorkspace>
    <ModuleHeader eyebrow={`${organizationName} · ${t("advancedFinance")}`} title={locale === "en" ? definition.labelEn : definition.labelFr} description={locale === "en" ? definition.descriptionEn : definition.descriptionFr} count={`${collection.pagination.total}`} primaryAction={primaryAllowed ? <Button onClick={() => setFormOpen(true)}><Plus className="h-4 w-4" />{t("professionalAction")}</Button> : undefined} secondaryActions={<div className="flex flex-wrap gap-2">{moduleCode === "FINANCE_ASSETS" && canManage ? <Button variant="outline" onClick={() => setDepreciationOpen(true)}><Settings2 className="h-4 w-4" />{t("runDueDepreciation")}</Button> : null}<Button variant="outline" disabled={collection.loading} onClick={() => setRefreshKey((value) => value + 1)}><RefreshCw className={`h-4 w-4 ${collection.loading ? "animate-spin" : ""}`} />{t("refresh")}</Button></div>} />
    <ModuleToolbar search={<ProfessionalSearch value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder={t("accountingSearchPlaceholder")} />} controls={<div className="flex gap-2"><Input value={status} onChange={(event) => { setStatus(event.target.value.toUpperCase()); setPage(1); }} placeholder={t("status")} /><Button variant="outline" onClick={() => { setSearch(""); setStatus(""); setPage(1); }}><RotateCcw className="h-4 w-4" />{t("reset")}</Button></div>} summary={`${collection.pagination.total} ${t("itemPlural")}`} />
    <ModuleContent><ModuleSection title={locale === "en" ? definition.labelEn : definition.labelFr} description={moduleCode === "FINANCE_CLOSE" ? t("closeSectionDescription") : t("advancedSectionDescription")} count={collection.pagination.total}>
      {collection.loading ? <ProfessionalLoading /> : collection.error ? <ProfessionalError message={collection.error} /> : collection.items.length === 0 ? <div className="flex min-h-48 items-center justify-center border-y border-dashed border-dtsc-border py-10 text-sm text-dtsc-muted">{t("noDataForView")}</div> : <div className="divide-y divide-dtsc-border border-y border-dtsc-border">{collection.items.map((item) => <article key={item.id} className="py-4"><div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"><button type="button" className="min-w-0 flex-1 text-left" onClick={() => setDetail(item)}><div className="flex flex-wrap items-center gap-2"><h3 className="break-words font-black text-dtsc-ink">{itemTitle(item, moduleCode, locale)}</h3>{item.status ? <StatusBadge tone={financeStatusTone(item.status)}>{financeStatusLabel(item.status, locale)}</StatusBadge> : null}</div><p className="mt-1 text-sm text-dtsc-muted">{itemSubtitle(item, moduleCode, locale)}</p>{moduleCode === "FINANCE_ASSETS" ? <p className="mt-2 text-sm font-black">{financeMoney(item.originalCost || 0, item.currencyCode || "USD", locale)}</p> : null}</button><div className="flex flex-wrap gap-2">{moduleCode === "FINANCE_STATEMENTS" ? <FinancialStatementReportDialog organizationId={organizationId} organizationName={organizationName} organizationLogoUrl={organizationLogoUrl} statementId={item.id} locale={rawLocale} /> : <Button size="sm" variant="outline" onClick={() => setDetail(item)}>{detailsLabel}</Button>}{moduleCode === "FINANCE_CLOSE" && item.capabilities?.canSubmit ? <Button size="sm" variant="outline" onClick={() => setApprovalTarget(item)}><Send className="h-4 w-4" />{t("actionSubmit")}</Button> : null}{moduleCode === "FINANCE_CLOSE" && item.capabilities?.canApprove ? <Button size="sm" onClick={() => setCloseAction({ item, action: "APPROVE" })}><CheckCircle2 className="h-4 w-4" />{t("actionApprove")}</Button> : null}{moduleCode === "FINANCE_CLOSE" && item.capabilities?.canClose ? <Button size="sm" onClick={() => setCloseAction({ item, action: "CLOSE" })}>{t("closePeriod")}</Button> : null}{moduleCode === "FINANCE_CLOSE" && item.capabilities?.canReopen ? <Button size="sm" variant="outline" onClick={() => setCloseAction({ item, action: "REOPEN" })}>{t("requestReopening")}</Button> : null}</div></div></article>)}</div>}
      {collection.pagination.pageCount > 1 ? <div className="mt-4 flex items-center justify-between"><Button variant="outline" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>{t("previous")}</Button><span className="text-sm font-bold text-dtsc-muted">{collection.pagination.page}/{collection.pagination.pageCount}</span><Button variant="outline" disabled={page >= collection.pagination.pageCount} onClick={() => setPage((value) => Math.min(collection.pagination.pageCount, value + 1))}>{t("next")}</Button></div> : null}
    </ModuleSection><ProfessionalHelp moduleCode={config.help} /></ModuleContent>

    <Dialog open={formOpen} onClose={() => { if (!busy) setFormOpen(false); }} title={t("professionalAction")} description={t("finalControlsServer")} presentation="editor" className="max-w-5xl"><form onSubmit={submitCreate} className="grid gap-5 sm:grid-cols-2">
      {moduleCode === "FINANCE_TAX" ? <><Input name="code" placeholder={t("code")} required disabled={busy} /><Input name="nameFr" placeholder={t("frenchLabel")} required disabled={busy} /><Input name="nameEn" placeholder={t("englishLabel")} required disabled={busy} /><select name="category" defaultValue="VAT" className="h-11 rounded-xl border border-dtsc-border bg-dtsc-surface px-3" disabled={busy}>{["VAT", "SALES_TAX", "WITHHOLDING", "EXEMPT", "ZERO_RATED"].map((value) => <option key={value} value={value}>{financeEnumLabel(value, locale)}</option>)}</select><Input name="jurisdiction" placeholder={t("jurisdiction")} disabled={busy} /><Input name="rate" type="number" step="0.0001" min="0" placeholder={t("rate")} required disabled={busy} /><Input name="effectiveFrom" type="date" required disabled={busy} /><FinanceAccountingReferenceSelect organizationId={organizationId} moduleCode="FINANCE_TAX" kind="ledger-account" name="payableAccountId" label={t("payableAccount")} locale={rawLocale} disabled={busy} /><FinanceAccountingReferenceSelect organizationId={organizationId} moduleCode="FINANCE_TAX" kind="ledger-account" name="recoverableAccountId" label={t("recoverableAccount")} locale={rawLocale} disabled={busy} /></> : null}
      {moduleCode === "FINANCE_CLOSE" ? <FinanceAccountingReferenceSelect organizationId={organizationId} moduleCode="FINANCE_CLOSE" kind="fiscal-period" name="fiscalPeriodId" label={t("period")} locale={rawLocale} status="OPEN" required disabled={busy} /> : null}
      {moduleCode === "FINANCE_STATEMENTS" ? <><select name="statementType" defaultValue="TRIAL_BALANCE" className="h-11 rounded-xl border border-dtsc-border bg-dtsc-surface px-3" disabled={busy}>{["TRIAL_BALANCE", "GENERAL_LEDGER", "JOURNALS", "INCOME_STATEMENT", "BALANCE_SHEET", "CASH_FLOW", "ASSET_REGISTER"].map((value) => <option key={value} value={value}>{financeEnumLabel(value, locale)}</option>)}</select><Input name="periodStart" type="date" required disabled={busy} /><Input name="periodEnd" type="date" required disabled={busy} /><FinanceAccountingReferenceSelect organizationId={organizationId} moduleCode="FINANCE_STATEMENTS" kind="currency" name="currencyCode" label={t("currency")} locale={rawLocale} required disabled={busy} />{canManage ? <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" name="publish" disabled={busy} />{t("publishImmutableVersion")}</label> : null}</> : null}
      {moduleCode === "FINANCE_ASSETS" ? <><FinanceAccountingReferenceSelect organizationId={organizationId} moduleCode="FINANCE_ASSETS" kind="asset" name="assetId" label={t("fixedAsset")} locale={rawLocale} required disabled={busy} /><FinanceAccountingReferenceSelect organizationId={organizationId} moduleCode="FINANCE_ASSETS" kind="currency" name="currencyCode" label={t("currency")} locale={rawLocale} required disabled={busy} /><Input name="originalCost" type="number" step="0.01" min="0.01" placeholder={t("acquisitionCost")} required disabled={busy} /><Input name="residualValue" type="number" step="0.01" min="0" defaultValue="0" placeholder={t("residualValue")} required disabled={busy} /><Input name="usefulLifeMonths" type="number" min="1" defaultValue="60" placeholder={t("usefulLifeMonths")} required disabled={busy} /><Input name="inServiceDate" type="date" required disabled={busy} /><FinanceAccountingReferenceSelect organizationId={organizationId} moduleCode="FINANCE_ASSETS" kind="ledger-account" name="assetAccountId" label={t("assetAccount")} locale={rawLocale} accountType="ASSET" required disabled={busy} /><FinanceAccountingReferenceSelect organizationId={organizationId} moduleCode="FINANCE_ASSETS" kind="ledger-account" name="accumulatedDepreciationAccountId" label={accumulatedDepreciationAccountLabel} locale={rawLocale} accountType="ASSET" required disabled={busy} /><FinanceAccountingReferenceSelect organizationId={organizationId} moduleCode="FINANCE_ASSETS" kind="ledger-account" name="depreciationExpenseAccountId" label={t("depreciationExpenseAccount")} locale={rawLocale} accountType="EXPENSE" required disabled={busy} /></> : null}
      <div className="sm:col-span-2"><Button type="submit" disabled={busy}>{busy ? t("processing") : t("save")}</Button></div>
    </form></Dialog>

    <Dialog open={Boolean(detail)} onClose={() => { if (!busy) setDetail(null); }} title={detail ? itemTitle(detail, moduleCode, locale) : detailsLabel} description={detail ? itemSubtitle(detail, moduleCode, locale) : t("advancedSectionDescription")} presentation="editor" className="max-w-4xl">{detail ? <div className="grid gap-4 sm:grid-cols-2"><div><p className="text-xs font-black uppercase text-dtsc-muted">{t("status")}</p><StatusBadge tone={financeStatusTone(detail.status || "ACTIVE")}>{financeStatusLabel(detail.status || "ACTIVE", locale)}</StatusBadge></div><div><p className="text-xs font-black uppercase text-dtsc-muted">{t("reference")}</p><p className="font-bold">{detail.reference || detail.code || detail.id}</p></div></div> : null}</Dialog>

    <Dialog open={Boolean(approvalTarget)} onClose={() => { if (!busy) setApprovalTarget(null); }} title={t("actionSubmit")} description={t("finalControlsServer")} presentation="editor">{approvalTarget ? <AssignedApprovalSubmitPanel organizationId={organizationId} moduleCode="FINANCE_CLOSE" locale={rawLocale} submitting={busy} onSubmit={submitCloseApproval} onCancel={() => setApprovalTarget(null)} /> : null}</Dialog>
    <Dialog open={Boolean(closeAction)} onClose={() => { if (!busy) setCloseAction(null); }} title={closeAction ? financeEnumLabel(closeAction.action, locale) : detailsLabel} description={t("finalControlsServer")} presentation="editor"><form onSubmit={submitCloseAction} className="grid gap-4">{closeAction?.action === "REOPEN" ? <Input name="reason" required minLength={8} placeholder={t("detailedReopeningReason")} disabled={busy} /> : null}<Button type="submit" disabled={busy}>{t("save")}</Button></form></Dialog>
    <Dialog open={depreciationOpen} onClose={() => { if (!busy) setDepreciationOpen(false); }} title={t("runDueDepreciation")} description={t("finalControlsServer")} presentation="editor"><form onSubmit={runDepreciation} className="grid gap-4"><Input name="throughDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required disabled={busy} /><Button type="submit" disabled={busy}>{t("runDueDepreciation")}</Button></form></Dialog>
  </ModuleWorkspace>;
}
