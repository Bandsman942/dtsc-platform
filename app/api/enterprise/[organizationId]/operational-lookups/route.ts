import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import { getEnterpriseCommonDomainAccess } from "@/lib/enterprise/common/access";
import { authorizeFinanceRequest } from "@/lib/enterprise/accounting/http";
import type { EnterpriseFinanceModuleCode } from "@/lib/enterprise/accounting/constants";
import { prisma } from "@/lib/prisma";

const COMMON_MODULES = new Set([
  "SALES_QUOTES_ORDERS",
  "SUPPLIERS_PURCHASES",
  "INVENTORY_LOGISTICS",
  "HUMAN_RESOURCES",
  "TIME_ATTENDANCE",
  "PAYROLL_OPERATIONS",
  "PROJECTS_SERVICES",
  "TIME_DELIVERABLES",
  "ASSETS_MAINTENANCE",
]);

const FINANCE_MODULES = new Set<EnterpriseFinanceModuleCode>([
  "FINANCE_OVERVIEW",
  "FINANCE_RECEIVABLES",
  "FINANCE_PAYABLES",
  "FINANCE_PAYMENTS",
  "FINANCE_TREASURY",
  "FINANCE_CASH",
  "FINANCE_BANK",
  "FINANCE_RECONCILIATION",
]);

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId } = await params;
  const moduleCode = (new URL(req.url).searchParams.get("module") || "").toUpperCase();
  if (!COMMON_MODULES.has(moduleCode) && !FINANCE_MODULES.has(moduleCode as EnterpriseFinanceModuleCode)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (FINANCE_MODULES.has(moduleCode as EnterpriseFinanceModuleCode)) {
    const auth = await authorizeFinanceRequest(req, organizationId, moduleCode as EnterpriseFinanceModuleCode, "view");
    if (!auth.ok) return auth.response;
  } else {
    const access = await getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode, action: "read" });
    if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [
    members,
    employees,
    departments,
    parties,
    sites,
    warehouses,
    locations,
    inventoryItems,
    projects,
    payrollPeriods,
    payrollRuns,
    assetCategories,
    suppliers,
    employmentContracts,
    catalogItems,
    salesOrders,
    fulfillments,
    commercialContracts,
    purchases,
    purchaseReceipts,
  ] = await Promise.all([
    prisma.organizationMember.findMany({
      where: { organizationId, status: "ACTIVE", removedAt: null },
      orderBy: { user: { name: "asc" } },
      take: 1000,
      select: { id: true, userId: true, role: true, positionTitle: true, user: { select: { name: true, email: true } } },
    }),
    prisma.enterpriseEmployee.findMany({
      where: { organizationId, employmentStatus: "ACTIVE", archivedAt: null },
      orderBy: { displayName: "asc" },
      take: 2000,
      select: { id: true, employeeNumber: true, displayName: true, workEmail: true, organizationMemberId: true, departmentId: true, positionId: true },
    }),
    prisma.enterpriseDepartment.findMany({
      where: { organizationId, isActive: true },
      orderBy: [{ sortOrder: "asc" }, { labelFr: "asc" }],
      take: 500,
      select: { id: true, departmentCode: true, labelFr: true, labelEn: true },
    }),
    prisma.enterpriseBusinessParty.findMany({
      where: { organizationId, status: "ACTIVE", archivedAt: null },
      orderBy: { legalName: "asc" },
      take: 2000,
      select: { id: true, code: true, legalName: true, displayName: true, partyType: true, roles: { where: { status: "ACTIVE", archivedAt: null }, select: { roleCode: true } } },
    }),
    prisma.enterpriseSite.findMany({
      where: { organizationId, status: "ACTIVE", archivedAt: null },
      orderBy: { name: "asc" },
      take: 500,
      select: { id: true, code: true, name: true, siteType: true },
    }),
    prisma.enterpriseWarehouse.findMany({
      where: { organizationId, status: "ACTIVE", archivedAt: null },
      orderBy: { name: "asc" },
      take: 1000,
      select: { id: true, siteId: true, code: true, name: true, warehouseType: true },
    }),
    prisma.enterpriseStorageLocation.findMany({
      where: { organizationId, status: "ACTIVE", archivedAt: null },
      orderBy: [{ warehouseId: "asc" }, { code: "asc" }],
      take: 3000,
      select: { id: true, warehouseId: true, code: true, name: true },
    }),
    prisma.enterpriseInventoryItem.findMany({
      where: { organizationId, status: "ACTIVE", archivedAt: null },
      orderBy: { catalogItem: { name: "asc" } },
      take: 3000,
      select: { id: true, minimumQuantity: true, catalogItem: { select: { id: true, code: true, sku: true, name: true } } },
    }),
    prisma.enterpriseProject.findMany({
      where: { organizationId, archivedAt: null, status: { notIn: ["CANCELLED", "ARCHIVED"] } },
      orderBy: { name: "asc" },
      take: 2000,
      select: { id: true, reference: true, name: true, status: true },
    }),
    prisma.enterprisePayrollPeriod.findMany({
      where: { organizationId },
      orderBy: { periodStart: "desc" },
      take: 200,
      select: { id: true, code: true, name: true, status: true, periodStart: true, periodEnd: true, payDate: true },
    }),
    prisma.enterprisePayrollRun.findMany({
      where: { organizationId, archivedAt: null, status: "APPROVED" },
      orderBy: { approvedAt: "desc" },
      take: 500,
      select: { id: true, reference: true, status: true, currency: true, netAmount: true, payrollPeriod: { select: { code: true, name: true } } },
    }),
    prisma.enterpriseAssetCategory.findMany({
      where: { organizationId, archivedAt: null },
      orderBy: { name: "asc" },
      take: 1000,
      select: { id: true, code: true, name: true },
    }),
    prisma.enterpriseSupplier.findMany({
      where: { organizationId, status: "ACTIVE", archivedAt: null },
      orderBy: { legalName: "asc" },
      take: 1000,
      select: { id: true, legalName: true, displayName: true },
    }),
    prisma.enterpriseEmploymentContract.findMany({
      where: { organizationId, archivedAt: null, status: { in: ["ACTIVE", "APPROVED"] } },
      orderBy: { startDate: "desc" },
      take: 2000,
      select: { id: true, reference: true, employeeId: true, status: true, startDate: true, endDate: true },
    }),
    prisma.enterpriseCatalogItem.findMany({
      where: { organizationId, status: "ACTIVE", archivedAt: null },
      orderBy: { name: "asc" },
      take: 3000,
      select: { id: true, code: true, sku: true, name: true, itemType: true, currency: true, indicativeSalePrice: true, indicativeCost: true },
    }),
    prisma.enterpriseSalesOrder.findMany({
      where: { organizationId, archivedAt: null, status: { notIn: ["CANCELLED", "CLOSED"] } },
      orderBy: { createdAt: "desc" },
      take: 1000,
      select: { id: true, reference: true, title: true, businessPartyId: true, contractId: true, status: true, currency: true, totalAmount: true },
    }),
    prisma.enterpriseFulfillment.findMany({
      where: { organizationId, status: { in: ["FULFILLED", "ACCEPTED", "COMPLETED"] } },
      orderBy: { createdAt: "desc" },
      take: 1000,
      select: { id: true, reference: true, salesOrderId: true, status: true, fulfilledAt: true },
    }),
    prisma.enterpriseContract.findMany({
      where: { organizationId, archivedAt: null, status: { in: ["APPROVED", "ACTIVE"] } },
      orderBy: { createdAt: "desc" },
      take: 1000,
      select: { id: true, reference: true, title: true, businessPartyId: true, status: true, currency: true, indicativeAmount: true },
    }),
    prisma.enterprisePurchase.findMany({
      where: { organizationId, archivedAt: null, status: { notIn: ["CANCELLED", "REJECTED"] } },
      orderBy: { createdAt: "desc" },
      take: 1000,
      select: { id: true, reference: true, title: true, supplierId: true, status: true, currency: true, totalAmount: true },
    }),
    prisma.enterprisePurchaseReceipt.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      take: 1000,
      select: { id: true, reference: true, purchaseId: true },
    }),
  ]);

  const financePayrollPeriods = moduleCode === "FINANCE_PAYMENTS"
    ? payrollRuns.map((run) => ({
        id: run.id,
        code: run.reference,
        name: `${run.payrollPeriod.code} · ${run.payrollPeriod.name}`,
        status: run.status,
      }))
    : payrollPeriods;

  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "operational-lookups", moduleCode } });
  return NextResponse.json({
    members: members.map((member) => ({ id: member.userId, membershipId: member.id, label: member.user.name || member.user.email, email: member.user.email, role: member.role, positionTitle: member.positionTitle })),
    employees,
    departments,
    parties,
    sites,
    warehouses,
    locations,
    inventoryItems: inventoryItems.map((item) => ({ id: item.id, minimumQuantity: item.minimumQuantity, catalogItemId: item.catalogItem.id, code: item.catalogItem.code, sku: item.catalogItem.sku, name: item.catalogItem.name })),
    projects,
    payrollPeriods: financePayrollPeriods,
    payrollRuns,
    assetCategories,
    suppliers,
    employmentContracts,
    catalogItems,
    salesOrders,
    fulfillments,
    commercialContracts,
    purchases,
    purchaseReceipts,
  });
}
