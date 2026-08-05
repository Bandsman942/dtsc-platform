import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
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
  enterpriseBudgetAlertActionSchema,
  enterpriseBudgetAlertSchema,
  enterpriseBudgetCreateSchema,
  enterpriseBudgetUpdateSchema,
} from "@/lib/enterprise/finance/validators";

export type EnterpriseBudgetCreateInput = z.infer<typeof enterpriseBudgetCreateSchema>;
export type EnterpriseBudgetUpdateInput = z.infer<typeof enterpriseBudgetUpdateSchema>;
export type EnterpriseBudgetActionInput = z.infer<typeof enterpriseBudgetActionSchema>;
export type EnterpriseBudgetAlertInput = z.infer<typeof enterpriseBudgetAlertSchema>;
export type EnterpriseBudgetAlertActionInput = z.infer<typeof enterpriseBudgetAlertActionSchema>;

type Tx = Prisma.TransactionClient;
type BudgetPosition = Awaited<ReturnType<typeof getBudgetPosition>>;
type BudgetLinePosition = BudgetPosition["lines"][number];
type BudgetTransitionAction = keyof typeof ENTERPRISE_BUDGET_TRANSITIONS;
type PreparedBudgetLine = Omit<Prisma.EnterpriseBudgetLineCreateManyInput, "organizationId" | "budgetId">;

function budgetReference() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `BUD-${date}-${randomUUID().slice(0, 8).toUpperCase()}`;
}

function decimal(value: Prisma.Decimal.Value, scale = 2) {
  return new Prisma.Decimal(value).toDecimalPlaces(scale);
}

function jsonOrUndefined(value: unknown): Prisma.InputJsonValue | undefined {
  return value === undefined ? undefined : (value as Prisma.InputJsonValue);
}

async function requireOptionalMember(tx: Tx, organizationId: string, userId?: string | null) {
  const normalized = nullable(userId);
  if (!normalized) return null;
  await requireActiveEnterpriseMember(tx, organizationId, normalized);
  return normalized;
}

async function requireOptionalProject(tx: Tx, organizationId: string, projectId?: string | null) {
  const normalized = nullable(projectId);
  if (!normalized) return null;
  const project = await tx.enterpriseProject.findFirst({ where: { id: normalized, organizationId, archivedAt: null }, select: { id: true } });
  if (!project) throw new EnterpriseCoreV2Error("Le projet budgétaire n’appartient pas à cette entreprise.", 400, "INVALID_BUDGET_PROJECT");
  return project.id;
}

async function requireOptionalSite(tx: Tx, organizationId: string, siteId?: string | null) {
  const normalized = nullable(siteId);
  if (!normalized) return null;
  const site = await tx.enterpriseSite.findFirst({ where: { id: normalized, organizationId, archivedAt: null }, select: { id: true } });
  if (!site) throw new EnterpriseCoreV2Error("Le site budgétaire n’appartient pas à cette entreprise.", 400, "INVALID_BUDGET_SITE");
  return site.id;
}

async function validateBudgetLines(tx: Tx, organizationId: string, lines: EnterpriseBudgetCreateInput["lines"]) {
  const prepared: PreparedBudgetLine[] = [];
  for (const line of lines) {
    const departmentId = await requireEnterpriseDepartment(tx, organizationId, line.departmentId);
    const projectId = await requireOptionalProject(tx, organizationId, line.projectId);
    const siteId = await requireOptionalSite(tx, organizationId, line.siteId);
    const responsibleUserId = await requireOptionalMember(tx, organizationId, line.responsibleUserId);
    prepared.push({
      code: nullable(line.code),
      name: line.name,
      description: nullable(line.description),
      category: nullable(line.category),
      accountCode: nullable(line.accountCode),
      costCenterCode: nullable(line.costCenterCode),
      departmentId,
      projectId,
      siteId,
      responsibleUserId,
      quantity: line.quantity === undefined ? null : decimal(line.quantity, 4),
      unitCode: nullable(line.unitCode),
      hypothesis: nullable(line.hypothesis),
      plannedAmount: enterpriseMoney(line.plannedAmount),
      forecastAmount: line.forecastAmount === undefined ? null : enterpriseMoney(line.forecastAmount),
    });
  }
  return prepared;
}

export async function createEnterpriseBudget(organizationId: string, actorUserId: string, input: EnterpriseBudgetCreateInput) {
  return prisma.$transaction(async (tx) => {
    await requireActiveEnterpriseMember(tx, organizationId, actorUserId);
    const departmentId = await requireEnterpriseDepartment(tx, organizationId, input.departmentId);
    const ownerUserId = await requireOptionalMember(tx, organizationId, input.ownerUserId || actorUserId);
    const lines = await validateBudgetLines(tx, organizationId, input.lines);
    const budget = await tx.enterpriseBudget.create({
      data: {
        organizationId,
        reference: budgetReference(),
        title: input.title,
        description: nullable(input.description),
        status: "DRAFT",
        scenarioCode: input.scenarioCode,
        versionNumber: 1,
        fiscalYearCode: nullable(input.fiscalYearCode),
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        currency: input.currency,
        departmentId,
        ownerUserId,
        forecastAmount: input.forecastAmount === undefined ? null : enterpriseMoney(input.forecastAmount),
        forecastMethod: input.forecastMethod || null,
        forecastConfidence: input.forecastConfidence === undefined ? null : decimal(input.forecastConfidence, 2),
        assumptionsJson: jsonOrUndefined(input.assumptions),
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
      metadata: { currency: budget.currency, lineCount: lines.length, scenarioCode: budget.scenarioCode, versionNumber: budget.versionNumber },
    });
    return getBudgetPosition(tx, organizationId, budget.id);
  });
}

export async function updateEnterpriseBudget(organizationId: string, budgetId: string, actorUserId: string, input: EnterpriseBudgetUpdateInput) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.enterpriseBudget.findFirst({ where: { id: budgetId, organizationId, archivedAt: null } });
    if (!existing) throw new EnterpriseCoreV2Error("Budget introuvable.", 404, "BUDGET_NOT_FOUND");
    if (existing.status !== "DRAFT") throw new EnterpriseCoreV2Error("Le budget est gelé ou approuvé et doit être révisé avant modification.", 409, "BUDGET_FROZEN");
    const nextStart = input.periodStart ?? existing.periodStart;
    const nextEnd = input.periodEnd ?? existing.periodEnd;
    if (nextEnd < nextStart) throw new EnterpriseCoreV2Error("La période budgétaire est invalide.", 400, "INVALID_BUDGET_PERIOD");
    const departmentId = input.departmentId !== undefined ? await requireEnterpriseDepartment(tx, organizationId, input.departmentId) : undefined;
    const ownerUserId = input.ownerUserId !== undefined ? await requireOptionalMember(tx, organizationId, input.ownerUserId) : undefined;
    const lines = input.lines ? await validateBudgetLines(tx, organizationId, input.lines as EnterpriseBudgetCreateInput["lines"]) : null;
    const updated = await tx.enterpriseBudget.updateMany({
      where: { id: budgetId, organizationId, status: existing.status, revision: input.revision, archivedAt: null },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.description !== undefined ? { description: nullable(input.description) } : {}),
        ...(input.periodStart !== undefined ? { periodStart: input.periodStart } : {}),
        ...(input.periodEnd !== undefined ? { periodEnd: input.periodEnd } : {}),
        ...(input.currency !== undefined ? { currency: input.currency } : {}),
        ...(input.scenarioCode !== undefined ? { scenarioCode: input.scenarioCode } : {}),
        ...(input.fiscalYearCode !== undefined ? { fiscalYearCode: nullable(input.fiscalYearCode) } : {}),
        ...(input.departmentId !== undefined ? { departmentId } : {}),
        ...(input.ownerUserId !== undefined ? { ownerUserId } : {}),
        ...(input.forecastAmount !== undefined ? { forecastAmount: enterpriseMoney(input.forecastAmount) } : {}),
        ...(input.forecastMethod !== undefined ? { forecastMethod: input.forecastMethod } : {}),
        ...(input.forecastConfidence !== undefined ? { forecastConfidence: decimal(input.forecastConfidence, 2) } : {}),
        ...(input.assumptions !== undefined ? { assumptionsJson: jsonOrUndefined(input.assumptions) } : {}),
        updatedByUserId: actorUserId,
        revision: { increment: 1 },
      },
    });
    if (updated.count !== 1) throw new EnterpriseCoreV2Error("Le budget a été modifié par un autre utilisateur.", 409, "REVISION_CONFLICT");
    if (lines) {
      const inUse = await tx.enterpriseBudgetLine.count({ where: { organizationId, budgetId, OR: [{ commitments: { some: {} } }, { purchases: { some: {} } }, { expenses: { some: {} } }] } });
      if (inUse) throw new EnterpriseCoreV2Error("Les lignes déjà utilisées ne peuvent pas être remplacées. Créez une nouvelle version.", 409, "BUDGET_LINES_IN_USE");
      await tx.enterpriseBudgetLine.deleteMany({ where: { organizationId, budgetId } });
      await tx.enterpriseBudgetLine.createMany({ data: lines.map((line) => ({ ...line, organizationId, budgetId })) });
    }
    await addEnterpriseOperationalEvent(tx, { organizationId, entityType: "EnterpriseBudget", entityId: budgetId, eventType: "ENTERPRISE_BUDGET_UPDATED", summary: "Budget mis à jour.", actorUserId, fromStatus: existing.status, toStatus: existing.status });
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
    if (!["DRAFT", "PREPARING", "CORRECTION_REQUESTED"].includes(budget.status)) throw new EnterpriseCoreV2Error("Le budget n’est pas dans un état permettant la soumission.", 409, "INVALID_BUDGET_SUBMIT_STATE");
    if (!budget.lines.length) throw new EnterpriseCoreV2Error("Le budget doit contenir au moins une ligne.", 400, "BUDGET_LINES_REQUIRED");
    await requireActiveEnterpriseMember(tx, organizationId, actorUserId);
    await requireActiveEnterpriseMember(tx, organizationId, approverUserId);
    if (budget.createdByUserId === approverUserId) throw new EnterpriseCoreV2Error("Le créateur du budget ne peut pas approuver son propre budget.", 403, "SELF_APPROVAL_DENIED");
    const pending = await tx.enterpriseApproval.findFirst({ where: { organizationId, targetEntityType: "EnterpriseBudget", targetEntityId: budgetId, status: "PENDING", archivedAt: null }, select: { id: true } });
    if (pending) throw new EnterpriseCoreV2Error("Une validation est déjà en attente pour ce budget.", 409, "PENDING_APPROVAL_EXISTS");
    const promoted = await tx.enterpriseBudget.updateMany({
      where: { id: budgetId, organizationId, status: budget.status, revision: budgetRevision ?? budget.revision, archivedAt: null },
      data: { status: "PENDING_APPROVAL", submittedAt: new Date(), updatedByUserId: actorUserId, revision: { increment: 1 } },
    });
    if (promoted.count !== 1) throw new EnterpriseCoreV2Error("Le budget a changé pendant sa soumission.", 409, "REVISION_CONFLICT");
    const approval = await tx.enterpriseApproval.create({ data: { organizationId, targetEntityType: "EnterpriseBudget", targetEntityId: budgetId, requestedByUserId: budget.createdByUserId, approverUserId, status: "PENDING" } });
    await createEnterpriseLink(tx, { organizationId, sourceModule: "FINANCE_BUDGETS", sourceEntityType: "EnterpriseBudget", sourceEntityId: budgetId, targetModule: "VALIDATIONS", targetEntityType: "EnterpriseApproval", targetEntityId: approval.id, linkType: "REQUIRES_APPROVAL", createdById: actorUserId });
    await addEnterpriseOperationalEvent(tx, { organizationId, entityType: "EnterpriseBudget", entityId: budgetId, eventType: "ENTERPRISE_BUDGET_SUBMITTED", summary: "Budget soumis pour approbation.", actorUserId, fromStatus: budget.status, toStatus: "PENDING_APPROVAL" });
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
      if (approval.approverUserId !== actorUserId) throw new EnterpriseCoreV2Error("Seul l’approbateur désigné peut décider ce budget.", 403, "VALIDATOR_NOT_ALLOWED");
      if (approval.requestedByUserId === actorUserId) throw new EnterpriseCoreV2Error("L’auto-approbation est interdite.", 403, "SELF_APPROVAL_DENIED");
    } else if (approval.requestedByUserId !== actorUserId && !canManage) {
      throw new EnterpriseCoreV2Error("Vous ne pouvez pas annuler cette validation.", 403, "APPROVAL_CANCEL_DENIED");
    }
    const budget = await tx.enterpriseBudget.findFirst({ where: { id: approval.targetEntityId, organizationId, archivedAt: null } });
    if (!budget || budget.status !== "PENDING_APPROVAL") throw new EnterpriseCoreV2Error("Le budget cible n’est plus en attente d’approbation.", 409, "APPROVAL_TARGET_CONFLICT");
    const approvalStatus = action === "APPROVE" ? "APPROVED" : action === "REJECT" ? "REJECTED" : "CANCELLED";
    const budgetStatus = action === "APPROVE" ? "ACTIVE" : action === "REJECT" ? "REJECTED" : "DRAFT";
    const approvalUpdated = await tx.enterpriseApproval.updateMany({ where: { id: approvalId, organizationId, status: "PENDING", revision, archivedAt: null }, data: { status: approvalStatus, decidedAt: action === "CANCEL" ? null : new Date(), decisionComment: nullable(decisionComment), revision: { increment: 1 } } });
    if (approvalUpdated.count !== 1) throw new EnterpriseCoreV2Error("La validation a été décidée simultanément.", 409, "APPROVAL_DECISION_CONFLICT");
    const budgetUpdated = await tx.enterpriseBudget.updateMany({
      where: { id: budget.id, organizationId, status: "PENDING_APPROVAL", revision: budget.revision, archivedAt: null },
      data: { status: budgetStatus, ...(action === "APPROVE" ? { approvedAt: new Date(), actualFreshnessAt: new Date() } : {}), updatedByUserId: actorUserId, revision: { increment: 1 } },
    });
    if (budgetUpdated.count !== 1) throw new EnterpriseCoreV2Error("Le budget a changé pendant la décision.", 409, "APPROVAL_TARGET_CONFLICT");
    await addEnterpriseOperationalEvent(tx, { organizationId, entityType: "EnterpriseApproval", entityId: approvalId, eventType: action === "APPROVE" ? "ENTERPRISE_APPROVAL_APPROVED" : action === "REJECT" ? "ENTERPRISE_APPROVAL_REJECTED" : "ENTERPRISE_APPROVAL_CANCELLED", summary: nullable(decisionComment) || `Validation ${approvalStatus.toLowerCase()}.`, actorUserId, fromStatus: "PENDING", toStatus: approvalStatus });
    await addEnterpriseOperationalEvent(tx, { organizationId, entityType: "EnterpriseBudget", entityId: budget.id, eventType: action === "APPROVE" ? "ENTERPRISE_BUDGET_APPROVED" : action === "REJECT" ? "ENTERPRISE_BUDGET_REJECTED" : "ENTERPRISE_BUDGET_APPROVAL_CANCELLED", summary: nullable(decisionComment) || (action === "APPROVE" ? "Budget activé après approbation." : action === "REJECT" ? "Budget rejeté." : "Validation du budget annulée."), actorUserId, fromStatus: "PENDING_APPROVAL", toStatus: budgetStatus });
    return tx.enterpriseApproval.findUnique({ where: { id: approvalId } });
  });
}

async function createBudgetRevision(tx: Tx, organizationId: string, budgetId: string, actorUserId: string, input: EnterpriseBudgetActionInput) {
  const existing = await tx.enterpriseBudget.findFirst({ where: { id: budgetId, organizationId, archivedAt: null }, include: { lines: true } });
  if (!existing) throw new EnterpriseCoreV2Error("Budget introuvable.", 404, "BUDGET_NOT_FOUND");
  if (!["ACTIVE", "FROZEN", "CLOSED"].includes(existing.status)) throw new EnterpriseCoreV2Error("Seul un budget approuvé, gelé ou clôturé peut être révisé.", 409, "INVALID_BUDGET_REVISION_STATE");
  if (existing.revision !== input.revision) throw new EnterpriseCoreV2Error("Le budget a été modifié simultanément.", 409, "REVISION_CONFLICT");
  const rootId = existing.parentBudgetId || existing.id;
  const latest = await tx.enterpriseBudget.aggregate({ where: { organizationId, OR: [{ id: rootId }, { parentBudgetId: rootId }] }, _max: { versionNumber: true } });
  const versionNumber = (latest._max.versionNumber || existing.versionNumber) + 1;
  const revised = await tx.enterpriseBudget.create({
    data: {
      organizationId,
      reference: budgetReference(),
      title: existing.title,
      description: existing.description,
      status: "DRAFT",
      scenarioCode: "REVISED",
      versionNumber,
      parentBudgetId: rootId,
      fiscalYearCode: existing.fiscalYearCode,
      periodStart: existing.periodStart,
      periodEnd: existing.periodEnd,
      currency: existing.currency,
      departmentId: existing.departmentId,
      ownerUserId: existing.ownerUserId,
      forecastAmount: existing.forecastAmount,
      forecastMethod: existing.forecastMethod,
      forecastConfidence: existing.forecastConfidence,
      assumptionsJson: existing.assumptionsJson === null ? undefined : existing.assumptionsJson,
      createdByUserId: actorUserId,
      lines: {
        create: existing.lines.map((line) => ({
          organizationId,
          code: line.code,
          name: line.name,
          description: line.description,
          category: line.category,
          accountCode: line.accountCode,
          costCenterCode: line.costCenterCode,
          departmentId: line.departmentId,
          projectId: line.projectId,
          siteId: line.siteId,
          responsibleUserId: line.responsibleUserId,
          quantity: line.quantity,
          unitCode: line.unitCode,
          hypothesis: line.hypothesis,
          plannedAmount: line.plannedAmount,
          forecastAmount: line.forecastAmount,
        })),
      },
    },
  });
  await createEnterpriseLink(tx, { organizationId, sourceModule: "FINANCE_BUDGETS", sourceEntityType: "EnterpriseBudget", sourceEntityId: existing.id, targetModule: "FINANCE_BUDGETS", targetEntityType: "EnterpriseBudget", targetEntityId: revised.id, linkType: "REVISED_AS", createdById: actorUserId });
  await addEnterpriseOperationalEvent(tx, { organizationId, entityType: "EnterpriseBudget", entityId: existing.id, eventType: "ENTERPRISE_BUDGET_REVISION_CREATED", summary: nullable(input.revisionReason) || "Une nouvelle version budgétaire a été créée.", actorUserId, fromStatus: existing.status, toStatus: existing.status, metadata: { revisedBudgetId: revised.id, versionNumber } });
  return getBudgetPosition(tx, organizationId, revised.id);
}

export async function transitionEnterpriseBudget(organizationId: string, budgetId: string, actorUserId: string, input: EnterpriseBudgetActionInput) {
  if (input.action === "SUBMIT") {
    if (!input.approverUserId) throw new EnterpriseCoreV2Error("Un approbateur est obligatoire.", 400, "APPROVER_REQUIRED");
    return createEnterpriseBudgetApproval({ organizationId, budgetId, actorUserId, approverUserId: input.approverUserId, budgetRevision: input.revision });
  }
  if (input.action === "CREATE_REVISION") return prisma.$transaction((tx) => createBudgetRevision(tx, organizationId, budgetId, actorUserId, input));
  const action = input.action as BudgetTransitionAction;
  const transition = ENTERPRISE_BUDGET_TRANSITIONS[action];
  return prisma.$transaction(async (tx) => {
    const existing = await tx.enterpriseBudget.findFirst({ where: { id: budgetId, organizationId, archivedAt: null } });
    if (!existing) throw new EnterpriseCoreV2Error("Budget introuvable.", 404, "BUDGET_NOT_FOUND");
    if (!transition.from.includes(existing.status as never)) throw new EnterpriseCoreV2Error("Cette transition budgétaire n’est pas autorisée.", 409, "INVALID_BUDGET_TRANSITION");
    const updated = await tx.enterpriseBudget.updateMany({
      where: { id: budgetId, organizationId, status: existing.status, revision: input.revision, archivedAt: null },
      data: {
        ...(transition.to ? { status: transition.to } : {}),
        ...(input.action === "FREEZE" ? { frozenAt: new Date(), frozenByUserId: actorUserId } : {}),
        ...(input.action === "CLOSE" ? { closedAt: new Date() } : {}),
        ...(input.action === "ARCHIVE" ? { archivedAt: new Date() } : {}),
        updatedByUserId: actorUserId,
        revision: { increment: 1 },
      },
    });
    if (updated.count !== 1) throw new EnterpriseCoreV2Error("Le budget a été modifié simultanément.", 409, "REVISION_CONFLICT");
    const eventType = input.action === "FREEZE" ? "ENTERPRISE_BUDGET_FROZEN" : input.action === "CLOSE" ? "ENTERPRISE_BUDGET_CLOSED" : input.action === "CANCEL" ? "ENTERPRISE_BUDGET_CANCELLED" : input.action === "REOPEN" ? "ENTERPRISE_BUDGET_REOPENED" : "ENTERPRISE_BUDGET_ARCHIVED";
    await addEnterpriseOperationalEvent(tx, { organizationId, entityType: "EnterpriseBudget", entityId: budgetId, eventType, summary: nullable(input.comment) || `Action ${input.action} appliquée au budget.`, actorUserId, fromStatus: existing.status, toStatus: transition.to || existing.status });
    return getBudgetPosition(tx, organizationId, budgetId);
  });
}

function alertCurrentValue(ruleCode: EnterpriseBudgetAlertInput["ruleCode"], planned: Prisma.Decimal, committed: Prisma.Decimal, actual: Prisma.Decimal, forecast: Prisma.Decimal) {
  if (ruleCode === "CONSUMPTION_THRESHOLD") return planned.gt(0) ? actual.div(planned).mul(100) : enterpriseMoney(0);
  if (ruleCode === "OVERSPEND") return actual.sub(planned);
  if (ruleCode === "HIGH_COMMITMENT") return planned.gt(0) ? committed.div(planned).mul(100) : enterpriseMoney(0);
  if (ruleCode === "FORECAST_OVERSPEND") return forecast.sub(planned);
  return actual;
}

export async function createEnterpriseBudgetAlert(organizationId: string, budgetId: string, actorUserId: string, input: EnterpriseBudgetAlertInput) {
  return prisma.$transaction(async (tx) => {
    await requireActiveEnterpriseMember(tx, organizationId, actorUserId);
    const budget = await tx.enterpriseBudget.findFirst({ where: { id: budgetId, organizationId, archivedAt: null }, select: { id: true, periodStart: true, periodEnd: true } });
    if (!budget) throw new EnterpriseCoreV2Error("Budget introuvable.", 404, "BUDGET_NOT_FOUND");
    if (input.budgetLineId) {
      const line = await tx.enterpriseBudgetLine.findFirst({ where: { id: input.budgetLineId, organizationId, budgetId }, select: { id: true } });
      if (!line) throw new EnterpriseCoreV2Error("La ligne d’alerte n’appartient pas au budget.", 400, "INVALID_BUDGET_LINE");
    }
    const responsibleUserId = await requireOptionalMember(tx, organizationId, input.responsibleUserId);
    for (const recipientId of input.recipientUserIds) await requireActiveEnterpriseMember(tx, organizationId, recipientId);
    const deduplicationKey = [budgetId, input.budgetLineId || "ALL", input.ruleCode, input.thresholdType, input.thresholdValue].join(":");
    const alert = await tx.enterpriseBudgetAlert.upsert({
      where: { organizationId_deduplicationKey: { organizationId, deduplicationKey } },
      create: {
        organizationId,
        budgetId,
        budgetLineId: nullable(input.budgetLineId),
        ruleCode: input.ruleCode,
        thresholdType: input.thresholdType,
        thresholdValue: decimal(input.thresholdValue, 4),
        severity: input.severity,
        periodStart: budget.periodStart,
        periodEnd: budget.periodEnd,
        responsibleUserId,
        recipientIdsJson: input.recipientUserIds as Prisma.InputJsonValue,
        deduplicationKey,
      },
      update: {
        thresholdValue: decimal(input.thresholdValue, 4),
        severity: input.severity,
        responsibleUserId,
        recipientIdsJson: input.recipientUserIds as Prisma.InputJsonValue,
        status: "OPEN",
        resolvedAt: null,
        closedAt: null,
      },
    });
    await addEnterpriseOperationalEvent(tx, { organizationId, entityType: "EnterpriseBudget", entityId: budgetId, eventType: "ENTERPRISE_BUDGET_ALERT_CONFIGURED", summary: `Alerte ${input.ruleCode} configurée.`, actorUserId, metadata: { alertId: alert.id, thresholdValue: input.thresholdValue, thresholdType: input.thresholdType } });
    return alert;
  });
}

export async function evaluateEnterpriseBudgetAlerts(organizationId: string, budgetId: string, actorUserId: string) {
  return prisma.$transaction(async (tx) => {
    const position = await getBudgetPosition(tx, organizationId, budgetId);
    const alerts = await tx.enterpriseBudgetAlert.findMany({ where: { organizationId, budgetId, closedAt: null } });
    const lineMap = new Map<string, BudgetLinePosition>(position.lines.map((entry) => [entry.line.id, entry]));
    const forecastTotal = position.lines.reduce((sum, entry) => sum.add(entry.line.forecastAmount || entry.actual.add(entry.remainingCommitment)), enterpriseMoney(0));
    const updated = [];
    for (const alert of alerts) {
      const line = alert.budgetLineId ? lineMap.get(alert.budgetLineId) : null;
      const planned = line ? line.planned : position.planned;
      const committed = line ? line.remainingCommitment : position.committedRemaining;
      const actual = line ? line.actual : position.actual;
      const forecast = line ? enterpriseMoney(line.line.forecastAmount || line.actual.add(line.remainingCommitment)) : forecastTotal;
      const currentValue = alertCurrentValue(alert.ruleCode as EnterpriseBudgetAlertInput["ruleCode"], planned, committed, actual, forecast).toDecimalPlaces(4);
      const threshold = decimal(alert.thresholdValue, 4);
      const triggered = alert.ruleCode === "MISSING_ACTUALS" ? !position.budget.actualFreshnessAt : currentValue.gte(threshold);
      const status = triggered ? (alert.status === "ACKNOWLEDGED" ? "ACKNOWLEDGED" : "OPEN") : "RESOLVED";
      updated.push(await tx.enterpriseBudgetAlert.update({
        where: { id: alert.id },
        data: { currentValue, status, resolvedAt: status === "RESOLVED" ? new Date() : null, triggeredAt: triggered && alert.status === "RESOLVED" ? new Date() : alert.triggeredAt },
      }));
    }
    await tx.enterpriseBudget.updateMany({ where: { id: budgetId, organizationId }, data: { actualFreshnessAt: new Date() } });
    await addEnterpriseOperationalEvent(tx, { organizationId, entityType: "EnterpriseBudget", entityId: budgetId, eventType: "ENTERPRISE_BUDGET_ALERTS_EVALUATED", summary: `${updated.length} règle(s) budgétaire(s) évaluée(s).`, actorUserId, metadata: { openCount: updated.filter((alert) => alert.status === "OPEN" || alert.status === "ACKNOWLEDGED").length } });
    return updated;
  });
}

export async function transitionEnterpriseBudgetAlert(organizationId: string, budgetId: string, alertId: string, actorUserId: string, input: EnterpriseBudgetAlertActionInput) {
  return prisma.$transaction(async (tx) => {
    const alert = await tx.enterpriseBudgetAlert.findFirst({ where: { id: alertId, organizationId, budgetId } });
    if (!alert) throw new EnterpriseCoreV2Error("Alerte budgétaire introuvable.", 404, "BUDGET_ALERT_NOT_FOUND");
    const updated = await tx.enterpriseBudgetAlert.update({
      where: { id: alert.id },
      data: { status: input.status, resolvedAt: input.status === "RESOLVED" ? new Date() : alert.resolvedAt, closedAt: input.status === "CLOSED" ? new Date() : null },
    });
    await addEnterpriseOperationalEvent(tx, { organizationId, entityType: "EnterpriseBudget", entityId: budgetId, eventType: "ENTERPRISE_BUDGET_ALERT_STATUS_CHANGED", summary: nullable(input.comment) || `Alerte passée à ${input.status}.`, actorUserId, metadata: { alertId, fromStatus: alert.status, toStatus: input.status } });
    return updated;
  });
}
