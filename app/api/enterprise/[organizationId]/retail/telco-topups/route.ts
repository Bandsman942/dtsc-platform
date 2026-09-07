import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { createAndPostTelcoTopupAtomic } from "@/lib/enterprise/retail/atomic-accounting-service";
import { prepareCommercialTelcoTopup } from "@/lib/enterprise/retail/commercial-guardrails";
import { EnterpriseRetailError } from "@/lib/enterprise/retail/errors";
import { authorizeRetailRequest, retailErrorResponse, retailListParams } from "@/lib/enterprise/retail/http";
import { retailFailureOutcome, retailPendingOutcome, retailSuccessOutcome } from "@/lib/enterprise/retail/mutation-outcome";
import { createConnectedTelcoTopupOperation } from "@/lib/enterprise/retail/operator-orchestration";
import { telcoTopupCreateSchema } from "@/lib/enterprise/retail/schemas";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "TELCO_TOPUPS", "read");
  if (!auth.ok) return auth.response;
  const { page, pageSize, status, providerCode, search, from, to } = retailListParams(req);
  const where: Prisma.EnterpriseTelcoTopupWhereInput = {
    organizationId,
    ...(status ? { status } : {}),
    ...(providerCode ? { providerCode } : {}),
    ...(from || to ? { occurredAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    ...(search ? { OR: [{ number: { contains: search, mode: "insensitive" } }, { offerLabel: { contains: search, mode: "insensitive" } }, { externalReference: { contains: search, mode: "insensitive" } }, { destinationPhone: { contains: search } }] } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.enterpriseTelcoTopup.findMany({ where, orderBy: { occurredAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.enterpriseTelcoTopup.count({ where }),
  ]);
  const masked = items.map((item) => ({ ...item, destinationPhone: item.destinationPhone.length > 6 ? `${item.destinationPhone.slice(0, 4)}••••${item.destinationPhone.slice(-3)}` : item.destinationPhone }));
  await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "telco-topups", page } });
  return NextResponse.json({ items: masked, pagination: { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) } });
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "TELCO_TOPUPS", "submit", { mutation: true, limit: 300 });
  if (!auth.ok) return auth.response;
  const parsed = telcoTopupCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, outcome: "FAILURE", error: "Invalid payload", message: parsed.error.issues[0]?.message || "Recharge invalide." }, { status: 400 });
  try {
    const prepared = await prepareCommercialTelcoTopup(organizationId, parsed.data);
    if (prepared.executionMode === "CONNECTED") {
      const connected = await createConnectedTelcoTopupOperation(organizationId, auth.session.userId, prepared.input);
      if (!connected) throw new EnterpriseRetailError("RETAIL_PROVIDER_NOT_CONNECTED", 409, { providerCode: prepared.input.providerCode });
      const finalized = connected.finalized?.kind === "TELCO_TOPUP" ? connected.finalized.topup : null;
      const failed = connected.operation.status === "FAILED";
      const pending = !failed && !finalized;
      const statusCode = failed ? 422 : pending ? 202 : connected.idempotent ? 200 : 201;
      await Promise.allSettled([
        writeAuditLog({ userId: auth.session.userId, action: `ENTERPRISE_TELCO_PROVIDER_${connected.operation.status}`, entity: "EnterpriseRetailProviderOperation", entityId: connected.operation.id, request: req, metadata: { organizationId, providerCode: prepared.input.providerCode, offerLabel: prepared.input.offerLabel, saleAmount: String(prepared.input.saleAmount), currency: prepared.input.currencyCode, providerStatus: connected.operation.status, businessTopupId: finalized?.id || null, idempotent: connected.idempotent } }),
        writeApiLog({ request: req, statusCode, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "telco-topups", action: "provider-initiate", providerStatus: connected.operation.status, finalized: Boolean(finalized), outcome: failed ? "FAILURE" : pending ? "PENDING" : "SUCCESS" } }),
      ]);
      if (failed) return NextResponse.json(retailFailureOutcome("RETAIL_PROVIDER_FAILED", { mode: "CONNECTED", operation: connected.operation, topup: finalized, idempotent: connected.idempotent }), { status: statusCode });
      if (pending) return NextResponse.json(retailPendingOutcome("RETAIL_PROVIDER_PENDING", { mode: "CONNECTED", operation: connected.operation, topup: finalized, idempotent: connected.idempotent }), { status: statusCode });
      return NextResponse.json(retailSuccessOutcome({ mode: "CONNECTED", operation: connected.operation, topup: finalized, idempotent: connected.idempotent }), { status: statusCode });
    }

    const result = await createAndPostTelcoTopupAtomic(organizationId, auth.session.userId, prepared.input);
    const statusCode = result.idempotent ? 200 : 201;
    const journalEntryId = result.posting?.entry.id || null;
    await Promise.allSettled([
      writeAuditLog({
        userId: auth.session.userId,
        action: "ENTERPRISE_TELCO_TOPUP_RECORDED",
        entity: "EnterpriseTelcoTopup",
        entityId: result.topup.id,
        request: req,
        metadata: { organizationId, number: result.topup.number, providerCode: result.topup.providerCode, status: result.topup.status, saleAmount: result.topup.saleAmount.toFixed(), operatorCost: result.topup.operatorCost.toFixed(), margin: result.topup.marginAmount.toFixed(), externalReference: result.topup.externalReference, idempotent: result.idempotent, mode: "MANUAL", journalEntryId, atomicAccounting: result.topup.status === "SUCCESS" },
      }),
      writeApiLog({ request: req, statusCode, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "telco-topups", action: "create", mode: "MANUAL", outcome: "SUCCESS", journalEntryId, atomicAccounting: result.topup.status === "SUCCESS" } }),
    ]);
    return NextResponse.json(retailSuccessOutcome({ mode: "MANUAL", topup: result.topup, idempotent: result.idempotent, accounting: result.posting ? { status: "POSTED", journalEntryId: result.posting.entry.id, idempotent: result.posting.idempotent } : null }), { status: statusCode });
  } catch (error) {
    return retailErrorResponse(error, "TELCO_TOPUP_CREATE_FAILED");
  }
}
