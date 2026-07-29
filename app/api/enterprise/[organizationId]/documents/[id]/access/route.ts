import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { normalizeEnterpriseCoreV2Error } from "@/lib/enterprise/core-v2/errors";
import { canAccessEnterpriseDocument, getEnterpriseProcurementAccess } from "@/lib/enterprise/procurement/access";
import { grantEnterpriseDocumentAccess, revokeEnterpriseDocumentAccess } from "@/lib/enterprise/procurement/document-service";
import { enterpriseDocumentAccessSchema } from "@/lib/enterprise/procurement/validators";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string; id: string }> };

async function mutationContext(req: Request, organizationId: string, id: string) {
  if (!isSameOriginRequest(req)) return { response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  const session = await getSession();
  if (!session) return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-document-access:${session.userId}`), 100, 60 * 60 * 1000);
  if (!limited.ok) return { response: NextResponse.json({ error: "Too many requests" }, { status: 429 }) };
  const access = await getEnterpriseProcurementAccess({ session, organizationId, moduleCode: "DOCUMENTS", action: "write" });
  if (!access) return { response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  const document = await canAccessEnterpriseDocument({ organizationId, userId: session.userId, canManage: access.canManage, documentId: id });
  if (!document || (!access.canManage && document.createdByUserId !== session.userId && document.ownerUserId !== session.userId)) return { response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { session, access, document };
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId, id } = await params;
  const context = await mutationContext(req, organizationId, id);
  if ("response" in context) return context.response;
  const parsed = enterpriseDocumentAccessSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Accès invalide." }, { status: 400 });
  try {
    const grant = await grantEnterpriseDocumentAccess(organizationId, id, context.session.userId, parsed.data.userId, parsed.data.accessLevel);
    await writeAuditLog({ userId: context.session.userId, action: "ENTERPRISE_DOCUMENT_ACCESS_GRANTED", entity: "EnterpriseDocument", entityId: id, request: req, metadata: { organizationId, targetUserId: parsed.data.userId, accessLevel: parsed.data.accessLevel } });
    await writeApiLog({ request: req, statusCode: 200, userId: context.session.userId, startedAt, metadata: { organizationId, domain: "documents", documentId: id } });
    return NextResponse.json({ ok: true, grant });
  } catch (error) {
    const normalized = normalizeEnterpriseCoreV2Error(error);
    return NextResponse.json({ error: normalized.code, message: normalized.message }, { status: normalized.status });
  }
}

export async function DELETE(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId, id } = await params;
  const context = await mutationContext(req, organizationId, id);
  if ("response" in context) return context.response;
  const parsed = enterpriseDocumentAccessSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: "Utilisateur invalide." }, { status: 400 });
  await revokeEnterpriseDocumentAccess(organizationId, id, context.session.userId, parsed.data.userId);
  await writeAuditLog({ userId: context.session.userId, action: "ENTERPRISE_DOCUMENT_ACCESS_REVOKED", entity: "EnterpriseDocument", entityId: id, request: req, metadata: { organizationId, targetUserId: parsed.data.userId } });
  await writeApiLog({ request: req, statusCode: 200, userId: context.session.userId, startedAt, metadata: { organizationId, domain: "documents", documentId: id } });
  return NextResponse.json({ ok: true });
}
