/** Stable, tenant-neutral import contract. Codes are resolved server-side. */
export const CATALOG_IMPORT_COLUMNS = [
  { key: "name", fr: "Nom", en: "Name" },
  { key: "itemType", fr: "Type", en: "Type" },
  { key: "sku", fr: "Référence SKU", en: "SKU" },
  { key: "description", fr: "Description", en: "Description" },
  { key: "categoryCode", fr: "Code catégorie", en: "Category code" },
  { key: "unitCode", fr: "Code unité", en: "Unit code" },
  { key: "salePrice", fr: "Prix de vente", en: "Sale price" },
  { key: "cost", fr: "Coût d’achat", en: "Purchase cost" },
  { key: "currency", fr: "Devise", en: "Currency" },
  { key: "taxable", fr: "Taxable", en: "Taxable" },
  { key: "taxCode", fr: "Code taxe", en: "Tax code" },
  { key: "trackInventory", fr: "Suivi de stock", en: "Track inventory" },
] as const;

export const CATALOG_IMPORT_MAX_ROWS = 200;
export const CATALOG_IMPORT_MAX_BYTES = 2 * 1024 * 1024;
