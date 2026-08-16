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
  for (const [name, value] of Object.entries(values)) {
    text = text.replaceAll(`{{${name}}}`, String(value));
  }
  return text;
}

export function professionalErpEnumLabel(
  locale: ProfessionalErpLocale,
  group: "role" | "identityStatus" | "partyType" | "status",
  value: string,
) {
  const key = `${group}.${value}` as ProfessionalErpKey;
  const localized = translateProfessionalErp(locale, key);
  return localized || professionalErpT(locale, "common.valueToReview");
}
