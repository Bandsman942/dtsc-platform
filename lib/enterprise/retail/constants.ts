export const RETAIL_PROFILE_CODE = "RETAIL_CORE" as const;
export const RETAIL_SECTOR_CODE = "COMMERCE_RETAIL" as const;

export const RETAIL_MODULE_CODES = ["RETAIL_POS", "MOBILE_MONEY_AGENCY", "TELCO_TOPUPS", "RETAIL_DAILY_CLOSE"] as const;
export type RetailModuleCode = (typeof RETAIL_MODULE_CODES)[number];

export const RETAIL_TENDER_METHODS = ["CASH", "MOBILE_MONEY", "BANK_TRANSFER", "CARD"] as const;
export const MOBILE_MONEY_TRANSACTION_TYPES = ["DEPOSIT", "WITHDRAWAL"] as const;
export const MOBILE_MONEY_FEE_COLLECTION_MODES = ["NONE", "CASH", "PROVIDER"] as const;
export const TELCO_TOPUP_STATUSES = ["SUCCESS", "FAILED"] as const;
export const RETAIL_CLOSE_ACCOUNT_TYPES = ["CASH", "MOBILE_MONEY", "CLEARING"] as const;

export const RETAIL_POSITION_PERMISSIONS: Record<string, string[]> = {
  STORE_MANAGER: [
    "enterprise.admin.manage",
    "enterprise.admin.members.manage",
    "enterprise.activities.manage",
    "enterprise.retail.pos.manage",
    "enterprise.retail.mobile_money.manage",
    "enterprise.retail.telco.manage",
    "enterprise.retail.close.manage",
    "enterprise.catalog.manage",
    "enterprise.inventory.manage",
    "enterprise.sites.manage",
    "enterprise.crm.manage",
    "enterprise.finance.treasury.manage",
    "enterprise.finance.cash.manage",
  ],
  SALES_MANAGER: [
    "enterprise.retail.pos.manage",
    "enterprise.retail.telco.manage",
    "enterprise.retail.mobile_money.read",
    "enterprise.retail.close.read",
    "enterprise.catalog.update",
    "enterprise.crm.update",
    "enterprise.inventory.read",
  ],
  SELLER: [
    "enterprise.retail.pos.read",
    "enterprise.retail.pos.create",
    "enterprise.retail.telco.read",
    "enterprise.retail.telco.create",
    "enterprise.catalog.read",
    "enterprise.crm.read",
    "enterprise.inventory.read",
  ],
  CASHIER: [
    "enterprise.retail.pos.read",
    "enterprise.retail.pos.create",
    "enterprise.retail.mobile_money.read",
    "enterprise.retail.mobile_money.create",
    "enterprise.retail.close.read",
    "enterprise.retail.close.submit",
    "enterprise.finance.cash.read",
  ],
  MOBILE_MONEY_AGENT: [
    "enterprise.retail.mobile_money.read",
    "enterprise.retail.mobile_money.create",
    "enterprise.retail.telco.read",
    "enterprise.retail.telco.create",
    "enterprise.retail.close.read",
    "enterprise.retail.close.submit",
    "enterprise.finance.treasury.read",
  ],
  STOCK_KEEPER: ["enterprise.inventory.read", "enterprise.inventory.create", "enterprise.catalog.read", "enterprise.sites.read"],
  STOCK_MANAGER: ["enterprise.inventory.manage", "enterprise.catalog.update", "enterprise.sites.update", "enterprise.retail.pos.read"],
  PURCHASE_MANAGER: [
    "enterprise.inventory.read",
    "enterprise.catalog.update",
    "enterprise.sites.read",
    "enterprise.suppliers.view",
    "enterprise.suppliers.manage",
    "enterprise.purchases.manage",
  ],
  RETAIL_CONTROLLER: [
    "enterprise.retail.pos.read",
    "enterprise.retail.mobile_money.read",
    "enterprise.retail.telco.read",
    "enterprise.retail.close.read",
    "enterprise.retail.close.validate",
    "enterprise.finance.treasury.read",
    "enterprise.finance.cash.read",
  ],
};

export const RETAIL_PERMISSION_CATALOG = Array.from(new Set(Object.values(RETAIL_POSITION_PERMISSIONS).flat())).sort();