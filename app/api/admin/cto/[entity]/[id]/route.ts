import { NextResponse } from "next/server";
import { requireAdminBlockAccess } from "@/lib/admin-api";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { ctoSchemas } from "@/lib/validators";

type Params = { params: Promise<{ entity: string; id: string }> };
type CtoEntity = keyof typeof ctoSchemas;

function isCtoEntity(value: string): value is CtoEntity {
  return value === "projects" || value === "records";
}

export async function PATCH(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { session, response } = await requireAdminBlockAccess("cto");
  if (!session) {
    return response || NextResponse.json({ error: "Forbidden", message: "Accès CTO refusé." }, { status: 403 });
  }
  const { entity, id } = await params;
  if (!isCtoEntity(entity)) {
    await writeApiLog({ request: req, statusCode: 404, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Unknown CTO entity", message: "Module CTO introuvable." }, { status: 404 });
  }
  const parsed = ctoSchemas[entity].partial().safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt, metadata: { entity, id } });
    return NextResponse.json({ error: "Invalid CTO update", message: "La mise à jour CTO est invalide." }, { status: 400 });
  }

  try {
    const record = await updateRecord(entity, id, parsed.data as Record<string, unknown>);
    await writeAuditLog({ userId: session.userId, action: `CTO_${entity.toUpperCase()}_UPDATED`, entity, entityId: id, request: req });
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { entity, id } });
    return NextResponse.json({ ok: true, record });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Mise à jour CTO impossible.";
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt, metadata: { entity, id, message } });
    return NextResponse.json({ error: "CTO_UPDATE_FAILED", message }, { status: 400 });
  }
}

export async function DELETE(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { session, response } = await requireAdminBlockAccess("cto");
  if (!session) {
    return response || NextResponse.json({ error: "Forbidden", message: "Accès CTO refusé." }, { status: 403 });
  }
  const { entity, id } = await params;
  if (!isCtoEntity(entity)) {
    await writeApiLog({ request: req, statusCode: 404, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Unknown CTO entity", message: "Module CTO introuvable." }, { status: 404 });
  }

  try {
    if (entity === "projects") {
      const linked = await prisma.ctoTechnicalProject.findUnique({ where: { id }, include: { _count: { select: { records: true } } } });
      if (linked?._count.records) {
        throw new Error("Ce projet technique possède des registres liés. Archivez-le ou retirez les liens avant suppression.");
      }
      await prisma.ctoTechnicalProject.delete({ where: { id } });
    } else {
      await prisma.ctoTechnicalRecord.delete({ where: { id } });
    }
    await writeAuditLog({ userId: session.userId, action: `CTO_${entity.toUpperCase()}_DELETED`, entity, entityId: id, request: req });
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { entity, id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Suppression CTO impossible.";
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt, metadata: { entity, id, message } });
    return NextResponse.json({ error: "CTO_DELETE_FAILED", message }, { status: 400 });
  }
}

async function updateRecord(entity: CtoEntity, id: string, data: Record<string, unknown>) {
  const enriched = await enrichCtoData(data);
  if (entity === "projects") {
    return prisma.ctoTechnicalProject.update({ where: { id }, data: enriched as never });
  }
  return prisma.ctoTechnicalRecord.update({ where: { id }, data: enriched as never });
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
