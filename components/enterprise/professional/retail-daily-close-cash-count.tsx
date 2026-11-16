"use client";

import { useMemo, useState } from "react";
import { Field } from "@/components/enterprise/core-v2/erp-v2-ui";
import { cashDenominationsForCurrency } from "@/components/enterprise/professional/cash-physical-count-fields";
import { moneyValue } from "@/components/enterprise/professional/retail-workspace-shared";
import { Input } from "@/components/ui/input";

type Locale = "fr" | "en";

export function cashCountsFromDailyCloseForm(form: FormData, accountId: string, currencyCode: string) {
  const canonical = cashDenominationsForCurrency(currencyCode);
  const counts = canonical.map((denomination) => ({
    denomination,
    quantity: Number(form.get(`count-${accountId}-${denomination}`) || 0),
  }));
  const otherDenominationRaw = String(form.get(`custom-denomination-${accountId}`) || "").trim();
  const otherQuantityRaw = String(form.get(`custom-quantity-${accountId}`) || "").trim();
  if (otherDenominationRaw || otherQuantityRaw) {
    counts.push({ denomination: Number(otherDenominationRaw), quantity: Number(otherQuantityRaw) });
  }
  if (counts.some((item) => !Number.isFinite(item.denomination) || item.denomination <= 0
    || !Number.isInteger(item.quantity) || item.quantity < 0 || item.quantity > 1_000_000)
    || (otherDenominationRaw && canonical.includes(Number(otherDenominationRaw)))) {
    return null;
  }
  // A quantity without a custom denomination (or the reverse) is always incomplete.
  if (Boolean(otherDenominationRaw) !== Boolean(otherQuantityRaw) || (otherDenominationRaw && Number(otherQuantityRaw) === 0)) {
    return null;
  }
  const activeCounts = counts.filter((item) => item.quantity > 0);
  return {
    counts: activeCounts,
    declaredBalance: Number(activeCounts.reduce((total, item) => total + item.denomination * item.quantity, 0).toFixed(2)),
  };
}

export function RetailDailyCloseCashCount({
  accountId,
  currencyCode,
  expectedAmount,
  locale,
  disabled,
}: {
  accountId: string;
  currencyCode: string;
  expectedAmount: number;
  locale: Locale;
  disabled: boolean;
}) {
  const denominations = useMemo(() => cashDenominationsForCurrency(currencyCode), [currencyCode]);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [customDenomination, setCustomDenomination] = useState("");
  const [customQuantity, setCustomQuantity] = useState("");
  const [reason, setReason] = useState("");
  const countedAmount = denominations.reduce((sum, denomination) =>
    sum + denomination * Number(quantities[String(denomination)] || 0), 0)
    + Number(customDenomination || 0) * Number(customQuantity || 0);
  const difference = Number((countedAmount - expectedAmount).toFixed(2));
  const reasonRequired = Number.isFinite(difference) && Math.abs(difference) > 0.005;
  const t = (fr: string, en: string) => locale === "fr" ? fr : en;

  return (
    <div className="grid min-w-0 gap-3" data-daily-close-physical-count={accountId}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-black uppercase tracking-wide text-dtsc-muted">{t("Comptage physique · Quantités par coupure", "Physical count · Quantities per denomination")}</p>
        <span className="rounded-full bg-dtsc-soft px-2.5 py-1 text-xs font-bold text-dtsc-blue">{currencyCode}</span>
      </div>
      <div className="grid min-w-0 gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {denominations.map((denomination) => (
          <label key={denomination} className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(5rem,0.7fr)] items-center gap-2 rounded-xl border border-dtsc-border bg-dtsc-surface p-2.5">
            <span className="break-words text-sm font-extrabold text-dtsc-ink">{denomination.toLocaleString(locale === "fr" ? "fr-FR" : "en-US")} {currencyCode}</span>
            <Input
              type="number"
              name={`count-${accountId}-${denomination}`}
              aria-label={`${t("Quantité", "Quantity")} ${denomination} ${currencyCode}`}
              min="0"
              max="1000000"
              step="1"
              inputMode="numeric"
              value={quantities[String(denomination)] || ""}
              onChange={(event) => setQuantities((previous) => ({ ...previous, [String(denomination)]: event.target.value }))}
              placeholder="0"
              disabled={disabled}
            />
          </label>
        ))}
      </div>
      <div className="grid min-w-0 gap-2 rounded-xl border border-dashed border-dtsc-border bg-dtsc-surface/60 p-3 sm:grid-cols-2">
        <Field label={t("Autre coupure ou pièce (montant)", "Other denomination or coin (amount)")}>
          <Input type="number" name={`custom-denomination-${accountId}`} value={customDenomination}
            onChange={(event) => setCustomDenomination(event.target.value)} min="0.01" step="0.01" inputMode="decimal" disabled={disabled} />
        </Field>
        <Field label={t("Nombre de cette coupure", "Quantity of this denomination")}>
          <Input type="number" name={`custom-quantity-${accountId}`} value={customQuantity}
            onChange={(event) => setCustomQuantity(event.target.value)} min="0" max="1000000" step="1" inputMode="numeric" disabled={disabled} />
        </Field>
      </div>
      <div className="grid min-w-0 gap-2 sm:grid-cols-3" aria-live="polite">
        {[
          { label: t("Solde théorique", "Theoretical balance"), value: expectedAmount, className: "" },
          { label: t("Total compté", "Counted total"), value: countedAmount, className: "" },
          { label: t("Écart", "Variance"), value: difference, className: reasonRequired ? "border-amber-500/40 bg-amber-500/10" : "border-emerald-500/40 bg-emerald-500/10" },
        ].map((item) => (
          <div key={item.label} className={`min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface p-3 ${item.className}`}>
            <p className="text-xs font-bold uppercase text-dtsc-muted">{item.label}</p>
            <p className="mt-1 break-words text-base font-black text-dtsc-ink">{moneyValue(item.value, currencyCode, locale)}</p>
          </div>
        ))}
      </div>
      <Field label={t("Justification de l'écart", "Variance explanation")}>
        <Input name={`reason-${accountId}`} value={reason} onChange={(event) => setReason(event.target.value)}
          required={reasonRequired} minLength={reasonRequired ? 3 : undefined} maxLength={1000} disabled={disabled}
          placeholder={reasonRequired ? t("Justification obligatoire", "Explanation required") : t("Facultatif sans écart", "Optional without variance")} />
      </Field>
    </div>
  );
}

export function RetailDailyCloseNonCashCount({
  accountId, currencyCode, expectedAmount, locale, disabled,
}: {
  accountId: string; currencyCode: string; expectedAmount: number; locale: Locale; disabled: boolean;
}) {
  const [declared, setDeclared] = useState(String(expectedAmount));
  const [reason, setReason] = useState("");
  const difference = Number((Number(declared || 0) - expectedAmount).toFixed(2));
  const needsReason = Number.isFinite(difference) && Math.abs(difference) > 0.005;
  return (
    <div className="grid min-w-0 gap-3 sm:grid-cols-2" data-daily-close-account-reconciliation={accountId}>
      <Field label={locale === "fr" ? "Solde déclaré" : "Declared balance"}>
        <Input type="number" min="0" step="0.01" name={`declared-${accountId}`}
          value={declared} onChange={(event) => setDeclared(event.target.value)} disabled={disabled} required />
      </Field>
      <div className={`rounded-xl border p-3 ${needsReason ? "border-amber-500/40 bg-amber-500/10" : "border-emerald-500/40 bg-emerald-500/10"}`}>
        <p className="text-xs font-bold uppercase text-dtsc-muted">{locale === "fr" ? "Écart" : "Variance"}</p>
        <p className="text-base font-black text-dtsc-ink">{moneyValue(difference, currencyCode, locale)}</p>
        <p className="mt-1 text-xs text-dtsc-muted">{locale === "fr" ? "Solde système" : "System balance"}: {moneyValue(expectedAmount, currencyCode, locale)}</p>
      </div>
      <div className="sm:col-span-2">
        <Field label={locale === "fr" ? "Justification de l'écart" : "Variance explanation"}>
          <Input name={`reason-${accountId}`} value={reason} onChange={(event) => setReason(event.target.value)}
            required={needsReason} minLength={needsReason ? 3 : undefined} maxLength={1000} disabled={disabled} />
        </Field>
      </div>
    </div>
  );
}
