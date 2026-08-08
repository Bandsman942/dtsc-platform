import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { createRetailPaymentTransaction } from "@/lib/enterprise/retail/customer-payments";
import { retailPaymentCreateSchema } from "@/lib/enterprise/retail/customer-payments-schemas";
import { authorizeRetailRequest, retailErrorResponse, retailListParams } from "@/lib/enterprise/retail/http";
import { getRetailCustomerPaymentPermissions } from "@/lib/enterprise/retail/permissions";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "RETAIL_POS", "read");
  if (!auth.ok) return auth.response;
  const permissions = await getRetailCustomerPaymentPermissions(auth.session.userId, organizationId);
  if (!permissions.canManagePayments && !permissions.canRefundPayments) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { page, pageSize, status } = retailListParams(req);
  const where: Prisma.EnterpriseRetailPaymentTransactionWhereInput = { organizationId, ...(status ? { status } : {}) };
  const [items, total] = await Promise.all([
    prisma.enterpriseRetailPaymentTransaction.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.enterpriseRetailPaymentTransaction.count({ where }),
  ]);
  await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "retail-payments", action: "list", page, pageSize, status: status || null } });
  return NextResponse.json({ items, pagination: { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) } });
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "RETAIL_POS", "submit", { mutation: true, limit: 300 });
  if (!auth.ok) return auth.response;
  const permissions = await getRetailCustomerPaymentPermissions(auth.session.userId, organizationId);
  if (!permissions.canManagePayments) return NextResponse.json({ error: "Forbidden", message: "Votre fonction ne permet pas d’initier un paiement Retail." }, { status: 403 });
  const parsed = retailPaymentCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Paiement invalide." }, { status: 400 });
  try {
    const result = await createRetailPaymentTransaction(organizationId, auth.session.userId, parsed.data);
    await writeAuditLog({ userId: auth.session.userId, action: "ENTERPRISE_RETAIL_PAYMENT_INITIATED", entity: "EnterpriseRetailPaymentTransaction", entityId: result.payment.id, request: req, metadata: { organizationId, providerId: result.payment.providerId, methodType: result.payment.methodType, amount: result.payment.amount.toString(), currencyCode: result.payment.currencyCode, saleId: result.payment.saleId, returnId: result.payment.returnId, idempotent: result.idempotent } });
    await writeApiLog({ request: req, statusCode: result.idempotent ? 200 : 201, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "retail-payments", action: "create", idempotent: result.idempotent } });
    return NextResponse.json(result, { status: result.idempotent ? 200 : 201 });
  } catch (error) {
    return retailErrorResponse(error, "RETAIL_PAYMENT_CREATE_FAILED");
  }
}
