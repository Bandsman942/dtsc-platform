import { NextResponse } from "next/server";
import { requireAdminBlockAccess } from "@/lib/admin-api";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { ceoSchemas } from "@/lib/validators";

type Params = { params: Promise<{ entity: string; id: string }> };
type CeoEntity = keyof typeof ceoSchemas;

function isCeoEntity(value: string): value is CeoEntity {
  return value === "objectives" || value === "supervisionLogs";
}

export async function PATCH(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { session, response } = await requireAdminBlockAccess("ceo");
  if (!session) {
    return response || NextResponse.json({ error: "Forbidden", message: "Accès CEO refusé." }, { status: 403 });
  }
  const { entity, id } = await params;
  if (!isCeoEntity(entity)) {
    await writeApiLog({ request: req, statusCode: 404, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Unknown CEO entity", message: "Module CEO introuvable." }, { status: 404 });
  }

  const parsed = parseCeoPatch(entity, await req.json().catch(() => null));
  if (!parsed.success) {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt, metadata: { entity } });
    return NextResponse.json({ error: "Invalid CEO update", message: "La mise à jour CEO est invalide." }, { status: 400 });
  }

  try {
    const record = await updateRecord(entity, id, parsed.data as Record<string, unknown>);
    await notifyCeoRecipients(entity, id, session.userId);
    await writeAuditLog({ userId: session.userId, action: `CEO_${entity.toUpperCase()}_UPDATED`, entity, entityId: id, metadata: JSON.parse(JSON.stringify(parsed.data)), request: req });
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { entity } });
    return NextResponse.json({ ok: true, record });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Mise à jour CEO impossible.";
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt, metadata: { entity, message } });
    return NextResponse.json({ error: "CEO_UPDATE_FAILED", message }, { status: 400 });
  }
}

function parseCeoPatch(entity: CeoEntity, body: unknown) {
  if (entity === "objectives") {
    return ceoSchemas.objectives.partial().safeParse(body);
  }
  return ceoSchemas.supervisionLogs.partial().safeParse(body);
}

export async function DELETE(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { session, response } = await requireAdminBlockAccess("ceo");
  if (!session) {
    return response || NextResponse.json({ error: "Forbidden", message: "Accès CEO refusé." }, { status: 403 });
  }
  const { entity, id } = await params;
  if (!isCeoEntity(entity)) {
    await writeApiLog({ request: req, statusCode: 404, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Unknown CEO entity", message: "Module CEO introuvable." }, { status: 404 });
  }

  if (entity === "objectives") {
    await prisma.ceoObjective.delete({ where: { id } });
  } else {
    await prisma.ceoSupervisionLog.delete({ where: { id } });
  }
  await writeAuditLog({ userId: session.userId, action: `CEO_${entity.toUpperCase()}_DELETED`, entity, entityId: id, request: req });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { entity } });
  return NextResponse.json({ ok: true });
}

async function updateRecord(entity: CeoEntity, id: string, data: Record<string, unknown>) {
  if (entity === "objectives") {
    const references = await resolveReferences(data.departmentId, data.responsibleEmployeeId);
    return prisma.ceoObjective.update({
      where: { id },
      data: {
        title: data.title ? String(data.title) : undefined,
        description: data.description ? String(data.description) : data.description === "" ? null : undefined,
        objectiveType: data.objectiveType ? String(data.objectiveType) : undefined,
        departmentId: data.departmentId ? references.department?.id : data.departmentId === "" ? null : undefined,
        departmentName: data.departmentId ? references.department?.name : data.departmentId === "" ? null : undefined,
        responsibleEmployeeId: data.responsibleEmployeeId ? references.employee?.id : data.responsibleEmployeeId === "" ? null : undefined,
        responsibleName: data.responsibleEmployeeId ? references.employee?.fullName : data.responsibleEmployeeId === "" ? null : undefined,
        periodStart: data.periodStart as Date | undefined,
        periodEnd: data.periodEnd as Date | undefined,
        targetValue: data.targetValue as number | undefined,
        currentValue: data.currentValue as number | undefined,
        progress: data.progress != null && data.progress !== "" ? Number(data.progress) : undefined,
        status: data.status ? String(data.status) : undefined,
        priority: data.priority ? String(data.priority) : undefined,
        comments: data.comments ? String(data.comments) : data.comments === "" ? null : undefined,
      },
    });
  }

  const references = await resolveReferences(data.departmentId, data.employeeId);
  const followUp = await resolveEmployee(data.followUpResponsibleId);
  return prisma.ceoSupervisionLog.update({
    where: { id },
    data: {
      title: data.title ? String(data.title) : undefined,
      entryType: data.entryType ? String(data.entryType) : undefined,
      description: data.description ? String(data.description) : data.description === "" ? null : undefined,
      departmentId: data.departmentId ? references.department?.id : data.departmentId === "" ? null : undefined,
      departmentName: data.departmentId ? references.department?.name : data.departmentId === "" ? null : undefined,
      employeeId: data.employeeId ? references.employee?.id : data.employeeId === "" ? null : undefined,
      employeeName: data.employeeId ? references.employee?.fullName : data.employeeId === "" ? null : undefined,
      priority: data.priority ? String(data.priority) : undefined,
      status: data.status ? String(data.status) : undefined,
      logDate: data.logDate as Date | undefined,
      expectedAction: data.expectedAction ? String(data.expectedAction) : data.expectedAction === "" ? null : undefined,
      followUpResponsibleId: data.followUpResponsibleId ? followUp?.id : data.followUpResponsibleId === "" ? null : undefined,
      followUpResponsibleName: data.followUpResponsibleId ? followUp?.fullName : data.followUpResponsibleId === "" ? null : undefined,
      comments: data.comments ? String(data.comments) : data.comments === "" ? null : undefined,
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

async function notifyCeoRecipients(entity: CeoEntity, recordId: string, senderId: string) {
  if (entity === "objectives") {
    const objective = await prisma.ceoObjective.findUnique({ where: { id: recordId } });
    if (!objective) {
      return;
    }
    await notifyEmployees([objective.responsibleEmployeeId], senderId, "Objectif CEO mis à jour", objective.title, "CEO_OBJECTIVE");
    return;
  }
  const log = await prisma.ceoSupervisionLog.findUnique({ where: { id: recordId } });
  if (!log) {
    return;
  }
  await notifyEmployees([log.employeeId, log.followUpResponsibleId], senderId, "Suivi CEO mis à jour", log.title, "CEO_SUPERVISION");
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
