import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import { getEnterpriseProcurementAccess } from "@/lib/enterprise/procurement/access";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId } = await params;
  const access = await getEnterpriseProcurementAccess({ session, organizationId, moduleCode: "SUPPLIERS_PURCHASES", action: "write" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page") || 1) || 1);
  const pageSize = Math.min(30, Math.max(5, Number(url.searchParams.get("pageSize") || 20) || 20));
  const search = url.searchParams.get("search")?.trim() || "";
  const where: Prisma.EnterpriseBusinessPartyWhereInput = {
    organizationId,
    archivedAt: null,
    status: "ACTIVE",
    ...(search ? {
      OR: [
        { code: { contains: search, mode: "insensitive" } },
        { legalName: { contains: search, mode: "insensitive" } },
        { displayName: { contains: search, mode: "insensitive" } },
        { primaryEmail: { contains: search, mode: "insensitive" } },
        { taxIdentifier: { contains: search, mode: "insensitive" } },
        { registrationId: { contains: search, mode: "insensitive" } },
      ],
    } : {}),
  };

  const [parties, total] = await Promise.all([
    prisma.enterpriseBusinessParty.findMany({
      where,
      orderBy: [{ legalName: "asc" }, { createdAt: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        code: true,
        partyType: true,
        legalName: true,
        displayName: true,
        primaryEmail: true,
        primaryPhone: true,
        taxIdentifier: true,
        registrationId: true,
        roles: { where: { archivedAt: null }, select: { roleCode: true, status: true } },
      },
    }),
    prisma.enterpriseBusinessParty.count({ where }),
  ]);

  const partyIds = parties.map((party) => party.id);
  const links = partyIds.length ? await prisma.enterpriseSupplierPartyLink.findMany({
    where: { organizationId, businessPartyId: { in: partyIds } },
    select: { businessPartyId: true, supplierId: true, archivedAt: true },
  }) : [];
  const linkByParty = new Map(links.map((link) => [link.businessPartyId, link]));
  const items = parties.map((party) => {
    const link = linkByParty.get(party.id);
    return {
      ...party,
      supplierId: link?.supplierId || null,
      supplierLinkArchived: Boolean(link?.archivedAt),
    };
  });

  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "supplier-party-options", page, search: Boolean(search) } });
  return NextResponse.json({
    items,
    pagination: { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) },
    canManage: access.canManage,
  });
}
