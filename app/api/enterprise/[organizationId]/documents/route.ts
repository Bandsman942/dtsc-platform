import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { enterpriseDocumentVisibilityWhere, getEnterpriseProcurementAccess } from "@/lib/enterprise/procurement/access";
import { createEnterpriseDocument } from "@/lib/enterprise/procurement/document-service";
import { enterpriseDocumentCreateSchema } from "@/lib/enterprise/procurement/validators";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId } = await params;
  const access = await getEnterpriseProcurementAccess({ session, organizationId, moduleCode: "DOCUMENTS", action: "read" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page") || 1) || 1);
  const pageSize = Math.min(50, Math.max(5, Number(url.searchParams.get("pageSize") || 20) || 20));
  const search = url.searchParams.get("search")?.trim() || "";
  const type = url.searchParams.get("type")?.trim() || "";
  const category = url.searchParams.get("category")?.trim() || "";
  const status = url.searchParams.get("status")?.trim() || "";
  const visibility = url.searchParams.get("visibility")?.trim() || "";
  const department = url.searchParams.get("department")?.trim() || "";
  const owner = url.searchParams.get("owner")?.trim() || "";
  const from = url.searchParams.get("from")?.trim() || "";
  const to = url.searchParams.get("to")?.trim() || "";
  const expiring = url.searchParams.get("expiring") === "true";
  const sort = url.searchParams.get("sort") || "updated_desc";
  const base = await enterpriseDocumentVisibilityWhere({ organizationId, userId: session.userId, canSeeAll: access.canSeeAll });
  const filters: Prisma.EnterpriseDocumentWhereInput[] = [];
  if (search) filters.push({ OR: [{ title: { contains: search, mode: "insensitive" } }, { description: { contains: search, mode: "insensitive" } }] });
  if (type) filters.push({ documentType: type });
  if (category) filters.push({ category: { contains: category, mode: "insensitive" } });
  if (status) filters.push({ status });
  if (visibility) filters.push({ visibility });
  if (department) filters.push({ departmentId: department });
  if (owner) filters.push({ ownerUserId: owner });
  if (from || to) {
    const createdAt: { gte?: Date; lte?: Date } = {};
    if (from) createdAt.gte = new Date(from);
    if (to) createdAt.lte = new Date(to);
    filters.push({ createdAt });
  }
  if (expiring) filters.push({ expiresAt: { gte: new Date(), lte: new Date(Date.now() + 30 * 86400000) } });
  const where: Prisma.EnterpriseDocumentWhereInput = { AND: [base, ...filters] };
  const orderBy: Prisma.EnterpriseDocumentOrderByWithRelationInput = sort === "title_asc" ? { title: "asc" } : sort === "expires_asc" ? { expiresAt: "asc" } : { updatedAt: "desc" };
  const recentSince = new Date(Date.now() - 30 * 86400000);
  const expirySoon = new Date(Date.now() + 30 * 86400000);
  const [items, total, activeCount, recentCount, expiringCount, archivedCount] = await Promise.all([
    prisma.enterpriseDocument.findMany({ where, orderBy, skip: (page - 1) * pageSize, take: pageSize, include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } } }),
    prisma.enterpriseDocument.count({ where }),
    prisma.enterpriseDocument.count({ where: { AND: [base, { status: "ACTIVE" }] } }),
    prisma.enterpriseDocument.count({ where: { AND: [base, { createdAt: { gte: recentSince } }] } }),
    prisma.enterpriseDocument.count({ where: { AND: [base, { expiresAt: { gte: new Date(), lte: expirySoon } }] } }),
    access.canManage ? prisma.enterpriseDocument.count({ where: { organizationId, status: "ARCHIVED" } }) : Promise.resolve(0),
  ]);
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "documents", page } });
  return NextResponse.json({ items, pagination: { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) }, metrics: { active: activeCount, recent: recentCount, expiring: expiringCount, archived: archivedCount }, canManage: access.canManage, currentUserId: session.userId });
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-documents:${session.userId}`), 100, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { organizationId } = await params;
  const access = await getEnterpriseProcurementAccess({ session, organizationId, moduleCode: "DOCUMENTS", action: "submit" });
  if (!access?.canCreate) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = enterpriseDocumentCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Document invalide." }, { status: 400 });
  try {
    const document = await createEnterpriseDocument(organizationId, session.userId, parsed.data);
    await writeAuditLog({ userId: session.userId, action: "ENTERPRISE_DOCUMENT_CREATED", entity: "EnterpriseDocument", entityId: document.id, request: req, metadata: { organizationId, documentType: document.documentType, visibility: document.visibility } });
    await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt, metadata: { organizationId, domain: "documents" } });
    return NextResponse.json({ ok: true, document }, { status: 201 });
  } catch (error) {
    const duplicate = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
    await writeApiLog({ request: req, statusCode: duplicate ? 409 : 400, userId: session.userId, startedAt, metadata: { organizationId, domain: "documents", error: error instanceof Error ? error.message : "unknown" } });
    return NextResponse.json({ error: "Document creation failed", message: duplicate ? "Un document identique existe déjà." : error instanceof Error ? error.message : "Création impossible." }, { status: duplicate ? 409 : 400 });
  }
}
