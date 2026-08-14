export const RETAIL_READINESS_DEEP_LINKS: Record<string, string> = {
  COUNTRY_PACK: "/enterprise-modules/RETAIL_POS#shop-country-configuration",
  FUNCTIONAL_CURRENCY: "/enterprise-modules/FINANCE_OVERVIEW",
  SITE: "/enterprise-modules/SITES_WAREHOUSES#sites",
  WAREHOUSE: "/enterprise-modules/SITES_WAREHOUSES#warehouses",
  CASH_ACCOUNT: "/enterprise-modules/FINANCE_TREASURY#cash-accounts",
  CATALOG: "/enterprise-modules/CATALOG#catalog-items",
  INVENTORY_LINKS: "/enterprise-modules/INVENTORY_LOGISTICS#inventory-items",
  TEAM: "/enterprise-admin?section=positions",
  ACCOUNTING: "/enterprise-modules/FINANCE_ACCOUNTING#accounting-readiness",
  RETAIL_CONFIGURATION: "/enterprise-modules/RETAIL_POS#shop-point-of-sale-configuration",
};

export const RETAIL_COUNTRY_CAPABILITY_DEEP_LINKS: Record<string, string> = {
  CORE_LOCALIZATION: "/enterprise-modules/RETAIL_POS#shop-country-configuration",
  MULTI_CURRENCY: "/enterprise-modules/FINANCE_TREASURY/exchange-rates",
  TAX_REFERENCE: "/enterprise-modules/FINANCE_TAX",
  DOCUMENT_NUMBERING: "/enterprise-modules/RETAIL_POS#shop-country-configuration",
  FISCAL_RECEIPT: "/enterprise-modules/RETAIL_POS#shop-country-configuration",
  E_INVOICING: "/enterprise-modules/FINANCE_TAX",
};

export function getRetailReadinessDeepLink(code: string) {
  return RETAIL_READINESS_DEEP_LINKS[code] || "/enterprise-modules/RETAIL_POS#shop-setup";
}

export function getRetailCountryCapabilityDeepLink(code: string) {
  return RETAIL_COUNTRY_CAPABILITY_DEEP_LINKS[code] || "/enterprise-modules/RETAIL_POS#shop-country-configuration";
}
