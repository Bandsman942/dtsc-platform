"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode, type SelectHTMLAttributes } from "react";
import { CheckCircle2, RadioTower, RefreshCw, RotateCcw, Settings2 } from "lucide-react";
import { useAppLocale } from "@/components/i18n/locale-provider";
import { formatEnterpriseDate } from "@/components/enterprise/core-v2/erp-v2-ui";
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
  type CatalogItem,
  type RetailDashboard,
  type RetailMutation,
  type TelcoTopup,
} from "@/components/enterprise/professional/retail-workspace-shared";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { BusinessList, BusinessListItem } from "@/components/workspace/business-list";
import { EmptyState } from "@/components/workspace/empty-state";
import { ModuleSection } from "@/components/workspace/module-workspace";
import { StatusBadge } from "@/components/workspace/status-badge";
import retailTransactionFormsEn from "@/locales/retail-transaction-forms.en.json";
import retailTransactionFormsFr from "@/locales/retail-transaction-forms.fr.json";
import { notifyToast } from "@/lib/client-toast";
import {
  customerFacingError,
  customerFacingFinancialAccountType,
  customerFacingStatusLabel,
} from "@/lib/customer-facing-language";
import type { EnterpriseModuleDefinition } from "@/lib/enterprise/module-registry";
import { translateRetailWorkspace } from "@/lib/i18n";

type TelcoCurrencyAccount = {
  id: string;
  code: string;
  name: string;
  accountType: string;
  currencyCode: string;
  operationalBalance: string | number;
  ledgerAccountId: string;
};

type TelcoProviderMapping = {
  id: string;
  currencyCode: string;
  financialAccountId: string;
  revision: number;
  financialAccount: TelcoCurrencyAccount;
};

type TelcoProviderConfiguration = {
  id: string;
  providerCode: string;
  label: string;
  providerType: string;
  executionMode: "MANUAL" | "CONNECTED";
  accounts: TelcoProviderMapping[];
  mappedCurrencyCount: number;
  ready: boolean;
};

type TelcoConfiguration = {
  country: string | null;
  requiredCurrencies: string[];
  minimumCurrencyCount: number;
  availableCurrencies: string[];
  financialAccounts: TelcoCurrencyAccount[];
  providers: TelcoProviderConfiguration[];
};

type TelcoDashboard = RetailDashboard & {
  cashSessions?: MobileMoneyCashSession[];
  telcoConfiguration?: TelcoConfiguration | null;
};

type TelcoDraft = {
  providerCode: string;
  destinationPhone: string;
  catalogItemId: string | null;
  offerLabel: string;
  currencyCode: string;
  saleAmount: number;
  operatorCost: number;
  tenderFinancialAccountId: string;
  operatorFloatAccountId: null;
  externalReference: string | null;
  status: "SUCCESS" | "FAILED";
  failureReason: string | null;
};

type TelcoFieldErrorKey = "payment" | "provider" | "phone" | "offer" | "sale" | "cost" | "reference" | "failure";
type TelcoFieldErrors = Partial<Record<TelcoFieldErrorKey, string>>;

type ReversalDraft = { id: string; revision: number; number: string };

const COPY = {
  fr: {
    operationTitle: "Recharge Télécom ou forfait",
    operationDescription: "Choisissez d’abord l’encaissement réel. Sa devise détermine automatiquement les réseaux et comptes opérateur disponibles.",
    configurationTitle: "Configuration des réseaux Télécom",
    configurationDescription: "Associez chaque réseau aux vrais comptes opérateur par devise. En RDC, CDF et USD sont attendus pour qu’un réseau soit prêt.",
    configurationUnavailable: "La configuration Télécom n’est pas disponible pour le moment.",
    refresh: "Actualiser",
    requiredCountry: "Devises attendues pour ce pays",
    minimumCurrencies: "Configurez au moins deux devises d’exploitation par réseau actif.",
    currenciesConfigured: "devise(s) configurée(s)",
    ready: "Prêt",
    incomplete: "À compléter",
    operatorAccount: "Compte opérateur Télécom",
    addCurrency: "Ajouter une devise",
    save: "Enregistrer",
    addAccount: "Ajouter le compte",
    accountSaved: "Compte opérateur Télécom enregistré.",
    mappingRequired: "Choisissez un compte financier réel dans la devise concernée.",
    noNetwork: "Aucun réseau Télécom actif",
    noNetworkDescription: "Activez un réseau Télécom avant de configurer ses comptes par devise.",
    history: "Historique Télécom et forfaits",
    noTopup: "Aucune recharge enregistrée",
    noTopupDescription: "Les recharges et forfaits enregistrés apparaîtront ici.",
    reverse: "Contrepasser",
    reverseTitle: "Contrepasser la recharge Télécom",
    reverseHelp: "Expliquez pourquoi cette recharge doit être annulée. L’opération originale restera visible dans l’historique d’audit.",
    reverseReason: "Motif de contrepassation",
    reverseRequired: "Saisissez un motif de contrepassation d’au moins 3 caractères.",
    reverseConfirm: "Confirmer la contrepassation",
    reversed: "Recharge Télécom contrepassée.",
    cancel: "Annuler",
    margin: "Marge",
  },
  en: {
    operationTitle: "Telecom top-up or bundle",
    operationDescription: "Choose the real payment account first. Its currency automatically determines the available networks and provider accounts.",
    configurationTitle: "Telecom network configuration",
    configurationDescription: "Map every network to real provider accounts by currency. In DRC, CDF and USD are expected before a network is ready.",
    configurationUnavailable: "Telecom configuration is currently unavailable.",
    refresh: "Refresh",
    requiredCountry: "Currencies expected for this country",
    minimumCurrencies: "Configure at least two operating currencies for each active network.",
    currenciesConfigured: "configured currency/currencies",
    ready: "Ready",
    incomplete: "To complete",
    operatorAccount: "Telecom provider account",
    addCurrency: "Add currency",
    save: "Save",
    addAccount: "Add account",
    accountSaved: "Telecom provider account saved.",
    mappingRequired: "Choose a real financial account in the selected currency.",
    noNetwork: "No active Telecom network",
    noNetworkDescription: "Enable a Telecom network before configuring its currency accounts.",
    history: "Telecom top-up and bundle history",
    noTopup: "No top-up recorded",
    noTopupDescription: "Recorded top-ups and bundles will appear here.",
    reverse: "Reverse",
    reverseTitle: "Reverse Telecom top-up",
    reverseHelp: "Explain why this top-up must be reversed. The original operation will remain visible in the audit trail.",
    reverseReason: "Reversal reason",
    reverseRequired: "Enter a reversal reason of at least 3 characters.",
    reverseConfirm: "Confirm reversal",
    reversed: "Telecom top-up reversed.",
    cancel: "Cancel",
    margin: "Margin",
  },
} as const;

function TelcoSelect(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`min-h-11 w-full min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-semibold text-dtsc-ink ${props.className || ""}`}
    />
  );
}

function GuidedField({
  id,
  label,
  help,
  required,
  requiredLabel,
  error,
  children,
}: {
  id?: string;
  label: string;
  help: string;
  required?: boolean;
  requiredLabel: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <div className="mb-1.5 flex flex-wrap items-center gap-2">
        <label htmlFor={id} className="text-sm font-black text-dtsc-ink">{label}</label>
        {required ? <span className="rounded-full border border-dtsc-border px-2 py-0.5 text-[11px] font-black uppercase tracking-wide text-dtsc-muted">{requiredLabel}</span> : null}
      </div>
      {children}
      <p className="mt-1 text-xs font-semibold leading-5 text-dtsc-muted">{help}</p>
      {error ? <p role="alert" className="mt-1 text-xs font-bold leading-5 text-rose-700 dark:text-rose-200">{error}</p> : null}
    </div>
  );
}

function firstError(errors: TelcoFieldErrors) {
  return Object.values(errors).find(Boolean) || "";
}

function formError(message: string) {
  notifyToast(message, "error");
}

export function TelcoTopupsWorkspace({
  organizationId,
  organizationName,
  definition,
}: {
  organizationId: string;
  organizationName: string;
  definition: EnterpriseModuleDefinition;
}) {
  const locale: "fr" | "en" = useAppLocale() === "en" ? "en" : "fr";
  const [configuration, setConfiguration] = useState<TelcoConfiguration | null>(null);
  const [configurationError, setConfigurationError] = useState("");
  const [configurationBusy, setConfigurationBusy] = useState(false);

  const loadConfiguration = useCallback(async () => {
    setConfigurationBusy(true);
    setConfigurationError("");
    try {
      const response = await fetch(`/api/enterprise/${organizationId}/retail/telco-topups/accounts`, { cache: "no-store" });
      const body = await response.json().catch(() => null) as (TelcoConfiguration & { message?: string; error?: string }) | null;
      if (!response.ok || !body) throw new Error(body?.message || body?.error || "TELCO_CONFIGURATION_LOAD_FAILED");
      setConfiguration(body);
    } catch (caught) {
      const message = customerFacingError(caught, locale, {
        fr: "Impossible de charger la configuration Télécom.",
        en: "Unable to load Telecom configuration.",
      });
      setConfigurationError(message);
      notifyToast(message, "error");
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
      moduleCode="TELCO_TOPUPS"
      locale={locale}
      includeConfigurationTab
    >
      {(context) => {
        const dashboard = context.dashboard as TelcoDashboard;
        const reload = async () => {
          await loadConfiguration();
          context.setRefreshKey((value) => value + 1);
        };
        if (context.tab === "HISTORY") {
          return <TelcoHistory organizationId={organizationId} dashboard={dashboard} locale={locale} busyAction={context.busyAction} mutate={context.mutate} />;
        }
        if (context.tab === "CONFIG") {
          return <TelcoConfigurationPanel organizationId={organizationId} dashboard={dashboard} locale={locale} configuration={configuration} configurationBusy={configurationBusy} configurationError={configurationError} reload={reload} busyAction={context.busyAction} mutate={context.mutate} />;
        }
        if (context.tab === "REPORTS") return <RetailReportsPanel dashboard={dashboard} moduleCode="TELCO_TOPUPS" locale={locale} />;
        return <TelcoOperations organizationId={organizationId} dashboard={dashboard} locale={locale} configuration={configuration} configurationBusy={configurationBusy} configurationError={configurationError} reload={reload} busyAction={context.busyAction} mutate={context.mutate} />;
      }}
    </RetailWorkspaceFrame>
  );
}

function TelcoOperations({
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
  dashboard: TelcoDashboard;
  locale: "fr" | "en";
  configuration: TelcoConfiguration | null;
  configurationBusy: boolean;
  configurationError: string;
  reload: () => Promise<void>;
  busyAction: string | null;
  mutate: RetailMutation;
}) {
  const copy = COPY[locale];
  const formCopy = (locale === "en" ? retailTransactionFormsEn : retailTransactionFormsFr).telco;
  const sessions = useMemo<MobileMoneyCashSession[]>(
    () => dashboard.cashSessions || (dashboard.cashSession ? [dashboard.cashSession as MobileMoneyCashSession] : []),
    [dashboard.cashSession, dashboard.cashSessions],
  );
  const openSessions = useMemo(() => sessions.filter((session) => session.status === "OPEN"), [sessions]);
  const [selectedCashSessionId, setSelectedCashSessionId] = useState("");
  const [tenderMethod, setTenderMethod] = useState<"CASH" | "NON_CASH">("CASH");
  const [nonCashAccountId, setNonCashAccountId] = useState("");
  const [selectedProviderCode, setSelectedProviderCode] = useState("");
  const [catalogItemId, setCatalogItemId] = useState("");
  const [offerLabel, setOfferLabel] = useState("");
  const [saleAmount, setSaleAmount] = useState("");
  const [operatorCost, setOperatorCost] = useState("");
  const [manualStatus, setManualStatus] = useState<"SUCCESS" | "FAILED">("SUCCESS");
  const [pending, setPending] = useState<TelcoDraft | null>(null);
  const [operationError, setOperationError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<TelcoFieldErrors>({});

  useEffect(() => {
    if (!openSessions.length) {
      if (selectedCashSessionId) setSelectedCashSessionId("");
      return;
    }
    if (!openSessions.some((session) => session.id === selectedCashSessionId)) setSelectedCashSessionId(openSessions[0].id);
  }, [openSessions, selectedCashSessionId]);

  const activeCash = openSessions.find((session) => session.id === selectedCashSessionId) || openSessions[0] || null;
  const nonCashAccounts = useMemo(
    () => dashboard.accounts.filter((account) => ["MOBILE_MONEY", "BANK", "CLEARING"].includes(account.accountType)),
    [dashboard.accounts],
  );

  useEffect(() => {
    if (tenderMethod !== "NON_CASH") return;
    if (!nonCashAccounts.some((account) => account.id === nonCashAccountId)) setNonCashAccountId(nonCashAccounts[0]?.id || "");
  }, [nonCashAccountId, nonCashAccounts, tenderMethod]);

  const tenderAccount = tenderMethod === "CASH"
    ? (activeCash ? dashboard.accounts.find((account) => account.id === activeCash.financialAccount.id) || null : null)
    : nonCashAccounts.find((account) => account.id === nonCashAccountId) || null;
  const currency = tenderAccount?.currencyCode || "";
  const providers = configuration?.providers || [];
  const eligibleProviders = useMemo(
    () => providers.filter((provider) => provider.accounts.some((mapping) => mapping.currencyCode === currency && mapping.financialAccountId !== tenderAccount?.id)),
    [currency, providers, tenderAccount?.id],
  );
  const selectedProvider = eligibleProviders.find((provider) => provider.providerCode === selectedProviderCode) || null;
  const selectedOperatorMapping = selectedProvider?.accounts.find((mapping) => mapping.currencyCode === currency) || null;
  const manualExecution = Boolean(selectedProvider && selectedProvider.executionMode === "MANUAL");
  const eligibleCatalog = useMemo(
    () => (dashboard.catalogItems || []).filter((item) => !item.currency || item.currency === currency),
    [currency, dashboard.catalogItems],
  );

  useEffect(() => {
    if (selectedProviderCode && !eligibleProviders.some((provider) => provider.providerCode === selectedProviderCode)) {
      setSelectedProviderCode("");
      setPending(null);
      return;
    }
    if (!selectedProviderCode && eligibleProviders.length === 1) setSelectedProviderCode(eligibleProviders[0].providerCode);
  }, [eligibleProviders, selectedProviderCode]);

  useEffect(() => {
    setPending(null);
    setOperationError("");
    setFieldErrors({});
  }, [selectedCashSessionId, tenderMethod, nonCashAccountId, currency]);

  function applyCatalog(item: CatalogItem | null) {
    setCatalogItemId(item?.id || "");
    if (!item) return;
    setOfferLabel(item.name);
    if (item.indicativeSalePrice !== null && item.indicativeSalePrice !== undefined) setSaleAmount(String(item.indicativeSalePrice));
    if (item.indicativeCost !== null && item.indicativeCost !== undefined) setOperatorCost(String(item.indicativeCost));
    setPending(null);
    setFieldErrors((current) => ({ ...current, offer: undefined, sale: undefined, cost: undefined }));
  }

  async function confirmOperation() {
    if (!pending) return;
    const body = await mutate(
      "telco-topup",
      `/api/enterprise/${organizationId}/retail/telco-topups`,
      pending,
      formCopy.operationRecorded,
    );
    if (body) {
      setPending(null);
      setOperationError("");
      setFieldErrors({});
      await reload();
    }
  }

  return (
    <div className="grid min-w-0 gap-5">
      <MobileMoneyCashSessionManager
        organizationId={organizationId}
        moduleCode="TELCO_TOPUPS"
        accounts={dashboard.accounts}
        sessions={sessions}
        selectedSessionId={activeCash?.id || ""}
        onSelectSession={(sessionId) => {
          setSelectedCashSessionId(sessionId);
          setTenderMethod("CASH");
          setSelectedProviderCode("");
          setPending(null);
          setOperationError("");
          setFieldErrors({});
        }}
        locale={locale}
        busyAction={busyAction}
        mutate={mutate}
        reload={reload}
      />

      <ModuleSection title={copy.operationTitle} description={copy.operationDescription}>
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const providerCode = selectedProviderCode || String(form.get("providerCode") || "");
            const provider = eligibleProviders.find((item) => item.providerCode === providerCode) || null;
            const operatorMapping = provider?.accounts.find((mapping) => mapping.currencyCode === currency) || null;
            const destinationPhone = normalizePhonePreview(String(form.get("destinationPhone") || ""));
            const sale = Number(saleAmount);
            const cost = Number(operatorCost);
            const externalReference = String(form.get("externalReference") || "").trim();
            const failureReason = String(form.get("failureReason") || "").trim();
            const providerManual = Boolean(provider && provider.executionMode === "MANUAL");
            const status = providerManual ? manualStatus : "SUCCESS";
            const nextErrors: TelcoFieldErrors = {};

            if (!tenderAccount || !currency) nextErrors.payment = formCopy.paymentRequired;
            if (!provider || !operatorMapping) nextErrors.provider = formCopy.providerRequired;
            if (destinationPhone.length < 5) nextErrors.phone = formCopy.phoneRequired;
            if (offerLabel.trim().length < 2) nextErrors.offer = formCopy.offerRequired;
            if (!Number.isFinite(sale) || sale <= 0) nextErrors.sale = formCopy.saleInvalid;
            if (!Number.isFinite(cost) || cost < 0) nextErrors.cost = formCopy.costInvalid;
            else if (Number.isFinite(sale) && cost > sale) nextErrors.cost = formCopy.costTooHigh;
            if (providerManual && status === "SUCCESS" && !externalReference) nextErrors.reference = formCopy.referenceRequired;
            if (providerManual && status === "FAILED" && failureReason.length < 3) nextErrors.failure = formCopy.failureRequired;

            setFieldErrors(nextErrors);
            const preciseError = firstError(nextErrors);
            if (preciseError) {
              setOperationError(formCopy.fieldErrorSummary);
              formError(preciseError);
              setPending(null);
              return;
            }
            if (!tenderAccount || !provider || !operatorMapping || !currency) return;

            setOperationError("");
            setPending({
              providerCode: provider.providerCode,
              destinationPhone,
              catalogItemId: catalogItemId || null,
              offerLabel: offerLabel.trim(),
              currencyCode: currency,
              saleAmount: sale,
              operatorCost: cost,
              tenderFinancialAccountId: tenderAccount.id,
              operatorFloatAccountId: null,
              externalReference: providerManual && status === "SUCCESS" ? externalReference : null,
              status,
              failureReason: providerManual && status === "FAILED" ? failureReason : null,
            });
          }}
          className="grid min-w-0 gap-4"
        >
          <div className="grid min-w-0 gap-4 md:grid-cols-2">
            <GuidedField label={formCopy.paymentMethod} help={formCopy.paymentMethodHelp} required requiredLabel={formCopy.required} error={fieldErrors.payment}>
              <TelcoSelect
                name="tenderMethod"
                value={tenderMethod}
                onChange={(event) => {
                  setTenderMethod(event.target.value === "NON_CASH" ? "NON_CASH" : "CASH");
                  setSelectedProviderCode("");
                  setPending(null);
                  setFieldErrors((current) => ({ ...current, payment: undefined, provider: undefined }));
                }}
                disabled={Boolean(busyAction)}
                aria-invalid={Boolean(fieldErrors.payment)}
              >
                <option value="CASH">{formCopy.cashTill}</option>
                <option value="NON_CASH">{formCopy.otherAccount}</option>
              </TelcoSelect>
            </GuidedField>

            <GuidedField label={formCopy.paymentAccount} help={tenderMethod === "CASH" ? formCopy.cashAccountHelp : formCopy.nonCashAccountHelp} required requiredLabel={formCopy.required} error={fieldErrors.payment}>
              {tenderMethod === "CASH" ? (
                <TelcoSelect value={activeCash?.id || ""} disabled aria-label={formCopy.paymentAccount}>
                  <option value="">{formCopy.openTillRequired}</option>
                  {activeCash ? <option value={activeCash.id}>{activeCash.financialAccount.name} · {activeCash.financialAccount.currencyCode}</option> : null}
                </TelcoSelect>
              ) : (
                <TelcoSelect
                  name="tenderAccountId"
                  value={nonCashAccountId}
                  onChange={(event) => {
                    setNonCashAccountId(event.target.value);
                    setSelectedProviderCode("");
                    setPending(null);
                    setFieldErrors((current) => ({ ...current, payment: undefined, provider: undefined }));
                  }}
                  disabled={Boolean(busyAction)}
                  aria-invalid={Boolean(fieldErrors.payment)}
                >
                  <option value="">—</option>
                  {nonCashAccounts.map((account) => <option key={account.id} value={account.id}>{account.name} · {account.currencyCode} · {customerFacingFinancialAccountType(account.accountType, locale)}</option>)}
                </TelcoSelect>
              )}
            </GuidedField>

            <GuidedField label={formCopy.provider} help={formCopy.providerHelp} required requiredLabel={formCopy.required} error={fieldErrors.provider}>
              <TelcoSelect
                name="providerCode"
                value={selectedProviderCode}
                onChange={(event) => {
                  setSelectedProviderCode(event.target.value);
                  setManualStatus("SUCCESS");
                  setPending(null);
                  setFieldErrors((current) => ({ ...current, provider: undefined, reference: undefined, failure: undefined }));
                }}
                disabled={Boolean(busyAction) || configurationBusy || !currency}
                aria-invalid={Boolean(fieldErrors.provider)}
              >
                <option value="">—</option>
                {eligibleProviders.map((provider) => <option key={provider.id} value={provider.providerCode}>{provider.label}</option>)}
              </TelcoSelect>
              {selectedProvider ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  <StatusBadge tone={selectedProvider.executionMode === "CONNECTED" ? "success" : "neutral"}>{selectedProvider.executionMode === "CONNECTED" ? formCopy.connectedMode : formCopy.manualMode}</StatusBadge>
                  <StatusBadge tone={selectedProvider.ready ? "success" : "warning"}>{selectedProvider.ready ? copy.ready : copy.incomplete}</StatusBadge>
                </div>
              ) : null}
            </GuidedField>

            <GuidedField label={formCopy.operatorAccount} help={formCopy.operatorAccountHelp} required requiredLabel={formCopy.required} error={fieldErrors.provider}>
              <TelcoSelect value={selectedOperatorMapping?.financialAccountId || ""} disabled aria-label={formCopy.operatorAccount}>
                <option value="">—</option>
                {selectedOperatorMapping ? <option value={selectedOperatorMapping.financialAccountId}>{selectedOperatorMapping.financialAccount.name} · {currency}</option> : null}
              </TelcoSelect>
            </GuidedField>

            <GuidedField id="telco-destination-phone" label={formCopy.phone} help={formCopy.phoneHelp} required requiredLabel={formCopy.required} error={fieldErrors.phone}>
              <Input id="telco-destination-phone" name="destinationPhone" inputMode="tel" placeholder={translateRetailWorkspace(locale, "operatorCountryCode")} disabled={Boolean(busyAction)} aria-invalid={Boolean(fieldErrors.phone)} onChange={() => { setPending(null); setFieldErrors((current) => ({ ...current, phone: undefined })); }} />
            </GuidedField>

            <GuidedField label={formCopy.catalogOffer} help={formCopy.catalogHelp} requiredLabel={formCopy.required}>
              <TelcoSelect name="catalogItemId" value={catalogItemId} onChange={(event) => applyCatalog(eligibleCatalog.find((item) => item.id === event.target.value) || null)} disabled={Boolean(busyAction) || !currency}>
                <option value="">{formCopy.noCatalogOffer}</option>
                {eligibleCatalog.map((item) => <option key={item.id} value={item.id}>{item.name}{item.currency ? ` · ${item.currency}` : ""}</option>)}
              </TelcoSelect>
            </GuidedField>

            <GuidedField id="telco-offer-label" label={formCopy.offerLabel} help={formCopy.offerHelp} required requiredLabel={formCopy.required} error={fieldErrors.offer}>
              <Input id="telco-offer-label" name="offerLabel" value={offerLabel} onChange={(event) => { setOfferLabel(event.target.value); setPending(null); setFieldErrors((current) => ({ ...current, offer: undefined })); }} disabled={Boolean(busyAction)} aria-invalid={Boolean(fieldErrors.offer)} />
            </GuidedField>

            <GuidedField id="telco-sale-amount" label={formCopy.saleAmount} help={formCopy.saleHelp} required requiredLabel={formCopy.required} error={fieldErrors.sale}>
              <Input id="telco-sale-amount" name="saleAmount" type="number" min="0.01" step="0.01" value={saleAmount} onChange={(event) => { setSaleAmount(event.target.value); setPending(null); setFieldErrors((current) => ({ ...current, sale: undefined, cost: undefined })); }} disabled={Boolean(busyAction)} aria-invalid={Boolean(fieldErrors.sale)} />
            </GuidedField>

            <GuidedField id="telco-operator-cost" label={formCopy.operatorCost} help={formCopy.costHelp} required requiredLabel={formCopy.required} error={fieldErrors.cost}>
              <Input id="telco-operator-cost" name="operatorCost" type="number" min="0" step="0.01" value={operatorCost} onChange={(event) => { setOperatorCost(event.target.value); setPending(null); setFieldErrors((current) => ({ ...current, cost: undefined })); }} disabled={Boolean(busyAction)} aria-invalid={Boolean(fieldErrors.cost)} />
            </GuidedField>

            {selectedProvider && manualExecution ? (
              <GuidedField label={formCopy.executionStatus} help={formCopy.statusHelp} required requiredLabel={formCopy.required}>
                <TelcoSelect name="status" value={manualStatus} onChange={(event) => { setManualStatus(event.target.value === "FAILED" ? "FAILED" : "SUCCESS"); setPending(null); setFieldErrors((current) => ({ ...current, reference: undefined, failure: undefined })); }} disabled={Boolean(busyAction)}>
                  <option value="SUCCESS">{customerFacingStatusLabel("SUCCESS", locale)}</option>
                  <option value="FAILED">{customerFacingStatusLabel("FAILED", locale)}</option>
                </TelcoSelect>
              </GuidedField>
            ) : null}

            {selectedProvider && manualExecution && manualStatus === "SUCCESS" ? (
              <GuidedField id="telco-reference" label={formCopy.reference} help={formCopy.referenceHelp} required requiredLabel={formCopy.required} error={fieldErrors.reference}>
                <Input id="telco-reference" name="externalReference" maxLength={160} disabled={Boolean(busyAction)} aria-invalid={Boolean(fieldErrors.reference)} onChange={() => { setPending(null); setFieldErrors((current) => ({ ...current, reference: undefined })); }} />
              </GuidedField>
            ) : null}

            {selectedProvider && manualExecution && manualStatus === "FAILED" ? (
              <GuidedField id="telco-failure" label={formCopy.failureReason} help={formCopy.failureHelp} required requiredLabel={formCopy.required} error={fieldErrors.failure}>
                <Input id="telco-failure" name="failureReason" minLength={3} maxLength={500} disabled={Boolean(busyAction)} aria-invalid={Boolean(fieldErrors.failure)} onChange={() => { setPending(null); setFieldErrors((current) => ({ ...current, failure: undefined })); }} />
              </GuidedField>
            ) : null}
          </div>

          {selectedProvider?.executionMode === "CONNECTED" ? (
            <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-3 text-sm font-semibold text-dtsc-ink">{formCopy.connectedModeHelp}</div>
          ) : null}
          {configurationError ? <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm font-bold text-rose-700 dark:text-rose-200">{configurationError}</div> : null}
          {currency && configuration && !eligibleProviders.length ? <div role="alert" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm font-bold text-amber-800 dark:text-amber-200">{formCopy.noProviderForCurrency}</div> : null}
          {operationError ? <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm font-bold text-rose-700 dark:text-rose-200">{operationError}</div> : null}

          <Button className="w-fit" disabled={Boolean(busyAction) || configurationBusy || !tenderAccount || !currency || !eligibleProviders.length}>
            <RadioTower className="h-4 w-4" />{formCopy.review}
          </Button>
        </form>
      </ModuleSection>

      <Dialog
        open={Boolean(pending)}
        title={formCopy.reviewTitle}
        description={formCopy.reviewDescription}
        presentation="editor"
        className="h-[96dvh] max-w-4xl"
        onClose={() => setPending(null)}
        footer={
          <div data-responsive-actions>
            <Button type="button" variant="outline" disabled={Boolean(busyAction)} onClick={() => setPending(null)}>{formCopy.edit}</Button>
            <Button type="button" disabled={Boolean(busyAction)} onClick={() => void confirmOperation()}><CheckCircle2 className="h-4 w-4" />{busyAction === "telco-topup" ? formCopy.processing : formCopy.confirm}</Button>
          </div>
        }
      >
        {pending ? (
          <div className="grid min-w-0 gap-4 p-4 sm:p-5">
            <p className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-3 text-sm font-bold text-dtsc-ink">{formCopy.reviewSafety}</p>
            <div className="rounded-2xl border-2 border-amber-400/50 bg-amber-500/10 p-4">
              <p className="text-sm font-black text-dtsc-ink">{selectedProvider?.label || formCopy.provider}</p>
              <p className="mt-2 text-2xl font-black text-dtsc-ink">{moneyValue(pending.saleAmount, pending.currencyCode, locale)}</p>
              <p className="mt-1 text-sm font-bold text-dtsc-muted">{pending.offerLabel}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <ReviewItem label={formCopy.customer} value={pending.destinationPhone} />
              <ReviewItem label={formCopy.currency} value={pending.currencyCode} />
              <ReviewItem label={formCopy.paymentAccount} value={`${tenderAccount?.name || "—"} · ${pending.currencyCode}`} />
              <ReviewItem label={formCopy.operatorAccount} value={`${selectedOperatorMapping?.financialAccount.name || "—"} · ${pending.currencyCode}`} />
              <ReviewItem label={formCopy.operatorCost} value={moneyValue(pending.operatorCost, pending.currencyCode, locale)} />
              <ReviewItem label={copy.margin} value={moneyValue(pending.saleAmount - pending.operatorCost, pending.currencyCode, locale)} />
              <ReviewItem label={formCopy.executionMode} value={selectedProvider?.executionMode === "CONNECTED" ? formCopy.connectedMode : formCopy.manualMode} />
              <ReviewItem label={formCopy.reference} value={pending.externalReference || (selectedProvider?.executionMode === "CONNECTED" ? formCopy.providerGeneratedReference : "—")} />
              {pending.status === "FAILED" ? <ReviewItem label={formCopy.failureReason} value={pending.failureReason || "—"} /> : null}
            </div>
          </div>
        ) : null}
      </Dialog>

      <RetailErpLinks moduleCode="TELCO_TOPUPS" locale={locale} />
    </div>
  );
}

function ReviewItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-dtsc-border bg-dtsc-page p-3">
      <p className="text-xs font-black uppercase tracking-[0.08em] text-dtsc-muted">{label}</p>
      <p className="mt-1 break-words text-sm font-black text-dtsc-ink">{value}</p>
    </div>
  );
}

function TelcoHistory({
  organizationId,
  dashboard,
  locale,
  busyAction,
  mutate,
}: {
  organizationId: string;
  dashboard: TelcoDashboard;
  locale: "fr" | "en";
  busyAction: string | null;
  mutate: RetailMutation;
}) {
  const copy = COPY[locale];
  const items = dashboard.recent.topups || [];
  const [reversal, setReversal] = useState<ReversalDraft | null>(null);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState("");

  async function confirmReversal() {
    if (!reversal) return;
    const normalized = reason.trim();
    if (normalized.length < 3) {
      setReasonError(copy.reverseRequired);
      formError(copy.reverseRequired);
      return;
    }
    const body = await mutate(
      `reverse-${reversal.id}`,
      `/api/enterprise/${organizationId}/retail/telco-topups/${reversal.id}/reverse`,
      { revision: reversal.revision, reason: normalized },
      copy.reversed,
      { idempotent: false },
    );
    if (body) {
      setReversal(null);
      setReason("");
      setReasonError("");
    }
  }

  return (
    <div className="grid min-w-0 gap-5">
      <ModuleSection title={copy.history}>
        {items.length ? (
          <BusinessList ariaLabel={copy.history}>
            {items.map((item: TelcoTopup) => (
              <BusinessListItem
                key={item.id}
                title={`${item.number} · ${providerLabel(dashboard, item.providerCode)}`}
                status={<StatusBadge tone={statusTone(item.status)}>{customerFacingStatusLabel(item.status, locale)}</StatusBadge>}
                meta={`${item.offerLabel} · ${moneyValue(item.saleAmount, item.currencyCode, locale)} · ${formatEnterpriseDate(item.occurredAt, locale)}`}
                description={`${item.destinationPhoneMasked || "—"} · ${copy.margin} ${moneyValue(item.marginAmount, item.currencyCode, locale)} · ${translateRetailWorkspace(locale, "operatorOperatorReference")}: ${item.externalReference || "—"}`}
                actions={dashboard.access.canManage && item.status === "SUCCESS" ? <Button size="sm" variant="outline" disabled={Boolean(busyAction)} onClick={() => { setReversal({ id: item.id, revision: item.revision, number: item.number }); setReason(""); setReasonError(""); }}><RotateCcw className="h-4 w-4" />{copy.reverse}</Button> : undefined}
              />
            ))}
          </BusinessList>
        ) : <EmptyState compact title={copy.noTopup} description={copy.noTopupDescription} />}
      </ModuleSection>

      <Dialog
        open={Boolean(reversal)}
        title={copy.reverseTitle}
        description={reversal ? `${reversal.number} · ${copy.reverseHelp}` : copy.reverseHelp}
        presentation="editor"
        className="h-[96dvh] max-w-2xl"
        onClose={() => { setReversal(null); setReason(""); setReasonError(""); }}
        footer={
          <div data-responsive-actions>
            <Button type="button" variant="outline" disabled={Boolean(busyAction)} onClick={() => { setReversal(null); setReason(""); setReasonError(""); }}>{copy.cancel}</Button>
            <Button type="button" disabled={Boolean(busyAction)} onClick={() => void confirmReversal()}><RotateCcw className="h-4 w-4" />{copy.reverseConfirm}</Button>
          </div>
        }
      >
        <div className="grid gap-3 p-4 sm:p-5">
          <label htmlFor="telco-reversal-reason" className="text-sm font-black text-dtsc-ink">{copy.reverseReason}</label>
          <textarea id="telco-reversal-reason" value={reason} onChange={(event) => { setReason(event.target.value); setReasonError(""); }} rows={6} className="w-full rounded-xl border border-dtsc-border bg-dtsc-surface p-3 text-sm font-semibold text-dtsc-ink" aria-invalid={Boolean(reasonError)} />
          <p className="text-xs font-semibold text-dtsc-muted">{copy.reverseHelp}</p>
          {reasonError ? <p role="alert" className="text-xs font-bold text-rose-700 dark:text-rose-200">{reasonError}</p> : null}
        </div>
      </Dialog>
      <RetailErpLinks moduleCode="TELCO_TOPUPS" locale={locale} />
    </div>
  );
}

function TelcoConfigurationPanel({
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
  dashboard: TelcoDashboard;
  locale: "fr" | "en";
  configuration: TelcoConfiguration | null;
  configurationBusy: boolean;
  configurationError: string;
  reload: () => Promise<void>;
  busyAction: string | null;
  mutate: RetailMutation;
}) {
  const copy = COPY[locale];
  const formCopy = (locale === "en" ? retailTransactionFormsEn : retailTransactionFormsFr).telco;
  const [extraCurrency, setExtraCurrency] = useState<Record<string, string>>({});
  const [extraAccount, setExtraAccount] = useState<Record<string, string>>({});

  async function saveMapping(provider: TelcoProviderConfiguration, currencyCode: string, financialAccountId: string) {
    if (!financialAccountId || !currencyCode) {
      formError(copy.mappingRequired);
      return;
    }
    const body = await mutate(
      `telco-account-${provider.id}-${currencyCode}`,
      `/api/enterprise/${organizationId}/retail/telco-topups/accounts`,
      { providerCode: provider.providerCode, currencyCode, financialAccountId },
      copy.accountSaved,
      { idempotent: false },
    );
    if (body) {
      setExtraAccount((current) => ({ ...current, [provider.id]: "" }));
      await reload();
    }
  }

  if (configurationBusy && !configuration) return <div className="rounded-xl border border-dtsc-border bg-dtsc-page p-4 text-sm font-semibold text-dtsc-muted">{formCopy.processing}</div>;
  if (configurationError && !configuration) return <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm font-bold text-rose-700 dark:text-rose-200">{configurationError}</div>;
  if (!configuration) return <EmptyState compact title={copy.configurationUnavailable} description={formCopy.configurationRetry} />;

  return (
    <div id="telco-provider-account-configuration" className="grid min-w-0 gap-5">
      <ModuleSection title={copy.configurationTitle} description={copy.configurationDescription}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dtsc-border bg-dtsc-page p-3">
          <p className="text-sm font-semibold text-dtsc-muted">{configuration.requiredCurrencies.length ? `${copy.requiredCountry}: ${configuration.requiredCurrencies.join(" + ")}` : copy.minimumCurrencies}</p>
          <Button size="sm" variant="outline" type="button" disabled={configurationBusy} onClick={() => void reload()}><RefreshCw className="h-4 w-4" />{copy.refresh}</Button>
        </div>

        {configuration.providers.length ? (
          <div className="grid min-w-0 gap-4 lg:grid-cols-2">
            {configuration.providers.map((provider) => {
              const mappedCurrencies = provider.accounts.map((mapping) => mapping.currencyCode);
              const displayedCurrencies = configuration.requiredCurrencies.length
                ? Array.from(new Set([...configuration.requiredCurrencies, ...mappedCurrencies]))
                : mappedCurrencies;
              const addable = configuration.availableCurrencies.filter((currency) => !displayedCurrencies.includes(currency));
              const draftCurrency = extraCurrency[provider.id] || addable[0] || "";
              const draftAccountId = extraAccount[provider.id] || "";
              const availableAccounts = configuration.financialAccounts.filter((account) => account.currencyCode === draftCurrency);
              return (
                <article key={provider.id} className="min-w-0 rounded-2xl border border-dtsc-border bg-dtsc-page p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="break-words text-lg font-black text-dtsc-ink">{provider.label}</p>
                      <p className="mt-1 text-xs font-bold text-dtsc-muted">{provider.mappedCurrencyCount} {copy.currenciesConfigured}</p>
                      <div className="mt-2"><StatusBadge tone={provider.executionMode === "CONNECTED" ? "success" : "neutral"}>{provider.executionMode === "CONNECTED" ? formCopy.connectedMode : formCopy.manualMode}</StatusBadge></div>
                    </div>
                    <StatusBadge tone={provider.ready ? "success" : "warning"}>{provider.ready ? copy.ready : copy.incomplete}</StatusBadge>
                  </div>

                  <div className="mt-4 grid gap-3">
                    {displayedCurrencies.map((currencyCode) => {
                      const mapping = provider.accounts.find((account) => account.currencyCode === currencyCode) || null;
                      const accounts = configuration.financialAccounts.filter((account) => account.currencyCode === currencyCode);
                      return (
                        <form
                          key={`${provider.id}-${currencyCode}-${mapping?.financialAccountId || "new"}`}
                          onSubmit={(event) => {
                            event.preventDefault();
                            const data = new FormData(event.currentTarget);
                            void saveMapping(provider, currencyCode, String(data.get("operatorAccountId") || ""));
                          }}
                          className="grid gap-3 rounded-xl border border-dtsc-border bg-dtsc-surface p-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-end"
                        >
                          <div className="min-w-16 self-center text-lg font-black text-dtsc-ink">{currencyCode}</div>
                          <GuidedField label={copy.operatorAccount} help={formCopy.configurationAccountHelp} required requiredLabel={formCopy.required}>
                            <TelcoSelect name="operatorAccountId" defaultValue={mapping?.financialAccountId || ""} disabled={!dashboard.access.canManage || Boolean(busyAction)}>
                              <option value="">—</option>
                              {accounts.map((account) => <option key={account.id} value={account.id}>{account.name} · {customerFacingFinancialAccountType(account.accountType, locale)}</option>)}
                            </TelcoSelect>
                          </GuidedField>
                          {dashboard.access.canManage ? <Button size="sm" disabled={Boolean(busyAction) || !accounts.length}><Settings2 className="h-4 w-4" />{copy.save}</Button> : null}
                        </form>
                      );
                    })}

                    {dashboard.access.canManage && addable.length ? (
                      <form
                        onSubmit={(event) => {
                          event.preventDefault();
                          void saveMapping(provider, draftCurrency, draftAccountId);
                        }}
                        className="grid gap-3 rounded-xl border border-dashed border-dtsc-border bg-dtsc-surface p-3 sm:grid-cols-2"
                      >
                        <GuidedField label={copy.addCurrency} help={formCopy.configurationCurrencyHelp} required requiredLabel={formCopy.required}>
                          <TelcoSelect value={draftCurrency} onChange={(event) => { setExtraCurrency((current) => ({ ...current, [provider.id]: event.target.value })); setExtraAccount((current) => ({ ...current, [provider.id]: "" })); }} disabled={Boolean(busyAction)}>
                            {addable.map((currency) => <option key={currency} value={currency}>{currency}</option>)}
                          </TelcoSelect>
                        </GuidedField>
                        <GuidedField label={copy.operatorAccount} help={formCopy.configurationAccountHelp} required requiredLabel={formCopy.required}>
                          <TelcoSelect value={draftAccountId} onChange={(event) => setExtraAccount((current) => ({ ...current, [provider.id]: event.target.value }))} disabled={Boolean(busyAction)}>
                            <option value="">—</option>
                            {availableAccounts.map((account) => <option key={account.id} value={account.id}>{account.name} · {customerFacingFinancialAccountType(account.accountType, locale)}</option>)}
                          </TelcoSelect>
                        </GuidedField>
                        <Button className="sm:col-span-2 sm:w-fit" disabled={Boolean(busyAction) || !draftCurrency || !draftAccountId}><Settings2 className="h-4 w-4" />{copy.addAccount}</Button>
                      </form>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        ) : <EmptyState compact title={copy.noNetwork} description={copy.noNetworkDescription} />}
      </ModuleSection>
      <RetailErpLinks moduleCode="TELCO_TOPUPS" locale={locale} />
    </div>
  );
}
