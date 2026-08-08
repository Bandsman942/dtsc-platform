import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { retailReturnCreateSchema } from "@/lib/enterprise/retail/commercial-schemas";
import { authorizeRetailRequest, retailErrorResponse, retailListParams } from "@/lib/enterprise/retail/http";
import { getRetailCommercialPermissions } from "@/lib/enterprise/retail/permissions";
import { createRetailReturnRequest } from "@/lib/enterprise/retail/returns";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string; saleId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId, saleId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "RETAIL_POS", "read");
  if (!auth.ok) return auth.response;
  const { page, pageSize, status } = retailListParams(req);
  const where = { organizationId, saleId, ...(status ? { status } : {}) };
  const [items, total] = await Promise.all([
    prisma.enterpriseRetailReturn.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize, include: { lines: true, refunds: true } }),
    prisma.enterpriseRetailReturn.count({ where }),
  ]);
  await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "retail-returns", action: "list", saleId, page } });
  return NextResponse.json({ items, pagination: { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) } });
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId, saleId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "RETAIL_POS", "write", { mutation: true, limit: 120 });
  if (!auth.ok) return auth.response;
  const permissions = await getRetailCommercialPermissions(auth.session.userId, organizationId);
  if (!permissions.canCreateReturns) return NextResponse.json({ error: "Forbidden", message: "Vous n’êtes pas autorisé à demander un retour Retail." }, { status: 403 });
  const parsed = retailReturnCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Demande de retour invalide." }, { status: 400 });
  try {
    const result = await createRetailReturnRequest(organizationId, saleId, auth.session.userId, parsed.data);
    await writeAuditLog({
      userId: auth.session.userId,
      action: "ENTERPRISE_RETAIL_RETURN_REQUESTED",
      entity: "EnterpriseRetailReturn",
      entityId: result.retailReturn.id,
      request: req,
      metadata: {
        organizationId,
        saleId,
        number: result.retailReturn.number,
        returnType: result.retailReturn.returnType,
        total: result.retailReturn.grandTotal.toFixed(),
        currency: result.retailReturn.currencyCode,
        idempotent: result.idempotent,
      },
    });
    await writeApiLog({ request: req, statusCode: result.idempotent ? 200 : 201, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "retail-returns", action: "request", saleId } });
    return NextResponse.json({ ok: true, ...result }, { status: result.idempotent ? 200 : 201 });
  } catch (error) {
    return retailErrorResponse(error, "RETAIL_RETURN_REQUEST_FAILED");
  }
}
