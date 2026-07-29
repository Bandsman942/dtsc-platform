import { randomUUID } from "node:crypto";
import type { z } from "zod";
import { prisma } from "@/lib/prisma";
import { EnterpriseCoreV2Error } from "@/lib/enterprise/core-v2/errors";
import { ENTERPRISE_BUDGET_TRANSITIONS } from "@/lib/enterprise/finance/constants";
import { enterpriseMoney } from "@/lib/enterprise/finance/money";
import { getBudgetPosition } from "@/lib/enterprise/finance/commitments";
import {
  addEnterpriseOperationalEvent,
  createEnterpriseLink,
  nullable,
  requireActiveEnterpriseMember,
  requireEnterpriseDepartment,
} from "@/lib/enterprise/procurement/shared";
import type {
  enterpriseBudgetActionSchema,
  enterpriseBudgetCreateSchema,
  enterpriseBudgetUpdateSchema,
} from "@/lib/enterprise/finance/validators";

export type EnterpriseBudgetCreateInput = z.infer<typeof enterpriseBudgetCreateSchema>;
export type EnterpriseBudgetUpdateInput = z.infer<typeof enterpriseBudgetUpdateSchema>;
export type EnterpriseBudgetActionInput = z.infer<typeof enterpriseBudgetActionSchema>;

function budgetReference() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `BUD-${date}-${randomUUID().slice(0, 8).toUpperCase()}`;
}

async function validateBudgetLines(tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0], organizationId: string, lines: EnterpriseBudgetCreateInput["lines"]) {
  const prepared = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const departmentId = await requireEnterpriseDepartment(tx, organizationId, line.departmentId);
    prepared.push({
      organizationId,
      code: nullable(line.code),
      name: line.name,
      description: nullable(line.description),
      category: nullable(line.category),
      departmentId,
      plannedAmount: enterpriseMoney(line.plannedAmount),
    });
  }
  return prepared;
}

export async function createEnterpriseBudget(organizationId: string, actorUserId: string, input: EnterpriseBudgetCreateInput) {
  return prisma.$transaction(async (tx) => {
    await requireActiveEnterpriseMember(tx, organizationId, actorUserId);
    const departmentId = await requireEnterpriseDepartment(tx, organizationId, input.departmentId);
    const lines = await validateBudgetLines(tx, organizationId, input.lines);
    const budget = await tx.enterpriseBudget.create({
      data: {
        organizationId,
        reference: budgetReference(),
        title: input.title,
        description: nullable(input.description),
        status: "DRAFT",
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        currency: input.currency,
        departmentId,
        createdByUserId: actorUserId,
        lines: { create: lines },
      },
      include: { lines: true },
    });
    await addEnterpriseOperationalEvent(tx, {
      organizationId,
      entityType: "EnterpriseBudget",
      entityId: budget.id,
      eventType: "ENTERPRISE_BUDGET_CREATED",
      summary: "Budget créé en brouillon.",
      actorUserId,
      toStatus: "DRAFT",
      metadata: { currency: budget.currency, lineCount: lines.length },
    });
    return getBudgetPosition(tx, organizationId, budget.id);
  });
}

export async function updateEnterpriseBudget(organizationId: string, budgetId: string, actorUserId: string, input: EnterpriseBudgetUpdateInput) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.enterpriseBudget.findFirst({ where: { id: budgetId, organizationId, archivedAt: null } });
    if (!existing) throw new EnterpriseCoreV2Error("Budget introuvable.", 404, "BUDGET_NOT_FOUND");
    if (existing.status !== "DRAFT") throw new EnterpriseCoreV2Error("Seul un budget en brouillon peut être modifié.", 409, "BUDGET_NOT_EDITABLE");
    const nextStart = input.periodStart ?? existing.periodStart;
    const nextEnd = input.periodEnd ?? existing.periodEnd;
    if (nextEnd < nextStart) throw new EnterpriseCoreV2Error("La période budgétaire est invalide.", 400, "INVALID_BUDGET_PERIOD");
    const departmentId = input.departmentId !== undefined ? await requireEnterpriseDepartment(tx, organizationId, input.departmentId) : undefined;
    const lines = input.lines ? await validateBudgetLines(tx, organizationId, input.lines as EnterpriseBudgetCreateInput["lines"]) : null;
    const updated = await tx.enterpriseBudget.updateMany({
      where: { id: budgetId, organizationId, status: "DRAFT", revision: input.revision, archivedAt: null },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.description !== undefined ? { description: nullable(input.description) } : {}),
        ...(input.periodStart !== undefined ? { periodStart: input.periodStart } : {}),
        ...(input.periodEnd !== undefined ? { periodEnd: input.periodEnd } : {}),
        ...(input.currency !== undefined ? { currency: input.currency } : {}),
        ...(input.departmentId !== undefined ? { departmentId: departmentId || null } : {}),
        updatedByUserId: actorUserId,
        revision: { increment: 1 },
      },
    });
    if (updated.count !== 1) throw new EnterpriseCoreV2Error("Le budget a été modifié par un autre utilisateur.", 409, "REVISION_CONFLICT");
    if (lines) {
      await tx.enterpriseBudgetLine.deleteMany({ where: { organizationId, budgetId } });
      await tx.enterpriseBudgetLine.createMany({ data: lines.map((line) => ({ ...line, budgetId })) });
    }
    await addEnterpriseOperationalEvent(tx, { organizationId, entityType: "EnterpriseBudget", entityId: budgetId, eventType: "ENTERPRISE_BUDGET_UPDATED", summary: "Budget mis à jour.", actorUserId, fromStatus: "DRAFT", toStatus: "DRAFT" });
    return getBudgetPosition(tx, organizationId, budgetId);
  });
}

export async function createEnterpriseBudgetApproval({
  organizationId,
  budgetId,
  actorUserId,
  approverUserId,
  budgetRevision,
}: {
  organizationId: string;
  budgetId: string;
  actorUserId: string;
  approverUserId: string;
  budgetRevision?: number;
}) {
  return prisma.$transaction(async (tx) => {
    const budget = await tx.enterpriseBudget.findFirst({ where: { id: budgetId, organizationId, archivedAt: null }, include: { lines: true } });
    if (!budget) throw new EnterpriseCoreV2Error("Budget introuvable.", 404, "BUDGET_NOT_FOUND");
    if (budget.status !== "DRAFT") throw new EnterpriseCoreV2Error("Le budget doit être en brouillon avant soumission.", 409, "INVALID_BUDGET_SUBMIT_STATE");
    if (!budget.lines.length) throw new EnterpriseCoreV2Error("Le budget doit contenir au moins une ligne.", 400, "BUDGET_LINES_REQUIRED");
    await requireActiveEnterpriseMember(tx, organizationId, actorUserId);
    await requireActiveEnterpriseMember(tx, organizationId, approverUserId);
    if (budget.createdByUserId === approverUserId) throw new EnterpriseCoreV2Error("Le créateur du budget ne peut pas approuver son propre budget.", 403, "SELF_APPROVAL_DENIED");
    const pending = await tx.enterpriseApproval.findFirst({ where: { organizationId, targetEntityType: "EnterpriseBudget", targetEntityId: budgetId, status: "PENDING", archivedAt: null }, select: { id: true } });
    if (pending) throw new EnterpriseCoreV2Error("Une validation est déjà en attente pour ce budget.", 409, "PENDING_APPROVAL_EXISTS");
    const promoted = await tx.enterpriseBudget.updateMany({
      where: { id: budgetId, organizationId, status: "DRAFT", revision: budgetRevision ?? budget.revision, archivedAt: null },
      data: { status: "PENDING_APPROVAL", updatedByUserId: actorUserId, revision: { increment: 1 } },
    });
    if (promoted.count !== 1) throw new EnterpriseCoreV2Error("Le budget a changé pendant sa soumission.", 409, "REVISION_CONFLICT");
    const approval = await tx.enterpriseApproval.create({ data: { organizationId, targetEntityType: "EnterpriseBudget", targetEntityId: budgetId, requestedByUserId: budget.createdByUserId, approverUserId, status: "PENDING" } });
    await createEnterpriseLink(tx, { organizationId, sourceModule: "FINANCE_BUDGETS", sourceEntityType: "EnterpriseBudget", sourceEntityId: budgetId, targetModule: "VALIDATIONS", targetEntityType: "EnterpriseApproval", targetEntityId: approval.id, linkType: "REQUIRES_APPROVAL", createdById: actorUserId });
    await addEnterpriseOperationalEvent(tx, { organizationId, entityType: "EnterpriseBudget", entityId: budgetId, eventType: "ENTERPRISE_BUDGET_SUBMITTED", summary: "Budget soumis pour approbation.", actorUserId, fromStatus: "DRAFT", toStatus: "PENDING_APPROVAL" });
    await addEnterpriseOperationalEvent(tx, { organizationId, entityType: "EnterpriseApproval", entityId: approval.id, eventType: "ENTERPRISE_APPROVAL_REQUESTED", summary: "Validation budgétaire demandée.", actorUserId, toStatus: "PENDING", metadata: { targetEntityType: "EnterpriseBudget", targetEntityId: budgetId } });
    return approval;
  });
}

export async function decideEnterpriseBudgetApproval({
  organizationId,
  approvalId,
  actorUserId,
  action,
  revision,
  decisionComment,
  canManage,
}: {
  organizationId: string;
  approvalId: string;
  actorUserId: string;
  action: "APPROVE" | "REJECT" | "CANCEL";
  revision: number;
  decisionComment?: string | null;
  canManage: boolean;
}) {
  if (action === "REJECT" && !nullable(decisionComment)) throw new EnterpriseCoreV2Error("Un motif est obligatoire pour rejeter une validation.", 400, "REJECTION_REASON_REQUIRED");
  return prisma.$transaction(async (tx) => {
    const approval = await tx.enterpriseApproval.findFirst({ where: { id: approvalId, organizationId, targetEntityType: "EnterpriseBudget", archivedAt: null } });
    if (!approval) throw new EnterpriseCoreV2Error("Validation budgétaire introuvable.", 404, "APPROVAL_NOT_FOUND");
    if (approval.status !== "PENDING") throw new EnterpriseCoreV2Error("Cette validation a déjà été décidée.", 409, "APPROVAL_ALREADY_DECIDED");
    if (action === "APPROVE" || action === "REJECT") {
      if (approval.approverUserId !== actorUserId) throw new EnterpriseCoreV2Error("Seul l’approbateur désigné peut décider ce budget.", 403, "WRONG_APPROVER");
      if (approval.requestedByUserId === actorUserId) throw new EnterpriseCoreV2Error("L’auto-approbation est interdite.", 403, "SELF_APPROVAL_DENIED");
    } else if (approval.requestedByUserId !== actorUserId && !canManage) throw new EnterpriseCoreV2Error("Vous ne pouvez pas annuler cette validation.", 403, "APPROVAL_CANCEL_DENIED");
    const budget = await tx.enterpriseBudget.findFirst({ where: { id: approval.targetEntityId, organizationId, archivedAt: null } });
    if (!budget || budget.status !== "PENDING_APPROVAL") throw new EnterpriseCoreV2Error("Le budget cible n’est plus en attente d’approbation.", 409, "APPROVAL_TARGET_CONFLICT");
    const approvalStatus = action === "APPROVE" ? "APPROVED" : action === "REJECT" ? "REJECTED" : "CANCELLED";
    const budgetStatus = action === "APPROVE" ? "ACTIVE" : action === "REJECT" ? "REJECTED" : "DRAFT";
    const approvalUpdated = await tx.enterpriseApproval.updateMany({ where: { id: approvalId, organizationId, status: "PENDING", revision, archivedAt: null }, data: { status: approvalStatus, decidedAt: action === "CANCEL" ? null : new Date(), decisionComment: nullable(decisionComment), revision: { increment: 1 } } });
    if (approvalUpdated.count !== 1) throw new EnterpriseCoreV2Error("La validation a été décidée simultanément.", 409, "APPROVAL_DECISION_CONFLICT");
    const budgetUpdated = await tx.enterpriseBudget.updateMany({
      where: { id: budget.id, organizationId, status: "PENDING_APPROVAL", revision: budget.revision, archivedAt: null },
      data: { status: budgetStatus, ...(action === "APPROVE" ? { approvedAt: new Date() } : {}), updatedByUserId: actorUserId, revision: { increment: 1 } },
    });
    if (budgetUpdated.count !== 1) throw new EnterpriseCoreV2Error("Le budget a changé pendant la décision.", 409, "APPROVAL_TARGET_CONFLICT");
    await addEnterpriseOperationalEvent(tx, { organizationId, entityType: "EnterpriseApproval", entityId: approvalId, eventType: action === "APPROVE" ? "ENTERPRISE_APPROVAL_APPROVED" : action === "REJECT" ? "ENTERPRISE_APPROVAL_REJECTED" : "ENTERPRISE_APPROVAL_CANCELLED", summary: nullable(decisionComment) || `Validation ${approvalStatus.toLowerCase()}.`, actorUserId, fromStatus: "PENDING", toStatus: approvalStatus });
    await addEnterpriseOperationalEvent(tx, { organizationId, entityType: "EnterpriseBudget", entityId: budget.id, eventType: action === "APPROVE" ? "ENTERPRISE_BUDGET_APPROVED" : action === "REJECT" ? "ENTERPRISE_BUDGET_REJECTED" : "ENTERPRISE_BUDGET_APPROVAL_CANCELLED", summary: nullable(decisionComment) || (action === "APPROVE" ? "Budget activé après approbation." : action === "REJECT" ? "Budget rejeté." : "Validation du budget annulée."), actorUserId, fromStatus: "PENDING_APPROVAL", toStatus: budgetStatus });
    return tx.enterpriseApproval.findUnique({ where: { id: approvalId } });
  });
}

export async function transitionEnterpriseBudget(organizationId: string, budgetId: string, actorUserId: string, input: EnterpriseBudgetActionInput) {
  if (input.action === "SUBMIT") {
    if (!input.approverUserId) throw new EnterpriseCoreV2Error("Un approbateur est obligatoire.", 400, "APPROVER_REQUIRED");
    return createEnterpriseBudgetApproval({ organizationId, budgetId, actorUserId, approverUserId: input.approverUserId, budgetRevision: input.revision });
  }
  const transition = ENTERPRISE_BUDGET_TRANSITIONS[input.action];
  return prisma.$transaction(async (tx) => {
    const existing = await tx.enterpriseBudget.findFirst({ where: { id: budgetId, organizationId, archivedAt: null } });
    if (!existing) throw new EnterpriseCoreV2Error("Budget introuvable.", 404, "BUDGET_NOT_FOUND");
    if (!transition.from.includes(existing.status as never)) throw new EnterpriseCoreV2Error("Cette transition budgétaire n’est pas autorisée.", 409, "INVALID_BUDGET_TRANSITION");
    const updated = await tx.enterpriseBudget.updateMany({
      where: { id: budgetId, organizationId, status: existing.status, revision: input.revision, archivedAt: null },
      data: {
        ...(transition.to ? { status: transition.to } : {}),
        ...(input.action === "CLOSE" ? { closedAt: new Date() } : {}),
        ...(input.action === "ARCHIVE" ? { archivedAt: new Date() } : {}),
        updatedByUserId: actorUserId,
        revision: { increment: 1 },
      },
    });
    if (updated.count !== 1) throw new EnterpriseCoreV2Error("Le budget a été modifié simultanément.", 409, "REVISION_CONFLICT");
    const eventType = input.action === "CLOSE" ? "ENTERPRISE_BUDGET_CLOSED" : input.action === "CANCEL" ? "ENTERPRISE_BUDGET_CANCELLED" : input.action === "REOPEN" ? "ENTERPRISE_BUDGET_REOPENED" : "ENTERPRISE_BUDGET_ARCHIVED";
    await addEnterpriseOperationalEvent(tx, { organizationId, entityType: "EnterpriseBudget", entityId: budgetId, eventType, summary: nullable(input.comment) || `Action ${input.action} appliquée au budget.`, actorUserId, fromStatus: existing.status, toStatus: transition.to || existing.status });
    return getBudgetPosition(tx, organizationId, budgetId);
  });
}
