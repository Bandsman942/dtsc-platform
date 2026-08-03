import { Prisma, type EnterpriseCrossModuleProjection } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { crossModuleDefinitionsFor, type CrossModuleEventDefinition, type CrossModuleProjectorCode } from "@/lib/enterprise/cross-module/event-catalog";
import { buildEnterpriseObjectDeepLink } from "@/lib/enterprise/cross-module/deep-links";

export class EnterpriseCrossModuleProjectionError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly retryable = true,
    public readonly status = 409,
  ) {
    super(message);
    this.name = "EnterpriseCrossModuleProjectionError";
  }
}

type DomainEventRecord = Awaited<ReturnType<typeof prisma.enterpriseDomainEvent.findUniqueOrThrow>>;
type ProjectionTarget = { targetEntityType: string; targetEntityId: string; targetModule: string };
type ProjectionFailure = { code: string; message: string; retryable: boolean };
type ProjectionRunResult = { projection: EnterpriseCrossModuleProjection; skipped: boolean; targets: ProjectionTarget[]; error?: ProjectionFailure };

type LinkInput = {
  organizationId: string;
  sourceModule: string;
  sourceEntityType: string;
  sourceEntityId: string;
  targetModule: string;
  targetEntityType: string;
  targetEntityId: string;
  linkType: string;
  label?: string;
  createdById: string;
};

function eventPayload(event: DomainEventRecord) {
  if (!event.payloadJson || typeof event.payloadJson !== "object" || Array.isArray(event.payloadJson)) return {} as Record<string, unknown>;
  return event.payloadJson as Record<string, unknown>;
}

function eventMetadata(event: DomainEventRecord) {
  const payload = eventPayload(event);
  const metadata = payload.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return {} as Record<string, unknown>;
  return metadata as Record<string, unknown>;
}

function eventActorUserId(event: DomainEventRecord) {
  const actor = eventPayload(event).actorUserId;
  return typeof actor === "string" && actor ? actor : "SYSTEM";
}

function capitalizationSourceEntityType(value: string) {
  if (value === "PURCHASE") return "EnterprisePurchase";
  if (value === "SUPPLIER_INVOICE") return "EnterpriseSupplierInvoice";
  if (value === "ASSET") return "EnterpriseAsset";
  return value;
}

function metadataString(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === "string" && value ? value : null;
}

async function createLink(tx: Prisma.TransactionClient, input: LinkInput) {
  try {
    return await tx.enterpriseEntityLink.create({ data: input });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return tx.enterpriseEntityLink.findFirst({
        where: {
          organizationId: input.organizationId,
          sourceEntityType: input.sourceEntityType,
          sourceEntityId: input.sourceEntityId,
          targetEntityType: input.targetEntityType,
          targetEntityId: input.targetEntityId,
          linkType: input.linkType,
        },
      });
    }
    throw error;
  }
}

async function linkMany(tx: Prisma.TransactionClient, links: Array<LinkInput | null | undefined>) {
  const created: ProjectionTarget[] = [];
  for (const link of links) {
    if (!link) continue;
    await createLink(tx, link);
    created.push({ targetEntityType: link.targetEntityType, targetEntityId: link.targetEntityId, targetModule: link.targetModule });
  }
  return created;
}

function link(input: Omit<LinkInput, "organizationId" | "createdById">, event: DomainEventRecord): LinkInput {
  return { ...input, organizationId: event.organizationId, createdById: eventActorUserId(event) };
}

async function projectSalesInvoice(tx: Prisma.TransactionClient, event: DomainEventRecord) {
  const invoice = await tx.enterpriseSalesInvoice.findFirst({ where: { id: event.entityId, organizationId: event.organizationId } });
  if (!invoice) throw new EnterpriseCrossModuleProjectionError("SALES_INVOICE_NOT_FOUND", "La facture client source est introuvable.", false);
  const receivable = await tx.enterpriseReceivable.findFirst({ where: { organizationId: event.organizationId, salesInvoiceId: invoice.id } });
  if (!receivable) throw new EnterpriseCrossModuleProjectionError("SALES_INVOICE_RECEIVABLE_MISSING", "La facture émise ne possède pas sa créance commune.");
  return linkMany(tx, [
    link({ sourceModule: "CRM_CUSTOMERS", sourceEntityType: "EnterpriseBusinessParty", sourceEntityId: invoice.businessPartyId, targetModule: "FINANCE_RECEIVABLES", targetEntityType: "EnterpriseSalesInvoice", targetEntityId: invoice.id, linkType: "BILLING_PARTY" }, event),
    invoice.salesOrderId ? link({ sourceModule: "SALES_QUOTES_ORDERS", sourceEntityType: "EnterpriseSalesOrder", sourceEntityId: invoice.salesOrderId, targetModule: "FINANCE_RECEIVABLES", targetEntityType: "EnterpriseSalesInvoice", targetEntityId: invoice.id, linkType: "BILLED_BY" }, event) : null,
    invoice.fulfillmentId ? link({ sourceModule: "SALES_QUOTES_ORDERS", sourceEntityType: "EnterpriseFulfillment", sourceEntityId: invoice.fulfillmentId, targetModule: "FINANCE_RECEIVABLES", targetEntityType: "EnterpriseSalesInvoice", targetEntityId: invoice.id, linkType: "BILLED_BY" }, event) : null,
    invoice.contractId ? link({ sourceModule: "CONTRACTS", sourceEntityType: "EnterpriseContract", sourceEntityId: invoice.contractId, targetModule: "FINANCE_RECEIVABLES", targetEntityType: "EnterpriseSalesInvoice", targetEntityId: invoice.id, linkType: "BILLED_BY" }, event) : null,
    invoice.projectId ? link({ sourceModule: "PROJECTS_SERVICES", sourceEntityType: "EnterpriseProject", sourceEntityId: invoice.projectId, targetModule: "FINANCE_RECEIVABLES", targetEntityType: "EnterpriseSalesInvoice", targetEntityId: invoice.id, linkType: "BILLED_BY" }, event) : null,
    link({ sourceModule: "FINANCE_RECEIVABLES", sourceEntityType: "EnterpriseSalesInvoice", sourceEntityId: invoice.id, targetModule: "FINANCE_RECEIVABLES", targetEntityType: "EnterpriseReceivable", targetEntityId: receivable.id, linkType: "GENERATED_RECEIVABLE" }, event),
  ]);
}

async function projectSupplierInvoice(tx: Prisma.TransactionClient, event: DomainEventRecord) {
  const invoice = await tx.enterpriseSupplierInvoice.findFirst({ where: { id: event.entityId, organizationId: event.organizationId } });
  if (!invoice) throw new EnterpriseCrossModuleProjectionError("SUPPLIER_INVOICE_NOT_FOUND", "La facture fournisseur source est introuvable.", false);
  const payable = await tx.enterprisePayable.findFirst({ where: { organizationId: event.organizationId, supplierInvoiceId: invoice.id } });
  if (!payable) throw new EnterpriseCrossModuleProjectionError("SUPPLIER_INVOICE_PAYABLE_MISSING", "La facture comptabilisée ne possède pas sa dette commune.");
  return linkMany(tx, [
    invoice.businessPartyId ? link({ sourceModule: "CRM_CUSTOMERS", sourceEntityType: "EnterpriseBusinessParty", sourceEntityId: invoice.businessPartyId, targetModule: "FINANCE_PAYABLES", targetEntityType: "EnterpriseSupplierInvoice", targetEntityId: invoice.id, linkType: "BILLING_PARTY" }, event) : null,
    invoice.purchaseId ? link({ sourceModule: "SUPPLIERS_PURCHASES", sourceEntityType: "EnterprisePurchase", sourceEntityId: invoice.purchaseId, targetModule: "FINANCE_PAYABLES", targetEntityType: "EnterpriseSupplierInvoice", targetEntityId: invoice.id, linkType: "INVOICED_BY" }, event) : null,
    invoice.purchaseReceiptId ? link({ sourceModule: "SUPPLIERS_PURCHASES", sourceEntityType: "EnterprisePurchaseReceipt", sourceEntityId: invoice.purchaseReceiptId, targetModule: "FINANCE_PAYABLES", targetEntityType: "EnterpriseSupplierInvoice", targetEntityId: invoice.id, linkType: "INVOICED_BY" }, event) : null,
    invoice.projectId ? link({ sourceModule: "PROJECTS_SERVICES", sourceEntityType: "EnterpriseProject", sourceEntityId: invoice.projectId, targetModule: "FINANCE_PAYABLES", targetEntityType: "EnterpriseSupplierInvoice", targetEntityId: invoice.id, linkType: "INVOICED_BY" }, event) : null,
    invoice.assetId ? link({ sourceModule: "ASSETS_MAINTENANCE", sourceEntityType: "EnterpriseAsset", sourceEntityId: invoice.assetId, targetModule: "FINANCE_PAYABLES", targetEntityType: "EnterpriseSupplierInvoice", targetEntityId: invoice.id, linkType: "INVOICED_BY" }, event) : null,
    link({ sourceModule: "FINANCE_PAYABLES", sourceEntityType: "EnterpriseSupplierInvoice", sourceEntityId: invoice.id, targetModule: "FINANCE_PAYABLES", targetEntityType: "EnterprisePayable", targetEntityId: payable.id, linkType: "GENERATED_PAYABLE" }, event),
  ]);
}

async function projectPayment(tx: Prisma.TransactionClient, event: DomainEventRecord) {
  const payment = await tx.enterprisePayment.findFirst({ where: { id: event.entityId, organizationId: event.organizationId } });
  if (!payment) throw new EnterpriseCrossModuleProjectionError("PAYMENT_NOT_FOUND", "Le paiement commun est introuvable.", false);
  const allocations = await tx.enterprisePaymentAllocation.findMany({ where: { organizationId: event.organizationId, paymentId: payment.id, status: "CONFIRMED" } });
  const links: Array<LinkInput | null> = [
    payment.businessPartyId ? link({ sourceModule: "CRM_CUSTOMERS", sourceEntityType: "EnterpriseBusinessParty", sourceEntityId: payment.businessPartyId, targetModule: "FINANCE_PAYMENTS", targetEntityType: "EnterprisePayment", targetEntityId: payment.id, linkType: "PAYMENT_PARTY" }, event) : null,
    payment.financialAccountId ? link({ sourceModule: "FINANCE_TREASURY", sourceEntityType: "EnterpriseFinancialAccount", sourceEntityId: payment.financialAccountId, targetModule: "FINANCE_PAYMENTS", targetEntityType: "EnterprisePayment", targetEntityId: payment.id, linkType: "PAYMENT_ACCOUNT" }, event) : null,
    payment.employeeId ? link({ sourceModule: "HUMAN_RESOURCES", sourceEntityType: "EnterpriseEmployee", sourceEntityId: payment.employeeId, targetModule: "FINANCE_PAYMENTS", targetEntityType: "EnterprisePayment", targetEntityId: payment.id, linkType: "EMPLOYEE_PAYMENT" }, event) : null,
    payment.payrollRunId ? link({ sourceModule: "PAYROLL_OPERATIONS", sourceEntityType: "EnterprisePayrollRun", sourceEntityId: payment.payrollRunId, targetModule: "FINANCE_PAYMENTS", targetEntityType: "EnterprisePayment", targetEntityId: payment.id, linkType: "PAYROLL_PAYMENT" }, event) : null,
  ];
  for (const allocation of allocations) {
    links.push(link({ sourceModule: "FINANCE_PAYMENTS", sourceEntityType: "EnterprisePayment", sourceEntityId: payment.id, targetModule: allocation.receivableId ? "FINANCE_RECEIVABLES" : "FINANCE_PAYABLES", targetEntityType: allocation.receivableId ? "EnterpriseReceivable" : "EnterprisePayable", targetEntityId: allocation.receivableId || allocation.payableId!, linkType: "PAYMENT_ALLOCATION" }, event));
  }
  return linkMany(tx, links);
}

async function projectPayroll(tx: Prisma.TransactionClient, event: DomainEventRecord) {
  const run = await tx.enterprisePayrollRun.findFirst({ where: { id: event.entityId, organizationId: event.organizationId } });
  if (!run) throw new EnterpriseCrossModuleProjectionError("PAYROLL_RUN_NOT_FOUND", "La paie approuvée est introuvable.", false);
  if (run.status !== "APPROVED") throw new EnterpriseCrossModuleProjectionError("PAYROLL_RUN_NOT_APPROVED", "La paie n’est plus dans un état approuvé.", false);
  const items = await tx.enterprisePayrollItem.findMany({ where: { organizationId: event.organizationId, payrollRunId: run.id }, include: { payslip: true } });
  const links: Array<LinkInput | null> = [
    link({ sourceModule: "PAYROLL_OPERATIONS", sourceEntityType: "EnterprisePayrollPeriod", sourceEntityId: run.payrollPeriodId, targetModule: "PAYROLL_OPERATIONS", targetEntityType: "EnterprisePayrollRun", targetEntityId: run.id, linkType: "PAYROLL_PERIOD_RUN" }, event),
  ];
  for (const item of items) {
    links.push(link({ sourceModule: "HUMAN_RESOURCES", sourceEntityType: "EnterpriseEmployee", sourceEntityId: item.employeeId, targetModule: "PAYROLL_OPERATIONS", targetEntityType: "EnterprisePayrollRun", targetEntityId: run.id, linkType: "PAYROLL_EMPLOYEE" }, event));
    if (item.payslip) links.push(link({ sourceModule: "PAYROLL_OPERATIONS", sourceEntityType: "EnterprisePayrollRun", sourceEntityId: run.id, targetModule: "PAYROLL_OPERATIONS", targetEntityType: "EnterprisePayslip", targetEntityId: item.payslip.id, linkType: "GENERATED_PAYSLIP" }, event));
  }
  return linkMany(tx, links);
}

async function projectDeliverable(tx: Prisma.TransactionClient, event: DomainEventRecord) {
  const deliverable = await tx.enterpriseProjectDeliverable.findFirst({ where: { id: event.entityId, organizationId: event.organizationId } });
  if (!deliverable) throw new EnterpriseCrossModuleProjectionError("PROJECT_DELIVERABLE_NOT_FOUND", "Le livrable accepté est introuvable.", false);
  if (deliverable.status !== "ACCEPTED") throw new EnterpriseCrossModuleProjectionError("PROJECT_DELIVERABLE_NOT_ACCEPTED", "Le livrable n’est plus accepté.", false);
  const project = await tx.enterpriseProject.findFirst({ where: { id: deliverable.projectId, organizationId: event.organizationId, archivedAt: null } });
  if (!project) throw new EnterpriseCrossModuleProjectionError("PROJECT_NOT_FOUND", "Le projet du livrable est introuvable.", false);
  return linkMany(tx, [
    link({ sourceModule: "PROJECTS_SERVICES", sourceEntityType: "EnterpriseProject", sourceEntityId: project.id, targetModule: "TIME_DELIVERABLES", targetEntityType: "EnterpriseProjectDeliverable", targetEntityId: deliverable.id, linkType: "PROJECT_DELIVERABLE" }, event),
    project.businessPartyId ? link({ sourceModule: "CRM_CUSTOMERS", sourceEntityType: "EnterpriseBusinessParty", sourceEntityId: project.businessPartyId, targetModule: "TIME_DELIVERABLES", targetEntityType: "EnterpriseProjectDeliverable", targetEntityId: deliverable.id, linkType: "CLIENT_DELIVERABLE" }, event) : null,
    project.contractId ? link({ sourceModule: "CONTRACTS", sourceEntityType: "EnterpriseContract", sourceEntityId: project.contractId, targetModule: "TIME_DELIVERABLES", targetEntityType: "EnterpriseProjectDeliverable", targetEntityId: deliverable.id, linkType: "CONTRACT_DELIVERABLE" }, event) : null,
  ]);
}

async function projectAssetProfile(tx: Prisma.TransactionClient, event: DomainEventRecord) {
  const profile = await tx.enterpriseAssetAccountingProfile.findFirst({ where: { id: event.entityId, organizationId: event.organizationId } });
  if (!profile) throw new EnterpriseCrossModuleProjectionError("ASSET_ACCOUNTING_PROFILE_NOT_FOUND", "Le profil d’immobilisation est introuvable.", false);
  return linkMany(tx, [
    link({ sourceModule: "ASSETS_MAINTENANCE", sourceEntityType: "EnterpriseAsset", sourceEntityId: profile.assetId, targetModule: "FINANCE_ASSETS", targetEntityType: "EnterpriseAssetAccountingProfile", targetEntityId: profile.id, linkType: "ASSET_ACCOUNTING_PROFILE" }, event),
    profile.capitalizationSourceId ? link({ sourceModule: profile.capitalizationSourceType === "PURCHASE" ? "SUPPLIERS_PURCHASES" : "ASSETS_MAINTENANCE", sourceEntityType: capitalizationSourceEntityType(profile.capitalizationSourceType), sourceEntityId: profile.capitalizationSourceId, targetModule: "FINANCE_ASSETS", targetEntityType: "EnterpriseAssetAccountingProfile", targetEntityId: profile.id, linkType: "CAPITALIZATION_SOURCE" }, event) : null,
  ]);
}

async function projectInventory(tx: Prisma.TransactionClient, event: DomainEventRecord) {
  const metadata = eventMetadata(event);
  const movementId = metadataString(metadata, "movementId");
  if (!movementId) throw new EnterpriseCrossModuleProjectionError("STOCK_MOVEMENT_REFERENCE_MISSING", "L’événement de stock ne référence aucun mouvement.", false);
  const movement = await tx.enterpriseStockMovement.findFirst({ where: { id: movementId, organizationId: event.organizationId } });
  if (!movement) throw new EnterpriseCrossModuleProjectionError("STOCK_MOVEMENT_NOT_FOUND", "Le mouvement de stock référencé est introuvable.", false);
  return linkMany(tx, [
    link({ sourceModule: "CATALOG", sourceEntityType: "EnterpriseInventoryItem", sourceEntityId: movement.inventoryItemId, targetModule: "INVENTORY_LOGISTICS", targetEntityType: "EnterpriseStockMovement", targetEntityId: movement.id, linkType: "STOCK_ITEM_MOVEMENT" }, event),
    link({ sourceModule: "SITES_WAREHOUSES", sourceEntityType: "EnterpriseWarehouse", sourceEntityId: movement.warehouseId, targetModule: "INVENTORY_LOGISTICS", targetEntityType: "EnterpriseStockMovement", targetEntityId: movement.id, linkType: "STOCK_LOCATION_MOVEMENT" }, event),
    movement.sourceEntityType && movement.sourceEntityId ? link({ sourceModule: "INVENTORY_LOGISTICS", sourceEntityType: movement.sourceEntityType, sourceEntityId: movement.sourceEntityId, targetModule: "INVENTORY_LOGISTICS", targetEntityType: "EnterpriseStockMovement", targetEntityId: movement.id, linkType: "GENERATED_STOCK_MOVEMENT" }, event) : null,
  ]);
}

async function projectHealthInvoice(tx: Prisma.TransactionClient, event: DomainEventRecord) {
  const metadata = eventMetadata(event);
  const healthMedicalInvoiceId = metadataString(metadata, "healthMedicalInvoiceId");
  const extension = await tx.healthBillingExtension.findFirst({ where: { organizationId: event.organizationId, ...(healthMedicalInvoiceId ? { healthMedicalInvoiceId } : { salesInvoiceId: event.entityId }) } });
  if (!extension) throw new EnterpriseCrossModuleProjectionError("HEALTH_COMMON_INVOICE_MAPPING_MISSING", "La facturation Health n’est pas reliée à la facture commune.");
  return linkMany(tx, [
    link({ sourceModule: "MEDICAL_BILLING", sourceEntityType: "HealthMedicalInvoice", sourceEntityId: extension.healthMedicalInvoiceId, targetModule: "FINANCE_RECEIVABLES", targetEntityType: "EnterpriseSalesInvoice", targetEntityId: extension.salesInvoiceId, linkType: "SECTOR_CONVERGENCE" }, event),
  ]);
}

async function projectPharmacyInvoice(tx: Prisma.TransactionClient, event: DomainEventRecord) {
  const metadata = eventMetadata(event);
  const pharmacySaleId = metadataString(metadata, "pharmacySaleId");
  const extension = await tx.pharmacySalesExtension.findFirst({ where: { organizationId: event.organizationId, ...(pharmacySaleId ? { pharmacySaleId } : { salesInvoiceId: event.entityId }) } });
  if (!extension) throw new EnterpriseCrossModuleProjectionError("PHARMACY_COMMON_INVOICE_MAPPING_MISSING", "La vente Pharmacy n’est pas reliée à la facture commune.");
  return linkMany(tx, [
    link({ sourceModule: "PHARMACY_SALES", sourceEntityType: "PharmacySale", sourceEntityId: extension.pharmacySaleId, targetModule: "FINANCE_RECEIVABLES", targetEntityType: "EnterpriseSalesInvoice", targetEntityId: extension.salesInvoiceId, linkType: "SECTOR_CONVERGENCE" }, event),
  ]);
}

async function executeProjector(tx: Prisma.TransactionClient, event: DomainEventRecord, projectorCode: CrossModuleProjectorCode) {
  switch (projectorCode) {
    case "SALES_INVOICE_CONTINUITY": return projectSalesInvoice(tx, event);
    case "SUPPLIER_INVOICE_CONTINUITY": return projectSupplierInvoice(tx, event);
    case "PAYMENT_CONTINUITY": return projectPayment(tx, event);
    case "PAYROLL_CONTINUITY": return projectPayroll(tx, event);
    case "PROJECT_BILLING_CONTINUITY": return projectDeliverable(tx, event);
    case "ASSET_ACCOUNTING_CONTINUITY": return projectAssetProfile(tx, event);
    case "INVENTORY_CONTINUITY": return projectInventory(tx, event);
    case "HEALTH_FINANCE_CONTINUITY": return projectHealthInvoice(tx, event);
    case "PHARMACY_FINANCE_CONTINUITY": return projectPharmacyInvoice(tx, event);
  }
}

function failureDetails(error: unknown): ProjectionFailure {
  if (error instanceof EnterpriseCrossModuleProjectionError) return { code: error.code, message: error.message, retryable: error.retryable };
  if (error instanceof Prisma.PrismaClientKnownRequestError) return { code: `PRISMA_${error.code}`, message: "La projection inter-module a rencontré une erreur de données.", retryable: true };
  return { code: "CROSS_MODULE_PROJECTION_FAILED", message: error instanceof Error ? error.message.slice(0, 700) : "La projection inter-module a échoué.", retryable: true };
}

async function ensureProjection(event: DomainEventRecord, definition: CrossModuleEventDefinition) {
  return prisma.enterpriseCrossModuleProjection.upsert({
    where: { organizationId_domainEventId_consumerCode: { organizationId: event.organizationId, domainEventId: event.id, consumerCode: definition.consumerCode } },
    update: {},
    create: {
      organizationId: event.organizationId,
      domainEventId: event.id,
      eventType: event.eventType,
      sourceEntityType: event.entityType,
      sourceEntityId: event.entityId,
      consumerCode: definition.consumerCode,
      targetModule: definition.targetModule,
      metadataJson: { canonicalEventType: definition.canonicalEventType, sourceModule: definition.sourceModule, confidential: Boolean(definition.confidential) },
    },
  });
}

async function runProjection(projectionId: string, definition: CrossModuleEventDefinition): Promise<ProjectionRunResult> {
  const projection = await prisma.enterpriseCrossModuleProjection.findUniqueOrThrow({ where: { id: projectionId } });
  if (projection.status === "COMPLETED") return { projection, skipped: true, targets: [] as ProjectionTarget[] };
  const staleProcessingBefore = new Date(Date.now() - 5 * 60 * 1000);
  const claimed = await prisma.enterpriseCrossModuleProjection.updateMany({
    where: {
      id: projection.id,
      organizationId: projection.organizationId,
      OR: [
        { status: { in: ["PENDING", "FAILED"] }, availableAt: { lte: new Date() } },
        { status: "PROCESSING", startedAt: { lt: staleProcessingBefore } },
      ],
    },
    data: { status: "PROCESSING", startedAt: new Date(), failedAt: null, lastErrorCode: null, lastErrorMessage: null, attemptCount: { increment: 1 } },
  });
  if (claimed.count !== 1) return { projection: await prisma.enterpriseCrossModuleProjection.findUniqueOrThrow({ where: { id: projection.id } }), skipped: true, targets: [] as ProjectionTarget[] };
  const event = await prisma.enterpriseDomainEvent.findFirst({ where: { id: projection.domainEventId, organizationId: projection.organizationId } });
  if (!event) {
    const failure: ProjectionFailure = { code: "DOMAIN_EVENT_NOT_FOUND", message: "L’événement métier source est introuvable.", retryable: false };
    const failed: EnterpriseCrossModuleProjection = await prisma.enterpriseCrossModuleProjection.update({ where: { id: projection.id }, data: { status: "DEAD", failedAt: new Date(), lastErrorCode: failure.code, lastErrorMessage: failure.message } });
    return { projection: failed, skipped: false, targets: [] as ProjectionTarget[], error: failure };
  }
  try {
    const targets = await prisma.$transaction((tx) => executeProjector(tx, event, definition.projectorCode), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    const firstTarget = targets[0];
    const completed = await prisma.enterpriseCrossModuleProjection.update({
      where: { id: projection.id },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        failedAt: null,
        lastErrorCode: null,
        lastErrorMessage: null,
        targetEntityType: firstTarget?.targetEntityType || null,
        targetEntityId: firstTarget?.targetEntityId || null,
        metadataJson: {
          canonicalEventType: definition.canonicalEventType,
          sourceModule: definition.sourceModule,
          confidential: Boolean(definition.confidential),
          targetCount: targets.length,
          deepLink: firstTarget ? buildEnterpriseObjectDeepLink({ entityType: firstTarget.targetEntityType, entityId: firstTarget.targetEntityId, moduleCode: firstTarget.targetModule }) : null,
        },
      },
    });
    return { projection: completed, skipped: false, targets };
  } catch (error) {
    const failure = failureDetails(error);
    const current = await prisma.enterpriseCrossModuleProjection.findUniqueOrThrow({ where: { id: projection.id } });
    const dead = !failure.retryable || current.attemptCount >= 5;
    const failed: EnterpriseCrossModuleProjection = await prisma.enterpriseCrossModuleProjection.update({
      where: { id: projection.id },
      data: {
        status: dead ? "DEAD" : "FAILED",
        failedAt: new Date(),
        availableAt: new Date(Date.now() + Math.min(300, 15 * Math.max(1, current.attemptCount)) * 1000),
        lastErrorCode: failure.code,
        lastErrorMessage: failure.message.slice(0, 1000),
      },
    });
    return { projection: failed, skipped: false, targets: [] as ProjectionTarget[], error: failure };
  }
}

export async function processCrossModuleProjections(domainEventId: string) {
  const event = await prisma.enterpriseDomainEvent.findUnique({ where: { id: domainEventId } });
  if (!event) return { eventId: domainEventId, projections: [], failures: 0 };
  const definitions = crossModuleDefinitionsFor(event.eventType);
  const projections = [];
  for (const definition of definitions) {
    const projection = await ensureProjection(event, definition);
    projections.push(await runProjection(projection.id, definition));
  }
  return { eventId: event.id, projections, failures: projections.filter((result) => result.projection.status === "FAILED" || result.projection.status === "DEAD").length };
}

export async function processPendingCrossModuleProjections(limit = 25) {
  const safeLimit = Math.max(1, Math.min(limit, 100));
  const candidates = await prisma.enterpriseCrossModuleProjection.findMany({
    where: { status: { in: ["PENDING", "FAILED"] }, availableAt: { lte: new Date() } },
    orderBy: [{ availableAt: "asc" }, { createdAt: "asc" }],
    take: safeLimit,
  });
  const results = [];
  for (const projection of candidates) {
    const definition = crossModuleDefinitionsFor(projection.eventType).find((item) => item.consumerCode === projection.consumerCode);
    if (!definition) {
      const failed = await prisma.enterpriseCrossModuleProjection.update({
        where: { id: projection.id },
        data: { status: "DEAD", failedAt: new Date(), lastErrorCode: "PROJECTION_DEFINITION_NOT_FOUND", lastErrorMessage: "La définition de projection n’est plus disponible." },
      });
      results.push({ projection: failed, skipped: false, targets: [] as ProjectionTarget[], error: { code: "PROJECTION_DEFINITION_NOT_FOUND", message: "La définition de projection n’est plus disponible.", retryable: false } });
      continue;
    }
    results.push(await runProjection(projection.id, definition));
  }
  return { processed: results.length, failures: results.filter((result) => ["FAILED", "DEAD"].includes(result.projection.status)).length, results };
}

export async function retryCrossModuleProjection(organizationId: string, projectionId: string, actorUserId: string) {
  const projection = await prisma.enterpriseCrossModuleProjection.findFirst({ where: { id: projectionId, organizationId } });
  if (!projection) throw new EnterpriseCrossModuleProjectionError("PROJECTION_NOT_FOUND", "La projection demandée est introuvable.", false, 404);
  const definition = crossModuleDefinitionsFor(projection.eventType).find((item) => item.consumerCode === projection.consumerCode);
  if (!definition) throw new EnterpriseCrossModuleProjectionError("PROJECTION_DEFINITION_NOT_FOUND", "La définition de projection n’est plus disponible.", false);
  if (!["FAILED", "DEAD"].includes(projection.status)) throw new EnterpriseCrossModuleProjectionError("PROJECTION_NOT_RETRYABLE", "Seules les projections en échec peuvent être relancées.", false);
  await prisma.enterpriseCrossModuleProjection.update({
    where: { id: projection.id },
    data: { status: "PENDING", availableAt: new Date(), retryRequestedAt: new Date(), retryRequestedByUserId: actorUserId, lastErrorCode: null, lastErrorMessage: null },
  });
  return runProjection(projection.id, definition);
}

export async function listCrossModuleProjections(organizationId: string, input: { page: number; pageSize: number; status?: string; eventType?: string }) {
  const where: Prisma.EnterpriseCrossModuleProjectionWhereInput = {
    organizationId,
    ...(input.status ? { status: input.status } : {}),
    ...(input.eventType ? { eventType: input.eventType } : {}),
  };
  const [items, total, grouped] = await Promise.all([
    prisma.enterpriseCrossModuleProjection.findMany({ where, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], skip: (input.page - 1) * input.pageSize, take: input.pageSize }),
    prisma.enterpriseCrossModuleProjection.count({ where }),
    prisma.enterpriseCrossModuleProjection.groupBy({ by: ["status"], where: { organizationId }, _count: { _all: true } }),
  ]);
  return {
    items: items.map((item) => ({
      ...item,
      sourceDeepLink: buildEnterpriseObjectDeepLink({ entityType: item.sourceEntityType, entityId: item.sourceEntityId }),
      targetDeepLink: item.targetEntityType && item.targetEntityId ? buildEnterpriseObjectDeepLink({ entityType: item.targetEntityType, entityId: item.targetEntityId, moduleCode: item.targetModule }) : null,
    })),
    metrics: Object.fromEntries(grouped.map((entry) => [entry.status, entry._count._all])),
    pagination: { page: input.page, pageSize: input.pageSize, total, pageCount: Math.max(1, Math.ceil(total / input.pageSize)) },
  };
}
