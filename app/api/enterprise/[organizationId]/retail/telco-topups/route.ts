import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { authorizeRetailRequest, retailErrorResponse, retailListParams } from "@/lib/enterprise/retail/http";
import { telcoTopupCreateSchema } from "@/lib/enterprise/retail/schemas";
import { createTelcoTopup } from "@/lib/enterprise/retail/service";
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
  const masked = items.map((item) => ({ ...item, destinationPhone: item.destinationPhone.length > 6 ? `${item.destinationPhone.slice(0, 3)}••••${item.destinationPhone.slice(-3)}` : item.destinationPhone }));
  await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "telco-topups", page } });
  return NextResponse.json({ items: masked, pagination: { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) } });
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "TELCO_TOPUPS", "submit", { mutation: true, limit: 300 });
  if (!auth.ok) return auth.response;
  const parsed = telcoTopupCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Recharge invalide." }, { status: 400 });
  try {
    const result = await createTelcoTopup(organizationId, auth.session.userId, parsed.data);
    await writeAuditLog({ userId: auth.session.userId, action: "ENTERPRISE_TELCO_TOPUP_RECORDED", entity: "EnterpriseTelcoTopup", entityId: result.topup.id, request: req, metadata: { organizationId, number: result.topup.number, providerCode: result.topup.providerCode, status: result.topup.status, saleAmount: result.topup.saleAmount.toFixed(), operatorCost: result.topup.operatorCost.toFixed(), margin: result.topup.marginAmount.toFixed(), idempotent: result.idempotent } });
    await writeApiLog({ request: req, statusCode: result.idempotent ? 200 : 201, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "telco-topups", action: "create" } });
    return NextResponse.json({ ok: true, ...result }, { status: result.idempotent ? 200 : 201 });
  } catch (error) {
    return retailErrorResponse(error, "TELCO_TOPUP_CREATE_FAILED");
  }
}
