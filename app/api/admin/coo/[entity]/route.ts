import { NextResponse } from "next/server";
import { requireAdminBlockAccess } from "@/lib/admin-api";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { cooSchemas } from "@/lib/validators";

type Params = { params: Promise<{ entity: string }> };
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

function parseCooEntity(entity: CooEntity, body: unknown) {
  if (entity === "operations") {
    return cooSchemas.operations.safeParse(body);
  }
  if (entity === "tasks") {
    return cooSchemas.tasks.safeParse(body);
  }
  if (entity === "recurringTasks") {
    return cooSchemas.recurringTasks.safeParse(body);
  }
  if (entity === "departmentRequests") {
    return cooSchemas.departmentRequests.safeParse(body);
  }
  if (entity === "blockers") {
    return cooSchemas.blockers.safeParse(body);
  }
  if (entity === "meetings") {
    return cooSchemas.meetings.safeParse(body);
  }
  if (entity === "workflows") {
    return cooSchemas.workflows.safeParse(body);
  }
  return cooSchemas.reports.safeParse(body);
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { session, response } = await requireAdminBlockAccess("coo");
  if (!session) {
    return response || NextResponse.json({ error: "Forbidden", message: "Accès refusé." }, { status: 403 });
  }

  const { entity } = await params;
  if (!isCooEntity(entity)) {
    await writeApiLog({ request: req, statusCode: 404, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Unknown COO entity", message: "Module COO introuvable." }, { status: 404 });
  }

  const parsed = parseCooEntity(entity, await req.json());
  if (!parsed.success) {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt, metadata: { entity } });
    return NextResponse.json({ error: "Invalid COO payload", message: "Les données COO envoyées sont invalides ou incomplètes." }, { status: 400 });
  }

  try {
    const record = await createRecord(entity, { ...parsed.data, createdById: session.userId });
    await writeAuditLog({
      userId: session.userId,
      action: `COO_${entity.toUpperCase()}_CREATED`,
      entity,
      entityId: record.id,
      request: req,
    });
    await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt, metadata: { entity } });
    return NextResponse.json({ ok: true, record }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Création COO impossible.";
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt, metadata: { entity, message } });
    return NextResponse.json({ error: "COO_RULE_FAILED", message }, { status: 400 });
  }
}

async function createRecord(entity: CooEntity, data: Record<string, unknown>) {
  const enriched = await enrichCooData(entity, data);
  if (entity === "operations") {
    return prisma.cooOperation.create({ data: enriched as never });
  }
  if (entity === "tasks") {
    return prisma.cooTask.create({ data: withClosedAt(enriched) as never });
  }
  if (entity === "recurringTasks") {
    return prisma.cooRecurringTask.create({ data: enriched as never });
  }
  if (entity === "departmentRequests") {
    return prisma.cooDepartmentRequest.create({ data: enriched as never });
  }
  if (entity === "blockers") {
    return prisma.cooBlocker.create({ data: enriched as never });
  }
  if (entity === "meetings") {
    return prisma.cooMeeting.create({ data: enriched as never });
  }
  if (entity === "workflows") {
    return prisma.cooWorkflow.create({ data: enriched as never });
  }
  return prisma.cooOperationalReport.create({ data: enriched as never });
}

async function enrichCooData(entity: CooEntity, data: Record<string, unknown>) {
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

  if (entity === "operations" && enriched.status === "COMPLETED") {
    throw new Error("Une opération doit être créée puis suivie avec ses tâches avant d'être terminée.");
  }

  return enriched;
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
