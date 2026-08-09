import type { PostingEvent } from "@/lib/enterprise/accounting/constants";

export type ErpFinanceContract = {
  event: PostingEvent;
  domain: "SALES" | "PROCUREMENT" | "PAYMENTS" | "EXPENSES" | "PAYROLL" | "INVENTORY" | "ASSETS" | "CASH_BANK" | "RETAIL" | "PHARMACY" | "HEALTH" | "OPENING";
  sourceEntityType: string;
  journalType: string;
  requiredSemanticKeys: readonly string[];
  rollback: "REVERSAL" | "CREDIT_NOTE" | "RETURN" | "DOMAIN_CONTROLLED";
};

export const ERP_FINANCE_CONTRACT_MATRIX: readonly ErpFinanceContract[] = Object.freeze([
  { event: "SALES_INVOICE_POSTED", domain: "SALES", sourceEntityType: "EnterpriseSalesInvoice", journalType: "SALES", requiredSemanticKeys: ["ACCOUNTS_RECEIVABLE", "SALES_REVENUE", "TAX_PAYABLE"], rollback: "CREDIT_NOTE" },
  { event: "SALES_CREDIT_NOTE_POSTED", domain: "SALES", sourceEntityType: "EnterpriseSalesCreditNote", journalType: "SALES", requiredSemanticKeys: ["ACCOUNTS_RECEIVABLE", "SALES_REVENUE", "TAX_PAYABLE"], rollback: "DOMAIN_CONTROLLED" },
  { event: "CUSTOMER_PAYMENT_CONFIRMED", domain: "PAYMENTS", sourceEntityType: "EnterprisePayment", journalType: "CASH", requiredSemanticKeys: ["ACCOUNTS_RECEIVABLE", "CUSTOMER_ADVANCES"], rollback: "REVERSAL" },
  { event: "SUPPLIER_INVOICE_POSTED", domain: "PROCUREMENT", sourceEntityType: "EnterpriseSupplierInvoice", journalType: "PURCHASES", requiredSemanticKeys: ["ACCOUNTS_PAYABLE", "OPERATING_EXPENSE", "TAX_RECEIVABLE", "GOODS_RECEIVED_CLEARING", "FIXED_ASSET"], rollback: "CREDIT_NOTE" },
  { event: "SUPPLIER_CREDIT_NOTE_POSTED", domain: "PROCUREMENT", sourceEntityType: "EnterpriseSupplierCreditNote", journalType: "PURCHASES", requiredSemanticKeys: ["ACCOUNTS_PAYABLE", "OPERATING_EXPENSE", "TAX_RECEIVABLE", "GOODS_RECEIVED_CLEARING", "FIXED_ASSET"], rollback: "DOMAIN_CONTROLLED" },
  { event: "SUPPLIER_PAYMENT_CONFIRMED", domain: "PAYMENTS", sourceEntityType: "EnterprisePayment", journalType: "CASH", requiredSemanticKeys: ["ACCOUNTS_PAYABLE", "SUPPLIER_ADVANCES"], rollback: "REVERSAL" },
  { event: "PAYMENT_ALLOCATION_CONFIRMED", domain: "PAYMENTS", sourceEntityType: "EnterprisePaymentAllocation", journalType: "GENERAL", requiredSemanticKeys: ["ACCOUNTS_RECEIVABLE", "ACCOUNTS_PAYABLE", "CUSTOMER_ADVANCES", "SUPPLIER_ADVANCES"], rollback: "DOMAIN_CONTROLLED" },
  { event: "EXPENSE_APPROVED", domain: "EXPENSES", sourceEntityType: "EnterpriseExpense", journalType: "PURCHASES", requiredSemanticKeys: ["OPERATING_EXPENSE", "EXPENSE_CLEARING", "EMPLOYEE_PAYABLE"], rollback: "REVERSAL" },
  { event: "PAYROLL_APPROVED", domain: "PAYROLL", sourceEntityType: "EnterprisePayrollRun", journalType: "PAYROLL", requiredSemanticKeys: ["PAYROLL_EXPENSE", "PAYROLL_PAYABLE", "PAYROLL_WITHHOLDING_PAYABLE", "SOCIAL_SECURITY_PAYABLE"], rollback: "REVERSAL" },
  { event: "PAYROLL_PAYMENT_CONFIRMED", domain: "PAYROLL", sourceEntityType: "EnterprisePayment", journalType: "CASH", requiredSemanticKeys: ["PAYROLL_PAYABLE"], rollback: "REVERSAL" },
  { event: "INVENTORY_RECEIPT_VALUED", domain: "INVENTORY", sourceEntityType: "EnterpriseInventoryMovement", journalType: "INVENTORY", requiredSemanticKeys: ["INVENTORY", "GOODS_RECEIVED_CLEARING"], rollback: "RETURN" },
  { event: "INVENTORY_ISSUE_VALUED", domain: "INVENTORY", sourceEntityType: "EnterpriseInventoryMovement", journalType: "INVENTORY", requiredSemanticKeys: ["INVENTORY", "COST_OF_SALES"], rollback: "RETURN" },
  { event: "ASSET_CAPITALIZED", domain: "ASSETS", sourceEntityType: "EnterpriseAccountingAsset", journalType: "ASSETS", requiredSemanticKeys: ["FIXED_ASSET", "ASSET_CLEARING"], rollback: "REVERSAL" },
  { event: "ASSET_DEPRECIATION_POSTED", domain: "ASSETS", sourceEntityType: "EnterpriseAssetDepreciation", journalType: "ASSETS", requiredSemanticKeys: ["ACCUMULATED_DEPRECIATION", "DEPRECIATION_EXPENSE"], rollback: "REVERSAL" },
  { event: "CASH_VARIANCE_POSTED", domain: "CASH_BANK", sourceEntityType: "EnterpriseCashSession", journalType: "CASH", requiredSemanticKeys: ["CASH", "CASH_VARIANCE_EXPENSE", "CASH_VARIANCE_INCOME"], rollback: "REVERSAL" },
  { event: "BANK_CHARGE_POSTED", domain: "CASH_BANK", sourceEntityType: "EnterpriseBankStatementLine", journalType: "BANK", requiredSemanticKeys: ["BANK", "BANK_CHARGE_EXPENSE"], rollback: "REVERSAL" },
  { event: "OPENING_BALANCE_POSTED", domain: "OPENING", sourceEntityType: "EnterpriseOpeningBalance", journalType: "OPENING", requiredSemanticKeys: [], rollback: "REVERSAL" },
  { event: "RETAIL_POS_SALE_POSTED", domain: "RETAIL", sourceEntityType: "EnterpriseRetailSale", journalType: "SALES", requiredSemanticKeys: ["SALES_REVENUE", "TAX_PAYABLE", "CASH", "BANK", "MOBILE_MONEY", "CLEARING"], rollback: "REVERSAL" },
  { event: "RETAIL_POS_SALE_REVERSED", domain: "RETAIL", sourceEntityType: "EnterpriseRetailSale", journalType: "SALES", requiredSemanticKeys: ["SALES_REVENUE", "TAX_PAYABLE", "CASH", "BANK", "MOBILE_MONEY", "CLEARING"], rollback: "DOMAIN_CONTROLLED" },
  { event: "RETAIL_POS_RETURN_POSTED", domain: "RETAIL", sourceEntityType: "EnterpriseRetailReturn", journalType: "SALES", requiredSemanticKeys: ["SALES_REVENUE", "TAX_PAYABLE", "CASH", "BANK", "MOBILE_MONEY", "CLEARING"], rollback: "DOMAIN_CONTROLLED" },
  { event: "RETAIL_POS_INVENTORY_RETURN", domain: "RETAIL", sourceEntityType: "EnterpriseRetailReturn", journalType: "INVENTORY", requiredSemanticKeys: ["INVENTORY", "COST_OF_SALES"], rollback: "DOMAIN_CONTROLLED" },
  { event: "PHARMACY_CUSTOMER_RETURN", domain: "PHARMACY", sourceEntityType: "EnterprisePharmacyFinancialEvent", journalType: "INVENTORY", requiredSemanticKeys: ["INVENTORY", "COST_OF_SALES"], rollback: "DOMAIN_CONTROLLED" },
  { event: "PHARMACY_SUPPLIER_RETURN", domain: "PHARMACY", sourceEntityType: "EnterprisePharmacyFinancialEvent", journalType: "INVENTORY", requiredSemanticKeys: ["INVENTORY", "GOODS_RECEIVED_CLEARING", "EXPENSE_CLEARING"], rollback: "DOMAIN_CONTROLLED" },
  { event: "PHARMACY_LOSS", domain: "PHARMACY", sourceEntityType: "EnterprisePharmacyFinancialEvent", journalType: "INVENTORY", requiredSemanticKeys: ["INVENTORY", "OPERATING_EXPENSE"], rollback: "DOMAIN_CONTROLLED" },
  { event: "PHARMACY_EXPIRY_WRITE_OFF", domain: "PHARMACY", sourceEntityType: "EnterprisePharmacyFinancialEvent", journalType: "INVENTORY", requiredSemanticKeys: ["INVENTORY", "OPERATING_EXPENSE"], rollback: "DOMAIN_CONTROLLED" },
  { event: "PHARMACY_ADJUSTMENT", domain: "PHARMACY", sourceEntityType: "EnterprisePharmacyFinancialEvent", journalType: "INVENTORY", requiredSemanticKeys: ["INVENTORY", "OPERATING_EXPENSE"], rollback: "DOMAIN_CONTROLLED" },
  { event: "PHARMACY_RECALL_WRITE_OFF", domain: "PHARMACY", sourceEntityType: "EnterprisePharmacyFinancialEvent", journalType: "INVENTORY", requiredSemanticKeys: ["INVENTORY", "OPERATING_EXPENSE"], rollback: "DOMAIN_CONTROLLED" },
  { event: "HEALTH_WRITE_OFF_APPROVED", domain: "HEALTH", sourceEntityType: "EnterpriseHealthFinancialEvent", journalType: "GENERAL", requiredSemanticKeys: ["ACCOUNTS_RECEIVABLE", "OPERATING_EXPENSE"], rollback: "DOMAIN_CONTROLLED" },
]);

export function getErpFinanceContract(event: PostingEvent) {
  return ERP_FINANCE_CONTRACT_MATRIX.find((contract) => contract.event === event);
}
