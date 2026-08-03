export type CrossModuleProjectorCode =
  | "SALES_INVOICE_CONTINUITY"
  | "SUPPLIER_INVOICE_CONTINUITY"
  | "PAYMENT_CONTINUITY"
  | "PAYROLL_CONTINUITY"
  | "PROJECT_BILLING_CONTINUITY"
  | "ASSET_ACCOUNTING_CONTINUITY"
  | "INVENTORY_CONTINUITY"
  | "HEALTH_FINANCE_CONTINUITY"
  | "PHARMACY_FINANCE_CONTINUITY";

export type CrossModuleEventDefinition = {
  eventType: string;
  canonicalEventType: string;
  consumerCode: string;
  sourceModule: string;
  targetModule: string;
  projectorCode: CrossModuleProjectorCode;
  confidential?: boolean;
};

const DEFINITIONS: CrossModuleEventDefinition[] = [
  {
    eventType: "SALES_INVOICE_ISSUED",
    canonicalEventType: "SALES_INVOICE_ISSUED",
    consumerCode: "receivables-and-ledger",
    sourceModule: "SALES_QUOTES_ORDERS",
    targetModule: "FINANCE_RECEIVABLES",
    projectorCode: "SALES_INVOICE_CONTINUITY",
  },
  {
    eventType: "SUPPLIER_INVOICE_POSTED",
    canonicalEventType: "SUPPLIER_INVOICE_APPROVED",
    consumerCode: "payables-and-ledger",
    sourceModule: "SUPPLIERS_PURCHASES",
    targetModule: "FINANCE_PAYABLES",
    projectorCode: "SUPPLIER_INVOICE_CONTINUITY",
  },
  {
    eventType: "PAYMENT_CONFIRMED",
    canonicalEventType: "PAYMENT_CONFIRMED",
    consumerCode: "payment-allocation-continuity",
    sourceModule: "FINANCE_PAYMENTS",
    targetModule: "FINANCE_TREASURY",
    projectorCode: "PAYMENT_CONTINUITY",
  },
  {
    eventType: "PAYMENT_ALLOCATED",
    canonicalEventType: "PAYMENT_CONFIRMED",
    consumerCode: "payment-target-continuity",
    sourceModule: "FINANCE_PAYMENTS",
    targetModule: "FINANCE_RECEIVABLES",
    projectorCode: "PAYMENT_CONTINUITY",
  },
  {
    eventType: "PAYROLL_RUN_APPROVED",
    canonicalEventType: "PAYROLL_APPROVED",
    consumerCode: "payroll-finance-continuity",
    sourceModule: "PAYROLL_OPERATIONS",
    targetModule: "FINANCE_PAYABLES",
    projectorCode: "PAYROLL_CONTINUITY",
    confidential: true,
  },
  {
    eventType: "PROJECT_DELIVERABLE_ACCEPTED",
    canonicalEventType: "PROJECT_DELIVERABLE_APPROVED",
    consumerCode: "project-billing-continuity",
    sourceModule: "TIME_DELIVERABLES",
    targetModule: "FINANCE_RECEIVABLES",
    projectorCode: "PROJECT_BILLING_CONTINUITY",
  },
  {
    eventType: "ASSET_ACCOUNTING_PROFILE_CREATED",
    canonicalEventType: "ASSET_CAPITALIZED",
    consumerCode: "operational-asset-accounting-continuity",
    sourceModule: "ASSETS_MAINTENANCE",
    targetModule: "FINANCE_ASSETS",
    projectorCode: "ASSET_ACCOUNTING_CONTINUITY",
  },
  {
    eventType: "HEALTH_MEDICAL_INVOICE_CREATED",
    canonicalEventType: "HEALTH_SERVICE_BILLED",
    consumerCode: "health-common-finance-continuity",
    sourceModule: "MEDICAL_BILLING",
    targetModule: "FINANCE_RECEIVABLES",
    projectorCode: "HEALTH_FINANCE_CONTINUITY",
    confidential: true,
  },
  {
    eventType: "PHARMACY_SALE_INVOICE_CREATED",
    canonicalEventType: "PHARMACY_SALE_COMPLETED",
    consumerCode: "pharmacy-common-finance-continuity",
    sourceModule: "PHARMACY_SALES",
    targetModule: "FINANCE_RECEIVABLES",
    projectorCode: "PHARMACY_FINANCE_CONTINUITY",
  },
];

const STOCK_EVENT_TYPES = new Set([
  "STOCK_PURCHASE_RECEIPT",
  "STOCK_SALE_FULFILLMENT",
  "STOCK_TRANSFER_OUT",
  "STOCK_TRANSFER_IN",
  "STOCK_ADJUSTMENT_IN",
  "STOCK_ADJUSTMENT_OUT",
  "STOCK_RETURN_IN",
  "STOCK_RETURN_OUT",
  "STOCK_COUNT_CORRECTION",
  "STOCK_OPENING_BALANCE",
]);

export function crossModuleDefinitionsFor(eventType: string): CrossModuleEventDefinition[] {
  const direct = DEFINITIONS.filter((definition) => definition.eventType === eventType);
  if (direct.length) return direct;
  if (STOCK_EVENT_TYPES.has(eventType)) {
    return [{
      eventType,
      canonicalEventType: eventType,
      consumerCode: "inventory-physical-accounting-continuity",
      sourceModule: "INVENTORY_LOGISTICS",
      targetModule: "FINANCE_INVENTORY",
      projectorCode: "INVENTORY_CONTINUITY",
    }];
  }
  return [];
}

export const CROSS_MODULE_EVENT_CATALOG = Object.freeze([...DEFINITIONS]);
export const CROSS_MODULE_STOCK_EVENT_TYPES = Object.freeze([...STOCK_EVENT_TYPES]);
