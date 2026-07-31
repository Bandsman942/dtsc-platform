import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";
import type { PostingBuilder } from "@/lib/enterprise/accounting/posting-types";

export const HEALTH_ACCOUNTING_EVENT_MAP = {
  HEALTH_MEDICAL_INVOICE_POSTED: { commonEvent: "SALES_INVOICE_POSTED", sourceEntityType: "EnterpriseSalesInvoice", separatePosting: false },
  HEALTH_PATIENT_PAYMENT_CONFIRMED: { commonEvent: "CUSTOMER_PAYMENT_CONFIRMED", sourceEntityType: "EnterprisePayment", separatePosting: false },
  HEALTH_INSURANCE_RECEIVABLE_CREATED: { commonEvent: null, sourceEntityType: "HealthInvoicePayerComponent", separatePosting: false },
  HEALTH_INSURANCE_PAYMENT_CONFIRMED: { commonEvent: "CUSTOMER_PAYMENT_CONFIRMED", sourceEntityType: "EnterprisePayment", separatePosting: false },
  HEALTH_CREDIT_NOTE_POSTED: { commonEvent: "SALES_CREDIT_NOTE_POSTED", sourceEntityType: "EnterpriseSalesCreditNote", separatePosting: false },
  HEALTH_DISPENSATION_INVOICED: { commonEvent: null, sourceEntityType: "HealthBillingExtension", separatePosting: false },
  HEALTH_WRITE_OFF_APPROVED: { commonEvent: "HEALTH_WRITE_OFF_APPROVED", sourceEntityType: "HealthInvoicePayerComponent", separatePosting: true },
} as const;

export const buildHealthWriteOffPosting: PostingBuilder = async (tx, input) => {
  const component = await tx.healthInvoicePayerComponent.findFirst({
    where: {
      id: input.sourceEntityId,
      organizationId: input.organizationId,
      writtenOffAmount: { gt: 0 },
      status: { in: ["WRITTEN_OFF", "PARTIALLY_WRITTEN_OFF", "CLOSED"] },
    },
  });
  if (!component) throw new EnterpriseAccountingError("HEALTH_WRITE_OFF_NOT_POSTABLE", 409);
  return {
    organizationId: input.organizationId,
    journalType: "ADJUSTMENT",
    accountingDate: component.updatedAt,
    documentDate: component.updatedAt,
    reference: component.healthMedicalInvoiceId,
    description: "Approved Health payer write-off",
    sourceModule: "MEDICAL_BILLING",
    sourceEntityType: "HealthInvoicePayerComponent",
    sourceEntityId: component.id,
    currencyCode: component.currencyCode,
    lines: [
      { accountMappingKey: "OPERATING_EXPENSE", description: "Approved receivable write-off", debit: component.writtenOffAmount, transactionCurrencyCode: component.currencyCode, transactionAmount: component.writtenOffAmount, businessPartyId: component.businessPartyId },
      { accountMappingKey: "ACCOUNTS_RECEIVABLE", description: "Health receivable write-off", credit: component.writtenOffAmount, transactionCurrencyCode: component.currencyCode, transactionAmount: component.writtenOffAmount, businessPartyId: component.businessPartyId },
    ],
  };
};
