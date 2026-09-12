import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertIndependentActor } from "@/lib/enterprise/accounting/access";
import { validateAccountingDimensions } from "@/lib/enterprise/accounting/accounting-dimension-validation";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";
import { assertActiveClientOrganization, financeReference, money, publishFinanceEvent, sumDecimals } from "@/lib/enterprise/accounting/helpers";
import { getPostingPeriod } from "@/lib/enterprise/accounting/periods";
import { reverseJournalEntryTx } from "@/lib/enterprise/accounting/reversal-service";
import type {
  periodicAccountingExecutionSchema,
  periodicAccountingTemplateCreateSchema,
  periodicAccountingTemplateVersionSchema,
  periodicAccountingTransitionSchema,
} from "@/lib/enterprise/accounting/periodic-accounting-schemas";
import type { z } from "zod";

type TemplateCreateInput = z.infer<typeof periodicAccountingTemplateCreateSchema>;
type TemplateVersionInput = z.infer<typeof periodicAccountingTemplateVersionSchema>;
type TemplateTransitionInput = z.infer<typeof periodicAccountingTransitionSchema>;
type ExecutionInput = z.infer<typeof periodicAccountingExecutionSchema>;

type PeriodicTemplateInput = TemplateCreateInput | TemplateVersionInput;

function normalizedDateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

function monthDifference(from: Date, to: Date) {
  return (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + to.getUTCMonth() - from.getUTCMonth();
}

function assertCadenceEligible(template: { cadence: string; startDate: Date }, accountingDate: Date) {
  const difference = monthDifference(template.startDate, accountingDate);
  if (difference < 0) throw new EnterpriseAccountingError("PERIODIC_ACCOUNTING_BEFORE_START_DATE", 409);
  if (template.cadence === "QUARTERLY" && difference % 3 !== 0) throw new EnterpriseAccountingError("PERIODIC_ACCOUNTING_CADENCE_MISMATCH", 409);
  if (template.cadence === "YEARLY" && difference % 12 !== 0) throw new EnterpriseAccountingError("PERIODIC_ACCOUNTING_CADENCE_MISMATCH", 409);
}

async function validatePeriodicReferences(
  tx: Prisma.TransactionClient,
  organizationId: string,
  input: PeriodicTemplateInput,
) {
  const [journal, configuration, accounts] = await Promise.all([
    tx.enterpriseJournal.findFirst({ where: { id: input.journalId, organizationId, isActive: true } }),
    tx.enterpriseFinanceConfiguration.findUnique({ where: { organizationId } }),
    tx.enterpriseLedgerAccount.findMany({
      where: {
        organizationId,
        id: { in: [...new Set(input.lines.map((line) => line.ledgerAccountId))] },
        isActive: true,
        archivedAt: null,
      },
      select: { id: true, allowDirectPosting: true },
    }),
  ]);
  if (!journal) throw new EnterpriseAccountingError("JOURNAL_NOT_FOUND", 404);
  if (!configuration) throw new EnterpriseAccountingError("FINANCE_CONFIGURATION_REQUIRED", 409);
  if (input.currencyCode !== configuration.functionalCurrencyCode) {
    throw new EnterpriseAccountingError("PERIODIC_ACCOUNTING_FUNCTIONAL_CURRENCY_REQUIRED", 409, {
      functionalCurrencyCode: configuration.functionalCurrencyCode,
    });
  }
  if (accounts.length !== new Set(input.lines.map((line) => line.ledgerAccountId)).size) {
    throw new EnterpriseAccountingError("JOURNAL_ACCOUNT_INVALID", 409);
  }
  if (accounts.some((account) => !account.allowDirectPosting)) {
    throw new EnterpriseAccountingError("JOURNAL_DIRECT_POSTING_FORBIDDEN", 409);
  }
  await validateAccountingDimensions(tx, organizationId, input.lines);
  return { journal, configuration };
}

function templateLineData(organizationId: string, lines: PeriodicTemplateInput["lines"]) {
  return lines.map((line, index) => ({
    organizationId,
    position: index + 1,
    ledgerAccountId: line.ledgerAccountId,
    side: line.side,
    allocationPercent: new Prisma.Decimal(line.allocationPercent),
    description: line.description || null,
    businessPartyId: line.businessPartyId || null,
    projectId: line.projectId || null,
    departmentId: line.departmentId || null,
    siteId: line.siteId || null,
    assetId: line.assetId || null,
    inventoryItemId: line.inventoryItemId || null,
    analyticReference: line.analyticReference || null,
  }));
}

async function activateTemplateTx(
  tx: Prisma.TransactionClient,
  organizationId: string,
  template: { id: string; code: string; version: number; status: string },
  actorUserId: string,
  approvedByUserId?: string | null,
) {
  await tx.enterprisePeriodicAccountingTemplate.updateMany({
    where: { organizationId, code: template.code, status: "ACTIVE", id: { not: template.id } },
    data: { status: "SUPERSEDED", deactivatedAt: new Date(), revision: { increment: 1 } },
  });
  const active = await tx.enterprisePeriodicAccountingTemplate.update({
    where: { id: template.id },
    data: {
      status: "ACTIVE",
      approvedByUserId: approvedByUserId || null,
      activatedAt: new Date(),
      deactivatedAt: null,
      revision: { increment: 1 },
    },
    include: { lines: { orderBy: { position: "asc" } }, executions: { orderBy: { accountingDate: "desc" }, take: 10 } },
  });
  await publishFinanceEvent(tx, {
    organizationId,
    entityType: "EnterprisePeriodicAccountingTemplate",
    entityId: active.id,
    eventType: "PERIODIC_ACCOUNTING_TEMPLATE_ACTIVATED",
    summary: `Periodic accounting template ${active.code} v${active.version} activated`,
    actorUserId,
    fromStatus: template.status,
    toStatus: "ACTIVE",
    metadataJson: { code: active.code, version: active.version, operationType: active.operationType },
  });
  return active;
}

export async function createPeriodicAccountingTemplate(
  organizationId: string,
  actorUserId: string,
  input: TemplateCreateInput,
) {
  return prisma.$transaction(async (tx) => {
    await assertActiveClientOrganization(tx, organizationId);
    const existing = await tx.enterprisePeriodicAccountingTemplate.findFirst({ where: { organizationId, code: input.code } });
    if (existing) throw new EnterpriseAccountingError("PERIODIC_ACCOUNTING_TEMPLATE_CODE_EXISTS", 409);
    const { journal } = await validatePeriodicReferences(tx, organizationId, input);
    const template = await tx.enterprisePeriodicAccountingTemplate.create({
      data: {
        organizationId,
        code: input.code,
        version: 1,
        nameFr: input.nameFr,
        nameEn: input.nameEn,
        operationType: input.operationType,
        journalId: input.journalId,
        cadence: input.cadence,
        startDate: input.startDate,
        endDate: input.endDate || null,
        defaultAmount: money(input.defaultAmount),
        currencyCode: input.currencyCode,
        autoReverse: input.autoReverse,
        reversalPolicy: input.autoReverse ? "NEXT_OPEN_PERIOD" : null,
        status: "DRAFT",
        requiresApproval: journal.requiresApproval,
        createdByUserId: actorUserId,
        lines: { create: templateLineData(organizationId, input.lines) },
      },
      include: { lines: { orderBy: { position: "asc" } }, executions: true },
    });
    await publishFinanceEvent(tx, {
      organizationId,
      entityType: "EnterprisePeriodicAccountingTemplate",
      entityId: template.id,
      eventType: "PERIODIC_ACCOUNTING_TEMPLATE_CREATED",
      summary: `Periodic accounting template ${template.code} v${template.version} created`,
      actorUserId,
      toStatus: "DRAFT",
      metadataJson: { code: template.code, version: template.version, operationType: template.operationType, cadence: template.cadence },
    });
    return template;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 30000 });
}

export async function createPeriodicAccountingTemplateVersion(
  organizationId: string,
  templateId: string,
  actorUserId: string,
  input: TemplateVersionInput,
) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterprisePeriodicAccountingTemplate" WHERE id = ${templateId} AND "organizationId" = ${organizationId} FOR UPDATE`);
    const source = await tx.enterprisePeriodicAccountingTemplate.findFirst({ where: { id: templateId, organizationId } });
    if (!source) throw new EnterpriseAccountingError("PERIODIC_ACCOUNTING_TEMPLATE_NOT_FOUND", 404);
    if (["DRAFT", "PENDING_APPROVAL"].includes(source.status)) throw new EnterpriseAccountingError("PERIODIC_ACCOUNTING_TEMPLATE_VERSION_CONFLICT", 409);
    const { journal } = await validatePeriodicReferences(tx, organizationId, input);
    const latest = await tx.enterprisePeriodicAccountingTemplate.aggregate({ where: { organizationId, code: source.code }, _max: { version: true } });
    const version = (latest._max.version || source.version) + 1;
    const template = await tx.enterprisePeriodicAccountingTemplate.create({
      data: {
        organizationId,
        code: source.code,
        version,
        nameFr: input.nameFr,
        nameEn: input.nameEn,
        operationType: input.operationType,
        journalId: input.journalId,
        cadence: input.cadence,
        startDate: input.startDate,
        endDate: input.endDate || null,
        defaultAmount: money(input.defaultAmount),
        currencyCode: input.currencyCode,
        autoReverse: input.autoReverse,
        reversalPolicy: input.autoReverse ? "NEXT_OPEN_PERIOD" : null,
        status: "DRAFT",
        requiresApproval: journal.requiresApproval,
        createdByUserId: actorUserId,
        lines: { create: templateLineData(organizationId, input.lines) },
      },
      include: { lines: { orderBy: { position: "asc" } }, executions: true },
    });
    await publishFinanceEvent(tx, {
      organizationId,
      entityType: "EnterprisePeriodicAccountingTemplate",
      entityId: template.id,
      eventType: "PERIODIC_ACCOUNTING_TEMPLATE_VERSION_CREATED",
      summary: `Periodic accounting template ${template.code} v${template.version} created`,
      actorUserId,
      toStatus: "DRAFT",
      metadataJson: { sourceTemplateId: source.id, sourceVersion: source.version, version: template.version },
    });
    return template;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 30000 });
}

export async function transitionPeriodicAccountingTemplate(
  organizationId: string,
  templateId: string,
  actorUserId: string,
  input: TemplateTransitionInput,
) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterprisePeriodicAccountingTemplate" WHERE id = ${templateId} AND "organizationId" = ${organizationId} FOR UPDATE`);
    const template = await tx.enterprisePeriodicAccountingTemplate.findFirst({ where: { id: templateId, organizationId } });
    if (!template) throw new EnterpriseAccountingError("PERIODIC_ACCOUNTING_TEMPLATE_NOT_FOUND", 404);
    if (template.revision !== input.revision) throw new EnterpriseAccountingError("PERIODIC_ACCOUNTING_TEMPLATE_REVISION_CONFLICT", 409, { currentRevision: template.revision });

    if (input.action === "SUBMIT") {
      if (template.status !== "DRAFT") throw new EnterpriseAccountingError("PERIODIC_ACCOUNTING_TEMPLATE_TRANSITION_INVALID", 409);
      if (!template.requiresApproval) return activateTemplateTx(tx, organizationId, template, actorUserId);
      const pending = await tx.enterprisePeriodicAccountingTemplate.update({
        where: { id: template.id },
        data: { status: "PENDING_APPROVAL", revision: { increment: 1 } },
        include: { lines: { orderBy: { position: "asc" } }, executions: { orderBy: { accountingDate: "desc" }, take: 10 } },
      });
      await publishFinanceEvent(tx, {
        organizationId,
        entityType: "EnterprisePeriodicAccountingTemplate",
        entityId: template.id,
        eventType: "PERIODIC_ACCOUNTING_TEMPLATE_SUBMITTED",
        summary: `Periodic accounting template ${template.code} v${template.version} submitted`,
        actorUserId,
        fromStatus: "DRAFT",
        toStatus: "PENDING_APPROVAL",
      });
      return pending;
    }

    if (input.action === "APPROVE") {
      if (template.status !== "PENDING_APPROVAL" || !template.requiresApproval) throw new EnterpriseAccountingError("PERIODIC_ACCOUNTING_TEMPLATE_TRANSITION_INVALID", 409);
      assertIndependentActor({ actorUserId, relatedUserIds: [template.createdByUserId], errorCode: "PERIODIC_ACCOUNTING_TEMPLATE_SELF_APPROVAL_FORBIDDEN" });
      return activateTemplateTx(tx, organizationId, template, actorUserId, actorUserId);
    }

    if (template.status !== "ACTIVE") throw new EnterpriseAccountingError("PERIODIC_ACCOUNTING_TEMPLATE_TRANSITION_INVALID", 409);
    const inactive = await tx.enterprisePeriodicAccountingTemplate.update({
      where: { id: template.id },
      data: { status: "INACTIVE", deactivatedAt: new Date(), revision: { increment: 1 } },
      include: { lines: { orderBy: { position: "asc" } }, executions: { orderBy: { accountingDate: "desc" }, take: 10 } },
    });
    await publishFinanceEvent(tx, {
      organizationId,
      entityType: "EnterprisePeriodicAccountingTemplate",
      entityId: template.id,
      eventType: "PERIODIC_ACCOUNTING_TEMPLATE_DEACTIVATED",
      summary: `Periodic accounting template ${template.code} v${template.version} deactivated`,
      actorUserId,
      fromStatus: "ACTIVE",
      toStatus: "INACTIVE",
    });
    return inactive;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 30000 });
}

function allocateTemplateLines(
  amount: Prisma.Decimal,
  lines: Array<{
    id: string;
    position: number;
    ledgerAccountId: string;
    side: string;
    allocationPercent: Prisma.Decimal;
    description: string | null;
    businessPartyId: string | null;
    projectId: string | null;
    departmentId: string | null;
    siteId: string | null;
    assetId: string | null;
    inventoryItemId: string | null;
    analyticReference: string | null;
  }>,
) {
  const allocated = new Map<string, Prisma.Decimal>();
  for (const side of ["DEBIT", "CREDIT"]) {
    const sideLines = lines.filter((line) => line.side === side).sort((a, b) => a.position - b.position);
    let used = new Prisma.Decimal(0);
    sideLines.forEach((line, index) => {
      const lineAmount = index === sideLines.length - 1
        ? money(amount.minus(used))
        : money(amount.times(line.allocationPercent).dividedBy(100));
      used = used.plus(lineAmount);
      allocated.set(line.id, lineAmount);
    });
  }
  const debit = sumDecimals(lines.filter((line) => line.side === "DEBIT").map((line) => allocated.get(line.id) || 0));
  const credit = sumDecimals(lines.filter((line) => line.side === "CREDIT").map((line) => allocated.get(line.id) || 0));
  if (!debit.equals(amount) || !credit.equals(amount)) throw new EnterpriseAccountingError("PERIODIC_ACCOUNTING_ALLOCATION_UNBALANCED", 409);
  return allocated;
}

export async function executePeriodicAccountingTemplate(
  organizationId: string,
  templateId: string,
  actorUserId: string,
  input: ExecutionInput,
) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterprisePeriodicAccountingTemplate" WHERE id = ${templateId} AND "organizationId" = ${organizationId} FOR UPDATE`);
    const template = await tx.enterprisePeriodicAccountingTemplate.findFirst({
      where: { id: templateId, organizationId },
      include: { lines: { orderBy: { position: "asc" } } },
    });
    if (!template) throw new EnterpriseAccountingError("PERIODIC_ACCOUNTING_TEMPLATE_NOT_FOUND", 404);
    if (template.status !== "ACTIVE") throw new EnterpriseAccountingError("PERIODIC_ACCOUNTING_TEMPLATE_NOT_ACTIVE", 409);
    if (template.requiresApproval && !template.approvedByUserId) throw new EnterpriseAccountingError("PERIODIC_ACCOUNTING_TEMPLATE_APPROVAL_REQUIRED", 409);
    if (input.accountingDate < template.startDate || (template.endDate && input.accountingDate > template.endDate)) {
      throw new EnterpriseAccountingError("PERIODIC_ACCOUNTING_DATE_OUTSIDE_TEMPLATE", 409);
    }
    assertCadenceEligible(template, input.accountingDate);

    const period = await getPostingPeriod(tx, organizationId, input.accountingDate);
    const occurrenceKey = template.cadence === "MANUAL"
      ? `${organizationId}:PERIODIC:${template.code}:${normalizedDateKey(input.accountingDate)}`
      : `${organizationId}:PERIODIC:${template.code}:${period.id}`;
    const existingExecution = await tx.enterprisePeriodicAccountingExecution.findUnique({
      where: { organizationId_occurrenceKey: { organizationId, occurrenceKey } },
    });
    if (existingExecution) {
      const [entry, reversal] = await Promise.all([
        existingExecution.journalEntryId ? tx.enterpriseJournalEntry.findFirst({ where: { id: existingExecution.journalEntryId, organizationId }, include: { lines: true } }) : null,
        existingExecution.reversalEntryId ? tx.enterpriseJournalEntry.findFirst({ where: { id: existingExecution.reversalEntryId, organizationId }, include: { lines: true } }) : null,
      ]);
      return { template, execution: existingExecution, entry, reversal, idempotent: true };
    }

    const [journal, configuration, accounts] = await Promise.all([
      tx.enterpriseJournal.findFirst({ where: { id: template.journalId, organizationId, isActive: true } }),
      tx.enterpriseFinanceConfiguration.findUnique({ where: { organizationId } }),
      tx.enterpriseLedgerAccount.findMany({
        where: { organizationId, id: { in: [...new Set(template.lines.map((line) => line.ledgerAccountId))] }, isActive: true, archivedAt: null },
        select: { id: true, allowDirectPosting: true },
      }),
    ]);
    if (!journal) throw new EnterpriseAccountingError("JOURNAL_NOT_FOUND", 404);
    if (!configuration) throw new EnterpriseAccountingError("FINANCE_CONFIGURATION_REQUIRED", 409);
    if (template.currencyCode !== configuration.functionalCurrencyCode) throw new EnterpriseAccountingError("PERIODIC_ACCOUNTING_FUNCTIONAL_CURRENCY_REQUIRED", 409);
    if (accounts.length !== new Set(template.lines.map((line) => line.ledgerAccountId)).size || accounts.some((account) => !account.allowDirectPosting)) {
      throw new EnterpriseAccountingError("JOURNAL_ACCOUNT_INVALID", 409);
    }
    await validateAccountingDimensions(tx, organizationId, template.lines);

    const amount = money(template.defaultAmount);
    const allocated = allocateTemplateLines(amount, template.lines);
    const execution = await tx.enterprisePeriodicAccountingExecution.create({
      data: {
        organizationId,
        templateId: template.id,
        templateVersion: template.version,
        occurrenceKey,
        fiscalPeriodId: period.id,
        accountingDate: input.accountingDate,
        amount,
        currencyCode: template.currencyCode,
        status: "PREPARING",
        requestedByUserId: actorUserId,
      },
    });
    const entry = await tx.enterpriseJournalEntry.create({
      data: {
        organizationId,
        number: financeReference(journal.sequencePrefix || journal.code || "JE"),
        journalId: journal.id,
        fiscalPeriodId: period.id,
        accountingDate: input.accountingDate,
        documentDate: input.accountingDate,
        reference: `${template.code}/v${template.version}`,
        description: template.nameFr,
        sourceModule: "FINANCE_ACCOUNTING",
        sourceEntityType: "EnterprisePeriodicAccountingExecution",
        sourceEntityId: execution.id,
        postingEvent: `PERIODIC_${template.operationType}`,
        postingVersion: template.version,
        idempotencyKey: occurrenceKey,
        status: "POSTED",
        totalDebit: amount,
        totalCredit: amount,
        functionalCurrencyCode: configuration.functionalCurrencyCode,
        preparedByUserId: actorUserId,
        approvedByUserId: template.approvedByUserId || actorUserId,
        postedByUserId: actorUserId,
        postedAt: new Date(),
        lines: {
          create: template.lines.map((line) => {
            const lineAmount = allocated.get(line.id) || new Prisma.Decimal(0);
            return {
              organizationId,
              ledgerAccountId: line.ledgerAccountId,
              businessPartyId: line.businessPartyId,
              projectId: line.projectId,
              departmentId: line.departmentId,
              siteId: line.siteId,
              assetId: line.assetId,
              inventoryItemId: line.inventoryItemId,
              description: line.description,
              debit: line.side === "DEBIT" ? lineAmount : new Prisma.Decimal(0),
              credit: line.side === "CREDIT" ? lineAmount : new Prisma.Decimal(0),
              transactionCurrencyCode: template.currencyCode,
              transactionAmount: lineAmount,
              exchangeRate: new Prisma.Decimal(1),
              functionalAmount: lineAmount,
              analyticReference: line.analyticReference,
            };
          }),
        },
      },
      include: { lines: true, journal: true, fiscalPeriod: true },
    });
    await publishFinanceEvent(tx, {
      organizationId,
      entityType: "EnterpriseJournalEntry",
      entityId: entry.id,
      eventType: "PERIODIC_ACCOUNTING_ENTRY_POSTED",
      summary: `Periodic accounting entry ${entry.number} posted`,
      actorUserId,
      toStatus: "POSTED",
      metadataJson: { templateId: template.id, templateCode: template.code, templateVersion: template.version, operationType: template.operationType, amount: amount.toFixed(), currency: template.currencyCode },
    });

    let reversal = null;
    if (template.autoReverse) {
      const nextPeriod = await tx.enterpriseFiscalPeriod.findFirst({
        where: {
          organizationId,
          status: "OPEN",
          startDate: { gt: period.endDate },
          fiscalYear: { status: "OPEN" },
        },
        orderBy: { startDate: "asc" },
      });
      if (!nextPeriod) throw new EnterpriseAccountingError("PERIODIC_ACCOUNTING_AUTO_REVERSAL_PERIOD_REQUIRED", 409);
      reversal = await reverseJournalEntryTx(
        tx,
        organizationId,
        entry.id,
        actorUserId,
        { reason: `Auto-reversal ${template.code} v${template.version}`, accountingDate: nextPeriod.startDate },
        { authorization: "APPROVED_PERIODIC_TEMPLATE" },
      );
    }

    const postedExecution = await tx.enterprisePeriodicAccountingExecution.update({
      where: { id: execution.id },
      data: { status: "POSTED", journalEntryId: entry.id, reversalEntryId: reversal?.id || null, executedAt: new Date() },
    });
    await publishFinanceEvent(tx, {
      organizationId,
      entityType: "EnterprisePeriodicAccountingExecution",
      entityId: postedExecution.id,
      eventType: "PERIODIC_ACCOUNTING_EXECUTED",
      summary: `Periodic accounting ${template.code} v${template.version} executed`,
      actorUserId,
      toStatus: "POSTED",
      metadataJson: { journalEntryId: entry.id, reversalEntryId: reversal?.id || null, occurrenceKey },
    });
    return { template, execution: postedExecution, entry, reversal, idempotent: false };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 30000 });
}

export async function listPeriodicAccountingTemplates(
  organizationId: string,
  input: { page: number; pageSize: number; status?: string; search?: string },
) {
  const where: Prisma.EnterprisePeriodicAccountingTemplateWhereInput = {
    organizationId,
    ...(input.status ? { status: input.status } : {}),
    ...(input.search ? { OR: [
      { code: { contains: input.search, mode: "insensitive" } },
      { nameFr: { contains: input.search, mode: "insensitive" } },
      { nameEn: { contains: input.search, mode: "insensitive" } },
    ] } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.enterprisePeriodicAccountingTemplate.findMany({
      where,
      orderBy: [{ code: "asc" }, { version: "desc" }],
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
      include: { lines: { orderBy: { position: "asc" } }, executions: { orderBy: { accountingDate: "desc" }, take: 10 } },
    }),
    prisma.enterprisePeriodicAccountingTemplate.count({ where }),
  ]);
  return { items, pagination: { page: input.page, pageSize: input.pageSize, total, pageCount: Math.max(1, Math.ceil(total / input.pageSize)) } };
}
