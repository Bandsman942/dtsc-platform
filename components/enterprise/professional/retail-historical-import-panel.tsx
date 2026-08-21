"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArchiveRestore, CheckCircle2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useAppLocale } from "@/components/i18n/locale-provider";
import { Field, formatEnterpriseDate } from "@/components/enterprise/core-v2/erp-v2-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BusinessList, BusinessListItem } from "@/components/workspace/business-list";
import { EmptyState } from "@/components/workspace/empty-state";
import { ModuleSection } from "@/components/workspace/module-workspace";
import { StatusBadge } from "@/components/workspace/status-badge";
import {
  historicalImportCopy,
  historicalImportErrorMessage,
  type HistoricalImportLocale,
} from "@/lib/enterprise/retail/historical-import-copy";

type FinancialAccount = {
  id: string;
  code: string;
  name: string;
  accountType: string;
  currencyCode: string;
  operationalBalance: string | number;
  siteId: string | null;
};

type Provider = {
  id: string;
  providerCode: string;
  label: string;
  providerType: string;
};

type ProviderAccount = {
  providerId: string;
  providerCode: string;
  accountUse: string;
  currencyCode: string;
  financialAccountId: string;
};

type PreviewAccount = {
  financialAccountId: string;
  code: string;
  name: string;
  accountType: string;
  currencyCode: string;
  openingBalance: string;
  netEffect: string;
  computedClosingBalance: string;
  expectedClosingBalance: string | null;
  expectedClosingMatches: boolean;
  used: boolean;
};

type HistoricalPreview = {
  sourceLabel: string;
  periodStart: string;
  periodEnd: string;
  lineCount: number;
  mobileMoneyCount: number;
  telcoTopupCount: number;
  accounts: PreviewAccount[];
};

type HistoricalImportItem = {
  id: string;
  reference: string;
  sourceLabel: string;
  status: string;
  periodStart: string;
  periodEnd: string;
  previewJson: HistoricalPreview | null;
  approvedAt: string | null;
  appliedAt: string | null;
  lastErrorCode: string | null;
  revision: number;
  createdAt: string;
  canApplyByCurrentUser: boolean;
};

type WorkspaceResponse = {
  imports: HistoricalImportItem[];
  accounts: FinancialAccount[];
  providers: Provider[];
  providerAccounts: ProviderAccount[];
};

type BaselineDraft = {
  clientId: string;
  financialAccountId: string;
  openingBalance: string;
  expectedClosingBalance: string;
};

type MobileMoneyDraft = {
  clientId: string;
  kind: "MOBILE_MONEY";
  occurredAt: string;
  providerCode: string;
  transactionType: "DEPOSIT" | "WITHDRAWAL";
  customerPhone: string;
  principalAmount: string;
  customerFeeAmount: string;
  providerCommissionAmount: string;
  feeCollectionMode: "NONE" | "CASH" | "PROVIDER";
  cashAccountId: string;
  externalReference: string;
  sourceLine: string;
};

type TelcoDraft = {
  clientId: string;
  kind: "TELCO_TOPUP";
  occurredAt: string;
  providerCode: string;
  destinationPhone: string;
  offerLabel: string;
  saleAmount: string;
  operatorCost: string;
  tenderFinancialAccountId: string;
  externalReference: string;
  sourceLine: string;
};

type OperationDraft = MobileMoneyDraft | TelcoDraft;

function clientId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function Select({ value, onChange, children, disabled, name }: {
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
  disabled?: boolean;
  name?: string;
}) {
  return (
    <select
      name={name}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
      className="min-h-11 w-full min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-semibold text-dtsc-ink"
    >
      {children}
    </select>
  );
}

function amount(value: string | number, currency: string, locale: HistoricalImportLocale) {
  const number = Number(value || 0);
  return new Intl.NumberFormat(locale === "en" ? "en-US" : "fr-FR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(number) ? number : 0) + ` ${currency}`;
}

function statusTone(status: string) {
  if (status === "APPLIED") return "success" as const;
  if (status === "APPLYING") return "warning" as const;
  return "neutral" as const;
}

function statusLabel(status: string, locale: HistoricalImportLocale) {
  const copy = historicalImportCopy(locale);
  if (status === "APPLIED") return copy.statusApplied;
  if (status === "APPLYING") return copy.statusApplying;
  return copy.statusDraft;
}

function toIso(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString();
}

function newMobileMoneyDraft(): MobileMoneyDraft {
  return {
    clientId: clientId(),
    kind: "MOBILE_MONEY",
    occurredAt: "",
    providerCode: "",
    transactionType: "DEPOSIT",
    customerPhone: "",
    principalAmount: "",
    customerFeeAmount: "0",
    providerCommissionAmount: "0",
    feeCollectionMode: "NONE",
    cashAccountId: "",
    externalReference: "",
    sourceLine: "",
  };
}

function newTelcoDraft(): TelcoDraft {
  return {
    clientId: clientId(),
    kind: "TELCO_TOPUP",
    occurredAt: "",
    providerCode: "",
    destinationPhone: "",
    offerLabel: "",
    saleAmount: "",
    operatorCost: "",
    tenderFinancialAccountId: "",
    externalReference: "",
    sourceLine: "",
  };
}

export function RetailHistoricalImportPanel({ organizationId, canManage }: { organizationId: string; canManage: boolean }) {
  const locale: HistoricalImportLocale = useAppLocale() === "en" ? "en" : "fr";
  const copy = historicalImportCopy(locale);
  const [workspace, setWorkspace] = useState<WorkspaceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [sourceLabel, setSourceLabel] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [baselines, setBaselines] = useState<BaselineDraft[]>([]);
  const [operations, setOperations] = useState<OperationDraft[]>([]);
  const [preview, setPreview] = useState<HistoricalPreview | null>(null);
  const requestKey = useRef("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/enterprise/${organizationId}/retail/historical-imports`, { cache: "no-store" });
      const body = await response.json().catch(() => null) as (WorkspaceResponse & { error?: string }) | null;
      if (!response.ok || !body) throw new Error(body?.error || "RETAIL_HISTORY_LIST_FAILED");
      setWorkspace(body);
    } catch (caught) {
      setError(historicalImportErrorMessage(caught instanceof Error ? caught.message : undefined, locale));
    } finally {
      setLoading(false);
    }
  }, [locale, organizationId]);

  useEffect(() => { void load(); }, [load]);

  const accountById = useMemo(
    () => new Map((workspace?.accounts || []).map((account) => [account.id, account])),
    [workspace?.accounts],
  );

  const mobileProviders = useMemo(
    () => (workspace?.providers || []).filter((provider) => ["MOBILE_MONEY", "BOTH"].includes(provider.providerType)),
    [workspace?.providers],
  );
  const telcoProviders = useMemo(
    () => (workspace?.providers || []).filter((provider) => ["TELCO", "BOTH"].includes(provider.providerType)),
    [workspace?.providers],
  );
  const cashAccounts = useMemo(
    () => (workspace?.accounts || []).filter((account) => account.accountType === "CASH"),
    [workspace?.accounts],
  );
  const tenderAccounts = useMemo(
    () => (workspace?.accounts || []).filter((account) => ["CASH", "MOBILE_MONEY", "BANK", "CLEARING"].includes(account.accountType)),
    [workspace?.accounts],
  );

  function invalidatePreview() {
    if (preview) setPreview(null);
    setMessage("");
    setError("");
  }

  function addBaselineForAccount(accountId: string) {
    if (!accountId) return;
    const account = accountById.get(accountId);
    if (!account) return;
    setBaselines((current) => current.some((item) => item.financialAccountId === accountId)
      ? current
      : [...current, {
          clientId: clientId(),
          financialAccountId: accountId,
          openingBalance: String(account.operationalBalance),
          expectedClosingBalance: "",
        }]);
  }

  useEffect(() => {
    if (!workspace) return;
    const required = new Set<string>();
    for (const operation of operations) {
      const primaryId = operation.kind === "MOBILE_MONEY" ? operation.cashAccountId : operation.tenderFinancialAccountId;
      if (!primaryId) continue;
      required.add(primaryId);
      const primary = accountById.get(primaryId);
      if (!primary || !operation.providerCode) continue;
      const use = operation.kind === "MOBILE_MONEY" ? "MOBILE_MONEY_FLOAT" : "TELCO_FLOAT";
      const mapping = workspace.providerAccounts.find((item) => (
        item.providerCode === operation.providerCode
        && item.accountUse === use
        && item.currencyCode === primary.currencyCode
      ));
      if (mapping) required.add(mapping.financialAccountId);
    }
    if (!required.size) return;
    setBaselines((current) => {
      const next = [...current];
      let changed = false;
      for (const accountId of required) {
        if (next.some((item) => item.financialAccountId === accountId)) continue;
        const account = accountById.get(accountId);
        if (!account) continue;
        next.push({
          clientId: clientId(),
          financialAccountId: accountId,
          openingBalance: String(account.operationalBalance),
          expectedClosingBalance: "",
        });
        changed = true;
      }
      return changed ? next : current;
    });
  }, [accountById, operations, workspace]);

  function updateBaseline(clientKey: string, patch: Partial<BaselineDraft>) {
    invalidatePreview();
    setBaselines((current) => current.map((item) => item.clientId === clientKey ? { ...item, ...patch } : item));
  }

  function updateOperation(clientKey: string, patch: Partial<OperationDraft>) {
    invalidatePreview();
    setOperations((current) => current.map((item) => item.clientId === clientKey ? { ...item, ...patch } as OperationDraft : item));
  }

  function payload() {
    if (!requestKey.current) requestKey.current = crypto.randomUUID();
    return {
      idempotencyKey: requestKey.current,
      sourceLabel: sourceLabel.trim(),
      periodStart: toIso(periodStart),
      periodEnd: toIso(periodEnd),
      baselines: baselines
        .filter((item) => item.financialAccountId)
        .map((item) => ({
          financialAccountId: item.financialAccountId,
          openingBalance: item.openingBalance,
          expectedClosingBalance: item.expectedClosingBalance.trim() || null,
        })),
      lines: operations.map((item) => item.kind === "MOBILE_MONEY" ? {
        kind: item.kind,
        occurredAt: toIso(item.occurredAt),
        providerCode: item.providerCode,
        transactionType: item.transactionType,
        customerPhone: item.customerPhone,
        principalAmount: item.principalAmount,
        customerFeeAmount: item.customerFeeAmount || "0",
        providerCommissionAmount: item.providerCommissionAmount || "0",
        feeCollectionMode: item.feeCollectionMode,
        cashAccountId: item.cashAccountId,
        externalReference: item.externalReference.trim() || null,
        sourceLine: item.sourceLine.trim() || null,
      } : {
        kind: item.kind,
        occurredAt: toIso(item.occurredAt),
        providerCode: item.providerCode,
        destinationPhone: item.destinationPhone,
        offerLabel: item.offerLabel,
        saleAmount: item.saleAmount,
        operatorCost: item.operatorCost,
        tenderFinancialAccountId: item.tenderFinancialAccountId,
        externalReference: item.externalReference.trim() || null,
        sourceLine: item.sourceLine.trim() || null,
      }),
    };
  }

  async function previewImport() {
    if (busy) return;
    setBusy("preview");
    setMessage("");
    setError("");
    try {
      const response = await fetch(`/api/enterprise/${organizationId}/retail/historical-imports/preview`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload()),
      });
      const body = await response.json().catch(() => null) as ({ preview?: HistoricalPreview; error?: string }) | null;
      if (!response.ok || !body?.preview) throw new Error(body?.error || "RETAIL_HISTORY_PREVIEW_FAILED");
      setPreview(body.preview);
      setMessage(copy.previewReady);
    } catch (caught) {
      setPreview(null);
      setError(historicalImportErrorMessage(caught instanceof Error ? caught.message : undefined, locale));
    } finally {
      setBusy(null);
    }
  }

  function resetDraft() {
    setSourceLabel("");
    setPeriodStart("");
    setPeriodEnd("");
    setBaselines([]);
    setOperations([]);
    setPreview(null);
    requestKey.current = "";
  }

  async function saveDraft() {
    if (!preview || busy) {
      if (!preview) setError(copy.validationRequired);
      return;
    }
    setBusy("save");
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/enterprise/${organizationId}/retail/historical-imports`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload()),
      });
      const body = await response.json().catch(() => null) as ({ error?: string }) | null;
      if (!response.ok) throw new Error(body?.error || "RETAIL_HISTORY_DRAFT_FAILED");
      setMessage(copy.draftSaved);
      resetDraft();
      await load();
    } catch (caught) {
      setError(historicalImportErrorMessage(caught instanceof Error ? caught.message : undefined, locale));
    } finally {
      setBusy(null);
    }
  }

  async function applyImport(item: HistoricalImportItem) {
    if (busy || !item.canApplyByCurrentUser) return;
    setBusy(`apply:${item.id}`);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/enterprise/${organizationId}/retail/historical-imports/${item.id}/apply`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ revision: item.revision }),
      });
      const body = await response.json().catch(() => null) as ({ error?: string }) | null;
      if (!response.ok) throw new Error(body?.error || "RETAIL_HISTORY_APPLY_FAILED");
      setMessage(copy.applied);
      await load();
    } catch (caught) {
      setError(historicalImportErrorMessage(caught instanceof Error ? caught.message : undefined, locale));
      await load();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-5 grid min-w-0 gap-5">
      <ModuleSection
        title={copy.title}
        description={copy.description}
      >
        <div className="grid min-w-0 gap-4">
          {error ? <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-semibold text-dtsc-ink">{error}</div> : null}
          {message ? <div role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-dtsc-ink">{message}</div> : null}

          {!canManage ? (
            <div className="rounded-xl border border-dtsc-border bg-dtsc-page p-4 text-sm font-semibold text-dtsc-muted">{copy.readOnly}</div>
          ) : (
            <>
              <div className="grid min-w-0 gap-4 md:grid-cols-2">
                <Field label={copy.sourceLabel}>
                  <Input value={sourceLabel} onChange={(event) => { invalidatePreview(); setSourceLabel(event.target.value); }} placeholder={copy.sourcePlaceholder} maxLength={200} />
                </Field>
                <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                  <Field label={copy.periodStart}>
                    <Input type="datetime-local" step="1" value={periodStart} onChange={(event) => { invalidatePreview(); setPeriodStart(event.target.value); }} />
                  </Field>
                  <Field label={copy.periodEnd}>
                    <Input type="datetime-local" step="1" value={periodEnd} onChange={(event) => { invalidatePreview(); setPeriodEnd(event.target.value); }} />
                  </Field>
                </div>
              </div>

              <div className="rounded-2xl border border-dtsc-border bg-dtsc-page p-3 sm:p-4">
                <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-black text-dtsc-ink">{copy.balancesTitle}</h3>
                    <p className="mt-1 text-sm font-semibold text-dtsc-muted">{copy.balancesDescription}</p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!workspace?.accounts.length}
                    onClick={() => {
                      const available = workspace?.accounts.find((account) => !baselines.some((item) => item.financialAccountId === account.id));
                      if (available) addBaselineForAccount(available.id);
                    }}
                  >
                    <Plus className="h-4 w-4" />{copy.addBalance}
                  </Button>
                </div>
                <div className="mt-4 grid min-w-0 gap-3">
                  {baselines.map((baseline) => {
                    const selected = accountById.get(baseline.financialAccountId);
                    return (
                      <div key={baseline.clientId} className="grid min-w-0 gap-3 rounded-xl border border-dtsc-border bg-dtsc-surface p-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(8rem,.7fr)_minmax(8rem,.7fr)_auto] lg:items-end">
                        <Field label={copy.account}>
                          <Select value={baseline.financialAccountId} onChange={(value) => {
                            const account = accountById.get(value);
                            updateBaseline(baseline.clientId, {
                              financialAccountId: value,
                              openingBalance: account ? String(account.operationalBalance) : "",
                            });
                          }}>
                            <option value="">{copy.selectAccount}</option>
                            {(workspace?.accounts || []).map((account) => <option key={account.id} value={account.id}>{account.code} · {account.name} · {account.currencyCode}</option>)}
                          </Select>
                        </Field>
                        <Field label={copy.openingBalance}>
                          <Input inputMode="decimal" value={baseline.openingBalance} onChange={(event) => updateBaseline(baseline.clientId, { openingBalance: event.target.value })} />
                        </Field>
                        <Field label={copy.expectedClosingBalance}>
                          <Input inputMode="decimal" value={baseline.expectedClosingBalance} onChange={(event) => updateBaseline(baseline.clientId, { expectedClosingBalance: event.target.value })} placeholder={selected ? amount(selected.operationalBalance, selected.currencyCode, locale) : ""} />
                        </Field>
                        <Button type="button" variant="ghost" size="icon" aria-label={copy.remove} onClick={() => { invalidatePreview(); setBaselines((current) => current.filter((item) => item.clientId !== baseline.clientId)); }}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-2xl border border-dtsc-border bg-dtsc-page p-3 sm:p-4">
                <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-black text-dtsc-ink">{copy.operationsTitle}</h3>
                    <p className="mt-1 text-sm font-semibold text-dtsc-muted">{copy.operationsDescription}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => { invalidatePreview(); setOperations((current) => [...current, newMobileMoneyDraft()]); }}>
                      <Plus className="h-4 w-4" />{copy.addMobileMoney}
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => { invalidatePreview(); setOperations((current) => [...current, newTelcoDraft()]); }}>
                      <Plus className="h-4 w-4" />{copy.addTelco}
                    </Button>
                  </div>
                </div>

                <div className="mt-4 grid min-w-0 gap-4">
                  {operations.map((operation, index) => {
                    const providers = operation.kind === "MOBILE_MONEY" ? mobileProviders : telcoProviders;
                    const primaryAccounts = operation.kind === "MOBILE_MONEY" ? cashAccounts : tenderAccounts;
                    return (
                      <div key={operation.clientId} className="rounded-2xl border border-dtsc-border bg-dtsc-surface p-3 sm:p-4">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <div className="font-black text-dtsc-ink">#{index + 1} · {operation.kind === "MOBILE_MONEY" ? copy.mobileMoney : copy.telco}</div>
                          <Button type="button" variant="ghost" size="sm" onClick={() => { invalidatePreview(); setOperations((current) => current.filter((item) => item.clientId !== operation.clientId)); }}>
                            <Trash2 className="h-4 w-4" />{copy.remove}
                          </Button>
                        </div>
                        <div className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-3">
                          <Field label={copy.operationDate}>
                            <Input type="datetime-local" step="1" value={operation.occurredAt} onChange={(event) => updateOperation(operation.clientId, { occurredAt: event.target.value })} />
                          </Field>
                          <Field label={copy.provider}>
                            <Select value={operation.providerCode} onChange={(value) => updateOperation(operation.clientId, { providerCode: value })}>
                              <option value="">{copy.selectProvider}</option>
                              {providers.map((provider) => <option key={provider.id} value={provider.providerCode}>{provider.label}</option>)}
                            </Select>
                          </Field>
                          <Field label={operation.kind === "MOBILE_MONEY" ? copy.cashAccount : copy.tenderAccount}>
                            <Select
                              value={operation.kind === "MOBILE_MONEY" ? operation.cashAccountId : operation.tenderFinancialAccountId}
                              onChange={(value) => {
                                if (operation.kind === "MOBILE_MONEY") updateOperation(operation.clientId, { cashAccountId: value });
                                else updateOperation(operation.clientId, { tenderFinancialAccountId: value });
                                addBaselineForAccount(value);
                              }}
                            >
                              <option value="">{copy.selectAccount}</option>
                              {primaryAccounts.map((account) => <option key={account.id} value={account.id}>{account.code} · {account.name} · {account.currencyCode}</option>)}
                            </Select>
                          </Field>

                          {operation.kind === "MOBILE_MONEY" ? (
                            <>
                              <Field label={copy.operationType}>
                                <Select value={operation.transactionType} onChange={(value) => updateOperation(operation.clientId, { transactionType: value as "DEPOSIT" | "WITHDRAWAL" })}>
                                  <option value="DEPOSIT">{copy.deposit}</option>
                                  <option value="WITHDRAWAL">{copy.withdrawal}</option>
                                </Select>
                              </Field>
                              <Field label={copy.customerPhone}><Input inputMode="tel" value={operation.customerPhone} onChange={(event) => updateOperation(operation.clientId, { customerPhone: event.target.value })} /></Field>
                              <Field label={copy.principal}><Input inputMode="decimal" value={operation.principalAmount} onChange={(event) => updateOperation(operation.clientId, { principalAmount: event.target.value })} /></Field>
                              <Field label={copy.customerFee}><Input inputMode="decimal" value={operation.customerFeeAmount} onChange={(event) => updateOperation(operation.clientId, { customerFeeAmount: event.target.value })} /></Field>
                              <Field label={copy.providerCommission}><Input inputMode="decimal" value={operation.providerCommissionAmount} onChange={(event) => updateOperation(operation.clientId, { providerCommissionAmount: event.target.value })} /></Field>
                              <Field label={copy.feeCollection}>
                                <Select value={operation.feeCollectionMode} onChange={(value) => updateOperation(operation.clientId, { feeCollectionMode: value as "NONE" | "CASH" | "PROVIDER" })}>
                                  <option value="NONE">{copy.feeNone}</option>
                                  <option value="CASH">{copy.feeCash}</option>
                                  <option value="PROVIDER">{copy.feeProvider}</option>
                                </Select>
                              </Field>
                            </>
                          ) : (
                            <>
                              <Field label={copy.customerPhone}><Input inputMode="tel" value={operation.destinationPhone} onChange={(event) => updateOperation(operation.clientId, { destinationPhone: event.target.value })} /></Field>
                              <Field label={copy.offerLabel}><Input value={operation.offerLabel} onChange={(event) => updateOperation(operation.clientId, { offerLabel: event.target.value })} /></Field>
                              <Field label={copy.saleAmount}><Input inputMode="decimal" value={operation.saleAmount} onChange={(event) => updateOperation(operation.clientId, { saleAmount: event.target.value })} /></Field>
                              <Field label={copy.operatorCost}><Input inputMode="decimal" value={operation.operatorCost} onChange={(event) => updateOperation(operation.clientId, { operatorCost: event.target.value })} /></Field>
                            </>
                          )}
                          <Field label={copy.operatorReference}><Input value={operation.externalReference} onChange={(event) => updateOperation(operation.clientId, { externalReference: event.target.value })} maxLength={160} /></Field>
                          <Field label={copy.sourceLine}><Input value={operation.sourceLine} onChange={(event) => updateOperation(operation.clientId, { sourceLine: event.target.value })} maxLength={120} /></Field>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex min-w-0 flex-wrap gap-2">
                <Button type="button" variant="outline" disabled={Boolean(busy) || !operations.length} onClick={() => void previewImport()}>
                  <ArchiveRestore className="h-4 w-4" />{busy === "preview" ? copy.previewing : copy.preview}
                </Button>
                <Button type="button" disabled={Boolean(busy) || !preview} onClick={() => void saveDraft()}>
                  <CheckCircle2 className="h-4 w-4" />{busy === "save" ? copy.saving : copy.saveDraft}
                </Button>
              </div>

              {preview ? (
                <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-3 sm:p-4">
                  <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                    <h3 className="font-black text-dtsc-ink">{copy.previewAccounts}</h3>
                    <div className="text-xs font-bold text-dtsc-muted">{preview.lineCount} {copy.lineCount} · {preview.mobileMoneyCount} {copy.mobileMoney} · {preview.telcoTopupCount} {copy.telco}</div>
                  </div>
                  <div className="mt-3 grid min-w-0 gap-2 md:grid-cols-2">
                    {preview.accounts.filter((account) => account.used).map((account) => (
                      <div key={account.financialAccountId} className="rounded-xl border border-dtsc-border bg-dtsc-surface p-3 text-sm">
                        <div className="font-black text-dtsc-ink">{account.code} · {account.name}</div>
                        <div className="mt-1 font-semibold text-dtsc-muted">{copy.openingBalance}: {amount(account.openingBalance, account.currencyCode, locale)}</div>
                        <div className="font-semibold text-dtsc-muted">{copy.effect}: {amount(account.netEffect, account.currencyCode, locale)}</div>
                        <div className="font-semibold text-dtsc-muted">{copy.computedClosing}: {amount(account.computedClosingBalance, account.currencyCode, locale)}</div>
                        {account.expectedClosingBalance ? <div className="font-semibold text-dtsc-muted">{copy.expectedClosing}: {amount(account.expectedClosingBalance, account.currencyCode, locale)}</div> : null}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>
      </ModuleSection>

      <ModuleSection
        title={copy.historyTitle}
        description={copy.independentReview}
      >
        <div className="flex justify-end">
          <Button variant="outline" size="sm" disabled={loading || Boolean(busy)} onClick={() => void load()}>
            <RefreshCw className="h-4 w-4" />{copy.refresh}
          </Button>
        </div>
        {loading ? (
          <div className="mt-3 rounded-xl border border-dtsc-border bg-dtsc-page p-4 text-sm font-semibold text-dtsc-muted">…</div>
        ) : !(workspace?.imports.length) ? (
          <div className="mt-3"><EmptyState title={copy.noHistory} /></div>
        ) : (
          <div className="mt-3">
            <BusinessList>
              {workspace.imports.map((item) => {
                const summary = item.previewJson;
                const action = item.status === "APPLIED"
                  ? undefined
                  : item.canApplyByCurrentUser && canManage
                    ? <Button size="sm" disabled={Boolean(busy)} onClick={() => void applyImport(item)}>{busy === `apply:${item.id}` ? copy.applying : copy.apply}</Button>
                    : <span className="text-xs font-bold text-dtsc-muted">{copy.independentReview}</span>;
                return (
                  <BusinessListItem
                    key={item.id}
                    title={`${item.reference} · ${item.sourceLabel}`}
                    status={<StatusBadge tone={statusTone(item.status)}>{statusLabel(item.status, locale)}</StatusBadge>}
                    meta={`${formatEnterpriseDate(item.periodStart, locale)} → ${formatEnterpriseDate(item.periodEnd, locale)}${summary ? ` · ${summary.lineCount} ${copy.lineCount}` : ""}`}
                    description={item.lastErrorCode ? historicalImportErrorMessage(item.lastErrorCode, locale) : summary ? `${summary.mobileMoneyCount} ${copy.mobileMoney} · ${summary.telcoTopupCount} ${copy.telco}` : undefined}
                    actions={action}
                  />
                );
              })}
            </BusinessList>
          </div>
        )}
      </ModuleSection>
    </div>
  );
}
