import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import { getEnterpriseCommonDomainAccess } from "@/lib/enterprise/common/access";
import { prisma } from "@/lib/prisma";

const ALLOWED_MODULES = new Set([
  "CRM_CUSTOMERS",
  "CATALOG",
  "SITES_WAREHOUSES",
  "CRM_PIPELINE",
  "CONTRACTS",
  "SUPPLIERS_PURCHASES",
  "HUMAN_RESOURCES",
]);

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId } = await params;
  const url = new URL(req.url);
  const moduleCode = (url.searchParams.get("module") || "CRM_CUSTOMERS").toUpperCase();
  if (!ALLOWED_MODULES.has(moduleCode)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const access = await getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode, action: "read" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [members, departments, positions, employees, parties, categories, units, sites, warehouses] = await Promise.all([
    prisma.organizationMember.findMany({
      where: { organizationId, status: "ACTIVE", removedAt: null },
      orderBy: [{ role: "asc" }, { user: { name: "asc" } }],
      take: 500,
      select: {
        id: true,
        userId: true,
        role: true,
        positionCode: true,
        positionTitle: true,
        user: { select: { name: true, email: true } },
      },
    }),
    prisma.enterpriseDepartment.findMany({
      where: { organizationId, isActive: true },
      orderBy: [{ sortOrder: "asc" }, { labelFr: "asc" }],
      take: 300,
      select: { id: true, departmentCode: true, labelFr: true, labelEn: true },
    }),
    prisma.enterprisePosition.findMany({
      where: { organizationId, isActive: true },
      orderBy: [{ hierarchyLevel: "asc" }, { labelFr: "asc" }],
      take: 500,
      select: { id: true, positionCode: true, labelFr: true, labelEn: true, departmentId: true },
    }),
    prisma.enterpriseEmployee.findMany({
      where: { organizationId, employmentStatus: "ACTIVE", archivedAt: null },
      orderBy: { displayName: "asc" },
      take: 1000,
      select: { id: true, employeeNumber: true, displayName: true, workEmail: true, departmentId: true, positionId: true },
    }),
    prisma.enterpriseBusinessParty.findMany({
      where: { organizationId, archivedAt: null, status: "ACTIVE" },
      orderBy: [{ legalName: "asc" }],
      take: 1000,
      select: {
        id: true,
        code: true,
        partyType: true,
        legalName: true,
        displayName: true,
        primaryEmail: true,
        primaryPhone: true,
        roles: { where: { status: "ACTIVE", archivedAt: null }, select: { roleCode: true } },
      },
    }),
    prisma.enterpriseCatalogCategory.findMany({
      where: { organizationId, status: "ACTIVE", archivedAt: null },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      take: 500,
      select: { id: true, code: true, name: true, parentCategoryId: true },
    }),
    prisma.enterpriseUnitOfMeasure.findMany({
      where: { organizationId, status: "ACTIVE", archivedAt: null },
      orderBy: [{ category: "asc" }, { name: "asc" }],
      take: 300,
      select: { id: true, code: true, name: true, symbol: true },
    }),
    prisma.enterpriseSite.findMany({
      where: { organizationId, status: "ACTIVE", archivedAt: null },
      orderBy: { name: "asc" },
      take: 300,
      select: { id: true, code: true, name: true, siteType: true },
    }),
    prisma.enterpriseWarehouse.findMany({
      where: { organizationId, status: "ACTIVE", archivedAt: null },
      orderBy: { name: "asc" },
      take: 500,
      select: { id: true, siteId: true, code: true, name: true, warehouseType: true },
    }),
  ]);

  await writeApiLog({
    request: req,
    statusCode: 200,
    userId: session.userId,
    startedAt,
    metadata: { organizationId, domain: "professional-lookups", moduleCode },
  });
  return NextResponse.json({
    members: members.map((member) => ({
      id: member.userId,
      membershipId: member.id,
      label: member.user.name || member.user.email,
      email: member.user.email,
      role: member.role,
      positionCode: member.positionCode,
      positionTitle: member.positionTitle,
    })),
    departments,
    positions,
    employees,
    parties,
    categories,
    units,
    sites,
    warehouses,
  });
}
