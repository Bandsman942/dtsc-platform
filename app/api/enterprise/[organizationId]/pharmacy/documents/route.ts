import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { canAccessPharmacyDocuments } from "@/lib/pharmacy-document-access";
import { pharmacyDocumentMetadataSchema } from "@/lib/pharmacy-document-validators";
import { createPharmacyDocument, getPharmacyDocumentDataset, validatePharmacyDocumentReference } from "@/lib/pharmacy-documents";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";
import { isSupabaseStorageConfigured } from "@/lib/supabase-storage";

export const runtime = "nodejs";
type Params = { params: Promise<{ organizationId: string }> };
const allowedTypes = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"]);
const maxFileSize = 10 * 1024 * 1024;

export async function GET(request: Request, { params }: Params) {
  const startedAt = Date.now(); const session = await getSession(); if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId } = await params; if (!(await canAccessPharmacyDocuments(session.userId, organizationId, "view"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const viewSensitive = await canAccessPharmacyDocuments(session.userId, organizationId, "view_sensitive"); const viewAccessLogs = await canAccessPharmacyDocuments(session.userId, organizationId, "view_access_logs");
  const dataset = await getPharmacyDocumentDataset(organizationId, viewAccessLogs);
  const documents = viewSensitive ? dataset.documents : dataset.documents.filter((item) => !["VERY_CONFIDENTIAL", "MANAGERS_ONLY", "ADMIN_ENTERPRISE", "QUALITY_ONLY", "FINANCIAL", "RESPONSIBLE_PHARMACIST"].includes(item.confidentialityLevel));
  await writeApiLog({ request, statusCode: 200, userId: session.userId, startedAt }); return NextResponse.json({ ...dataset, documents, accessLogs: viewAccessLogs ? dataset.accessLogs : [] });
}

export async function POST(request: Request, { params }: Params) {
  const startedAt = Date.now(); if (!isSameOriginRequest(request)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession(); if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(request, `pharmacy-documents:${session.userId}`), 80, 3600000); if (!limited.ok) return NextResponse.json({ error: "Too many requests", message: "Trop d'actions documentaires." }, { status: 429 });
  const { organizationId } = await params; if (!(await canAccessPharmacyDocuments(session.userId, organizationId, "create"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const formData = await request.formData().catch(() => null); const metadataText = formData?.get("metadata"); const fileValue = formData?.get("file"); const file = fileValue instanceof File && fileValue.size ? fileValue : null;
  const metadata = typeof metadataText === "string" ? await Promise.resolve().then(() => JSON.parse(metadataText) as unknown).catch(() => null) : null; const parsed = pharmacyDocumentMetadataSchema.safeParse(metadata);
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Document invalide." }, { status: 400 });
  if (file && (!allowedTypes.has(file.type) || file.size > maxFileSize)) return NextResponse.json({ error: "Invalid file", message: file.size > maxFileSize ? "Le fichier dépasse 10 Mo." : "Ce format de fichier n'est pas autorisé." }, { status: file.size > maxFileSize ? 413 : 415 });
  if (file && !isSupabaseStorageConfigured()) return NextResponse.json({ error: "Storage unavailable", message: "Le stockage privé n'est pas configuré. Enregistrez uniquement les métadonnées du document." }, { status: 503 });
  const referenceError = await validatePharmacyDocumentReference(organizationId, parsed.data.linkEntityType || undefined, parsed.data.linkEntityId || undefined); if (referenceError) return NextResponse.json({ error: "Invalid reference", message: referenceError }, { status: 400 });
  try {
    const document = await createPharmacyDocument(organizationId, session.userId, parsed.data, file);
    await writeAuditLog({ userId: session.userId, action: "PHARMACY_DOCUMENT_CREATED", entity: "PharmacyDocument", entityId: document.id, request, metadata: { organizationId, documentType: document.documentType, hasFile: Boolean(file) } });
    await writeApiLog({ request, statusCode: 201, userId: session.userId, startedAt }); return NextResponse.json({ ok: true, document }, { status: 201 });
  } catch (error) {
    const duplicate = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
    return NextResponse.json({ error: "Creation failed", message: duplicate ? "Ce numéro ou ce lien documentaire existe déjà." : "Création du document impossible." }, { status: duplicate ? 409 : 400 });
  }
}
