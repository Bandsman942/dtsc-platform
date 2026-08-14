"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, RadioTower, RotateCcw, Settings2, Smartphone } from "lucide-react";
import { useAppLocale } from "@/components/i18n/locale-provider";
import { MobileMoneyCashSessionManager as RetailMultiCashSessionManager, type MobileMoneyCashSession as OperatorCashSession } from "@/components/enterprise/professional/mobile-money-cash-session-manager";
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
  type RetailOperationalModuleCode,
  type RetailProvider,
} from "@/components/enterprise/professional/retail-workspace-shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BusinessList, BusinessListItem } from "@/components/workspace/business-list";
import { EmptyState } from "@/components/workspace/empty-state";
import { ModuleSection } from "@/components/workspace/module-workspace";
import { StatusBadge } from "@/components/workspace/status-badge";
import {
  customerFacingFinancialAccountType,
  customerFacingStatusLabel,
} from "@/lib/customer-facing-language";
import type { EnterpriseModuleDefinition } from "@/lib/enterprise/module-registry";
import {
  customerFacingFeeCollectionMode,
  customerFacingMobileMoneyTransactionType,
} from "@/lib/retail-customer-language";

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
  status: string;
  failureReason: string | null;
};

export function RetailOperatorWorkspace({
  organizationId,
  organizationName,
  definition,
  moduleCode,
}: {
  organizationId: string;
  organizationName: string;
  definition: EnterpriseModuleDefinition;
  moduleCode: "MOBILE_MONEY_AGENCY" | "TELCO_TOPUPS";
}) {
  const locale: "fr" | "en" = useAppLocale() === "en" ? "en" : "fr";
  return (
    <RetailWorkspaceFrame
      organizationId={organizationId}
      organizationName={organizationName}
      definition={definition}
      moduleCode={moduleCode}
      locale={locale}
      includeConfigurationTab
    >
      {(context) => {
        const dashboard = context.dashboard as RetailDashboard;
        if (context.tab === "HISTORY") return <OperatorHistory organizationId={organizationId} moduleCode={moduleCode} dashboard={dashboard} locale={locale} busyAction={context.busyAction} mutate={context.mutate} />;
        if (context.tab === "CONFIG") return <ProviderConfiguration organizationId={organizationId} moduleCode={moduleCode} dashboard={dashboard} locale={locale} busyAction={context.busyAction} mutate={context.mutate} />;
        if (context.tab === "REPORTS") return <RetailReportsPanel dashboard={dashboard} moduleCode={moduleCode} locale={locale} />;
        return moduleCode === "MOBILE_MONEY_AGENCY"
          ? <MobileMoneyPanel organizationId={organizationId} dashboard={dashboard} locale={locale} busyAction={context.busyAction} mutate={context.mutate} />
          : <TelcoPanel organizationId={organizationId} dashboard={dashboard} locale={locale} busyAction={context.busyAction} mutate={context.mutate} reload={async () => context.setRefreshKey((value) => value + 1)} />;
      }}
    </RetailWorkspaceFrame>
  );
}

function MobileMoneyPanel({ organizationId, dashboard, locale, busyAction, mutate }: { organizationId: string; dashboard: RetailDashboard; locale: "fr" | "en"; busyAction: string | null; mutate: RetailMutation }) {
  const providers = (dashboard.providers || []).filter((provider) => provider.providerType === "MOBILE_MONEY");
  const mappedProviders = providers.filter((provider) => provider.mobileMoneyFloatAccountId);
  const [pending, setPending] = useState<Record<string, unknown> | null>(null);
  const activeCash = dashboard.cashSession?.status === "OPEN" ? dashboard.cashSession : null;

  async function confirm() {
    if (!pending) return;
    const body = await mutate(
      "mobile-money",
      `/api/enterprise/${organizationId}/retail/mobile-money`,
      pending,
      locale === "en" ? "Mobile Money operation confirmed." : "Opération Mobile Money confirmée.",
    );
    if (body) setPending(null);
  }

  const selectedProvider = pending ? mappedProviders.find((provider) => provider.providerCode === pending.providerCode) : null;
  const pendingType = pending ? customerFacingMobileMoneyTransactionType(String(pending.transactionType || ""), locale) : "";
  const pendingFee = pending ? customerFacingFeeCollectionMode(String(pending.feeCollectionMode || ""), locale) : "";

  return (
    <div className="grid min-w-0 gap-5">
      <OpenCashForm organizationId={organizationId} dashboard={dashboard} locale={locale} busyAction={busyAction} mutate={mutate} />
      <ModuleSection
        title={locale === "en" ? "Mobile Money operation" : "Opération Mobile Money"}
        description={locale === "en"
          ? "Choose the Mobile Money service and record the customer operation. The configured operator account is applied automatically."
          : "Choisissez le service Mobile Money et enregistrez l’opération client. Le compte opérateur configuré est appliqué automatiquement."}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const providerCode = String(form.get("providerCode") || "");
            const provider = mappedProviders.find((item) => item.providerCode === providerCode);
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
            <Field label={locale === "en" ? "Mobile Money service" : "Service Mobile Money"}>
              <Select name="providerCode" required disabled={Boolean(busyAction)}>
                <option value="">—</option>
                {mappedProviders.map((provider) => <option key={provider.id} value={provider.providerCode}>{provider.label}</option>)}
              </Select>
            </Field>
            <Field label={locale === "en" ? "Operation" : "Opération"}>
              <Select name="transactionType" defaultValue="DEPOSIT">
                <option value="DEPOSIT">{customerFacingMobileMoneyTransactionType("DEPOSIT", locale)}</option>
                <option value="WITHDRAWAL">{customerFacingMobileMoneyTransactionType("WITHDRAWAL", locale)}</option>
              </Select>
            </Field>
            <Field label={locale === "en" ? "Customer phone" : "Téléphone client"}><Input name="customerPhone" required inputMode="tel" placeholder={locale === "en" ? "+country code…" : "+indicatif pays…"} /></Field>
            <Field label={locale === "en" ? "Customer amount" : "Montant client"}><Input name="principalAmount" type="number" min="0.01" step="0.01" required /></Field>
            <Field label={locale === "en" ? "Customer fee" : "Frais client"}><Input name="customerFeeAmount" type="number" min="0" step="0.01" defaultValue="0" /></Field>
            <Field label={locale === "en" ? "Operator commission" : "Commission opérateur"}><Input name="providerCommissionAmount" type="number" min="0" step="0.01" defaultValue="0" /></Field>
            <Field label={locale === "en" ? "Fee collection" : "Encaissement des frais"}>
              <Select name="feeCollectionMode" defaultValue="NONE">
                <option value="NONE">{customerFacingFeeCollectionMode("NONE", locale)}</option>
                <option value="CASH">{customerFacingFeeCollectionMode("CASH", locale)}</option>
                <option value="PROVIDER">{customerFacingFeeCollectionMode("PROVIDER", locale)}</option>
              </Select>
            </Field>
            <Field label={locale === "en" ? "Operator reference" : "Référence opérateur"}><Input name="externalReference" required maxLength={160} /></Field>
          </div>
          <div className="rounded-xl border border-dtsc-border bg-dtsc-page p-3 text-sm font-semibold text-dtsc-muted">
            {activeCash
              ? `${locale === "en" ? "Till" : "Caisse"}: ${activeCash.financialAccount.name} · ${activeCash.financialAccount.currencyCode}`
              : (locale === "en" ? "Open a till before continuing." : "Ouvrez une caisse avant de continuer.")}
          </div>
          <Button className="w-fit" disabled={Boolean(busyAction) || !activeCash || !mappedProviders.length}>
            <Smartphone className="h-4 w-4" />{locale === "en" ? "Review operation" : "Vérifier l’opération"}
          </Button>
        </form>
      </ModuleSection>

      {pending ? (
        <ConfirmationCard
          locale={locale}
          title={locale === "en" ? "Confirm Mobile Money" : "Confirmer Mobile Money"}
          lines={[
            selectedProvider?.label || (locale === "en" ? "Mobile Money service" : "Service Mobile Money"),
            `${pendingType} · ${moneyValue(Number(pending.principalAmount), String(pending.currencyCode))}`,
            String(pending.customerPhone),
            pendingFee,
            `${locale === "en" ? "Operator reference" : "Référence opérateur"}: ${pending.externalReference}`,
          ]}
          busy={busyAction === "mobile-money"}
          onCancel={() => setPending(null)}
          onConfirm={() => void confirm()}
        />
      ) : null}
      <RetailErpLinks moduleCode="MOBILE_MONEY_AGENCY" locale={locale} />
    </div>
  );
}

function TelcoPanel({ organizationId, dashboard, locale, busyAction, mutate, reload }: { organizationId: string; dashboard: RetailDashboard; locale: "fr" | "en"; busyAction: string | null; mutate: RetailMutation; reload: () => Promise<void> }) {
  const telcoDashboard = dashboard as TelcoDashboard;
  const configuration = telcoDashboard.telcoConfiguration || null;
  const sessions = useMemo(() => telcoDashboard.cashSessions || [], [telcoDashboard.cashSessions]);
  const openSessions = useMemo(() => sessions.filter((session) => session.status === "OPEN"), [sessions]);
  const [selectedCashSessionId, setSelectedCashSessionId] = useState("");
  const [tenderMethod, setTenderMethod] = useState<"CASH" | "NON_CASH">("CASH");
  const [nonCashAccountId, setNonCashAccountId] = useState("");
  const [status, setStatus] = useState("SUCCESS");
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

  const tenderAccount = tenderMethod === "CASH"
    ? (activeCash ? dashboard.accounts.find((account) => account.id === activeCash.financialAccount.id) || null : null)
    : nonCashAccounts.find((account) => account.id === nonCashAccountId) || null;
  const currency = tenderAccount?.currencyCode || "";
  const eligibleProviders = useMemo(
    () => (configuration?.providers || []).filter((provider) => provider.accounts.some((mapping) => mapping.currencyCode === currency)),
    [configuration, currency],
  );
  const eligibleCatalog = useMemo(
    () => (dashboard.catalogItems || []).filter((item) => !item.currency || item.currency === currency),
    [currency, dashboard.catalogItems],
  );

  useEffect(() => { setPending(null); }, [selectedCashSessionId, tenderMethod, nonCashAccountId]);

  async function confirm() {
    if (!pending) return;
    const body = await mutate(
      "telco-topup",
      `/api/enterprise/${organizationId}/retail/telco-topups`,
      pending,
      locale === "en" ? "Top-up recorded in the selected currency." : "Recharge enregistrée dans la devise sélectionnée.",
    );
    if (body) setPending(null);
  }

  const selectedProvider = pending ? configuration?.providers.find((provider) => provider.providerCode === pending.providerCode) || null : null;
  const selectedOperatorAccount = pending ? selectedProvider?.accounts.find((mapping) => mapping.currencyCode === pending.currencyCode)?.financialAccount || null : null;
  const selectedTenderAccount = pending ? dashboard.accounts.find((account) => account.id === pending.tenderFinancialAccountId) || null : null;

  return (
    <div className="grid min-w-0 gap-5">
      <RetailMultiCashSessionManager
        organizationId={organizationId}
        moduleCode="TELCO_TOPUPS"
        accounts={dashboard.accounts}
        sessions={sessions}
        selectedSessionId={selectedCashSessionId}
        onSelectSession={(sessionId) => { setSelectedCashSessionId(sessionId); setTenderMethod("CASH"); setPending(null); }}
        locale={locale}
        busyAction={busyAction}
        mutate={mutate}
        reload={reload}
      />

      <ModuleSection
        title={locale === "en" ? "Airtime / bundle" : "Crédit / forfait"}
        description={locale === "en"
          ? "Choose the payment account first. Its currency determines the eligible operator account automatically, so the same network can be used in CDF or USD without reconfiguration."
          : "Choisissez d’abord le compte d’encaissement. Sa devise détermine automatiquement le compte opérateur éligible : un même réseau peut ainsi être exploité en CDF ou en USD sans reconfiguration."}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const providerCode = String(form.get("providerCode") || "");
            const provider = eligibleProviders.find((item) => item.providerCode === providerCode);
            const externalReference = String(form.get("externalReference") || "").trim();
            if (!provider || !tenderAccount || !currency || (status === "SUCCESS" && !externalReference)) return;
            setPending({
              providerCode,
              destinationPhone: normalizePhonePreview(String(form.get("destinationPhone") || "")),
              catalogItemId: String(form.get("catalogItemId") || "") || null,
              offerLabel: String(form.get("offerLabel") || ""),
              currencyCode: currency,
              saleAmount: Number(form.get("saleAmount") || 0),
              operatorCost: Number(form.get("operatorCost") || 0),
              tenderFinancialAccountId: tenderAccount.id,
              operatorFloatAccountId: null,
              externalReference: externalReference || null,
              status,
              failureReason: String(form.get("failureReason") || "").trim() || null,
            });
          }}
          className="grid min-w-0 gap-4"
        >
          <div className="grid min-w-0 gap-4 md:grid-cols-2">
            <Field label={locale === "en" ? "Payment method" : "Mode d’encaissement"}>
              <Select name="tenderMethod" value={tenderMethod} onChange={(value) => { setTenderMethod(value === "NON_CASH" ? "NON_CASH" : "CASH"); setPending(null); }} disabled={Boolean(busyAction)}>
                <option value="CASH">{locale === "en" ? "Cash till" : "Caisse espèces"}</option>
                <option value="NON_CASH">{locale === "en" ? "Other financial account" : "Autre compte financier"}</option>
              </Select>
            </Field>
            <Field label={locale === "en" ? "Payment account & currency" : "Compte d’encaissement et devise"}>
              {tenderMethod === "CASH" ? (
                <Input value={activeCash ? activeCash.financialAccount.name + " · " + activeCash.financialAccount.currencyCode : (locale === "en" ? "Open or select a cash till" : "Ouvrez ou sélectionnez une caisse")} readOnly />
              ) : (
                <Select name="tenderAccountId" value={nonCashAccountId} onChange={(value) => { setNonCashAccountId(value); setPending(null); }} required disabled={Boolean(busyAction)}>
                  <option value="">—</option>
                  {nonCashAccounts.map((account) => <option key={account.id} value={account.id}>{account.name} · {account.currencyCode} · {customerFacingFinancialAccountType(account.accountType, locale)}</option>)}
                </Select>
              )}
            </Field>
            <Field label={locale === "en" ? "Network" : "Opérateur réseau"}>
              <Select name="providerCode" required disabled={Boolean(busyAction) || !currency}>
                <option value="">—</option>
                {eligibleProviders.map((provider) => <option key={provider.id} value={provider.providerCode}>{provider.label}</option>)}
              </Select>
            </Field>
            <Field label={locale === "en" ? "Destination phone" : "Numéro destinataire"}><Input name="destinationPhone" required inputMode="tel" placeholder={locale === "en" ? "+country code…" : "+indicatif pays…"} disabled={Boolean(busyAction)} /></Field>
            <Field label={locale === "en" ? "Catalog offer (optional)" : "Offre catalogue (facultatif)"}>
              <Select name="catalogItemId" disabled={Boolean(busyAction) || !currency}><option value="">—</option>{eligibleCatalog.map((item) => <option key={item.id} value={item.id}>{item.name}{item.currency ? " · " + item.currency : ""}</option>)}</Select>
            </Field>
            <Field label={locale === "en" ? "Offer label" : "Libellé du forfait"}><Input name="offerLabel" required disabled={Boolean(busyAction)} /></Field>
            <Field label={locale === "en" ? "Sale price" : "Prix de vente"}><Input name="saleAmount" type="number" min="0.01" step="0.01" required disabled={Boolean(busyAction)} /></Field>
            <Field label={locale === "en" ? "Operator cost" : "Coût opérateur"}><Input name="operatorCost" type="number" min="0" step="0.01" required disabled={Boolean(busyAction)} /></Field>
            <Field label={locale === "en" ? "Execution status" : "Statut de l’opération"}>
              <Select name="status" value={status} onChange={(value) => { setStatus(value); setPending(null); }} disabled={Boolean(busyAction)}><option value="SUCCESS">{customerFacingStatusLabel("SUCCESS", locale)}</option><option value="FAILED">{customerFacingStatusLabel("FAILED", locale)}</option></Select>
            </Field>
            <Field label={locale === "en" ? "Operator reference" : "Référence opérateur"}><Input name="externalReference" maxLength={160} required={status === "SUCCESS"} disabled={Boolean(busyAction)} /></Field>
            {status === "FAILED" ? <Field label={locale === "en" ? "Failure reason" : "Motif d’échec"}><Input name="failureReason" minLength={3} maxLength={500} required disabled={Boolean(busyAction)} /></Field> : null}
          </div>

          <div className="rounded-xl border border-dtsc-border bg-dtsc-page p-3 text-sm font-semibold text-dtsc-muted">
            {tenderAccount && currency
              ? (locale === "en" ? "Operational currency" : "Devise opérationnelle") + ": " + currency + " · " + (locale === "en" ? "payment account" : "encaissement") + ": " + tenderAccount.name
              : (locale === "en" ? "Select an available payment account before continuing." : "Sélectionnez un compte d’encaissement disponible avant de continuer.")}
          </div>
          {currency && configuration && !eligibleProviders.length ? (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm font-bold text-amber-800 dark:text-amber-200">
              {locale === "en" ? "No network has an operator account configured in this currency." : "Aucun réseau ne possède encore de compte opérateur dans cette devise."} {" "}
              <Link href="#telco-provider-account-configuration" className="underline">{locale === "en" ? "Configure operator accounts" : "Configurer les comptes opérateur"}</Link>
            </div>
          ) : null}
          <Button className="w-fit" disabled={Boolean(busyAction) || !tenderAccount || !currency || !eligibleProviders.length}>
            <RadioTower className="h-4 w-4" />{locale === "en" ? "Review top-up" : "Vérifier la recharge"}
          </Button>
        </form>
      </ModuleSection>

      {pending ? (
        <ConfirmationCard
          locale={locale}
          title={locale === "en" ? "Confirm top-up" : "Confirmer la recharge"}
          lines={[
            selectedProvider?.label || (locale === "en" ? "Network operator" : "Opérateur réseau"),
            pending.offerLabel + " · " + moneyValue(pending.saleAmount, pending.currencyCode),
            String(pending.destinationPhone),
            (locale === "en" ? "Payment account" : "Compte d’encaissement") + ": " + (selectedTenderAccount?.name || "—") + " · " + pending.currencyCode,
            (locale === "en" ? "Operator account" : "Compte opérateur") + ": " + (selectedOperatorAccount?.name || "—") + " · " + pending.currencyCode,
            (locale === "en" ? "Operator reference" : "Référence opérateur") + ": " + (pending.externalReference || "—"),
            locale === "en" ? "Check the phone number and currency carefully before confirming." : "Vérifiez soigneusement le numéro et la devise avant de confirmer.",
          ]}
          busy={busyAction === "telco-topup"}
          onCancel={() => setPending(null)}
          onConfirm={() => void confirm()}
        />
      ) : null}
      <RetailErpLinks moduleCode="TELCO_TOPUPS" locale={locale} />
    </div>
  );
}

function ConfirmationCard({ locale, title, lines, busy, onCancel, onConfirm }: { locale: "fr" | "en"; title: string; lines: string[]; busy: boolean; onCancel: () => void; onConfirm: () => void }) {
  return (
    <ModuleSection title={title} description={locale === "en" ? "Review the information before confirming the operation." : "Vérifiez les informations avant de confirmer l’opération."}>
      <div className="rounded-2xl border-2 border-amber-400/50 bg-amber-500/10 p-4">
        <div className="grid gap-1">{lines.map((line, index) => <p key={`${line}-${index}`} className="break-words text-sm font-bold text-dtsc-ink">{line}</p>)}</div>
        <div data-responsive-actions className="mt-4">
          <Button variant="outline" type="button" disabled={busy} onClick={onCancel}>{locale === "en" ? "Edit" : "Modifier"}</Button>
          <Button type="button" disabled={busy} onClick={onConfirm}><CheckCircle2 className="h-4 w-4" />{busy ? (locale === "en" ? "Processing…" : "Traitement…") : (locale === "en" ? "Confirm" : "Confirmer")}</Button>
        </div>
      </div>
    </ModuleSection>
  );
}

function OperatorHistory({ organizationId, moduleCode, dashboard, locale, busyAction, mutate }: { organizationId: string; moduleCode: "MOBILE_MONEY_AGENCY" | "TELCO_TOPUPS"; dashboard: RetailDashboard; locale: "fr" | "en"; busyAction: string | null; mutate: RetailMutation }) {
  async function reverse(kind: "mobile-money" | "telco-topups", id: string, revision: number) {
    const reason = window.prompt(locale === "en" ? "Reason for reversal" : "Motif de l’annulation");
    if (!reason?.trim()) return;
    await mutate(
      `reverse-${id}`,
      `/api/enterprise/${organizationId}/retail/${kind}/${id}/reverse`,
      { revision, reason: reason.trim() },
      locale === "en" ? "Reversal completed." : "Annulation enregistrée.",
      { idempotent: false },
    );
  }

  if (moduleCode === "MOBILE_MONEY_AGENCY") {
    const items = dashboard.recent.mobileMoney || [];
    return (
      <div className="grid min-w-0 gap-5">
        <ModuleSection title={locale === "en" ? "Mobile Money history" : "Historique Mobile Money"}>
          {items.length ? (
            <BusinessList ariaLabel={locale === "en" ? "Mobile Money history" : "Historique Mobile Money"}>
              {items.map((item) => (
                <BusinessListItem
                  key={item.id}
                  title={`${item.number} · ${providerLabel(dashboard, item.providerCode)}`}
                  status={<StatusBadge tone={statusTone(item.status)}>{customerFacingStatusLabel(item.status, locale)}</StatusBadge>}
                  meta={`${customerFacingMobileMoneyTransactionType(item.transactionType, locale)} · ${moneyValue(item.principalAmount, item.currencyCode)} · ${formatEnterpriseDate(item.occurredAt, locale)}`}
                  description={`${item.customerPhoneMasked || "—"} · ${locale === "en" ? "Operator reference" : "Référence opérateur"}: ${item.externalReference || "—"}`}
                  actions={dashboard.access.canManage && item.status === "CONFIRMED" ? <Button size="sm" variant="outline" disabled={Boolean(busyAction)} onClick={() => void reverse("mobile-money", item.id, item.revision)}><RotateCcw className="h-4 w-4" />{locale === "en" ? "Reverse" : "Annuler"}</Button> : undefined}
                />
              ))}
            </BusinessList>
          ) : <EmptyState compact title={locale === "en" ? "No transaction" : "Aucune opération"} description={locale === "en" ? "Confirmed operations will appear here." : "Les opérations confirmées apparaîtront ici."} />}
        </ModuleSection>
        <RetailErpLinks moduleCode="MOBILE_MONEY_AGENCY" locale={locale} />
      </div>
    );
  }

  const items = dashboard.recent.topups || [];
  return (
    <div className="grid min-w-0 gap-5">
      <ModuleSection title={locale === "en" ? "Top-up history" : "Historique Télécom"}>
        {items.length ? (
          <BusinessList ariaLabel={locale === "en" ? "Telco history" : "Historique Télécom"}>
            {items.map((item) => (
              <BusinessListItem
                key={item.id}
                title={`${item.number} · ${providerLabel(dashboard, item.providerCode)}`}
                status={<StatusBadge tone={statusTone(item.status)}>{customerFacingStatusLabel(item.status, locale)}</StatusBadge>}
                meta={`${item.offerLabel} · ${moneyValue(item.saleAmount, item.currencyCode)} · ${formatEnterpriseDate(item.occurredAt, locale)}`}
                description={`${item.destinationPhoneMasked || "—"} · ${locale === "en" ? "Margin" : "Marge"} ${moneyValue(item.marginAmount, item.currencyCode)} · ${locale === "en" ? "Operator reference" : "Référence opérateur"}: ${item.externalReference || "—"}`}
                actions={dashboard.access.canManage && item.status === "SUCCESS" ? <Button size="sm" variant="outline" disabled={Boolean(busyAction)} onClick={() => void reverse("telco-topups", item.id, item.revision)}><RotateCcw className="h-4 w-4" />{locale === "en" ? "Reverse" : "Annuler"}</Button> : undefined}
              />
            ))}
          </BusinessList>
        ) : <EmptyState compact title={locale === "en" ? "No top-up" : "Aucune recharge"} description={locale === "en" ? "Recorded top-ups will appear here." : "Les recharges enregistrées apparaîtront ici."} />}
      </ModuleSection>
      <RetailErpLinks moduleCode="TELCO_TOPUPS" locale={locale} />
    </div>
  );
}

function TelcoProviderConfiguration({ organizationId, dashboard, locale, busyAction, mutate }: { organizationId: string; dashboard: RetailDashboard; locale: "fr" | "en"; busyAction: string | null; mutate: RetailMutation }) {
  const telcoDashboard = dashboard as TelcoDashboard;
  const configuration = telcoDashboard.telcoConfiguration;
  const [extraCurrency, setExtraCurrency] = useState<Record<string, string>>({});

  if (!configuration) return <EmptyState compact title={locale === "en" ? "Telecom configuration unavailable" : "Configuration Télécom indisponible"} description={locale === "en" ? "Refresh the page and try again." : "Actualisez la page puis réessayez."} />;

  async function save(provider: TelcoProviderConfiguration, currencyCode: string, financialAccountId: string) {
    if (!financialAccountId || !currencyCode) return;
    await mutate(
      `telco-account-${provider.id}-${currencyCode}`,
      `/api/enterprise/${organizationId}/retail/telco-topups/accounts`,
      { providerCode: provider.providerCode, currencyCode, financialAccountId },
      locale === "en" ? "Operator account saved." : "Compte opérateur enregistré.",
      { idempotent: false },
    );
  }

  return (
    <div id="telco-provider-account-configuration" className="grid min-w-0 gap-5">
      <ModuleSection
        title={locale === "en" ? "Telecom operator accounts by currency" : "Comptes opérateur Télécom par devise"}
        description={locale === "en"
          ? "Each network is displayed once. Link a separate real operator account for every currency you use; in DR Congo, CDF and USD are expected."
          : "Chaque réseau reste affiché une seule fois. Associez-lui un compte opérateur réel distinct pour chaque devise exploitée ; en RDC, CDF et USD sont attendus."}
      >
        <div className="mb-4 rounded-xl border border-dtsc-border bg-dtsc-page p-3 text-sm font-semibold text-dtsc-muted">
          {configuration.requiredCurrencies.length
            ? (locale === "en" ? "Required in this country" : "Requis dans ce pays") + ": " + configuration.requiredCurrencies.join(" + ")
            : (locale === "en" ? "Configure at least two operating currencies per active network." : "Configurez au moins deux devises d’exploitation par réseau actif.")}
        </div>
        <div className="grid min-w-0 gap-4 lg:grid-cols-2">
          {configuration.providers.map((provider) => {
            const mappedCurrencies = provider.accounts.map((mapping) => mapping.currencyCode);
            const displayedCurrencies = configuration.requiredCurrencies.length
              ? Array.from(new Set([...configuration.requiredCurrencies, ...mappedCurrencies]))
              : mappedCurrencies;
            const addable = configuration.availableCurrencies.filter((currency) => !displayedCurrencies.includes(currency));
            const draftCurrency = extraCurrency[provider.id] || addable[0] || "";
            return (
              <article key={provider.id} className="min-w-0 rounded-2xl border border-dtsc-border bg-dtsc-page p-4">
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="break-words font-black text-dtsc-ink">{provider.label}</p>
                    <p className="mt-1 text-xs font-semibold text-dtsc-muted">{provider.mappedCurrencyCount} {locale === "en" ? "currencies configured" : "devises configurées"}</p>
                  </div>
                  <StatusBadge tone={provider.ready ? "success" : "warning"}>{provider.ready ? (locale === "en" ? "Ready" : "Prêt") : (locale === "en" ? "To complete" : "À compléter")}</StatusBadge>
                </div>

                <div className="mt-4 grid gap-3">
                  {displayedCurrencies.map((currencyCode) => {
                    const mapping = provider.accounts.find((account) => account.currencyCode === currencyCode);
                    const accounts = configuration.financialAccounts.filter((account) => account.currencyCode === currencyCode);
                    return (
                      <form
                        key={provider.id + "-" + currencyCode + "-" + (mapping?.financialAccountId || "new")}
                        onSubmit={(event) => {
                          event.preventDefault();
                          const form = new FormData(event.currentTarget);
                          void save(provider, currencyCode, String(form.get("operatorAccountId") || ""));
                        }}
                        className="grid gap-3 rounded-xl border border-dtsc-border bg-dtsc-surface p-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-end"
                      >
                        <div className="min-w-16 self-center text-lg font-black text-dtsc-ink">{currencyCode}</div>
                        <Field label={locale === "en" ? "Operator financial account" : "Compte financier opérateur"}>
                          <Select name="operatorAccountId" defaultValue={mapping?.financialAccountId || ""} disabled={!dashboard.access.canManage || Boolean(busyAction)} required>
                            <option value="">—</option>
                            {accounts.map((account) => <option key={account.id} value={account.id}>{account.name} · {customerFacingFinancialAccountType(account.accountType, locale)}</option>)}
                          </Select>
                        </Field>
                        {dashboard.access.canManage ? <Button size="sm" disabled={Boolean(busyAction) || !accounts.length}><Settings2 className="h-4 w-4" />{locale === "en" ? "Save" : "Enregistrer"}</Button> : null}
                      </form>
                    );
                  })}

                  {dashboard.access.canManage && addable.length ? (
                    <form
                      key={provider.id + "-extra-" + draftCurrency}
                      onSubmit={(event) => {
                        event.preventDefault();
                        const form = new FormData(event.currentTarget);
                        void save(provider, String(form.get("currencyCode") || ""), String(form.get("operatorAccountId") || ""));
                      }}
                      className="grid gap-3 rounded-xl border border-dashed border-dtsc-border bg-dtsc-surface p-3 sm:grid-cols-2"
                    >
                      <Field label={locale === "en" ? "Add currency" : "Ajouter une devise"}>
                        <Select name="currencyCode" value={draftCurrency} onChange={(value) => setExtraCurrency((current) => ({ ...current, [provider.id]: value }))} disabled={Boolean(busyAction)}>
                          {addable.map((currency) => <option key={currency} value={currency}>{currency}</option>)}
                        </Select>
                      </Field>
                      <Field label={locale === "en" ? "Operator financial account" : "Compte financier opérateur"}>
                        <Select name="operatorAccountId" required disabled={Boolean(busyAction)}><option value="">—</option>{configuration.financialAccounts.filter((account) => account.currencyCode === draftCurrency).map((account) => <option key={account.id} value={account.id}>{account.name} · {customerFacingFinancialAccountType(account.accountType, locale)}</option>)}</Select>
                      </Field>
                      <Button className="sm:col-span-2 sm:w-fit" disabled={Boolean(busyAction)}><Settings2 className="h-4 w-4" />{locale === "en" ? "Add account" : "Ajouter le compte"}</Button>
                    </form>
                  ) : null}
                </div>
              </article>
            );
          })}
          {!configuration.providers.length ? <EmptyState compact title={locale === "en" ? "No network enabled" : "Aucun réseau activé"} description={locale === "en" ? "Enable a Telecom network before mapping its accounts." : "Activez un réseau Télécom avant d’associer ses comptes."} /> : null}
        </div>
      </ModuleSection>
      <RetailErpLinks moduleCode="TELCO_TOPUPS" locale={locale} />
    </div>
  );
}

function ProviderConfiguration({ organizationId, moduleCode, dashboard, locale, busyAction, mutate }: { organizationId: string; moduleCode: "MOBILE_MONEY_AGENCY" | "TELCO_TOPUPS"; dashboard: RetailDashboard; locale: "fr" | "en"; busyAction: string | null; mutate: RetailMutation }) {
  if (moduleCode === "TELCO_TOPUPS") return <TelcoProviderConfiguration organizationId={organizationId} dashboard={dashboard} locale={locale} busyAction={busyAction} mutate={mutate} />;
  const expectedType = "MOBILE_MONEY";
  const providers = (dashboard.providers || []).filter((provider) => provider.providerType === expectedType);
  const accountName = (id: string | null) => dashboard.accounts.find((account) => account.id === id)?.name || "—";
  const mobileAccounts = dashboard.accounts.filter((account) => account.accountType === "MOBILE_MONEY");
  const telcoAccounts = dashboard.accounts.filter((account) => ["MOBILE_MONEY", "CLEARING"].includes(account.accountType));
  const accountTypeLabel = moduleCode === "MOBILE_MONEY_AGENCY"
    ? (locale === "en" ? "Mobile Money operator account" : "Compte opérateur Mobile Money")
    : (locale === "en" ? "Telecom operator account" : "Compte opérateur Télécom");

  return (
    <div className="grid min-w-0 gap-5">
      <ModuleSection
        title={moduleCode === "MOBILE_MONEY_AGENCY" ? (locale === "en" ? "Mobile Money services" : "Services Mobile Money") : (locale === "en" ? "Telecom networks" : "Opérateurs Télécom")}
        description={locale === "en"
          ? "Choose once which financial account represents each operator service. Staff will not have to select it during every operation."
          : "Choisissez une seule fois le compte financier associé à chaque service opérateur. Les agents n’auront pas à le sélectionner à chaque opération."}
      >
        <div className="grid min-w-0 gap-3 md:grid-cols-2">
          {providers.map((provider: RetailProvider) => {
            const mappedId = provider.providerType === "MOBILE_MONEY" ? provider.mobileMoneyFloatAccountId : provider.telcoFloatAccountId;
            return (
              <form
                key={provider.id}
                onSubmit={async (event) => {
                  event.preventDefault();
                  const form = new FormData(event.currentTarget);
                  await mutate(
                    `provider-${provider.id}`,
                    `/api/enterprise/${organizationId}/retail/providers?moduleCode=${moduleCode}`,
                    {
                      providerCode: provider.providerCode,
                      label: provider.label,
                      providerType: provider.providerType,
                      mobileMoneyFloatAccountId: provider.providerType === "MOBILE_MONEY" ? String(form.get("operatorAccountId") || "") || null : null,
                      telcoFloatAccountId: provider.providerType === "TELCO" ? String(form.get("operatorAccountId") || "") || null : null,
                      isActive: true,
                    },
                    locale === "en" ? "Operator account saved." : "Compte opérateur enregistré.",
                    { idempotent: false },
                  );
                }}
                className="min-w-0 rounded-2xl border border-dtsc-border bg-dtsc-page p-4"
              >
                <div className="flex min-w-0 items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="break-words font-black text-dtsc-ink">{provider.label}</p>
                    <p className="text-xs font-bold text-dtsc-muted">{locale === "en" ? "Current account" : "Compte actuel"}: {accountName(mappedId)}</p>
                  </div>
                  <StatusBadge tone={mappedId ? "success" : "warning"}>{mappedId ? "OK" : (locale === "en" ? "To configure" : "À configurer")}</StatusBadge>
                </div>
                {dashboard.access.canManage ? (
                  <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                    <Field label={accountTypeLabel}>
                      <Select name="operatorAccountId" defaultValue={mappedId || ""}>
                        <option value="">—</option>
                        {(provider.providerType === "MOBILE_MONEY" ? mobileAccounts : telcoAccounts).map((account) => (
                          <option key={account.id} value={account.id}>{account.name} · {account.currencyCode} · {customerFacingFinancialAccountType(account.accountType, locale)}</option>
                        ))}
                      </Select>
                    </Field>
                    <Button disabled={Boolean(busyAction)}><Settings2 className="h-4 w-4" />{locale === "en" ? "Save" : "Enregistrer"}</Button>
                  </div>
                ) : null}
              </form>
            );
          })}
          {!providers.length ? <EmptyState compact title={locale === "en" ? "No operator configured" : "Aucun opérateur configuré"} description={locale === "en" ? "Contact your administrator to enable an operator service." : "Contactez votre administrateur pour activer un service opérateur."} /> : null}
        </div>
      </ModuleSection>
      <RetailErpLinks moduleCode={moduleCode as RetailOperationalModuleCode} locale={locale} />
    </div>
  );
}
