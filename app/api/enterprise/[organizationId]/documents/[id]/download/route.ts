import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { normalizeEnterpriseCoreV2Error } from "@/lib/enterprise/core-v2/errors";
import { canAccessEnterpriseDocument, getEnterpriseProcurementAccess } from "@/lib/enterprise/procurement/access";
import { getEnterpriseDocumentSignedDownload } from "@/lib/enterprise/procurement/document-service";

type Params = { params: Promise<{ organizationId: string; id: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId, id } = await params;
  const access = await getEnterpriseProcurementAccess({ session, organizationId, moduleCode: "DOCUMENTS", action: "read" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const document = await canAccessEnterpriseDocument({ organizationId, userId: session.userId, canManage: access.canManage, documentId: id, forDownload: true });
  if (!document) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const versionId = new URL(req.url).searchParams.get("versionId");
  try {
    const download = await getEnterpriseDocumentSignedDownload(organizationId, id, versionId);
    await writeAuditLog({ userId: session.userId, action: "ENTERPRISE_DOCUMENT_DOWNLOADED", entity: "EnterpriseDocument", entityId: id, request: req, metadata: { organizationId, versionId: download.version.id, versionNumber: download.version.versionNumber } });
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "documents", documentId: id, versionId: download.version.id } });
    return NextResponse.json({ signedUrl: download.signedUrl, expiresInSeconds: download.expiresInSeconds, fileName: download.version.fileName, mimeType: download.version.mimeType });
  } catch (error) {
    const normalized = normalizeEnterpriseCoreV2Error(error);
    const status = normalized.status === 500 ? 503 : normalized.status;
    return NextResponse.json({ error: normalized.code, message: normalized.status === 500 ? "Le téléchargement privé est temporairement indisponible." : normalized.message }, { status });
  }
}
