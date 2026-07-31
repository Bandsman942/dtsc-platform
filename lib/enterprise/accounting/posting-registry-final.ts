import type { PostingEvent } from "@/lib/enterprise/accounting/constants";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";
import type { PostingBuilder } from "@/lib/enterprise/accounting/posting-types";
import {
  buildCashVariancePosting,
  buildCustomerPaymentPosting,
  buildDepreciationPosting,
  buildOpeningBalancePosting,
  buildPaymentAllocationPosting,
  buildPayrollPaymentPosting,
  buildSalesCreditNotePosting,
  buildSalesInvoicePosting,
  buildSupplierInvoicePosting,
  buildSupplierPaymentPosting,
} from "@/lib/enterprise/accounting/core-posting-builders";
import {
  buildAssetCapitalizationPosting,
  buildBankChargePosting,
  buildExpensePosting,
  buildInventoryAccountingPosting,
  buildPayrollPosting,
  buildSupplierCreditNotePosting,
} from "@/lib/enterprise/accounting/domain-posting-builders";
import { buildHealthWriteOffPosting } from "@/lib/enterprise/accounting/sector-adapters/health";
import { buildPharmacySectorInventoryPosting } from "@/lib/enterprise/accounting/sector-adapters/pharmacy";

export const ENTERPRISE_POSTING_REGISTRY: Record<PostingEvent, PostingBuilder> = {
  SALES_INVOICE_POSTED: buildSalesInvoicePosting,
  SALES_CREDIT_NOTE_POSTED: buildSalesCreditNotePosting,
  CUSTOMER_PAYMENT_CONFIRMED: buildCustomerPaymentPosting,
  SUPPLIER_INVOICE_POSTED: buildSupplierInvoicePosting,
  SUPPLIER_CREDIT_NOTE_POSTED: buildSupplierCreditNotePosting,
  SUPPLIER_PAYMENT_CONFIRMED: buildSupplierPaymentPosting,
  PAYMENT_ALLOCATION_CONFIRMED: buildPaymentAllocationPosting,
  EXPENSE_APPROVED: buildExpensePosting,
  PAYROLL_APPROVED: buildPayrollPosting,
  PAYROLL_PAYMENT_CONFIRMED: buildPayrollPaymentPosting,
  INVENTORY_RECEIPT_VALUED: (tx, input) => buildInventoryAccountingPosting(tx, input, "RECEIPT"),
  INVENTORY_ISSUE_VALUED: (tx, input) => buildInventoryAccountingPosting(tx, input, "ISSUE"),
  ASSET_CAPITALIZED: buildAssetCapitalizationPosting,
  ASSET_DEPRECIATION_POSTED: buildDepreciationPosting,
  CASH_VARIANCE_POSTED: buildCashVariancePosting,
  BANK_CHARGE_POSTED: buildBankChargePosting,
  OPENING_BALANCE_POSTED: buildOpeningBalancePosting,
  PHARMACY_CUSTOMER_RETURN: buildPharmacySectorInventoryPosting,
  PHARMACY_SUPPLIER_RETURN: buildPharmacySectorInventoryPosting,
  PHARMACY_LOSS: buildPharmacySectorInventoryPosting,
  PHARMACY_EXPIRY_WRITE_OFF: buildPharmacySectorInventoryPosting,
  PHARMACY_ADJUSTMENT: buildPharmacySectorInventoryPosting,
  PHARMACY_RECALL_WRITE_OFF: buildPharmacySectorInventoryPosting,
  HEALTH_WRITE_OFF_APPROVED: buildHealthWriteOffPosting,
};

export function getPostingBuilder(event: PostingEvent) {
  const builder = ENTERPRISE_POSTING_REGISTRY[event];
  if (!builder) throw new EnterpriseAccountingError("POSTING_EVENT_NOT_REGISTERED", 400, { event });
  return builder;
}
