"use client";

import { useAppLocale } from "@/components/i18n/locale-provider";
import { translateRetailWorkspace, type RetailWorkspaceKey } from "@/lib/i18n";

export function RetailLocaleText({ textKey }: { textKey: RetailWorkspaceKey }) {
  const locale: "fr" | "en" = useAppLocale() === "en" ? "en" : "fr";
  return <>{translateRetailWorkspace(locale, textKey)}</>;
}
