import { workflowConditionFields } from "@/lib/enterprise/workflows/adapters/types";
import { transitionSalesInvoice } from "@/lib/enterprise/accounting/receivables-service";
import { transitionSupplierInvoice } from "@/lib/enterprise/accounting/payables-service";
import { transitionEnterprisePayment } from "@/lib/enterprise/accounting/payments-service";
import { transitionJournalEntry } from "@/lib/enterprise/accounting/journal-service";
import { postAssetDepreciation } from "@/lib/enterprise/accounting/asset-accounting-service";
import {
  postApprovedSalesCreditNote,
  postApprovedSupplierCreditNote,
} from "@/lib/enterprise/accounting/accounting-document-approval-orchestration";
import type { WorkflowAssignmentStrategy, WorkflowEntityType } from "@/lib/enterprise/workflows/constants";
import { EnterpriseWorkflowError } from "@/lib/enterprise/workflows/errors";
import type { WorkflowDomainActionInput, WorkflowDomainActionResult, WorkflowEntityAdapter, WorkflowEntitySnapshot } from "@/lib/enterprise/workflows/adapters/types";
import { prisma } from "@/lib/prisma";

export type FinanceWorkflowEntityType = Extract<WorkflowEntityType,
  | "EnterpriseSalesInvoice"
  | "EnterpriseSalesCreditNote"
  | "EnterpriseSupplierInvoice"
  | "EnterpriseSupplierCreditNote"
  | "EnterprisePayment"
  | "EnterpriseCashSession"
  | "EnterpriseJournalEntry"
  | "EnterpriseFiscalPeriod"
  | "EnterpriseReconciliationSession"
  | "EnterpriseAssetDepreciationSchedule"
>;

const PLACEHOLDERS = new Set(["entity.id", "entity.reference", "entity.title", "entity.status", "entity.requesterName", "entity.departmentName", "workflow.name"]);

function snapshot<T extends { id: string; organizationId: string }>(value: T | null, entityType: FinanceWorkflowEntityType): WorkflowEntitySnapshot {
  if (!value) throw new EnterpriseWorkflowError(`${entityType} est introuvable dans cette entreprise.`, 404, "WORKFLOW_SOURCE_NOT_FOUND", "BUSINESS");
  return value as unknown as WorkflowEntitySnapshot;
}

function valueAt(entity: WorkflowEntitySnapshot, field: string) {
  if (field.includes(".") || ["__proto__", "constructor", "prototype"].includes(field)) {
    throw new EnterpriseWorkflowError("Ce champ conditionnel n’est pas autorisé.", 400, "WORKFLOW_CONDITION_FIELD_DENIED", "SECURITY");
  }
  return entity[field];
}

function templateValues(entity: WorkflowEntitySnapshot, workflowName: string) {
  return {
    "entity.id": entity.id,
    "entity.reference": entity.reference || entity.number || entity.code || entity.id,
    "entity.title": entity.title || entity.number || entity.reference || entity.code || entity.id,
    "entity.status": entity.status || "",
    "entity.requesterName": entity.requesterName || "",
    "entity.departmentName": entity.departmentName || "",
    "workflow.name": workflowName,
  };
}

function resolveEntityUser(entity: WorkflowEntitySnapshot, strategy: WorkflowAssignmentStrategy) {
  if (strategy !== "ENTITY_CREATOR" && strategy !== "ENTITY_REQUESTER") return null;
  for (const key of ["createdByUserId", "initiatedByUserId", "preparedByUserId", "cashierUserId", "requestedByUserId"]) {
    if (typeof entity[key] === "string" && entity[key]) return String(entity[key]);
  }
  return null;
}

function denyAction(entityType: FinanceWorkflowEntityType): never {
  throw new EnterpriseWorkflowError(`Aucune action directe n’est autorisée pour ${entityType}.`, 400, "WORKFLOW_DOMAIN_ACTION_DENIED", "CONFIGURATION");
}

async function result(adapter: WorkflowEntityAdapter, input: WorkflowDomainActionInput): Promise<WorkflowDomainActionResult> {
  const entity = await adapter.loadEntity(input.organizationId, input.entityId);
  return {
    entityType: adapter.entityType,
    entityId: entity.id,
    status: typeof entity.status === "string" ? entity.status : null,
    revision: typeof entity.revision === "number" ? entity.revision : null,
  };
}

function assertAction(input: WorkflowDomainActionInput, allowed: readonly string[], entityType: FinanceWorkflowEntityType) {
  if (!allowed.includes(input.action)) throw new EnterpriseWorkflowError(`L'action ${input.action} n'est pas autorisée pour ${entityType}.`, 400, "WORKFLOW_DOMAIN_ACTION_DENIED", "CONFIGURATION");
}

// Automated workflows may execute post-decision accounting operations, but they must never
// select an approver, submit a human approval request, or make a human approval/review decision.
const salesInvoiceActions = ["ISSUE", "CANCEL", "VOID"] as const;
const salesInvoiceAdapter: WorkflowEntityAdapter = {
  entityType: "EnterpriseSalesInvoice",
  conditionFields: workflowConditionFields({ status: "STRING", currencyCode: "STRING", grandTotal: "NUMBER", outstandingAmount: "NUMBER", businessPartyId: "STRING", projectId: "STRING", createdByUserId: "STRING", invoiceDate: "DATE", dueDate: "DATE" }),
  placeholders: PLACEHOLDERS,
  triggerEvents: new Set(["SALES_INVOICE_CREATED", "SALES_INVOICE_SUBMIT", "SALES_INVOICE_APPROVE", "SALES_INVOICE_ISSUED"]),
  domainActions: new Set(salesInvoiceActions),
  async loadEntity(organizationId, entityId) {
    return snapshot(await prisma.enterpriseSalesInvoice.findFirst({ where: { id: entityId, organizationId, archivedAt: null }, select: { id: true, organizationId: true, number: true, status: true, currencyCode: true, grandTotal: true, outstandingAmount: true, businessPartyId: true, projectId: true, createdByUserId: true, invoiceDate: true, dueDate: true, revision: true } }), "EnterpriseSalesInvoice");
  },
  getConditionField: valueAt,
  getTemplateValues: templateValues,
  resolveEntityUser,
  async executeDomainAction(input) {
    assertAction(input, salesInvoiceActions, "EnterpriseSalesInvoice");
    await transitionSalesInvoice(input.organizationId, input.entityId, input.actorUserId, { action: input.action as (typeof salesInvoiceActions)[number], revision: input.revision, reason: input.comment || undefined });
    return result(salesInvoiceAdapter, input);
  },
};

const salesCreditNoteAdapter: WorkflowEntityAdapter = {
  entityType: "EnterpriseSalesCreditNote",
  conditionFields: workflowConditionFields({ status: "STRING", currencyCode: "STRING", grandTotal: "NUMBER", salesInvoiceId: "STRING", createdByUserId: "STRING", creditDate: "DATE" }),
  placeholders: PLACEHOLDERS,
  triggerEvents: new Set(["SALES_CREDIT_NOTE_CREATED", "SALES_CREDIT_NOTE_SUBMITTED", "SALES_CREDIT_NOTE_APPROVE", "SALES_CREDIT_NOTE_POSTED"]),
  domainActions: new Set(["POST"]),
  async loadEntity(organizationId, entityId) {
    return snapshot(await prisma.enterpriseSalesCreditNote.findFirst({ where: { id: entityId, organizationId }, select: { id: true, organizationId: true, number: true, status: true, currencyCode: true, grandTotal: true, salesInvoiceId: true, createdByUserId: true, creditDate: true, revision: true } }), "EnterpriseSalesCreditNote");
  },
  getConditionField: valueAt,
  getTemplateValues: templateValues,
  resolveEntityUser,
  async executeDomainAction(input) {
    assertAction(input, ["POST"], "EnterpriseSalesCreditNote");
    await postApprovedSalesCreditNote(input.organizationId, input.entityId, input.actorUserId, input.revision);
    return result(salesCreditNoteAdapter, input);
  },
};

const supplierInvoiceActions = ["POST", "CANCEL"] as const;
const supplierInvoiceAdapter: WorkflowEntityAdapter = {
  entityType: "EnterpriseSupplierInvoice",
  conditionFields: workflowConditionFields({ status: "STRING", currencyCode: "STRING", grandTotal: "NUMBER", outstandingAmount: "NUMBER", supplierId: "STRING", businessPartyId: "STRING", purchaseId: "STRING", expenseId: "STRING", createdByUserId: "STRING", invoiceDate: "DATE", dueDate: "DATE" }),
  placeholders: PLACEHOLDERS,
  triggerEvents: new Set(["SUPPLIER_INVOICE_CREATED", "SUPPLIER_INVOICE_SUBMIT", "SUPPLIER_INVOICE_REVIEW", "SUPPLIER_INVOICE_APPROVE", "SUPPLIER_INVOICE_POSTED"]),
  domainActions: new Set(supplierInvoiceActions),
  async loadEntity(organizationId, entityId) {
    return snapshot(await prisma.enterpriseSupplierInvoice.findFirst({ where: { id: entityId, organizationId, archivedAt: null }, select: { id: true, organizationId: true, number: true, status: true, currencyCode: true, grandTotal: true, outstandingAmount: true, supplierId: true, businessPartyId: true, purchaseId: true, expenseId: true, createdByUserId: true, invoiceDate: true, dueDate: true, revision: true } }), "EnterpriseSupplierInvoice");
  },
  getConditionField: valueAt,
  getTemplateValues: templateValues,
  resolveEntityUser,
  async executeDomainAction(input) {
    assertAction(input, supplierInvoiceActions, "EnterpriseSupplierInvoice");
    await transitionSupplierInvoice(input.organizationId, input.entityId, input.actorUserId, { action: input.action as (typeof supplierInvoiceActions)[number], revision: input.revision, reason: input.comment || undefined });
    return result(supplierInvoiceAdapter, input);
  },
};

const supplierCreditNoteAdapter: WorkflowEntityAdapter = {
  entityType: "EnterpriseSupplierCreditNote",
  conditionFields: workflowConditionFields({ status: "STRING", currencyCode: "STRING", grandTotal: "NUMBER", supplierInvoiceId: "STRING", createdByUserId: "STRING", creditDate: "DATE" }),
  placeholders: PLACEHOLDERS,
  triggerEvents: new Set(["SUPPLIER_CREDIT_NOTE_CREATED", "SUPPLIER_CREDIT_NOTE_SUBMITTED", "SUPPLIER_CREDIT_NOTE_APPROVE", "SUPPLIER_CREDIT_NOTE_POSTED"]),
  domainActions: new Set(["POST"]),
  async loadEntity(organizationId, entityId) {
    return snapshot(await prisma.enterpriseSupplierCreditNote.findFirst({ where: { id: entityId, organizationId }, select: { id: true, organizationId: true, number: true, status: true, currencyCode: true, grandTotal: true, supplierInvoiceId: true, createdByUserId: true, creditDate: true, revision: true } }), "EnterpriseSupplierCreditNote");
  },
  getConditionField: valueAt,
  getTemplateValues: templateValues,
  resolveEntityUser,
  async executeDomainAction(input) {
    assertAction(input, ["POST"], "EnterpriseSupplierCreditNote");
    await postApprovedSupplierCreditNote(input.organizationId, input.entityId, input.actorUserId, input.revision);
    return result(supplierCreditNoteAdapter, input);
  },
};

const paymentActions = ["CONFIRM", "RECONCILE", "CANCEL", "REVERSE"] as const;
const paymentAdapter: WorkflowEntityAdapter = {
  entityType: "EnterprisePayment",
  conditionFields: workflowConditionFields({ status: "STRING", direction: "STRING", paymentType: "STRING", methodType: "STRING", currencyCode: "STRING", amount: "NUMBER", unallocatedAmount: "NUMBER", businessPartyId: "STRING", initiatedByUserId: "STRING", paymentDate: "DATE" }),
  placeholders: PLACEHOLDERS,
  triggerEvents: new Set(["PAYMENT_CREATED", "PAYMENT_SUBMIT", "PAYMENT_APPROVE", "PAYMENT_CONFIRMED", "PAYMENT_RECONCILE"]),
  domainActions: new Set(paymentActions),
  async loadEntity(organizationId, entityId) {
    return snapshot(await prisma.enterprisePayment.findFirst({ where: { id: entityId, organizationId }, select: { id: true, organizationId: true, number: true, status: true, direction: true, paymentType: true, methodType: true, currencyCode: true, amount: true, unallocatedAmount: true, businessPartyId: true, initiatedByUserId: true, paymentDate: true, revision: true } }), "EnterprisePayment");
  },
  getConditionField: valueAt,
  getTemplateValues: templateValues,
  resolveEntityUser,
  async executeDomainAction(input) {
    assertAction(input, paymentActions, "EnterprisePayment");
    await transitionEnterprisePayment(input.organizationId, input.entityId, input.actorUserId, { action: input.action as (typeof paymentActions)[number], revision: input.revision, reason: input.comment || undefined });
    return result(paymentAdapter, input);
  },
};

const cashSessionAdapter: WorkflowEntityAdapter = {
  entityType: "EnterpriseCashSession",
  conditionFields: workflowConditionFields({ status: "STRING", financialAccountId: "STRING", cashierUserId: "STRING", openingAmount: "NUMBER", expectedClosingAmount: "NUMBER", countedClosingAmount: "NUMBER", discrepancyAmount: "NUMBER", openedAt: "DATE", submittedAt: "DATE" }),
  placeholders: PLACEHOLDERS,
  triggerEvents: new Set(["CASH_SESSION_OPENED", "CASH_SESSION_SUBMITTED", "CASH_SESSION_CLOSED"]),
  domainActions: new Set(),
  async loadEntity(organizationId, entityId) {
    return snapshot(await prisma.enterpriseCashSession.findFirst({ where: { id: entityId, organizationId }, select: { id: true, organizationId: true, number: true, status: true, financialAccountId: true, cashierUserId: true, openingAmount: true, expectedClosingAmount: true, countedClosingAmount: true, discrepancyAmount: true, openedAt: true, submittedAt: true, revision: true } }), "EnterpriseCashSession");
  },
  getConditionField: valueAt,
  getTemplateValues: templateValues,
  resolveEntityUser,
  async executeDomainAction() { return denyAction("EnterpriseCashSession"); },
};

const journalActions = ["POST", "CANCEL"] as const;
const journalEntryAdapter: WorkflowEntityAdapter = {
  entityType: "EnterpriseJournalEntry",
  conditionFields: workflowConditionFields({ status: "STRING", journalId: "STRING", fiscalPeriodId: "STRING", accountingDate: "DATE", totalDebit: "NUMBER", totalCredit: "NUMBER", functionalCurrencyCode: "STRING", preparedByUserId: "STRING", sourceEntityType: "STRING", sourceEntityId: "STRING" }),
  placeholders: PLACEHOLDERS,
  triggerEvents: new Set(["JOURNAL_ENTRY_CREATED", "JOURNAL_ENTRY_SUBMIT", "JOURNAL_ENTRY_APPROVE", "JOURNAL_ENTRY_POSTED", "JOURNAL_ENTRY_REVERSED"]),
  domainActions: new Set(journalActions),
  async loadEntity(organizationId, entityId) {
    return snapshot(await prisma.enterpriseJournalEntry.findFirst({ where: { id: entityId, organizationId }, select: { id: true, organizationId: true, number: true, status: true, journalId: true, fiscalPeriodId: true, accountingDate: true, totalDebit: true, totalCredit: true, functionalCurrencyCode: true, preparedByUserId: true, sourceEntityType: true, sourceEntityId: true, revision: true } }), "EnterpriseJournalEntry");
  },
  getConditionField: valueAt,
  getTemplateValues: templateValues,
  resolveEntityUser,
  async executeDomainAction(input) {
    assertAction(input, journalActions, "EnterpriseJournalEntry");
    await transitionJournalEntry(input.organizationId, input.entityId, input.actorUserId, { action: input.action as (typeof journalActions)[number], revision: input.revision, reason: input.comment || undefined });
    return result(journalEntryAdapter, input);
  },
};

const fiscalPeriodAdapter: WorkflowEntityAdapter = {
  entityType: "EnterpriseFiscalPeriod",
  conditionFields: workflowConditionFields({ status: "STRING", fiscalYearId: "STRING", code: "STRING", startDate: "DATE", endDate: "DATE", createdByUserId: "STRING" }),
  placeholders: PLACEHOLDERS,
  triggerEvents: new Set(["FISCAL_PERIOD_CREATED", "FINANCIAL_CLOSE_PREPARED", "FINANCIAL_CLOSE_COMPLETED", "FINANCIAL_PERIOD_REOPENED"]),
  domainActions: new Set(),
  async loadEntity(organizationId, entityId) {
    return snapshot(await prisma.enterpriseFiscalPeriod.findFirst({ where: { id: entityId, organizationId }, select: { id: true, organizationId: true, code: true, status: true, fiscalYearId: true, startDate: true, endDate: true, createdByUserId: true, revision: true } }), "EnterpriseFiscalPeriod");
  },
  getConditionField: valueAt,
  getTemplateValues: templateValues,
  resolveEntityUser,
  async executeDomainAction() { return denyAction("EnterpriseFiscalPeriod"); },
};

const reconciliationAdapter: WorkflowEntityAdapter = {
  entityType: "EnterpriseReconciliationSession",
  conditionFields: workflowConditionFields({ status: "STRING", financialAccountId: "STRING", bankStatementId: "STRING", bookBalance: "NUMBER", statementBalance: "NUMBER", reconciledDifference: "NUMBER", preparedByUserId: "STRING", periodStart: "DATE", periodEnd: "DATE" }),
  placeholders: PLACEHOLDERS,
  triggerEvents: new Set(["RECONCILIATION_CREATED", "RECONCILIATION_SUBMITTED", "RECONCILIATION_COMPLETED"]),
  domainActions: new Set(),
  async loadEntity(organizationId, entityId) {
    return snapshot(await prisma.enterpriseReconciliationSession.findFirst({ where: { id: entityId, organizationId }, select: { id: true, organizationId: true, number: true, status: true, financialAccountId: true, bankStatementId: true, bookBalance: true, statementBalance: true, reconciledDifference: true, preparedByUserId: true, periodStart: true, periodEnd: true, revision: true } }), "EnterpriseReconciliationSession");
  },
  getConditionField: valueAt,
  getTemplateValues: templateValues,
  resolveEntityUser,
  async executeDomainAction() { return denyAction("EnterpriseReconciliationSession"); },
};

const depreciationAdapter: WorkflowEntityAdapter = {
  entityType: "EnterpriseAssetDepreciationSchedule",
  conditionFields: workflowConditionFields({ status: "STRING", assetAccountingProfileId: "STRING", periodCode: "STRING", scheduledDate: "DATE", openingNetBookValue: "NUMBER", depreciationAmount: "NUMBER", closingNetBookValue: "NUMBER" }),
  placeholders: PLACEHOLDERS,
  triggerEvents: new Set(["ASSET_DEPRECIATION_POSTED"]),
  domainActions: new Set(["POST"]),
  async loadEntity(organizationId, entityId) {
    return snapshot(await prisma.enterpriseAssetDepreciationSchedule.findFirst({ where: { id: entityId, organizationId }, select: { id: true, organizationId: true, status: true, assetAccountingProfileId: true, periodCode: true, scheduledDate: true, openingNetBookValue: true, depreciationAmount: true, closingNetBookValue: true } }), "EnterpriseAssetDepreciationSchedule");
  },
  getConditionField: valueAt,
  getTemplateValues: templateValues,
  resolveEntityUser,
  async executeDomainAction(input) {
    assertAction(input, ["POST"], "EnterpriseAssetDepreciationSchedule");
    await postAssetDepreciation(input.organizationId, input.entityId, input.actorUserId);
    return result(depreciationAdapter, input);
  },
};

export const FINANCE_WORKFLOW_ADAPTERS: Partial<Record<WorkflowEntityType, WorkflowEntityAdapter>> = {
  EnterpriseSalesInvoice: salesInvoiceAdapter,
  EnterpriseSalesCreditNote: salesCreditNoteAdapter,
  EnterpriseSupplierInvoice: supplierInvoiceAdapter,
  EnterpriseSupplierCreditNote: supplierCreditNoteAdapter,
  EnterprisePayment: paymentAdapter,
  EnterpriseCashSession: cashSessionAdapter,
  EnterpriseJournalEntry: journalEntryAdapter,
  EnterpriseFiscalPeriod: fiscalPeriodAdapter,
  EnterpriseReconciliationSession: reconciliationAdapter,
  EnterpriseAssetDepreciationSchedule: depreciationAdapter,
};