export type ReferenceChoice = { id: string; label: string };

type LocalizedReferenceChoice = {
  id: string;
  fr: string;
  en: string;
};

export const PAYMENT_METHOD_CODES = ["BANK_TRANSFER", "CASH", "MOBILE_MONEY", "CARD", "CHECK"] as const;

export type ControlledReferenceKind = "currency" | "unit" | "paymentMethod";

const CURRENCY_OPTIONS: readonly LocalizedReferenceChoice[] = [
  { id: "USD", fr: "Dollar américain (USD)", en: "US dollar (USD)" },
  { id: "CDF", fr: "Franc congolais (CDF)", en: "Congolese franc (CDF)" },
  { id: "EUR", fr: "Euro (EUR)", en: "Euro (EUR)" },
  { id: "GBP", fr: "Livre sterling (GBP)", en: "Pound sterling (GBP)" },
  { id: "CAD", fr: "Dollar canadien (CAD)", en: "Canadian dollar (CAD)" },
  { id: "CHF", fr: "Franc suisse (CHF)", en: "Swiss franc (CHF)" },
  { id: "ZAR", fr: "Rand sud-africain (ZAR)", en: "South African rand (ZAR)" },
  { id: "KES", fr: "Shilling kényan (KES)", en: "Kenyan shilling (KES)" },
  { id: "UGX", fr: "Shilling ougandais (UGX)", en: "Ugandan shilling (UGX)" },
  { id: "TZS", fr: "Shilling tanzanien (TZS)", en: "Tanzanian shilling (TZS)" },
  { id: "RWF", fr: "Franc rwandais (RWF)", en: "Rwandan franc (RWF)" },
  { id: "XAF", fr: "Franc CFA CEMAC (XAF)", en: "CFA franc BEAC (XAF)" },
  { id: "XOF", fr: "Franc CFA UEMOA (XOF)", en: "CFA franc BCEAO (XOF)" },
  { id: "NGN", fr: "Naira nigérian (NGN)", en: "Nigerian naira (NGN)" },
] as const;

const UNIT_OPTIONS: readonly LocalizedReferenceChoice[] = [
  { id: "unit", fr: "Unité", en: "Unit" },
  { id: "box", fr: "Boîte", en: "Box" },
  { id: "pack", fr: "Paquet", en: "Pack" },
  { id: "kg", fr: "Kilogramme (kg)", en: "Kilogram (kg)" },
  { id: "g", fr: "Gramme (g)", en: "Gram (g)" },
  { id: "l", fr: "Litre (L)", en: "Litre (L)" },
  { id: "ml", fr: "Millilitre (mL)", en: "Millilitre (mL)" },
  { id: "m", fr: "Mètre (m)", en: "Metre (m)" },
  { id: "cm", fr: "Centimètre (cm)", en: "Centimetre (cm)" },
  { id: "hour", fr: "Heure", en: "Hour" },
  { id: "day", fr: "Jour", en: "Day" },
  { id: "service", fr: "Prestation / service", en: "Service" },
] as const;

const PAYMENT_METHOD_OPTIONS: readonly LocalizedReferenceChoice[] = [
  { id: "BANK_TRANSFER", fr: "Virement bancaire", en: "Bank transfer" },
  { id: "CASH", fr: "Espèces", en: "Cash" },
  { id: "MOBILE_MONEY", fr: "Mobile Money", en: "Mobile Money" },
  { id: "CARD", fr: "Carte bancaire", en: "Payment card" },
  { id: "CHECK", fr: "Chèque", en: "Cheque" },
] as const;

const CONTROLLED_REFERENCE_FIELDS: Readonly<Record<string, ControlledReferenceKind>> = {
  currency: "currency",
  currencyCode: "currency",
  unit: "unit",
  unitCode: "unit",
  paymentMethod: "paymentMethod",
};

const GENERIC_FIELD_HELP = {
  fr: {
    currency: "Choisissez la devise utilisée pour enregistrer et afficher les montants. La sélection évite les codes monétaires invalides ou incohérents.",
    unit: "Choisissez l’unité standard correspondant à la quantité. Cela évite les variantes manuelles pour une même unité.",
    status: "Choisissez l’état métier correspondant à la situation actuelle de cet élément.",
    priority: "Choisissez le niveau de priorité qui reflète l’urgence réelle et l’ordre de traitement attendu.",
    type: "Choisissez le type métier correspondant afin de garder des données homogènes et filtrables.",
    category: "Choisissez une catégorie existante lorsqu’un référentiel est proposé ; n’utilisez du texte libre que pour une catégorie réellement personnalisable.",
    paymentMethod: "Choisissez le mode de paiement réellement utilisé afin de fiabiliser le rapprochement et le suivi financier.",
  },
  en: {
    currency: "Choose the currency used to record and display amounts. A controlled choice prevents invalid or inconsistent currency codes.",
    unit: "Choose the standard unit matching the quantity. This prevents manual variants for the same unit.",
    status: "Choose the business status that matches the item’s current situation.",
    priority: "Choose the priority level that reflects the real urgency and expected processing order.",
    type: "Choose the matching business type so records remain consistent and filterable.",
    category: "Choose an existing category when a reference list is available; use free text only when the category is genuinely customizable.",
    paymentMethod: "Choose the payment method actually used so reconciliation and financial tracking remain reliable.",
  },
} as const;

function isEnglish(locale: string | null | undefined) {
  return String(locale || "fr").toLowerCase().startsWith("en");
}

function localize(options: readonly LocalizedReferenceChoice[], locale: string | null | undefined): ReferenceChoice[] {
  const english = isEnglish(locale);
  return options.map((item) => ({ id: item.id, label: english ? item.en : item.fr }));
}

export function currencyChoices(locale?: string | null): ReferenceChoice[] {
  return localize(CURRENCY_OPTIONS, locale);
}

export function unitChoices(locale?: string | null): ReferenceChoice[] {
  return localize(UNIT_OPTIONS, locale);
}

export function paymentMethodChoices(locale?: string | null): ReferenceChoice[] {
  return localize(PAYMENT_METHOD_OPTIONS, locale);
}

export function controlledReferenceKind(fieldName: string | null | undefined): ControlledReferenceKind | null {
  if (!fieldName) return null;
  return CONTROLLED_REFERENCE_FIELDS[fieldName] || null;
}

export function controlledReferenceChoices(kind: ControlledReferenceKind, locale?: string | null): ReferenceChoice[] {
  if (kind === "currency") return currencyChoices(locale);
  if (kind === "unit") return unitChoices(locale);
  return paymentMethodChoices(locale);
}

export function referenceChoiceLabel(kind: ControlledReferenceKind, value: string | null | undefined, locale?: string | null): string {
  if (!value) return "";
  return controlledReferenceChoices(kind, locale).find((item) => item.id === value)?.label || value;
}

export function referenceFieldHelp(fieldName: string | null | undefined, locale?: string | null): string | undefined {
  if (!fieldName) return undefined;
  const language = isEnglish(locale) ? "en" : "fr";
  const normalized = fieldName === "currencyCode" ? "currency" : fieldName === "unitCode" ? "unit" : fieldName;
  return GENERIC_FIELD_HELP[language][normalized as keyof typeof GENERIC_FIELD_HELP.fr];
}

export const controlledReferenceFieldNames = Object.freeze(Object.keys(CONTROLLED_REFERENCE_FIELDS));
