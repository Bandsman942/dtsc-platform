import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { canAccessPharmacyDocumentRecord } from "@/lib/pharmacy-document-access";
import { logPharmacyDocumentAccess } from "@/lib/pharmacy-documents";
import { prisma } from "@/lib/prisma";
import { downloadPharmacyDocumentFromSupabase } from "@/lib/supabase-storage";

export const runtime = "nodejs";
type Params = { params: Promise<{ organizationId: string; id: string }> };
export async function GET(request: Request, { params }: Params) {
  const startedAt = Date.now(); const session = await getSession(); if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId, id } = await params; const document = await prisma.pharmacyDocument.findFirst({ where: { id, organizationId, status: { not: "DELETED" } } });
  if (!document || !document.storageKey) return NextResponse.json({ error: "Not found", message: "Aucun fichier privé n'est disponible pour ce document." }, { status: 404 });
  if (!(await canAccessPharmacyDocumentRecord(session.userId, organizationId, document.confidentialityLevel, "download"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const file = await downloadPharmacyDocumentFromSupabase(document.storageKey); const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim(); const userAgent = request.headers.get("user-agent") || undefined;
    if (document.sensitiveDownloadAudit || document.confidentialityLevel !== "INTERNAL") await logPharmacyDocumentAccess(organizationId, document.id, session.userId, "DOWNLOAD", ip, userAgent);
    await writeAuditLog({ userId: session.userId, action: "PHARMACY_DOCUMENT_DOWNLOADED", entity: "PharmacyDocument", entityId: document.id, request, metadata: { organizationId, sensitive: document.confidentialityLevel !== "INTERNAL" } });
    await writeApiLog({ request, statusCode: 200, userId: session.userId, startedAt });
    return new NextResponse(file.stream(), { headers: { "Content-Type": document.mimeType || file.type || "application/octet-stream", "Content-Disposition": `attachment; filename="${(document.filename || "document").replaceAll('"', "")}"`, "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Download failed", message: "Téléchargement privé impossible." }, { status: 503 });
  }
}
