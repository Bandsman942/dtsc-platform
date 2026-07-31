import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getEnterpriseCommonDomainAccess } from "@/lib/enterprise/common/access";
import { businessPartyCreateSchema } from "@/lib/enterprise/master-data/schemas";
import { createEnterpriseBusinessParty } from "@/lib/enterprise/master-data/service";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId } = await params;
  const access = await getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "CRM_CUSTOMERS", action: "read" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page") || 1) || 1);
  const pageSize = Math.min(50, Math.max(5, Number(url.searchParams.get("pageSize") || 20) || 20));
  const search = url.searchParams.get("search")?.trim() || "";
  const role = url.searchParams.get("role")?.trim().toUpperCase() || "";
  const partyType = url.searchParams.get("partyType")?.trim().toUpperCase() || "";
  const status = url.searchParams.get("status")?.trim().toUpperCase() || "";
  const where: Prisma.EnterpriseBusinessPartyWhereInput = {
    organizationId,
    archivedAt: null,
    ...(search ? { OR: [{ legalName: { contains: search, mode: "insensitive" } }, { displayName: { contains: search, mode: "insensitive" } }, { code: { contains: search, mode: "insensitive" } }, { primaryEmail: { contains: search, mode: "insensitive" } }] } : {}),
    ...(partyType ? { partyType } : {}),
    ...(status ? { status } : {}),
    ...(role ? { roles: { some: { roleCode: role, status: "ACTIVE", archivedAt: null } } } : {}),
  };
  const [items, total, customers, suppliers, prospects] = await Promise.all([
    prisma.enterpriseBusinessParty.findMany({
      where,
      orderBy: [{ legalName: "asc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        roles: { where: { status: "ACTIVE", archivedAt: null }, orderBy: { roleCode: "asc" } },
        contacts: { where: { status: "ACTIVE", archivedAt: null }, orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }], take: 5 },
        addresses: { where: { status: "ACTIVE", archivedAt: null }, orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }], take: 3 },
      },
    }),
    prisma.enterpriseBusinessParty.count({ where }),
    prisma.enterpriseBusinessPartyRole.count({ where: { organizationId, roleCode: "CUSTOMER", status: "ACTIVE", archivedAt: null } }),
    prisma.enterpriseBusinessPartyRole.count({ where: { organizationId, roleCode: "SUPPLIER", status: "ACTIVE", archivedAt: null } }),
    prisma.enterpriseBusinessPartyRole.count({ where: { organizationId, roleCode: "PROSPECT", status: "ACTIVE", archivedAt: null } }),
  ]);
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "business-parties", page } });
  return NextResponse.json({ items, pagination: { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) }, metrics: { customers, suppliers, prospects }, canManage: access.canManage });
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-business-party-create:${session.userId}`), 100, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { organizationId } = await params;
  const access = await getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "CRM_CUSTOMERS", action: "write" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = businessPartyCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Tiers invalide." }, { status: 400 });
  try {
    const party = await createEnterpriseBusinessParty(organizationId, session.userId, parsed.data);
    await writeAuditLog({ userId: session.userId, action: "ENTERPRISE_BUSINESS_PARTY_CREATED", entity: "EnterpriseBusinessParty", entityId: party.id, request: req, metadata: { organizationId, roles: parsed.data.roles } });
    await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt, metadata: { organizationId, domain: "business-parties" } });
    return NextResponse.json({ ok: true, party }, { status: 201 });
  } catch (error) {
    const duplicate = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
    return NextResponse.json({ error: duplicate ? "BUSINESS_PARTY_DUPLICATE" : "BUSINESS_PARTY_CREATE_FAILED", message: duplicate ? "Un tiers possédant ce code ou cette clé existe déjà." : "Création du tiers impossible." }, { status: duplicate ? 409 : 400 });
  }
}
