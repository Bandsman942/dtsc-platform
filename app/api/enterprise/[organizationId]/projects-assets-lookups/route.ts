import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import { getEnterpriseCommonDomainAccess } from "@/lib/enterprise/common/access";
import {
  enterpriseDocumentVisibilityWhere,
  enterprisePurchaseVisibilityWhere,
  getEnterpriseProcurementAccess,
} from "@/lib/enterprise/procurement/access";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string }> };
const MODULES = new Set(["PROJECTS_SERVICES", "TIME_DELIVERABLES", "ASSETS_MAINTENANCE"]);

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId } = await params;
  const moduleCode = (new URL(req.url).searchParams.get("module") || "").toUpperCase();
  if (!MODULES.has(moduleCode)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const access = await getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode, action: "read" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [budgetAccess, documentAccess, procurementAccess] = await Promise.all([
    moduleCode === "PROJECTS_SERVICES"
      ? getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "FINANCE_BUDGETS", action: "read" })
      : Promise.resolve(null),
    moduleCode !== "ASSETS_MAINTENANCE"
      ? getEnterpriseProcurementAccess({ session, organizationId, moduleCode: "DOCUMENTS", action: "read" })
      : Promise.resolve(null),
    moduleCode === "ASSETS_MAINTENANCE"
      ? getEnterpriseProcurementAccess({ session, organizationId, moduleCode: "SUPPLIERS_PURCHASES", action: "read" })
      : Promise.resolve(null),
  ]);
  const documentVisibility = documentAccess
    ? await enterpriseDocumentVisibilityWhere({
        organizationId,
        userId: session.userId,
        canSeeAll: documentAccess.canSeeAll,
      })
    : null;
  const purchaseVisibility = procurementAccess
    ? enterprisePurchaseVisibilityWhere({
        organizationId,
        userId: session.userId,
        canSeeAll: procurementAccess.canSeeAll,
      })
    : null;

  const base = await Promise.all([
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
      select: { id: true, employeeNumber: true, displayName: true, workEmail: true, departmentId: true, positionId: true },
    }),
    prisma.enterpriseDepartment.findMany({
      where: { organizationId, isActive: true },
      orderBy: [{ sortOrder: "asc" }, { labelFr: "asc" }],
      take: 500,
      select: { id: true, departmentCode: true, labelFr: true, labelEn: true },
    }),
    prisma.enterpriseSite.findMany({
      where: { organizationId, status: "ACTIVE", archivedAt: null },
      orderBy: { name: "asc" },
      take: 500,
      select: { id: true, code: true, name: true },
    }),
  ]);
  const [members, employees, departments, sites] = base;

  let payload: Record<string, unknown> = {
    members: members.map((member) => ({
      id: member.userId,
      membershipId: member.id,
      label: member.user.name || member.user.email,
      email: member.user.email,
      role: member.role,
      positionTitle: member.positionTitle,
    })),
    employees,
    departments,
    sites,
  };

  if (moduleCode === "PROJECTS_SERVICES" || moduleCode === "TIME_DELIVERABLES") {
    const [parties, contracts, projects, budgets, documents] = await Promise.all([
      prisma.enterpriseBusinessParty.findMany({
        where: { organizationId, status: "ACTIVE", archivedAt: null, roles: { some: { status: "ACTIVE", archivedAt: null, roleCode: { in: ["CUSTOMER", "PROSPECT"] } } } },
        orderBy: { legalName: "asc" },
        take: 2000,
        select: { id: true, code: true, legalName: true, displayName: true },
      }),
      prisma.enterpriseContract.findMany({
        where: { organizationId, archivedAt: null, status: { in: ["APPROVED", "ACTIVE"] } },
        orderBy: { createdAt: "desc" },
        take: 1000,
        select: { id: true, reference: true, title: true, businessPartyId: true, status: true, currency: true, indicativeAmount: true },
      }),
      prisma.enterpriseProject.findMany({
        where: { organizationId, archivedAt: null, status: { notIn: ["CANCELLED", "CLOSED"] } },
        orderBy: { name: "asc" },
        take: 2000,
        select: { id: true, reference: true, name: true, status: true },
      }),
      budgetAccess
        ? prisma.enterpriseBudget.findMany({
            where: { organizationId, archivedAt: null, status: { notIn: ["CLOSED", "CANCELLED"] } },
            orderBy: { periodStart: "desc" },
            take: 500,
            select: { id: true, reference: true, title: true, status: true, currency: true, periodStart: true, periodEnd: true },
          })
        : Promise.resolve([]),
      documentVisibility
        ? prisma.enterpriseDocument.findMany({
            where: { ...documentVisibility, status: { notIn: ["ARCHIVED", "DELETED"] } },
            orderBy: { updatedAt: "desc" },
            take: 1000,
            select: { id: true, title: true, documentType: true, status: true, visibility: true },
          })
        : Promise.resolve([]),
    ]);
    payload = {
      ...payload,
      parties,
      contracts,
      projects,
      budgets,
      documents,
      canReadBudgets: Boolean(budgetAccess),
      canReadDocuments: Boolean(documentAccess),
    };
  }

  if (moduleCode === "ASSETS_MAINTENANCE") {
    const [locations, suppliers, assetCategories, purchases] = await Promise.all([
      prisma.enterpriseStorageLocation.findMany({
        where: { organizationId, status: "ACTIVE", archivedAt: null },
        orderBy: [{ warehouseId: "asc" }, { code: "asc" }],
        take: 3000,
        select: { id: true, warehouseId: true, code: true, name: true, warehouse: { select: { siteId: true } } },
      }),
      procurementAccess
        ? prisma.enterpriseSupplier.findMany({
            where: { organizationId, status: "ACTIVE", archivedAt: null },
            orderBy: { legalName: "asc" },
            take: 1000,
            select: { id: true, legalName: true, displayName: true },
          })
        : Promise.resolve([]),
      prisma.enterpriseAssetCategory.findMany({
        where: { organizationId, archivedAt: null, status: "ACTIVE" },
        orderBy: { name: "asc" },
        take: 1000,
        select: { id: true, code: true, name: true },
      }),
      purchaseVisibility
        ? prisma.enterprisePurchase.findMany({
            where: {
              ...purchaseVisibility,
              status: { in: ["ORDERED", "PARTIALLY_RECEIVED", "RECEIVED", "CLOSED"] },
            },
            orderBy: { createdAt: "desc" },
            take: 1000,
            select: { id: true, reference: true, title: true, supplierId: true, status: true, currency: true, totalAmount: true },
          })
        : Promise.resolve([]),
    ]);
    payload = {
      ...payload,
      locations,
      suppliers,
      assetCategories,
      purchases,
      canReadProcurement: Boolean(procurementAccess),
    };
  }

  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "projects-assets-lookups", moduleCode } });
  return NextResponse.json(payload);
}
