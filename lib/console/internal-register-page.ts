import { prisma } from "@/lib/prisma";
import { toJsonSafe } from "@/lib/console/console-utils";
import {
  buildCeoDatasets,
  buildCooDatasets,
  buildCtoDatasets,
  buildHrcfoDatasets,
  buildLaDatasets,
  buildMpoDatasets,
  buildScoDatasets,
} from "@/lib/admin-operations";
import type { OperationRecord } from "@/lib/admin-operations-types";

export type InternalRegisterSection = "hr-cfo" | "sco" | "coo" | "ceo" | "mpo" | "cto" | "legal";

type Reader = {
  findMany: (args: unknown) => Promise<unknown[]>;
  count: (args: unknown) => Promise<number>;
  groupBy: (args: unknown) => Promise<Array<{ status: string; _count: { _all: number } }>>;
};

type RegisterSpec = {
  source: { findMany: unknown; count: unknown };
  search: readonly string[];
  amountFields?: readonly string[];
  include?: Record<string, unknown>;
};

// Explicit, read-only allowlist. Never resolve a Prisma model from request input.
const registers = {
  "hr-cfo": {
    departments: { source: prisma.department, search: ["name", "description"] },
    accounts: { source: prisma.financialAccount, search: ["name", "accountType", "currency", "description"], amountFields: ["openingBalance", "currentBalance"] },
    positions: { source: prisma.dtscPosition, search: ["title", "code", "departmentName", "description"] },
    employees: { source: prisma.hrcfoEmployee, search: ["fullName", "email", "department", "jobTitle", "notes"] },
    budgets: { source: prisma.hrcfoBudget, search: ["name", "ownerDepartment", "notes"], amountFields: ["amount", "spentAmount"] },
    transactions: { source: prisma.hrcfoExpense, search: ["title", "requesterName", "category", "project", "sourceId", "paymentMethod", "notes"], amountFields: ["amount"], include: { account: true, department: true, budget: true, invoice: true } },
    payrolls: { source: prisma.hrcfoPayroll, search: ["notes", "paymentReference"], amountFields: ["grossAmount", "netAmount"], include: { employee: true, account: true, budget: true } },
  },
  sco: {
    materialItems: { source: prisma.materialItem, search: ["name", "sku", "category", "location", "description"] },
    vendors: { source: prisma.scoVendor, search: ["name", "contactName", "email", "productsServices"] },
    purchaseRequests: { source: prisma.scoPurchaseRequest, search: ["title", "requesterName", "requestedItemName", "selectedVendorName", "notes"] },
    inventory: { source: prisma.scoInventoryItem, search: ["name", "sku", "category", "location", "notes"] },
    assets: { source: prisma.scoAsset, search: ["name", "tag", "serialNumber", "assignedTo", "notes"] },
    logistics: { source: prisma.scoLogisticsEvent, search: ["title", "location", "requesterName", "notes"] },
  },
  coo: {
    operations: { source: prisma.cooOperation, search: ["title", "description", "pilotDepartmentName", "leadEmployeeName"] },
    tasks: { source: prisma.cooTask, search: ["title", "description", "departmentName", "assigneeName", "responsibleName"] },
    recurringTasks: { source: prisma.cooRecurringTask, search: ["title", "departmentName", "responsibleName", "taskTemplate"] },
    departmentRequests: { source: prisma.cooDepartmentRequest, search: ["subject", "description", "requesterName", "targetResponsibleName"] },
    blockers: { source: prisma.cooBlocker, search: ["title", "description", "departmentName", "responsibleName"] },
    meetings: { source: prisma.cooMeeting, search: ["title", "agenda", "departmentName", "reportOwnerName"] },
    workflows: { source: prisma.cooWorkflow, search: ["name", "description", "departmentName"], include: { _count: { select: { shares: true } } } },
    reports: { source: prisma.cooOperationalReport, search: ["title", "content", "departmentName", "employeeName"] },
  },
  ceo: {
    objectives: { source: prisma.ceoObjective, search: ["title", "description", "departmentName", "responsibleName"] },
    supervisionLogs: { source: prisma.ceoSupervisionLog, search: ["title", "description", "departmentName", "employeeName"] },
  },
  mpo: {
    projects: { source: prisma.mpoProject, search: ["title", "requester", "needDescription", "businessObjective", "comments"] },
    records: { source: prisma.mpoProjectRecord, search: ["title", "description", "content", "notes"], include: { project: { select: { title: true } } } },
  },
  cto: {
    projects: { source: prisma.ctoTechnicalProject, search: ["title", "functionalSummary", "technicalObjective", "comments"], include: { mpoProject: { select: { title: true } } } },
    records: { source: prisma.ctoTechnicalRecord, search: ["title", "description", "content", "notes"], include: { technicalProject: { select: { title: true } }, mpoProject: { select: { title: true } } } },
  },
  legal: {
    cases: { source: prisma.legalCase, search: ["title", "subject", "description", "requesterName", "comments"] },
    contracts: { source: prisma.legalContract, search: ["title", "counterparty", "comments"] },
    templates: { source: prisma.legalTemplate, search: ["name", "description", "content"] },
    risks: { source: prisma.legalRisk, search: ["title", "description", "potentialImpact", "comments"] },
    documents: { source: prisma.legalDocument, search: ["title", "reference", "comments"] },
    disputes: { source: prisma.legalDispute, search: ["title", "counterparty", "description", "comments"] },
    requests: { source: prisma.legalRequest, search: ["subject", "description", "requesterName", "comments"] },
    reports: { source: prisma.legalReport, search: ["title", "content", "recommendations"] },
  },
} satisfies Record<InternalRegisterSection, Record<string, RegisterSpec>>;

const blankData = {
  employees: [], budgets: [], transactions: [], payrolls: [], departments: [], accounts: [], positions: [], staffUsers: [],
  materialItems: [], vendors: [], purchaseRequests: [], inventory: [], assets: [], logistics: [], mpoProjects: [], ctoProjects: [], cooTasks: [],
  operations: [], tasks: [], recurringTasks: [], departmentRequests: [], blockers: [], meetings: [], meetingGroups: [], workflows: [], reports: [],
  objectives: [], supervisionLogs: [], projects: [], records: [], cases: [], contracts: [], templates: [], risks: [], documents: [], disputes: [], requests: [], scoPurchaseRequests: [],
};

function materializeRecords(section: InternalRegisterSection, datasetId: string, input: Record<string, unknown>[]): OperationRecord[] {
  const rows = input.map((row) => {
    if (section === "hr-cfo" && datasetId === "transactions") return { ...row, accountName: (row.account as { name?: string } | undefined)?.name, departmentName: (row.department as { name?: string } | undefined)?.name, budgetName: (row.budget as { name?: string } | undefined)?.name, invoiceId: (row.invoice as { id?: string } | undefined)?.id };
    if (section === "hr-cfo" && datasetId === "payrolls") return { ...row, employeeName: (row.employee as { fullName?: string } | undefined)?.fullName, accountName: (row.account as { name?: string } | undefined)?.name, budgetName: (row.budget as { name?: string } | undefined)?.name };
    if (section === "coo" && datasetId === "workflows") return { ...row, shareCount: (row._count as { shares?: number } | undefined)?.shares };
    if (section === "mpo" && datasetId === "records") return { ...row, projectTitle: (row.project as { title?: string } | undefined)?.title };
    if (section === "cto" && datasetId === "projects") return { ...row, mpoProjectTitle: (row.mpoProject as { title?: string } | undefined)?.title };
    if (section === "cto" && datasetId === "records") return { ...row, technicalProjectTitle: (row.technicalProject as { title?: string } | undefined)?.title, mpoProjectTitle: (row.mpoProject as { title?: string } | undefined)?.title };
    return row;
  });
  const data = { ...blankData, [datasetId]: rows };
  const datasets = section === "hr-cfo" ? buildHrcfoDatasets(data)
    : section === "sco" ? buildScoDatasets(data)
    : section === "coo" ? buildCooDatasets(data)
    : section === "ceo" ? buildCeoDatasets(data)
    : section === "mpo" ? buildMpoDatasets(data)
    : section === "cto" ? buildCtoDatasets(data)
    : buildLaDatasets(data);
  return datasets.find((dataset) => dataset.id === datasetId)?.records || [];
}

export function isInternalRegisterSection(value: string): value is InternalRegisterSection {
  return Object.prototype.hasOwnProperty.call(registers, value);
}

export function isAllowedInternalRegister(section: InternalRegisterSection, datasetId: string) {
  return Object.prototype.hasOwnProperty.call(registers[section], datasetId);
}

export async function getInternalRegisterPage({ section, datasetId, page, pageSize, search, status, from, to }: {
  section: InternalRegisterSection;
  datasetId: string;
  page: number;
  pageSize: number;
  search?: string;
  status?: string;
  from?: string;
  to?: string;
}) {
  const spec = (registers[section] as Record<string, RegisterSpec>)[datasetId];
  if (!spec) throw new Error("UNKNOWN_REGISTER");
  const baseWhere: Record<string, unknown> = {};
  if (search) {
    const predicates: Record<string, unknown>[] = ["id", ...spec.search].map((field) => ({ [field]: { contains: search, mode: "insensitive" } }));
    if (/^-?\d+(?:[.,]\d{1,2})?$/.test(search)) {
      const numeric = Number(search.replace(",", "."));
      if (Number.isFinite(numeric) && Math.abs(numeric) <= 10_000_000_000) {
        for (const field of spec.amountFields || []) predicates.push({ [field]: numeric });
      }
    }
    baseWhere.OR = predicates;
  }
  if (from || to) {
    baseWhere.createdAt = {
      ...(from ? { gte: new Date(`${from}T00:00:00+01:00`) } : {}),
      ...(to ? { lt: new Date(new Date(`${to}T00:00:00+01:00`).getTime() + 86_400_000) } : {}),
    };
  }
  const where = status && status !== "ALL" ? { ...baseWhere, status } : baseWhere;
  const reader = spec.source as unknown as Reader;
  const size = Math.min(25, Math.max(1, pageSize));
  const [total, grouped] = await Promise.all([
    reader.count({ where }),
    reader.groupBy({ by: ["status"], where: baseWhere, _count: { _all: true } }),
  ]);
  const statusCounts = Object.fromEntries(grouped.map((group) => [group.status, group._count._all]));
  const allCount = grouped.reduce((sum, group) => sum + group._count._all, 0);
  const totalPages = Math.max(1, Math.ceil(total / size));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const raw = await reader.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (currentPage - 1) * size, take: size, ...(spec.include ? { include: spec.include } : {}) });
  const records = materializeRecords(section, datasetId, toJsonSafe(raw) as Record<string, unknown>[]);
  return { records, page: currentPage, pageSize: size, total, allCount, statusCounts, totalPages, hasNextPage: currentPage < totalPages, hasPreviousPage: currentPage > 1 };
}
