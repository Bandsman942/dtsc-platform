import { NextResponse } from "next/server";
import { requireAdminBlockAccess } from "@/lib/admin-api";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { mpoSchemas } from "@/lib/validators";

type Params = { params: Promise<{ entity: string }> };
type MpoEntity = keyof typeof mpoSchemas;

function isMpoEntity(value: string): value is MpoEntity {
  return value === "projects" || value === "records";
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { session, response } = await requireAdminBlockAccess("mpo");
  if (!session) {
    return response || NextResponse.json({ error: "Forbidden", message: "Accès MPO refusé." }, { status: 403 });
  }

  const { entity } = await params;
  if (!isMpoEntity(entity)) {
    await writeApiLog({ request: req, statusCode: 404, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Unknown MPO entity", message: "Module MPO introuvable." }, { status: 404 });
  }

  const parsed = mpoSchemas[entity].safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt, metadata: { entity } });
    return NextResponse.json({ error: "Invalid MPO payload", message: "Les données MPO sont invalides." }, { status: 400 });
  }

  try {
    const record = await createRecord(entity, { ...parsed.data, createdById: session.userId });
    await notifyMpoRecipients(entity, record.id, session.userId);
    await writeAuditLog({ userId: session.userId, action: `MPO_${entity.toUpperCase()}_CREATED`, entity, entityId: record.id, request: req });
    await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt, metadata: { entity } });
    return NextResponse.json({ ok: true, record }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Création MPO impossible.";
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt, metadata: { entity, message } });
    return NextResponse.json({ error: "MPO_RULE_FAILED", message }, { status: 400 });
  }
}

async function createRecord(entity: MpoEntity, data: Record<string, unknown>) {
  const enriched = await enrichMpoData(data);
  if (entity === "projects") {
    return prisma.mpoProject.create({ data: enriched as never });
  }
  return prisma.mpoProjectRecord.create({ data: enriched as never });
}

async function enrichMpoData(data: Record<string, unknown>) {
  const enriched = normalizeEmptyStrings(data);
  for (const [field, nameField] of [
    ["responsibleMpoId", "responsibleMpoName"],
    ["ctoEmployeeId", "ctoEmployeeName"],
    ["cooEmployeeId", "cooEmployeeName"],
    ["hrCfoEmployeeId", "hrCfoEmployeeName"],
    ["scoEmployeeId", "scoEmployeeName"],
    ["ceoEmployeeId", "ceoEmployeeName"],
    ["responsibleEmployeeId", "responsibleName"],
    ["targetEmployeeId", "targetEmployeeName"],
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

async function notifyMpoRecipients(entity: MpoEntity, recordId: string, senderId: string) {
  const employeeIds = entity === "projects"
    ? await prisma.mpoProject.findUnique({
      where: { id: recordId },
      select: { responsibleMpoId: true, ctoEmployeeId: true, cooEmployeeId: true, hrCfoEmployeeId: true, scoEmployeeId: true, ceoEmployeeId: true, title: true, priority: true, status: true },
    }).then((record) => ({ ids: [record?.responsibleMpoId, record?.ctoEmployeeId, record?.cooEmployeeId, record?.hrCfoEmployeeId, record?.scoEmployeeId, record?.ceoEmployeeId], title: record?.title || "Projet MPO", priority: record?.priority, status: record?.status }))
    : await prisma.mpoProjectRecord.findUnique({
      where: { id: recordId },
      select: { responsibleEmployeeId: true, targetEmployeeId: true, title: true, priority: true, status: true },
    }).then((record) => ({ ids: [record?.responsibleEmployeeId, record?.targetEmployeeId], title: record?.title || "Registre MPO", priority: record?.priority, status: record?.status }));
  await notifyEmployees(employeeIds.ids, senderId, "MPO: nouvel élément projet", `${employeeIds.title} · ${employeeIds.status || ""}`, "MPO_PROJECT");
  if (employeeIds.priority === "CRITICAL") {
    await notifyPosition("CEO", senderId, "Alerte projet critique", employeeIds.title, "MPO_CRITICAL");
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
  await notifyUserIds(employees.map((employee) => employee.userId), senderId, title, body, type);
}

async function notifyUserIds(userIds: Array<string | null>, senderId: string, title: string, body: string, type: string) {
  const recipients = [...new Set(userIds.filter((id): id is string => Boolean(id) && id !== senderId))];
  for (const userId of recipients) {
    await prisma.notification.create({ data: { userId, title, body: body.slice(0, 220), type, targetUrl: "/activities" } });
  }
}
