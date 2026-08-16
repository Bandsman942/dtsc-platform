"use client";

import { useEffect, useState } from "react";
import { translateProfessionalErp, type ProfessionalErpKey } from "@/lib/i18n";

export type ProfessionalErpLocale = "fr" | "en";

export function professionalErpClientLocale(): ProfessionalErpLocale {
  if (typeof document !== "undefined" && document.documentElement.lang.toLowerCase().startsWith("en")) return "en";
  return "fr";
}

export function useProfessionalErpLocale(): ProfessionalErpLocale {
  const [locale, setLocale] = useState<ProfessionalErpLocale>("fr");

  useEffect(() => {
    const update = () => setLocale(professionalErpClientLocale());
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
    return () => observer.disconnect();
  }, []);

  return locale;
}

export function professionalErpT(
  locale: ProfessionalErpLocale,
  key: ProfessionalErpKey,
  values?: Record<string, string | number>,
) {
  let text = translateProfessionalErp(locale, key);
  if (!values) return text;
  for (const [name, value] of Object.entries(values)) text = text.replaceAll(`{{${name}}}`, String(value));
  return text;
}

export function professionalErpEnumLabel(
  locale: ProfessionalErpLocale,
  group: "role" | "identityStatus" | "partyType" | "status" | "opportunityStage" | "leadStatus" | "source" | "contractType" | "approvalStatus" | "renewalMode" | "itemType" | "priceType" | "unitCategory",
  value: string,
) {
  const key = `${group}.${value}` as ProfessionalErpKey;
  const localized = translateProfessionalErp(locale, key);
  return localized || professionalErpT(locale, "common.valueToReview");
}

export function professionalErpMoney(
  value: string | number | null | undefined,
  currency: string | null | undefined,
  locale: ProfessionalErpLocale,
) {
  if (value === null || value === undefined || value === "") return professionalErpT(locale, "common.amountToDefine");
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return professionalErpT(locale, "common.amountToDefine");
  try {
    return new Intl.NumberFormat(locale === "en" ? "en-US" : "fr-FR", {
      style: "currency",
      currency: currency || "USD",
      maximumFractionDigits: 2,
    }).format(numeric);
  } catch {
    return `${numeric.toFixed(2)} ${currency || "USD"}`;
  }
}

export function professionalErpDate(
  value: string | null | undefined,
  locale: ProfessionalErpLocale,
) {
  if (!value) return professionalErpT(locale, "common.notScheduled");
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return professionalErpT(locale, "common.notScheduled");
  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "fr-FR", { dateStyle: "medium" }).format(date);
}
