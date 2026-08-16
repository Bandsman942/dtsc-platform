"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type SelectHTMLAttributes } from "react";
import { ArrowRightLeft, CheckCircle2, RefreshCw, RotateCcw, Settings2, Smartphone, WalletCards } from "lucide-react";
import { useAppLocale } from "@/components/i18n/locale-provider";
import { Field, formatEnterpriseDate } from "@/components/enterprise/core-v2/erp-v2-ui";
import {
  MobileMoneyCashSessionManager,
  type MobileMoneyCashSession,
} from "@/components/enterprise/professional/mobile-money-cash-session-manager";
import {
  RetailErpLinks,
  RetailReportsPanel,
  RetailWorkspaceFrame,
  moneyValue,
  normalizePhonePreview,
  providerLabel,
  statusTone,
  type RetailDashboard,
  type RetailMutation,
} from "@/components/enterprise/professional/retail-workspace-shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BusinessList, BusinessListItem } from "@/components/workspace/business-list";
import { EmptyState } from "@/components/workspace/empty-state";
import { ModuleSection } from "@/components/workspace/module-workspace";
import { StatusBadge } from "@/components/workspace/status-badge";
import { customerFacingError, customerFacingStatusLabel } from "@/lib/customer-facing-language";
import type { EnterpriseModuleDefinition } from "@/lib/enterprise/module-registry";
import { customerFacingFeeCollectionMode, customerFacingMobileMoneyTransactionType } from "@/lib/retail-customer-language";
import { translateRetailWorkspace } from "@/lib/i18n";

type CurrencyAccount = {
  id: string;
  code: string;
  name: string;
  currencyCode: string;
  operationalBalance: string;
  ledgerAccountId: string;
};

type ProviderMapping = {
  id: string;
  currencyCode: string;
  financialAccountId: string;
  revision: number;
  financialAccount: CurrencyAccount;
};

type ProviderConfiguration = {
  id: string;
  providerCode: string;
  label: string;
  providerType: string;
  accounts: ProviderMapping[];
  mappedCurrencyCount: number;
  ready: boolean;
};

type MobileMoneyConfiguration = {
  country: string | null;
  requiredCurrencies: string[];
  minimumCurrencyCount: number;
  availableCurrencies: string[];
  financialAccounts: CurrencyAccount[];
  providers: ProviderConfiguration[];
};

type FxPreview = {
  providerCode: string;
  providerLabel: string;
  sourceCurrencyCode: string;
  targetCurrencyCode: string;
  sourceAmount: string;
  targetAmount: string;
  rate: string;
  rateDate: string;
  rateSource: string;
  direction: string;
  sourceAvailableBalance: string;
  sufficientBalance: boolean;
};

type OperationDraft = {
  providerCode: string;
  transactionType: string;
  customerPhone: string;
  currencyCode: string;
  principalAmount: number;
  customerFeeAmount: number;
  providerCommissionAmount: number;
  feeCollectionMode: string;
  cashAccountId: string;
  floatAccountId: null;
  externalReference: string;
};

type MobileMoneyDashboard = RetailDashboard & {
  cashSessions?: MobileMoneyCashSession[];
};

const COPY = {
  fr: {
    operationTitle: translateRetailWorkspace("fr", "operatorMobileMoneyOperation"),
    operationDescription: translateRetailWorkspace("fr", "mobileMoneyOperationDescription"),
    service: translateRetailWorkspace("fr", "operatorMobileMoneyService"),
    operation: translateRetailWorkspace("fr", "operatorOperation"),
    phone: translateRetailWorkspace("fr", "operatorCustomerPhone"),
    amount: translateRetailWorkspace("fr", "operatorCustomerAmount"),
    fee: translateRetailWorkspace("fr", "operatorCustomerFee"),
    commission: translateRetailWorkspace("fr", "operatorOperatorCommission"),
    feeCollection: translateRetailWorkspace("fr", "operatorFeeCollection"),
    reference: translateRetailWorkspace("fr", "operatorOperatorReference"),
    review: translateRetailWorkspace("fr", "operatorReviewOperation"),
    tillRequired: translateRetailWorkspace("fr", "mobileMoneyTillRequired"),
    missingWallet: translateRetailWorkspace("fr", "mobileMoneyMissingWallet"),
    walletUsed: translateRetailWorkspace("fr", "mobileMoneyWalletUsed"),
    operationConfirmed: translateRetailWorkspace("fr", "mobileMoneyOperationConfirmed"),
    confirmTitle: translateRetailWorkspace("fr", "operatorConfirmMobileMoney"),
    reviewDescription: translateRetailWorkspace("fr", "operatorReviewTheInformationBeforeConfirmingTheOperation"),
    edit: translateRetailWorkspace("fr", "operatorEdit"),
    confirm: translateRetailWorkspace("fr", "operatorConfirm"),
    processing: translateRetailWorkspace("fr", "processing"),
    configTitle: translateRetailWorkspace("fr", "mobileMoneyConfigTitle"),
    configDescription: translateRetailWorkspace("fr", "mobileMoneyConfigDescription"),
    currentWallet: translateRetailWorkspace("fr", "mobileMoneyCurrentWallet"),
    account: translateRetailWorkspace("fr", "mobileMoneyAccount"),
    save: translateRetailWorkspace("fr", "operatorSave"),
    ready: translateRetailWorkspace("fr", "ready"),
    incomplete: translateRetailWorkspace("fr", "operatorToComplete"),
    currencies: translateRetailWorkspace("fr", "operatorCurrenciesConfigured"),
    addCurrency: translateRetailWorkspace("fr", "mobileMoneyAddCurrency"),
    chooseCurrency: translateRetailWorkspace("fr", "mobileMoneyChooseCurrency"),
    accountSaved: translateRetailWorkspace("fr", "mobileMoneyAccountSaved"),
    minimumTwo: translateRetailWorkspace("fr", "mobileMoneyMinimumTwo"),
    fxTitle: translateRetailWorkspace("fr", "mobileMoneyFxTitle"),
    fxDescription: translateRetailWorkspace("fr", "mobileMoneyFxDescription"),
    sourceCurrency: translateRetailWorkspace("fr", "mobileMoneySourceCurrency"),
    targetCurrency: translateRetailWorkspace("fr", "mobileMoneyTargetCurrency"),
    sourceAmount: translateRetailWorkspace("fr", "mobileMoneySourceAmount"),
    preview: translateRetailWorkspace("fr", "mobileMoneyPreview"),
    rate: translateRetailWorkspace("fr", "mobileMoneyRate"),
    targetAmount: translateRetailWorkspace("fr", "mobileMoneyTargetAmount"),
    available: translateRetailWorkspace("fr", "available"),
    fxConfirm: translateRetailWorkspace("fr", "mobileMoneyFxConfirm"),
    fxSuccess: translateRetailWorkspace("fr", "mobileMoneyFxSuccess"),
    fxInsufficient: translateRetailWorkspace("fr", "mobileMoneyFxInsufficient"),
    fxMissingRate: translateRetailWorkspace("fr", "mobileMoneyFxMissingRate"),
    configureRates: translateRetailWorkspace("fr", "mobileMoneyConfigureRates"),
    history: translateRetailWorkspace("fr", "operatorMobileMoneyHistory"),
    noTransaction: translateRetailWorkspace("fr", "operatorNoTransaction"),
    noTransactionDescription: translateRetailWorkspace("fr", "operatorConfirmedOperationsWillAppearHere"),
    reverse: translateRetailWorkspace("fr", "reverse"),
    reverseReason: translateRetailWorkspace("fr", "reversalReason"),
    reversed: translateRetailWorkspace("fr", "mobileMoneyReversed"),
    operatorReference: translateRetailWorkspace("fr", "operatorOperatorReference"),
    refresh: translateRetailWorkspace("fr", "mobileMoneyRefresh"),
    requiredCountry: translateRetailWorkspace("fr", "operatorRequiredInThisCountry"),
    notConfigured: translateRetailWorkspace("fr", "mobileMoneyNotConfigured"),
    configureWallets: translateRetailWorkspace("fr", "mobileMoneyConfigureWallets"),
    transactionTill: translateRetailWorkspace("fr", "mobileMoneyTransactionTill"),
  },
  en: {
    operationTitle: translateRetailWorkspace("en", "operatorMobileMoneyOperation"),
    operationDescription: translateRetailWorkspace("en", "mobileMoneyOperationDescription"),
    service: translateRetailWorkspace("en", "operatorMobileMoneyService"),
    operation: translateRetailWorkspace("en", "operatorOperation"),
    phone: translateRetailWorkspace("en", "operatorCustomerPhone"),
    amount: translateRetailWorkspace("en", "operatorCustomerAmount"),
    fee: translateRetailWorkspace("en", "operatorCustomerFee"),
    commission: translateRetailWorkspace("en", "operatorOperatorCommission"),
    feeCollection: translateRetailWorkspace("en", "operatorFeeCollection"),
    reference: translateRetailWorkspace("en", "operatorOperatorReference"),
    review: translateRetailWorkspace("en", "operatorReviewOperation"),
    tillRequired: translateRetailWorkspace("en", "mobileMoneyTillRequired"),
    missingWallet: translateRetailWorkspace("en", "mobileMoneyMissingWallet"),
    walletUsed: translateRetailWorkspace("en", "mobileMoneyWalletUsed"),
    operationConfirmed: translateRetailWorkspace("en", "mobileMoneyOperationConfirmed"),
    confirmTitle: translateRetailWorkspace("en", "operatorConfirmMobileMoney"),
    reviewDescription: translateRetailWorkspace("en", "operatorReviewTheInformationBeforeConfirmingTheOperation"),
    edit: translateRetailWorkspace("en", "operatorEdit"),
    confirm: translateRetailWorkspace("en", "operatorConfirm"),
    processing: translateRetailWorkspace("en", "processing"),
    configTitle: translateRetailWorkspace("en", "mobileMoneyConfigTitle"),
    configDescription: translateRetailWorkspace("en", "mobileMoneyConfigDescription"),
    currentWallet: translateRetailWorkspace("en", "mobileMoneyCurrentWallet"),
    account: translateRetailWorkspace("en", "mobileMoneyAccount"),
    save: translateRetailWorkspace("en", "operatorSave"),
    ready: translateRetailWorkspace("en", "ready"),
    incomplete: translateRetailWorkspace("en", "operatorToComplete"),
    currencies: translateRetailWorkspace("en", "operatorCurrenciesConfigured"),
    addCurrency: translateRetailWorkspace("en", "mobileMoneyAddCurrency"),
    chooseCurrency: translateRetailWorkspace("en", "mobileMoneyChooseCurrency"),
    accountSaved: translateRetailWorkspace("en", "mobileMoneyAccountSaved"),
    minimumTwo: translateRetailWorkspace("en", "mobileMoneyMinimumTwo"),
    fxTitle: translateRetailWorkspace("en", "mobileMoneyFxTitle"),
    fxDescription: translateRetailWorkspace("en", "mobileMoneyFxDescription"),
    sourceCurrency: translateRetailWorkspace("en", "mobileMoneySourceCurrency"),
    targetCurrency: translateRetailWorkspace("en", "mobileMoneyTargetCurrency"),
    sourceAmount: translateRetailWorkspace("en", "mobileMoneySourceAmount"),
    preview: translateRetailWorkspace("en", "mobileMoneyPreview"),
    rate: translateRetailWorkspace("en", "mobileMoneyRate"),
    targetAmount: translateRetailWorkspace("en", "mobileMoneyTargetAmount"),
    available: translateRetailWorkspace("en", "available"),
    fxConfirm: translateRetailWorkspace("en", "mobileMoneyFxConfirm"),
    fxSuccess: translateRetailWorkspace("en", "mobileMoneyFxSuccess"),
    fxInsufficient: translateRetailWorkspace("en", "mobileMoneyFxInsufficient"),
    fxMissingRate: translateRetailWorkspace("en", "mobileMoneyFxMissingRate"),
    configureRates: translateRetailWorkspace("en", "mobileMoneyConfigureRates"),
    history: translateRetailWorkspace("en", "operatorMobileMoneyHistory"),
    noTransaction: translateRetailWorkspace("en", "operatorNoTransaction"),
    noTransactionDescription: translateRetailWorkspace("en", "operatorConfirmedOperationsWillAppearHere"),
    reverse: translateRetailWorkspace("en", "reverse"),
    reverseReason: translateRetailWorkspace("en", "reversalReason"),
    reversed: translateRetailWorkspace("en", "mobileMoneyReversed"),
    operatorReference: translateRetailWorkspace("en", "operatorOperatorReference"),
    refresh: translateRetailWorkspace("en", "mobileMoneyRefresh"),
    requiredCountry: translateRetailWorkspace("en", "operatorRequiredInThisCountry"),
    notConfigured: translateRetailWorkspace("en", "mobileMoneyNotConfigured"),
    configureWallets: translateRetailWorkspace("en", "mobileMoneyConfigureWallets"),
    transactionTill: translateRetailWorkspace("en", "mobileMoneyTransactionTill"),
  },
} as const;

function MobileMoneySelect(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`min-h-11 w-full min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-semibold text-dtsc-ink ${props.className || ""}`}
    />
  );
}

export function MobileMoneyAgencyWorkspace({
  organizationId,
  organizationName,
  definition,
}: {
  organizationId: string;
  organizationName: string;
  definition: EnterpriseModuleDefinition;
}) {
  const locale: "fr" | "en" = useAppLocale() === "en" ? "en" : "fr";
  const [configuration, setConfiguration] = useState<MobileMoneyConfiguration | null>(null);
  const [configurationError, setConfigurationError] = useState("");
  const [configurationBusy, setConfigurationBusy] = useState(false);

  const loadConfiguration = useCallback(async () => {
    setConfigurationBusy(true);
    setConfigurationError("");
    try {
      const response = await fetch(`/api/enterprise/${organizationId}/retail/mobile-money/accounts`, { cache: "no-store" });
      const body = await response.json().catch(() => null) as (MobileMoneyConfiguration & { message?: string; error?: string }) | null;
      if (!response.ok || !body) throw new Error(body?.message || body?.error || "MOBILE_MONEY_CONFIGURATION_LOAD_FAILED");
      setConfiguration(body);
    } catch (error) {
      setConfigurationError(customerFacingError(error, locale, {
        fr: translateRetailWorkspace("fr", "retailActionError"),
        en: translateRetailWorkspace("en", "retailActionError"),
      }));
    } finally {
      setConfigurationBusy(false);
    }
  }, [locale, organizationId]);

  useEffect(() => {
    void loadConfiguration();
  }, [loadConfiguration]);

  return (
    <RetailWorkspaceFrame
      organizationId={organizationId}
      organizationName={organizationName}
      definition={definition}
      moduleCode="MOBILE_MONEY_AGENCY"
      locale={locale}
      includeConfigurationTab
    >
      {(context) => {
        const dashboard = context.dashboard as MobileMoneyDashboard;
        const reload = async () => {
          await loadConfiguration();
          context.setRefreshKey((value) => value + 1);
        };
        if (context.tab === "HISTORY") {
          return <MobileMoneyHistory organizationId={organizationId} dashboard={dashboard} locale={locale} busyAction={context.busyAction} mutate={context.mutate} />;
        }
        if (context.tab === "CONFIG") {
          return <MobileMoneyConfigurationPanel dashboard={dashboard} locale={locale} configuration={configuration} configurationBusy={configurationBusy} configurationError={configurationError} reload={reload} busyAction={context.busyAction} mutate={context.mutate} organizationId={organizationId} />;
        }
        if (context.tab === "REPORTS") return <RetailReportsPanel dashboard={dashboard} moduleCode="MOBILE_MONEY_AGENCY" locale={locale} />;
        return <MobileMoneyOperations organizationId={organizationId} dashboard={dashboard} locale={locale} configuration={configuration} configurationBusy={configurationBusy} configurationError={configurationError} reload={reload} busyAction={context.busyAction} mutate={context.mutate} />;
      }}
    </RetailWorkspaceFrame>
  );
}

function MobileMoneyOperations({
  organizationId,
  dashboard,
  locale,
  configuration,
  configurationBusy,
  configurationError,
  reload,
  busyAction,
  mutate,
}: {
  organizationId: string;
  dashboard: MobileMoneyDashboard;
  locale: "fr" | "en";
  configuration: MobileMoneyConfiguration | null;
  configurationBusy: boolean;
  configurationError: string;
  reload: () => Promise<void>;
  busyAction: string | null;
  mutate: RetailMutation;
}) {
  const copy = COPY[locale];
  const [pending, setPending] = useState<OperationDraft | null>(null);
  const sessions = useMemo<MobileMoneyCashSession[]>(
    () => dashboard.cashSessions || (dashboard.cashSession ? [dashboard.cashSession as MobileMoneyCashSession] : []),
    [dashboard.cashSession, dashboard.cashSessions],
  );
  const openCashSessions = useMemo(() => sessions.filter((session) => session.status === "OPEN"), [sessions]);
  const [selectedCashSessionId, setSelectedCashSessionId] = useState("");

  useEffect(() => {
    if (!openCashSessions.length) {
      if (selectedCashSessionId) setSelectedCashSessionId("");
      return;
    }
    if (!openCashSessions.some((session) => session.id === selectedCashSessionId)) {
      setSelectedCashSessionId(openCashSessions[0].id);
    }
  }, [openCashSessions, selectedCashSessionId]);

  const activeCash = openCashSessions.find((session) => session.id === selectedCashSessionId) || openCashSessions[0] || null;
  const currency = activeCash?.financialAccount.currencyCode || "";
  const providers = configuration?.providers || [];
  const eligibleProviders = providers.filter((provider) => provider.accounts.some((mapping) => mapping.currencyCode === currency));
  const selectedProvider = pending ? providers.find((provider) => provider.providerCode === pending.providerCode) : null;
  const selectedWallet = pending ? selectedProvider?.accounts.find((mapping) => mapping.currencyCode === pending.currencyCode) : null;

  useEffect(() => {
    if (pending && activeCash && pending.cashAccountId !== activeCash.financialAccount.id) setPending(null);
  }, [activeCash, pending]);

  async function confirmOperation() {
    if (!pending) return;
    const body = await mutate("mobile-money", `/api/enterprise/${organizationId}/retail/mobile-money`, pending, copy.operationConfirmed);
    if (body) {
      setPending(null);
      await reload();
    }
  }

  return (
    <div className="grid min-w-0 gap-5">
      <MobileMoneyCashSessionManager
        organizationId={organizationId}
        accounts={dashboard.accounts}
        sessions={sessions}
        selectedSessionId={activeCash?.id || ""}
        onSelectSession={(sessionId) => {
          setSelectedCashSessionId(sessionId);
          setPending(null);
        }}
        locale={locale}
        busyAction={busyAction}
        mutate={mutate}
        reload={reload}
      />

      <ModuleSection title={copy.operationTitle} description={copy.operationDescription}>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const providerCode = String(form.get("providerCode") || "");
            const provider = eligibleProviders.find((item) => item.providerCode === providerCode);
            if (!provider || !activeCash) return;
            setPending({
              providerCode,
              transactionType: String(form.get("transactionType") || "DEPOSIT"),
              customerPhone: normalizePhonePreview(String(form.get("customerPhone") || "")),
              currencyCode: activeCash.financialAccount.currencyCode,
              principalAmount: Number(form.get("principalAmount") || 0),
              customerFeeAmount: Number(form.get("customerFeeAmount") || 0),
              providerCommissionAmount: Number(form.get("providerCommissionAmount") || 0),
              feeCollectionMode: String(form.get("feeCollectionMode") || "NONE"),
              cashAccountId: activeCash.financialAccount.id,
              floatAccountId: null,
              externalReference: String(form.get("externalReference") || "").trim(),
            });
          }}
          className="grid min-w-0 gap-4"
        >
          <div className="grid min-w-0 gap-4 md:grid-cols-2">
            <Field label={copy.service}>
              <MobileMoneySelect name="providerCode" required disabled={Boolean(busyAction) || configurationBusy || !activeCash} defaultValue="">
                <option value="">—</option>
                {eligibleProviders.map((provider) => <option key={provider.id} value={provider.providerCode}>{provider.label}</option>)}
              </MobileMoneySelect>
            </Field>
            <Field label={copy.operation}>
              <MobileMoneySelect name="transactionType" defaultValue="DEPOSIT" disabled={Boolean(busyAction)}>
                <option value="DEPOSIT">{customerFacingMobileMoneyTransactionType("DEPOSIT", locale)}</option>
                <option value="WITHDRAWAL">{customerFacingMobileMoneyTransactionType("WITHDRAWAL", locale)}</option>
              </MobileMoneySelect>
            </Field>
            <Field label={copy.phone}><Input name="customerPhone" required inputMode="tel" placeholder={translateRetailWorkspace(locale, "operatorCountryCode")} disabled={Boolean(busyAction)} /></Field>
            <Field label={copy.amount}><Input name="principalAmount" type="number" min="0.01" step="0.01" required disabled={Boolean(busyAction)} /></Field>
            <Field label={copy.fee}><Input name="customerFeeAmount" type="number" min="0" step="0.01" defaultValue="0" disabled={Boolean(busyAction)} /></Field>
            <Field label={copy.commission}><Input name="providerCommissionAmount" type="number" min="0" step="0.01" defaultValue="0" disabled={Boolean(busyAction)} /></Field>
            <Field label={copy.feeCollection}>
              <MobileMoneySelect name="feeCollectionMode" defaultValue="NONE" disabled={Boolean(busyAction)}>
                <option value="NONE">{customerFacingFeeCollectionMode("NONE", locale)}</option>
                <option value="CASH">{customerFacingFeeCollectionMode("CASH", locale)}</option>
                <option value="PROVIDER">{customerFacingFeeCollectionMode("PROVIDER", locale)}</option>
              </MobileMoneySelect>
            </Field>
            <Field label={copy.reference}><Input name="externalReference" required maxLength={160} disabled={Boolean(busyAction)} /></Field>
          </div>
          <div className="rounded-xl border border-dtsc-border bg-dtsc-page p-3 text-sm font-semibold text-dtsc-muted">
            {activeCash ? `${copy.transactionTill}: ${activeCash.financialAccount.name} · ${currency}` : copy.tillRequired}
          </div>
          {activeCash && configuration && !eligibleProviders.length ? (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm font-bold text-amber-800 dark:text-amber-200">
              {copy.missingWallet} <Link href="#mobile-money-wallet-configuration" className="underline">{copy.configureWallets}</Link>
            </div>
          ) : null}
          {configurationError ? <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm font-bold text-rose-700 dark:text-rose-200">{configurationError}</div> : null}
          <Button className="w-fit" disabled={Boolean(busyAction) || !activeCash || !eligibleProviders.length}>
            <Smartphone className="h-4 w-4" />{copy.review}
          </Button>
        </form>
      </ModuleSection>

      {pending ? (
        <ModuleSection title={copy.confirmTitle} description={copy.reviewDescription}>
          <div className="rounded-2xl border-2 border-amber-400/50 bg-amber-500/10 p-4">
            <div className="grid gap-1 text-sm font-bold text-dtsc-ink">
              <p>{selectedProvider?.label || copy.service}</p>
              <p>{customerFacingMobileMoneyTransactionType(pending.transactionType, locale)} · {moneyValue(pending.principalAmount, pending.currencyCode, locale)}</p>
              <p>{pending.customerPhone}</p>
              <p>{customerFacingFeeCollectionMode(pending.feeCollectionMode, locale)}</p>
              <p>{copy.transactionTill}: {activeCash?.financialAccount.name || "—"} · {pending.currencyCode}</p>
              <p>{copy.walletUsed}: {selectedWallet?.financialAccount.name || "—"} · {pending.currencyCode}</p>
              <p>{copy.operatorReference}: {pending.externalReference || "—"}</p>
            </div>
            <div data-responsive-actions className="mt-4">
              <Button variant="outline" type="button" disabled={busyAction === "mobile-money"} onClick={() => setPending(null)}>{copy.edit}</Button>
              <Button type="button" disabled={busyAction === "mobile-money"} onClick={() => void confirmOperation()}><CheckCircle2 className="h-4 w-4" />{busyAction === "mobile-money" ? copy.processing : copy.confirm}</Button>
            </div>
          </div>
        </ModuleSection>
      ) : null}

      <MobileMoneyFxPanel organizationId={organizationId} locale={locale} configuration={configuration} busyAction={busyAction} mutate={mutate} reload={reload} />
      <RetailErpLinks moduleCode="MOBILE_MONEY_AGENCY" locale={locale} />
    </div>
  );
}

function MobileMoneyFxPanel({
  organizationId,
  locale,
  configuration,
  busyAction,
  mutate,
  reload,
}: {
  organizationId: string;
  locale: "fr" | "en";
  configuration: MobileMoneyConfiguration | null;
  busyAction: string | null;
  mutate: RetailMutation;
  reload: () => Promise<void>;
}) {
  const copy = COPY[locale];
  const providers = (configuration?.providers || []).filter((provider) => provider.accounts.length >= 2);
  const [providerCode, setProviderCode] = useState("");
  const [sourceCurrency, setSourceCurrency] = useState("");
  const [targetCurrency, setTargetCurrency] = useState("");
  const [preview, setPreview] = useState<FxPreview | null>(null);
  const [previewError, setPreviewError] = useState("");
  const [previewBusy, setPreviewBusy] = useState(false);
  const provider = providers.find((item) => item.providerCode === providerCode) || providers[0] || null;
  const currencies = useMemo(() => provider?.accounts.map((account) => account.currencyCode) || [], [provider]);

  useEffect(() => {
    if (!provider) return;
    const source = sourceCurrency && currencies.includes(sourceCurrency) ? sourceCurrency : currencies[0] || "";
    const target = targetCurrency && currencies.includes(targetCurrency) && targetCurrency !== source
      ? targetCurrency
      : currencies.find((currency) => currency !== source) || "";
    if (providerCode !== provider.providerCode) setProviderCode(provider.providerCode);
    if (sourceCurrency !== source) setSourceCurrency(source);
    if (targetCurrency !== target) setTargetCurrency(target);
    setPreview(null);
  }, [currencies, provider, providerCode, sourceCurrency, targetCurrency]);

  async function requestPreview(form: HTMLFormElement) {
    const data = new FormData(form);
    const sourceAmount = Number(data.get("sourceAmount") || 0);
    if (!provider || !sourceCurrency || !targetCurrency || sourceCurrency === targetCurrency || sourceAmount <= 0) return;
    setPreviewBusy(true);
    setPreviewError("");
    setPreview(null);
    try {
      const query = new URLSearchParams({ providerCode: provider.providerCode, sourceCurrencyCode: sourceCurrency, targetCurrencyCode: targetCurrency, sourceAmount: String(sourceAmount) });
      const response = await fetch(`/api/enterprise/${organizationId}/retail/mobile-money/fx?${query.toString()}`, { cache: "no-store" });
      const body = await response.json().catch(() => null) as { preview?: FxPreview; message?: string; error?: string } | null;
      if (!response.ok || !body?.preview) throw new Error(body?.message || body?.error || copy.fxMissingRate);
      setPreview(body.preview);
    } catch {
      setPreviewError(copy.fxMissingRate);
    } finally {
      setPreviewBusy(false);
    }
  }

  async function confirmTransfer() {
    if (!preview) return;
    const result = await mutate(
      "mobile-money-fx",
      `/api/enterprise/${organizationId}/retail/mobile-money/fx`,
      { providerCode: preview.providerCode, sourceCurrencyCode: preview.sourceCurrencyCode, targetCurrencyCode: preview.targetCurrencyCode, sourceAmount: Number(preview.sourceAmount) },
      copy.fxSuccess,
    );
    if (result) {
      setPreview(null);
      await reload();
    }
  }

  return (
    <ModuleSection title={copy.fxTitle} description={copy.fxDescription}>
      {!providers.length ? (
        <div className="rounded-xl border border-dtsc-border bg-dtsc-page p-4 text-sm font-semibold text-dtsc-muted">{copy.minimumTwo}</div>
      ) : (
        <div className="grid gap-4">
          <form onSubmit={(event) => { event.preventDefault(); void requestPreview(event.currentTarget); }} className="grid gap-4 md:grid-cols-2">
            <Field label={copy.service}>
              <MobileMoneySelect name="fxProviderCode" value={provider?.providerCode || ""} onChange={(event) => { setProviderCode(event.target.value); setPreview(null); }}>
                {providers.map((item) => <option key={item.id} value={item.providerCode}>{item.label}</option>)}
              </MobileMoneySelect>
            </Field>
            <div className="hidden md:block" />
            <Field label={copy.sourceCurrency}>
              <MobileMoneySelect name="sourceCurrencyCode" value={sourceCurrency} onChange={(event) => { setSourceCurrency(event.target.value); setPreview(null); }}>
                {currencies.map((currency) => <option key={currency} value={currency}>{currency}</option>)}
              </MobileMoneySelect>
            </Field>
            <Field label={copy.targetCurrency}>
              <MobileMoneySelect name="targetCurrencyCode" value={targetCurrency} onChange={(event) => { setTargetCurrency(event.target.value); setPreview(null); }}>
                {currencies.filter((currency) => currency !== sourceCurrency).map((currency) => <option key={currency} value={currency}>{currency}</option>)}
              </MobileMoneySelect>
            </Field>
            <Field label={copy.sourceAmount}><Input name="sourceAmount" type="number" min="0.01" step="0.01" required disabled={previewBusy || Boolean(busyAction)} /></Field>
            <div className="flex items-end"><Button disabled={previewBusy || Boolean(busyAction)}><ArrowRightLeft className="h-4 w-4" />{previewBusy ? copy.processing : copy.preview}</Button></div>
          </form>

          {previewError ? (
            <div role="alert" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm font-bold text-amber-800 dark:text-amber-200">
              <p>{previewError}</p>
              <Link className="mt-2 inline-flex underline" href="/enterprise-modules/FINANCE_TREASURY/exchange-rates">{copy.configureRates}</Link>
            </div>
          ) : null}

          {preview ? (
            <div className="rounded-2xl border border-cyan-500/30 bg-cyan-500/10 p-4">
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <div><p className="text-xs font-bold uppercase text-dtsc-muted">{copy.sourceAmount}</p><p className="font-black text-dtsc-ink">{moneyValue(Number(preview.sourceAmount), preview.sourceCurrencyCode, locale)}</p></div>
                <div><p className="text-xs font-bold uppercase text-dtsc-muted">{copy.rate}</p><p className="font-black text-dtsc-ink">1 {preview.sourceCurrencyCode} = {Number(preview.rate).toLocaleString(translateRetailWorkspace(locale, "mobileMoneyEnUS"), { maximumFractionDigits: 6 })} {preview.targetCurrencyCode}</p></div>
                <div><p className="text-xs font-bold uppercase text-dtsc-muted">{copy.targetAmount}</p><p className="font-black text-dtsc-ink">{moneyValue(Number(preview.targetAmount), preview.targetCurrencyCode, locale)}</p></div>
                <div><p className="text-xs font-bold uppercase text-dtsc-muted">{copy.available}</p><p className="font-black text-dtsc-ink">{moneyValue(Number(preview.sourceAvailableBalance), preview.sourceCurrencyCode, locale)}</p></div>
              </div>
              <p className="mt-2 text-xs font-semibold text-dtsc-muted">{formatEnterpriseDate(preview.rateDate, locale)} · {preview.rateSource}</p>
              {!preview.sufficientBalance ? <p className="mt-3 font-bold text-rose-700 dark:text-rose-200">{copy.fxInsufficient}</p> : null}
              <Button className="mt-4" type="button" disabled={!preview.sufficientBalance || busyAction === "mobile-money-fx"} onClick={() => void confirmTransfer()}>
                <CheckCircle2 className="h-4 w-4" />{busyAction === "mobile-money-fx" ? copy.processing : copy.fxConfirm}
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </ModuleSection>
  );
}

function MobileMoneyConfigurationPanel({
  organizationId,
  dashboard,
  locale,
  configuration,
  configurationBusy,
  configurationError,
  reload,
  busyAction,
  mutate,
}: {
  organizationId: string;
  dashboard: RetailDashboard;
  locale: "fr" | "en";
  configuration: MobileMoneyConfiguration | null;
  configurationBusy: boolean;
  configurationError: string;
  reload: () => Promise<void>;
  busyAction: string | null;
  mutate: RetailMutation;
}) {
  const copy = COPY[locale];
  const [extraCurrency, setExtraCurrency] = useState<Record<string, string>>({});
  const [extraAccount, setExtraAccount] = useState<Record<string, string>>({});

  async function saveMapping(provider: ProviderConfiguration, currencyCode: string, financialAccountId: string) {
    if (!financialAccountId) return;
    const body = await mutate(
      `mobile-wallet-${provider.id}-${currencyCode}`,
      `/api/enterprise/${organizationId}/retail/mobile-money/accounts`,
      { providerCode: provider.providerCode, currencyCode, financialAccountId },
      copy.accountSaved,
      { idempotent: false },
    );
    if (body) {
      setExtraAccount((current) => ({ ...current, [provider.id]: "" }));
      await reload();
    }
  }

  if (configurationBusy && !configuration) return <div className="rounded-xl border border-dtsc-border bg-dtsc-page p-4 text-sm font-semibold text-dtsc-muted">{copy.processing}</div>;
  if (configurationError && !configuration) return <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm font-bold text-rose-700 dark:text-rose-200">{configurationError}</div>;
  if (!configuration) return null;

  return (
    <div id="mobile-money-wallet-configuration" className="grid min-w-0 gap-5">
      <ModuleSection title={copy.configTitle} description={copy.configDescription}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dtsc-border bg-dtsc-page p-3">
          <p className="text-sm font-semibold text-dtsc-muted">{configuration.requiredCurrencies.length ? `${copy.requiredCountry}: ${configuration.requiredCurrencies.join(" + ")}` : copy.minimumTwo}</p>
          <Button size="sm" variant="outline" type="button" disabled={configurationBusy} onClick={() => void reload()}><RefreshCw className="h-4 w-4" />{copy.refresh}</Button>
        </div>
        <div className="grid min-w-0 gap-4 lg:grid-cols-2">
          {configuration.providers.map((provider) => {
            const mappedCurrencies = provider.accounts.map((mapping) => mapping.currencyCode);
            const fixedCurrencies = configuration.requiredCurrencies.length
              ? Array.from(new Set([...configuration.requiredCurrencies, ...mappedCurrencies]))
              : mappedCurrencies;
            const addable = configuration.availableCurrencies.filter((currency) => !fixedCurrencies.includes(currency));
            const draftCurrency = extraCurrency[provider.id] || addable[0] || "";
            const draftAccountId = extraAccount[provider.id] || "";
            const availableAccounts = configuration.financialAccounts.filter((account) => account.currencyCode === draftCurrency);
            return (
              <article key={provider.id} className="min-w-0 rounded-2xl border border-dtsc-border bg-dtsc-page p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="break-words text-lg font-black text-dtsc-ink">{provider.label}</p>
                    <p className="text-xs font-bold text-dtsc-muted">{provider.mappedCurrencyCount} {copy.currencies}</p>
                  </div>
                  <StatusBadge tone={provider.ready ? "success" : "warning"}>{provider.ready ? copy.ready : copy.incomplete}</StatusBadge>
                </div>
                <div className="mt-4 grid gap-3">
                  {fixedCurrencies.map((currencyCode) => {
                    const mapping = provider.accounts.find((item) => item.currencyCode === currencyCode);
                    const accounts = configuration.financialAccounts.filter((account) => account.currencyCode === currencyCode);
                    return <WalletMappingRow key={currencyCode} provider={provider} currencyCode={currencyCode} mapping={mapping || null} accounts={accounts} canManage={dashboard.access.canManage} busy={Boolean(busyAction)} locale={locale} onSave={saveMapping} />;
                  })}
                  {!fixedCurrencies.length ? <p className="text-sm font-semibold text-dtsc-muted">{copy.minimumTwo}</p> : null}
                  {dashboard.access.canManage && addable.length ? (
                    <div className="rounded-xl border border-dashed border-dtsc-border p-3">
                      <p className="mb-2 text-xs font-black uppercase tracking-wide text-dtsc-muted">{copy.addCurrency}</p>
                      <div className="grid gap-3 sm:grid-cols-[0.45fr_minmax(0,1fr)_auto] sm:items-end">
                        <Field label={copy.chooseCurrency}>
                          <MobileMoneySelect
                            name={`extraCurrency-${provider.id}`}
                            value={draftCurrency}
                            onChange={(event) => {
                              setExtraCurrency((current) => ({ ...current, [provider.id]: event.target.value }));
                              setExtraAccount((current) => ({ ...current, [provider.id]: "" }));
                            }}
                          >
                            {addable.map((currency) => <option key={currency} value={currency}>{currency}</option>)}
                          </MobileMoneySelect>
                        </Field>
                        <Field label={copy.account}>
                          <MobileMoneySelect name={`extraAccount-${provider.id}`} value={draftAccountId} onChange={(event) => setExtraAccount((current) => ({ ...current, [provider.id]: event.target.value }))}>
                            <option value="">—</option>
                            {availableAccounts.map((account) => <option key={account.id} value={account.id}>{account.name} · {account.code}</option>)}
                          </MobileMoneySelect>
                        </Field>
                        <Button type="button" disabled={Boolean(busyAction) || !draftCurrency || !draftAccountId} onClick={() => void saveMapping(provider, draftCurrency, draftAccountId)}><WalletCards className="h-4 w-4" />{copy.save}</Button>
                      </div>
                    </div>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      </ModuleSection>
      <RetailErpLinks moduleCode="MOBILE_MONEY_AGENCY" locale={locale} />
    </div>
  );
}

function WalletMappingRow({
  provider,
  currencyCode,
  mapping,
  accounts,
  canManage,
  busy,
  locale,
  onSave,
}: {
  provider: ProviderConfiguration;
  currencyCode: string;
  mapping: ProviderMapping | null;
  accounts: CurrencyAccount[];
  canManage: boolean;
  busy: boolean;
  locale: "fr" | "en";
  onSave: (provider: ProviderConfiguration, currencyCode: string, accountId: string) => Promise<void>;
}) {
  const copy = COPY[locale];
  const [accountId, setAccountId] = useState(mapping?.financialAccountId || "");
  useEffect(() => setAccountId(mapping?.financialAccountId || ""), [mapping?.financialAccountId]);
  return (
    <div className="rounded-xl border border-dtsc-border bg-dtsc-surface p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <StatusBadge tone={mapping ? "success" : "warning"}>{currencyCode}</StatusBadge>
          <div>
            <p className="text-sm font-black text-dtsc-ink">{mapping?.financialAccount.name || copy.notConfigured}</p>
            {mapping ? <p className="text-xs font-semibold text-dtsc-muted">{copy.currentWallet} · {moneyValue(Number(mapping.financialAccount.operationalBalance), currencyCode, locale)}</p> : null}
          </div>
        </div>
        <StatusBadge tone={mapping ? "success" : "warning"}>{mapping ? "OK" : copy.incomplete}</StatusBadge>
      </div>
      {canManage ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <Field label={`${copy.account} · ${currencyCode}`}>
            <MobileMoneySelect name={`wallet-${provider.id}-${currencyCode}`} value={accountId} onChange={(event) => setAccountId(event.target.value)} disabled={busy}>
              <option value="">—</option>
              {accounts.map((account) => <option key={account.id} value={account.id}>{account.name} · {account.code}</option>)}
            </MobileMoneySelect>
          </Field>
          <Button type="button" disabled={busy || !accountId || accountId === mapping?.financialAccountId} onClick={() => void onSave(provider, currencyCode, accountId)}><Settings2 className="h-4 w-4" />{copy.save}</Button>
        </div>
      ) : null}
    </div>
  );
}

function MobileMoneyHistory({
  organizationId,
  dashboard,
  locale,
  busyAction,
  mutate,
}: {
  organizationId: string;
  dashboard: RetailDashboard;
  locale: "fr" | "en";
  busyAction: string | null;
  mutate: RetailMutation;
}) {
  const copy = COPY[locale];
  const items = dashboard.recent.mobileMoney || [];
  async function reverse(id: string, revision: number) {
    const reason = window.prompt(copy.reverseReason);
    if (!reason?.trim()) return;
    await mutate(`reverse-${id}`, `/api/enterprise/${organizationId}/retail/mobile-money/${id}/reverse`, { revision, reason: reason.trim() }, copy.reversed, { idempotent: false });
  }
  return (
    <div className="grid min-w-0 gap-5">
      <ModuleSection title={copy.history}>
        {items.length ? (
          <BusinessList ariaLabel={copy.history}>
            {items.map((item) => (
              <BusinessListItem
                key={item.id}
                title={`${item.number} · ${providerLabel(dashboard, item.providerCode)}`}
                status={<StatusBadge tone={statusTone(item.status)}>{customerFacingStatusLabel(item.status, locale)}</StatusBadge>}
                meta={`${customerFacingMobileMoneyTransactionType(item.transactionType, locale)} · ${moneyValue(item.principalAmount, item.currencyCode, locale)} · ${formatEnterpriseDate(item.occurredAt, locale)}`}
                description={`${item.customerPhoneMasked || "—"} · ${copy.operatorReference}: ${item.externalReference || "—"}`}
                actions={dashboard.access.canManage && item.status === "CONFIRMED" ? <Button size="sm" variant="outline" disabled={Boolean(busyAction)} onClick={() => void reverse(item.id, item.revision)}><RotateCcw className="h-4 w-4" />{copy.reverse}</Button> : undefined}
              />
            ))}
          </BusinessList>
        ) : <EmptyState compact title={copy.noTransaction} description={copy.noTransactionDescription} />}
      </ModuleSection>
      <RetailErpLinks moduleCode="MOBILE_MONEY_AGENCY" locale={locale} />
    </div>
  );
}
