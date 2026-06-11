import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { canAccessPharmacyQuality } from "@/lib/pharmacy-quality-access";
import { createQualityIncident, createQualityRelated, getPharmacyQualityDataset, validateQualityReferences } from "@/lib/pharmacy-quality";
import { pharmacyQualityCreateSchema, pharmacyQualityIncidentSchema } from "@/lib/pharmacy-quality-validators";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(request: Request, { params }: Params) {
  const startedAt = Date.now(); const session = await getSession(); if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId } = await params; if (!(await canAccessPharmacyQuality(session.userId, organizationId, "view"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const dataset = await getPharmacyQualityDataset(organizationId); await writeApiLog({ request, statusCode: 200, userId: session.userId, startedAt }); return NextResponse.json(dataset);
}

export async function POST(request: Request, { params }: Params) {
  const startedAt = Date.now(); if (!isSameOriginRequest(request)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession(); if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(request, `pharmacy-quality:${session.userId}`), 100, 3600000); if (!limited.ok) return NextResponse.json({ error: "Too many requests", message: "Trop d'actions qualité." }, { status: 429 });
  const { organizationId } = await params; if (!(await canAccessPharmacyQuality(session.userId, organizationId, "create"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json().catch(() => null); const related = pharmacyQualityCreateSchema.safeParse(body);
  try {
    if (related.success) {
      const record = await createQualityRelated(organizationId, session.userId, related.data);
      await writeAuditLog({ userId: session.userId, action: `PHARMACY_QUALITY_${related.data.entityType.toUpperCase().replaceAll("-", "_")}_CREATED`, entity: related.data.entityType, entityId: record.id, request, metadata: { organizationId, incidentId: related.data.incidentId } });
      await writeApiLog({ request, statusCode: 201, userId: session.userId, startedAt }); return NextResponse.json({ ok: true, record }, { status: 201 });
    }
    const parsed = pharmacyQualityIncidentSchema.safeParse(body); if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Incident invalide." }, { status: 400 });
    const referenceError = await validateQualityReferences(organizationId, parsed.data); if (referenceError) return NextResponse.json({ error: "Invalid reference", message: referenceError }, { status: 400 });
    const record = await createQualityIncident(organizationId, session.userId, parsed.data);
    await writeAuditLog({ userId: session.userId, action: "PHARMACY_QUALITY_INCIDENT_CREATED", entity: "PharmacyQualityIncident", entityId: record.id, request, metadata: { organizationId, incidentType: record.incidentType, criticality: record.criticality } });
    await writeApiLog({ request, statusCode: 201, userId: session.userId, startedAt }); return NextResponse.json({ ok: true, record }, { status: 201 });
  } catch (error) {
    const duplicate = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"; const code = error instanceof Error ? error.message : "UNKNOWN";
    return NextResponse.json({ error: code, message: duplicate ? "Ce numéro existe déjà dans cette pharmacie." : code === "ASSIGNEE_INVALID" ? "Le responsable sélectionné est invalide." : code === "INCIDENT_NOT_FOUND" ? "L'incident est introuvable." : "Création impossible." }, { status: duplicate ? 409 : 400 });
  }
}
