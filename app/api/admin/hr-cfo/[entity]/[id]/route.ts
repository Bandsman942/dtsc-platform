import { NextResponse } from "next/server";
import { requireAdminBlockAccess } from "@/lib/admin-api";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { operationPatchSchema } from "@/lib/validators";

type Params = { params: Promise<{ entity: string; id: string }> };
type HrcfoEntity = "employees" | "budgets" | "expenses" | "invoices";

function isHrcfoEntity(value: string): value is HrcfoEntity {
  return value === "employees" || value === "budgets" || value === "expenses" || value === "invoices";
}

export async function PATCH(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { session, response } = await requireAdminBlockAccess("hrCfo");
  if (!session) {
    return response || NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { entity, id } = await params;
  if (!isHrcfoEntity(entity)) {
    await writeApiLog({ request: req, statusCode: 404, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Unknown HR & CFO entity" }, { status: 404 });
  }

  const body = operationPatchSchema.safeParse(await req.json());
  if (!body.success) {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Invalid HR & CFO update" }, { status: 400 });
  }

  const record = await updateRecord(entity, id, body.data);
  await writeAuditLog({
    userId: session.userId,
    action: `HR_CFO_${entity.toUpperCase()}_UPDATED`,
    entity,
    entityId: id,
    metadata: body.data,
    request: req,
  });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { entity } });

  return NextResponse.json({ ok: true, record });
}

export async function DELETE(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { session, response } = await requireAdminBlockAccess("hrCfo");
  if (!session) {
    return response || NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { entity, id } = await params;
  if (!isHrcfoEntity(entity)) {
    await writeApiLog({ request: req, statusCode: 404, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Unknown HR & CFO entity" }, { status: 404 });
  }

  await deleteRecord(entity, id);
  await writeAuditLog({
    userId: session.userId,
    action: `HR_CFO_${entity.toUpperCase()}_DELETED`,
    entity,
    entityId: id,
    request: req,
  });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { entity } });

  return NextResponse.json({ ok: true });
}

async function updateRecord(entity: HrcfoEntity, id: string, data: { status?: string; notes?: string }) {
  if (entity === "employees") {
    return prisma.hrcfoEmployee.update({ where: { id }, data });
  }
  if (entity === "budgets") {
    return prisma.hrcfoBudget.update({ where: { id }, data });
  }
  if (entity === "expenses") {
    return prisma.hrcfoExpense.update({ where: { id }, data });
  }
  return prisma.hrcfoInvoice.update({ where: { id }, data });
}

async function deleteRecord(entity: HrcfoEntity, id: string) {
  if (entity === "employees") {
    return prisma.hrcfoEmployee.delete({ where: { id } });
  }
  if (entity === "budgets") {
    return prisma.hrcfoBudget.delete({ where: { id } });
  }
  if (entity === "expenses") {
    return prisma.hrcfoExpense.delete({ where: { id } });
  }
  return prisma.hrcfoInvoice.delete({ where: { id } });
}
