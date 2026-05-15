import { NextResponse } from "next/server";
import { requireAdminBlockAccess } from "@/lib/admin-api";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { cooSchemas } from "@/lib/validators";

type Params = { params: Promise<{ entity: string; id: string }> };
type CooEntity = keyof typeof cooSchemas;

function isCooEntity(value: string): value is CooEntity {
  return value === "operations" ||
    value === "tasks" ||
    value === "recurringTasks" ||
    value === "departmentRequests" ||
    value === "blockers" ||
    value === "meetings" ||
    value === "workflows" ||
    value === "reports";
}

function parseCooPatch(entity: CooEntity, body: unknown) {
  if (entity === "operations") {
    return cooSchemas.operations.partial().safeParse(body);
  }
  if (entity === "tasks") {
    return cooSchemas.tasks.partial().safeParse(body);
  }
  if (entity === "recurringTasks") {
    return cooSchemas.recurringTasks.partial().safeParse(body);
  }
  if (entity === "departmentRequests") {
    return cooSchemas.departmentRequests.partial().safeParse(body);
  }
  if (entity === "blockers") {
    return cooSchemas.blockers.partial().safeParse(body);
  }
  if (entity === "meetings") {
    return cooSchemas.meetings.partial().safeParse(body);
  }
  if (entity === "workflows") {
    return cooSchemas.workflows.partial().safeParse(body);
  }
  return cooSchemas.reports.partial().safeParse(body);
}

export async function PATCH(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { session, response } = await requireAdminBlockAccess("coo");
  if (!session) {
    return response || NextResponse.json({ error: "Forbidden", message: "Accès refusé." }, { status: 403 });
  }

  const { entity, id } = await params;
  if (!isCooEntity(entity)) {
    await writeApiLog({ request: req, statusCode: 404, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Unknown COO entity", message: "Module COO introuvable." }, { status: 404 });
  }

  const parsed = parseCooPatch(entity, await req.json());
  if (!parsed.success) {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt, metadata: { entity, id } });
    return NextResponse.json({ error: "Invalid COO payload", message: "Les données COO envoyées sont invalides ou incomplètes." }, { status: 400 });
  }

  try {
    const record = await updateRecord(entity, id, parsed.data as Record<string, unknown>);
    await writeAuditLog({ userId: session.userId, action: `COO_${entity.toUpperCase()}_UPDATED`, entity, entityId: id, request: req });
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { entity, id } });
    return NextResponse.json({ ok: true, record });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Mise à jour COO impossible.";
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt, metadata: { entity, id, message } });
    return NextResponse.json({ error: "COO_RULE_FAILED", message }, { status: 400 });
  }
}

export async function DELETE(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { session, response } = await requireAdminBlockAccess("coo");
  if (!session) {
    return response || NextResponse.json({ error: "Forbidden", message: "Accès refusé." }, { status: 403 });
  }

  const { entity, id } = await params;
  if (!isCooEntity(entity)) {
    await writeApiLog({ request: req, statusCode: 404, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Unknown COO entity", message: "Module COO introuvable." }, { status: 404 });
  }

  try {
    await deleteRecord(entity, id);
    await writeAuditLog({ userId: session.userId, action: `COO_${entity.toUpperCase()}_DELETED`, entity, entityId: id, request: req });
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { entity, id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Suppression COO impossible.";
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt, metadata: { entity, id, message } });
    return NextResponse.json({ error: "COO_DELETE_FAILED", message }, { status: 400 });
  }
}

async function updateRecord(entity: CooEntity, id: string, data: Record<string, unknown>) {
  const enriched = await enrichCooData(data);
  if (entity === "operations") {
    if (enriched.status === "COMPLETED") {
      const openTasks = await prisma.cooTask.count({
        where: { operationId: id, status: { notIn: ["COMPLETED", "VALIDATED", "CANCELED"] } },
      });
      if (openTasks > 0) {
        throw new Error("Toutes les tâches obligatoires doivent être terminées ou validées avant de clôturer l'opération.");
      }
    }
    return prisma.cooOperation.update({ where: { id }, data: enriched as never });
  }
  if (entity === "tasks") {
    return prisma.cooTask.update({ where: { id }, data: withClosedAt(enriched) as never });
  }
  if (entity === "recurringTasks") {
    return prisma.cooRecurringTask.update({ where: { id }, data: enriched as never });
  }
  if (entity === "departmentRequests") {
    return prisma.cooDepartmentRequest.update({ where: { id }, data: enriched as never });
  }
  if (entity === "blockers") {
    return prisma.cooBlocker.update({ where: { id }, data: enriched as never });
  }
  if (entity === "meetings") {
    return prisma.cooMeeting.update({ where: { id }, data: enriched as never });
  }
  if (entity === "workflows") {
    const { shareEmployeeIds, shareInstruction, ...workflowData } = enriched;
    const workflow = await prisma.cooWorkflow.update({ where: { id }, data: workflowData as never });
    await shareWorkflow(id, shareEmployeeIds, shareInstruction, "");
    return { ...workflow, shareCount: countIds(shareEmployeeIds) };
  }
  return prisma.cooOperationalReport.update({ where: { id }, data: enriched as never });
}

async function deleteRecord(entity: CooEntity, id: string) {
  if (entity === "operations") {
    const linked = await prisma.cooOperation.findUnique({
      where: { id },
      include: { _count: { select: { tasks: true, departmentRequests: true, blockers: true, reports: true } } },
    });
    if (linked && (linked._count.tasks || linked._count.departmentRequests || linked._count.blockers || linked._count.reports)) {
      throw new Error("Cette opération possède des éléments liés. Archivez-la ou retirez d'abord les liens.");
    }
    return prisma.cooOperation.delete({ where: { id } });
  }
  if (entity === "tasks") {
    const linked = await prisma.cooTask.findUnique({ where: { id }, include: { _count: { select: { blockers: true } } } });
    if (linked?._count.blockers) {
      throw new Error("Cette tâche possède des blocages liés et ne peut pas être supprimée directement.");
    }
    return prisma.cooTask.delete({ where: { id } });
  }
  if (entity === "recurringTasks") {
    return prisma.cooRecurringTask.delete({ where: { id } });
  }
  if (entity === "departmentRequests") {
    return prisma.cooDepartmentRequest.delete({ where: { id } });
  }
  if (entity === "blockers") {
    return prisma.cooBlocker.delete({ where: { id } });
  }
  if (entity === "meetings") {
    return prisma.cooMeeting.delete({ where: { id } });
  }
  if (entity === "workflows") {
    return prisma.cooWorkflow.delete({ where: { id } });
  }
  return prisma.cooOperationalReport.delete({ where: { id } });
}

async function enrichCooData(data: Record<string, unknown>) {
  const enriched = normalizeEmptyStrings(data);
  if ("pilotDepartmentId" in enriched) {
    enriched.pilotDepartmentName = await departmentName(enriched.pilotDepartmentId);
  }
  if ("departmentId" in enriched) {
    enriched.departmentName = await departmentName(enriched.departmentId);
  }
  if ("requesterDepartmentId" in enriched) {
    enriched.requesterDepartmentName = await departmentName(enriched.requesterDepartmentId);
  }
  if ("targetDepartmentId" in enriched) {
    enriched.targetDepartmentName = await departmentName(enriched.targetDepartmentId);
  }
  if ("leadEmployeeId" in enriched) {
    enriched.leadEmployeeName = await employeeName(enriched.leadEmployeeId);
  }
  if ("responsibleEmployeeId" in enriched) {
    enriched.responsibleName = await employeeName(enriched.responsibleEmployeeId);
  }
  if ("assigneeEmployeeId" in enriched) {
    enriched.assigneeName = await employeeName(enriched.assigneeEmployeeId);
  }
  if ("requesterEmployeeId" in enriched) {
    enriched.requesterName = await employeeName(enriched.requesterEmployeeId);
  }
  if ("targetResponsibleEmployeeId" in enriched) {
    enriched.targetResponsibleName = await employeeName(enriched.targetResponsibleEmployeeId);
  }
  if ("reportOwnerEmployeeId" in enriched) {
    enriched.reportOwnerName = await employeeName(enriched.reportOwnerEmployeeId);
  }
  if ("employeeId" in enriched) {
    enriched.employeeName = await employeeName(enriched.employeeId);
  }
  if ("recipientEmployeeId" in enriched) {
    enriched.recipientName = await employeeName(enriched.recipientEmployeeId);
  }
  return enriched;
}

async function shareWorkflow(workflowId: string, employeeIds: unknown, instruction: unknown, createdById: string) {
  const ids = String(employeeIds || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (!ids.length) {
    return;
  }
  const employees = await prisma.hrcfoEmployee.findMany({
    where: { id: { in: ids }, status: { not: "EXITED" } },
    select: { id: true, fullName: true, userId: true },
  });
  for (const employee of employees) {
    await prisma.cooWorkflowShare.upsert({
      where: { workflowId_employeeId: { workflowId, employeeId: employee.id } },
      update: { instruction: typeof instruction === "string" ? instruction : null, userId: employee.userId },
      create: {
        workflowId,
        employeeId: employee.id,
        employeeName: employee.fullName,
        userId: employee.userId,
        instruction: typeof instruction === "string" ? instruction : null,
        createdById: createdById || null,
      },
    });
    if (employee.userId) {
      await prisma.notification.create({
        data: {
          userId: employee.userId,
          title: "Workflow opérationnel partagé",
          body: "Un workflow COO vient d'être partagé ou mis à jour pour vous.",
          type: "COO_WORKFLOW",
          targetUrl: "/activities",
        },
      });
    }
  }
}

function countIds(value: unknown) {
  return String(value || "").split(",").map((item) => item.trim()).filter(Boolean).length;
}

async function departmentName(id: unknown) {
  const value = typeof id === "string" ? id.trim() : "";
  if (!value) {
    return null;
  }
  const department = await prisma.department.findUnique({ where: { id: value }, select: { name: true, status: true } });
  if (!department || department.status !== "ACTIVE") {
    throw new Error("Le département sélectionné est inactif ou introuvable.");
  }
  return department.name;
}

async function employeeName(id: unknown) {
  const value = typeof id === "string" ? id.trim() : "";
  if (!value) {
    return null;
  }
  const employee = await prisma.hrcfoEmployee.findFirst({ where: { id: value, status: { not: "EXITED" } }, select: { fullName: true } });
  if (!employee) {
    throw new Error("Le collaborateur sélectionné doit être un employé DTSC actif ou suspendu.");
  }
  return employee.fullName;
}

function normalizeEmptyStrings(data: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, value === "" ? null : value]));
}

function withClosedAt(data: Record<string, unknown>) {
  const status = typeof data.status === "string" ? data.status : "";
  if (status === "COMPLETED" || status === "VALIDATED") {
    return { ...data, closedAt: new Date() };
  }
  return data;
}
