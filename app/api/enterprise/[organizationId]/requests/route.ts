import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { enterpriseRequestVisibilityWhere, getEnterpriseCoreV2Access } from "@/lib/enterprise/core-v2/access";
import { normalizeEnterpriseCoreV2Error } from "@/lib/enterprise/core-v2/errors";
import { createEnterpriseRequest } from "@/lib/enterprise/core-v2/service";
import { enterpriseRequestCreateSchema } from "@/lib/enterprise/core-v2/validators";
import { notifyUser } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string }> };

function pagination(url: URL) {
  const page = Math.max(1, Number(url.searchParams.get("page") || 1) || 1);
  const pageSize = Math.min(50, Math.max(5, Number(url.searchParams.get("pageSize") || 20) || 20));
  return { page, pageSize };
}

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId } = await params;
  const access = await getEnterpriseCoreV2Access({ session, organizationId, moduleCode: "INTERNAL_REQUESTS", action: "read" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const url = new URL(req.url);
  const { page, pageSize } = pagination(url);
  const search = url.searchParams.get("search")?.trim() || "";
  const status = url.searchParams.get("status")?.trim() || "";
  const requestType = url.searchParams.get("type")?.trim() || "";
  const requester = url.searchParams.get("requester")?.trim() || "";
  const department = url.searchParams.get("department")?.trim() || "";
  const priority = url.searchParams.get("priority")?.trim() || "";
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const filters: Prisma.EnterpriseRequestWhereInput[] = [];
  if (search) filters.push({ OR: [{ title: { contains: search, mode: "insensitive" } }, { description: { contains: search, mode: "insensitive" } }, { requestType: { contains: search, mode: "insensitive" } }] });
  if (status) filters.push({ status });
  if (requestType) filters.push({ requestType });
  if (requester) filters.push({ requestedByUserId: requester });
  if (department) filters.push({ departmentId: department });
  if (priority) filters.push({ priority });
  if (from || to) {
    const createdAt: { gte?: Date; lte?: Date } = {};
    if (from) createdAt.gte = new Date(from);
    if (to) createdAt.lte = new Date(to);
    filters.push({ createdAt });
  }
  const where: Prisma.EnterpriseRequestWhereInput = { AND: [enterpriseRequestVisibilityWhere({ organizationId, userId: session.userId, canSeeAll: access.canSeeAll }), ...filters] };
  const [items, total] = await Promise.all([
    prisma.enterpriseRequest.findMany({ where, orderBy: [{ priority: "desc" }, { updatedAt: "desc" }], skip: (page - 1) * pageSize, take: pageSize }),
    prisma.enterpriseRequest.count({ where }),
  ]);
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "requests", page, pageSize } });
  return NextResponse.json({ items, pagination: { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) }, canManage: access.canManage, currentUserId: session.userId });
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-requests:${session.userId}`), 100, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { organizationId } = await params;
  const access = await getEnterpriseCoreV2Access({ session, organizationId, moduleCode: "INTERNAL_REQUESTS", action: "submit" });
  if (!access?.canCreate) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = enterpriseRequestCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Vérifiez les informations de la demande." }, { status: 400 });
  try {
    const data = parsed.data;
    const requestRecord = await createEnterpriseRequest(organizationId, session.userId, {
      requestType: data.requestType,
      title: data.title,
      description: data.description,
      priority: data.priority,
      assignedToUserId: data.assignedToUserId || undefined,
      departmentId: data.departmentId || undefined,
      dueAt: data.dueAt instanceof Date ? data.dueAt : undefined,
      sourceModule: data.sourceModule || undefined,
      sourceEntityType: data.sourceEntityType || undefined,
      sourceEntityId: data.sourceEntityId || undefined,
      initialStatus: "DRAFT",
    });
    if (requestRecord.assignedToUserId && requestRecord.assignedToUserId !== session.userId) {
      await notifyUser({ userId: requestRecord.assignedToUserId, organizationId, type: "ENTERPRISE_REQUEST", title: "Nouvelle demande interne", body: requestRecord.title, targetUrl: "/enterprise-modules/INTERNAL_REQUESTS" });
    }
    await writeAuditLog({ userId: session.userId, action: "ENTERPRISE_REQUEST_CREATED", entity: "EnterpriseRequest", entityId: requestRecord.id, request: req, metadata: { organizationId, requestType: requestRecord.requestType } });
    await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt, metadata: { organizationId, domain: "requests" } });
    return NextResponse.json({ ok: true, request: requestRecord }, { status: 201 });
  } catch (error) {
    const normalized = normalizeEnterpriseCoreV2Error(error);
    await writeApiLog({ request: req, statusCode: normalized.status, userId: session.userId, startedAt, metadata: { organizationId, domain: "requests", error: normalized.code } });
    return NextResponse.json({ error: normalized.code, message: normalized.message }, { status: normalized.status });
  }
}
