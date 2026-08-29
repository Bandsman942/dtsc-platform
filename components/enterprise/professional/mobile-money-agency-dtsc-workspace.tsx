"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowRightLeft, CheckCircle2, RefreshCw, RotateCcw, Settings2, Smartphone, WalletCards } from "lucide-react";
import { useAppLocale } from "@/components/i18n/locale-provider";
import { formatEnterpriseDate } from "@/components/enterprise/core-v2/erp-v2-ui";
import { MobileMoneyCashSessionManager, type MobileMoneyCashSession } from "@/components/enterprise/professional/mobile-money-cash-session-manager";
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
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { BusinessList, BusinessListItem } from "@/components/workspace/business-list";
import { EmptyState } from "@/components/workspace/empty-state";
import { ModuleSection } from "@/components/workspace/module-workspace";
import { StatusBadge } from "@/components/workspace/status-badge";
import { notifyToast } from "@/lib/client-toast";
import { customerFacingError, customerFacingStatusLabel } from "@/lib/customer-facing-language";
import type { EnterpriseModuleDefinition } from "@/lib/enterprise/module-registry";
import { customerFacingFeeCollectionMode, customerFacingMobileMoneyTransactionType } from "@/lib/retail-customer-language";
import { translateRetailWorkspace } from "@/lib/i18n";

type CurrencyAccount = {
  id: string;
  code: string;
  name: string;
  currencyCode: string;
  operationalBalance: string | number;
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
  executionMode: "MANUAL" | "CONNECTED";
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

type MobileMoneyDashboard = RetailDashboard & { cashSessions?: MobileMoneyCashSession[] };

type OperationDraft = {
  providerCode: string;
  transactionType: "DEPOSIT" | "WITHDRAWAL";
  customerPhone: string;
  currencyCode: string;
  principalAmount: number;
  customerFeeAmount: number;
  providerCommissionAmount: number;
  feeCollectionMode: "NONE" | "CASH" | "PROVIDER";
  cashAccountId: string;
  floatAccountId: null;
  externalReference: string | null;
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

type ErrorKey = "till" | "provider" | "phone" | "principal" | "fee" | "commission" | "reference";
type FormErrors = Partial<Record<ErrorKey, string>>;

function GuidedField({ id, label, help, required, error, children }: { id?: string; label: string; help: string; required?: boolean; error?: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="mb-1.5 flex flex-wrap items-center gap-2">
        <label htmlFor={id} className="text-sm font-black text-dtsc-ink">{label}</label>
        {required ? <span className="rounded-full border border-dtsc-border px-2 py-0.5 text-[11px] font-black uppercase tracking-wide text-dtsc-muted">*</span> : null}
      </div>
      {children}
      <p className="mt-1 text-xs font-semibold leading-5 text-dtsc-muted">{help}</p>
      {error ? <p role="alert" className="mt-1 text-xs font-bold leading-5 text-rose-700 dark:text-rose-200">{error}</p> : null}
    </div>
  );
}

function MoneySelect({ children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`min-h-11 w-full min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-semibold text-dtsc-ink ${props.className || ""}`}>{children}</select>;
}

function firstError(errors: FormErrors) {
  return Object.values(errors).find(Boolean) || "";
}

export function MobileMoneyAgencyDtscWorkspace({ organizationId, organizationName, definition }: { organizationId: string; organizationName: string; definition: EnterpriseModuleDefinition }) {
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
    } catch (caught) {
      const message = customerFacingError(caught, locale, { fr: translateRetailWorkspace("fr", "retailActionError"), en: translateRetailWorkspace("en", "retailActionError") });
      setConfigurationError(message);
      notifyToast(message, "error");
    } finally {
      setConfigurationBusy(false);
    }
  }, [locale, organizationId]);

  useEffect(() => { void loadConfiguration(); }, [loadConfiguration]);

  return (
    <RetailWorkspaceFrame organizationId={organizationId} organizationName={organizationName} definition={definition} moduleCode="MOBILE_MONEY_AGENCY" locale={locale} includeConfigurationTab>
      {(context) => {
        const dashboard = context.dashboard as MobileMoneyDashboard;
        const reload = async () => { await loadConfiguration(); context.setRefreshKey((value) => value + 1); };
        if (context.tab === "HISTORY") return <MobileMoneyHistory organizationId={organizationId} dashboard={dashboard} locale={locale} busyAction={context.busyAction} mutate={context.mutate} />;
        if (context.tab === "CONFIG") return <MobileMoneyConfigurationPanel organizationId={organizationId} dashboard={dashboard} locale={locale} configuration={configuration} configurationBusy={configurationBusy} configurationError={configurationError} reload={reload} busyAction={context.busyAction} mutate={context.mutate} />;
        if (context.tab === "REPORTS") return <RetailReportsPanel dashboard={dashboard} moduleCode="MOBILE_MONEY_AGENCY" locale={locale} />;
        return <MobileMoneyOperate organizationId={organizationId} dashboard={dashboard} locale={locale} configuration={configuration} configurationBusy={configurationBusy} configurationError={configurationError} reload={reload} busyAction={context.busyAction} mutate={context.mutate} />;
      }}
    </RetailWorkspaceFrame>
  );
}

function MobileMoneyOperate({ organizationId, dashboard, locale, configuration, configurationBusy, configurationError, reload, busyAction, mutate }: { organizationId: string; dashboard: MobileMoneyDashboard; locale: "fr" | "en"; configuration: MobileMoneyConfiguration | null; configurationBusy: boolean; configurationError: string; reload: () => Promise<void>; busyAction: string | null; mutate: RetailMutation }) {
  const copy = locale === "en" ? {
    provider: "Mobile Money service",
    providerHelp: "Only active providers with a wallet mapped in the selected till currency are proposed.",
    wallet: "Provider wallet used",
    walletHelp: "Selected automatically from provider + till currency. The browser never chooses an arbitrary float; the server resolves it again.",
    operation: "Operation",
    operationHelp: "Deposit: customer gives cash and receives e-money. Withdrawal: customer gives e-money and receives cash.",
    phone: "Customer phone",
    phoneHelp: "Enter the customer number. The server normalizes and validates the country format before posting.",
    amount: "Customer amount",
    amountHelp: "Principal amount of the deposit or withdrawal in the selected till currency.",
    fee: "Customer fee",
    feeHelp: "Optional fee charged to the customer. Enter zero when there is no separate fee.",
    commission: "Provider commission",
    commissionHelp: "Commission recognized from the provider for this operation. Zero is allowed.",
    feeCollection: "Fee collection",
    feeCollectionHelp: "Shown only when a customer fee is entered. Specify where that fee is collected.",
    reference: "Operator reference",
    referenceHelp: "Required in manual mode. Copy the unique reference returned by the operator terminal/service.",
    mode: "Execution mode",
    manualMode: "Manual provider: record the external operator reference before confirmation.",
    connectedMode: "Connected provider: DTSC initiates the operation through the configured integration; the provider supplies the reference/status.",
    till: "Operation till",
    tillHelp: "The selected open till determines the operation currency. You can switch between open CDF/USD tills above.",
    review: "Review operation",
    reviewTitle: "Confirm Mobile Money operation",
    reviewDescription: "Review the till, wallet, provider, customer and financial amounts before writing the transaction.",
    edit: "Edit",
    confirm: "Confirm operation",
    processing: "Processing…",
    tillRequired: "Open and select a cash till before reviewing this Mobile Money operation.",
    providerRequired: "Choose a provider configured with a wallet in the selected till currency.",
    phoneInvalid: "Enter a valid customer phone number.",
    amountInvalid: "Enter a principal amount greater than zero.",
    feeInvalid: "The customer fee must be zero or a positive amount.",
    commissionInvalid: "The provider commission must be zero or a positive amount.",
    referenceRequired: "Enter the operator reference for this manual Mobile Money operation.",
    noWallet: "No provider wallet is configured in the selected till currency.",
    configureWallets: "Configure provider wallets",
    permissionReadOnly: "You can view this module, but your role cannot record a Mobile Money operation.",
    confirmed: "Mobile Money operation confirmed.",
    feeNone: "No separate fee",
    feeCash: "Fee collected in cash",
    feeProvider: "Fee handled by provider",
  } : {
    provider: "Service Mobile Money",
    providerHelp: "Seuls les opérateurs actifs ayant un wallet mappé dans la devise de la caisse sélectionnée sont proposés.",
    wallet: "Wallet opérateur utilisé",
    walletHelp: "Choisi automatiquement selon l’opérateur et la devise de la caisse. Le navigateur ne choisit jamais un float arbitraire; le serveur le résout à nouveau.",
    operation: "Opération",
    operationHelp: "Dépôt : le client remet du cash et reçoit de la monnaie électronique. Retrait : le client remet de la monnaie électronique et reçoit du cash.",
    phone: "Téléphone client",
    phoneHelp: "Saisissez le numéro du client. Le serveur normalise et valide le format pays avant comptabilisation.",
    amount: "Montant client",
    amountHelp: "Montant principal du dépôt ou du retrait dans la devise de la caisse sélectionnée.",
    fee: "Frais client",
    feeHelp: "Frais optionnels facturés au client. Saisissez zéro lorsqu’il n’y a pas de frais séparés.",
    commission: "Commission opérateur",
    commissionHelp: "Commission reconnue par l’opérateur pour cette opération. La valeur zéro est autorisée.",
    feeCollection: "Encaissement des frais",
    feeCollectionHelp: "Ce champ n’apparaît que lorsqu’un frais client est saisi. Indiquez où ce frais est encaissé.",
    reference: "Référence opérateur",
    referenceHelp: "Obligatoire en mode manuel. Recopiez la référence unique retournée par le terminal ou service opérateur.",
    mode: "Mode d’exécution",
    manualMode: "Opérateur manuel : la référence externe doit être enregistrée avant confirmation.",
    connectedMode: "Opérateur connecté : DTSC initie l’opération via l’intégration configurée; le provider fournit la référence et le statut.",
    till: "Caisse de l’opération",
    tillHelp: "La caisse ouverte sélectionnée détermine la devise. Vous pouvez basculer entre les caisses CDF/USD ouvertes au-dessus.",
    review: "Vérifier l’opération",
    reviewTitle: "Confirmer l’opération Mobile Money",
    reviewDescription: "Vérifiez la caisse, le wallet, l’opérateur, le client et les montants avant d’écrire la transaction.",
    edit: "Modifier",
    confirm: "Confirmer l’opération",
    processing: "Traitement…",
    tillRequired: "Ouvrez et sélectionnez une caisse avant de vérifier cette opération Mobile Money.",
    providerRequired: "Choisissez un opérateur configuré avec un wallet dans la devise de la caisse sélectionnée.",
    phoneInvalid: "Saisissez un numéro de téléphone client valide.",
    amountInvalid: "Saisissez un montant principal strictement supérieur à zéro.",
    feeInvalid: "Les frais client doivent être égaux ou supérieurs à zéro.",
    commissionInvalid: "La commission opérateur doit être égale ou supérieure à zéro.",
    referenceRequired: "Renseignez la référence opérateur de cette opération Mobile Money manuelle.",
    noWallet: "Aucun wallet opérateur n’est configuré dans la devise de la caisse sélectionnée.",
    configureWallets: "Configurer les wallets opérateur",
    permissionReadOnly: "Vous pouvez consulter ce module, mais votre rôle ne permet pas d’enregistrer une opération Mobile Money.",
    confirmed: "Opération Mobile Money confirmée.",
    feeNone: "Aucun frais séparé",
    feeCash: "Frais encaissés en cash",
    feeProvider: "Frais gérés par l’opérateur",
  };

  const sessions = useMemo(() => dashboard.cashSessions || (dashboard.cashSession ? [dashboard.cashSession as MobileMoneyCashSession] : []), [dashboard.cashSession, dashboard.cashSessions]);
  const openSessions = useMemo(() => sessions.filter((session) => session.status === "OPEN"), [sessions]);
  const [selectedCashSessionId, setSelectedCashSessionId] = useState("");
  const [providerCode, setProviderCode] = useState("");
  const [transactionType, setTransactionType] = useState<"DEPOSIT" | "WITHDRAWAL">("DEPOSIT");
  const [phone, setPhone] = useState("");
  const [principal, setPrincipal] = useState("");
  const [fee, setFee] = useState("0");
  const [commission, setCommission] = useState("0");
  const [feeCollection, setFeeCollection] = useState<"NONE" | "CASH" | "PROVIDER">("NONE");
  const [reference, setReference] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});
  const [pending, setPending] = useState<OperationDraft | null>(null);

  useEffect(() => {
    if (!openSessions.length) {
      if (selectedCashSessionId) setSelectedCashSessionId("");
      return;
    }
    if (!openSessions.some((session) => session.id === selectedCashSessionId)) setSelectedCashSessionId(openSessions[0].id);
  }, [openSessions, selectedCashSessionId]);

  const activeCash = openSessions.find((session) => session.id === selectedCashSessionId) || openSessions[0] || null;
  const currency = activeCash?.financialAccount.currencyCode || "";
  const eligibleProviders = useMemo(() => (configuration?.providers || []).filter((provider) => provider.accounts.some((mapping) => mapping.currencyCode === currency)), [configuration, currency]);
  const selectedProvider = eligibleProviders.find((provider) => provider.providerCode === providerCode) || null;
  const wallet = selectedProvider?.accounts.find((mapping) => mapping.currencyCode === currency)?.financialAccount || null;
  const manual = selectedProvider?.executionMode !== "CONNECTED";
  const numericFee = Number(fee);
  const hasFee = Number.isFinite(numericFee) && numericFee > 0;

  useEffect(() => {
    if (providerCode && !eligibleProviders.some((provider) => provider.providerCode === providerCode)) setProviderCode("");
    setPending(null);
    setErrors({});
  }, [currency, eligibleProviders, providerCode]);

  useEffect(() => {
    if (!hasFee && feeCollection !== "NONE") setFeeCollection("NONE");
    if (hasFee && feeCollection === "NONE") setFeeCollection("CASH");
  }, [feeCollection, hasFee]);

  function buildReview() {
    const nextErrors: FormErrors = {};
    const normalizedPhone = normalizePhonePreview(phone);
    const principalAmount = Number(principal);
    const customerFeeAmount = Number(fee);
    const providerCommissionAmount = Number(commission);
    if (!activeCash) nextErrors.till = copy.tillRequired;
    if (!selectedProvider || !wallet) nextErrors.provider = copy.providerRequired;
    if (normalizedPhone.length < 5) nextErrors.phone = copy.phoneInvalid;
    if (!Number.isFinite(principalAmount) || principalAmount <= 0) nextErrors.principal = copy.amountInvalid;
    if (!Number.isFinite(customerFeeAmount) || customerFeeAmount < 0) nextErrors.fee = copy.feeInvalid;
    if (!Number.isFinite(providerCommissionAmount) || providerCommissionAmount < 0) nextErrors.commission = copy.commissionInvalid;
    if (manual && reference.trim().length < 1) nextErrors.reference = copy.referenceRequired;
    setErrors(nextErrors);
    const message = firstError(nextErrors);
    if (message) {
      notifyToast(message, "error");
      setPending(null);
      return;
    }
    if (!activeCash || !selectedProvider || !wallet) return;
    setPending({
      providerCode: selectedProvider.providerCode,
      transactionType,
      customerPhone: normalizedPhone,
      currencyCode: activeCash.financialAccount.currencyCode,
      principalAmount,
      customerFeeAmount,
      providerCommissionAmount,
      feeCollectionMode: customerFeeAmount > 0 ? feeCollection : "NONE",
      cashAccountId: activeCash.financialAccount.id,
      floatAccountId: null,
      externalReference: manual ? reference.trim() : null,
    });
  }

  async function confirm() {
    if (!pending) return;
    const body = await mutate("mobile-money", `/api/enterprise/${organizationId}/retail/mobile-money`, pending, copy.confirmed);
    if (body) {
      setPending(null);
      setPhone("");
      setPrincipal("");
      setFee("0");
      setCommission("0");
      setReference("");
      setErrors({});
      await reload();
    }
  }

  return (
    <div className="grid min-w-0 gap-5">
      <MobileMoneyCashSessionManager organizationId={organizationId} accounts={dashboard.accounts} sessions={sessions} selectedSessionId={activeCash?.id || ""} onSelectSession={(sessionId) => { setSelectedCashSessionId(sessionId); setProviderCode(""); setPending(null); setErrors({}); }} locale={locale} busyAction={busyAction} mutate={mutate} reload={reload} />

      <ModuleSection title={translateRetailWorkspace(locale, "operatorMobileMoneyOperation")} description={translateRetailWorkspace(locale, "mobileMoneyOperationDescription")}>
        <form noValidate onSubmit={(event) => { event.preventDefault(); buildReview(); }} className="grid min-w-0 gap-5">
          <div className="grid min-w-0 gap-4 md:grid-cols-2">
            <GuidedField label={copy.provider} help={copy.providerHelp} required error={errors.provider}>
              <MoneySelect name="providerCode" value={providerCode} onChange={(event) => { setProviderCode(event.target.value); setReference(""); setPending(null); setErrors((current) => ({ ...current, provider: undefined, reference: undefined })); }} disabled={Boolean(busyAction) || configurationBusy || !activeCash}>
                <option value="">—</option>{eligibleProviders.map((provider) => <option key={provider.id} value={provider.providerCode}>{provider.label}</option>)}
              </MoneySelect>
            </GuidedField>

            <GuidedField label={copy.wallet} help={copy.walletHelp} required>
              <Input value={wallet ? `${wallet.name} · ${currency}` : "—"} readOnly />
            </GuidedField>

            <GuidedField label={copy.operation} help={copy.operationHelp} required>
              <MoneySelect name="transactionType" value={transactionType} onChange={(event) => { setTransactionType(event.target.value === "WITHDRAWAL" ? "WITHDRAWAL" : "DEPOSIT"); setPending(null); }} disabled={Boolean(busyAction)}>
                <option value="DEPOSIT">{customerFacingMobileMoneyTransactionType("DEPOSIT", locale)}</option><option value="WITHDRAWAL">{customerFacingMobileMoneyTransactionType("WITHDRAWAL", locale)}</option>
              </MoneySelect>
            </GuidedField>

            <GuidedField id="mobile-money-phone" label={copy.phone} help={copy.phoneHelp} required error={errors.phone}>
              <Input id="mobile-money-phone" value={phone} onChange={(event) => { setPhone(event.target.value); setPending(null); setErrors((current) => ({ ...current, phone: undefined })); }} inputMode="tel" placeholder={translateRetailWorkspace(locale, "operatorCountryCode")} disabled={Boolean(busyAction)} aria-invalid={Boolean(errors.phone)} />
            </GuidedField>

            <GuidedField id="mobile-money-principal" label={copy.amount} help={copy.amountHelp} required error={errors.principal}>
              <Input id="mobile-money-principal" value={principal} onChange={(event) => { setPrincipal(event.target.value); setPending(null); setErrors((current) => ({ ...current, principal: undefined })); }} type="number" min="0.01" step="0.01" disabled={Boolean(busyAction)} aria-invalid={Boolean(errors.principal)} />
            </GuidedField>

            <GuidedField id="mobile-money-fee" label={copy.fee} help={copy.feeHelp} error={errors.fee}>
              <Input id="mobile-money-fee" value={fee} onChange={(event) => { setFee(event.target.value); setPending(null); setErrors((current) => ({ ...current, fee: undefined })); }} type="number" min="0" step="0.01" disabled={Boolean(busyAction)} aria-invalid={Boolean(errors.fee)} />
            </GuidedField>

            <GuidedField id="mobile-money-commission" label={copy.commission} help={copy.commissionHelp} error={errors.commission}>
              <Input id="mobile-money-commission" value={commission} onChange={(event) => { setCommission(event.target.value); setPending(null); setErrors((current) => ({ ...current, commission: undefined })); }} type="number" min="0" step="0.01" disabled={Boolean(busyAction)} aria-invalid={Boolean(errors.commission)} />
            </GuidedField>

            {hasFee ? (
              <GuidedField label={copy.feeCollection} help={copy.feeCollectionHelp} required>
                <MoneySelect name="feeCollectionMode" value={feeCollection} onChange={(event) => { const value = event.target.value; setFeeCollection(value === "PROVIDER" ? "PROVIDER" : value === "CASH" ? "CASH" : "NONE"); setPending(null); }} disabled={Boolean(busyAction)}>
                  <option value="CASH">{copy.feeCash}</option><option value="PROVIDER">{copy.feeProvider}</option><option value="NONE">{copy.feeNone}</option>
                </MoneySelect>
              </GuidedField>
            ) : null}
          </div>

          {selectedProvider ? (
            <div className={`rounded-xl border p-3 text-sm font-semibold ${manual ? "border-dtsc-border bg-dtsc-page text-dtsc-muted" : "border-cyan-500/30 bg-cyan-500/10 text-dtsc-ink"}`}>
              <p className="font-black text-dtsc-ink">{copy.mode}: {manual ? "MANUAL" : "CONNECTED"}</p>
              <p className="mt-1 leading-5">{manual ? copy.manualMode : copy.connectedMode}</p>
            </div>
          ) : null}

          {manual && selectedProvider ? (
            <GuidedField id="mobile-money-reference" label={copy.reference} help={copy.referenceHelp} required error={errors.reference}>
              <Input id="mobile-money-reference" value={reference} onChange={(event) => { setReference(event.target.value); setPending(null); setErrors((current) => ({ ...current, reference: undefined })); }} maxLength={160} disabled={Boolean(busyAction)} aria-invalid={Boolean(errors.reference)} />
            </GuidedField>
          ) : null}

          <div className="rounded-xl border border-dtsc-border bg-dtsc-page p-3 text-sm font-semibold text-dtsc-muted">
            <p className="font-black text-dtsc-ink">{copy.till}: {activeCash ? `${activeCash.financialAccount.name} · ${currency}` : "—"}</p>
            <p className="mt-1 leading-5">{copy.tillHelp}</p>
            {errors.till ? <p role="alert" className="mt-2 font-bold text-rose-700 dark:text-rose-200">{errors.till}</p> : null}
          </div>

          {activeCash && configuration && !eligibleProviders.length ? <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm font-bold text-amber-800 dark:text-amber-200">{copy.noWallet} <Link href="#mobile-money-wallet-configuration" className="underline">{copy.configureWallets}</Link></div> : null}
          {configurationError ? <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm font-bold text-rose-700 dark:text-rose-200">{configurationError}</div> : null}
          {!dashboard.access.canWrite ? <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm font-bold text-amber-800 dark:text-amber-200">{copy.permissionReadOnly}</div> : null}
          <Button className="w-fit" disabled={Boolean(busyAction) || configurationBusy || !dashboard.access.canWrite}><Smartphone className="h-4 w-4" />{copy.review}</Button>
        </form>
      </ModuleSection>

      <MobileMoneyFxPanel organizationId={organizationId} locale={locale} configuration={configuration} busyAction={busyAction} mutate={mutate} reload={reload} />
      <RetailErpLinks moduleCode="MOBILE_MONEY_AGENCY" locale={locale} />

      <Dialog open={Boolean(pending)} title={copy.reviewTitle} description={copy.reviewDescription} onClose={() => { if (busyAction !== "mobile-money") setPending(null); }} presentation="editor" className="h-[96dvh] max-w-3xl" footer={<><Button type="button" variant="outline" disabled={busyAction === "mobile-money"} onClick={() => setPending(null)}>{copy.edit}</Button><Button type="button" disabled={!pending || busyAction === "mobile-money"} onClick={() => void confirm()}><CheckCircle2 className="h-4 w-4" />{busyAction === "mobile-money" ? copy.processing : copy.confirm}</Button></>}>
        {pending ? <div className="grid min-w-0 gap-4 p-4 sm:p-5"><div className="rounded-2xl border-2 border-amber-400/50 bg-amber-500/10 p-4"><p className="text-xs font-black uppercase tracking-[0.12em] text-dtsc-muted">{selectedProvider?.label || copy.provider}</p><p className="mt-2 text-2xl font-black text-dtsc-ink">{customerFacingMobileMoneyTransactionType(pending.transactionType, locale)} · {moneyValue(pending.principalAmount, pending.currencyCode, locale)}</p><p className="mt-1 text-sm font-bold text-dtsc-muted">{pending.customerPhone}</p></div><div className="grid gap-3 sm:grid-cols-2"><ReviewItem label={copy.till} value={`${activeCash?.financialAccount.name || "—"} · ${pending.currencyCode}`} /><ReviewItem label={copy.wallet} value={`${wallet?.name || "—"} · ${pending.currencyCode}`} /><ReviewItem label={copy.fee} value={moneyValue(pending.customerFeeAmount, pending.currencyCode, locale)} /><ReviewItem label={copy.commission} value={moneyValue(pending.providerCommissionAmount, pending.currencyCode, locale)} /><ReviewItem label={copy.feeCollection} value={customerFacingFeeCollectionMode(pending.feeCollectionMode, locale)} /><ReviewItem label={copy.mode} value={manual ? "MANUAL" : "CONNECTED"} />{pending.externalReference ? <ReviewItem label={copy.reference} value={pending.externalReference} /> : null}</div></div> : null}
      </Dialog>
    </div>
  );
}

function ReviewItem({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-dtsc-border bg-dtsc-page p-3"><p className="text-xs font-black uppercase tracking-[0.08em] text-dtsc-muted">{label}</p><p className="mt-1 break-words text-sm font-black text-dtsc-ink">{value}</p></div>;
}

function MobileMoneyFxPanel({ organizationId, locale, configuration, busyAction, mutate, reload }: { organizationId: string; locale: "fr" | "en"; configuration: MobileMoneyConfiguration | null; busyAction: string | null; mutate: RetailMutation; reload: () => Promise<void> }) {
  const providers = (configuration?.providers || []).filter((provider) => provider.accounts.length >= 2);
  const [providerCode, setProviderCode] = useState("");
  const [sourceCurrency, setSourceCurrency] = useState("");
  const [targetCurrency, setTargetCurrency] = useState("");
  const [sourceAmount, setSourceAmount] = useState("");
  const [preview, setPreview] = useState<FxPreview | null>(null);
  const [error, setError] = useState("");
  const [previewBusy, setPreviewBusy] = useState(false);
  const provider = providers.find((item) => item.providerCode === providerCode) || providers[0] || null;
  const currencies = useMemo(() => provider?.accounts.map((account) => account.currencyCode) || [], [provider]);
  const copy = locale === "en" ? { title: "Mobile Money currency transfer", description: "Preview the enterprise exchange rate before moving value between two wallets of the same provider.", provider: "Provider", providerHelp: "Only providers with at least two mapped currencies are proposed.", source: "Source currency", target: "Target currency", amount: "Source amount", amountHelp: "Enter the amount to debit from the source wallet.", preview: "Preview transfer", invalid: "Choose two different currencies and enter an amount greater than zero.", failed: "The exchange-rate preview is unavailable. Check Finance exchange rates and retry.", configure: "Configure exchange rates", rate: "Rate", available: "Available", confirm: "Confirm transfer", success: "Mobile Money currency transfer confirmed.", insufficient: "The source wallet balance is insufficient.", processing: "Processing…", edit: "Edit" } : { title: "Transfert de devise Mobile Money", description: "Prévisualisez le taux de change de l’entreprise avant de déplacer de la valeur entre deux wallets du même opérateur.", provider: "Opérateur", providerHelp: "Seuls les opérateurs ayant au moins deux devises mappées sont proposés.", source: "Devise source", target: "Devise cible", amount: "Montant source", amountHelp: "Saisissez le montant à débiter du wallet source.", preview: "Prévisualiser le transfert", invalid: "Choisissez deux devises différentes et saisissez un montant strictement supérieur à zéro.", failed: "La prévisualisation du taux de change est indisponible. Vérifiez les taux Finance puis réessayez.", configure: "Configurer les taux de change", rate: "Taux", available: "Disponible", confirm: "Confirmer le transfert", success: "Transfert de devise Mobile Money confirmé.", insufficient: "Le solde du wallet source est insuffisant.", processing: "Traitement…", edit: "Modifier" };

  useEffect(() => {
    if (!provider) return;
    const source = sourceCurrency && currencies.includes(sourceCurrency) ? sourceCurrency : currencies[0] || "";
    const target = targetCurrency && currencies.includes(targetCurrency) && targetCurrency !== source ? targetCurrency : currencies.find((currency) => currency !== source) || "";
    if (providerCode !== provider.providerCode) setProviderCode(provider.providerCode);
    if (sourceCurrency !== source) setSourceCurrency(source);
    if (targetCurrency !== target) setTargetCurrency(target);
  }, [currencies, provider, providerCode, sourceCurrency, targetCurrency]);

  async function requestPreview() {
    const amount = Number(sourceAmount);
    if (!provider || !sourceCurrency || !targetCurrency || sourceCurrency === targetCurrency || !Number.isFinite(amount) || amount <= 0) { setError(copy.invalid); notifyToast(copy.invalid, "error"); setPreview(null); return; }
    setPreviewBusy(true); setError(""); setPreview(null);
    try {
      const query = new URLSearchParams({ providerCode: provider.providerCode, sourceCurrencyCode: sourceCurrency, targetCurrencyCode: targetCurrency, sourceAmount: String(amount) });
      const response = await fetch(`/api/enterprise/${organizationId}/retail/mobile-money/fx?${query.toString()}`, { cache: "no-store" });
      const body = await response.json().catch(() => null) as { preview?: FxPreview; message?: string; error?: string } | null;
      if (!response.ok || !body?.preview) throw new Error(body?.message || body?.error || copy.failed);
      setPreview(body.preview);
    } catch (caught) {
      const message = customerFacingError(caught, locale, { fr: copy.failed, en: copy.failed });
      setError(message); notifyToast(message, "error");
    } finally { setPreviewBusy(false); }
  }

  async function confirmTransfer() {
    if (!preview) return;
    const result = await mutate("mobile-money-fx", `/api/enterprise/${organizationId}/retail/mobile-money/fx`, { providerCode: preview.providerCode, sourceCurrencyCode: preview.sourceCurrencyCode, targetCurrencyCode: preview.targetCurrencyCode, sourceAmount: Number(preview.sourceAmount) }, copy.success);
    if (result) { setPreview(null); setSourceAmount(""); setError(""); await reload(); }
  }

  return (
    <ModuleSection title={copy.title} description={copy.description}>
      {!providers.length ? <div className="rounded-xl border border-dtsc-border bg-dtsc-page p-4 text-sm font-semibold text-dtsc-muted">{locale === "en" ? "Configure at least two currencies for one provider to enable transfers." : "Configurez au moins deux devises pour un opérateur afin d’activer les transferts."}</div> : (
        <form noValidate onSubmit={(event) => { event.preventDefault(); void requestPreview(); }} className="grid gap-4 md:grid-cols-2">
          <GuidedField label={copy.provider} help={copy.providerHelp} required><MoneySelect value={provider?.providerCode || ""} onChange={(event) => { setProviderCode(event.target.value); setPreview(null); setError(""); }}>{providers.map((item) => <option key={item.id} value={item.providerCode}>{item.label}</option>)}</MoneySelect></GuidedField>
          <div className="hidden md:block" />
          <GuidedField label={copy.source} help={copy.amountHelp} required><MoneySelect value={sourceCurrency} onChange={(event) => { setSourceCurrency(event.target.value); setPreview(null); setError(""); }}>{currencies.map((currency) => <option key={currency} value={currency}>{currency}</option>)}</MoneySelect></GuidedField>
          <GuidedField label={copy.target} help={copy.amountHelp} required><MoneySelect value={targetCurrency} onChange={(event) => { setTargetCurrency(event.target.value); setPreview(null); setError(""); }}>{currencies.filter((currency) => currency !== sourceCurrency).map((currency) => <option key={currency} value={currency}>{currency}</option>)}</MoneySelect></GuidedField>
          <GuidedField id="mobile-money-fx-amount" label={copy.amount} help={copy.amountHelp} required error={error}><Input id="mobile-money-fx-amount" value={sourceAmount} onChange={(event) => { setSourceAmount(event.target.value); setPreview(null); setError(""); }} type="number" min="0.01" step="0.01" disabled={previewBusy || Boolean(busyAction)} /></GuidedField>
          <div className="flex items-end"><Button disabled={previewBusy || Boolean(busyAction)}><ArrowRightLeft className="h-4 w-4" />{previewBusy ? copy.processing : copy.preview}</Button></div>
          {error ? <div role="alert" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm font-bold text-amber-800 dark:text-amber-200 md:col-span-2"><p>{error}</p><Link className="mt-2 inline-flex underline" href="/enterprise-modules/FINANCE_TREASURY/exchange-rates">{copy.configure}</Link></div> : null}
        </form>
      )}

      <Dialog open={Boolean(preview)} title={copy.title} description={copy.description} onClose={() => { if (busyAction !== "mobile-money-fx") setPreview(null); }} presentation="editor" className="h-[96dvh] max-w-3xl" footer={<><Button type="button" variant="outline" disabled={busyAction === "mobile-money-fx"} onClick={() => setPreview(null)}>{copy.edit}</Button><Button type="button" disabled={!preview?.sufficientBalance || busyAction === "mobile-money-fx"} onClick={() => void confirmTransfer()}><CheckCircle2 className="h-4 w-4" />{busyAction === "mobile-money-fx" ? copy.processing : copy.confirm}</Button></>}>
        {preview ? <div className="grid gap-4 p-4 sm:p-5"><div className="rounded-2xl border-2 border-cyan-500/30 bg-cyan-500/10 p-4"><p className="text-2xl font-black text-dtsc-ink">{moneyValue(Number(preview.sourceAmount), preview.sourceCurrencyCode, locale)} → {moneyValue(Number(preview.targetAmount), preview.targetCurrencyCode, locale)}</p><p className="mt-1 text-sm font-semibold text-dtsc-muted">{preview.providerLabel}</p></div><div className="grid gap-3 sm:grid-cols-2"><ReviewItem label={copy.rate} value={`1 ${preview.sourceCurrencyCode} = ${Number(preview.rate).toLocaleString(locale === "en" ? "en-US" : "fr-FR", { maximumFractionDigits: 6 })} ${preview.targetCurrencyCode}`} /><ReviewItem label={copy.available} value={moneyValue(Number(preview.sourceAvailableBalance), preview.sourceCurrencyCode, locale)} /><ReviewItem label={translateRetailWorkspace(locale, "mobileMoneyRate") } value={`${formatEnterpriseDate(preview.rateDate, locale)} · ${preview.rateSource}`} /></div>{!preview.sufficientBalance ? <p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm font-bold text-rose-700 dark:text-rose-200">{copy.insufficient}</p> : null}</div> : null}
      </Dialog>
    </ModuleSection>
  );
}

function MobileMoneyConfigurationPanel({ organizationId, dashboard, locale, configuration, configurationBusy, configurationError, reload, busyAction, mutate }: { organizationId: string; dashboard: MobileMoneyDashboard; locale: "fr" | "en"; configuration: MobileMoneyConfiguration | null; configurationBusy: boolean; configurationError: string; reload: () => Promise<void>; busyAction: string | null; mutate: RetailMutation }) {
  const copy = locale === "en" ? { title: "Provider wallets by currency", description: "Map each provider/currency to a real active Mobile Money financial account. The server uses this canonical mapping for operations.", required: "Required in this country", minimum: "Configure at least two currencies per active provider.", currencies: "currencies configured", ready: "Ready", incomplete: "To complete", account: "Mobile Money financial account", accountHelp: "Only active Mobile Money accounts from this company and this currency are proposed.", save: "Save", saved: "Provider wallet saved.", addCurrency: "Add currency", currencyHelp: "Choose an additional currency available in the enterprise finance configuration.", add: "Add wallet", choose: "Choose a financial account before saving this wallet mapping.", refresh: "Refresh", mode: "Mode" } : { title: "Wallets opérateur par devise", description: "Associez chaque opérateur/devise à un vrai compte financier Mobile Money actif. Le serveur utilise ce mapping canonique pour les opérations.", required: "Obligatoire dans ce pays", minimum: "Configurez au moins deux devises par opérateur actif.", currencies: "devises configurées", ready: "Prêt", incomplete: "À compléter", account: "Compte financier Mobile Money", accountHelp: "Seuls les comptes Mobile Money actifs de cette entreprise et de cette devise sont proposés.", save: "Enregistrer", saved: "Wallet opérateur enregistré.", addCurrency: "Ajouter une devise", currencyHelp: "Choisissez une devise supplémentaire disponible dans la configuration financière de l’entreprise.", add: "Ajouter le wallet", choose: "Choisissez un compte financier avant d’enregistrer ce mapping de wallet.", refresh: "Actualiser", mode: "Mode" };
  const [extraCurrency, setExtraCurrency] = useState<Record<string, string>>({});
  const [extraAccount, setExtraAccount] = useState<Record<string, string>>({});

  async function save(provider: ProviderConfiguration, currencyCode: string, financialAccountId: string) {
    if (!financialAccountId) { notifyToast(copy.choose, "error"); return; }
    const body = await mutate(`mobile-wallet-${provider.id}-${currencyCode}`, `/api/enterprise/${organizationId}/retail/mobile-money/accounts`, { providerCode: provider.providerCode, currencyCode, financialAccountId }, copy.saved, { idempotent: false });
    if (body) { setExtraAccount((current) => ({ ...current, [provider.id]: "" })); await reload(); }
  }

  if (configurationBusy && !configuration) return <div className="rounded-xl border border-dtsc-border bg-dtsc-page p-4 text-sm font-semibold text-dtsc-muted">{translateRetailWorkspace(locale, "processing")}</div>;
  if (configurationError && !configuration) return <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm font-bold text-rose-700 dark:text-rose-200">{configurationError}</div>;
  if (!configuration) return null;

  return (
    <div id="mobile-money-wallet-configuration" className="grid min-w-0 gap-5">
      <ModuleSection title={copy.title} description={copy.description}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dtsc-border bg-dtsc-page p-3"><p className="text-sm font-semibold text-dtsc-muted">{configuration.requiredCurrencies.length ? `${copy.required}: ${configuration.requiredCurrencies.join(" + ")}` : copy.minimum}</p><Button size="sm" variant="outline" type="button" disabled={configurationBusy} onClick={() => void reload()}><RefreshCw className="h-4 w-4" />{copy.refresh}</Button></div>
        <div className="grid min-w-0 gap-4 lg:grid-cols-2">
          {configuration.providers.map((provider) => {
            const mappedCurrencies = provider.accounts.map((mapping) => mapping.currencyCode);
            const fixedCurrencies = configuration.requiredCurrencies.length ? Array.from(new Set([...configuration.requiredCurrencies, ...mappedCurrencies])) : mappedCurrencies;
            const addable = configuration.availableCurrencies.filter((currency) => !fixedCurrencies.includes(currency));
            const draftCurrency = extraCurrency[provider.id] || addable[0] || "";
            const draftAccountId = extraAccount[provider.id] || "";
            const availableAccounts = configuration.financialAccounts.filter((account) => account.currencyCode === draftCurrency);
            return <article key={provider.id} className="min-w-0 rounded-2xl border border-dtsc-border bg-dtsc-page p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="break-words text-lg font-black text-dtsc-ink">{provider.label}</p><p className="text-xs font-bold text-dtsc-muted">{provider.mappedCurrencyCount} {copy.currencies} · {copy.mode}: {provider.executionMode}</p></div><StatusBadge tone={provider.ready ? "success" : "warning"}>{provider.ready ? copy.ready : copy.incomplete}</StatusBadge></div><div className="mt-4 grid gap-3">{fixedCurrencies.map((currencyCode) => { const mapping = provider.accounts.find((item) => item.currencyCode === currencyCode); const accounts = configuration.financialAccounts.filter((account) => account.currencyCode === currencyCode); return <WalletMappingRow key={currencyCode} provider={provider} currencyCode={currencyCode} mapping={mapping || null} accounts={accounts} canManage={dashboard.access.canManage} busy={Boolean(busyAction)} locale={locale} onSave={save} copy={copy} />; })}{dashboard.access.canManage && addable.length ? <div className="rounded-xl border border-dashed border-dtsc-border p-3"><p className="mb-2 text-xs font-black uppercase tracking-wide text-dtsc-muted">{copy.addCurrency}</p><div className="grid gap-3 sm:grid-cols-[0.45fr_minmax(0,1fr)_auto] sm:items-end"><GuidedField label={copy.addCurrency} help={copy.currencyHelp} required><MoneySelect value={draftCurrency} onChange={(event) => { setExtraCurrency((current) => ({ ...current, [provider.id]: event.target.value })); setExtraAccount((current) => ({ ...current, [provider.id]: "" })); }}>{addable.map((currency) => <option key={currency} value={currency}>{currency}</option>)}</MoneySelect></GuidedField><GuidedField label={copy.account} help={copy.accountHelp} required><MoneySelect value={draftAccountId} onChange={(event) => setExtraAccount((current) => ({ ...current, [provider.id]: event.target.value }))}><option value="">—</option>{availableAccounts.map((account) => <option key={account.id} value={account.id}>{account.name} · {account.code}</option>)}</MoneySelect></GuidedField><Button type="button" disabled={Boolean(busyAction)} onClick={() => void save(provider, draftCurrency, draftAccountId)}><WalletCards className="h-4 w-4" />{copy.add}</Button></div></div> : null}</div></article>;
          })}
        </div>
      </ModuleSection>
      <RetailErpLinks moduleCode="MOBILE_MONEY_AGENCY" locale={locale} />
    </div>
  );
}

function WalletMappingRow({ provider, currencyCode, mapping, accounts, canManage, busy, locale, onSave, copy }: { provider: ProviderConfiguration; currencyCode: string; mapping: ProviderMapping | null; accounts: CurrencyAccount[]; canManage: boolean; busy: boolean; locale: "fr" | "en"; onSave: (provider: ProviderConfiguration, currencyCode: string, accountId: string) => Promise<void>; copy: { account: string; accountHelp: string; save: string; incomplete: string } }) {
  const [accountId, setAccountId] = useState(mapping?.financialAccountId || "");
  useEffect(() => setAccountId(mapping?.financialAccountId || ""), [mapping?.financialAccountId]);
  return <div className="rounded-xl border border-dtsc-border bg-dtsc-surface p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><StatusBadge tone={mapping ? "success" : "warning"}>{currencyCode}</StatusBadge><div><p className="text-sm font-black text-dtsc-ink">{mapping?.financialAccount.name || copy.incomplete}</p>{mapping ? <p className="text-xs font-semibold text-dtsc-muted">{moneyValue(Number(mapping.financialAccount.operationalBalance), currencyCode, locale)}</p> : null}</div></div><StatusBadge tone={mapping ? "success" : "warning"}>{mapping ? "OK" : copy.incomplete}</StatusBadge></div>{canManage ? <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"><GuidedField label={`${copy.account} · ${currencyCode}`} help={copy.accountHelp} required><MoneySelect value={accountId} onChange={(event) => setAccountId(event.target.value)} disabled={busy}><option value="">—</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name} · {account.code}</option>)}</MoneySelect></GuidedField><Button type="button" disabled={busy || !accountId || accountId === mapping?.financialAccountId} onClick={() => void onSave(provider, currencyCode, accountId)}><Settings2 className="h-4 w-4" />{copy.save}</Button></div> : null}</div>;
}

function MobileMoneyHistory({ organizationId, dashboard, locale, busyAction, mutate }: { organizationId: string; dashboard: MobileMoneyDashboard; locale: "fr" | "en"; busyAction: string | null; mutate: RetailMutation }) {
  const items = dashboard.recent.mobileMoney || [];
  const copy = locale === "en" ? { title: "Mobile Money history", no: "No Mobile Money operation", noDescription: "Recorded operations and currency transfers will appear here.", reference: "Operator reference", reverse: "Reverse", reason: "Reversal reason", reasonHelp: "Explain the business reason. The original transaction remains in the audit history.", reasonRequired: "Enter a reversal reason of at least 3 characters.", cancel: "Cancel", confirm: "Confirm reversal", processing: "Processing…", reversed: "Mobile Money operation reversed.", accountingRetry: "Finalize accounting", accountingFinalized: "Mobile Money accounting finalized." } : { title: "Historique Mobile Money", no: "Aucune opération Mobile Money", noDescription: "Les opérations et transferts de devise enregistrés apparaîtront ici.", reference: "Référence opérateur", reverse: "Contrepasser", reason: "Motif de contrepassation", reasonHelp: "Expliquez la raison métier. La transaction originale reste conservée dans l’historique d’audit.", reasonRequired: "Saisissez un motif de contrepassation d’au moins 3 caractères.", cancel: "Annuler", confirm: "Confirmer la contrepassation", processing: "Traitement…", reversed: "Opération Mobile Money contrepassée.", accountingRetry: "Finaliser la comptabilisation", accountingFinalized: "Comptabilisation Mobile Money finalisée." };
  const [target, setTarget] = useState<{ id: string; revision: number; number: string } | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");

  function close() { if (target && busyAction === `reverse-${target.id}`) return; setTarget(null); setReason(""); setError(""); }
  async function confirmReverse() { if (!target) return; const normalized = reason.trim(); if (normalized.length < 3) { setError(copy.reasonRequired); notifyToast(copy.reasonRequired, "error"); return; } setError(""); const result = await mutate(`reverse-${target.id}`, `/api/enterprise/${organizationId}/retail/mobile-money/${target.id}/reverse`, { revision: target.revision, reason: normalized }, copy.reversed, { idempotent: false }); if (result) close(); }

  return <div className="grid min-w-0 gap-5"><ModuleSection title={copy.title}>{items.length ? <BusinessList ariaLabel={copy.title}>{items.map((item) => { const isFx = item.transactionType.startsWith("FX_CONVERSION_"); const isFxPending = item.transactionType.startsWith("FX_CONVERSION_PENDING:"); const accountingAction = `fx-accounting-${item.id}`; return <BusinessListItem key={item.id} title={`${item.number} · ${providerLabel(dashboard, item.providerCode)}`} status={<StatusBadge tone={statusTone(item.status)}>{customerFacingStatusLabel(item.status, locale)}</StatusBadge>} meta={`${customerFacingMobileMoneyTransactionType(item.transactionType, locale)} · ${moneyValue(item.principalAmount, item.currencyCode, locale)} · ${formatEnterpriseDate(item.occurredAt, locale)}`} description={isFx ? `${item.customerPhoneMasked || "—"} · ${item.externalReference || "—"}` : `${item.customerPhoneMasked || "—"} · ${copy.reference}: ${item.externalReference || "—"}`} actions={dashboard.access.canManage && isFxPending ? <Button size="sm" variant="outline" disabled={Boolean(busyAction)} onClick={() => void mutate(accountingAction, `/api/enterprise/${organizationId}/retail/mobile-money/fx/${item.id}/accounting`, {}, copy.accountingFinalized, { idempotent: false })}><RefreshCw className="h-4 w-4" />{busyAction === accountingAction ? copy.processing : copy.accountingRetry}</Button> : dashboard.access.canManage && item.status === "CONFIRMED" && !isFx ? <Button size="sm" variant="outline" disabled={Boolean(busyAction)} onClick={() => { setTarget({ id: item.id, revision: item.revision, number: item.number }); setReason(""); setError(""); }}><RotateCcw className="h-4 w-4" />{copy.reverse}</Button> : undefined} />; })}</BusinessList> : <EmptyState compact title={copy.no} description={copy.noDescription} />}</ModuleSection><RetailErpLinks moduleCode="MOBILE_MONEY_AGENCY" locale={locale} /><Dialog open={Boolean(target)} title={`${copy.reverse} · ${target?.number || ""}`} description={copy.reasonHelp} onClose={close} className="max-w-xl" footer={<><Button type="button" variant="outline" disabled={Boolean(target && busyAction === `reverse-${target.id}`)} onClick={close}>{copy.cancel}</Button><Button type="button" disabled={!target || Boolean(target && busyAction === `reverse-${target.id}`)} onClick={() => void confirmReverse()}><RotateCcw className="h-4 w-4" />{target && busyAction === `reverse-${target.id}` ? copy.processing : copy.confirm}</Button></>}><GuidedField id="mobile-money-reversal-reason" label={copy.reason} help={copy.reasonHelp} required error={error}><textarea id="mobile-money-reversal-reason" value={reason} onChange={(event) => { setReason(event.currentTarget.value); if (error) setError(""); }} minLength={3} maxLength={500} disabled={Boolean(target && busyAction === `reverse-${target.id}`)} className="min-h-32 w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-sm text-dtsc-ink outline-none focus-visible:ring-2 focus-visible:ring-cyan-300" /></GuidedField></Dialog></div>;
}
