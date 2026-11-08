/** Public, tenant-neutral Finance import templates; never include database IDs. */
export const FINANCE_IMPORT_COLUMNS = {
  tax: [
    { key: "code", fr: "Code taxe", en: "Tax code" },
    { key: "nameFr", fr: "Libellé français", en: "French label" },
    { key: "nameEn", fr: "Libellé anglais", en: "English label" },
    { key: "category", fr: "Catégorie", en: "Category" },
    { key: "rate", fr: "Taux décimal", en: "Decimal rate" },
    { key: "effectiveFrom", fr: "Date de début", en: "Effective date" },
    { key: "jurisdiction", fr: "Juridiction (facultatif)", en: "Jurisdiction (optional)" },
  ],
  accounts: [
    { key: "chartCode", fr: "Code du plan", en: "Chart code" },
    { key: "parentCode", fr: "Compte parent", en: "Parent account" },
    { key: "code", fr: "Code sous-compte", en: "Child account code" },
    { key: "nameFr", fr: "Libellé français", en: "French label" },
    { key: "nameEn", fr: "Libellé anglais", en: "English label" },
    { key: "currencyCode", fr: "Devise (facultatif)", en: "Currency (optional)" },
  ],
} as const;
