import { z } from "zod";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { canAccessEnterpriseDocument, getEnterpriseProcurementAccess } from "@/lib/enterprise/procurement/access";
import { createEnterpriseLink } from "@/lib/enterprise/procurement/shared";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string; id: string }> };

const targetSchema = z.object({
  targetEntityType: z.enum([
    "EnterpriseContract",
    "EnterpriseProject",
    "EnterpriseAsset",
    "EnterpriseTask",
    "EnterpriseRequest",
    "EnterpriseApproval",
    "EnterpriseMeeting",
    "EnterpriseSupplier",
    "EnterprisePurchase",
  ]),
  targetEntityId: z.string().trim().min(1).max(180),
  label: z.string().trim().max(240).optional().or(z.literal("")),
});

function targetModule(type: z.infer<typeof targetSchema>["targetEntityType"]) {
  if (type === "EnterpriseContract") return "CONTRACTS";
  if (type === "EnterpriseProject") return "PROJECTS_SERVICES";
  if (type === "EnterpriseAsset") return "ASSETS_MAINTENANCE";
  if (type === "EnterpriseTask") return "TASKS_OPERATIONS";
  if (type === "EnterpriseRequest") return "INTERNAL_REQUESTS";
  if (type === "EnterpriseApproval") return "VALIDATIONS";
  if (type === "EnterpriseMeeting") return "MEETINGS";
  return "SUPPLIERS_PURCHASES";
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-document-link:${session.userId}`), 100, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { organizationId, id } = await params;
  const access = await getEnterpriseProcurementAccess({ session, organizationId, moduleCode: "DOCUMENTS", action: "write" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const document = await canAccessEnterpriseDocument({ organizationId, userId: session.userId, canManage: access.canManage, documentId: id });
  if (!document || (!access.canManage && document.createdByUserId !== session.userId && document.ownerUserId !== session.userId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = targetSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Lien invalide." }, { status: 400 });
  try {
    const link = await prisma.$transaction((tx) => createEnterpriseLink(tx, {
      organizationId,
      sourceModule: "DOCUMENTS",
      sourceEntityType: "EnterpriseDocument",
      sourceEntityId: id,
      targetModule: targetModule(parsed.data.targetEntityType),
      targetEntityType: parsed.data.targetEntityType,
      targetEntityId: parsed.data.targetEntityId,
      linkType: "DOCUMENT",
      label: parsed.data.label || null,
      createdById: session.userId,
    }));
    await writeAuditLog({ userId: session.userId, action: "ENTERPRISE_DOCUMENT_LINK_CREATED", entity: "EnterpriseDocument", entityId: id, request: req, metadata: { organizationId, targetEntityType: parsed.data.targetEntityType, targetEntityId: parsed.data.targetEntityId } });
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "documents", documentId: id, targetEntityType: parsed.data.targetEntityType } });
    return NextResponse.json({ ok: true, link });
  } catch (error) {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt, metadata: { organizationId, domain: "documents", documentId: id, error: error instanceof Error ? error.message : "unknown" } });
    return NextResponse.json({ error: "DOCUMENT_LINK_FAILED", message: error instanceof Error ? error.message : "Impossible de créer ce lien." }, { status: 400 });
  }
}
