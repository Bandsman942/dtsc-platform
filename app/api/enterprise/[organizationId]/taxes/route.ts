import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { taxCodeCreateSchema } from "@/lib/enterprise/accounting/finance-domain-schemas";
import { authorizeFinanceRequest, financeErrorResponse, financeListParams } from "@/lib/enterprise/accounting/http";
import { createTaxCode } from "@/lib/enterprise/accounting/master-service";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_TAX", "view");
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const { page, pageSize, search, status } = financeListParams(req);
  const recordId = url.searchParams.get("recordId")?.trim() || undefined;
  const where: Prisma.EnterpriseTaxCodeWhereInput = {
    organizationId,
    ...(recordId ? { id: recordId } : {}),
    ...(status ? { status } : {}),
    ...(search ? { OR: [
      { code: { contains: search, mode: "insensitive" } },
      { nameFr: { contains: search, mode: "insensitive" } },
      { nameEn: { contains: search, mode: "insensitive" } },
      { category: { contains: search, mode: "insensitive" } },
      { jurisdiction: { contains: search, mode: "insensitive" } },
    ] } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.enterpriseTaxCode.findMany({
      where,
      orderBy: { code: "asc" },
      skip: recordId ? 0 : (page - 1) * pageSize,
      take: recordId ? 1 : pageSize,
      include: { rates: { orderBy: { effectiveFrom: "desc" } }, rules: true },
    }),
    prisma.enterpriseTaxCode.count({ where }),
  ]);
  await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "taxes", recordId: recordId || null, hasSearch: Boolean(search) } });
  return NextResponse.json({ items, pagination: { page: recordId ? 1 : page, pageSize: recordId ? 1 : pageSize, total, pageCount: recordId ? 1 : Math.max(1, Math.ceil(total / pageSize)) }, disclaimer: "Operational configurable tax summaries; jurisdiction-specific legal filing is not automated." });
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_TAX", "create", { mutation: true, limit: 40 });
  if (!auth.ok) return auth.response;
  const parsed = taxCodeCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message }, { status: 400 });
  try {
    const taxCode = await createTaxCode(organizationId, auth.session.userId, parsed.data);
    await writeAuditLog({ userId: auth.session.userId, action: "ENTERPRISE_TAX_CODE_CREATED", entity: "EnterpriseTaxCode", entityId: taxCode.id, request: req, metadata: { organizationId, code: taxCode.code, category: taxCode.category, jurisdiction: taxCode.jurisdiction } });
    await writeApiLog({ request: req, statusCode: 201, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "taxes" } });
    return NextResponse.json({ ok: true, taxCode }, { status: 201 });
  } catch (error) {
    return financeErrorResponse(error, "TAX_CODE_CREATE_FAILED");
  }
}
