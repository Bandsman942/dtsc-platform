import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { requireAdminBlockAccess } from "@/lib/admin-api";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { createHrcfoBudget, createPayroll, createValidatedTransaction } from "@/lib/hr-cfo-finance";
import { prisma } from "@/lib/prisma";
import { hrcfoReferenceSchemas, hrcfoSchemas } from "@/lib/validators";

type Params = { params: Promise<{ entity: string }> };
type HrcfoEntity = "employees" | "budgets" | "transactions" | "payrolls" | "departments" | "accounts";

function isHrcfoEntity(value: string): value is HrcfoEntity {
  return value === "employees" || value === "budgets" || value === "transactions" || value === "payrolls" || value === "departments" || value === "accounts";
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { session, response } = await requireAdminBlockAccess("hrCfo");
  if (!session) {
    return response || NextResponse.json({ error: "Forbidden", message: "Accès refusé." }, { status: 403 });
  }

  const { entity } = await params;
  if (!isHrcfoEntity(entity)) {
    await writeApiLog({ request: req, statusCode: 404, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Unknown HR & CFO entity", message: "Module HR & CFO introuvable." }, { status: 404 });
  }

  const rawBody = await req.json();
  const parsed = parseEntity(entity, rawBody);
  if (!parsed.success) {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt, metadata: { entity } });
    return NextResponse.json({ error: "Invalid HR & CFO payload", message: "Les données envoyées sont invalides ou incomplètes." }, { status: 400 });
  }

  try {
    const record = await createRecord(entity, parsed.data as Record<string, unknown>, session.userId);
    await writeAuditLog({
      userId: session.userId,
      action: `HR_CFO_${entity.toUpperCase()}_CREATED`,
      entity,
      entityId: record.id,
      request: req,
    });
    await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt, metadata: { entity } });

    return NextResponse.json({ ok: true, record }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Création impossible.";
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt, metadata: { entity, message } });
    return NextResponse.json({ error: "HR_CFO_RULE_FAILED", message }, { status: 400 });
  }
}

function parseEntity(entity: HrcfoEntity, body: Record<string, unknown>) {
  if (entity === "departments") {
    return hrcfoReferenceSchemas.departments.safeParse(body);
  }
  if (entity === "accounts") {
    return hrcfoReferenceSchemas.accounts.safeParse(body);
  }
  if (entity === "transactions") {
    return hrcfoSchemas.transactions.safeParse({ ...body, category: body.transactionCategory });
  }
  if (entity === "employees") {
    return hrcfoSchemas.employees.safeParse(body);
  }
  if (entity === "budgets") {
    return hrcfoSchemas.budgets.safeParse(body);
  }
  return hrcfoSchemas.payrolls.safeParse(body);
}

async function createRecord(entity: HrcfoEntity, data: Record<string, unknown>, createdById: string) {
  if (entity === "departments") {
    return prisma.department.create({ data: data as never });
  }
  if (entity === "accounts") {
    const openingBalance = Number(data.openingBalance || 0);
    return prisma.financialAccount.create({ data: { ...data, openingBalance, currentBalance: openingBalance } as never });
  }
  if (entity === "employees") {
    const userId = String(data.userId);
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.role === UserRole.CLIENT) {
      throw new Error("Le collaborateur doit être un membre interne non-client.");
    }
    const department = await prisma.department.findUnique({ where: { id: String(data.departmentId) } });
    if (!department || department.status !== "ACTIVE") {
      throw new Error("Le département sélectionné est inactif ou introuvable.");
    }
    const managerUserId = data.managerUserId ? String(data.managerUserId) : undefined;
    const managerEmployee = managerUserId
      ? await prisma.hrcfoEmployee.findFirst({
          where: { userId: managerUserId, status: { not: "EXITED" } },
          include: { user: true },
        })
      : null;
    if (managerUserId && (!managerEmployee || !managerEmployee.user || managerEmployee.user.role === UserRole.CLIENT)) {
      throw new Error("Le responsable doit être un collaborateur DTSC déjà enregistré et actif.");
    }

    return prisma.hrcfoEmployee.create({
      data: {
        userId,
        fullName: user.name,
        email: user.email,
        department: department.name,
        departmentId: department.id,
        jobTitle: String(data.jobTitle),
        contractType: String(data.contractType || "PERMANENT"),
        status: String(data.status || "ACTIVE"),
        startDate: data.startDate as Date | undefined,
        monthlyCompensation: data.monthlyCompensation as number | undefined,
        managerName: managerEmployee?.fullName,
        managerUserId: managerEmployee?.userId,
        skills: data.skills ? String(data.skills) : null,
        kpis: data.kpis ? String(data.kpis) : null,
        complianceStatus: String(data.complianceStatus || "TO_REVIEW"),
        notes: data.notes ? String(data.notes) : null,
        createdById,
      },
    });
  }
  if (entity === "budgets") {
    return createHrcfoBudget({ ...(data as Parameters<typeof createHrcfoBudget>[0]), createdById });
  }
  if (entity === "transactions") {
    const transaction = await createValidatedTransaction({ ...(data as Parameters<typeof createValidatedTransaction>[0]), createdById });
    const saved = await prisma.hrcfoExpense.findUnique({
      where: { id: transaction.id },
      include: { account: true, department: true, budget: true, invoice: true },
    });
    return saved ? {
      ...saved,
      accountName: saved.account?.name,
      departmentName: saved.department?.name,
      budgetName: saved.budget?.name,
      invoiceId: saved.invoice?.id,
    } : transaction;
  }
  const payroll = await createPayroll({ ...(data as Parameters<typeof createPayroll>[0]), createdById });
  const saved = await prisma.hrcfoPayroll.findUnique({
    where: { id: payroll.id },
    include: { employee: true, account: true, budget: true },
  });
  return saved ? {
    ...saved,
    employeeName: saved.employee.fullName,
    accountName: saved.account?.name,
    budgetName: saved.budget?.name,
  } : payroll;
}
