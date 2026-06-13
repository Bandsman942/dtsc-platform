import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getHealthConsultationAccess } from "@/lib/health-consultation-access";
import { getHealthPharmacyAccess } from "@/lib/health-pharmacy-access";
import { healthConsultationUpdateSchema } from "@/lib/health-consultation-validators";
import { maskHealthConsultationSensitive, updateHealthConsultation, validateHealthConsultationReferences } from "@/lib/health-consultations";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string; consultationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId, consultationId } = await params;
  const access = await getHealthConsultationAccess({ session, organizationId, action: "read" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const consultation = await prisma.healthConsultation.findFirst({ where: { id: consultationId, organizationId }, include: {
    patient: { select: { id: true, patientNumber: true, fullName: true, phonePrimary: true, sex: true, birthDate: true, knownAllergies: access.canViewSensitive, chronicTreatments: access.canViewSensitive } },
    appointment: { select: { id: true, appointmentNumber: true, appointmentDate: true } }, professional: { select: { id: true, name: true } }, department: { select: { id: true, labelFr: true } },
    createdBy: { select: { name: true } }, updatedBy: { select: { name: true } }, closedBy: { select: { name: true } }, reopenedBy: { select: { name: true } }, cancelledBy: { select: { name: true } },
    events: { orderBy: { createdAt: "desc" }, take: 40, include: { actor: { select: { name: true } } } },
    labRequests: { orderBy: { requestedAt: "desc" }, select: { id: true, labRequestNumber: true, testLabel: true, status: true, priority: true, requestedAt: true, abnormalityLevel: true, resultText: access.canViewSensitive, validatedAt: true } },
  } });
  if (!consultation) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const pharmacyAccess = await getHealthPharmacyAccess({ session, organizationId, action: "read" });
  const pharmacyDispensations = pharmacyAccess ? await prisma.healthPharmacyDispensation.findMany({ where: { organizationId, consultationId, ...(pharmacyAccess.canViewSensitive ? {} : { product: { isSensitive: false } }) }, orderBy: { dispensedAt: "desc" }, take: 30, select: { id: true, quantity: true, dispensedAt: true, billingStatus: true, product: { select: { name: true, productCode: true, unit: true } }, dispensedBy: { select: { name: true } } } }) : [];
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, moduleCode: "CONSULTATIONS" } });
  return NextResponse.json({ consultation: { ...maskHealthConsultationSensitive(consultation, access.canViewSensitive), pharmacyDispensations: pharmacyDispensations.map((item) => ({ ...item, quantity: Number(item.quantity) })) }, permissions: { canUpdate: access.canUpdate, canClose: access.canClose, canReopen: access.canReopen, canCancel: access.canCancel, canViewSensitive: access.canViewSensitive } });
}

export async function PATCH(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `health-consultation-update:${session.userId}`), 100, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { organizationId, consultationId } = await params;
  const access = await getHealthConsultationAccess({ session, organizationId, action: "write" });
  if (!access?.canUpdate || !access.canViewSensitive) return NextResponse.json({ error: "Forbidden", message: "Vous n’avez pas la permission de modifier cette consultation." }, { status: 403 });
  const parsed = healthConsultationUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: "Les modifications de la consultation sont invalides." }, { status: 400 });
  const refs = await validateHealthConsultationReferences(organizationId, parsed.data);
  if (refs.error && parsed.data.patientId) return NextResponse.json({ error: "Invalid reference", message: refs.error }, { status: 400 });
  try {
    const consultation = await updateHealthConsultation(organizationId, consultationId, session.userId, parsed.data);
    if (!consultation) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await writeAuditLog({ userId: session.userId, action: "HEALTH_CONSULTATION_UPDATED", entity: "HealthConsultation", entityId: consultation.id, request: req, metadata: { organizationId } });
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, moduleCode: "CONSULTATIONS" } });
    return NextResponse.json({ ok: true, consultation });
  } catch (error) {
    const message = error instanceof Error && error.message === "CONSULTATION_LOCKED" ? "Une consultation clôturée ou annulée ne peut pas être modifiée sans réouverture autorisée." : "Modification de la consultation impossible.";
    return NextResponse.json({ error: "Update failed", message }, { status: 409 });
  }
}
