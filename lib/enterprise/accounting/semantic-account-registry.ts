import type { AccountingChartTemplateDefinition } from "@/lib/enterprise/accounting/chart-template-types";

export type SemanticAccountCategory =
  | "RECEIVABLE"
  | "PAYABLE"
  | "REVENUE"
  | "EXPENSE"
  | "TAX"
  | "INVENTORY"
  | "TREASURY"
  | "ASSET"
  | "CLEARING"
  | "PAYROLL"
  | "EQUITY";

export type SemanticAccountDefinition = {
  key: string;
  domain: string;
  labelFr: string;
  labelEn: string;
  category: SemanticAccountCategory;
  expectedAccountTypes: readonly string[];
  expectedAccountSubtypes?: readonly string[];
  requiredForPosting: boolean;
  fallbackAllowed: boolean;
  consumerEvents: readonly string[];
  deprecated?: boolean;
};

export const SEMANTIC_ACCOUNT_REGISTRY: readonly SemanticAccountDefinition[] = Object.freeze([
  { key: "ACCOUNTS_RECEIVABLE", domain: "SALES", labelFr: "Créances clients", labelEn: "Accounts receivable", category: "RECEIVABLE", expectedAccountTypes: ["ASSET"], expectedAccountSubtypes: ["ACCOUNTS_RECEIVABLE"], requiredForPosting: true, fallbackAllowed: false, consumerEvents: ["SALES_INVOICE_POSTED", "SALES_CREDIT_NOTE_POSTED", "CUSTOMER_PAYMENT_CONFIRMED", "PAYMENT_ALLOCATION_CONFIRMED", "HEALTH_WRITE_OFF_APPROVED"] },
  { key: "ACCRUED_RECEIVABLES", domain: "SALES", labelFr: "Produits à recevoir", labelEn: "Accrued receivables", category: "RECEIVABLE", expectedAccountTypes: ["ASSET"], expectedAccountSubtypes: ["ACCOUNTS_RECEIVABLE"], requiredForPosting: false, fallbackAllowed: false, consumerEvents: [] },
  { key: "ACCOUNTS_PAYABLE", domain: "PURCHASES", labelFr: "Dettes fournisseurs", labelEn: "Accounts payable", category: "PAYABLE", expectedAccountTypes: ["LIABILITY"], expectedAccountSubtypes: ["ACCOUNTS_PAYABLE"], requiredForPosting: true, fallbackAllowed: false, consumerEvents: ["SUPPLIER_INVOICE_POSTED", "SUPPLIER_CREDIT_NOTE_POSTED", "SUPPLIER_PAYMENT_CONFIRMED", "PAYMENT_ALLOCATION_CONFIRMED"] },
  { key: "ACCRUED_PAYABLES", domain: "PURCHASES", labelFr: "Factures fournisseurs à recevoir", labelEn: "Accrued payables", category: "PAYABLE", expectedAccountTypes: ["LIABILITY"], expectedAccountSubtypes: ["ACCOUNTS_PAYABLE"], requiredForPosting: false, fallbackAllowed: false, consumerEvents: [] },
  { key: "SALES_REVENUE", domain: "SALES", labelFr: "Chiffre d'affaires - ventes", labelEn: "Sales revenue", category: "REVENUE", expectedAccountTypes: ["REVENUE", "OTHER_INCOME"], requiredForPosting: true, fallbackAllowed: false, consumerEvents: ["SALES_INVOICE_POSTED", "SALES_CREDIT_NOTE_POSTED", "RETAIL_POS_SALE_POSTED", "RETAIL_POS_SALE_REVERSED"] },
  { key: "SERVICE_REVENUE", domain: "SALES", labelFr: "Chiffre d'affaires - services", labelEn: "Service revenue", category: "REVENUE", expectedAccountTypes: ["REVENUE", "OTHER_INCOME"], requiredForPosting: false, fallbackAllowed: false, consumerEvents: [] },
  { key: "WORK_REVENUE", domain: "SALES", labelFr: "Travaux facturés", labelEn: "Billed works revenue", category: "REVENUE", expectedAccountTypes: ["REVENUE", "OTHER_INCOME"], requiredForPosting: false, fallbackAllowed: false, consumerEvents: [] },
  { key: "ACCESSORY_REVENUE", domain: "SALES", labelFr: "Produits accessoires", labelEn: "Ancillary revenue", category: "REVENUE", expectedAccountTypes: ["REVENUE", "OTHER_INCOME"], requiredForPosting: false, fallbackAllowed: false, consumerEvents: [] },
  { key: "TAX_PAYABLE", domain: "TAX", labelFr: "Taxe collectée à payer", labelEn: "Output tax payable", category: "TAX", expectedAccountTypes: ["LIABILITY"], expectedAccountSubtypes: ["TAX_PAYABLE"], requiredForPosting: true, fallbackAllowed: false, consumerEvents: ["SALES_INVOICE_POSTED", "SALES_CREDIT_NOTE_POSTED", "RETAIL_POS_SALE_POSTED", "RETAIL_POS_SALE_REVERSED"] },
  { key: "OUTPUT_TAX_SERVICES", domain: "TAX", labelFr: "Taxe collectée sur services", labelEn: "Output tax on services", category: "TAX", expectedAccountTypes: ["LIABILITY"], expectedAccountSubtypes: ["TAX_PAYABLE"], requiredForPosting: false, fallbackAllowed: false, consumerEvents: [] },
  { key: "VAT_DUE", domain: "TAX", labelFr: "TVA nette à payer", labelEn: "Net VAT payable", category: "TAX", expectedAccountTypes: ["LIABILITY"], expectedAccountSubtypes: ["TAX_PAYABLE"], requiredForPosting: false, fallbackAllowed: false, consumerEvents: [] },
  { key: "VAT_CREDIT_CARRYFORWARD", domain: "TAX", labelFr: "Crédit de TVA à reporter", labelEn: "VAT credit carried forward", category: "TAX", expectedAccountTypes: ["ASSET"], expectedAccountSubtypes: ["TAX_RECEIVABLE"], requiredForPosting: false, fallbackAllowed: false, consumerEvents: [] },
  { key: "TAX_RECEIVABLE", domain: "TAX", labelFr: "Taxe récupérable", labelEn: "Recoverable tax", category: "TAX", expectedAccountTypes: ["ASSET"], expectedAccountSubtypes: ["TAX_RECEIVABLE"], requiredForPosting: true, fallbackAllowed: false, consumerEvents: ["SUPPLIER_INVOICE_POSTED", "SUPPLIER_CREDIT_NOTE_POSTED"] },
  { key: "TAX_RECOVERABLE_PURCHASES", domain: "TAX", labelFr: "Taxe récupérable sur achats", labelEn: "Recoverable tax on purchases", category: "TAX", expectedAccountTypes: ["ASSET"], expectedAccountSubtypes: ["TAX_RECEIVABLE"], requiredForPosting: false, fallbackAllowed: false, consumerEvents: [] },
  { key: "TAX_RECOVERABLE_FIXED_ASSETS", domain: "TAX", labelFr: "Taxe récupérable sur immobilisations", labelEn: "Recoverable tax on fixed assets", category: "TAX", expectedAccountTypes: ["ASSET"], expectedAccountSubtypes: ["TAX_RECEIVABLE"], requiredForPosting: false, fallbackAllowed: false, consumerEvents: [] },
  { key: "INCOME_TAX_PAYABLE", domain: "TAX", labelFr: "Impôt sur le résultat à payer", labelEn: "Income tax payable", category: "TAX", expectedAccountTypes: ["LIABILITY"], expectedAccountSubtypes: ["TAX_PAYABLE"], requiredForPosting: false, fallbackAllowed: false, consumerEvents: [] },
  { key: "INCOME_TAX_EXPENSE", domain: "TAX", labelFr: "Charge d'impôt sur le résultat", labelEn: "Income tax expense", category: "EXPENSE", expectedAccountTypes: ["EXPENSE", "OTHER_EXPENSE"], requiredForPosting: false, fallbackAllowed: false, consumerEvents: [] },
  { key: "INVENTORY", domain: "INVENTORY", labelFr: "Stock", labelEn: "Inventory", category: "INVENTORY", expectedAccountTypes: ["ASSET"], expectedAccountSubtypes: ["INVENTORY"], requiredForPosting: true, fallbackAllowed: false, consumerEvents: ["INVENTORY_RECEIPT_VALUED", "INVENTORY_ISSUE_VALUED", "RETAIL_POS_INVENTORY_RETURN", "PHARMACY_CUSTOMER_RETURN", "PHARMACY_SUPPLIER_RETURN", "PHARMACY_LOSS", "PHARMACY_EXPIRY_WRITE_OFF", "PHARMACY_ADJUSTMENT", "PHARMACY_RECALL_WRITE_OFF"] },
  { key: "GOODS_INVENTORY", domain: "INVENTORY", labelFr: "Stock de marchandises", labelEn: "Merchandise inventory", category: "INVENTORY", expectedAccountTypes: ["ASSET"], expectedAccountSubtypes: ["INVENTORY"], requiredForPosting: false, fallbackAllowed: false, consumerEvents: [] },
  { key: "RAW_MATERIALS_INVENTORY", domain: "INVENTORY", labelFr: "Stock de matières premières", labelEn: "Raw materials inventory", category: "INVENTORY", expectedAccountTypes: ["ASSET"], expectedAccountSubtypes: ["INVENTORY"], requiredForPosting: false, fallbackAllowed: false, consumerEvents: [] },
  { key: "CONSUMABLES_INVENTORY", domain: "INVENTORY", labelFr: "Stock de consommables", labelEn: "Consumables inventory", category: "INVENTORY", expectedAccountTypes: ["ASSET"], expectedAccountSubtypes: ["INVENTORY"], requiredForPosting: false, fallbackAllowed: false, consumerEvents: [] },
  { key: "FINISHED_GOODS_INVENTORY", domain: "INVENTORY", labelFr: "Stock de produits finis", labelEn: "Finished goods inventory", category: "INVENTORY", expectedAccountTypes: ["ASSET"], expectedAccountSubtypes: ["INVENTORY"], requiredForPosting: false, fallbackAllowed: false, consumerEvents: [] },
  { key: "COST_OF_SALES", domain: "INVENTORY", labelFr: "Coût des ventes", labelEn: "Cost of sales", category: "EXPENSE", expectedAccountTypes: ["EXPENSE", "OTHER_EXPENSE"], expectedAccountSubtypes: ["COST_OF_SALES"], requiredForPosting: true, fallbackAllowed: false, consumerEvents: ["INVENTORY_ISSUE_VALUED", "RETAIL_POS_INVENTORY_RETURN", "PHARMACY_CUSTOMER_RETURN"] },
  { key: "GOODS_RECEIVED_CLEARING", domain: "INVENTORY", labelFr: "Réception de marchandises à rapprocher", labelEn: "Goods received clearing", category: "CLEARING", expectedAccountTypes: ["ASSET", "LIABILITY"], expectedAccountSubtypes: ["CLEARING"], requiredForPosting: true, fallbackAllowed: false, consumerEvents: ["SUPPLIER_INVOICE_POSTED", "SUPPLIER_CREDIT_NOTE_POSTED", "INVENTORY_RECEIPT_VALUED", "PHARMACY_SUPPLIER_RETURN"] },
  { key: "FIXED_ASSET", domain: "ASSETS", labelFr: "Immobilisation", labelEn: "Fixed asset", category: "ASSET", expectedAccountTypes: ["ASSET"], expectedAccountSubtypes: ["FIXED_ASSET"], requiredForPosting: true, fallbackAllowed: false, consumerEvents: ["SUPPLIER_INVOICE_POSTED", "SUPPLIER_CREDIT_NOTE_POSTED"] },
  { key: "SOFTWARE_ASSET", domain: "ASSETS", labelFr: "Logiciels immobilisés", labelEn: "Capitalized software", category: "ASSET", expectedAccountTypes: ["ASSET"], expectedAccountSubtypes: ["FIXED_ASSET"], requiredForPosting: false, fallbackAllowed: false, consumerEvents: [] },
  { key: "ACCUMULATED_DEPRECIATION", domain: "ASSETS", labelFr: "Amortissements cumulés", labelEn: "Accumulated depreciation", category: "ASSET", expectedAccountTypes: ["ASSET"], expectedAccountSubtypes: ["ACCUMULATED_DEPRECIATION"], requiredForPosting: false, fallbackAllowed: false, consumerEvents: [] },
  { key: "DEPRECIATION_EXPENSE", domain: "ASSETS", labelFr: "Dotations aux amortissements", labelEn: "Depreciation expense", category: "EXPENSE", expectedAccountTypes: ["EXPENSE", "OTHER_EXPENSE"], expectedAccountSubtypes: ["OPERATING_EXPENSE"], requiredForPosting: false, fallbackAllowed: false, consumerEvents: [] },
  { key: "ASSET_CLEARING", domain: "ASSETS", labelFr: "Immobilisation à rapprocher", labelEn: "Asset clearing", category: "CLEARING", expectedAccountTypes: ["ASSET", "LIABILITY"], expectedAccountSubtypes: ["CLEARING"], requiredForPosting: true, fallbackAllowed: false, consumerEvents: ["ASSET_CAPITALIZED"] },
  { key: "OPERATING_EXPENSE", domain: "EXPENSES", labelFr: "Charge d'exploitation", labelEn: "Operating expense", category: "EXPENSE", expectedAccountTypes: ["EXPENSE", "OTHER_EXPENSE"], expectedAccountSubtypes: ["OPERATING_EXPENSE"], requiredForPosting: true, fallbackAllowed: false, consumerEvents: ["SUPPLIER_INVOICE_POSTED", "SUPPLIER_CREDIT_NOTE_POSTED", "EXPENSE_APPROVED", "HEALTH_WRITE_OFF_APPROVED", "PHARMACY_LOSS", "PHARMACY_EXPIRY_WRITE_OFF", "PHARMACY_ADJUSTMENT", "PHARMACY_RECALL_WRITE_OFF"] },
  { key: "EXPENSE_CLEARING", domain: "EXPENSES", labelFr: "Charge à rapprocher", labelEn: "Expense clearing", category: "CLEARING", expectedAccountTypes: ["ASSET", "LIABILITY"], expectedAccountSubtypes: ["CLEARING"], requiredForPosting: true, fallbackAllowed: false, consumerEvents: ["EXPENSE_APPROVED", "PHARMACY_SUPPLIER_RETURN"] },
  { key: "INTEREST_EXPENSE", domain: "FINANCING", labelFr: "Intérêts sur emprunts", labelEn: "Interest expense", category: "EXPENSE", expectedAccountTypes: ["EXPENSE", "OTHER_EXPENSE"], expectedAccountSubtypes: ["OPERATING_EXPENSE"], requiredForPosting: false, fallbackAllowed: false, consumerEvents: [] },
  { key: "BORROWINGS", domain: "FINANCING", labelFr: "Emprunts et dettes financières", labelEn: "Borrowings", category: "PAYABLE", expectedAccountTypes: ["LIABILITY"], requiredForPosting: false, fallbackAllowed: false, consumerEvents: [] },
  { key: "PROVISIONS", domain: "FINANCING", labelFr: "Provisions", labelEn: "Provisions", category: "PAYABLE", expectedAccountTypes: ["LIABILITY"], requiredForPosting: false, fallbackAllowed: false, consumerEvents: [] },
  { key: "CUSTOMER_ADVANCES", domain: "PAYMENTS", labelFr: "Avances reçues des clients", labelEn: "Customer advances", category: "PAYABLE", expectedAccountTypes: ["LIABILITY"], requiredForPosting: true, fallbackAllowed: false, consumerEvents: ["CUSTOMER_PAYMENT_CONFIRMED", "PAYMENT_ALLOCATION_CONFIRMED"] },
  { key: "SUPPLIER_ADVANCES", domain: "PAYMENTS", labelFr: "Avances versées aux fournisseurs", labelEn: "Supplier advances", category: "RECEIVABLE", expectedAccountTypes: ["ASSET"], requiredForPosting: true, fallbackAllowed: false, consumerEvents: ["SUPPLIER_PAYMENT_CONFIRMED", "PAYMENT_ALLOCATION_CONFIRMED"] },
  { key: "EMPLOYEE_PAYABLE", domain: "PAYROLL", labelFr: "Sommes dues au personnel", labelEn: "Employee payable", category: "PAYABLE", expectedAccountTypes: ["LIABILITY"], requiredForPosting: true, fallbackAllowed: false, consumerEvents: ["EXPENSE_APPROVED"] },
  { key: "PAYROLL_PAYABLE", domain: "PAYROLL", labelFr: "Rémunérations dues", labelEn: "Payroll payable", category: "PAYROLL", expectedAccountTypes: ["LIABILITY"], expectedAccountSubtypes: ["PAYROLL_PAYABLE"], requiredForPosting: true, fallbackAllowed: false, consumerEvents: ["PAYROLL_APPROVED", "PAYROLL_PAYMENT_CONFIRMED"] },
  { key: "PAYROLL_EXPENSE", domain: "PAYROLL", labelFr: "Salaires et appointements", labelEn: "Payroll expense", category: "PAYROLL", expectedAccountTypes: ["EXPENSE", "OTHER_EXPENSE"], requiredForPosting: true, fallbackAllowed: false, consumerEvents: ["PAYROLL_APPROVED"] },
  { key: "PAYROLL_WITHHOLDING_PAYABLE", domain: "PAYROLL", labelFr: "Retenues sur salaires à reverser", labelEn: "Payroll withholding payable", category: "PAYROLL", expectedAccountTypes: ["LIABILITY"], requiredForPosting: true, fallbackAllowed: false, consumerEvents: ["PAYROLL_APPROVED"] },
  { key: "SOCIAL_SECURITY_PAYABLE", domain: "PAYROLL", labelFr: "Cotisations sociales à payer", labelEn: "Social security payable", category: "PAYROLL", expectedAccountTypes: ["LIABILITY"], expectedAccountSubtypes: ["PAYROLL_PAYABLE"], requiredForPosting: false, fallbackAllowed: false, consumerEvents: [] },
  { key: "SOCIAL_CHARGES_EXPENSE", domain: "PAYROLL", labelFr: "Charges sociales", labelEn: "Social charges expense", category: "PAYROLL", expectedAccountTypes: ["EXPENSE", "OTHER_EXPENSE"], requiredForPosting: false, fallbackAllowed: false, consumerEvents: [] },
  { key: "CASH", domain: "TREASURY", labelFr: "Caisse", labelEn: "Cash", category: "TREASURY", expectedAccountTypes: ["ASSET"], expectedAccountSubtypes: ["CASH"], requiredForPosting: false, fallbackAllowed: false, consumerEvents: [] },
  { key: "BANK", domain: "TREASURY", labelFr: "Banque", labelEn: "Bank", category: "TREASURY", expectedAccountTypes: ["ASSET"], expectedAccountSubtypes: ["BANK"], requiredForPosting: false, fallbackAllowed: false, consumerEvents: [] },
  { key: "MOBILE_MONEY", domain: "TREASURY", labelFr: "Monnaie électronique / Mobile Money", labelEn: "Electronic money / Mobile Money", category: "TREASURY", expectedAccountTypes: ["ASSET"], expectedAccountSubtypes: ["MOBILE_MONEY"], requiredForPosting: false, fallbackAllowed: false, consumerEvents: [] },
  { key: "BANK_CHARGES", domain: "TREASURY", labelFr: "Frais bancaires", labelEn: "Bank charges", category: "EXPENSE", expectedAccountTypes: ["EXPENSE", "OTHER_EXPENSE"], requiredForPosting: true, fallbackAllowed: false, consumerEvents: ["BANK_CHARGE_POSTED"] },
  { key: "CASH_VARIANCE_EXPENSE", domain: "TREASURY", labelFr: "Écart de caisse défavorable", labelEn: "Cash shortage expense", category: "EXPENSE", expectedAccountTypes: ["EXPENSE", "OTHER_EXPENSE"], requiredForPosting: true, fallbackAllowed: false, consumerEvents: ["CASH_VARIANCE_POSTED"] },
  { key: "CASH_VARIANCE_INCOME", domain: "TREASURY", labelFr: "Écart de caisse favorable", labelEn: "Cash overage income", category: "REVENUE", expectedAccountTypes: ["REVENUE", "OTHER_INCOME"], requiredForPosting: true, fallbackAllowed: false, consumerEvents: ["CASH_VARIANCE_POSTED"] },
  { key: "FX_LOSS", domain: "TREASURY", labelFr: "Perte de change", labelEn: "Foreign exchange loss", category: "EXPENSE", expectedAccountTypes: ["EXPENSE", "OTHER_EXPENSE"], requiredForPosting: false, fallbackAllowed: false, consumerEvents: [] },
  { key: "FX_GAIN", domain: "TREASURY", labelFr: "Gain de change", labelEn: "Foreign exchange gain", category: "REVENUE", expectedAccountTypes: ["REVENUE", "OTHER_INCOME"], requiredForPosting: false, fallbackAllowed: false, consumerEvents: [] },
  { key: "CLEARING", domain: "TREASURY", labelFr: "Compte de passage", labelEn: "Clearing", category: "CLEARING", expectedAccountTypes: ["ASSET", "LIABILITY"], expectedAccountSubtypes: ["CLEARING"], requiredForPosting: false, fallbackAllowed: false, consumerEvents: [] },
  { key: "EQUITY_CAPITAL", domain: "EQUITY", labelFr: "Capital social", labelEn: "Share capital", category: "EQUITY", expectedAccountTypes: ["EQUITY"], requiredForPosting: false, fallbackAllowed: false, consumerEvents: [] },
  { key: "RETAINED_EARNINGS", domain: "CLOSE", labelFr: "Report à nouveau", labelEn: "Retained earnings", category: "EQUITY", expectedAccountTypes: ["EQUITY"], expectedAccountSubtypes: ["RETAINED_EARNINGS"], requiredForPosting: false, fallbackAllowed: false, consumerEvents: [] },
]);

const BY_KEY = new Map<string, SemanticAccountDefinition>(SEMANTIC_ACCOUNT_REGISTRY.map((definition) => [definition.key, definition]));

export function getSemanticAccountDefinition(key: string): SemanticAccountDefinition | undefined {
  return BY_KEY.get(key);
}

export function listRequiredPostingSemanticKeys(): readonly string[] {
  return SEMANTIC_ACCOUNT_REGISTRY.filter((definition) => definition.requiredForPosting).map((definition) => definition.key);
}

export function listSemanticKeysForPostingEvent(postingEvent: string): readonly string[] {
  return SEMANTIC_ACCOUNT_REGISTRY.filter((definition) => definition.consumerEvents.includes(postingEvent)).map((definition) => definition.key);
}

export function validateTemplateSemanticCoverage(template: AccountingChartTemplateDefinition) {
  const accountByCode = new Map(template.accounts.map((account) => [account.code, account]));
  const mappings = new Map(template.semanticMappings.map((mapping) => [mapping.mappingKey, mapping.accountCode]));
  const issues: string[] = [];

  for (const definition of SEMANTIC_ACCOUNT_REGISTRY) {
    const accountCode = mappings.get(definition.key);
    if (definition.requiredForPosting && !accountCode) issues.push(`MISSING_REQUIRED_MAPPING:${definition.key}`);
    const account = accountCode ? accountByCode.get(accountCode) : undefined;
    if (accountCode && !account) issues.push(`MAPPING_ACCOUNT_MISSING:${definition.key}:${accountCode}`);
    if (account && !definition.expectedAccountTypes.includes(account.accountType)) {
      issues.push(`MAPPING_ACCOUNT_TYPE_INCOMPATIBLE:${definition.key}:${account.code}:${account.accountType}`);
    }
    if (account && definition.expectedAccountSubtypes?.length && account.accountSubtype && !definition.expectedAccountSubtypes.includes(account.accountSubtype)) {
      issues.push(`MAPPING_ACCOUNT_SUBTYPE_INCOMPATIBLE:${definition.key}:${account.code}:${account.accountSubtype}`);
    }
  }
  for (const mapping of template.semanticMappings) {
    if (!BY_KEY.has(mapping.mappingKey)) issues.push(`UNKNOWN_MAPPING_KEY:${mapping.mappingKey}`);
  }

  return { valid: issues.length === 0, issues } as const;
}
