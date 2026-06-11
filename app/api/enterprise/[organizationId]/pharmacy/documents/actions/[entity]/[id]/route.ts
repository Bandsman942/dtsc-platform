import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { canAccessPharmacyDocuments, type PharmacyDocumentAction } from "@/lib/pharmacy-document-access";
import { pharmacyDocumentActionSchema, pharmacyDocumentRuleSchema } from "@/lib/pharmacy-document-validators";
import { detectPharmacyDocumentCompliance, transitionPharmacyDocument } from "@/lib/pharmacy-documents";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string; entity: string; id: string }> };
function permission(action: string): PharmacyDocumentAction { return action === "validate" ? "validate" : action === "reject" ? "reject" : action === "archive" ? "archive" : action === "renew" ? "renew" : action === "link" || action === "unlink" ? "link" : action === "detect-compliance" || action === "mark-not-applicable" || action === "resolve-missing" ? "manage_compliance" : "update"; }
export async function PATCH(request: Request, { params }: Params) {
  const startedAt = Date.now(); if (!isSameOriginRequest(request)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession(); if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(request, `pharmacy-document-action:${session.userId}`), 120, 3600000); if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { organizationId, entity, id } = await params; const body = await request.json().catch(() => null);
  try {
    if (entity === "rule") {
      if (!(await canAccessPharmacyDocuments(session.userId, organizationId, "manage_compliance"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      const parsedRule = pharmacyDocumentRuleSchema.safeParse(body); if (!parsedRule.success) return NextResponse.json({ error: "Invalid rule", message: "Règle documentaire invalide." }, { status: 400 });
      const rule = await prisma.pharmacyDocumentComplianceRule.findFirst({ where: { id, organizationId } }); if (!rule) return NextResponse.json({ error: "Not found" }, { status: 404 });
      await prisma.pharmacyDocumentComplianceRule.update({ where: { id }, data: parsedRule.data });
    } else {
      const parsed = pharmacyDocumentActionSchema.safeParse(body); if (!parsed.success) return NextResponse.json({ error: "Invalid action", message: "Action documentaire invalide." }, { status: 400 });
      if (!(await canAccessPharmacyDocuments(session.userId, organizationId, permission(parsed.data.action)))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      if (parsed.data.action === "detect-compliance") await detectPharmacyDocumentCompliance(organizationId, session.userId);
      else if (entity === "missing" && parsed.data.action === "resolve-missing") {
        const resolvedDocumentId = parsed.data.documentId; if (!resolvedDocumentId) throw new Error("DOCUMENT_REQUIRED");
        const document = await prisma.pharmacyDocument.findFirst({ where: { id: resolvedDocumentId, organizationId } }); if (!document) throw new Error("DOCUMENT_NOT_FOUND");
        await prisma.pharmacyMissingDocument.update({ where: { id }, data: { status: "RESOLVED", resolvedByDocumentId: resolvedDocumentId, resolvedAt: new Date() } });
      } else await transitionPharmacyDocument(organizationId, id, session.userId, parsed.data.action, parsed.data.reason?.trim() || undefined, parsed.data.entityType || undefined, parsed.data.entityId || undefined, parsed.data.linkRole || undefined);
    }
    await writeAuditLog({ userId: session.userId, action: `PHARMACY_DOCUMENT_${entity.toUpperCase()}_UPDATED`, entity, entityId: id, request, metadata: { organizationId } }); await writeApiLog({ request, statusCode: 200, userId: session.userId, startedAt }); return NextResponse.json({ ok: true });
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN"; const messages: Record<string, string> = { DOCUMENT_NOT_FOUND: "Le document est introuvable.", DOCUMENT_REQUIRED: "Sélectionnez un document pour résoudre ce manque.", REASON_REQUIRED: "Un motif est obligatoire.", INVALID_REFERENCE: "L'objet lié est invalide.", INVALID_ACTION: "Cette action n'est pas autorisée." };
    return NextResponse.json({ error: code, message: messages[code] || "Action documentaire impossible." }, { status: 400 });
  }
}
