/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { getHealthQualityAccess } from "@/lib/health-quality-access";
import { createHealthQualityIncident } from "@/lib/health-quality";
import { healthQualityIncidentCreateSchema } from "@/lib/health-quality-validators";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string }> };
const openActionStatuses = ["TODO", "IN_PROGRESS", "WAITING_VALIDATION", "REJECTED"];

export async function GET(_: Request, { params }: Params) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId } = await params;
  const access = await getHealthQualityAccess({ session, organizationId, action: "read" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const scope: any[] = [];
  if (!access.canViewAll) scope.push({ OR: [{ reportedById: session.userId }, { createdById: session.userId }, { assignedToId: session.userId }, { correctiveActions: { some: { responsibleUserId: session.userId } } }] });
  if (!access.canViewConfidential) scope.push({ OR: [{ confidentialityIncident: false, restrictedAccess: false }, { reportedById: session.userId }, { assignedToId: session.userId }] });
  const incidents = await prisma.healthQualityIncident.findMany({ where: { organizationId, AND: scope }, orderBy: { reportedAt: "desc" }, take: 500, include: { correctiveActions: { orderBy: { dueDate: "asc" } }, events: { orderBy: { createdAt: "desc" }, take: 40 } } });
  const [patients, appointments, consultations, medicalRecords, labs, dispensations, movements, invoices, coverages, staff, departments, members] = await Promise.all([
    prisma.healthPatient.findMany({ where: { organizationId, status: "ACTIVE" }, select: { id: true, patientNumber: true, fullName: true } }),
    prisma.healthAppointment.findMany({ where: { organizationId, status: { not: "CANCELLED" } }, select: { id: true, patientId: true, appointmentNumber: true } }),
    prisma.healthConsultation.findMany({ where: { organizationId, status: { not: "CANCELLED" } }, select: { id: true, patientId: true, consultationNumber: true } }),
    prisma.healthMedicalRecord.findMany({ where: { organizationId, status: "ACTIVE" }, select: { id: true, patientId: true, recordNumber: true } }),
    prisma.healthLabRequest.findMany({ where: { organizationId, status: { not: "CANCELLED" } }, select: { id: true, patientId: true, labRequestNumber: true, testLabel: true } }),
    prisma.healthPharmacyDispensation.findMany({ where: { organizationId }, select: { id: true, patientId: true, product: { select: { name: true } } } }),
    prisma.healthPharmacyStockMovement.findMany({ where: { organizationId }, select: { id: true, patientId: true, movementType: true, reason: true, product: { select: { name: true } } }, take: 300, orderBy: { movementDate: "desc" } }),
    prisma.healthMedicalInvoice.findMany({ where: { organizationId, status: { not: "CANCELLED" } }, select: { id: true, patientId: true, invoiceNumber: true } }),
    prisma.healthCoverageRequest.findMany({ where: { organizationId }, select: { id: true, patientId: true, coverageRequestNumber: true } }),
    prisma.healthStaffAssignment.findMany({ where: { organizationId, status: "ACTIVE" }, select: { id: true, userId: true, user: { select: { name: true } }, enterprisePosition: { select: { labelFr: true } } } }),
    prisma.enterpriseDepartment.findMany({ where: { organizationId, isActive: true }, select: { id: true, labelFr: true } }),
    prisma.organizationMember.findMany({ where: { organizationId, status: "ACTIVE", removedAt: null }, select: { userId: true, user: { select: { name: true, email: true } } } }),
  ]);
  const clean = incidents.map((incident) => access.canViewSensitive || incident.reportedById === session.userId || incident.assignedToId === session.userId ? incident : { ...incident, internalNotes: null, witnesses: null, confidentialityReason: null, investigationSummary: null, immediateCause: null, rootCause: null, contributingFactors: null, investigationConclusion: null, recommendations: null });
  const now = Date.now(), month = new Date().getMonth(), year = new Date().getFullYear();
  const metrics = {
    open: incidents.filter((item) => !["CLOSED", "ARCHIVED", "CANCELLED", "REJECTED"].includes(item.status)).length,
    critical: incidents.filter((item) => (item.confirmedCriticality || item.initialCriticality) === "CRITICAL").length,
    month: incidents.filter((item) => item.reportedAt.getMonth() === month && item.reportedAt.getFullYear() === year).length,
    patient: incidents.filter((item) => item.patientId).length,
    confidentiality: incidents.filter((item) => item.confidentialityIncident).length,
    investigation: incidents.filter((item) => item.status === "IN_INVESTIGATION").length,
    overdueActions: incidents.flatMap((item) => item.correctiveActions).filter((item) => openActionStatuses.includes(item.status) && item.dueDate.getTime() < now).length,
    closedMonth: incidents.filter((item) => item.closedAt?.getMonth() === month && item.closedAt?.getFullYear() === year).length,
  };
  const permissions = { canViewAll: access.canViewAll, canViewSensitive: access.canViewSensitive, canViewConfidential: access.canViewConfidential, canCreate: access.canCreate, canUpdate: access.canUpdate, canQualify: access.canQualify, canAssign: access.canAssign, canInvestigate: access.canInvestigate, canClose: access.canClose, canReopen: access.canReopen, canArchive: access.canArchive, canManageActions: access.canManageActions, canValidateActions: access.canValidateActions, canViewReports: access.canViewReports };
  return NextResponse.json({ incidents: clean, metrics, patients, appointments, consultations, medicalRecords, labs, dispensations, movements, invoices, coverages, staff, departments, members, currentUserId: session.userId, permissions });
}

export async function POST(req: Request, { params }: Params) {
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `health-quality-create:${session.userId}`), 50, 3600000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests", message: "Trop de signalements sur une courte période." }, { status: 429 });
  const { organizationId } = await params;
  const access = await getHealthQualityAccess({ session, organizationId, action: "submit" });
  if (!access?.canCreate) return NextResponse.json({ error: "Forbidden", message: "Vous n’avez pas la permission de signaler un incident." }, { status: 403 });
  const parsed = healthQualityIncidentCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: "Vérifiez le titre, la description, la gravité et les références sélectionnées." }, { status: 400 });
  if ((parsed.data.restrictedAccess || parsed.data.confidentialityIncident) && !access.canViewConfidential) return NextResponse.json({ error: "Forbidden", message: "Seuls les rôles autorisés peuvent classifier directement un incident comme confidentiel." }, { status: 403 });
  try {
    const record = await createHealthQualityIncident(organizationId, session.userId, parsed.data);
    await writeAuditLog({ userId: session.userId, action: "HEALTH_QUALITY_INCIDENT_REPORTED", entity: "HealthQualityIncident", entityId: record.id, request: req, metadata: { organizationId, incidentType: record.incidentType, criticality: record.initialCriticality } });
    return NextResponse.json({ ok: true, record, message: "Incident signalé avec succès." }, { status: 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "FAILED";
    return NextResponse.json({ error: code, message: code === "PATIENT_MISMATCH" ? "Les éléments liés ne correspondent pas au patient sélectionné." : "Une référence sélectionnée n’appartient pas à cette entreprise." }, { status: 409 });
  }
}
