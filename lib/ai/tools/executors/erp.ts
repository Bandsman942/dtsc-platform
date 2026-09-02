import type { AiToolExecutor, AiToolRuntimeContext } from "@/lib/ai/tools/types";
import {
  ERP_AI_READ_SPECS,
  ERP_AI_TOOL_INPUT_SCHEMAS,
  type ErpAiReadToolCode,
} from "@/lib/ai/tools/erp-contract";
import { serializeFinanceValue } from "@/lib/enterprise/accounting/helpers";
import { getEnterpriseCommonDomainAccess } from "@/lib/enterprise/common/access";
import {
  enterpriseDocumentVisibilityWhere,
  enterprisePurchaseVisibilityWhere,
  getEnterpriseProcurementAccess,
} from "@/lib/enterprise/procurement/access";
import {
  enterpriseReportVisibilityWhere,
  getEnterpriseFinanceAccess,
} from "@/lib/enterprise/finance/access";
import { prisma } from "@/lib/prisma";

type ErpReadArgs = { periodDays?: number; limit?: number };
type ErpReadResult = {
  toolName: ErpAiReadToolCode;
  label: string;
  status: "AVAILABLE" | "EMPTY";
  summary: string;
  asOf: string;
  data: Record<string, unknown>;
};

const MAX_QUERY_ROWS = 25;
const LABELS = Object.fromEntries(ERP_AI_READ_SPECS.map((spec) => [spec.code, spec.label])) as Record<ErpAiReadToolCode, string>;

function requireOrganization(context: AiToolRuntimeContext) {
  const organizationId = context.organizationId || context.session.activeOrganizationId || null;
  if (!organizationId || context.session.activeContext !== "ORGANIZATION" || context.session.activeOrganizationId !== organizationId) {
    throw new Error("ORGANIZATION_CONTEXT_REQUIRED");
  }
  return organizationId;
}

function windowFor(args: ErpReadArgs) {
  const periodDays = Math.min(366, Math.max(1, args.periodDays || 30));
  const limit = Math.min(MAX_QUERY_ROWS, Math.max(1, args.limit || 12));
  const end = new Date();
  return { periodDays, limit, end, start: new Date(end.getTime() - periodDays * 86_400_000) };
}

function dataRecord(value: unknown): Record<string, unknown> {
  const serialized = serializeFinanceValue(value);
  return serialized && typeof serialized === "object" && !Array.isArray(serialized)
    ? serialized as Record<string, unknown>
    : { value: serialized };
}

function output(toolName: ErpAiReadToolCode, count: number, summary: string, data: unknown): ErpReadResult {
  return {
    toolName,
    label: LABELS[toolName],
    status: count > 0 ? "AVAILABLE" : "EMPTY",
    summary,
    asOf: new Date().toISOString(),
    data: dataRecord(data),
  };
}

async function commonAccess(context: AiToolRuntimeContext, organizationId: string, moduleCode: string) {
  const access = await getEnterpriseCommonDomainAccess({ session: context.session, organizationId, moduleCode, action: "read" });
  if (!access) throw new Error(`${moduleCode}_ACCESS_DENIED`);
  return access;
}

async function tasks(context: AiToolRuntimeContext, organizationId: string, toolName: ErpAiReadToolCode, args: ErpReadArgs) {
  await commonAccess(context, organizationId, "TASKS_OPERATIONS");
  const { limit, start } = windowFor(args);
  const items = await prisma.enterpriseTask.findMany({
    where: { organizationId, archivedAt: null, createdAt: { gte: start } },
    orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
    take: limit,
    select: { taskType: true, title: true, description: true, status: true, priority: true, startAt: true, dueAt: true, completedAt: true, sourceModule: true, createdAt: true },
  });
  const open = await prisma.enterpriseTask.count({ where: { organizationId, archivedAt: null, status: { in: ["TODO", "IN_PROGRESS", "BLOCKED"] } } });
  return output(toolName, items.length, `${items.length} tâche(s) récente(s) lue(s); ${open} tâche(s) restent ouvertes.`, { open, items });
}

async function requests(context: AiToolRuntimeContext, organizationId: string, toolName: ErpAiReadToolCode, args: ErpReadArgs) {
  await commonAccess(context, organizationId, "INTERNAL_REQUESTS");
  const { limit, start } = windowFor(args);
  const items = await prisma.enterpriseRequest.findMany({
    where: { organizationId, archivedAt: null, createdAt: { gte: start } },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { requestType: true, title: true, description: true, priority: true, status: true, dueAt: true, sourceModule: true, createdAt: true, closedAt: true },
  });
  const open = await prisma.enterpriseRequest.count({ where: { organizationId, archivedAt: null, status: { in: ["SUBMITTED", "IN_REVIEW", "IN_PROGRESS", "PENDING", "BLOCKED"] } } });
  return output(toolName, items.length, `${items.length} demande(s) récente(s) lue(s); ${open} restent ouvertes.`, { open, items });
}

async function approvals(context: AiToolRuntimeContext, organizationId: string, toolName: ErpAiReadToolCode, args: ErpReadArgs) {
  const access = await commonAccess(context, organizationId, "VALIDATIONS");
  const { limit, start } = windowFor(args);
  const viewerScope = access.canManage ? {} : { OR: [{ approverUserId: context.userId }, { requestedByUserId: context.userId }] };
  const where = { organizationId, archivedAt: null, requestedAt: { gte: start }, ...viewerScope };
  const items = await prisma.enterpriseApproval.findMany({
    where,
    orderBy: { requestedAt: "desc" },
    take: limit,
    select: { targetEntityType: true, status: true, requestedAt: true, decidedAt: true, decisionComment: true, createdAt: true },
  });
  const pending = await prisma.enterpriseApproval.count({ where: { ...where, status: "PENDING" } });
  return output(toolName, items.length, `${items.length} validation(s) récente(s) lue(s); ${pending} restent en attente dans le périmètre autorisé.`, { pending, items });
}

async function meetings(context: AiToolRuntimeContext, organizationId: string, toolName: ErpAiReadToolCode, args: ErpReadArgs) {
  await commonAccess(context, organizationId, "MEETINGS");
  const { limit, start, end } = windowFor(args);
  const items = await prisma.enterpriseMeeting.findMany({
    where: { organizationId, archivedAt: null, startAt: { gte: start, lte: end } },
    orderBy: { startAt: "desc" },
    take: limit,
    select: {
      title: true,
      agenda: true,
      startAt: true,
      endAt: true,
      status: true,
      locationMode: true,
      physicalLocation: true,
      minutes: true,
      decisions: { orderBy: { decidedAt: "desc" }, take: 8, select: { title: true, description: true, decidedAt: true } },
    },
  });
  const upcoming = await prisma.enterpriseMeeting.count({ where: { organizationId, archivedAt: null, status: "SCHEDULED", startAt: { gte: new Date() } } });
  return output(toolName, items.length, `${items.length} réunion(s) dans la période; ${upcoming} réunion(s) sont planifiées à venir.`, { upcoming, items });
}

async function workflows(context: AiToolRuntimeContext, organizationId: string, toolName: ErpAiReadToolCode, args: ErpReadArgs) {
  await commonAccess(context, organizationId, "WORKFLOWS");
  const { limit, start } = windowFor(args);
  const [definitions, runs] = await Promise.all([
    prisma.enterpriseWorkflowDefinition.findMany({
      where: { organizationId, archivedAt: null },
      orderBy: { updatedAt: "desc" },
      take: limit,
      select: { code: true, name: true, description: true, status: true, triggerType: true, triggerEntityType: true, triggerEventType: true, allowManualStart: true, updatedAt: true },
    }),
    prisma.enterpriseWorkflowRun.findMany({
      where: { organizationId, startedAt: { gte: start } },
      orderBy: { startedAt: "desc" },
      take: limit,
      select: { status: true, triggerType: true, sourceEntityType: true, startedAt: true, completedAt: true, failedAt: true, failureCategory: true, failureCode: true },
    }),
  ]);
  const activeRuns = await prisma.enterpriseWorkflowRun.count({ where: { organizationId, status: { in: ["QUEUED", "RUNNING", "WAITING", "PAUSED"] } } });
  return output(toolName, definitions.length + runs.length, `${definitions.length} définition(s) et ${runs.length} exécution(s) récente(s) lues; ${activeRuns} exécution(s) sont actives.`, { activeRuns, definitions, runs });
}

async function procurement(context: AiToolRuntimeContext, organizationId: string, toolName: ErpAiReadToolCode, args: ErpReadArgs) {
  const access = await getEnterpriseProcurementAccess({ session: context.session, organizationId, moduleCode: "SUPPLIERS_PURCHASES", action: "read" });
  if (!access) throw new Error("SUPPLIERS_PURCHASES_ACCESS_DENIED");
  const { limit, start } = windowFor(args);
  const purchaseVisibility = enterprisePurchaseVisibilityWhere({ organizationId, userId: context.userId, canSeeAll: access.canSeeAll });
  const [purchases, suppliers, activeSuppliers] = await Promise.all([
    prisma.enterprisePurchase.findMany({
      where: { AND: [purchaseVisibility, { createdAt: { gte: start } }] },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        reference: true, title: true, status: true, priority: true, currency: true,
        subtotalAmount: true, taxAmount: true, totalAmount: true, expectedAt: true,
        orderedAt: true, receivedAt: true, closedAt: true, createdAt: true,
        supplier: { select: { legalName: true, displayName: true, status: true } },
        items: { orderBy: { sortOrder: "asc" }, take: 12, select: { description: true, quantity: true, unit: true, unitPrice: true, taxRate: true, lineSubtotal: true, taxAmount: true, lineTotal: true } },
      },
    }),
    prisma.enterpriseSupplier.findMany({
      where: { organizationId, archivedAt: null, status: { in: ["ACTIVE", "PROSPECT", "SUSPENDED"] } },
      orderBy: { updatedAt: "desc" },
      take: Math.min(limit, 12),
      select: { legalName: true, displayName: true, supplierType: true, category: true, status: true, city: true, country: true, updatedAt: true },
    }),
    prisma.enterpriseSupplier.count({ where: { organizationId, archivedAt: null, status: "ACTIVE" } }),
  ]);
  return output(toolName, purchases.length + suppliers.length, `${purchases.length} achat(s) récent(s) et ${suppliers.length} fournisseur(s) lus; ${activeSuppliers} fournisseur(s) sont actifs.`, { activeSuppliers, purchases, suppliers });
}

async function documents(context: AiToolRuntimeContext, organizationId: string, toolName: ErpAiReadToolCode, args: ErpReadArgs) {
  const access = await getEnterpriseProcurementAccess({ session: context.session, organizationId, moduleCode: "DOCUMENTS", action: "read" });
  if (!access) throw new Error("DOCUMENTS_ACCESS_DENIED");
  const { limit, start } = windowFor(args);
  const visibility = await enterpriseDocumentVisibilityWhere({ organizationId, userId: context.userId, canSeeAll: access.canSeeAll });
  const items = await prisma.enterpriseDocument.findMany({
    where: { AND: [visibility, { updatedAt: { gte: start } }] },
    orderBy: { updatedAt: "desc" },
    take: limit,
    select: { title: true, description: true, documentType: true, category: true, status: true, visibility: true, currentVersion: true, expiresAt: true, createdAt: true, updatedAt: true },
  });
  const expiring = await prisma.enterpriseDocument.count({ where: { AND: [visibility, { expiresAt: { gte: new Date(), lte: new Date(Date.now() + 30 * 86_400_000) } }] } });
  return output(toolName, items.length, `${items.length} document(s) récent(s) lu(s); ${expiring} expirent dans les 30 prochains jours.`, { expiring, items });
}

async function reports(context: AiToolRuntimeContext, organizationId: string, toolName: ErpAiReadToolCode, args: ErpReadArgs) {
  const access = await getEnterpriseFinanceAccess({ session: context.session, organizationId, moduleCode: "REPORTS", action: "read" });
  if (!access) throw new Error("REPORTS_ACCESS_DENIED");
  const { limit, start } = windowFor(args);
  const visibility = enterpriseReportVisibilityWhere({ organizationId, userId: context.userId, canSeeAll: access.canSeeAll });
  const items = await prisma.enterpriseReport.findMany({
    where: { AND: [visibility, { generatedAt: { gte: start } }] },
    orderBy: { generatedAt: "desc" },
    take: limit,
    select: { reference: true, title: true, description: true, reportType: true, status: true, periodStart: true, periodEnd: true, currency: true, unitCode: true, sourcePolicyCode: true, freshnessAt: true, generatedAt: true },
  });
  const published = await prisma.enterpriseReport.count({ where: { ...visibility, status: "PUBLISHED" } });
  return output(toolName, items.length, `${items.length} rapport(s) récent(s) lu(s); ${published} rapport(s) autorisé(s) sont publiés.`, { published, items });
}

async function customers(context: AiToolRuntimeContext, organizationId: string, toolName: ErpAiReadToolCode, args: ErpReadArgs) {
  await commonAccess(context, organizationId, "CRM_CUSTOMERS");
  const { limit } = windowFor(args);
  const items = await prisma.enterpriseBusinessParty.findMany({
    where: { organizationId, archivedAt: null },
    orderBy: { updatedAt: "desc" },
    take: limit,
    select: {
      code: true, partyType: true, legalName: true, displayName: true, status: true, createdAt: true, updatedAt: true,
      roles: { where: { archivedAt: null, status: "ACTIVE" }, select: { roleCode: true, status: true, validFrom: true, validUntil: true } },
    },
  });
  const [customersCount, prospectsCount, suppliersCount] = await Promise.all([
    prisma.enterpriseBusinessPartyRole.count({ where: { organizationId, archivedAt: null, status: "ACTIVE", roleCode: "CUSTOMER" } }),
    prisma.enterpriseBusinessPartyRole.count({ where: { organizationId, archivedAt: null, status: "ACTIVE", roleCode: "PROSPECT" } }),
    prisma.enterpriseBusinessPartyRole.count({ where: { organizationId, archivedAt: null, status: "ACTIVE", roleCode: "SUPPLIER" } }),
  ]);
  return output(toolName, items.length, `${items.length} tiers récent(s) lu(s).`, { metrics: { customers: customersCount, prospects: prospectsCount, suppliers: suppliersCount }, items });
}

async function catalog(context: AiToolRuntimeContext, organizationId: string, toolName: ErpAiReadToolCode, args: ErpReadArgs) {
  await commonAccess(context, organizationId, "CATALOG");
  const { limit } = windowFor(args);
  const items = await prisma.enterpriseCatalogItem.findMany({
    where: { organizationId, archivedAt: null },
    orderBy: { updatedAt: "desc" },
    take: limit,
    select: {
      code: true, sku: true, name: true, description: true, itemType: true, indicativeSalePrice: true, indicativeCost: true,
      currency: true, status: true, taxable: true, taxCode: true, trackInventory: true, updatedAt: true,
      category: { select: { code: true, name: true } },
      unitOfMeasure: { select: { code: true, name: true, symbol: true } },
      prices: { where: { archivedAt: null, status: "ACTIVE" }, orderBy: { effectiveFrom: "desc" }, take: 4, select: { priceType: true, amount: true, currency: true, taxRate: true, taxIncluded: true, effectiveFrom: true, effectiveUntil: true } },
    },
  });
  const [products, services, tracked] = await Promise.all([
    prisma.enterpriseCatalogItem.count({ where: { organizationId, archivedAt: null, itemType: "PRODUCT", status: "ACTIVE" } }),
    prisma.enterpriseCatalogItem.count({ where: { organizationId, archivedAt: null, itemType: "SERVICE", status: "ACTIVE" } }),
    prisma.enterpriseCatalogItem.count({ where: { organizationId, archivedAt: null, trackInventory: true, status: "ACTIVE" } }),
  ]);
  return output(toolName, items.length, `${items.length} article(s) de catalogue lu(s).`, { metrics: { products, services, tracked }, items });
}

async function sites(context: AiToolRuntimeContext, organizationId: string, toolName: ErpAiReadToolCode, args: ErpReadArgs) {
  await commonAccess(context, organizationId, "SITES_WAREHOUSES");
  const { limit } = windowFor(args);
  const items = await prisma.enterpriseSite.findMany({
    where: { organizationId, archivedAt: null },
    orderBy: { name: "asc" },
    take: limit,
    select: {
      code: true, name: true, siteType: true, city: true, stateProvince: true, countryCode: true, timezone: true, status: true,
      warehouses: { where: { archivedAt: null }, orderBy: { name: "asc" }, take: 10, select: { code: true, name: true, warehouseType: true, status: true } },
    },
  });
  const warehouses = await prisma.enterpriseWarehouse.count({ where: { organizationId, archivedAt: null, status: "ACTIVE" } });
  return output(toolName, items.length, `${items.length} site(s) lu(s); ${warehouses} entrepôt(s) sont actifs.`, { warehouses, items });
}

async function crmPipeline(context: AiToolRuntimeContext, organizationId: string, toolName: ErpAiReadToolCode, args: ErpReadArgs) {
  await commonAccess(context, organizationId, "CRM_PIPELINE");
  const { limit, start } = windowFor(args);
  const items = await prisma.enterpriseOpportunity.findMany({
    where: { organizationId, archivedAt: null, updatedAt: { gte: start } },
    orderBy: [{ expectedCloseDate: "asc" }, { updatedAt: "desc" }],
    take: limit,
    select: { reference: true, name: true, description: true, status: true, estimatedValue: true, currency: true, probabilityPercent: true, expectedCloseDate: true, source: true, nextAction: true, nextActionAt: true, wonAt: true, lostAt: true, lostReason: true, updatedAt: true },
  });
  const [open, won, lost] = await Promise.all([
    prisma.enterpriseOpportunity.count({ where: { organizationId, archivedAt: null, status: { in: ["OPEN", "QUALIFIED", "PROPOSAL", "NEGOTIATION"] } } }),
    prisma.enterpriseOpportunity.count({ where: { organizationId, archivedAt: null, status: "WON" } }),
    prisma.enterpriseOpportunity.count({ where: { organizationId, archivedAt: null, status: "LOST" } }),
  ]);
  return output(toolName, items.length, `${items.length} opportunité(s) récente(s) lue(s); ${open} sont ouvertes.`, { metrics: { open, won, lost }, items });
}

async function sales(context: AiToolRuntimeContext, organizationId: string, toolName: ErpAiReadToolCode, args: ErpReadArgs) {
  await commonAccess(context, organizationId, "SALES_QUOTES_ORDERS");
  const { limit, start } = windowFor(args);
  const perType = Math.max(1, Math.ceil(limit / 2));
  const [quotes, orders] = await Promise.all([
    prisma.enterpriseQuote.findMany({
      where: { organizationId, archivedAt: null, createdAt: { gte: start } }, orderBy: { createdAt: "desc" }, take: perType,
      select: { reference: true, title: true, status: true, currency: true, subtotalAmount: true, discountAmount: true, taxAmount: true, totalAmount: true, validUntil: true, sentAt: true, acceptedAt: true, rejectedAt: true, convertedAt: true, createdAt: true, items: { orderBy: { sortOrder: "asc" }, take: 10, select: { description: true, quantity: true, unitPrice: true, discountAmount: true, taxAmount: true, lineTotal: true } } },
    }),
    prisma.enterpriseSalesOrder.findMany({
      where: { organizationId, archivedAt: null, createdAt: { gte: start } }, orderBy: { createdAt: "desc" }, take: perType,
      select: { reference: true, title: true, status: true, currency: true, subtotalAmount: true, discountAmount: true, taxAmount: true, totalAmount: true, expectedFulfillmentAt: true, confirmedAt: true, fulfilledAt: true, closedAt: true, createdAt: true, items: { orderBy: { sortOrder: "asc" }, take: 10, select: { description: true, quantityOrdered: true, quantityFulfilled: true, unitPrice: true, discountAmount: true, taxAmount: true, lineTotal: true } } },
    }),
  ]);
  const pending = await prisma.enterpriseSalesOrder.count({ where: { organizationId, archivedAt: null, status: { in: ["DRAFT", "PENDING_APPROVAL", "CONFIRMED", "PARTIALLY_FULFILLED"] } } });
  return output(toolName, quotes.length + orders.length, `${quotes.length} devis et ${orders.length} commandes récents lus; ${pending} commande(s) restent ouvertes ou en traitement.`, { pending, quotes, orders });
}

async function contracts(context: AiToolRuntimeContext, organizationId: string, toolName: ErpAiReadToolCode, args: ErpReadArgs) {
  await commonAccess(context, organizationId, "CONTRACTS");
  const { limit } = windowFor(args);
  const items = await prisma.enterpriseContract.findMany({
    where: { organizationId, archivedAt: null },
    orderBy: [{ endDate: "asc" }, { updatedAt: "desc" }],
    take: limit,
    select: { reference: true, contractType: true, title: true, description: true, status: true, startDate: true, endDate: true, indicativeAmount: true, currency: true, renewalMode: true, renewalNoticeDays: true, approvedAt: true, activatedAt: true, suspendedAt: true, terminatedAt: true, terminationReason: true, updatedAt: true },
  });
  const [active, expiring] = await Promise.all([
    prisma.enterpriseContract.count({ where: { organizationId, archivedAt: null, status: "ACTIVE" } }),
    prisma.enterpriseContract.count({ where: { organizationId, archivedAt: null, status: "ACTIVE", endDate: { gte: new Date(), lte: new Date(Date.now() + 30 * 86_400_000) } } }),
  ]);
  return output(toolName, items.length, `${items.length} contrat(s) lu(s); ${active} sont actifs et ${expiring} expirent sous 30 jours.`, { metrics: { active, expiring }, items });
}

async function inventory(context: AiToolRuntimeContext, organizationId: string, toolName: ErpAiReadToolCode, args: ErpReadArgs) {
  await commonAccess(context, organizationId, "INVENTORY_LOGISTICS");
  const { limit, start } = windowFor(args);
  const items = await prisma.enterpriseInventoryItem.findMany({
    where: { organizationId, archivedAt: null, status: "ACTIVE" },
    orderBy: { updatedAt: "desc" },
    take: limit,
    select: {
      minimumQuantity: true, reorderQuantity: true, status: true, updatedAt: true,
      catalogItem: { select: { code: true, sku: true, name: true, itemType: true, indicativeSalePrice: true, indicativeCost: true, currency: true, unitOfMeasure: { select: { code: true, symbol: true } } } },
      balances: { select: { quantityOnHand: true, quantityReserved: true, warehouse: { select: { code: true, name: true } }, storageLocation: { select: { code: true, name: true } }, stockLot: { select: { lotNumber: true, expiryDate: true } } } },
    },
  });
  const normalized = items.map((item) => {
    const onHand = item.balances.reduce((sum, balance) => sum + Number(balance.quantityOnHand), 0);
    const reserved = item.balances.reduce((sum, balance) => sum + Number(balance.quantityReserved), 0);
    return { ...item, quantityOnHand: onHand, quantityReserved: reserved, quantityAvailable: onHand - reserved, isLowStock: item.minimumQuantity !== null && onHand <= Number(item.minimumQuantity) };
  });
  const movements = await prisma.enterpriseStockMovement.findMany({
    where: { organizationId, occurredAt: { gte: start } }, orderBy: { occurredAt: "desc" }, take: limit,
    select: { movementType: true, quantity: true, occurredAt: true, reference: true, notes: true, inventoryItem: { select: { catalogItem: { select: { code: true, name: true } } } }, warehouse: { select: { code: true, name: true } } },
  });
  return output(toolName, normalized.length + movements.length, `${normalized.length} article(s) de stock et ${movements.length} mouvement(s) récent(s) lus.`, { lowStockCount: normalized.filter((item) => item.isLowStock).length, items: normalized, movements });
}

async function hr(context: AiToolRuntimeContext, organizationId: string, toolName: ErpAiReadToolCode, args: ErpReadArgs) {
  await commonAccess(context, organizationId, "HUMAN_RESOURCES");
  const { limit } = windowFor(args);
  const items = await prisma.enterpriseEmployee.findMany({
    where: { organizationId, archivedAt: null }, orderBy: [{ employmentStatus: "asc" }, { displayName: "asc" }], take: limit,
    select: { employeeNumber: true, displayName: true, positionCode: true, departmentId: true, siteId: true, hireDate: true, terminationDate: true, employmentStatus: true, employmentType: true, baseCompensation: true, compensationCurrency: true, contracts: { where: { archivedAt: null, status: "ACTIVE" }, orderBy: { versionNumber: "desc" }, take: 1, select: { reference: true, contractType: true, status: true, startDate: true, endDate: true, jobTitle: true, baseCompensation: true, compensationCurrency: true, payFrequency: true, standardHoursPerWeek: true } } },
  });
  const [active, withoutContract] = await Promise.all([
    prisma.enterpriseEmployee.count({ where: { organizationId, archivedAt: null, employmentStatus: "ACTIVE" } }),
    prisma.enterpriseEmployee.count({ where: { organizationId, archivedAt: null, employmentStatus: "ACTIVE", contracts: { none: { status: "ACTIVE", archivedAt: null } } } }),
  ]);
  return output(toolName, items.length, `${items.length} dossier(s) professionnel(s) RH lu(s); ${active} employés sont actifs.`, { metrics: { active, withoutContract }, items });
}

async function timeAttendance(context: AiToolRuntimeContext, organizationId: string, toolName: ErpAiReadToolCode, args: ErpReadArgs) {
  await commonAccess(context, organizationId, "TIME_ATTENDANCE");
  const { limit, start, end } = windowFor(args);
  const [attendance, leaves, timesheets] = await Promise.all([
    prisma.enterpriseAttendance.findMany({ where: { organizationId, attendanceDate: { gte: start, lte: end } }, orderBy: { attendanceDate: "desc" }, take: limit, select: { attendanceDate: true, observedStartAt: true, observedEndAt: true, status: true, source: true, employee: { select: { employeeNumber: true, displayName: true } } } }),
    prisma.enterpriseLeaveRequest.findMany({ where: { organizationId, archivedAt: null, startDate: { lte: end }, endDate: { gte: start } }, orderBy: { startDate: "desc" }, take: limit, select: { reference: true, leaveType: true, startDate: true, endDate: true, partialDay: true, status: true, submittedAt: true, decidedAt: true, employee: { select: { employeeNumber: true, displayName: true } } } }),
    prisma.enterpriseTimesheet.findMany({ where: { organizationId, archivedAt: null, periodEnd: { gte: start }, periodStart: { lte: end } }, orderBy: { periodEnd: "desc" }, take: limit, select: { reference: true, periodStart: true, periodEnd: true, status: true, totalDeclaredMinutes: true, totalApprovedMinutes: true, submittedAt: true, approvedAt: true, employee: { select: { employeeNumber: true, displayName: true } } } }),
  ]);
  return output(toolName, attendance.length + leaves.length + timesheets.length, `${attendance.length} présence(s), ${leaves.length} congé(s) et ${timesheets.length} feuille(s) de temps lus.`, { attendance, leaves, timesheets });
}

async function payroll(context: AiToolRuntimeContext, organizationId: string, toolName: ErpAiReadToolCode, args: ErpReadArgs) {
  await commonAccess(context, organizationId, "PAYROLL_OPERATIONS");
  const { limit, start } = windowFor(args);
  const runs = await prisma.enterprisePayrollRun.findMany({
    where: { organizationId, archivedAt: null, createdAt: { gte: start } }, orderBy: { createdAt: "desc" }, take: limit,
    select: {
      reference: true, status: true, currency: true, employeeCount: true, grossAmount: true, bonusAmount: true, deductionAmount: true, netAmount: true,
      preparedAt: true, submittedAt: true, approvedAt: true, rejectedAt: true, rejectionReason: true, createdAt: true,
      payrollPeriod: { select: { code: true, name: true, periodStart: true, periodEnd: true, payDate: true, status: true } },
      items: { take: 12, orderBy: { netAmount: "desc" }, select: { baseGrossAmount: true, approvedTimeMinutes: true, bonusAmount: true, deductionAmount: true, grossAmount: true, netAmount: true, status: true, employee: { select: { employeeNumber: true, displayName: true } } } },
    },
  });
  const pendingApproval = await prisma.enterprisePayrollRun.count({ where: { organizationId, archivedAt: null, status: "PENDING_APPROVAL" } });
  return output(toolName, runs.length, `${runs.length} run(s) de paie récent(s) lu(s); ${pendingApproval} restent en attente d’approbation.`, { pendingApproval, runs });
}

async function projects(context: AiToolRuntimeContext, organizationId: string, toolName: ErpAiReadToolCode, args: ErpReadArgs) {
  await commonAccess(context, organizationId, "PROJECTS_SERVICES");
  const { limit } = windowFor(args);
  const items = await prisma.enterpriseProject.findMany({
    where: { organizationId, archivedAt: null }, orderBy: [{ status: "asc" }, { targetEndDate: "asc" }, { updatedAt: "desc" }], take: limit,
    select: { reference: true, name: true, description: true, projectType: true, status: true, currency: true, indicativeBudget: true, startDate: true, targetEndDate: true, completedAt: true, progressPercent: true, updatedAt: true, _count: { select: { members: true, milestones: true, deliverables: true, risks: true, issues: true } } },
  });
  const [active, overdue, risks] = await Promise.all([
    prisma.enterpriseProject.count({ where: { organizationId, archivedAt: null, status: { in: ["ACTIVE", "IN_PROGRESS"] } } }),
    prisma.enterpriseProject.count({ where: { organizationId, archivedAt: null, targetEndDate: { lt: new Date() }, status: { notIn: ["COMPLETED", "CLOSED", "CANCELLED"] } } }),
    prisma.enterpriseProjectRisk.findMany({ where: { organizationId, status: "OPEN", severity: { in: ["HIGH", "CRITICAL"] } }, orderBy: { updatedAt: "desc" }, take: Math.min(limit, 12), select: { reference: true, title: true, category: true, probability: true, impact: true, severity: true, status: true, mitigationPlan: true, dueDate: true } }),
  ]);
  return output(toolName, items.length + risks.length, `${items.length} projet(s) lu(s); ${active} sont actifs, ${overdue} en retard et ${risks.length} risque(s) élevé(s) ouverts sont remontés.`, { metrics: { active, overdue, highRisks: risks.length }, items, risks });
}

async function deliverables(context: AiToolRuntimeContext, organizationId: string, toolName: ErpAiReadToolCode, args: ErpReadArgs) {
  await commonAccess(context, organizationId, "TIME_DELIVERABLES");
  const { limit, start, end } = windowFor(args);
  const [items, timesheets] = await Promise.all([
    prisma.enterpriseProjectDeliverable.findMany({
      where: { organizationId, dueDate: { gte: start, lte: end } }, orderBy: { dueDate: "asc" }, take: limit,
      select: { reference: true, name: true, description: true, status: true, dueDate: true, submittedAt: true, acceptedAt: true, changesRequestedAt: true, rejectedAt: true, reviewComment: true, project: { select: { reference: true, name: true, status: true } }, milestone: { select: { reference: true, name: true, status: true, dueDate: true } } },
    }),
    prisma.enterpriseTimesheet.findMany({ where: { organizationId, archivedAt: null, periodEnd: { gte: start }, periodStart: { lte: end } }, orderBy: { periodEnd: "desc" }, take: Math.min(limit, 12), select: { reference: true, periodStart: true, periodEnd: true, status: true, totalDeclaredMinutes: true, totalApprovedMinutes: true, employee: { select: { employeeNumber: true, displayName: true } } } }),
  ]);
  return output(toolName, items.length + timesheets.length, `${items.length} livrable(s) et ${timesheets.length} feuille(s) de temps associables à la période ont été lus.`, { items, timesheets });
}

async function assets(context: AiToolRuntimeContext, organizationId: string, toolName: ErpAiReadToolCode, args: ErpReadArgs) {
  await commonAccess(context, organizationId, "ASSETS_MAINTENANCE");
  const { limit, start } = windowFor(args);
  const [items, maintenance, incidents] = await Promise.all([
    prisma.enterpriseAsset.findMany({ where: { organizationId, archivedAt: null }, orderBy: { updatedAt: "desc" }, take: limit, select: { code: true, name: true, description: true, serialNumber: true, acquisitionDate: true, indicativeValue: true, currency: true, status: true, condition: true, warrantyEndsAt: true, updatedAt: true, category: { select: { code: true, name: true } }, site: { select: { code: true, name: true } }, storageLocation: { select: { code: true, name: true } } } }),
    prisma.enterpriseAssetMaintenance.findMany({ where: { organizationId, archivedAt: null, createdAt: { gte: start } }, orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }], take: limit, select: { reference: true, maintenanceType: true, title: true, status: true, priority: true, plannedAt: true, dueAt: true, startedAt: true, completedAt: true, indicativeCost: true, currency: true, notes: true } }),
    prisma.enterpriseAssetIncident.findMany({ where: { organizationId, archivedAt: null, status: { in: ["OPEN", "IN_PROGRESS"] } }, orderBy: { reportedAt: "desc" }, take: Math.min(limit, 12), select: { reference: true, incidentType: true, title: true, description: true, severity: true, status: true, occurredAt: true, reportedAt: true, resolvedAt: true, resolution: true } }),
  ]);
  return output(toolName, items.length + maintenance.length + incidents.length, `${items.length} actif(s), ${maintenance.length} maintenance(s) récente(s) et ${incidents.length} incident(s) ouvert(s) lus.`, { items, maintenance, incidents });
}

async function retailPos(context: AiToolRuntimeContext, organizationId: string, toolName: ErpAiReadToolCode, args: ErpReadArgs) {
  await commonAccess(context, organizationId, "RETAIL_POS");
  const { limit, start, end } = windowFor(args);
  const items = await prisma.enterpriseRetailSale.findMany({
    where: { organizationId, soldAt: { gte: start, lte: end } }, orderBy: { soldAt: "desc" }, take: limit,
    select: { number: true, status: true, currencyCode: true, subtotal: true, discountTotal: true, taxTotal: true, grandTotal: true, soldAt: true, reversalReason: true, reversedAt: true, lines: { take: 12, select: { description: true, quantity: true, unitPrice: true, discountAmount: true, taxAmount: true, lineTotal: true } }, tenders: { take: 8, select: { methodType: true, currencyCode: true, amount: true, reference: true, status: true, createdAt: true } } },
  });
  const byCurrency = await prisma.enterpriseRetailSale.groupBy({ where: { organizationId, soldAt: { gte: start, lte: end }, status: "COMPLETED" }, by: ["currencyCode"], _sum: { grandTotal: true }, _count: { _all: true } });
  return output(toolName, items.length, `${items.length} vente(s) récente(s) lue(s), avec détail des montants et règlements autorisés.`, { totalsByCurrency: byCurrency, items });
}

async function mobileMoney(context: AiToolRuntimeContext, organizationId: string, toolName: ErpAiReadToolCode, args: ErpReadArgs) {
  await commonAccess(context, organizationId, "MOBILE_MONEY_AGENCY");
  const { limit, start, end } = windowFor(args);
  const items = await prisma.enterpriseMobileMoneyTransaction.findMany({
    where: { organizationId, occurredAt: { gte: start, lte: end } }, orderBy: { occurredAt: "desc" }, take: limit,
    select: { number: true, providerCode: true, transactionType: true, currencyCode: true, principalAmount: true, customerFeeAmount: true, providerCommissionAmount: true, feeCollectionMode: true, cashEffectAmount: true, floatEffectAmount: true, externalReference: true, status: true, occurredAt: true, reversalReason: true, reversedAt: true },
  });
  const byCurrency = await prisma.enterpriseMobileMoneyTransaction.groupBy({ where: { organizationId, occurredAt: { gte: start, lte: end } }, by: ["currencyCode"], _sum: { principalAmount: true, customerFeeAmount: true, providerCommissionAmount: true, cashEffectAmount: true, floatEffectAmount: true }, _count: { _all: true } });
  return output(toolName, items.length, `${items.length} transaction(s) Mobile Money récente(s) lue(s), avec leurs montants, frais, commissions et effets caisse/float.`, { totalsByCurrency: byCurrency, items });
}

async function telco(context: AiToolRuntimeContext, organizationId: string, toolName: ErpAiReadToolCode, args: ErpReadArgs) {
  await commonAccess(context, organizationId, "TELCO_TOPUPS");
  const { limit, start, end } = windowFor(args);
  const items = await prisma.enterpriseTelcoTopup.findMany({
    where: { organizationId, occurredAt: { gte: start, lte: end } }, orderBy: { occurredAt: "desc" }, take: limit,
    select: { number: true, providerCode: true, offerLabel: true, currencyCode: true, saleAmount: true, operatorCost: true, marginAmount: true, externalReference: true, status: true, occurredAt: true, failureReason: true, reversalReason: true, reversedAt: true },
  });
  const byCurrency = await prisma.enterpriseTelcoTopup.groupBy({ where: { organizationId, occurredAt: { gte: start, lte: end } }, by: ["currencyCode"], _sum: { saleAmount: true, operatorCost: true, marginAmount: true }, _count: { _all: true } });
  return output(toolName, items.length, `${items.length} transaction(s) Télécom récente(s) lue(s), avec ventes, coûts et marges.`, { totalsByCurrency: byCurrency, items });
}

async function retailClose(context: AiToolRuntimeContext, organizationId: string, toolName: ErpAiReadToolCode, args: ErpReadArgs) {
  await commonAccess(context, organizationId, "RETAIL_DAILY_CLOSE");
  const { limit, start, end } = windowFor(args);
  const items = await prisma.enterpriseRetailDailyClose.findMany({
    where: { organizationId, businessDate: { gte: start, lte: end } }, orderBy: { businessDate: "desc" }, take: limit,
    select: { number: true, businessDate: true, status: true, submittedAt: true, validatedAt: true, rejectedAt: true, rejectionReason: true, notes: true, lines: { select: { accountType: true, currencyCode: true, systemClosingBalance: true, declaredBalance: true, differenceAmount: true, varianceReason: true } } },
  });
  return output(toolName, items.length, `${items.length} clôture(s) magasin récente(s) lue(s), avec soldes système, déclarés et écarts.`, { items });
}

async function runTool(toolName: ErpAiReadToolCode, context: AiToolRuntimeContext, args: ErpReadArgs) {
  const organizationId = requireOrganization(context);
  switch (toolName) {
    case "ERP_TASKS_READ": return tasks(context, organizationId, toolName, args);
    case "ERP_REQUESTS_READ": return requests(context, organizationId, toolName, args);
    case "ERP_APPROVALS_READ": return approvals(context, organizationId, toolName, args);
    case "ERP_MEETINGS_READ": return meetings(context, organizationId, toolName, args);
    case "ERP_WORKFLOWS_READ": return workflows(context, organizationId, toolName, args);
    case "ERP_PROCUREMENT_READ": return procurement(context, organizationId, toolName, args);
    case "ERP_DOCUMENTS_READ": return documents(context, organizationId, toolName, args);
    case "ERP_REPORTS_READ": return reports(context, organizationId, toolName, args);
    case "ERP_CUSTOMERS_READ": return customers(context, organizationId, toolName, args);
    case "ERP_CATALOG_READ": return catalog(context, organizationId, toolName, args);
    case "ERP_SITES_READ": return sites(context, organizationId, toolName, args);
    case "ERP_CRM_PIPELINE_READ": return crmPipeline(context, organizationId, toolName, args);
    case "ERP_SALES_READ": return sales(context, organizationId, toolName, args);
    case "ERP_CONTRACTS_READ": return contracts(context, organizationId, toolName, args);
    case "ERP_INVENTORY_READ": return inventory(context, organizationId, toolName, args);
    case "ERP_HR_READ": return hr(context, organizationId, toolName, args);
    case "ERP_TIME_ATTENDANCE_READ": return timeAttendance(context, organizationId, toolName, args);
    case "ERP_PAYROLL_READ": return payroll(context, organizationId, toolName, args);
    case "ERP_PROJECTS_READ": return projects(context, organizationId, toolName, args);
    case "ERP_DELIVERABLES_READ": return deliverables(context, organizationId, toolName, args);
    case "ERP_ASSETS_READ": return assets(context, organizationId, toolName, args);
    case "ERP_RETAIL_POS_READ": return retailPos(context, organizationId, toolName, args);
    case "ERP_MOBILE_MONEY_READ": return mobileMoney(context, organizationId, toolName, args);
    case "ERP_TELCO_READ": return telco(context, organizationId, toolName, args);
    case "ERP_RETAIL_CLOSE_READ": return retailClose(context, organizationId, toolName, args);
  }
}

function executor(toolName: ErpAiReadToolCode): AiToolExecutor {
  return async ({ args, context }) => {
    const parsed = ERP_AI_TOOL_INPUT_SCHEMAS[toolName].parse(args || {});
    return runTool(toolName, context, parsed);
  };
}

export const ERP_AI_TOOL_EXECUTORS = Object.fromEntries(
  ERP_AI_READ_SPECS.map((spec) => [spec.code, executor(spec.code)]),
) as Record<ErpAiReadToolCode, AiToolExecutor>;
