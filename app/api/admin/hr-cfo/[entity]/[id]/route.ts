import { NextResponse } from "next/server";
import { requireAdminBlockAccess } from "@/lib/admin-api";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { normalizePositionCode } from "@/lib/business-roles";
import { deleteHrcfoTransaction, updateHrcfoTransaction, updatePayroll } from "@/lib/hr-cfo-finance";
import { prisma } from "@/lib/prisma";
import { hrcfoReferenceSchemas, hrcfoSchemas } from "@/lib/validators";

type Params = { params: Promise<{ entity: string; id: string }> };
type HrcfoEntity = "employees" | "budgets" | "transactions" | "payrolls" | "departments" | "accounts" | "positions";

function isHrcfoEntity(value: string): value is HrcfoEntity {
  return value === "employees" || value === "budgets" || value === "transactions" || value === "payrolls" || value === "departments" || value === "accounts" || value === "positions";
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

  const rawBody = await req.json();
  const body = parsePatch(entity, rawBody);
  if (!body.success) {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Invalid HR & CFO update", message: "La mise à jour demandée est invalide." }, { status: 400 });
  }

  try {
    const record = await updateRecord(entity, id, body.data as Record<string, unknown>);
    await writeAuditLog({
      userId: session.userId,
      action: `HR_CFO_${entity.toUpperCase()}_UPDATED`,
      entity,
      entityId: id,
      metadata: JSON.parse(JSON.stringify(body.data)),
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

function parsePatch(entity: HrcfoEntity, body: Record<string, unknown>) {
  if (entity === "departments") {
    return hrcfoReferenceSchemas.departments.partial().safeParse(body);
  }
  if (entity === "accounts") {
    return hrcfoReferenceSchemas.accounts.partial().safeParse(body);
  }
  if (entity === "positions") {
    const payload = typeof body === "object" && body ? { ...(body as Record<string, unknown>) } : {};
    if (payload.code) {
      payload.code = normalizePositionCode(payload.code);
    }
    return hrcfoReferenceSchemas.positions.partial().safeParse(payload);
  }
  if (entity === "transactions") {
    return hrcfoSchemas.transactions.partial().safeParse({ ...body, category: body.transactionCategory });
  }
  if (entity === "employees") {
    return hrcfoSchemas.employees.partial().safeParse(body);
  }
  if (entity === "budgets") {
    return hrcfoSchemas.budgets.partial().safeParse(body);
  }
  return hrcfoSchemas.payrolls.partial().safeParse(body);
}

async function updateRecord(entity: HrcfoEntity, id: string, data: Record<string, unknown>) {
  if (entity === "departments") {
    return prisma.department.update({ where: { id }, data: data as never });
  }
  if (entity === "accounts") {
    return prisma.financialAccount.update({ where: { id }, data: data as never });
  }
  if (entity === "positions") {
    const departmentId = data.departmentId ? String(data.departmentId) : undefined;
    const department = departmentId ? await prisma.department.findUnique({ where: { id: departmentId } }) : null;
    if (departmentId && (!department || department.status !== "ACTIVE")) {
      throw new Error("Le département associé au poste est inactif ou introuvable.");
    }
    const updateData = {
      title: data.title ? String(data.title) : undefined,
      code: data.code ? normalizePositionCode(data.code) : undefined,
      description: data.description ? String(data.description) : null,
      departmentId: departmentId ? department?.id : data.departmentId === "" ? null : undefined,
      departmentName: departmentId ? department?.name : data.departmentId === "" ? null : undefined,
      hierarchyLevel: data.hierarchyLevel != null && data.hierarchyLevel !== "" ? Number(data.hierarchyLevel) : undefined,
      status: data.status ? String(data.status) : undefined,
      permissions: data.permissions ? String(data.permissions) : null,
    };
    const position = await prisma.dtscPosition.update({ where: { id }, data: updateData });
    if (data.title || data.code) {
      await prisma.hrcfoEmployee.updateMany({
        where: { positionId: id },
        data: { jobTitle: position.title, positionTitle: position.title, positionCode: position.code },
      });
    }
    return position;
  }
  if (entity === "employees") {
    const departmentId = data.departmentId ? String(data.departmentId) : undefined;
    const department = departmentId ? await prisma.department.findUnique({ where: { id: departmentId } }) : null;
    if (departmentId && (!department || department.status !== "ACTIVE")) {
      throw new Error("Le département sélectionné est inactif ou introuvable.");
    }
    const managerUserId = data.managerUserId ? String(data.managerUserId) : undefined;
    const managerEmployee = managerUserId
      ? await prisma.hrcfoEmployee.findFirst({ where: { userId: managerUserId, status: { not: "EXITED" } } })
      : null;
    if (managerUserId && !managerEmployee) {
      throw new Error("Le responsable doit être un collaborateur DTSC déjà enregistré et actif.");
    }
    const positionId = data.positionId ? String(data.positionId) : undefined;
    const position = positionId ? await prisma.dtscPosition.findUnique({ where: { id: positionId } }) : null;
    if (positionId && (!position || position.status !== "ACTIVE")) {
      throw new Error("Le poste sélectionné est inactif ou introuvable.");
    }
    const updateData = {
      department: department?.name,
      departmentId: department?.id,
      jobTitle: position?.title,
      positionId: position?.id,
      positionCode: position?.code,
      positionTitle: position?.title,
      contractType: data.contractType ? String(data.contractType) : undefined,
      status: data.status ? String(data.status) : undefined,
      startDate: data.startDate as Date | undefined,
      monthlyCompensation: data.monthlyCompensation as number | undefined,
      managerName: managerEmployee?.fullName || null,
      managerUserId: managerEmployee?.userId || null,
      skills: data.skills ? String(data.skills) : null,
      kpis: data.kpis ? String(data.kpis) : null,
      complianceStatus: data.complianceStatus ? String(data.complianceStatus) : undefined,
      notes: data.notes ? String(data.notes) : null,
    };
    return prisma.hrcfoEmployee.update({ where: { id }, data: updateData });
  }
  if (entity === "budgets") {
    const departmentId = data.departmentId ? String(data.departmentId) : undefined;
    const department = departmentId ? await prisma.department.findUnique({ where: { id: departmentId } }) : null;
    const updateData = { ...data, ownerDepartment: department?.name } as Record<string, unknown>;
    return prisma.hrcfoBudget.update({ where: { id }, data: updateData as never });
  }
  if (entity === "transactions") {
    return updateHrcfoTransaction(id, data);
  }
  return updatePayroll(id, data);
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
  if (entity === "positions") {
    const linked = await prisma.dtscPosition.findUnique({
      where: { id },
      include: { _count: { select: { employees: true } } },
    });
    if (linked && linked._count.employees) {
      throw new Error("Ce poste est déjà utilisé. Désactivez-le au lieu de le supprimer.");
    }
    return prisma.dtscPosition.delete({ where: { id } });
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
    return deleteHrcfoTransaction(id);
  }
  const payroll = await prisma.hrcfoPayroll.findUnique({ where: { id } });
  if (payroll?.transactionId || payroll?.status === "VALIDATED" || payroll?.status === "PAID") {
    throw new Error("Une paie validée ou payée ne peut pas être supprimée.");
  }
  return prisma.hrcfoPayroll.delete({ where: { id } });
}
