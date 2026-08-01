import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getEnterpriseProcurementAccess } from "@/lib/enterprise/procurement/access";
import { createEnterpriseSupplier } from "@/lib/enterprise/procurement/supplier-service";
import { enterpriseSupplierCreateSchema } from "@/lib/enterprise/procurement/validators";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId } = await params;
  const access = await getEnterpriseProcurementAccess({ session, organizationId, moduleCode: "SUPPLIERS_PURCHASES", action: "read" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page") || 1) || 1);
  const pageSize = Math.min(50, Math.max(5, Number(url.searchParams.get("pageSize") || 20) || 20));
  const search = url.searchParams.get("search")?.trim() || "";
  const category = url.searchParams.get("category")?.trim() || "";
  const status = url.searchParams.get("status")?.trim() || "";
  const country = url.searchParams.get("country")?.trim() || "";
  const where: Prisma.EnterpriseSupplierWhereInput = {
    organizationId,
    archivedAt: null,
    ...(search ? { OR: [{ legalName: { contains: search, mode: "insensitive" } }, { displayName: { contains: search, mode: "insensitive" } }, { email: { contains: search, mode: "insensitive" } }] } : {}),
    ...(category ? { category: { contains: category, mode: "insensitive" } } : {}),
    ...(status ? { status } : {}),
    ...(country ? { country: { contains: country, mode: "insensitive" } } : {}),
  };
  const recentSince = new Date(Date.now() - 30 * 86400000);
  const [rawItems, total, active, suspended, recent] = await Promise.all([
    prisma.enterpriseSupplier.findMany({ where, orderBy: { legalName: "asc" }, skip: (page - 1) * pageSize, take: pageSize, include: { contacts: { orderBy: [{ isPrimary: "desc" }, { name: "asc" }], take: 3 }, _count: { select: { purchases: true } } } }),
    prisma.enterpriseSupplier.count({ where }),
    prisma.enterpriseSupplier.count({ where: { organizationId, archivedAt: null, status: "ACTIVE" } }),
    prisma.enterpriseSupplier.count({ where: { organizationId, archivedAt: null, status: "SUSPENDED" } }),
    prisma.enterpriseSupplier.count({ where: { organizationId, archivedAt: null, createdAt: { gte: recentSince } } }),
  ]);
  const supplierIds = rawItems.map((item) => item.id);
  const contactIds = rawItems.flatMap((item) => item.contacts.map((contact) => contact.id));
  const references = supplierIds.length || contactIds.length ? await prisma.enterprisePersonBusinessReference.findMany({
    where: { organizationId, OR: [
      ...(supplierIds.length ? [{ supplierId: { in: supplierIds } }] : []),
      ...(contactIds.length ? [{ supplierContactId: { in: contactIds } }] : []),
    ] },
    select: { supplierId: true, supplierContactId: true, personIdentityId: true },
  }) : [];
  const identityLinks = references.length ? await prisma.enterpriseIdentityLink.findMany({
    where: { organizationId, personIdentityId: { in: [...new Set(references.map((reference) => reference.personIdentityId))] } },
    orderBy: { updatedAt: "desc" },
    select: { id: true, personIdentityId: true, status: true, requestedRelationType: true, activatedAt: true, expiresAt: true },
  }) : [];
  const linkByPerson = new Map<string, (typeof identityLinks)[number]>();
  for (const link of identityLinks) if (!linkByPerson.has(link.personIdentityId)) linkByPerson.set(link.personIdentityId, link);
  const supplierLink = new Map(references.filter((reference) => reference.supplierId).map((reference) => [reference.supplierId as string, linkByPerson.get(reference.personIdentityId) || null]));
  const contactLink = new Map(references.filter((reference) => reference.supplierContactId).map((reference) => [reference.supplierContactId as string, linkByPerson.get(reference.personIdentityId) || null]));
  const items = rawItems.map((item) => ({ ...item, identityLink: supplierLink.get(item.id) || null, contacts: item.contacts.map((contact) => ({ ...contact, identityLink: contactLink.get(contact.id) || null })) }));
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "suppliers", page } });
  return NextResponse.json({ items, pagination: { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) }, metrics: { active, suspended, recent }, canManage: access.canManage });
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-supplier-create:${session.userId}`), 80, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { organizationId } = await params;
  const access = await getEnterpriseProcurementAccess({ session, organizationId, moduleCode: "SUPPLIERS_PURCHASES", action: "write" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = enterpriseSupplierCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Fournisseur invalide." }, { status: 400 });
  try {
    const supplier = await createEnterpriseSupplier(organizationId, session.userId, parsed.data);
    await writeAuditLog({ userId: session.userId, action: "ENTERPRISE_SUPPLIER_CREATED", entity: "EnterpriseSupplier", entityId: supplier.id, request: req, metadata: { organizationId, status: supplier.status } });
    await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt, metadata: { organizationId, domain: "suppliers" } });
    return NextResponse.json({ ok: true, supplier }, { status: 201 });
  } catch (error) {
    const duplicate = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
    return NextResponse.json({ error: duplicate ? "SUPPLIER_DUPLICATE" : "SUPPLIER_CREATE_FAILED", message: duplicate ? "Un fournisseur portant ce nom normalisé existe déjà dans cette entreprise." : "Création du fournisseur impossible." }, { status: duplicate ? 409 : 400 });
  }
}
