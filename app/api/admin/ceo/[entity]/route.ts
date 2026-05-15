import { NextResponse } from "next/server";
import { requireAdminBlockAccess } from "@/lib/admin-api";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { ceoSchemas } from "@/lib/validators";

type Params = { params: Promise<{ entity: string }> };
type CeoEntity = keyof typeof ceoSchemas;

function isCeoEntity(value: string): value is CeoEntity {
  return value === "objectives" || value === "supervisionLogs";
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { session, response } = await requireAdminBlockAccess("ceo");
  if (!session) {
    return response || NextResponse.json({ error: "Forbidden", message: "Accès CEO refusé." }, { status: 403 });
  }

  const { entity } = await params;
  if (!isCeoEntity(entity)) {
    await writeApiLog({ request: req, statusCode: 404, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Unknown CEO entity", message: "Module CEO introuvable." }, { status: 404 });
  }

  const parsed = parseCeoEntity(entity, await req.json().catch(() => null));
  if (!parsed.success) {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt, metadata: { entity } });
    return NextResponse.json({ error: "Invalid CEO payload", message: "Les données CEO sont invalides." }, { status: 400 });
  }

  try {
    const record = await createRecord(entity, parsed.data as Record<string, unknown>, session.userId);
    await notifyCeoRecipients(entity, record.id, session.userId);
    await writeAuditLog({ userId: session.userId, action: `CEO_${entity.toUpperCase()}_CREATED`, entity, entityId: record.id, request: req });
    await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt, metadata: { entity } });
    return NextResponse.json({ ok: true, record }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Création CEO impossible.";
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt, metadata: { entity, message } });
    return NextResponse.json({ error: "CEO_RULE_FAILED", message }, { status: 400 });
  }
}

function parseCeoEntity(entity: CeoEntity, body: unknown) {
  if (entity === "objectives") {
    return ceoSchemas.objectives.safeParse(body);
  }
  return ceoSchemas.supervisionLogs.safeParse(body);
}

async function createRecord(entity: CeoEntity, data: Record<string, unknown>, createdById: string) {
  if (entity === "objectives") {
    const references = await resolveReferences(data.departmentId, data.responsibleEmployeeId);
    return prisma.ceoObjective.create({
      data: {
        title: String(data.title),
        description: textOrNull(data.description),
        objectiveType: String(data.objectiveType || "STRATEGIC"),
        departmentId: references.department?.id,
        departmentName: references.department?.name,
        responsibleEmployeeId: references.employee?.id,
        responsibleName: references.employee?.fullName,
        periodStart: data.periodStart as Date | undefined,
        periodEnd: data.periodEnd as Date | undefined,
        targetValue: data.targetValue as number | undefined,
        currentValue: data.currentValue as number | undefined,
        progress: Number(data.progress || 0),
        status: String(data.status || "PLANNED"),
        priority: String(data.priority || "NORMAL"),
        comments: textOrNull(data.comments),
        createdById,
      },
    });
  }

  const references = await resolveReferences(data.departmentId, data.employeeId);
  const followUp = await resolveEmployee(data.followUpResponsibleId);
  return prisma.ceoSupervisionLog.create({
    data: {
      title: String(data.title),
      entryType: String(data.entryType || "OBSERVATION"),
      description: textOrNull(data.description),
      departmentId: references.department?.id,
      departmentName: references.department?.name,
      employeeId: references.employee?.id,
      employeeName: references.employee?.fullName,
      priority: String(data.priority || "NORMAL"),
      status: String(data.status || "OPEN"),
      logDate: (data.logDate as Date | undefined) || new Date(),
      expectedAction: textOrNull(data.expectedAction),
      followUpResponsibleId: followUp?.id,
      followUpResponsibleName: followUp?.fullName,
      comments: textOrNull(data.comments),
      createdById,
    },
  });
}

async function resolveReferences(departmentId: unknown, employeeId: unknown) {
  const department = departmentId ? await prisma.department.findUnique({ where: { id: String(departmentId) } }) : null;
  if (departmentId && (!department || department.status !== "ACTIVE")) {
    throw new Error("Le département sélectionné est inactif ou introuvable.");
  }
  const employee = await resolveEmployee(employeeId);
  return { department, employee };
}

async function resolveEmployee(employeeId: unknown) {
  if (!employeeId) {
    return null;
  }
  const employee = await prisma.hrcfoEmployee.findFirst({ where: { id: String(employeeId), status: { not: "EXITED" } } });
  if (!employee) {
    throw new Error("Le collaborateur sélectionné est introuvable ou sorti.");
  }
  return employee;
}

function textOrNull(value: unknown) {
  const text = String(value || "").trim();
  return text || null;
}

async function notifyCeoRecipients(entity: CeoEntity, recordId: string, senderId: string) {
  if (entity === "objectives") {
    const objective = await prisma.ceoObjective.findUnique({ where: { id: recordId } });
    if (!objective) {
      return;
    }
    await notifyEmployees([objective.responsibleEmployeeId], senderId, "Nouvel objectif CEO", objective.title, "CEO_OBJECTIVE");
    return;
  }
  const log = await prisma.ceoSupervisionLog.findUnique({ where: { id: recordId } });
  if (!log) {
    return;
  }
  await notifyEmployees([log.employeeId, log.followUpResponsibleId], senderId, "Nouveau suivi CEO", log.title, "CEO_SUPERVISION");
}

async function notifyEmployees(employeeIds: Array<string | null>, senderId: string, title: string, body: string, type: string) {
  const employees = await prisma.hrcfoEmployee.findMany({
    where: { id: { in: employeeIds.filter((id): id is string => Boolean(id)) } },
    select: { userId: true },
  });
  const recipients = [...new Set(employees.map((employee) => employee.userId).filter((id): id is string => Boolean(id) && id !== senderId))];
  for (const userId of recipients) {
    await prisma.notification.create({
      data: {
        userId,
        title,
        body: body.slice(0, 220),
        type,
        targetUrl: "/activities",
      },
    });
  }
}
