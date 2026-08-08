export const RETAIL_PROFILE_CODE = "RETAIL_CORE" as const;
export const RETAIL_SECTOR_CODE = "COMMERCE_RETAIL" as const;

export const RETAIL_MODULE_CODES = ["RETAIL_POS", "MOBILE_MONEY_AGENCY", "TELCO_TOPUPS", "RETAIL_DAILY_CLOSE"] as const;
export type RetailModuleCode = (typeof RETAIL_MODULE_CODES)[number];

export const RETAIL_TENDER_METHODS = ["CASH", "MOBILE_MONEY", "BANK_TRANSFER", "CARD"] as const;
export const MOBILE_MONEY_TRANSACTION_TYPES = ["DEPOSIT", "WITHDRAWAL"] as const;
export const MOBILE_MONEY_FEE_COLLECTION_MODES = ["NONE", "CASH", "PROVIDER"] as const;
export const TELCO_TOPUP_STATUSES = ["SUCCESS", "FAILED"] as const;
export const RETAIL_CLOSE_ACCOUNT_TYPES = ["CASH", "MOBILE_MONEY", "CLEARING"] as const;

export const RETAIL_LOYALTY_PROGRAM_STATUSES = ["DRAFT", "ACTIVE", "PAUSED", "ENDED"] as const;
export const RETAIL_LOYALTY_ACCOUNT_STATUSES = ["ACTIVE", "SUSPENDED", "CLOSED"] as const;
export const RETAIL_LOYALTY_ENTRY_TYPES = ["EARN", "REDEEM", "REVERSAL", "EXPIRY", "ADJUSTMENT"] as const;
export const RETAIL_STORED_VALUE_ACCOUNT_TYPES = ["GIFT_CARD", "STORE_CREDIT"] as const;
export const RETAIL_STORED_VALUE_STATUSES = ["ACTIVE", "SUSPENDED", "EXHAUSTED", "EXPIRED", "CLOSED"] as const;
export const RETAIL_STORED_VALUE_ENTRY_TYPES = ["ISSUE", "REDEEM", "REFUND", "REVERSAL", "ADJUSTMENT", "EXPIRY"] as const;
export const RETAIL_PAYMENT_STATUSES = ["INITIATED", "AUTHORIZED", "CAPTURED", "FAILED", "VOIDED", "REFUNDED"] as const;
export const RETAIL_PROVIDER_OPERATION_STATUSES = ["INITIATED", "PENDING_PROVIDER", "CONFIRMED", "FAILED", "UNKNOWN", "RECONCILED"] as const;
export const RETAIL_PROVIDER_INTEGRATION_MODES = ["MANUAL", "CONNECTED"] as const;
export const RETAIL_PROVIDER_CONNECTION_STATUSES = ["NOT_CONFIGURED", "DISCONNECTED", "CONNECTED", "DEGRADED"] as const;
export const RETAIL_DEVICE_TYPES = ["BARCODE_SCANNER", "RECEIPT_PRINTER", "CASH_DRAWER", "PAYMENT_TERMINAL", "CUSTOMER_DISPLAY", "SCALE"] as const;
export const RETAIL_DEVICE_CONNECTION_MODES = ["BROWSER", "WEBUSB", "WEBBLUETOOTH", "WEBSERIAL", "NETWORK", "NATIVE_BRIDGE", "MANUAL"] as const;

export const RETAIL_PAYMENT_TRANSITIONS: Record<string, readonly string[]> = {
  INITIATED: ["AUTHORIZED", "CAPTURED", "FAILED", "VOIDED"],
  AUTHORIZED: ["CAPTURED", "FAILED", "VOIDED"],
  CAPTURED: ["REFUNDED"],
  FAILED: [],
  VOIDED: [],
  REFUNDED: [],
};

export const RETAIL_PROVIDER_OPERATION_TRANSITIONS: Record<string, readonly string[]> = {
  INITIATED: ["PENDING_PROVIDER", "CONFIRMED", "FAILED", "UNKNOWN"],
  PENDING_PROVIDER: ["CONFIRMED", "FAILED", "UNKNOWN"],
  UNKNOWN: ["CONFIRMED", "FAILED", "RECONCILED"],
  CONFIRMED: ["RECONCILED"],
  FAILED: ["RECONCILED"],
  RECONCILED: [],
};

const RETAIL_COMMERCIAL_MANAGER_PERMISSIONS = [
  "enterprise.retail.pos.pricing.manage",
  "enterprise.retail.pos.price_override.manage",
  "enterprise.retail.pos.discount_override.manage",
  "enterprise.retail.pos.tax_override.manage",
  "enterprise.retail.pos.promotions.manage",
  "enterprise.retail.pos.returns.create",
  "enterprise.retail.pos.refunds.manage",
] as const;

const RETAIL_CUSTOMER_PAYMENT_MANAGER_PERMISSIONS = [
  "enterprise.retail.customer.read",
  "enterprise.retail.customer.create",
  "enterprise.retail.customer.manage",
  "enterprise.retail.loyalty.manage",
  "enterprise.retail.loyalty.redeem",
  "enterprise.retail.stored_value.issue",
  "enterprise.retail.stored_value.redeem",
  "enterprise.retail.stored_value.refund",
  "enterprise.retail.payments.manage",
  "enterprise.retail.payments.refund",
  "enterprise.retail.providers.manage",
  "enterprise.retail.providers.reconcile",
  "enterprise.retail.devices.manage",
] as const;

export const RETAIL_POSITION_PERMISSIONS: Record<string, string[]> = {
  STORE_MANAGER: [
    "enterprise.admin.manage",
    "enterprise.admin.members.manage",
    "enterprise.activities.manage",
    "enterprise.retail.pos.manage",
    ...RETAIL_COMMERCIAL_MANAGER_PERMISSIONS,
    ...RETAIL_CUSTOMER_PAYMENT_MANAGER_PERMISSIONS,
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
    "enterprise.retail.pos.pricing.manage",
    "enterprise.retail.pos.price_override.manage",
    "enterprise.retail.pos.discount_override.manage",
    "enterprise.retail.pos.promotions.manage",
    "enterprise.retail.pos.returns.create",
    "enterprise.retail.customer.read",
    "enterprise.retail.customer.create",
    "enterprise.retail.customer.manage",
    "enterprise.retail.loyalty.manage",
    "enterprise.retail.loyalty.redeem",
    "enterprise.retail.stored_value.issue",
    "enterprise.retail.stored_value.redeem",
    "enterprise.retail.payments.manage",
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
    "enterprise.retail.pos.returns.create",
    "enterprise.retail.customer.read",
    "enterprise.retail.loyalty.redeem",
    "enterprise.retail.stored_value.redeem",
    "enterprise.retail.payments.manage",
    "enterprise.retail.telco.read",
    "enterprise.retail.telco.create",
    "enterprise.catalog.read",
    "enterprise.crm.read",
    "enterprise.inventory.read",
  ],
  CASHIER: [
    "enterprise.retail.pos.read",
    "enterprise.retail.pos.create",
    "enterprise.retail.pos.returns.create",
    "enterprise.retail.customer.read",
    "enterprise.retail.loyalty.redeem",
    "enterprise.retail.stored_value.redeem",
    "enterprise.retail.payments.manage",
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
    "enterprise.retail.payments.manage",
    "enterprise.retail.providers.reconcile",
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
    "enterprise.retail.pos.tax_override.manage",
    "enterprise.retail.pos.refunds.manage",
    "enterprise.retail.customer.read",
    "enterprise.retail.loyalty.manage",
    "enterprise.retail.stored_value.refund",
    "enterprise.retail.payments.refund",
    "enterprise.retail.providers.reconcile",
    "enterprise.retail.mobile_money.read",
    "enterprise.retail.telco.read",
    "enterprise.retail.close.read",
    "enterprise.retail.close.validate",
    "enterprise.finance.treasury.read",
    "enterprise.finance.cash.read",
  ],
};

export const RETAIL_PERMISSION_CATALOG = Array.from(new Set(Object.values(RETAIL_POSITION_PERMISSIONS).flat())).sort();
