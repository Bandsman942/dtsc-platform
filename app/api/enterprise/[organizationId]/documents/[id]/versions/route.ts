import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { normalizeEnterpriseCoreV2Error } from "@/lib/enterprise/core-v2/errors";
import { canAccessEnterpriseDocument, getEnterpriseProcurementAccess } from "@/lib/enterprise/procurement/access";
import { addEnterpriseDocumentVersion } from "@/lib/enterprise/procurement/document-service";
import { validateEnterpriseDocumentFile } from "@/lib/enterprise/procurement/document-storage";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

export const runtime = "nodejs";
type Params = { params: Promise<{ organizationId: string; id: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId, id } = await params;
  const access = await getEnterpriseProcurementAccess({ session, organizationId, moduleCode: "DOCUMENTS", action: "read" });
  if (!access || !(await canAccessEnterpriseDocument({ organizationId, userId: session.userId, canManage: access.canManage, documentId: id }))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const versions = await prisma.enterpriseDocumentVersion.findMany({ where: { organizationId, documentId: id }, orderBy: { versionNumber: "desc" }, take: 100 });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "documents", documentId: id, view: "versions" } });
  return NextResponse.json({ versions });
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-document-version:${session.userId}`), 60, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { organizationId, id } = await params;
  const access = await getEnterpriseProcurementAccess({ session, organizationId, moduleCode: "DOCUMENTS", action: "write" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const document = await canAccessEnterpriseDocument({ organizationId, userId: session.userId, canManage: access.canManage, documentId: id });
  if (!document || (!access.canManage && document.createdByUserId !== session.userId && document.ownerUserId !== session.userId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const formData = await req.formData().catch(() => null);
  const fileValue = formData?.get("file");
  const revisionValue = Number(formData?.get("revision"));
  if (!(fileValue instanceof File) || !fileValue.size || !Number.isInteger(revisionValue) || revisionValue < 1) return NextResponse.json({ error: "Invalid payload", message: "Fichier et révision valides requis." }, { status: 400 });
  const fileValidation = validateEnterpriseDocumentFile(fileValue);
  if (!fileValidation.ok) return NextResponse.json({ error: "Invalid file", message: fileValidation.message }, { status: fileValidation.status });
  try {
    const version = await addEnterpriseDocumentVersion({ organizationId, documentId: id, actorUserId: session.userId, revision: revisionValue, file: fileValue });
    await writeAuditLog({ userId: session.userId, action: "ENTERPRISE_DOCUMENT_VERSION_UPLOADED", entity: "EnterpriseDocument", entityId: id, request: req, metadata: { organizationId, versionId: version.id, versionNumber: version.versionNumber, mimeType: version.mimeType, sizeBytes: version.sizeBytes } });
    await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt, metadata: { organizationId, domain: "documents", documentId: id, versionId: version.id } });
    return NextResponse.json({ ok: true, version }, { status: 201 });
  } catch (error) {
    const normalized = normalizeEnterpriseCoreV2Error(error);
    const message = error instanceof Error && error.message.startsWith("ENTERPRISE_DOCUMENT_") ? "Le stockage privé n’a pas pu enregistrer cette version." : normalized.message;
    const status = normalized.status === 500 && error instanceof Error && error.message.includes("SUPABASE") ? 503 : normalized.status;
    await writeApiLog({ request: req, statusCode: status, userId: session.userId, startedAt, metadata: { organizationId, domain: "documents", documentId: id, error: error instanceof Error ? error.message : "unknown" } });
    return NextResponse.json({ error: normalized.code, message }, { status });
  }
}
