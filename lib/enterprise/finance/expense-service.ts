import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { z } from "zod";
import { prisma } from "@/lib/prisma";
import { EnterpriseCoreV2Error } from "@/lib/enterprise/core-v2/errors";
import { ENTERPRISE_EXPENSE_TRANSITIONS } from "@/lib/enterprise/finance/constants";
import { applyExpenseCommitmentRealization, getBudgetLinePosition } from "@/lib/enterprise/finance/commitments";
import { assertSameCurrency, enterpriseMoney } from "@/lib/enterprise/finance/money";
import {
  addEnterpriseOperationalEvent,
  createEnterpriseLink,
  nullable,
  requireActiveEnterpriseMember,
  requireEnterpriseDepartment,
  requireEnterpriseSourceReference,
} from "@/lib/enterprise/procurement/shared";
import type {
  enterpriseExpenseActionSchema,
  enterpriseExpenseCreateSchema,
  enterpriseExpenseUpdateSchema,
} from "@/lib/enterprise/finance/validators";

export type EnterpriseExpenseCreateInput = z.infer<typeof enterpriseExpenseCreateSchema>;
export type EnterpriseExpenseUpdateInput = z.infer<typeof enterpriseExpenseUpdateSchema>;
export type EnterpriseExpenseActionInput = z.infer<typeof enterpriseExpenseActionSchema>;

type Tx = Prisma.TransactionClient;

function expenseReference() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `EXP-${date}-${randomUUID().slice(0, 8).toUpperCase()}`;
}

async function requireSupplier(tx: Tx, organizationId: string, supplierId?: string | null) {
  const id = nullable(supplierId);
  if (!id) return null;
  const supplier = await tx.enterpriseSupplier.findFirst({ where: { id, organizationId, archivedAt: null }, select: { id: true, status: true } });
  if (!supplier) throw new EnterpriseCoreV2Error("Le fournisseur n’appartient pas à cette entreprise.", 400, "INVALID_EXPENSE_SUPPLIER");
  return supplier;
}

async function requirePurchase(tx: Tx, organizationId: string, purchaseId?: string | null) {
  const id = nullable(purchaseId);
  if (!id) return null;
  const purchase = await tx.enterprisePurchase.findFirst({ where: { id, organizationId, archivedAt: null } });
  if (!purchase) throw new EnterpriseCoreV2Error("L’achat source n’appartient pas à cette entreprise.", 400, "INVALID_EXPENSE_PURCHASE");
  return purchase;
}

async function requireBudgetLine(tx: Tx, organizationId: string, budgetLineId?: string | null) {
  const id = nullable(budgetLineId);
  if (!id) return null;
  const line = await tx.enterpriseBudgetLine.findFirst({ where: { id, organizationId }, include: { budget: true } });
  if (!line || line.budget.archivedAt) throw new EnterpriseCoreV2Error("La ligne budgétaire n’appartient pas à cette entreprise.", 400, "INVALID_BUDGET_LINE");
  return line;
}

async function validateDocuments(tx: Tx, organizationId: string, documentIds: string[]) {
  const ids = [...new Set(documentIds.filter(Boolean))];
  if (!ids.length) return [];
  const documents = await tx.enterpriseDocument.findMany({ where: { organizationId, id: { in: ids }, archivedAt: null }, select: { id: true } });
  if (documents.length !== ids.length) throw new EnterpriseCoreV2Error("Un justificatif n’appartient pas à cette entreprise.", 400, "INVALID_EXPENSE_DOCUMENT");
  return ids;
}

async function createExpenseLinks(tx: Tx, organizationId: string, expenseId: string, actorUserId: string, data: { supplierId?: string | null; purchaseId?: string | null; budgetId?: string | null; documentIds?: string[]; source?: { sourceModule: string; sourceEntityType: string; sourceEntityId: string } | null }) {
  if (data.supplierId) await createEnterpriseLink(tx, { organizationId, sourceModule: "SUPPLIERS_PURCHASES", sourceEntityType: "EnterpriseSupplier", sourceEntityId: data.supplierId, targetModule: "FINANCE_BUDGETS", targetEntityType: "EnterpriseExpense", targetEntityId: expenseId, linkType: "SUPPLIER", createdById: actorUserId });
  if (data.purchaseId) await createEnterpriseLink(tx, { organizationId, sourceModule: "SUPPLIERS_PURCHASES", sourceEntityType: "EnterprisePurchase", sourceEntityId: data.purchaseId, targetModule: "FINANCE_BUDGETS", targetEntityType: "EnterpriseExpense", targetEntityId: expenseId, linkType: "REALIZES_PURCHASE", createdById: actorUserId });
  if (data.budgetId) await createEnterpriseLink(tx, { organizationId, sourceModule: "FINANCE_BUDGETS", sourceEntityType: "EnterpriseBudget", sourceEntityId: data.budgetId, targetModule: "FINANCE_BUDGETS", targetEntityType: "EnterpriseExpense", targetEntityId: expenseId, linkType: "BUDGET_CONSUMPTION", createdById: actorUserId });
  for (const documentId of data.documentIds || []) await createEnterpriseLink(tx, { organizationId, sourceModule: "DOCUMENTS", sourceEntityType: "EnterpriseDocument", sourceEntityId: documentId, targetModule: "FINANCE_BUDGETS", targetEntityType: "EnterpriseExpense", targetEntityId: expenseId, linkType: "SUPPORTING_DOCUMENT", createdById: actorUserId });
  if (data.source) await createEnterpriseLink(tx, { organizationId, sourceModule: data.source.sourceModule, sourceEntityType: data.source.sourceEntityType, sourceEntityId: data.source.sourceEntityId, targetModule: "FINANCE_BUDGETS", targetEntityType: "EnterpriseExpense", targetEntityId: expenseId, linkType: "GENERATED", createdById: actorUserId });
}

export async function createEnterpriseExpense(organizationId: string, actorUserId: string, input: EnterpriseExpenseCreateInput) {
  return prisma.$transaction(async (tx) => {
    await requireActiveEnterpriseMember(tx, organizationId, actorUserId);
    const departmentId = await requireEnterpriseDepartment(tx, organizationId, input.departmentId);
    const purchase = await requirePurchase(tx, organizationId, input.purchaseId);
    const supplier = await requireSupplier(tx, organizationId, input.supplierId || purchase?.supplierId);
    if (purchase?.supplierId && supplier?.id && purchase.supplierId !== supplier.id) throw new EnterpriseCoreV2Error("Le fournisseur de la dépense doit correspondre à l’achat source.", 400, "EXPENSE_PURCHASE_SUPPLIER_MISMATCH");

    const budgetLineId = nullable(input.budgetLineId) || purchase?.budgetLineId || null;
    if (purchase?.budgetLineId && budgetLineId && purchase.budgetLineId !== budgetLineId) throw new EnterpriseCoreV2Error("La dépense ne peut pas viser une autre ligne budgétaire que son achat source.", 400, "EXPENSE_PURCHASE_BUDGET_MISMATCH");
    const budgetLine = await requireBudgetLine(tx, organizationId, budgetLineId);
    const currency = (input.currency || purchase?.currency || budgetLine?.budget.currency || "USD").toUpperCase();
    if (purchase && !assertSameCurrency(purchase.currency, currency)) throw new EnterpriseCoreV2Error("La devise de la dépense doit correspondre à celle de l’achat.", 400, "EXPENSE_PURCHASE_CURRENCY_MISMATCH");
    if (budgetLine && !assertSameCurrency(budgetLine.budget.currency, currency)) throw new EnterpriseCoreV2Error("La devise de la dépense doit correspondre à celle du budget.", 400, "BUDGET_CURRENCY_MISMATCH");
    const expenseAmount = enterpriseMoney(input.amount ?? purchase?.totalAmount ?? 0);
    if (!purchase && input.amount === undefined) throw new EnterpriseCoreV2Error("Le montant est obligatoire sans achat source.", 400, "EXPENSE_AMOUNT_REQUIRED");
    if (purchase && !expenseAmount.eq(enterpriseMoney(purchase.totalAmount)) && !nullable(input.amountVarianceReason)) throw new EnterpriseCoreV2Error("Un motif est obligatoire lorsque le montant diffère de l’achat source.", 400, "EXPENSE_VARIANCE_REASON_REQUIRED");
    const source = await requireEnterpriseSourceReference(tx, organizationId, input);
    const documentIds = await validateDocuments(tx, organizationId, input.documentIds || []);

    const expense = await tx.enterpriseExpense.create({
      data: {
        organizationId,
        reference: expenseReference(),
        title: input.title,
        description: nullable(input.description),
        status: "DRAFT",
        expenseDate: input.expenseDate,
        category: nullable(input.category),
        currency,
        amount: expenseAmount,
        supplierId: supplier?.id || null,
        purchaseId: purchase?.id || null,
        budgetLineId: budgetLine?.id || null,
        departmentId,
        requestedByUserId: actorUserId,
        createdByUserId: actorUserId,
        amountVarianceReason: nullable(input.amountVarianceReason),
        sourceModule: source?.sourceModule || null,
        sourceEntityType: source?.sourceEntityType || null,
        sourceEntityId: source?.sourceEntityId || null,
      },
      include: { supplier: true, purchase: true, budgetLine: { include: { budget: true } } },
    });
    await createExpenseLinks(tx, organizationId, expense.id, actorUserId, { supplierId: expense.supplierId, purchaseId: expense.purchaseId, budgetId: budgetLine?.budgetId, documentIds, source });
    await addEnterpriseOperationalEvent(tx, { organizationId, entityType: "EnterpriseExpense", entityId: expense.id, eventType: "ENTERPRISE_EXPENSE_CREATED", summary: "Dépense créée en brouillon.", actorUserId, toStatus: "DRAFT", metadata: { amount: expense.amount.toFixed(2), currency: expense.currency, budgetStatus: budgetLine ? "BUDGETED" : "UNBUDGETED" } });
    return expense;
  });
}

export async function updateEnterpriseExpense(organizationId: string, expenseId: string, actorUserId: string, input: EnterpriseExpenseUpdateInput) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.enterpriseExpense.findFirst({ where: { id: expenseId, organizationId, archivedAt: null } });
    if (!existing) throw new EnterpriseCoreV2Error("Dépense introuvable.", 404, "EXPENSE_NOT_FOUND");
    if (existing.status !== "DRAFT") throw new EnterpriseCoreV2Error("Seule une dépense en brouillon peut être modifiée.", 409, "EXPENSE_NOT_EDITABLE");

    const purchase = input.purchaseId !== undefined ? await requirePurchase(tx, organizationId, input.purchaseId) : await requirePurchase(tx, organizationId, existing.purchaseId);
    const supplier = input.supplierId !== undefined ? await requireSupplier(tx, organizationId, input.supplierId) : await requireSupplier(tx, organizationId, existing.supplierId);
    const nextBudgetLineId = input.budgetLineId !== undefined ? nullable(input.budgetLineId) : (purchase?.budgetLineId || existing.budgetLineId);
    if (purchase?.budgetLineId && nextBudgetLineId && purchase.budgetLineId !== nextBudgetLineId) throw new EnterpriseCoreV2Error("La dépense ne peut pas viser une autre ligne budgétaire que son achat source.", 400, "EXPENSE_PURCHASE_BUDGET_MISMATCH");
    const budgetLine = await requireBudgetLine(tx, organizationId, nextBudgetLineId);
    const departmentId = input.departmentId !== undefined ? await requireEnterpriseDepartment(tx, organizationId, input.departmentId) : undefined;
    const nextCurrency = (input.currency || existing.currency).toUpperCase();
    if (purchase && !assertSameCurrency(purchase.currency, nextCurrency)) throw new EnterpriseCoreV2Error("La devise de la dépense doit correspondre à celle de l’achat.", 400, "EXPENSE_PURCHASE_CURRENCY_MISMATCH");
    if (budgetLine && !assertSameCurrency(budgetLine.budget.currency, nextCurrency)) throw new EnterpriseCoreV2Error("La devise de la dépense doit correspondre à celle du budget.", 400, "BUDGET_CURRENCY_MISMATCH");
    const nextAmount = enterpriseMoney(input.amount ?? existing.amount);
    const varianceReason = input.amountVarianceReason !== undefined ? nullable(input.amountVarianceReason) : existing.amountVarianceReason;
    if (purchase && !nextAmount.eq(enterpriseMoney(purchase.totalAmount)) && !varianceReason) throw new EnterpriseCoreV2Error("Un motif est obligatoire lorsque le montant diffère de l’achat source.", 400, "EXPENSE_VARIANCE_REASON_REQUIRED");
    const documentIds = input.documentIds ? await validateDocuments(tx, organizationId, input.documentIds) : [];

    const updated = await tx.enterpriseExpense.updateMany({
      where: { id: expenseId, organizationId, status: "DRAFT", revision: input.revision, archivedAt: null },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.description !== undefined ? { description: nullable(input.description) } : {}),
        ...(input.expenseDate !== undefined ? { expenseDate: input.expenseDate } : {}),
        ...(input.category !== undefined ? { category: nullable(input.category) } : {}),
        ...(input.currency !== undefined ? { currency: nextCurrency } : {}),
        ...(input.amount !== undefined ? { amount: nextAmount } : {}),
        ...(input.supplierId !== undefined ? { supplierId: supplier?.id || null } : {}),
        ...(input.purchaseId !== undefined ? { purchaseId: purchase?.id || null } : {}),
        ...((input.budgetLineId !== undefined || input.purchaseId !== undefined) ? { budgetLineId: budgetLine?.id || null } : {}),
        ...(input.departmentId !== undefined ? { departmentId: departmentId || null } : {}),
        ...(input.amountVarianceReason !== undefined ? { amountVarianceReason: varianceReason } : {}),
        updatedByUserId: actorUserId,
        revision: { increment: 1 },
      },
    });
    if (updated.count !== 1) throw new EnterpriseCoreV2Error("La dépense a été modifiée par un autre utilisateur.", 409, "REVISION_CONFLICT");
    const refreshed = await tx.enterpriseExpense.findFirst({ where: { id: expenseId, organizationId }, include: { supplier: true, purchase: true, budgetLine: { include: { budget: true } } } });
    if (!refreshed) throw new EnterpriseCoreV2Error("Dépense introuvable.", 404, "EXPENSE_NOT_FOUND");
    await createExpenseLinks(tx, organizationId, expenseId, actorUserId, { supplierId: refreshed.supplierId, purchaseId: refreshed.purchaseId, budgetId: refreshed.budgetLine?.budgetId, documentIds });
    await addEnterpriseOperationalEvent(tx, { organizationId, entityType: "EnterpriseExpense", entityId: expenseId, eventType: "ENTERPRISE_EXPENSE_UPDATED", summary: "Dépense mise à jour.", actorUserId, fromStatus: "DRAFT", toStatus: "DRAFT" });
    return refreshed;
  });
}

export async function createEnterpriseExpenseApproval({ organizationId, expenseId, actorUserId, approverUserId, expenseRevision }: { organizationId: string; expenseId: string; actorUserId: string; approverUserId: string; expenseRevision?: number }) {
  return prisma.$transaction(async (tx) => {
    const expense = await tx.enterpriseExpense.findFirst({ where: { id: expenseId, organizationId, archivedAt: null } });
    if (!expense) throw new EnterpriseCoreV2Error("Dépense introuvable.", 404, "EXPENSE_NOT_FOUND");
    if (expense.status !== "DRAFT") throw new EnterpriseCoreV2Error("La dépense doit être en brouillon avant soumission.", 409, "INVALID_EXPENSE_SUBMIT_STATE");
    await requireActiveEnterpriseMember(tx, organizationId, actorUserId);
    await requireActiveEnterpriseMember(tx, organizationId, approverUserId);
    if (expense.createdByUserId === approverUserId || expense.requestedByUserId === approverUserId) throw new EnterpriseCoreV2Error("Le demandeur de la dépense ne peut pas l’approuver lui-même.", 403, "SELF_APPROVAL_DENIED");
    if (expense.purchaseId) {
      const purchase = await requirePurchase(tx, organizationId, expense.purchaseId);
      if (purchase && !expense.amount.eq(purchase.totalAmount) && !nullable(expense.amountVarianceReason)) throw new EnterpriseCoreV2Error("Le motif d’écart avec l’achat source est obligatoire.", 400, "EXPENSE_VARIANCE_REASON_REQUIRED");
    }
    if (expense.budgetLineId) await getBudgetLinePosition(tx, organizationId, expense.budgetLineId);
    const pending = await tx.enterpriseApproval.findFirst({ where: { organizationId, targetEntityType: "EnterpriseExpense", targetEntityId: expenseId, status: "PENDING", archivedAt: null }, select: { id: true } });
    if (pending) throw new EnterpriseCoreV2Error("Une validation est déjà en attente pour cette dépense.", 409, "PENDING_APPROVAL_EXISTS");
    const promoted = await tx.enterpriseExpense.updateMany({ where: { id: expenseId, organizationId, status: "DRAFT", revision: expenseRevision ?? expense.revision, archivedAt: null }, data: { status: "PENDING_APPROVAL", updatedByUserId: actorUserId, revision: { increment: 1 } } });
    if (promoted.count !== 1) throw new EnterpriseCoreV2Error("La dépense a changé pendant sa soumission.", 409, "REVISION_CONFLICT");
    const approval = await tx.enterpriseApproval.create({ data: { organizationId, targetEntityType: "EnterpriseExpense", targetEntityId: expenseId, requestedByUserId: expense.requestedByUserId, approverUserId, status: "PENDING" } });
    await createEnterpriseLink(tx, { organizationId, sourceModule: "FINANCE_BUDGETS", sourceEntityType: "EnterpriseExpense", sourceEntityId: expenseId, targetModule: "VALIDATIONS", targetEntityType: "EnterpriseApproval", targetEntityId: approval.id, linkType: "REQUIRES_APPROVAL", createdById: actorUserId });
    await addEnterpriseOperationalEvent(tx, { organizationId, entityType: "EnterpriseExpense", entityId: expenseId, eventType: "ENTERPRISE_EXPENSE_SUBMITTED", summary: "Dépense soumise pour approbation.", actorUserId, fromStatus: "DRAFT", toStatus: "PENDING_APPROVAL" });
    await addEnterpriseOperationalEvent(tx, { organizationId, entityType: "EnterpriseApproval", entityId: approval.id, eventType: "ENTERPRISE_APPROVAL_REQUESTED", summary: "Validation de dépense demandée.", actorUserId, toStatus: "PENDING", metadata: { targetEntityType: "EnterpriseExpense", targetEntityId: expenseId } });
    return approval;
  });
}

export async function decideEnterpriseExpenseApproval({ organizationId, approvalId, actorUserId, action, revision, decisionComment, canManage }: { organizationId: string; approvalId: string; actorUserId: string; action: "APPROVE" | "REJECT" | "CANCEL"; revision: number; decisionComment?: string | null; canManage: boolean }) {
  if (action === "REJECT" && !nullable(decisionComment)) throw new EnterpriseCoreV2Error("Un motif est obligatoire pour rejeter une validation.", 400, "REJECTION_REASON_REQUIRED");
  return prisma.$transaction(async (tx) => {
    const approval = await tx.enterpriseApproval.findFirst({ where: { id: approvalId, organizationId, targetEntityType: "EnterpriseExpense", archivedAt: null } });
    if (!approval) throw new EnterpriseCoreV2Error("Validation de dépense introuvable.", 404, "APPROVAL_NOT_FOUND");
    if (approval.status !== "PENDING") throw new EnterpriseCoreV2Error("Cette validation a déjà été décidée.", 409, "APPROVAL_ALREADY_DECIDED");
    if (action === "APPROVE" || action === "REJECT") {
      if (approval.approverUserId !== actorUserId) throw new EnterpriseCoreV2Error("Seul l’approbateur désigné peut décider cette dépense.", 403, "WRONG_APPROVER");
      if (approval.requestedByUserId === actorUserId) throw new EnterpriseCoreV2Error("L’auto-approbation est interdite.", 403, "SELF_APPROVAL_DENIED");
    } else if (approval.requestedByUserId !== actorUserId && !canManage) throw new EnterpriseCoreV2Error("Vous ne pouvez pas annuler cette validation.", 403, "APPROVAL_CANCEL_DENIED");
    const expense = await tx.enterpriseExpense.findFirst({ where: { id: approval.targetEntityId, organizationId, archivedAt: null } });
    if (!expense || expense.status !== "PENDING_APPROVAL") throw new EnterpriseCoreV2Error("La dépense cible n’est plus en attente d’approbation.", 409, "APPROVAL_TARGET_CONFLICT");

    let realizedAmount = enterpriseMoney(0);
    if (action === "APPROVE" && expense.budgetLineId) {
      const impact = await applyExpenseCommitmentRealization(tx, { organizationId, expenseId: expense.id, actorUserId });
      realizedAmount = impact.realizedAmount;
    }
    const approvalStatus = action === "APPROVE" ? "APPROVED" : action === "REJECT" ? "REJECTED" : "CANCELLED";
    const expenseStatus = action === "APPROVE" ? "APPROVED" : action === "REJECT" ? "REJECTED" : "DRAFT";
    const approvalUpdated = await tx.enterpriseApproval.updateMany({ where: { id: approvalId, organizationId, status: "PENDING", revision, archivedAt: null }, data: { status: approvalStatus, decidedAt: action === "CANCEL" ? null : new Date(), decisionComment: nullable(decisionComment), revision: { increment: 1 } } });
    if (approvalUpdated.count !== 1) throw new EnterpriseCoreV2Error("La validation a été décidée simultanément.", 409, "APPROVAL_DECISION_CONFLICT");
    const expenseUpdated = await tx.enterpriseExpense.updateMany({
      where: { id: expense.id, organizationId, status: "PENDING_APPROVAL", revision: expense.revision, archivedAt: null, ...(action === "APPROVE" ? { budgetImpactAppliedAt: null } : {}) },
      data: { status: expenseStatus, ...(action === "APPROVE" ? { approvedAt: new Date(), budgetImpactAppliedAt: new Date(), commitmentRealizedAmount: realizedAmount } : {}), updatedByUserId: actorUserId, revision: { increment: 1 } },
    });
    if (expenseUpdated.count !== 1) throw new EnterpriseCoreV2Error("La dépense a changé pendant la décision.", 409, "APPROVAL_TARGET_CONFLICT");
    await addEnterpriseOperationalEvent(tx, { organizationId, entityType: "EnterpriseApproval", entityId: approvalId, eventType: action === "APPROVE" ? "ENTERPRISE_APPROVAL_APPROVED" : action === "REJECT" ? "ENTERPRISE_APPROVAL_REJECTED" : "ENTERPRISE_APPROVAL_CANCELLED", summary: nullable(decisionComment) || `Validation ${approvalStatus.toLowerCase()}.`, actorUserId, fromStatus: "PENDING", toStatus: approvalStatus });
    await addEnterpriseOperationalEvent(tx, { organizationId, entityType: "EnterpriseExpense", entityId: expense.id, eventType: action === "APPROVE" ? "ENTERPRISE_EXPENSE_APPROVED" : action === "REJECT" ? "ENTERPRISE_EXPENSE_REJECTED" : "ENTERPRISE_EXPENSE_APPROVAL_CANCELLED", summary: nullable(decisionComment) || (action === "APPROVE" ? "Dépense approuvée et impact budgétaire appliqué." : action === "REJECT" ? "Dépense rejetée." : "Validation de la dépense annulée."), actorUserId, fromStatus: "PENDING_APPROVAL", toStatus: expenseStatus, metadata: action === "APPROVE" ? { commitmentRealizedAmount: realizedAmount.toFixed(2), budgetStatus: expense.budgetLineId ? "BUDGETED" : "UNBUDGETED" } : undefined });
    return tx.enterpriseApproval.findUnique({ where: { id: approvalId } });
  });
}

export async function transitionEnterpriseExpense(organizationId: string, expenseId: string, actorUserId: string, input: EnterpriseExpenseActionInput) {
  if (input.action === "SUBMIT") {
    if (!input.approverUserId) throw new EnterpriseCoreV2Error("Un approbateur est obligatoire.", 400, "APPROVER_REQUIRED");
    return createEnterpriseExpenseApproval({ organizationId, expenseId, actorUserId, approverUserId: input.approverUserId, expenseRevision: input.revision });
  }
  const transition = ENTERPRISE_EXPENSE_TRANSITIONS[input.action];
  return prisma.$transaction(async (tx) => {
    const existing = await tx.enterpriseExpense.findFirst({ where: { id: expenseId, organizationId, archivedAt: null } });
    if (!existing) throw new EnterpriseCoreV2Error("Dépense introuvable.", 404, "EXPENSE_NOT_FOUND");
    if (!transition.from.includes(existing.status as never)) throw new EnterpriseCoreV2Error("Cette transition de dépense n’est pas autorisée.", 409, "INVALID_EXPENSE_TRANSITION");
    const updated = await tx.enterpriseExpense.updateMany({ where: { id: expenseId, organizationId, status: existing.status, revision: input.revision, archivedAt: null }, data: { ...(transition.to ? { status: transition.to } : {}), ...(input.action === "ARCHIVE" ? { archivedAt: new Date() } : {}), updatedByUserId: actorUserId, revision: { increment: 1 } } });
    if (updated.count !== 1) throw new EnterpriseCoreV2Error("La dépense a été modifiée simultanément.", 409, "REVISION_CONFLICT");
    const eventType = input.action === "CANCEL" ? "ENTERPRISE_EXPENSE_CANCELLED" : input.action === "REOPEN" ? "ENTERPRISE_EXPENSE_REOPENED" : "ENTERPRISE_EXPENSE_ARCHIVED";
    await addEnterpriseOperationalEvent(tx, { organizationId, entityType: "EnterpriseExpense", entityId: expenseId, eventType, summary: nullable(input.comment) || `Action ${input.action} appliquée à la dépense.`, actorUserId, fromStatus: existing.status, toStatus: transition.to || existing.status });
    return tx.enterpriseExpense.findUnique({ where: { id: expenseId }, include: { supplier: true, purchase: true, budgetLine: { include: { budget: true } } } });
  });
}
