import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { normalizeEnterpriseCoreV2Error } from "@/lib/enterprise/core-v2/errors";
import { canAccessEnterpriseDocument, getEnterpriseProcurementAccess } from "@/lib/enterprise/procurement/access";
import { archiveEnterpriseDocument, updateEnterpriseDocument } from "@/lib/enterprise/procurement/document-service";
import { enterpriseDocumentArchiveSchema, enterpriseDocumentUpdateSchema } from "@/lib/enterprise/procurement/validators";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string; id: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId, id } = await params;
  const access = await getEnterpriseProcurementAccess({ session, organizationId, moduleCode: "DOCUMENTS", action: "read" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const document = await canAccessEnterpriseDocument({ organizationId, userId: session.userId, canManage: access.canManage, documentId: id });
  if (!document) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const [versions, grants, links, events, comments] = await Promise.all([
    prisma.enterpriseDocumentVersion.findMany({ where: { organizationId, documentId: id }, orderBy: { versionNumber: "desc" }, take: 50 }),
    access.canManage || document.createdByUserId === session.userId || document.ownerUserId === session.userId ? prisma.enterpriseDocumentAccess.findMany({ where: { organizationId, documentId: id }, orderBy: { createdAt: "desc" }, take: 100 }) : Promise.resolve([]),
    prisma.enterpriseEntityLink.findMany({ where: { organizationId, OR: [{ sourceEntityType: "EnterpriseDocument", sourceEntityId: id }, { targetEntityType: "EnterpriseDocument", targetEntityId: id }] }, orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.enterpriseOperationalEvent.findMany({ where: { organizationId, entityType: "EnterpriseDocument", entityId: id }, orderBy: { createdAt: "desc" }, take: 30 }),
    prisma.enterpriseOperationalComment.findMany({ where: { organizationId, entityType: "EnterpriseDocument", entityId: id, deletedAt: null }, orderBy: { createdAt: "desc" }, take: 20 }),
  ]);
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "documents", documentId: id } });
  return NextResponse.json({ document, versions, grants, links, events, comments, canManage: access.canManage, currentUserId: session.userId });
}

export async function PATCH(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-document-update:${session.userId}`), 120, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { organizationId, id } = await params;
  const access = await getEnterpriseProcurementAccess({ session, organizationId, moduleCode: "DOCUMENTS", action: "write" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const current = await canAccessEnterpriseDocument({ organizationId, userId: session.userId, canManage: access.canManage, documentId: id });
  if (!current || (!access.canManage && current.createdByUserId !== session.userId && current.ownerUserId !== session.userId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = enterpriseDocumentUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Document invalide." }, { status: 400 });
  try {
    const document = await updateEnterpriseDocument(organizationId, id, session.userId, parsed.data);
    await writeAuditLog({ userId: session.userId, action: "ENTERPRISE_DOCUMENT_UPDATED", entity: "EnterpriseDocument", entityId: id, request: req, metadata: { organizationId } });
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "documents", documentId: id } });
    return NextResponse.json({ ok: true, document });
  } catch (error) {
    const normalized = normalizeEnterpriseCoreV2Error(error);
    return NextResponse.json({ error: normalized.code, message: normalized.message }, { status: normalized.status });
  }
}

export async function DELETE(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-document-archive:${session.userId}`), 80, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { organizationId, id } = await params;
  const access = await getEnterpriseProcurementAccess({ session, organizationId, moduleCode: "DOCUMENTS", action: "manage" });
  if (!access?.canManage) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = enterpriseDocumentArchiveSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: "Révision documentaire invalide." }, { status: 400 });
  try {
    await archiveEnterpriseDocument(organizationId, id, session.userId, parsed.data.revision);
    await writeAuditLog({ userId: session.userId, action: "ENTERPRISE_DOCUMENT_ARCHIVED", entity: "EnterpriseDocument", entityId: id, request: req, metadata: { organizationId } });
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "documents", documentId: id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const normalized = normalizeEnterpriseCoreV2Error(error);
    return NextResponse.json({ error: normalized.code, message: normalized.message }, { status: normalized.status });
  }
}
