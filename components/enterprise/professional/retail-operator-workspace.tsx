"use client";

import { useState } from "react";
import { CheckCircle2, RadioTower, RotateCcw, Settings2, Smartphone } from "lucide-react";
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
          : <TelcoPanel organizationId={organizationId} dashboard={dashboard} locale={locale} busyAction={context.busyAction} mutate={context.mutate} />;
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

function TelcoPanel({ organizationId, dashboard, locale, busyAction, mutate }: { organizationId: string; dashboard: RetailDashboard; locale: "fr" | "en"; busyAction: string | null; mutate: RetailMutation }) {
  const providers = (dashboard.providers || []).filter((provider) => provider.providerType === "TELCO");
  const mappedProviders = providers.filter((provider) => provider.telcoFloatAccountId);
  const [pending, setPending] = useState<Record<string, unknown> | null>(null);
  const [tenderMethod, setTenderMethod] = useState("CASH");
  const activeCash = dashboard.cashSession?.status === "OPEN" ? dashboard.cashSession : null;
  const currency = activeCash?.financialAccount.currencyCode || dashboard.configuration?.baseCurrencyCode || "CDF";
  const nonCash = dashboard.accounts.filter((account) => ["MOBILE_MONEY", "BANK", "CLEARING", "CARD_CLEARING"].includes(account.accountType) && account.currencyCode === currency);

  async function confirm() {
    if (!pending) return;
    const body = await mutate(
      "telco-topup",
      `/api/enterprise/${organizationId}/retail/telco-topups`,
      pending,
      locale === "en" ? "Top-up recorded." : "Recharge enregistrée.",
    );
    if (body) setPending(null);
  }

  const selectedProvider = pending ? mappedProviders.find((provider) => provider.providerCode === pending.providerCode) : null;

  return (
    <div className="grid min-w-0 gap-5">
      <OpenCashForm organizationId={organizationId} dashboard={dashboard} locale={locale} busyAction={busyAction} mutate={mutate} />
      <ModuleSection
        title={locale === "en" ? "Airtime / bundle" : "Crédit / forfait"}
        description={locale === "en"
          ? "Choose the network operator and record the customer top-up. The configured operator account is applied automatically."
          : "Choisissez l’opérateur réseau et enregistrez la recharge client. Le compte opérateur configuré est appliqué automatiquement."}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const providerCode = String(form.get("providerCode") || "");
            const status = String(form.get("status") || "SUCCESS");
            const provider = mappedProviders.find((item) => item.providerCode === providerCode);
            const tenderAccountId = tenderMethod === "CASH" ? activeCash?.financialAccount.id || "" : String(form.get("tenderAccountId") || "");
            const externalReference = String(form.get("externalReference") || "").trim();
            if (!provider || !tenderAccountId || (status === "SUCCESS" && !externalReference)) return;
            setPending({
              providerCode,
              destinationPhone: normalizePhonePreview(String(form.get("destinationPhone") || "")),
              catalogItemId: String(form.get("catalogItemId") || "") || null,
              offerLabel: String(form.get("offerLabel") || ""),
              currencyCode: currency,
              saleAmount: Number(form.get("saleAmount") || 0),
              operatorCost: Number(form.get("operatorCost") || 0),
              tenderFinancialAccountId: tenderAccountId,
              operatorFloatAccountId: null,
              externalReference: externalReference || null,
              status,
              failureReason: String(form.get("failureReason") || "") || null,
            });
          }}
          className="grid min-w-0 gap-4"
        >
          <div className="grid min-w-0 gap-4 md:grid-cols-2">
            <Field label={locale === "en" ? "Network" : "Opérateur réseau"}>
              <Select name="providerCode" required><option value="">—</option>{mappedProviders.map((provider) => <option key={provider.id} value={provider.providerCode}>{provider.label}</option>)}</Select>
            </Field>
            <Field label={locale === "en" ? "Destination phone" : "Numéro destinataire"}><Input name="destinationPhone" required inputMode="tel" placeholder={locale === "en" ? "+country code…" : "+indicatif pays…"} /></Field>
            <Field label={locale === "en" ? "Catalog offer (optional)" : "Offre catalogue (facultatif)"}>
              <Select name="catalogItemId"><option value="">—</option>{(dashboard.catalogItems || []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select>
            </Field>
            <Field label={locale === "en" ? "Offer label" : "Libellé du forfait"}><Input name="offerLabel" required /></Field>
            <Field label={locale === "en" ? "Sale price" : "Prix de vente"}><Input name="saleAmount" type="number" min="0.01" step="0.01" required /></Field>
            <Field label={locale === "en" ? "Operator cost" : "Coût opérateur"}><Input name="operatorCost" type="number" min="0" step="0.01" required /></Field>
            <Field label={locale === "en" ? "Payment method" : "Mode d’encaissement"}>
              <Select name="tenderMethod" value={tenderMethod} onChange={setTenderMethod}>
                <option value="CASH">{locale === "en" ? "Cash" : "Espèces"}</option>
                <option value="NON_CASH">{locale === "en" ? "Other configured payment account" : "Autre compte d’encaissement configuré"}</option>
              </Select>
            </Field>
            <Field label={locale === "en" ? "Payment account" : "Compte d’encaissement"}>
              {tenderMethod === "CASH" ? <Input value={activeCash?.financialAccount.name || (locale === "en" ? "Open a till first" : "Ouvrez d’abord une caisse")} readOnly /> : (
                <Select name="tenderAccountId" required><option value="">—</option>{nonCash.map((account) => <option key={account.id} value={account.id}>{account.name} · {account.currencyCode}</option>)}</Select>
              )}
            </Field>
            <Field label={locale === "en" ? "Execution status" : "Statut de l’opération"}>
              <Select name="status" defaultValue="SUCCESS"><option value="SUCCESS">{customerFacingStatusLabel("SUCCESS", locale)}</option><option value="FAILED">{customerFacingStatusLabel("FAILED", locale)}</option></Select>
            </Field>
            <Field label={locale === "en" ? "Operator reference (required on success)" : "Référence opérateur (obligatoire si réussie)"}><Input name="externalReference" maxLength={160} /></Field>
            <Field label={locale === "en" ? "Failure reason" : "Motif d’échec"}><Input name="failureReason" maxLength={500} /></Field>
          </div>
          <Button className="w-fit" disabled={Boolean(busyAction) || !mappedProviders.length || (tenderMethod === "CASH" && !activeCash)}>
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
            `${pending.offerLabel} · ${moneyValue(Number(pending.saleAmount), String(pending.currencyCode))}`,
            String(pending.destinationPhone),
            `${locale === "en" ? "Operator reference" : "Référence opérateur"}: ${pending.externalReference || "—"}`,
            locale === "en" ? "Check the phone number carefully before confirming." : "Vérifiez soigneusement le numéro avant de confirmer.",
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

function ProviderConfiguration({ organizationId, moduleCode, dashboard, locale, busyAction, mutate }: { organizationId: string; moduleCode: "MOBILE_MONEY_AGENCY" | "TELCO_TOPUPS"; dashboard: RetailDashboard; locale: "fr" | "en"; busyAction: string | null; mutate: RetailMutation }) {
  const expectedType = moduleCode === "MOBILE_MONEY_AGENCY" ? "MOBILE_MONEY" : "TELCO";
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
