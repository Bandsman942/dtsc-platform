export const ENTERPRISE_APPROVAL_MODULE_BY_TARGET: Readonly<Record<string, string>> = {
  EnterpriseAccountTransfer: "FINANCE_TREASURY",
  EnterpriseJournalEntry: "FINANCE_ACCOUNTING",
  EnterprisePayment: "FINANCE_PAYMENTS",
  EnterpriseSalesInvoice: "FINANCE_RECEIVABLES",
  EnterpriseSupplierInvoiceReview: "FINANCE_PAYABLES",
  EnterpriseSupplierInvoiceApproval: "FINANCE_PAYABLES",
  EnterpriseFinancialClose: "FINANCE_CLOSE",
  EnterpriseCashSession: "FINANCE_CASH",
  EnterpriseReconciliationSession: "FINANCE_RECONCILIATION",
  EnterpriseOpeningBalanceApproval: "FINANCE_ACCOUNTING",
  EnterpriseSalesCreditNoteApproval: "FINANCE_RECEIVABLES",
  EnterpriseSupplierCreditNoteApproval: "FINANCE_PAYABLES",
  EnterpriseRequest: "INTERNAL_REQUESTS",
  EnterpriseTask: "TASKS_OPERATIONS",
  EnterpriseMeeting: "MEETINGS",
  EnterprisePurchase: "SUPPLIERS_PURCHASES",
  EnterpriseStockTransfer: "INVENTORY_LOGISTICS",
  EnterpriseInventoryCount: "INVENTORY_LOGISTICS",
  EnterpriseStockAdjustment: "INVENTORY_LOGISTICS",
  EnterpriseBudget: "FINANCE_BUDGETS",
  EnterpriseExpense: "FINANCE_BUDGETS",
  PharmacyQualityIncident: "QUALITY_PHARMACOVIGILANCE",
  EnterpriseLeaveRequest: "TIME_ATTENDANCE",
  EnterpriseEmploymentContract: "HUMAN_RESOURCES",
  EnterpriseTimesheet: "TIME_ATTENDANCE",
  EnterprisePayrollRun: "PAYROLL_OPERATIONS",
  EnterpriseProjectMilestone: "PROJECTS_SERVICES",
};

const ENTERPRISE_APPROVAL_TARGET_LABELS: Readonly<Record<string, { fr: string; en: string }>> = {
  EnterpriseAccountTransfer: { fr: "Transfert de trésorerie", en: "Treasury transfer" },
  EnterpriseJournalEntry: { fr: "Écriture comptable", en: "Journal entry" },
  EnterprisePayment: { fr: "Paiement", en: "Payment" },
  EnterpriseSalesInvoice: { fr: "Facture client", en: "Customer invoice" },
  EnterpriseSupplierInvoiceReview: { fr: "Revue de facture fournisseur", en: "Supplier invoice review" },
  EnterpriseSupplierInvoiceApproval: { fr: "Facture fournisseur", en: "Supplier invoice" },
  EnterpriseFinancialClose: { fr: "Clôture financière", en: "Financial close" },
  EnterpriseCashSession: { fr: "Clôture de caisse", en: "Cash close" },
  EnterpriseReconciliationSession: { fr: "Rapprochement financier", en: "Financial reconciliation" },
  EnterpriseOpeningBalanceApproval: { fr: "Solde d’ouverture", en: "Opening balance" },
  EnterpriseSalesCreditNoteApproval: { fr: "Avoir client", en: "Customer credit note" },
  EnterpriseSupplierCreditNoteApproval: { fr: "Avoir fournisseur", en: "Supplier credit note" },
  EnterpriseRequest: { fr: "Demande interne", en: "Internal request" },
  EnterpriseTask: { fr: "Tâche ou opération", en: "Task or operation" },
  EnterpriseMeeting: { fr: "Réunion", en: "Meeting" },
  EnterprisePurchase: { fr: "Achat", en: "Purchase" },
  EnterpriseStockTransfer: { fr: "Transfert de stock", en: "Stock transfer" },
  EnterpriseInventoryCount: { fr: "Inventaire", en: "Inventory count" },
  EnterpriseStockAdjustment: { fr: "Ajustement de stock", en: "Stock adjustment" },
  EnterpriseBudget: { fr: "Budget", en: "Budget" },
  EnterpriseExpense: { fr: "Dépense", en: "Expense" },
  PharmacyQualityIncident: { fr: "Incident qualité pharmacie", en: "Pharmacy quality incident" },
  EnterpriseLeaveRequest: { fr: "Demande de congé", en: "Leave request" },
  EnterpriseEmploymentContract: { fr: "Contrat de travail", en: "Employment contract" },
  EnterpriseTimesheet: { fr: "Feuille de temps", en: "Timesheet" },
  EnterprisePayrollRun: { fr: "Cycle de paie", en: "Payroll run" },
  EnterpriseProjectMilestone: { fr: "Jalon de projet", en: "Project milestone" },
};

export function enterpriseApprovalModuleForTarget(targetEntityType: string) {
  return ENTERPRISE_APPROVAL_MODULE_BY_TARGET[targetEntityType] || null;
}

export function enterpriseApprovalTargetLabel(targetEntityType: string, locale?: string | null) {
  const label = ENTERPRISE_APPROVAL_TARGET_LABELS[targetEntityType];
  if (!label) return locale === "en" ? "Business approval" : "Validation métier";
  return locale === "en" ? label.en : label.fr;
}

export function enterpriseApprovalTargetDeepLink(targetEntityType: string, targetEntityId: string, approvalId?: string | null) {
  const id = encodeURIComponent(targetEntityId);
  if (targetEntityType === "EnterpriseAccountTransfer") return `/enterprise-modules/FINANCE_TREASURY?transfer=${id}`;
  if (targetEntityType === "EnterpriseJournalEntry") return `/enterprise-modules/FINANCE_ACCOUNTING?tab=entries&entry=${id}`;
  if (targetEntityType === "EnterprisePayment") return `/enterprise-modules/FINANCE_PAYMENTS?payment=${id}`;
  if (targetEntityType === "EnterpriseSalesInvoice") return `/enterprise-modules/FINANCE_RECEIVABLES?invoice=${id}`;
  if (targetEntityType === "EnterpriseSupplierInvoiceReview" || targetEntityType === "EnterpriseSupplierInvoiceApproval") return `/enterprise-modules/FINANCE_PAYABLES?invoice=${id}`;
  if (targetEntityType === "EnterpriseFinancialClose") return `/enterprise-modules/FINANCE_CLOSE?close=${id}`;
  if (targetEntityType === "EnterpriseCashSession") return `/enterprise-modules/FINANCE_CASH?session=${id}`;
  if (targetEntityType === "EnterpriseReconciliationSession") return `/enterprise-modules/FINANCE_RECONCILIATION?session=${id}`;
  if (targetEntityType === "EnterpriseOpeningBalanceApproval") return `/enterprise-modules/FINANCE_ACCOUNTING?tab=setup&openingBalance=${id}`;
  if (targetEntityType === "EnterpriseSalesCreditNoteApproval") return `/enterprise-modules/FINANCE_RECEIVABLES?creditNote=${id}`;
  if (targetEntityType === "EnterpriseSupplierCreditNoteApproval") return `/enterprise-modules/FINANCE_PAYABLES?creditNote=${id}`;
  if (targetEntityType === "EnterpriseRequest") return `/enterprise-modules/INTERNAL_REQUESTS?request=${id}`;
  if (targetEntityType === "EnterpriseTask") return `/enterprise-modules/TASKS_OPERATIONS?task=${id}`;
  if (targetEntityType === "EnterpriseMeeting") return `/enterprise-modules/MEETINGS?meeting=${id}`;
  if (targetEntityType === "EnterprisePurchase") return `/enterprise-modules/SUPPLIERS_PURCHASES?purchase=${id}`;
  if (targetEntityType === "EnterpriseStockTransfer") return `/enterprise-modules/INVENTORY_LOGISTICS?tab=TRANSFERS&transfer=${id}`;
  if (targetEntityType === "EnterpriseInventoryCount") return `/enterprise-modules/INVENTORY_LOGISTICS?tab=COUNTS&count=${id}`;
  if (targetEntityType === "EnterpriseStockAdjustment") return `/enterprise-modules/INVENTORY_LOGISTICS?tab=ADJUSTMENTS&adjustment=${id}`;
  if (targetEntityType === "EnterpriseBudget") return `/enterprise-modules/FINANCE_BUDGETS?budget=${id}`;
  if (targetEntityType === "EnterpriseExpense") return `/enterprise-modules/FINANCE_BUDGETS?expense=${id}`;
  if (targetEntityType === "PharmacyQualityIncident") return `/enterprise-modules/QUALITY_PHARMACOVIGILANCE?incident=${id}`;
  if (targetEntityType === "EnterpriseLeaveRequest") return `/enterprise-modules/TIME_ATTENDANCE?leave=${id}`;
  if (targetEntityType === "EnterpriseEmploymentContract") return `/enterprise-modules/HUMAN_RESOURCES?contract=${id}`;
  if (targetEntityType === "EnterpriseTimesheet") return `/enterprise-modules/TIME_ATTENDANCE?timesheet=${id}`;
  if (targetEntityType === "EnterprisePayrollRun") return `/enterprise-modules/PAYROLL_OPERATIONS?payroll=${id}`;
  if (targetEntityType === "EnterpriseProjectMilestone") return `/enterprise-modules/PROJECTS_SERVICES?milestone=${id}`;
  return `/enterprise-modules/VALIDATIONS${approvalId ? `?approval=${encodeURIComponent(approvalId)}` : ""}`;
}
