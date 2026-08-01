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

const CONTRACT_COUNTERPARTY_PREFIXES = {
  employee: "employee:",
  member: "member:",
  supplier: "supplier:",
} as const;

type Params = { params: Promise<{ organizationId: string }> };

function normalizedEmail(value: string | null | undefined) {
  return value?.trim().toLowerCase() || null;
}

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

  const [
    members,
    departments,
    positions,
    employees,
    parties,
    suppliers,
    supplierPartyLinks,
    categories,
    units,
    sites,
    warehouses,
  ] = await Promise.all([
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
      select: {
        id: true,
        employeeNumber: true,
        displayName: true,
        workEmail: true,
        departmentId: true,
        positionId: true,
        organizationMemberId: true,
        businessPartyId: true,
      },
    }),
    prisma.enterpriseBusinessParty.findMany({
      where: { organizationId, status: "ACTIVE", archivedAt: null },
      orderBy: [{ legalName: "asc" }],
      take: 1500,
      select: {
        id: true,
        code: true,
        partyType: true,
        legalName: true,
        displayName: true,
        primaryEmail: true,
        primaryPhone: true,
        status: true,
        roles: { where: { status: "ACTIVE", archivedAt: null }, select: { roleCode: true } },
      },
    }),
    prisma.enterpriseSupplier.findMany({
      where: { organizationId, archivedAt: null, status: { not: "ARCHIVED" } },
      orderBy: { legalName: "asc" },
      take: 1000,
      select: {
        id: true,
        legalName: true,
        displayName: true,
        supplierType: true,
        email: true,
        phone: true,
        status: true,
      },
    }),
    prisma.enterpriseSupplierPartyLink.findMany({
      where: { organizationId, archivedAt: null },
      select: { supplierId: true, businessPartyId: true },
      take: 1000,
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

  const mappedMembers = members.map((member) => ({
    id: member.userId,
    membershipId: member.id,
    label: member.user.name || member.user.email,
    email: member.user.email,
    role: member.role,
    positionCode: member.positionCode,
    positionTitle: member.positionTitle,
  }));

  const contractParties = [...parties];
  if (moduleCode === "CONTRACTS") {
    const partyIds = new Set(parties.map((party) => party.id));
    const partyEmails = new Set(parties.map((party) => normalizedEmail(party.primaryEmail)).filter(Boolean));
    const employeeMembershipIds = new Set(employees.map((employee) => employee.organizationMemberId).filter(Boolean));
    const supplierPartyBySupplierId = new Map(supplierPartyLinks.map((link) => [link.supplierId, link.businessPartyId]));

    for (const employee of employees) {
      if (employee.businessPartyId && partyIds.has(employee.businessPartyId)) continue;
      contractParties.push({
        id: `${CONTRACT_COUNTERPARTY_PREFIXES.employee}${employee.id}`,
        code: employee.employeeNumber,
        partyType: "PERSON",
        legalName: employee.displayName,
        displayName: employee.displayName,
        primaryEmail: employee.workEmail,
        primaryPhone: null,
        status: "ACTIVE",
        roles: [{ roleCode: "EMPLOYEE" }],
      });
      const email = normalizedEmail(employee.workEmail);
      if (email) partyEmails.add(email);
    }

    for (const supplier of suppliers) {
      const linkedPartyId = supplierPartyBySupplierId.get(supplier.id);
      if (linkedPartyId && partyIds.has(linkedPartyId)) continue;
      contractParties.push({
        id: `${CONTRACT_COUNTERPARTY_PREFIXES.supplier}${supplier.id}`,
        code: "FOURNISSEUR",
        partyType: supplier.supplierType === "PERSON" ? "PERSON" : "ORGANIZATION",
        legalName: supplier.legalName,
        displayName: supplier.displayName,
        primaryEmail: supplier.email,
        primaryPhone: supplier.phone,
        status: supplier.status,
        roles: [{ roleCode: "SUPPLIER" }],
      });
      const email = normalizedEmail(supplier.email);
      if (email) partyEmails.add(email);
    }

    for (const member of members) {
      if (employeeMembershipIds.has(member.id)) continue;
      const email = normalizedEmail(member.user.email);
      if (email && partyEmails.has(email)) continue;
      contractParties.push({
        id: `${CONTRACT_COUNTERPARTY_PREFIXES.member}${member.userId}`,
        code: member.positionCode || member.role,
        partyType: "PERSON",
        legalName: member.user.name || member.user.email,
        displayName: member.user.name,
        primaryEmail: member.user.email,
        primaryPhone: null,
        status: "ACTIVE",
        roles: [{ roleCode: "COLLABORATOR" }],
      });
      if (email) partyEmails.add(email);
    }

    contractParties.sort((left, right) =>
      (left.displayName || left.legalName).localeCompare(right.displayName || right.legalName, "fr"),
    );
  }

  await writeApiLog({
    request: req,
    statusCode: 200,
    userId: session.userId,
    startedAt,
    metadata: { organizationId, domain: "professional-lookups", moduleCode },
  });
  return NextResponse.json({
    members: mappedMembers,
    departments,
    positions,
    employees,
    parties: moduleCode === "CONTRACTS" ? contractParties : parties,
    categories,
    units,
    sites,
    warehouses,
  });
}
