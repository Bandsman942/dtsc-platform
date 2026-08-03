const MODULE_BY_ENTITY: Record<string, string> = {
  EnterpriseBusinessParty: "CRM_CUSTOMERS",
  EnterpriseLead: "CRM_PIPELINE",
  EnterpriseOpportunity: "CRM_PIPELINE",
  EnterpriseQuote: "SALES_QUOTES_ORDERS",
  EnterpriseSalesOrder: "SALES_QUOTES_ORDERS",
  EnterpriseFulfillment: "SALES_QUOTES_ORDERS",
  EnterpriseContract: "CONTRACTS",
  EnterprisePurchase: "SUPPLIERS_PURCHASES",
  EnterprisePurchaseReceipt: "SUPPLIERS_PURCHASES",
  EnterpriseInventoryItem: "INVENTORY_LOGISTICS",
  EnterpriseStockMovement: "INVENTORY_LOGISTICS",
  EnterpriseEmployee: "HUMAN_RESOURCES",
  EnterpriseTimesheet: "TIME_ATTENDANCE",
  EnterprisePayrollRun: "PAYROLL_OPERATIONS",
  EnterprisePayslip: "PAYROLL_OPERATIONS",
  EnterpriseProject: "PROJECTS_SERVICES",
  EnterpriseProjectDeliverable: "TIME_DELIVERABLES",
  EnterpriseAsset: "ASSETS_MAINTENANCE",
  EnterpriseAssetAccountingProfile: "FINANCE_ASSETS",
  EnterpriseSalesInvoice: "FINANCE_RECEIVABLES",
  EnterpriseReceivable: "FINANCE_RECEIVABLES",
  EnterpriseSupplierInvoice: "FINANCE_PAYABLES",
  EnterprisePayable: "FINANCE_PAYABLES",
  EnterprisePayment: "FINANCE_PAYMENTS",
  EnterpriseFinancialAccount: "FINANCE_TREASURY",
  EnterpriseJournalEntry: "FINANCE_ACCOUNTING",
  HealthMedicalInvoice: "MEDICAL_BILLING",
  HealthPatient: "PATIENTS",
  PharmacySale: "PHARMACY_SALES",
  PharmacyProduct: "PHARMACY_PRODUCTS",
};

export type EnterpriseDeepLinkInput = {
  entityType: string;
  entityId: string;
  moduleCode?: string;
  tab?: string;
  action?: string;
  section?: string;
  returnTo?: string;
};

export function buildEnterpriseObjectDeepLink(input: EnterpriseDeepLinkInput) {
  const moduleCode = input.moduleCode || MODULE_BY_ENTITY[input.entityType];
  if (!moduleCode) return null;
  const params = new URLSearchParams({ recordId: input.entityId, entityType: input.entityType });
  if (input.tab) params.set("tab", input.tab);
  if (input.section) params.set("section", input.section);
  if (input.action) params.set("action", input.action);
  if (input.returnTo?.startsWith("/")) params.set("returnTo", input.returnTo);
  return `/enterprise-modules/${encodeURIComponent(moduleCode)}?${params.toString()}`;
}

export function moduleCodeForEnterpriseEntity(entityType: string) {
  return MODULE_BY_ENTITY[entityType] || null;
}
