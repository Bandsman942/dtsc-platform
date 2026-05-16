import { NextResponse } from "next/server";
import { requireAdminBlockAccess } from "@/lib/admin-api";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { mpoSchemas } from "@/lib/validators";

type Params = { params: Promise<{ entity: string; id: string }> };
type MpoEntity = keyof typeof mpoSchemas;

function isMpoEntity(value: string): value is MpoEntity {
  return value === "projects" || value === "records";
}

export async function PATCH(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { session, response } = await requireAdminBlockAccess("mpo");
  if (!session) {
    return response || NextResponse.json({ error: "Forbidden", message: "Accès MPO refusé." }, { status: 403 });
  }
  const { entity, id } = await params;
  if (!isMpoEntity(entity)) {
    await writeApiLog({ request: req, statusCode: 404, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Unknown MPO entity", message: "Module MPO introuvable." }, { status: 404 });
  }

  const parsed = mpoSchemas[entity].partial().safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt, metadata: { entity, id } });
    return NextResponse.json({ error: "Invalid MPO update", message: "La mise à jour MPO est invalide." }, { status: 400 });
  }

  try {
    const record = await updateRecord(entity, id, parsed.data as Record<string, unknown>);
    await writeAuditLog({ userId: session.userId, action: `MPO_${entity.toUpperCase()}_UPDATED`, entity, entityId: id, request: req });
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { entity, id } });
    return NextResponse.json({ ok: true, record });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Mise à jour MPO impossible.";
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt, metadata: { entity, id, message } });
    return NextResponse.json({ error: "MPO_UPDATE_FAILED", message }, { status: 400 });
  }
}

export async function DELETE(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { session, response } = await requireAdminBlockAccess("mpo");
  if (!session) {
    return response || NextResponse.json({ error: "Forbidden", message: "Accès MPO refusé." }, { status: 403 });
  }
  const { entity, id } = await params;
  if (!isMpoEntity(entity)) {
    await writeApiLog({ request: req, statusCode: 404, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Unknown MPO entity", message: "Module MPO introuvable." }, { status: 404 });
  }

  try {
    if (entity === "projects") {
      const linked = await prisma.mpoProject.findUnique({ where: { id }, include: { _count: { select: { records: true, technicalProjects: true, technicalRecords: true } } } });
      if (linked && (linked._count.records || linked._count.technicalProjects || linked._count.technicalRecords)) {
        throw new Error("Ce projet possède des éléments liés. Archivez-le ou retirez les liens avant suppression.");
      }
      await prisma.mpoProject.delete({ where: { id } });
    } else {
      await prisma.mpoProjectRecord.delete({ where: { id } });
    }
    await writeAuditLog({ userId: session.userId, action: `MPO_${entity.toUpperCase()}_DELETED`, entity, entityId: id, request: req });
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { entity, id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Suppression MPO impossible.";
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt, metadata: { entity, id, message } });
    return NextResponse.json({ error: "MPO_DELETE_FAILED", message }, { status: 400 });
  }
}

async function updateRecord(entity: MpoEntity, id: string, data: Record<string, unknown>) {
  const enriched = await enrichMpoData(data);
  if (entity === "projects") {
    return prisma.mpoProject.update({ where: { id }, data: enriched as never });
  }
  return prisma.mpoProjectRecord.update({ where: { id }, data: enriched as never });
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
