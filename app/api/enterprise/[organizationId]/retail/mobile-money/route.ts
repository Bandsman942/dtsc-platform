import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { prepareCommercialMobileMoney } from "@/lib/enterprise/retail/commercial-guardrails";
import { authorizeRetailRequest, retailErrorResponse, retailListParams } from "@/lib/enterprise/retail/http";
import { mobileMoneyCreateSchema } from "@/lib/enterprise/retail/schemas";
import { createMobileMoneyTransaction } from "@/lib/enterprise/retail/service";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "MOBILE_MONEY_AGENCY", "read");
  if (!auth.ok) return auth.response;
  const { page, pageSize, status, providerCode, search, from, to } = retailListParams(req);
  const where: Prisma.EnterpriseMobileMoneyTransactionWhereInput = {
    organizationId,
    ...(status ? { status } : {}),
    ...(providerCode ? { providerCode } : {}),
    ...(from || to ? { occurredAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    ...(search ? { OR: [{ number: { contains: search, mode: "insensitive" } }, { externalReference: { contains: search, mode: "insensitive" } }, { customerPhone: { contains: search } }] } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.enterpriseMobileMoneyTransaction.findMany({ where, orderBy: { occurredAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.enterpriseMobileMoneyTransaction.count({ where }),
  ]);
  const masked = items.map((item) => ({ ...item, customerPhone: item.customerPhone.length > 6 ? `${item.customerPhone.slice(0, 4)}••••${item.customerPhone.slice(-3)}` : item.customerPhone }));
  await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "mobile-money", page } });
  return NextResponse.json({ items: masked, pagination: { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) } });
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "MOBILE_MONEY_AGENCY", "submit", { mutation: true, limit: 300 });
  if (!auth.ok) return auth.response;
  const parsed = mobileMoneyCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Opération Mobile Money invalide." }, { status: 400 });
  try {
    const guarded = await prepareCommercialMobileMoney(organizationId, parsed.data);
    const result = await createMobileMoneyTransaction(organizationId, auth.session.userId, guarded);
    await writeAuditLog({ userId: auth.session.userId, action: "ENTERPRISE_MOBILE_MONEY_CONFIRMED", entity: "EnterpriseMobileMoneyTransaction", entityId: result.transaction.id, request: req, metadata: { organizationId, number: result.transaction.number, providerCode: result.transaction.providerCode, transactionType: result.transaction.transactionType, amount: result.transaction.principalAmount.toFixed(), currency: result.transaction.currencyCode, externalReference: result.transaction.externalReference, idempotent: result.idempotent } });
    await writeApiLog({ request: req, statusCode: result.idempotent ? 200 : 201, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "mobile-money", action: "create" } });
    return NextResponse.json({ ok: true, ...result }, { status: result.idempotent ? 200 : 201 });
  } catch (error) {
    return retailErrorResponse(error, "MOBILE_MONEY_CREATE_FAILED");
  }
}
