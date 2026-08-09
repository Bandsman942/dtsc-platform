import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";
import type { PostingBuilder } from "@/lib/enterprise/accounting/posting-types";

export const PHARMACY_ACCOUNTING_EVENT_MAP = {
  PHARMACY_SALE_INVOICED: { commonEvent: "SALES_INVOICE_POSTED", sourceEntityType: "EnterpriseSalesInvoice", separatePosting: false },
  PHARMACY_CUSTOMER_PAYMENT_CONFIRMED: { commonEvent: "CUSTOMER_PAYMENT_CONFIRMED", sourceEntityType: "EnterprisePayment", separatePosting: false },
  PHARMACY_REFUND_CONFIRMED: { commonEvent: "SALES_CREDIT_NOTE_POSTED", sourceEntityType: "EnterpriseSalesCreditNote", separatePosting: false },
  PHARMACY_PURCHASE_RECEIVED: { commonEvent: "INVENTORY_RECEIPT_VALUED", sourceEntityType: "EnterpriseInventoryAccountingEvent", separatePosting: false },
  PHARMACY_SUPPLIER_INVOICE_POSTED: { commonEvent: "SUPPLIER_INVOICE_POSTED", sourceEntityType: "EnterpriseSupplierInvoice", separatePosting: false },
  PHARMACY_STOCK_ISSUED: { commonEvent: "INVENTORY_ISSUE_VALUED", sourceEntityType: "EnterpriseInventoryAccountingEvent", separatePosting: false },
  PHARMACY_STOCK_RETURNED: { commonEvent: "PHARMACY_CUSTOMER_RETURN", sourceEntityType: "EnterpriseSectorInventoryEvent", separatePosting: true },
  PHARMACY_STOCK_LOSS: { commonEvent: "PHARMACY_LOSS", sourceEntityType: "EnterpriseSectorInventoryEvent", separatePosting: true },
  PHARMACY_STOCK_EXPIRED: { commonEvent: "PHARMACY_EXPIRY_WRITE_OFF", sourceEntityType: "EnterpriseSectorInventoryEvent", separatePosting: true },
  PHARMACY_CASH_VARIANCE_POSTED: { commonEvent: "CASH_VARIANCE_POSTED", sourceEntityType: "EnterpriseCashDiscrepancy", separatePosting: false },
} as const;

export const buildPharmacySectorInventoryPosting: PostingBuilder = async (tx, input) => {
  const event = await tx.enterpriseSectorInventoryEvent.findFirst({
    where: {
      id: input.sourceEntityId,
      organizationId: input.organizationId,
      sector: "PHARMACY",
      status: { in: ["APPROVED", "POSTED"] },
      eventType: { in: ["PHARMACY_CUSTOMER_RETURN", "PHARMACY_SUPPLIER_RETURN", "PHARMACY_LOSS", "PHARMACY_EXPIRY_WRITE_OFF", "PHARMACY_ADJUSTMENT", "PHARMACY_RECALL_WRITE_OFF"] },
    },
  });
  if (!event?.totalValue || !event.currencyCode || !event.totalValue.gt(0)) {
    throw new EnterpriseAccountingError("PHARMACY_INVENTORY_EVENT_NOT_POSTABLE", 409);
  }
  const inbound = event.direction === "IN";
  const customerReturn = event.eventType === "PHARMACY_CUSTOMER_RETURN";
  const supplierReturn = event.eventType === "PHARMACY_SUPPLIER_RETURN";
  const debitKey = inbound ? "INVENTORY" : supplierReturn ? "GOODS_RECEIVED_CLEARING" : "OPERATING_EXPENSE";
  const creditKey = inbound ? customerReturn ? "COST_OF_SALES" : "EXPENSE_CLEARING" : "INVENTORY";
  const description = `${event.eventType} ${event.sourceMovementId}`;
  return {
    organizationId: input.organizationId,
    journalType: "INVENTORY",
    accountingDate: event.createdAt,
    documentDate: event.createdAt,
    reference: event.sourceMovementId,
    description,
    sourceModule: "PHARMACY_INVENTORY",
    sourceEntityType: "EnterpriseSectorInventoryEvent",
    sourceEntityId: event.id,
    currencyCode: event.currencyCode,
    lines: [
      { accountMappingKey: debitKey, description, debit: event.totalValue, transactionCurrencyCode: event.currencyCode, transactionAmount: event.totalValue, inventoryItemId: event.inventoryItemId },
      { accountMappingKey: creditKey, description, credit: event.totalValue, transactionCurrencyCode: event.currencyCode, transactionAmount: event.totalValue, inventoryItemId: event.inventoryItemId },
    ],
  };
};
