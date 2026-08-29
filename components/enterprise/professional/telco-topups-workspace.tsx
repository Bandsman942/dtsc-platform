"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { CheckCircle2, RadioTower, RotateCcw, Settings2 } from "lucide-react";
import { useAppLocale } from "@/components/i18n/locale-provider";
import { formatEnterpriseDate } from "@/components/enterprise/core-v2/erp-v2-ui";
import {
  MobileMoneyCashSessionManager as RetailMultiCashSessionManager,
  type MobileMoneyCashSession as OperatorCashSession,
} from "@/components/enterprise/professional/mobile-money-cash-session-manager";
import {
  RetailErpLinks,
  RetailReportsPanel,
  RetailWorkspaceFrame,
  Select,
  moneyValue,
  normalizePhonePreview,
  providerLabel,
  statusTone,
  type CatalogItem,
  type FinancialAccount,
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
import { customerFacingFinancialAccountType, customerFacingStatusLabel } from "@/lib/customer-facing-language";
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
  cashSessions?: OperatorCashSession[];
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

type FormErrorKey = "payment" | "provider" | "phone" | "offer" | "saleAmount" | "operatorCost" | "reference" | "failureReason";
type FormErrors = Partial<Record<FormErrorKey, string>>;

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

function firstError(errors: FormErrors) {
  return Object.values(errors).find(Boolean) || "";
}

export function TelcoTopupsWorkspace({ organizationId, organizationName, definition }: { organizationId: string; organizationName: string; definition: EnterpriseModuleDefinition }) {
  const locale: "fr" | "en" = useAppLocale() === "en" ? "en" : "fr";
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
        if (context.tab === "HISTORY") return <TelcoHistory organizationId={organizationId} dashboard={dashboard} locale={locale} busyAction={context.busyAction} mutate={context.mutate} />;
        if (context.tab === "CONFIG") return <TelcoProviderConfigurationPanel organizationId={organizationId} dashboard={dashboard} locale={locale} busyAction={context.busyAction} mutate={context.mutate} />;
        if (context.tab === "REPORTS") return <RetailReportsPanel dashboard={dashboard} moduleCode="TELCO_TOPUPS" locale={locale} />;
        return <TelcoOperate organizationId={organizationId} dashboard={dashboard} locale={locale} busyAction={context.busyAction} mutate={context.mutate} reload={async () => context.setRefreshKey((value) => value + 1)} />;
      }}
    </RetailWorkspaceFrame>
  );
}

function TelcoOperate({ organizationId, dashboard, locale, busyAction, mutate, reload }: { organizationId: string; dashboard: TelcoDashboard; locale: "fr" | "en"; busyAction: string | null; mutate: RetailMutation; reload: () => Promise<void> }) {
  const copy = locale === "en" ? {
    paymentMethod: "Payment method",
    paymentMethodHelp: "Cash uses the selected open till. Other methods use an active financial account from this company.",
    cashTill: "Cash till",
    otherAccount: "Other financial account",
    paymentAccount: "Payment account & currency",
    paymentAccountHelp: "This account determines the operation currency and therefore the eligible network/operator account.",
    network: "Telecom network",
    networkHelp: "Only active networks with an operator account mapped in the selected currency are proposed.",
    operatorAccount: "Operator account used",
    operatorAccountHelp: "Selected automatically from the network and operation currency; the server resolves it again before posting.",
    phone: "Destination phone",
    phoneHelp: "Enter the customer number. The server normalizes and validates the country format before sending the top-up.",
    catalogOffer: "Catalog offer (optional)",
    catalogHelp: "Choose an existing catalog offer to prefill its label, sale price and operator cost. Leave empty for an ad-hoc offer.",
    offerLabel: "Offer label",
    offerHelp: "Required only when no catalog offer is selected.",
    saleAmount: "Sale price",
    saleAmountHelp: "Amount charged to the customer in the selected payment-account currency.",
    operatorCost: "Operator cost",
    operatorCostHelp: "Cost debited from the operator float. It cannot exceed the sale price.",
    mode: "Execution mode",
    connectedMode: "Connected provider: DTSC sends the request to the configured integration. Provider status and reference are authoritative.",
    manualMode: "Manual provider: record the operator result and reference exactly as shown by the external terminal/service.",
    status: "Execution status",
    statusHelp: "Manual mode only. Choose success after the provider confirms the top-up, or failure if it did not complete.",
    reference: "Operator reference",
    referenceHelp: "Required for a successful manual top-up. Use the unique reference returned by the operator.",
    failureReason: "Failure reason",
    failureHelp: "Required only for a failed manual top-up. Explain what happened so the record remains actionable.",
    operationalCurrency: "Operational currency",
    review: "Review top-up",
    reviewTitle: "Confirm telecom top-up",
    reviewDescription: "Review all financial and operator details before writing the transaction.",
    edit: "Edit",
    confirm: "Confirm top-up",
    processing: "Processing…",
    noPayment: "Select an available payment account before continuing.",
    noProvider: "Select a telecom network configured in the payment currency.",
    invalidPhone: "Enter a valid destination phone number.",
    invalidOffer: "Choose a catalog offer or enter an offer label of at least 2 characters.",
    invalidSaleAmount: "Enter a sale price greater than zero.",
    invalidOperatorCost: "Enter an operator cost between zero and the sale price.",
    referenceRequired: "Enter the operator reference for this successful manual top-up.",
    failureReasonRequired: "Explain the failed top-up with at least 3 characters.",
    noNetworks: "No network has an operator account configured in this currency.",
    configure: "Configure operator accounts",
    margin: "Margin",
    catalogAutomatic: "The selected catalog offer prefills the commercial values; you can adjust them before review when your permissions and business process allow it.",
    permissionReadOnly: "You can view this module, but your role cannot record a top-up.",
    recorded: "Top-up recorded in the selected currency.",
  } : {
    paymentMethod: "Mode d’encaissement",
    paymentMethodHelp: "Le cash utilise la caisse ouverte sélectionnée. Les autres modes utilisent un compte financier actif de cette entreprise.",
    cashTill: "Caisse cash",
    otherAccount: "Autre compte financier",
    paymentAccount: "Compte d’encaissement & devise",
    paymentAccountHelp: "Ce compte détermine la devise de l’opération et donc le réseau ainsi que le compte opérateur éligibles.",
    network: "Réseau Télécom",
    networkHelp: "Seuls les réseaux actifs ayant un compte opérateur mappé dans la devise sélectionnée sont proposés.",
    operatorAccount: "Compte opérateur utilisé",
    operatorAccountHelp: "Choisi automatiquement selon le réseau et la devise; le serveur le résout à nouveau avant comptabilisation.",
    phone: "Téléphone destinataire",
    phoneHelp: "Saisissez le numéro du client. Le serveur normalise et valide le format pays avant l’envoi de la recharge.",
    catalogOffer: "Offre du catalogue (optionnel)",
    catalogHelp: "Choisissez une offre existante pour préremplir son libellé, son prix de vente et son coût opérateur. Laissez vide pour une offre ponctuelle.",
    offerLabel: "Libellé de l’offre",
    offerHelp: "Obligatoire uniquement lorsqu’aucune offre du catalogue n’est sélectionnée.",
    saleAmount: "Prix de vente",
    saleAmountHelp: "Montant encaissé auprès du client dans la devise du compte d’encaissement sélectionné.",
    operatorCost: "Coût opérateur",
    operatorCostHelp: "Coût débité du float opérateur. Il ne peut pas dépasser le prix de vente.",
    mode: "Mode d’exécution",
    connectedMode: "Opérateur connecté : DTSC transmet la demande à l’intégration configurée. Le statut et la référence du provider font foi.",
    manualMode: "Opérateur manuel : enregistrez exactement le résultat et la référence affichés par le terminal ou service externe.",
    status: "Statut d’exécution",
    statusHelp: "Mode manuel uniquement. Choisissez réussi après confirmation de l’opérateur, ou échec si la recharge n’a pas abouti.",
    reference: "Référence opérateur",
    referenceHelp: "Obligatoire pour une recharge manuelle réussie. Utilisez la référence unique retournée par l’opérateur.",
    failureReason: "Motif de l’échec",
    failureHelp: "Obligatoire uniquement pour une recharge manuelle échouée. Expliquez l’incident pour garder un historique exploitable.",
    operationalCurrency: "Devise opérationnelle",
    review: "Vérifier la recharge",
    reviewTitle: "Confirmer la recharge Télécom",
    reviewDescription: "Vérifiez les données financières et opérateur avant d’écrire la transaction.",
    edit: "Modifier",
    confirm: "Confirmer la recharge",
    processing: "Traitement…",
    noPayment: "Sélectionnez un compte d’encaissement disponible avant de continuer.",
    noProvider: "Sélectionnez un réseau Télécom configuré dans la devise d’encaissement.",
    invalidPhone: "Saisissez un numéro de téléphone destinataire valide.",
    invalidOffer: "Choisissez une offre du catalogue ou saisissez un libellé d’au moins 2 caractères.",
    invalidSaleAmount: "Saisissez un prix de vente strictement supérieur à zéro.",
    invalidOperatorCost: "Saisissez un coût opérateur compris entre zéro et le prix de vente.",
    referenceRequired: "Renseignez la référence opérateur de cette recharge manuelle réussie.",
    failureReasonRequired: "Expliquez l’échec de la recharge avec au moins 3 caractères.",
    noNetworks: "Aucun réseau n’a de compte opérateur configuré dans cette devise.",
    configure: "Configurer les comptes opérateur",
    margin: "Marge",
    catalogAutomatic: "L’offre du catalogue préremplit les valeurs commerciales; vous pouvez les ajuster avant vérification selon vos droits et votre processus métier.",
    permissionReadOnly: "Vous pouvez consulter ce module, mais votre rôle ne permet pas d’enregistrer une recharge.",
    recorded: "Recharge enregistrée dans la devise sélectionnée.",
  };

  const configuration = dashboard.telcoConfiguration || null;
  const sessions = useMemo(() => dashboard.cashSessions || (dashboard.cashSession ? [dashboard.cashSession as OperatorCashSession] : []), [dashboard.cashSession, dashboard.cashSessions]);
  const openSessions = useMemo(() => sessions.filter((session) => session.status === "OPEN"), [sessions]);
  const [selectedCashSessionId, setSelectedCashSessionId] = useState("");
  const [tenderMethod, setTenderMethod] = useState<"CASH" | "NON_CASH">("CASH");
  const [nonCashAccountId, setNonCashAccountId] = useState("");
  const [providerCode, setProviderCode] = useState("");
  const [catalogItemId, setCatalogItemId] = useState("");
  const [destinationPhone, setDestinationPhone] = useState("");
  const [offerLabel, setOfferLabel] = useState("");
  const [saleAmount, setSaleAmount] = useState("");
  const [operatorCost, setOperatorCost] = useState("");
  const [manualStatus, setManualStatus] = useState<"SUCCESS" | "FAILED">("SUCCESS");
  const [externalReference, setExternalReference] = useState("");
  const [failureReason, setFailureReason] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});
  const [pending, setPending] = useState<TelcoDraft | null>(null);

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

  const tenderAccount: FinancialAccount | null = tenderMethod === "CASH"
    ? (activeCash ? dashboard.accounts.find((account) => account.id === activeCash.financialAccount.id) || null : null)
    : nonCashAccounts.find((account) => account.id === nonCashAccountId) || null;
  const currency = tenderAccount?.currencyCode || "";
  const eligibleProviders = useMemo(
    () => (configuration?.providers || []).filter((provider) => provider.accounts.some((mapping) => mapping.currencyCode === currency)),
    [configuration, currency],
  );
  const selectedProvider = eligibleProviders.find((provider) => provider.providerCode === providerCode) || null;
  const operatorAccount = selectedProvider?.accounts.find((mapping) => mapping.currencyCode === currency)?.financialAccount || null;
  const executionMode = selectedProvider?.executionMode || "MANUAL";
  const manual = executionMode === "MANUAL";
  const effectiveStatus: "SUCCESS" | "FAILED" = manual ? manualStatus : "SUCCESS";
  const eligibleCatalog = useMemo(
    () => (dashboard.catalogItems || []).filter((item) => !item.currency || item.currency === currency),
    [currency, dashboard.catalogItems],
  );
  const selectedCatalog = eligibleCatalog.find((item) => item.id === catalogItemId) || null;

  useEffect(() => {
    if (providerCode && !eligibleProviders.some((provider) => provider.providerCode === providerCode)) setProviderCode("");
    setPending(null);
    setErrors({});
  }, [currency, eligibleProviders, providerCode]);

  useEffect(() => {
    if (catalogItemId && !eligibleCatalog.some((item) => item.id === catalogItemId)) {
      setCatalogItemId("");
      setOfferLabel("");
    }
  }, [catalogItemId, eligibleCatalog]);

  function chooseCatalog(value: string) {
    setCatalogItemId(value);
    setPending(null);
    setErrors((current) => ({ ...current, offer: undefined, saleAmount: undefined, operatorCost: undefined }));
    const item = eligibleCatalog.find((candidate) => candidate.id === value);
    if (!item) {
      setOfferLabel("");
      return;
    }
    setOfferLabel(item.name);
    const price = Number(item.indicativeSalePrice || 0);
    const cost = Number(item.indicativeCost || 0);
    setSaleAmount(Number.isFinite(price) && price > 0 ? String(price) : "");
    setOperatorCost(Number.isFinite(cost) && cost >= 0 ? String(cost) : "0");
  }

  function buildReview() {
    const nextErrors: FormErrors = {};
    const phone = normalizePhonePreview(destinationPhone);
    const sale = Number(saleAmount);
    const cost = Number(operatorCost);
    const label = (selectedCatalog?.name || offerLabel).trim();

    if (!tenderAccount || !currency || (tenderMethod === "CASH" && !activeCash)) nextErrors.payment = copy.noPayment;
    if (!selectedProvider || !operatorAccount) nextErrors.provider = copy.noProvider;
    if (phone.length < 5) nextErrors.phone = copy.invalidPhone;
    if (label.length < 2) nextErrors.offer = copy.invalidOffer;
    if (!Number.isFinite(sale) || sale <= 0) nextErrors.saleAmount = copy.invalidSaleAmount;
    if (!Number.isFinite(cost) || cost < 0 || (Number.isFinite(sale) && cost > sale)) nextErrors.operatorCost = copy.invalidOperatorCost;
    if (manual && effectiveStatus === "SUCCESS" && externalReference.trim().length < 1) nextErrors.reference = copy.referenceRequired;
    if (manual && effectiveStatus === "FAILED" && failureReason.trim().length < 3) nextErrors.failureReason = copy.failureReasonRequired;

    setErrors(nextErrors);
    const message = firstError(nextErrors);
    if (message) {
      notifyToast(message, "error");
      setPending(null);
      return;
    }
    if (!tenderAccount || !selectedProvider || !operatorAccount) return;

    setPending({
      providerCode: selectedProvider.providerCode,
      destinationPhone: phone,
      catalogItemId: selectedCatalog?.id || null,
      offerLabel: label,
      currencyCode: currency,
      saleAmount: sale,
      operatorCost: cost,
      tenderFinancialAccountId: tenderAccount.id,
      operatorFloatAccountId: null,
      externalReference: manual && effectiveStatus === "SUCCESS" ? externalReference.trim() : null,
      status: effectiveStatus,
      failureReason: manual && effectiveStatus === "FAILED" ? failureReason.trim() : null,
    });
  }

  async function confirm() {
    if (!pending) return;
    const body = await mutate("telco-topup", `/api/enterprise/${organizationId}/retail/telco-topups`, pending, copy.recorded);
    if (body) {
      setPending(null);
      setDestinationPhone("");
      setExternalReference("");
      setFailureReason("");
      setErrors({});
      await reload();
    }
  }

  return (
    <div className="grid min-w-0 gap-5">
      <RetailMultiCashSessionManager
        organizationId={organizationId}
        moduleCode="TELCO_TOPUPS"
        accounts={dashboard.accounts}
        sessions={sessions}
        selectedSessionId={activeCash?.id || ""}
        onSelectSession={(sessionId) => {
          setSelectedCashSessionId(sessionId);
          setTenderMethod("CASH");
          setProviderCode("");
          setPending(null);
          setErrors({});
        }}
        locale={locale}
        busyAction={busyAction}
        mutate={mutate}
        reload={reload}
      />

      <ModuleSection title={translateRetailWorkspace(locale, "operatorAirtimeBundle")} description={translateRetailWorkspace(locale, "operatorChooseThePaymentAccountFirstItsCurrencyDeterminesTheEligibleOperatorAccount")}>
        <form noValidate onSubmit={(event) => { event.preventDefault(); buildReview(); }} className="grid min-w-0 gap-5">
          <div className="grid min-w-0 gap-4 md:grid-cols-2">
            <GuidedField id="telco-tender-method" label={copy.paymentMethod} help={copy.paymentMethodHelp} required>
              <Select name="tenderMethod" value={tenderMethod} onChange={(value) => { setTenderMethod(value === "NON_CASH" ? "NON_CASH" : "CASH"); setProviderCode(""); setPending(null); setErrors({}); }} disabled={Boolean(busyAction)}>
                <option value="CASH">{copy.cashTill}</option>
                <option value="NON_CASH">{copy.otherAccount}</option>
              </Select>
            </GuidedField>

            <GuidedField id="telco-payment-account" label={copy.paymentAccount} help={copy.paymentAccountHelp} required error={errors.payment}>
              {tenderMethod === "CASH" ? (
                <Input id="telco-payment-account" value={activeCash ? `${activeCash.financialAccount.name} · ${activeCash.financialAccount.currencyCode}` : "—"} readOnly aria-invalid={Boolean(errors.payment)} />
              ) : (
                <Select name="tenderAccountId" value={nonCashAccountId} onChange={(value) => { setNonCashAccountId(value); setProviderCode(""); setPending(null); setErrors({}); }} disabled={Boolean(busyAction)}>
                  <option value="">—</option>
                  {nonCashAccounts.map((account) => <option key={account.id} value={account.id}>{account.name} · {account.currencyCode} · {customerFacingFinancialAccountType(account.accountType, locale)}</option>)}
                </Select>
              )}
            </GuidedField>

            <GuidedField id="telco-provider" label={copy.network} help={copy.networkHelp} required error={errors.provider}>
              <Select name="providerCode" value={providerCode} onChange={(value) => { setProviderCode(value); setManualStatus("SUCCESS"); setExternalReference(""); setFailureReason(""); setPending(null); setErrors((current) => ({ ...current, provider: undefined, reference: undefined, failureReason: undefined })); }} disabled={Boolean(busyAction) || !currency}>
                <option value="">—</option>
                {eligibleProviders.map((provider) => <option key={provider.id} value={provider.providerCode}>{provider.label}</option>)}
              </Select>
            </GuidedField>

            <GuidedField id="telco-operator-account" label={copy.operatorAccount} help={copy.operatorAccountHelp} required>
              <Input id="telco-operator-account" value={operatorAccount ? `${operatorAccount.name} · ${currency}` : "—"} readOnly />
            </GuidedField>

            <GuidedField id="telco-destination-phone" label={copy.phone} help={copy.phoneHelp} required error={errors.phone}>
              <Input id="telco-destination-phone" value={destinationPhone} onChange={(event) => { setDestinationPhone(event.target.value); setPending(null); setErrors((current) => ({ ...current, phone: undefined })); }} inputMode="tel" placeholder={translateRetailWorkspace(locale, "operatorCountryCode")} disabled={Boolean(busyAction)} aria-invalid={Boolean(errors.phone)} />
            </GuidedField>

            <GuidedField id="telco-catalog-offer" label={copy.catalogOffer} help={copy.catalogHelp}>
              <Select name="catalogItemId" value={catalogItemId} onChange={chooseCatalog} disabled={Boolean(busyAction) || !currency}>
                <option value="">—</option>
                {eligibleCatalog.map((item) => <option key={item.id} value={item.id}>{item.name}{item.currency ? ` · ${item.currency}` : ""}</option>)}
              </Select>
            </GuidedField>

            {!selectedCatalog ? (
              <GuidedField id="telco-offer-label" label={copy.offerLabel} help={copy.offerHelp} required error={errors.offer}>
                <Input id="telco-offer-label" value={offerLabel} onChange={(event) => { setOfferLabel(event.target.value); setPending(null); setErrors((current) => ({ ...current, offer: undefined })); }} maxLength={200} disabled={Boolean(busyAction)} aria-invalid={Boolean(errors.offer)} />
              </GuidedField>
            ) : (
              <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-3 text-sm font-semibold text-dtsc-ink">
                <p className="font-black">{selectedCatalog.name}</p>
                <p className="mt-1 text-xs leading-5 text-dtsc-muted">{copy.catalogAutomatic}</p>
              </div>
            )}

            <GuidedField id="telco-sale-amount" label={copy.saleAmount} help={copy.saleAmountHelp} required error={errors.saleAmount}>
              <Input id="telco-sale-amount" value={saleAmount} onChange={(event) => { setSaleAmount(event.target.value); setPending(null); setErrors((current) => ({ ...current, saleAmount: undefined, operatorCost: undefined })); }} type="number" min="0.01" step="0.01" disabled={Boolean(busyAction)} aria-invalid={Boolean(errors.saleAmount)} />
            </GuidedField>

            <GuidedField id="telco-operator-cost" label={copy.operatorCost} help={copy.operatorCostHelp} required error={errors.operatorCost}>
              <Input id="telco-operator-cost" value={operatorCost} onChange={(event) => { setOperatorCost(event.target.value); setPending(null); setErrors((current) => ({ ...current, operatorCost: undefined })); }} type="number" min="0" step="0.01" disabled={Boolean(busyAction)} aria-invalid={Boolean(errors.operatorCost)} />
            </GuidedField>
          </div>

          {selectedProvider ? (
            <div className={`rounded-xl border p-3 text-sm font-semibold ${manual ? "border-dtsc-border bg-dtsc-page text-dtsc-muted" : "border-cyan-500/30 bg-cyan-500/10 text-dtsc-ink"}`}>
              <p className="font-black text-dtsc-ink">{copy.mode}: {manual ? "MANUAL" : "CONNECTED"}</p>
              <p className="mt-1 leading-5">{manual ? copy.manualMode : copy.connectedMode}</p>
            </div>
          ) : null}

          {manual && selectedProvider ? (
            <div className="grid min-w-0 gap-4 md:grid-cols-2">
              <GuidedField id="telco-status" label={copy.status} help={copy.statusHelp} required>
                <Select name="status" value={manualStatus} onChange={(value) => { setManualStatus(value === "FAILED" ? "FAILED" : "SUCCESS"); setExternalReference(""); setFailureReason(""); setPending(null); setErrors((current) => ({ ...current, reference: undefined, failureReason: undefined })); }} disabled={Boolean(busyAction)}>
                  <option value="SUCCESS">{customerFacingStatusLabel("SUCCESS", locale)}</option>
                  <option value="FAILED">{customerFacingStatusLabel("FAILED", locale)}</option>
                </Select>
              </GuidedField>

              {manualStatus === "SUCCESS" ? (
                <GuidedField id="telco-reference" label={copy.reference} help={copy.referenceHelp} required error={errors.reference}>
                  <Input id="telco-reference" value={externalReference} onChange={(event) => { setExternalReference(event.target.value); setPending(null); setErrors((current) => ({ ...current, reference: undefined })); }} maxLength={160} disabled={Boolean(busyAction)} aria-invalid={Boolean(errors.reference)} />
                </GuidedField>
              ) : (
                <GuidedField id="telco-failure-reason" label={copy.failureReason} help={copy.failureHelp} required error={errors.failureReason}>
                  <Input id="telco-failure-reason" value={failureReason} onChange={(event) => { setFailureReason(event.target.value); setPending(null); setErrors((current) => ({ ...current, failureReason: undefined })); }} minLength={3} maxLength={500} disabled={Boolean(busyAction)} aria-invalid={Boolean(errors.failureReason)} />
                </GuidedField>
              )}
            </div>
          ) : null}

          <div className="rounded-xl border border-dtsc-border bg-dtsc-page p-3 text-sm font-semibold text-dtsc-muted">
            {tenderAccount && currency ? `${copy.operationalCurrency}: ${currency} · ${copy.paymentAccount}: ${tenderAccount.name}` : copy.noPayment}
          </div>

          {currency && configuration && !eligibleProviders.length ? (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm font-bold text-amber-800 dark:text-amber-200">
              {copy.noNetworks} <Link href="#telco-provider-account-configuration" className="underline">{copy.configure}</Link>
            </div>
          ) : null}

          {!dashboard.access.canWrite ? <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm font-bold text-amber-800 dark:text-amber-200">{copy.permissionReadOnly}</div> : null}

          <Button className="w-fit" disabled={Boolean(busyAction) || !dashboard.access.canWrite}>
            <RadioTower className="h-4 w-4" />{copy.review}
          </Button>
        </form>
      </ModuleSection>

      <RetailErpLinks moduleCode="TELCO_TOPUPS" locale={locale} />

      <Dialog
        open={Boolean(pending)}
        title={copy.reviewTitle}
        description={copy.reviewDescription}
        onClose={() => { if (busyAction !== "telco-topup") setPending(null); }}
        presentation="editor"
        className="h-[96dvh] max-w-3xl"
        footer={
          <>
            <Button type="button" variant="outline" disabled={busyAction === "telco-topup"} onClick={() => setPending(null)}>{copy.edit}</Button>
            <Button type="button" disabled={!pending || busyAction === "telco-topup"} onClick={() => void confirm()}>
              <CheckCircle2 className="h-4 w-4" />{busyAction === "telco-topup" ? copy.processing : copy.confirm}
            </Button>
          </>
        }
      >
        {pending ? (
          <div className="grid min-w-0 gap-4 p-4 sm:p-5">
            <div className="rounded-2xl border-2 border-amber-400/50 bg-amber-500/10 p-4">
              <p className="text-xs font-black uppercase tracking-[0.12em] text-dtsc-muted">{selectedProvider?.label || copy.network}</p>
              <p className="mt-2 text-2xl font-black text-dtsc-ink">{moneyValue(pending.saleAmount, pending.currencyCode, locale)}</p>
              <p className="mt-1 text-sm font-bold text-dtsc-muted">{pending.offerLabel} · {pending.destinationPhone}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <ReviewItem label={copy.paymentAccount} value={`${tenderAccount?.name || "—"} · ${pending.currencyCode}`} />
              <ReviewItem label={copy.operatorAccount} value={`${operatorAccount?.name || "—"} · ${pending.currencyCode}`} />
              <ReviewItem label={copy.operatorCost} value={moneyValue(pending.operatorCost, pending.currencyCode, locale)} />
              <ReviewItem label={copy.margin} value={moneyValue(pending.saleAmount - pending.operatorCost, pending.currencyCode, locale)} />
              <ReviewItem label={copy.mode} value={executionMode} />
              <ReviewItem label={copy.status} value={customerFacingStatusLabel(pending.status, locale)} />
              {pending.externalReference ? <ReviewItem label={copy.reference} value={pending.externalReference} /> : null}
              {pending.failureReason ? <ReviewItem label={copy.failureReason} value={pending.failureReason} /> : null}
            </div>
          </div>
        ) : null}
      </Dialog>
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

function TelcoHistory({ organizationId, dashboard, locale, busyAction, mutate }: { organizationId: string; dashboard: TelcoDashboard; locale: "fr" | "en"; busyAction: string | null; mutate: RetailMutation }) {
  const items = dashboard.recent.topups || [];
  const copy = locale === "en" ? {
    title: "Top-up history",
    noTopup: "No top-up recorded",
    noTopupDescription: "Recorded telecom top-ups will appear here.",
    reverse: "Reverse",
    reason: "Reversal reason",
    reasonHelp: "Explain the business reason. The original top-up remains in the audit history.",
    reasonRequired: "Enter a reversal reason of at least 3 characters.",
    cancel: "Cancel",
    confirm: "Confirm reversal",
    processing: "Processing…",
    reversed: "Top-up reversed.",
    operatorReference: "Operator reference",
  } : {
    title: "Historique des recharges",
    noTopup: "Aucune recharge enregistrée",
    noTopupDescription: "Les recharges Télécom enregistrées apparaîtront ici.",
    reverse: "Contrepasser",
    reason: "Motif de contrepassation",
    reasonHelp: "Expliquez la raison métier. La recharge originale reste conservée dans l’historique d’audit.",
    reasonRequired: "Saisissez un motif de contrepassation d’au moins 3 caractères.",
    cancel: "Annuler",
    confirm: "Confirmer la contrepassation",
    processing: "Traitement…",
    reversed: "Recharge contrepassée.",
    operatorReference: "Référence opérateur",
  };
  const [target, setTarget] = useState<{ id: string; revision: number; number: string } | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");

  function close() {
    if (target && busyAction === `reverse-${target.id}`) return;
    setTarget(null);
    setReason("");
    setError("");
  }

  async function confirmReverse() {
    if (!target) return;
    const normalized = reason.trim();
    if (normalized.length < 3) {
      setError(copy.reasonRequired);
      notifyToast(copy.reasonRequired, "error");
      return;
    }
    setError("");
    const result = await mutate(
      `reverse-${target.id}`,
      `/api/enterprise/${organizationId}/retail/telco-topups/${target.id}/reverse`,
      { revision: target.revision, reason: normalized },
      copy.reversed,
      { idempotent: false },
    );
    if (result) close();
  }

  return (
    <div className="grid min-w-0 gap-5">
      <ModuleSection title={copy.title}>
        {items.length ? (
          <BusinessList ariaLabel={copy.title}>
            {items.map((item) => (
              <BusinessListItem
                key={item.id}
                title={`${item.number} · ${providerLabel(dashboard, item.providerCode)}`}
                status={<StatusBadge tone={statusTone(item.status)}>{customerFacingStatusLabel(item.status, locale)}</StatusBadge>}
                meta={`${item.offerLabel} · ${moneyValue(item.saleAmount, item.currencyCode, locale)} · ${formatEnterpriseDate(item.occurredAt, locale)}`}
                description={`${item.destinationPhoneMasked || "—"} · ${copy.operatorReference}: ${item.externalReference || "—"}`}
                actions={dashboard.access.canManage && item.status === "SUCCESS" ? (
                  <Button size="sm" variant="outline" disabled={Boolean(busyAction)} onClick={() => { setTarget({ id: item.id, revision: item.revision, number: item.number }); setReason(""); setError(""); }}>
                    <RotateCcw className="h-4 w-4" />{copy.reverse}
                  </Button>
                ) : undefined}
              />
            ))}
          </BusinessList>
        ) : <EmptyState compact title={copy.noTopup} description={copy.noTopupDescription} />}
      </ModuleSection>
      <RetailErpLinks moduleCode="TELCO_TOPUPS" locale={locale} />

      <Dialog
        open={Boolean(target)}
        title={`${copy.reverse} · ${target?.number || ""}`}
        description={copy.reasonHelp}
        onClose={close}
        className="max-w-xl"
        footer={
          <>
            <Button type="button" variant="outline" disabled={Boolean(target && busyAction === `reverse-${target.id}`)} onClick={close}>{copy.cancel}</Button>
            <Button type="button" disabled={!target || Boolean(target && busyAction === `reverse-${target.id}`)} onClick={() => void confirmReverse()}>
              <RotateCcw className="h-4 w-4" />{target && busyAction === `reverse-${target.id}` ? copy.processing : copy.confirm}
            </Button>
          </>
        }
      >
        <GuidedField id="telco-reversal-reason" label={copy.reason} help={copy.reasonHelp} required error={error}>
          <textarea
            id="telco-reversal-reason"
            value={reason}
            onChange={(event) => { setReason(event.currentTarget.value); if (error) setError(""); }}
            minLength={3}
            maxLength={500}
            disabled={Boolean(target && busyAction === `reverse-${target.id}`)}
            className="min-h-32 w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-sm text-dtsc-ink outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
          />
        </GuidedField>
      </Dialog>
    </div>
  );
}

function TelcoProviderConfigurationPanel({ organizationId, dashboard, locale, busyAction, mutate }: { organizationId: string; dashboard: TelcoDashboard; locale: "fr" | "en"; busyAction: string | null; mutate: RetailMutation }) {
  const configuration = dashboard.telcoConfiguration;
  const [extraCurrency, setExtraCurrency] = useState<Record<string, string>>({});
  const copy = locale === "en" ? {
    unavailable: "Telecom configuration unavailable",
    unavailableDescription: "Refresh the module. The dashboard must load the canonical provider/currency configuration.",
    title: "Telecom operator accounts by currency",
    description: "Map each network and currency to a real operator financial account. This mapping is resolved again by the server for every top-up.",
    requiredCountry: "Required in this country",
    minimum: "Configure at least two operating currencies per active network.",
    currencies: "currencies configured",
    ready: "Ready",
    incomplete: "To complete",
    operatorAccount: "Operator financial account",
    operatorAccountHelp: "Only active Mobile Money/Clearing accounts from this company and this currency are proposed.",
    save: "Save",
    addCurrency: "Add currency",
    currencyHelp: "Choose an additional currency supported by the company finance setup.",
    addAccount: "Add account",
    noNetwork: "No network enabled",
    noNetworkDescription: "Enable a telecom network before mapping its accounts.",
    chooseAccount: "Choose a financial account before saving this mapping.",
    saved: "Operator account saved.",
    mode: "Mode",
  } : {
    unavailable: "Configuration Télécom indisponible",
    unavailableDescription: "Actualisez le module. Le dashboard doit charger la configuration canonique opérateur/devise.",
    title: "Comptes opérateur Télécom par devise",
    description: "Associez chaque réseau et chaque devise à un vrai compte financier opérateur. Le serveur résout à nouveau ce mapping pour chaque recharge.",
    requiredCountry: "Obligatoire dans ce pays",
    minimum: "Configurez au moins deux devises opérationnelles par réseau actif.",
    currencies: "devises configurées",
    ready: "Prêt",
    incomplete: "À compléter",
    operatorAccount: "Compte financier opérateur",
    operatorAccountHelp: "Seuls les comptes Mobile Money/Clearing actifs de cette entreprise et de cette devise sont proposés.",
    save: "Enregistrer",
    addCurrency: "Ajouter une devise",
    currencyHelp: "Choisissez une devise supplémentaire déjà disponible dans la configuration financière de l’entreprise.",
    addAccount: "Ajouter le compte",
    noNetwork: "Aucun réseau activé",
    noNetworkDescription: "Activez un réseau Télécom avant de mapper ses comptes.",
    chooseAccount: "Choisissez un compte financier avant d’enregistrer ce mapping.",
    saved: "Compte opérateur enregistré.",
    mode: "Mode",
  };

  if (!configuration) return <EmptyState compact title={copy.unavailable} description={copy.unavailableDescription} />;

  async function save(provider: TelcoProviderConfiguration, currencyCode: string, financialAccountId: string) {
    if (!financialAccountId || !currencyCode) {
      notifyToast(copy.chooseAccount, "error");
      return;
    }
    await mutate(
      `telco-account-${provider.id}-${currencyCode}`,
      `/api/enterprise/${organizationId}/retail/telco-topups/accounts`,
      { providerCode: provider.providerCode, currencyCode, financialAccountId },
      copy.saved,
      { idempotent: false },
    );
  }

  return (
    <div id="telco-provider-account-configuration" className="grid min-w-0 gap-5">
      <ModuleSection title={copy.title} description={copy.description}>
        <div className="mb-4 rounded-xl border border-dtsc-border bg-dtsc-page p-3 text-sm font-semibold text-dtsc-muted">
          {configuration.requiredCurrencies.length ? `${copy.requiredCountry}: ${configuration.requiredCurrencies.join(" + ")}` : copy.minimum}
        </div>
        <div className="grid min-w-0 gap-4 lg:grid-cols-2">
          {configuration.providers.map((provider) => {
            const mappedCurrencies = provider.accounts.map((mapping) => mapping.currencyCode);
            const displayedCurrencies = configuration.requiredCurrencies.length ? Array.from(new Set([...configuration.requiredCurrencies, ...mappedCurrencies])) : mappedCurrencies;
            const addable = configuration.availableCurrencies.filter((currency) => !displayedCurrencies.includes(currency));
            const draftCurrency = extraCurrency[provider.id] || addable[0] || "";
            return (
              <article key={provider.id} className="min-w-0 rounded-2xl border border-dtsc-border bg-dtsc-page p-4">
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="break-words font-black text-dtsc-ink">{provider.label}</p>
                    <p className="mt-1 text-xs font-semibold text-dtsc-muted">{provider.mappedCurrencyCount} {copy.currencies} · {copy.mode}: {provider.executionMode}</p>
                  </div>
                  <StatusBadge tone={provider.ready ? "success" : "warning"}>{provider.ready ? copy.ready : copy.incomplete}</StatusBadge>
                </div>
                <div className="mt-4 grid gap-3">
                  {displayedCurrencies.map((currencyCode) => {
                    const mapping = provider.accounts.find((account) => account.currencyCode === currencyCode);
                    const accounts = configuration.financialAccounts.filter((account) => account.currencyCode === currencyCode);
                    return (
                      <form noValidate key={`${provider.id}-${currencyCode}-${mapping?.financialAccountId || "new"}`} onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); void save(provider, currencyCode, String(form.get("operatorAccountId") || "")); }} className="grid gap-3 rounded-xl border border-dtsc-border bg-dtsc-surface p-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-end">
                        <div className="min-w-16 self-center text-lg font-black text-dtsc-ink">{currencyCode}</div>
                        <GuidedField label={copy.operatorAccount} help={copy.operatorAccountHelp} required>
                          <Select name="operatorAccountId" defaultValue={mapping?.financialAccountId || ""} disabled={!dashboard.access.canManage || Boolean(busyAction)}>
                            <option value="">—</option>
                            {accounts.map((account) => <option key={account.id} value={account.id}>{account.name} · {customerFacingFinancialAccountType(account.accountType, locale)}</option>)}
                          </Select>
                        </GuidedField>
                        {dashboard.access.canManage ? <Button size="sm" disabled={Boolean(busyAction)}><Settings2 className="h-4 w-4" />{copy.save}</Button> : null}
                      </form>
                    );
                  })}
                  {dashboard.access.canManage && addable.length ? (
                    <form noValidate key={`${provider.id}-extra-${draftCurrency}`} onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); void save(provider, String(form.get("currencyCode") || ""), String(form.get("operatorAccountId") || "")); }} className="grid gap-3 rounded-xl border border-dashed border-dtsc-border bg-dtsc-surface p-3 sm:grid-cols-2">
                      <GuidedField label={copy.addCurrency} help={copy.currencyHelp} required>
                        <Select name="currencyCode" value={draftCurrency} onChange={(value) => setExtraCurrency((current) => ({ ...current, [provider.id]: value }))} disabled={Boolean(busyAction)}>
                          {addable.map((currency) => <option key={currency} value={currency}>{currency}</option>)}
                        </Select>
                      </GuidedField>
                      <GuidedField label={copy.operatorAccount} help={copy.operatorAccountHelp} required>
                        <Select name="operatorAccountId" disabled={Boolean(busyAction)}><option value="">—</option>{configuration.financialAccounts.filter((account) => account.currencyCode === draftCurrency).map((account) => <option key={account.id} value={account.id}>{account.name} · {customerFacingFinancialAccountType(account.accountType, locale)}</option>)}</Select>
                      </GuidedField>
                      <Button className="sm:col-span-2 sm:w-fit" disabled={Boolean(busyAction)}><Settings2 className="h-4 w-4" />{copy.addAccount}</Button>
                    </form>
                  ) : null}
                </div>
              </article>
            );
          })}
          {!configuration.providers.length ? <EmptyState compact title={copy.noNetwork} description={copy.noNetworkDescription} /> : null}
        </div>
      </ModuleSection>
      <RetailErpLinks moduleCode="TELCO_TOPUPS" locale={locale} />
    </div>
  );
}
