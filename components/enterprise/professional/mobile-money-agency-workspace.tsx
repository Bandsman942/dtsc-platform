"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRightLeft, CheckCircle2, RefreshCw, RotateCcw, Settings2, Smartphone, WalletCards } from "lucide-react";
import { useAppLocale } from "@/components/i18n/locale-provider";
import { Field, formatEnterpriseDate } from "@/components/enterprise/core-v2/erp-v2-ui";
import {
  OpenCashForm,
  RetailErpLinks,
  RetailReportsPanel,
  RetailWorkspaceFrame,
  Select,
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
import { customerFacingStatusLabel } from "@/lib/customer-facing-language";
import type { EnterpriseModuleDefinition } from "@/lib/enterprise/module-registry";
import { customerFacingFeeCollectionMode, customerFacingMobileMoneyTransactionType } from "@/lib/retail-customer-language";

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

const COPY = {
  fr: {
    operationTitle: "Opération Mobile Money",
    operationDescription: "Choisissez le service et enregistrez l’opération client. Le wallet opérateur correspondant à la devise de la caisse est choisi automatiquement.",
    service: "Service Mobile Money",
    operation: "Opération",
    phone: "Téléphone client",
    amount: "Montant client",
    fee: "Frais client",
    commission: "Commission opérateur",
    feeCollection: "Encaissement des frais",
    reference: "Référence opérateur",
    review: "Vérifier l’opération",
    tillRequired: "Ouvrez une caisse avant de continuer.",
    missingWallet: "Aucun service n’a encore de wallet configuré dans la devise de cette caisse.",
    walletUsed: "Wallet opérateur utilisé",
    operationConfirmed: "Opération Mobile Money confirmée et comptabilisée.",
    confirmTitle: "Confirmer Mobile Money",
    reviewDescription: "Vérifiez les informations avant de confirmer l’opération.",
    edit: "Modifier",
    confirm: "Confirmer",
    processing: "Traitement…",
    configTitle: "Comptes Mobile Money par devise",
    configDescription: "Chaque opérateur reste unique. Associez-lui un wallet financier distinct pour chaque devise exploitée ; en RDC, CDF et USD sont attendus.",
    currentWallet: "Wallet configuré",
    account: "Compte financier",
    save: "Enregistrer",
    ready: "Prêt",
    incomplete: "À compléter",
    currencies: "devises configurées",
    addCurrency: "Ajouter une devise",
    chooseCurrency: "Devise",
    accountSaved: "Wallet opérateur enregistré.",
    minimumTwo: "Au moins deux devises distinctes sont nécessaires pour exploiter professionnellement cet opérateur.",
    fxTitle: "Transfert entre devises",
    fxDescription: "Convertissez du float entre deux wallets du même opérateur. Le taux courant de Finance est résolu côté serveur et enregistré avec l’opération.",
    sourceCurrency: "Devise source",
    targetCurrency: "Devise cible",
    sourceAmount: "Montant à convertir",
    preview: "Calculer avec le taux courant",
    rate: "Taux Finance",
    targetAmount: "Montant cible",
    available: "Disponible",
    fxConfirm: "Confirmer le transfert",
    fxSuccess: "Transfert de devise confirmé et comptabilisé.",
    fxInsufficient: "Le solde source est insuffisant pour ce transfert.",
    fxMissingRate: "Le taux de change courant n’est pas disponible. Configurez-le dans Finance avant de continuer.",
    configureRates: "Configurer les taux de change",
    history: "Historique Mobile Money",
    noTransaction: "Aucune opération",
    noTransactionDescription: "Les opérations confirmées apparaîtront ici.",
    reverse: "Annuler",
    reverseReason: "Motif de l’annulation",
    reversed: "Annulation enregistrée et comptabilisée.",
    operatorReference: "Référence opérateur",
    refresh: "Actualiser les comptes",
  },
  en: {
    operationTitle: "Mobile Money operation",
    operationDescription: "Choose the service and record the customer operation. The operator wallet matching the till currency is selected automatically.",
    service: "Mobile Money service",
    operation: "Operation",
    phone: "Customer phone",
    amount: "Customer amount",
    fee: "Customer fee",
    commission: "Operator commission",
    feeCollection: "Fee collection",
    reference: "Operator reference",
    review: "Review operation",
    tillRequired: "Open a till before continuing.",
    missingWallet: "No service has a wallet configured for this till currency yet.",
    walletUsed: "Operator wallet used",
    operationConfirmed: "Mobile Money operation confirmed and posted.",
    confirmTitle: "Confirm Mobile Money",
    reviewDescription: "Review the information before confirming the operation.",
    edit: "Edit",
    confirm: "Confirm",
    processing: "Processing…",
    configTitle: "Mobile Money accounts by currency",
    configDescription: "Each operator stays unique. Link one distinct financial wallet per operating currency; in DR Congo, CDF and USD are expected.",
    currentWallet: "Configured wallet",
    account: "Financial account",
    save: "Save",
    ready: "Ready",
    incomplete: "To complete",
    currencies: "currencies configured",
    addCurrency: "Add a currency",
    chooseCurrency: "Currency",
    accountSaved: "Operator wallet saved.",
    minimumTwo: "At least two distinct currencies are required for professional operation of this service.",
    fxTitle: "Currency transfer",
    fxDescription: "Convert float between two wallets of the same operator. The current Finance rate is resolved server-side and saved with the operation.",
    sourceCurrency: "Source currency",
    targetCurrency: "Target currency",
    sourceAmount: "Amount to convert",
    preview: "Calculate with current rate",
    rate: "Finance rate",
    targetAmount: "Target amount",
    available: "Available",
    fxConfirm: "Confirm transfer",
    fxSuccess: "Currency transfer confirmed and posted.",
    fxInsufficient: "The source balance is insufficient for this transfer.",
    fxMissingRate: "The current exchange rate is unavailable. Configure it in Finance before continuing.",
    configureRates: "Configure exchange rates",
    history: "Mobile Money history",
    noTransaction: "No transaction",
    noTransactionDescription: "Confirmed operations will appear here.",
    reverse: "Reverse",
    reverseReason: "Reason for reversal",
    reversed: "Reversal recorded and posted.",
    operatorReference: "Operator reference",
    refresh: "Refresh accounts",
  },
} as const;

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
  const copy = COPY[locale];
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
      setConfigurationError(error instanceof Error ? error.message : "MOBILE_MONEY_CONFIGURATION_LOAD_FAILED");
    } finally {
      setConfigurationBusy(false);
    }
  }, [organizationId]);

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
        const dashboard = context.dashboard as RetailDashboard;
        if (context.tab === "HISTORY") return <MobileMoneyHistory organizationId={organizationId} dashboard={dashboard} locale={locale} busyAction={context.busyAction} mutate={context.mutate} />;
        if (context.tab === "CONFIG") return <MobileMoneyConfigurationPanel organizationId={organizationId} dashboard={dashboard} locale={locale} configuration={configuration} configurationBusy={configurationBusy} configurationError={configurationError} reload={async () => { await loadConfiguration(); context.setRefreshKey((value) => value + 1); }} busyAction={context.busyAction} mutate={context.mutate} />;
        if (context.tab === "REPORTS") return <RetailReportsPanel dashboard={dashboard} moduleCode="MOBILE_MONEY_AGENCY" locale={locale} />;
        return <MobileMoneyOperations organizationId={organizationId} dashboard={dashboard} locale={locale} configuration={configuration} configurationBusy={configurationBusy} configurationError={configurationError} reload={async () => { await loadConfiguration(); context.setRefreshKey((value) => value + 1); }} busyAction={context.busyAction} mutate={context.mutate} copy={copy} />;
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
  copy,
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
  copy: typeof COPY.fr | typeof COPY.en;
}) {
  const [pending, setPending] = useState<Record<string, unknown> | null>(null);
  const activeCash = dashboard.cashSession?.status === "OPEN" ? dashboard.cashSession : null;
  const currency = activeCash?.financialAccount.currencyCode || "";
  const providers = configuration?.providers || [];
  const eligibleProviders = useMemo(() => providers.filter((provider) => provider.accounts.some((mapping) => mapping.currencyCode === currency)), [currency, providers]);
  const selectedProvider = pending ? providers.find((provider) => provider.providerCode === pending.providerCode) : null;
  const selectedWallet = pending ? selectedProvider?.accounts.find((mapping) => mapping.currencyCode === pending.currencyCode) : null;

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
      <OpenCashForm organizationId={organizationId} dashboard={dashboard} locale={locale} busyAction={busyAction} mutate={mutate} />
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
              <Select name="providerCode" required disabled={Boolean(busyAction) || configurationBusy || !activeCash}>
                <option value="">—</option>
                {eligibleProviders.map((provider) => <option key={provider.id} value={provider.providerCode}>{provider.label}</option>)}
              </Select>
            </Field>
            <Field label={copy.operation}>
              <Select name="transactionType" defaultValue="DEPOSIT" disabled={Boolean(busyAction)}>
                <option value="DEPOSIT">{customerFacingMobileMoneyTransactionType("DEPOSIT", locale)}</option>
                <option value="WITHDRAWAL">{customerFacingMobileMoneyTransactionType("WITHDRAWAL", locale)}</option>
              </Select>
            </Field>
            <Field label={copy.phone}><Input name="customerPhone" required inputMode="tel" placeholder={locale === "en" ? "+country code…" : "+indicatif pays…"} disabled={Boolean(busyAction)} /></Field>
            <Field label={copy.amount}><Input name="principalAmount" type="number" min="0.01" step="0.01" required disabled={Boolean(busyAction)} /></Field>
            <Field label={copy.fee}><Input name="customerFeeAmount" type="number" min="0" step="0.01" defaultValue="0" disabled={Boolean(busyAction)} /></Field>
            <Field label={copy.commission}><Input name="providerCommissionAmount" type="number" min="0" step="0.01" defaultValue="0" disabled={Boolean(busyAction)} /></Field>
            <Field label={copy.feeCollection}>
              <Select name="feeCollectionMode" defaultValue="NONE" disabled={Boolean(busyAction)}>
                <option value="NONE">{customerFacingFeeCollectionMode("NONE", locale)}</option>
                <option value="CASH">{customerFacingFeeCollectionMode("CASH", locale)}</option>
                <option value="PROVIDER">{customerFacingFeeCollectionMode("PROVIDER", locale)}</option>
              </Select>
            </Field>
            <Field label={copy.reference}><Input name="externalReference" required maxLength={160} disabled={Boolean(busyAction)} /></Field>
          </div>
          <div className="rounded-xl border border-dtsc-border bg-dtsc-page p-3 text-sm font-semibold text-dtsc-muted">
            {activeCash ? `${locale === "en" ? "Till" : "Caisse"}: ${activeCash.financialAccount.name} · ${currency}` : copy.tillRequired}
          </div>
          {activeCash && configuration && !eligibleProviders.length ? (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm font-bold text-amber-800 dark:text-amber-200">
              {copy.missingWallet} <Link href="#mobile-money-wallet-configuration" className="underline">{locale === "en" ? "Configure wallets" : "Configurer les wallets"}</Link>
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
              <p>{customerFacingMobileMoneyTransactionType(String(pending.transactionType || ""), locale)} · {moneyValue(Number(pending.principalAmount), String(pending.currencyCode))}</p>
              <p>{String(pending.customerPhone)}</p>
              <p>{customerFacingFeeCollectionMode(String(pending.feeCollectionMode || ""), locale)}</p>
              <p>{copy.walletUsed}: {selectedWallet?.financialAccount.name || "—"} · {String(pending.currencyCode)}</p>
              <p>{copy.operatorReference}: {String(pending.externalReference || "—")}</p>
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

function MobileMoneyFxPanel({ organizationId, locale, configuration, busyAction, mutate, reload }: { organizationId: string; locale: "fr" | "en"; configuration: MobileMoneyConfiguration | null; busyAction: string | null; mutate: RetailMutation; reload: () => Promise<void> }) {
  const copy = COPY[locale];
  const providers = (configuration?.providers || []).filter((provider) => provider.accounts.length >= 2);
  const [providerCode, setProviderCode] = useState("");
  const [sourceCurrency, setSourceCurrency] = useState("");
  const [targetCurrency, setTargetCurrency] = useState("");
  const [preview, setPreview] = useState<FxPreview | null>(null);
  const [previewError, setPreviewError] = useState("");
  const [previewBusy, setPreviewBusy] = useState(false);
  const provider = providers.find((item) => item.providerCode === providerCode) || providers[0] || null;
  const currencies = provider?.accounts.map((account) => account.currencyCode) || [];

  useEffect(() => {
    if (!provider) return;
    if (!providerCode) setProviderCode(provider.providerCode);
    if (!sourceCurrency || !currencies.includes(sourceCurrency)) setSourceCurrency(currencies[0] || "");
    const nextTarget = currencies.find((currency) => currency !== (sourceCurrency || currencies[0])) || "";
    if (!targetCurrency || !currencies.includes(targetCurrency) || targetCurrency === sourceCurrency) setTargetCurrency(nextTarget);
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
      if (!response.ok || !body?.preview) throw new Error(body?.message || body?.error || "MOBILE_MONEY_FX_PREVIEW_FAILED");
      setPreview(body.preview);
    } catch (error) {
      setPreviewError(error instanceof Error ? error.message : copy.fxMissingRate);
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
              <Select value={provider?.providerCode || ""} onChange={(value) => { setProviderCode(value); setPreview(null); }}>
                {providers.map((item) => <option key={item.id} value={item.providerCode}>{item.label}</option>)}
              </Select>
            </Field>
            <div className="hidden md:block" />
            <Field label={copy.sourceCurrency}>
              <Select value={sourceCurrency} onChange={(value) => { setSourceCurrency(value); setPreview(null); }}>
                {currencies.map((currency) => <option key={currency} value={currency}>{currency}</option>)}
              </Select>
            </Field>
            <Field label={copy.targetCurrency}>
              <Select value={targetCurrency} onChange={(value) => { setTargetCurrency(value); setPreview(null); }}>
                {currencies.filter((currency) => currency !== sourceCurrency).map((currency) => <option key={currency} value={currency}>{currency}</option>)}
              </Select>
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
                <div><p className="text-xs font-bold uppercase text-dtsc-muted">{copy.sourceAmount}</p><p className="font-black text-dtsc-ink">{moneyValue(Number(preview.sourceAmount), preview.sourceCurrencyCode)}</p></div>
                <div><p className="text-xs font-bold uppercase text-dtsc-muted">{copy.rate}</p><p className="font-black text-dtsc-ink">1 {preview.sourceCurrencyCode} = {Number(preview.rate).toLocaleString(locale === "en" ? "en-US" : "fr-FR", { maximumFractionDigits: 6 })} {preview.targetCurrencyCode}</p></div>
                <div><p className="text-xs font-bold uppercase text-dtsc-muted">{copy.targetAmount}</p><p className="font-black text-dtsc-ink">{moneyValue(Number(preview.targetAmount), preview.targetCurrencyCode)}</p></div>
                <div><p className="text-xs font-bold uppercase text-dtsc-muted">{copy.available}</p><p className="font-black text-dtsc-ink">{moneyValue(Number(preview.sourceAvailableBalance), preview.sourceCurrencyCode)}</p></div>
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

function MobileMoneyConfigurationPanel({ organizationId, dashboard, locale, configuration, configurationBusy, configurationError, reload, busyAction, mutate }: { organizationId: string; dashboard: RetailDashboard; locale: "fr" | "en"; configuration: MobileMoneyConfiguration | null; configurationBusy: boolean; configurationError: string; reload: () => Promise<void>; busyAction: string | null; mutate: RetailMutation }) {
  const copy = COPY[locale];
  const [extraCurrency, setExtraCurrency] = useState<Record<string, string>>({});

  async function saveMapping(provider: ProviderConfiguration, currencyCode: string, financialAccountId: string) {
    if (!financialAccountId) return;
    const body = await mutate(
      `mobile-wallet-${provider.id}-${currencyCode}`,
      `/api/enterprise/${organizationId}/retail/mobile-money/accounts`,
      { providerCode: provider.providerCode, currencyCode, financialAccountId },
      copy.accountSaved,
      { idempotent: false },
    );
    if (body) await reload();
  }

  if (configurationBusy && !configuration) return <div className="rounded-xl border border-dtsc-border bg-dtsc-page p-4 text-sm font-semibold text-dtsc-muted">{copy.processing}</div>;
  if (configurationError && !configuration) return <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm font-bold text-rose-700 dark:text-rose-200">{configurationError}</div>;
  if (!configuration) return null;

  return (
    <div id="mobile-money-wallet-configuration" className="grid min-w-0 gap-5">
      <ModuleSection title={copy.configTitle} description={copy.configDescription}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dtsc-border bg-dtsc-page p-3">
          <p className="text-sm font-semibold text-dtsc-muted">{configuration.requiredCurrencies.length ? `${locale === "en" ? "Required in this country" : "Requis dans ce pays"}: ${configuration.requiredCurrencies.join(" + ")}` : copy.minimumTwo}</p>
          <Button size="sm" variant="outline" type="button" disabled={configurationBusy} onClick={() => void reload()}><RefreshCw className="h-4 w-4" />{copy.refresh}</Button>
        </div>
        <div className="grid min-w-0 gap-4 lg:grid-cols-2">
          {configuration.providers.map((provider) => {
            const mappedCurrencies = provider.accounts.map((mapping) => mapping.currencyCode);
            const fixedCurrencies = configuration.requiredCurrencies.length ? Array.from(new Set([...configuration.requiredCurrencies, ...mappedCurrencies])) : mappedCurrencies;
            const addable = configuration.availableCurrencies.filter((currency) => !fixedCurrencies.includes(currency));
            const draftCurrency = extraCurrency[provider.id] || addable[0] || "";
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
                          <Select value={draftCurrency} onChange={(value) => setExtraCurrency((current) => ({ ...current, [provider.id]: value }))}>
                            {addable.map((currency) => <option key={currency} value={currency}>{currency}</option>)}
                          </Select>
                        </Field>
                        <Field label={copy.account}>
                          <Select id={`extra-account-${provider.id}`} defaultValue="">
                            <option value="">—</option>
                            {configuration.financialAccounts.filter((account) => account.currencyCode === draftCurrency).map((account) => <option key={account.id} value={account.id}>{account.name} · {account.code}</option>)}
                          </Select>
                        </Field>
                        <Button type="button" disabled={Boolean(busyAction) || !draftCurrency} onClick={() => {
                          const select = document.getElementById(`extra-account-${provider.id}`) as HTMLSelectElement | null;
                          if (select?.value) void saveMapping(provider, draftCurrency, select.value);
                        }}><WalletCards className="h-4 w-4" />{copy.save}</Button>
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

function WalletMappingRow({ provider, currencyCode, mapping, accounts, canManage, busy, locale, onSave }: { provider: ProviderConfiguration; currencyCode: string; mapping: ProviderMapping | null; accounts: CurrencyAccount[]; canManage: boolean; busy: boolean; locale: "fr" | "en"; onSave: (provider: ProviderConfiguration, currencyCode: string, accountId: string) => Promise<void> }) {
  const copy = COPY[locale];
  const [accountId, setAccountId] = useState(mapping?.financialAccountId || "");
  useEffect(() => setAccountId(mapping?.financialAccountId || ""), [mapping?.financialAccountId]);
  return (
    <div className="rounded-xl border border-dtsc-border bg-dtsc-surface p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <StatusBadge tone={mapping ? "success" : "warning"}>{currencyCode}</StatusBadge>
          <div>
            <p className="text-sm font-black text-dtsc-ink">{mapping?.financialAccount.name || (locale === "en" ? "Not configured" : "Non configuré")}</p>
            {mapping ? <p className="text-xs font-semibold text-dtsc-muted">{copy.currentWallet} · {moneyValue(Number(mapping.financialAccount.operationalBalance), currencyCode)}</p> : null}
          </div>
        </div>
        <StatusBadge tone={mapping ? "success" : "warning"}>{mapping ? "OK" : copy.incomplete}</StatusBadge>
      </div>
      {canManage ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <Field label={`${copy.account} · ${currencyCode}`}>
            <Select value={accountId} onChange={setAccountId} disabled={busy}>
              <option value="">—</option>
              {accounts.map((account) => <option key={account.id} value={account.id}>{account.name} · {account.code}</option>)}
            </Select>
          </Field>
          <Button type="button" disabled={busy || !accountId || accountId === mapping?.financialAccountId} onClick={() => void onSave(provider, currencyCode, accountId)}><Settings2 className="h-4 w-4" />{copy.save}</Button>
        </div>
      ) : null}
    </div>
  );
}

function MobileMoneyHistory({ organizationId, dashboard, locale, busyAction, mutate }: { organizationId: string; dashboard: RetailDashboard; locale: "fr" | "en"; busyAction: string | null; mutate: RetailMutation }) {
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
                meta={`${customerFacingMobileMoneyTransactionType(item.transactionType, locale)} · ${moneyValue(item.principalAmount, item.currencyCode)} · ${formatEnterpriseDate(item.occurredAt, locale)}`}
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
