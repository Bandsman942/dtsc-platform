import { NextResponse } from "next/server";
import { requireAdminBlockAccess } from "@/lib/admin-api";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { laSchemas } from "@/lib/validators";

type Params = { params: Promise<{ entity: string; id: string }> };
type LaEntity = keyof typeof laSchemas;

function isLaEntity(value: string): value is LaEntity {
  return value === "cases" || value === "contracts" || value === "templates" || value === "risks" || value === "documents" || value === "disputes" || value === "requests" || value === "reports";
}

export async function PATCH(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { session, response } = await requireAdminBlockAccess("la");
  if (!session) {
    return response || NextResponse.json({ error: "Forbidden", message: "Accès LA refusé." }, { status: 403 });
  }
  const { entity, id } = await params;
  if (!isLaEntity(entity)) {
    await writeApiLog({ request: req, statusCode: 404, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Unknown LA entity", message: "Module LA introuvable." }, { status: 404 });
  }

  const parsed = laSchemas[entity].partial().safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt, metadata: { entity, id } });
    return NextResponse.json({ error: "Invalid LA update", message: "La mise à jour juridique est invalide." }, { status: 400 });
  }

  try {
    const record = await updateRecord(entity, id, parsed.data as Record<string, unknown>);
    await writeAuditLog({ userId: session.userId, action: `LA_${entity.toUpperCase()}_UPDATED`, entity, entityId: id, request: req });
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { entity, id } });
    return NextResponse.json({ ok: true, record });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Mise à jour LA impossible.";
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt, metadata: { entity, id, message } });
    return NextResponse.json({ error: "LA_UPDATE_FAILED", message }, { status: 400 });
  }
}

export async function DELETE(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { session, response } = await requireAdminBlockAccess("la");
  if (!session) {
    return response || NextResponse.json({ error: "Forbidden", message: "Accès LA refusé." }, { status: 403 });
  }
  const { entity, id } = await params;
  if (!isLaEntity(entity)) {
    await writeApiLog({ request: req, statusCode: 404, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Unknown LA entity", message: "Module LA introuvable." }, { status: 404 });
  }

  try {
    await deleteRecord(entity, id);
    await writeAuditLog({ userId: session.userId, action: `LA_${entity.toUpperCase()}_DELETED`, entity, entityId: id, request: req });
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { entity, id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Suppression LA impossible.";
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt, metadata: { entity, id, message } });
    return NextResponse.json({ error: "LA_DELETE_FAILED", message }, { status: 400 });
  }
}

async function updateRecord(entity: LaEntity, id: string, data: Record<string, unknown>) {
  const enriched = await enrichLegalData(data);
  if (entity === "cases") {
    return prisma.legalCase.update({ where: { id }, data: enriched as never });
  }
  if (entity === "contracts") {
    return prisma.legalContract.update({ where: { id }, data: enriched as never });
  }
  if (entity === "templates") {
    return prisma.legalTemplate.update({ where: { id }, data: enriched as never });
  }
  if (entity === "risks") {
    return prisma.legalRisk.update({ where: { id }, data: enriched as never });
  }
  if (entity === "documents") {
    return prisma.legalDocument.update({ where: { id }, data: enriched as never });
  }
  if (entity === "disputes") {
    return prisma.legalDispute.update({ where: { id }, data: enriched as never });
  }
  if (entity === "requests") {
    return prisma.legalRequest.update({ where: { id }, data: enriched as never });
  }
  return prisma.legalReport.update({ where: { id }, data: enriched as never });
}

async function deleteRecord(entity: LaEntity, id: string) {
  if (entity === "cases") {
    const linkedContracts = await prisma.legalContract.count({ where: { legalCaseId: id } });
    const linkedDocuments = await prisma.legalDocument.count({ where: { legalCaseId: id } });
    if (linkedContracts || linkedDocuments) {
      throw new Error("Ce dossier possède des contrats ou documents liés. Archivez-le avant suppression.");
    }
    await prisma.legalCase.delete({ where: { id } });
    return;
  }
  if (entity === "contracts") {
    await prisma.legalContract.delete({ where: { id } });
    return;
  }
  if (entity === "templates") {
    await prisma.legalTemplate.delete({ where: { id } });
    return;
  }
  if (entity === "risks") {
    await prisma.legalRisk.delete({ where: { id } });
    return;
  }
  if (entity === "documents") {
    await prisma.legalDocument.delete({ where: { id } });
    return;
  }
  if (entity === "disputes") {
    await prisma.legalDispute.delete({ where: { id } });
    return;
  }
  if (entity === "requests") {
    await prisma.legalRequest.delete({ where: { id } });
    return;
  }
  await prisma.legalReport.delete({ where: { id } });
}

async function enrichLegalData(data: Record<string, unknown>) {
  const enriched = normalizeEmptyStrings(data);
  for (const [field, nameField] of [
    ["requesterEmployeeId", "requesterName"],
    ["responsibleLegalId", "responsibleLegalName"],
    ["internalResponsibleId", "internalResponsibleName"],
    ["authorId", "authorName"],
    ["responsibleEmployeeId", "responsibleName"],
    ["followUpResponsibleId", "followUpResponsibleName"],
  ] as const) {
    if (field in enriched) {
      enriched[nameField] = await employeeName(enriched[field]);
    }
  }
  for (const [field, nameField] of [
    ["requesterDepartmentId", "requesterDepartmentName"],
    ["departmentId", "departmentName"],
  ] as const) {
    if (field in enriched) {
      enriched[nameField] = await departmentName(enriched[field]);
    }
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
