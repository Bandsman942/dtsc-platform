import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { normalizeEnterpriseCoreV2Error } from "@/lib/enterprise/core-v2/errors";
import { getEnterpriseProcurementAccess } from "@/lib/enterprise/procurement/access";
import { updateEnterpriseSupplier } from "@/lib/enterprise/procurement/supplier-service";
import { enterpriseSupplierUpdateSchema } from "@/lib/enterprise/procurement/validators";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string; id: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now(); const session = await getSession(); if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId, id } = await params; const access = await getEnterpriseProcurementAccess({ session, organizationId, moduleCode: "SUPPLIERS_PURCHASES", action: "read" }); if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const supplier = await prisma.enterpriseSupplier.findFirst({ where: { id, organizationId, archivedAt: null }, include: { contacts: { orderBy: [{ isPrimary: "desc" }, { name: "asc" }] }, purchases: { where: { archivedAt: null }, orderBy: { createdAt: "desc" }, take: 20 } } });
  if (!supplier) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const [links, events, comments] = await Promise.all([
    prisma.enterpriseEntityLink.findMany({ where: { organizationId, OR: [{ sourceEntityType: "EnterpriseSupplier", sourceEntityId: id }, { targetEntityType: "EnterpriseSupplier", targetEntityId: id }] }, orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.enterpriseOperationalEvent.findMany({ where: { organizationId, entityType: "EnterpriseSupplier", entityId: id }, orderBy: { createdAt: "desc" }, take: 30 }),
    prisma.enterpriseOperationalComment.findMany({ where: { organizationId, entityType: "EnterpriseSupplier", entityId: id, deletedAt: null }, orderBy: { createdAt: "desc" }, take: 20 }),
  ]);
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "suppliers", supplierId: id } });
  return NextResponse.json({ supplier, links, events, comments, canManage: access.canManage });
}

export async function PATCH(req: Request, { params }: Params) {
  const startedAt = Date.now(); if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession(); if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-supplier-update:${session.userId}`), 120, 60 * 60 * 1000); if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { organizationId, id } = await params; const access = await getEnterpriseProcurementAccess({ session, organizationId, moduleCode: "SUPPLIERS_PURCHASES", action: "write" }); if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = enterpriseSupplierUpdateSchema.safeParse(await req.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Fournisseur invalide." }, { status: 400 });
  try {
    const supplier = await updateEnterpriseSupplier(organizationId, id, session.userId, parsed.data);
    await writeAuditLog({ userId: session.userId, action: "ENTERPRISE_SUPPLIER_UPDATED", entity: "EnterpriseSupplier", entityId: id, request: req, metadata: { organizationId } });
    return NextResponse.json({ ok: true, supplier });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return NextResponse.json({ error: "SUPPLIER_DUPLICATE", message: "Un fournisseur équivalent existe déjà." }, { status: 409 });
    const normalized = normalizeEnterpriseCoreV2Error(error); return NextResponse.json({ error: normalized.code, message: normalized.message }, { status: normalized.status });
  }
}
