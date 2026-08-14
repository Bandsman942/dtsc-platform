import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { prepareCommercialMobileMoney } from "@/lib/enterprise/retail/commercial-guardrails";
import { EnterpriseRetailError } from "@/lib/enterprise/retail/errors";
import { authorizeRetailRequest, retailErrorResponse, retailListParams } from "@/lib/enterprise/retail/http";
import { finalizeMobileMoneyAccounting } from "@/lib/enterprise/retail/mobile-money-accounting";
import { createConnectedMobileMoneyOperation } from "@/lib/enterprise/retail/operator-orchestration";
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
    const prepared = await prepareCommercialMobileMoney(organizationId, parsed.data);
    if (prepared.executionMode === "CONNECTED") {
      const connected = await createConnectedMobileMoneyOperation(organizationId, auth.session.userId, prepared.input);
      if (!connected) throw new EnterpriseRetailError("RETAIL_PROVIDER_NOT_CONNECTED", 409, { providerCode: prepared.input.providerCode });
      const finalized = connected.finalized?.kind === "MOBILE_MONEY" ? connected.finalized.transaction : null;
      const statusCode = connected.idempotent ? 200 : finalized ? 201 : connected.operation.status === "FAILED" ? 200 : 202;
      await writeAuditLog({
        userId: auth.session.userId,
        action: `ENTERPRISE_MOBILE_MONEY_PROVIDER_${connected.operation.status}`,
        entity: "EnterpriseRetailProviderOperation",
        entityId: connected.operation.id,
        request: req,
        metadata: {
          organizationId,
          providerCode: prepared.input.providerCode,
          transactionType: prepared.input.transactionType,
          amount: String(prepared.input.principalAmount),
          currency: prepared.input.currencyCode,
          providerStatus: connected.operation.status,
          businessTransactionId: finalized?.id || null,
          idempotent: connected.idempotent,
        },
      });
      await writeApiLog({ request: req, statusCode, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "mobile-money", action: "provider-initiate", providerStatus: connected.operation.status, finalized: Boolean(finalized) } });
      return NextResponse.json({ ok: connected.operation.status !== "FAILED", mode: "CONNECTED", operation: connected.operation, transaction: finalized, idempotent: connected.idempotent }, { status: statusCode });
    }

    const result = await createMobileMoneyTransaction(organizationId, auth.session.userId, prepared.input);
    const accounting = await finalizeMobileMoneyAccounting(organizationId, auth.session.userId, result.transaction.id);
    await writeAuditLog({ userId: auth.session.userId, action: "ENTERPRISE_MOBILE_MONEY_CONFIRMED", entity: "EnterpriseMobileMoneyTransaction", entityId: result.transaction.id, request: req, metadata: { organizationId, number: result.transaction.number, providerCode: result.transaction.providerCode, transactionType: result.transaction.transactionType, amount: result.transaction.principalAmount.toFixed(), currency: result.transaction.currencyCode, externalReference: result.transaction.externalReference, idempotent: result.idempotent, mode: "MANUAL", journalEntryId: accounting.entry.id } });
    await writeApiLog({ request: req, statusCode: result.idempotent ? 200 : 201, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "mobile-money", action: "create", mode: "MANUAL", journalEntryId: accounting.entry.id } });
    return NextResponse.json({ ok: true, mode: "MANUAL", ...result, accounting: { journalEntryId: accounting.entry.id, idempotent: accounting.idempotent } }, { status: result.idempotent ? 200 : 201 });
  } catch (error) {
    return retailErrorResponse(error, "MOBILE_MONEY_CREATE_FAILED");
  }
}
