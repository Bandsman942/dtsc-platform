import type { CustomerFacingLocale } from "@/lib/customer-facing-language";

const MOBILE_MONEY_TRANSACTION_LABELS: Record<string, { fr: string; en: string }> = {
  DEPOSIT: { fr: "Dépôt", en: "Deposit" },
  WITHDRAWAL: { fr: "Retrait", en: "Withdrawal" },
};

const FEE_COLLECTION_LABELS: Record<string, { fr: string; en: string }> = {
  NONE: { fr: "Aucun frais séparé", en: "No separate fee" },
  CASH: { fr: "Frais encaissés en espèces", en: "Fee collected in cash" },
  PROVIDER: { fr: "Frais prélevés sur le service Mobile Money", en: "Fee collected through Mobile Money" },
};

export function customerFacingMobileMoneyTransactionType(code: string | null | undefined, locale: CustomerFacingLocale) {
  const normalized = code?.trim().toUpperCase() || "";
  return MOBILE_MONEY_TRANSACTION_LABELS[normalized]?.[locale] || (locale === "en" ? "Mobile Money operation" : "Opération Mobile Money");
}

export function customerFacingFeeCollectionMode(code: string | null | undefined, locale: CustomerFacingLocale) {
  const normalized = code?.trim().toUpperCase() || "";
  return FEE_COLLECTION_LABELS[normalized]?.[locale] || (locale === "en" ? "Fee handling" : "Traitement des frais");
}
