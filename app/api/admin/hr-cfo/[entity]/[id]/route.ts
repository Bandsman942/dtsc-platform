import { NextResponse } from "next/server";
import { requireAdminBlockAccess } from "@/lib/admin-api";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { operationPatchSchema } from "@/lib/validators";

type Params = { params: Promise<{ entity: string; id: string }> };
type HrcfoEntity = "employees" | "budgets" | "transactions" | "payrolls" | "departments" | "accounts";

function isHrcfoEntity(value: string): value is HrcfoEntity {
  return value === "employees" || value === "budgets" || value === "transactions" || value === "payrolls" || value === "departments" || value === "accounts";
}

export async function PATCH(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { session, response } = await requireAdminBlockAccess("hrCfo");
  if (!session) {
    return response || NextResponse.json({ error: "Forbidden", message: "Accès refusé." }, { status: 403 });
  }

  const { entity, id } = await params;
  if (!isHrcfoEntity(entity)) {
    await writeApiLog({ request: req, statusCode: 404, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Unknown HR & CFO entity", message: "Module HR & CFO introuvable." }, { status: 404 });
  }

  const body = operationPatchSchema.safeParse(await req.json());
  if (!body.success) {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Invalid HR & CFO update", message: "La mise à jour demandée est invalide." }, { status: 400 });
  }

  try {
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
  } catch (error) {
    const message = error instanceof Error ? error.message : "Mise à jour impossible.";
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt, metadata: { entity, message } });
    return NextResponse.json({ error: "HR_CFO_UPDATE_FAILED", message }, { status: 400 });
  }
}

export async function DELETE(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { session, response } = await requireAdminBlockAccess("hrCfo");
  if (!session) {
    return response || NextResponse.json({ error: "Forbidden", message: "Accès refusé." }, { status: 403 });
  }

  const { entity, id } = await params;
  if (!isHrcfoEntity(entity)) {
    await writeApiLog({ request: req, statusCode: 404, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Unknown HR & CFO entity", message: "Module HR & CFO introuvable." }, { status: 404 });
  }

  try {
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
  } catch (error) {
    const message = error instanceof Error ? error.message : "Suppression impossible.";
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt, metadata: { entity, message } });
    return NextResponse.json({ error: "HR_CFO_DELETE_FAILED", message }, { status: 400 });
  }
}

async function updateRecord(entity: HrcfoEntity, id: string, data: { status?: string; notes?: string }) {
  if (entity === "departments") {
    return prisma.department.update({ where: { id }, data: { status: data.status, description: data.notes } });
  }
  if (entity === "accounts") {
    return prisma.financialAccount.update({ where: { id }, data: { status: data.status, description: data.notes } });
  }
  if (entity === "employees") {
    return prisma.hrcfoEmployee.update({ where: { id }, data });
  }
  if (entity === "budgets") {
    return prisma.hrcfoBudget.update({ where: { id }, data });
  }
  if (entity === "transactions") {
    const transaction = await prisma.hrcfoExpense.findUnique({ where: { id } });
    if (transaction?.status === "VALIDATED") {
      throw new Error("Une transaction déjà validée ne peut pas être modifiée depuis ce raccourci.");
    }
    return prisma.hrcfoExpense.update({ where: { id }, data });
  }
  return prisma.hrcfoPayroll.update({ where: { id }, data });
}

async function deleteRecord(entity: HrcfoEntity, id: string) {
  if (entity === "departments") {
    const linked = await prisma.department.findUnique({
      where: { id },
      include: { _count: { select: { employees: true, budgets: true, transactions: true } } },
    });
    if (linked && (linked._count.employees || linked._count.budgets || linked._count.transactions)) {
      throw new Error("Ce département est utilisé. Désactivez-le au lieu de le supprimer.");
    }
    return prisma.department.delete({ where: { id } });
  }
  if (entity === "accounts") {
    const linked = await prisma.financialAccount.findUnique({
      where: { id },
      include: { _count: { select: { budgets: true, transactions: true, payrolls: true } } },
    });
    if (linked && (linked._count.budgets || linked._count.transactions || linked._count.payrolls)) {
      throw new Error("Ce compte est utilisé. Désactivez-le au lieu de le supprimer.");
    }
    return prisma.financialAccount.delete({ where: { id } });
  }
  if (entity === "employees") {
    return prisma.hrcfoEmployee.delete({ where: { id } });
  }
  if (entity === "budgets") {
    const linked = await prisma.hrcfoBudget.findUnique({ where: { id }, include: { _count: { select: { transactions: true, payrolls: true } } } });
    if (linked && (linked._count.transactions || linked._count.payrolls)) {
      throw new Error("Ce budget est déjà utilisé par des transactions ou paies.");
    }
    return prisma.hrcfoBudget.delete({ where: { id } });
  }
  if (entity === "transactions") {
    const transaction = await prisma.hrcfoExpense.findUnique({ where: { id } });
    if (transaction?.status === "VALIDATED") {
      throw new Error("Une transaction validée ne peut pas être supprimée.");
    }
    return prisma.hrcfoExpense.delete({ where: { id } });
  }
  const payroll = await prisma.hrcfoPayroll.findUnique({ where: { id } });
  if (payroll?.transactionId || payroll?.status === "VALIDATED" || payroll?.status === "PAID") {
    throw new Error("Une paie validée ou payée ne peut pas être supprimée.");
  }
  return prisma.hrcfoPayroll.delete({ where: { id } });
}
