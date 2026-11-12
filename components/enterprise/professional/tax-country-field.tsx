"use client";

import { useEffect, useMemo, useState } from "react";
import { normalizeTaxCountryCode, taxCountryOptions } from "@/lib/enterprise/accounting/tax-jurisdictions";

type Props = {
  organizationId: string;
  locale: "fr" | "en";
  disabled?: boolean;
  value?: string;
  onChange?: (value: string) => void;
  required?: boolean;
};

export function TaxCountryField({ organizationId, locale, disabled, value, onChange, required = true }: Props) {
  const [ownValue, setOwnValue] = useState("");
  const countries = useMemo(() => taxCountryOptions(locale), [locale]);
  useEffect(() => {
    if (value !== undefined) return;
    const controller = new AbortController();
    void fetch(`/api/enterprise/${organizationId}/taxes/catalog`, { cache: "no-store", signal: controller.signal })
      .then((response) => response.ok ? response.json() as Promise<{ countryCode: string | null }> : null)
      .then((body) => { if (!controller.signal.aborted && body?.countryCode) setOwnValue(body.countryCode); })
      .catch(() => { /* User can select a jurisdiction manually; no implicit fallback. */ });
    return () => controller.abort();
  }, [organizationId, value]);
  const selected = value !== undefined ? (normalizeTaxCountryCode(value) || value) : ownValue;
  return <label className="grid min-w-0 gap-1 text-sm font-bold text-dtsc-ink">
    {locale === "en" ? "Tax jurisdiction (country)" : "Juridiction fiscale (pays)"} {required ? "*" : ""}
    <select
      name="jurisdiction"
      value={selected}
      disabled={disabled}
      required={required}
      onChange={(event) => { setOwnValue(event.target.value); onChange?.(event.target.value); }}
      className="h-11 min-w-0 max-w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-dtsc-ink"
    >
      <option value="">{locale === "en" ? "Choose a country" : "Choisir un pays"}</option>
      {countries.map((country) => <option key={country.code} value={country.code}>{country.label}</option>)}
    </select>
    <span className="text-xs font-normal text-dtsc-muted">
      {locale === "en" ? "Defaults to the company country; tax application is determined per eligible operation." : "Pays proposé depuis l'entreprise ; l'application dépend ensuite de chaque opération éligible."}
    </span>
  </label>;
}
