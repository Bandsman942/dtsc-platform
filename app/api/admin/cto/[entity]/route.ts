import { NextResponse } from "next/server";
import { requireAdminBlockAccess } from "@/lib/admin-api";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { ctoSchemas } from "@/lib/validators";

type Params = { params: Promise<{ entity: string }> };
type CtoEntity = keyof typeof ctoSchemas;

function isCtoEntity(value: string): value is CtoEntity {
  return value === "projects" || value === "records";
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { session, response } = await requireAdminBlockAccess("cto");
  if (!session) {
    return response || NextResponse.json({ error: "Forbidden", message: "Accès CTO refusé." }, { status: 403 });
  }

  const { entity } = await params;
  if (!isCtoEntity(entity)) {
    await writeApiLog({ request: req, statusCode: 404, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Unknown CTO entity", message: "Module CTO introuvable." }, { status: 404 });
  }

  const parsed = ctoSchemas[entity].safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt, metadata: { entity } });
    return NextResponse.json({ error: "Invalid CTO payload", message: "Les données CTO sont invalides." }, { status: 400 });
  }

  try {
    const record = await createRecord(entity, { ...parsed.data, createdById: session.userId });
    await notifyCtoRecipients(entity, record.id, session.userId);
    await writeAuditLog({ userId: session.userId, action: `CTO_${entity.toUpperCase()}_CREATED`, entity, entityId: record.id, request: req });
    await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt, metadata: { entity } });
    return NextResponse.json({ ok: true, record }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Création CTO impossible.";
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt, metadata: { entity, message } });
    return NextResponse.json({ error: "CTO_RULE_FAILED", message }, { status: 400 });
  }
}

async function createRecord(entity: CtoEntity, data: Record<string, unknown>) {
  const enriched = await enrichCtoData(data);
  if (entity === "projects") {
    return prisma.ctoTechnicalProject.create({ data: enriched as never });
  }
  return prisma.ctoTechnicalRecord.create({ data: enriched as never });
}

async function enrichCtoData(data: Record<string, unknown>) {
  const enriched = normalizeEmptyStrings(data);
  for (const [field, nameField] of [
    ["responsibleCtoId", "responsibleCtoName"],
    ["responsibleEmployeeId", "responsibleName"],
    ["assigneeEmployeeId", "assigneeName"],
  ] as const) {
    if (field in enriched) {
      enriched[nameField] = await employeeName(enriched[field]);
    }
  }
  if ("departmentId" in enriched) {
    enriched.departmentName = await departmentName(enriched.departmentId);
  }
  return enriched;
}

async function employeeName(id: unknown) {
  const value = typeof id === "string" ? id.trim() : "";
  if (!value) {
    return null;
  }
  const employee = await prisma.hrcfoEmployee.findFirst({ where: { id: value, status: { not: "EXITED" } }, select: { fullName: true } });
  if (!employee) {
    throw new Error("Le collaborateur sélectionné est introuvable ou sorti.");
  }
  return employee.fullName;
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

function normalizeEmptyStrings(data: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, value === "" ? null : value]));
}

async function notifyCtoRecipients(entity: CtoEntity, recordId: string, senderId: string) {
  const payload = entity === "projects"
    ? await prisma.ctoTechnicalProject.findUnique({
      where: { id: recordId },
      select: { responsibleCtoId: true, title: true, priority: true, status: true },
    }).then((record) => ({ ids: [record?.responsibleCtoId], title: record?.title || "Projet CTO", priority: record?.priority, status: record?.status }))
    : await prisma.ctoTechnicalRecord.findUnique({
      where: { id: recordId },
      select: { responsibleEmployeeId: true, assigneeEmployeeId: true, title: true, priority: true, status: true },
    }).then((record) => ({ ids: [record?.responsibleEmployeeId, record?.assigneeEmployeeId], title: record?.title || "Registre CTO", priority: record?.priority, status: record?.status }));
  await notifyEmployees(payload.ids, senderId, "CTO: nouvel élément technique", `${payload.title} · ${payload.status || ""}`, "CTO_TECH");
  if (payload.priority === "CRITICAL") {
    await notifyPosition("CEO", senderId, "Alerte technique critique", payload.title, "CTO_CRITICAL");
  }
}

async function notifyEmployees(employeeIds: Array<string | null | undefined>, senderId: string, title: string, body: string, type: string) {
  const ids = employeeIds.filter((id): id is string => Boolean(id));
  if (!ids.length) {
    return;
  }
  const employees = await prisma.hrcfoEmployee.findMany({ where: { id: { in: ids } }, select: { userId: true } });
  const recipients = [...new Set(employees.map((employee) => employee.userId).filter((id): id is string => Boolean(id) && id !== senderId))];
  for (const userId of recipients) {
    await prisma.notification.create({ data: { userId, title, body: body.slice(0, 220), type, targetUrl: "/activities" } });
  }
}

async function notifyPosition(positionCode: string, senderId: string, title: string, body: string, type: string) {
  const employees = await prisma.hrcfoEmployee.findMany({ where: { positionCode, status: { not: "EXITED" } }, select: { userId: true } });
  const recipients = [...new Set(employees.map((employee) => employee.userId).filter((id): id is string => Boolean(id) && id !== senderId))];
  for (const userId of recipients) {
    await prisma.notification.create({ data: { userId, title, body: body.slice(0, 220), type, targetUrl: "/activities" } });
  }
}
