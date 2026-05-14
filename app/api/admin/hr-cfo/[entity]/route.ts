import { NextResponse } from "next/server";
import { requireAdminBlockAccess } from "@/lib/admin-api";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { hrcfoSchemas } from "@/lib/validators";

type Params = { params: Promise<{ entity: string }> };
type HrcfoEntity = keyof typeof hrcfoSchemas;

function isHrcfoEntity(value: string): value is HrcfoEntity {
  return value === "employees" || value === "budgets" || value === "expenses" || value === "invoices";
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { session, response } = await requireAdminBlockAccess("hrCfo");
  if (!session) {
    return response || NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { entity } = await params;
  if (!isHrcfoEntity(entity)) {
    await writeApiLog({ request: req, statusCode: 404, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Unknown HR & CFO entity" }, { status: 404 });
  }

  const parsed = hrcfoSchemas[entity].safeParse(await req.json());
  if (!parsed.success) {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Invalid HR & CFO payload" }, { status: 400 });
  }

  const data = { ...parsed.data, createdById: session.userId };
  const record = await createRecord(entity, data);

  await writeAuditLog({
    userId: session.userId,
    action: `HR_CFO_${entity.toUpperCase()}_CREATED`,
    entity,
    entityId: record.id,
    request: req,
  });
  await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt, metadata: { entity } });

  return NextResponse.json({ ok: true, record }, { status: 201 });
}

async function createRecord(entity: HrcfoEntity, data: Record<string, unknown>) {
  if (entity === "employees") {
    return prisma.hrcfoEmployee.create({ data: data as never });
  }
  if (entity === "budgets") {
    return prisma.hrcfoBudget.create({ data: data as never });
  }
  if (entity === "expenses") {
    return prisma.hrcfoExpense.create({ data: data as never });
  }
  return prisma.hrcfoInvoice.create({ data: data as never });
}
