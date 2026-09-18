"use client";

import { useMemo, useState } from "react";
import { Field } from "@/components/enterprise/core-v2/erp-v2-ui";
import { EnterpriseApproverSelect } from "@/components/enterprise/enterprise-approver-select";
import { Input } from "@/components/ui/input";
import { financeMoney, type FinanceLocale } from "@/components/enterprise/professional/finance-professional-ui";
import { translateEnterpriseFinance, type EnterpriseFinanceKey } from "@/lib/i18n";

const CASH_DENOMINATIONS: Readonly<Record<string, readonly number[]>> = {
  CDF: [20000, 10000, 5000, 1000, 500, 200, 100, 50],
  USD: [100, 50, 20, 10, 5, 1],
};

export function cashDenominationsForCurrency(currencyCode: string) {
  return [...(CASH_DENOMINATIONS[currencyCode.toUpperCase()] || [100, 50, 20, 10, 5, 1])];
}

export function cashCountsFromForm(form: FormData, currencyCode: string) {
  const counts = cashDenominationsForCurrency(currencyCode)
    .map((denomination) => ({ denomination: String(denomination), quantity: Math.max(0, Number(form.get(`denomination_${denomination}`) || 0)) }))
    .filter((item) => Number.isInteger(item.quantity) && item.quantity > 0);
  const customDenomination = Number(form.get("customDenomination") || 0);
  const customQuantity = Math.max(0, Number(form.get("customQuantity") || 0));
  if (customDenomination > 0 && Number.isInteger(customQuantity) && customQuantity > 0) {
    counts.push({ denomination: String(customDenomination), quantity: customQuantity });
  }
  return counts;
}

export function CashPhysicalCountFields({
  organizationId,
  currencyCode,
  expectedAmount,
  locale,
  disabled = false,
}: {
  organizationId: string;
  currencyCode: string;
  expectedAmount: number;
  locale: FinanceLocale;
  disabled?: boolean;
}) {
  const t = (key: EnterpriseFinanceKey) => translateEnterpriseFinance(locale, key);
  const denominations = useMemo(() => cashDenominationsForCurrency(currencyCode), [currencyCode]);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [customDenomination, setCustomDenomination] = useState("");
  const [customQuantity, setCustomQuantity] = useState(0);
  const [reason, setReason] = useState("");
  const countedTotal = denominations.reduce((total, denomination) => total + denomination * (quantities[String(denomination)] || 0), 0)
    + (Number(customDenomination) > 0 ? Number(customDenomination) * customQuantity : 0);
  const difference = countedTotal - expectedAmount;
  const reasonRequired = Math.abs(difference) > 0.000001;

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-5">
      <div className="min-w-0">
        <p className="mb-3 text-xs font-black uppercase tracking-[0.08em] text-dtsc-muted">{t("physicalCount")}</p>
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {denominations.map((denomination) => (
            <label key={denomination} className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-2 rounded-xl border border-dtsc-border bg-dtsc-page p-2">
              <span className="min-w-0 break-words text-sm font-black text-dtsc-ink">{denomination.toLocaleString(locale === "en" ? "en-US" : "fr-FR")} {currencyCode}</span>
              <Input
                name={`denomination_${denomination}`}
                aria-label={`${t("quantity")} ${denomination} ${currencyCode}`}
                type="number"
                min="0"
                step="1"
                inputMode="numeric"
                value={quantities[String(denomination)] || ""}
                onChange={(event) => setQuantities((current) => ({ ...current, [String(denomination)]: Math.max(0, Number(event.target.value || 0)) }))}
                disabled={disabled}
              />
            </label>
          ))}
        </div>
        <div className="mt-3 grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2">
          <Field label={`${t("notesCoinsOf")} — ${t("amount")}`}>
            <Input name="customDenomination" type="number" min="0.000001" step="0.000001" value={customDenomination} onChange={(event) => setCustomDenomination(event.target.value)} disabled={disabled} />
          </Field>
          <Field label={t("quantity")}>
            <Input name="customQuantity" type="number" min="0" step="1" inputMode="numeric" value={customQuantity || ""} onChange={(event) => setCustomQuantity(Math.max(0, Number(event.target.value || 0)))} disabled={disabled} />
          </Field>
        </div>
      </div>

      <input type="hidden" name="countedClosingAmount" value={countedTotal.toFixed(6).replace(/0+$/, "").replace(/\.$/, "") || "0"} />
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-3">
        <div className="min-w-0 rounded-xl border border-dtsc-border bg-dtsc-page p-3"><p className="text-xs font-black uppercase text-dtsc-muted">{t("theoretical")}</p><p className="mt-1 break-words font-black text-dtsc-ink">{financeMoney(expectedAmount, currencyCode, locale)}</p></div>
        <div className="min-w-0 rounded-xl border border-dtsc-border bg-dtsc-page p-3"><p className="text-xs font-black uppercase text-dtsc-muted">{t("counted")}</p><p className="mt-1 break-words font-black text-dtsc-ink">{financeMoney(countedTotal, currencyCode, locale)}</p></div>
        <div className={`min-w-0 rounded-xl border p-3 ${reasonRequired ? "border-amber-500/30 bg-amber-500/10" : "border-emerald-500/30 bg-emerald-500/10"}`}><p className="text-xs font-black uppercase text-dtsc-muted">{t("difference")}</p><p className="mt-1 break-words font-black text-dtsc-ink">{financeMoney(difference, currencyCode, locale)}</p></div>
      </div>

      <Field label={t("varianceExplanation")}>
        <textarea
          name="closingReason"
          rows={4}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          minLength={reasonRequired ? 3 : undefined}
          required={reasonRequired}
          disabled={disabled}
          className="w-full min-w-0 max-w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-base text-dtsc-ink"
        />
      </Field>
      <EnterpriseApproverSelect organizationId={organizationId} moduleCode="FINANCE_CASH" locale={locale} label={t("independentApproval")} disabled={disabled} />
    </div>
  );
}
