import type { CustomerFacingLocale } from "@/lib/customer-facing-language";

const MOBILE_MONEY_TRANSACTION_LABELS: Record<string, { fr: string; en: string }> = {
  DEPOSIT: { fr: "Dépôt", en: "Deposit" },
  WITHDRAWAL: { fr: "Retrait", en: "Withdrawal" },
};

const FX_ACCOUNTING_BLOCKER_LABELS: Record<string, { fr: string; en: string }> = {
  POSTING_JOURNAL_REQUIRED: { fr: "journal Mobile Money à configurer", en: "Mobile Money journal needs setup" },
  FINANCE_PERIOD_NOT_FOUND: { fr: "période comptable à ouvrir", en: "accounting period needs to be opened" },
  FINANCE_PERIOD_CLOSED: { fr: "période comptable fermée", en: "accounting period is closed" },
  FINANCE_PERIOD_BLOCKS_DRAFT_MUTATION: { fr: "période comptable verrouillée", en: "accounting period is locked" },
  FINANCE_EXCHANGE_RATE_REQUIRED: { fr: "taux Finance manquant", en: "Finance exchange rate missing" },
  FINANCE_EXCHANGE_RATE_INVALID: { fr: "taux Finance invalide", en: "Finance exchange rate invalid" },
  POSTING_DIRECT_ACCOUNT_INVALID: { fr: "compte comptable du wallet à corriger", en: "wallet ledger account needs correction" },
  POSTING_ACCOUNT_INACTIVE: { fr: "compte comptable inactif", en: "ledger account inactive" },
  POSTING_ACCOUNT_TYPE_INCOMPATIBLE: { fr: "type de compte comptable incompatible", en: "ledger account type incompatible" },
  POSTING_ACCOUNT_SUBTYPE_INCOMPATIBLE: { fr: "sous-type de compte comptable incompatible", en: "ledger account subtype incompatible" },
  RETAIL_MOBILE_MONEY_FX_ACCOUNTS_INVALID: { fr: "comptes Mobile Money à corriger", en: "Mobile Money accounts need correction" },
  POSTING_ACCOUNT_MAPPING_REQUIRED: { fr: "mapping comptable manquant", en: "account mapping missing" },
  POSTING_SEMANTIC_KEY_UNKNOWN: { fr: "mapping comptable à corriger", en: "account mapping needs correction" },
  FINANCE_CONFIGURATION_REQUIRED: { fr: "configuration comptable à terminer", en: "accounting setup needs completion" },
  FINANCE_CONFIGURATION_NOT_READY: { fr: "configuration comptable incomplète", en: "accounting setup incomplete" },
  POSTING_FAILED: { fr: "finalisation comptable à reprendre", en: "accounting finalization needs retry" },
  POSTING_PENDING: { fr: "comptabilisation à finaliser", en: "accounting posting pending" },
};

const FEE_COLLECTION_LABELS: Record<string, { fr: string; en: string }> = {
  NONE: { fr: "Aucun frais séparé", en: "No separate fee" },
  CASH: { fr: "Frais encaissés en espèces", en: "Fee collected in cash" },
  PROVIDER: { fr: "Frais prélevés sur le service Mobile Money", en: "Fee collected through Mobile Money" },
};

export function customerFacingMobileMoneyTransactionType(code: string | null | undefined, locale: CustomerFacingLocale) {
  const normalized = code?.trim().toUpperCase() || "";
  if (normalized === "FX_CONVERSION_POSTED") {
    return locale === "en" ? "Currency conversion · posted" : "Conversion de devises · comptabilisée";
  }
  if (normalized === "FX_CONVERSION_REVERSED") {
    return locale === "en" ? "Currency conversion · reversed" : "Conversion de devises · contrepassée";
  }
  if (normalized.startsWith("FX_CONVERSION_PENDING:")) {
    const errorCode = normalized.slice("FX_CONVERSION_PENDING:".length);
    const blocker = FX_ACCOUNTING_BLOCKER_LABELS[errorCode]?.[locale]
      || (locale === "en" ? "accounting posting pending" : "comptabilisation à finaliser");
    return locale === "en" ? `Currency conversion · ${blocker}` : `Conversion de devises · ${blocker}`;
  }
  return MOBILE_MONEY_TRANSACTION_LABELS[normalized]?.[locale] || (locale === "en" ? "Mobile Money operation" : "Opération Mobile Money");
}

export function customerFacingFeeCollectionMode(code: string | null | undefined, locale: CustomerFacingLocale) {
  const normalized = code?.trim().toUpperCase() || "";
  return FEE_COLLECTION_LABELS[normalized]?.[locale] || (locale === "en" ? "Fee handling" : "Traitement des frais");
}
