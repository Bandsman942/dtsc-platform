import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import { getEnterpriseCommonDomainAccess } from "@/lib/enterprise/common/access";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string }> };

const LIMITS = { sites: 500, warehouses: 2000, locations: 5000 } as const;

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId } = await params;
  const access = await getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "SITES_WAREHOUSES", action: "read" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const base = { organizationId, archivedAt: null } as const;
  const [siteTotal, warehouseTotal, locationTotal] = await Promise.all([
    prisma.enterpriseSite.count({ where: base }),
    prisma.enterpriseWarehouse.count({ where: base }),
    prisma.enterpriseStorageLocation.count({ where: base }),
  ]);
  const [sites, warehouses, locations] = await Promise.all([
    prisma.enterpriseSite.findMany({ where: base, orderBy: [{ name: "asc" }], take: LIMITS.sites, select: { id: true, code: true, name: true, siteType: true, city: true, countryCode: true, status: true } }),
    prisma.enterpriseWarehouse.findMany({ where: base, orderBy: [{ siteId: "asc" }, { name: "asc" }], take: LIMITS.warehouses, select: { id: true, siteId: true, code: true, name: true, warehouseType: true, status: true } }),
    prisma.enterpriseStorageLocation.findMany({ where: base, orderBy: [{ warehouseId: "asc" }, { parentLocationId: "asc" }, { code: "asc" }], take: LIMITS.locations, select: { id: true, warehouseId: true, parentLocationId: true, code: true, name: true, locationType: true, status: true } }),
  ]);
  const totals = { sites: siteTotal, warehouses: warehouseTotal, locations: locationTotal };
  const complete = siteTotal <= LIMITS.sites && warehouseTotal <= LIMITS.warehouses && locationTotal <= LIMITS.locations;
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "site-hierarchy", complete, totals } });
  return NextResponse.json({ sites, warehouses, locations, totals, limits: LIMITS, complete });
}
