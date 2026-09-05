import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { authorizeFinanceRequest, financeErrorResponse, financeListParams } from "@/lib/enterprise/accounting/http";
import { generateFinancialStatement } from "@/lib/enterprise/accounting/statements-service";
import { statementGenerateSchema } from "@/lib/enterprise/accounting/treasury-schemas";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_STATEMENTS", "view");
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const { page, pageSize, status, search } = financeListParams(req);
  const recordId = url.searchParams.get("recordId")?.trim() || undefined;
  const where: Prisma.EnterpriseFinancialStatementSnapshotWhereInput = {
    organizationId,
    ...(recordId ? { id: recordId } : {}),
    ...(status ? { status } : {}),
    ...(search ? { OR: [
      { statementType: { contains: search, mode: "insensitive" } },
      { currencyCode: { contains: search, mode: "insensitive" } },
      { checksum: { contains: search, mode: "insensitive" } },
    ] } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.enterpriseFinancialStatementSnapshot.findMany({
      where,
      orderBy: { generatedAt: "desc" },
      skip: recordId ? 0 : (page - 1) * pageSize,
      take: recordId ? 1 : pageSize,
      select: { id: true, statementType: true, periodStart: true, periodEnd: true, currencyCode: true, status: true, checksum: true, generatedAt: true, publishedAt: true },
    }),
    prisma.enterpriseFinancialStatementSnapshot.count({ where }),
  ]);
  await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "financial-statements", recordId: recordId || null, hasSearch: Boolean(search) } });
  return NextResponse.json({ items, pagination: { page: recordId ? 1 : page, pageSize: recordId ? 1 : pageSize, total, pageCount: recordId ? 1 : Math.max(1, Math.ceil(total / pageSize)) } });
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const parsed = statementGenerateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message }, { status: 400 });

  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_STATEMENTS", parsed.data.publish ? "manage" : "create", { mutation: true, limit: 30 });
  if (!auth.ok) return auth.response;
  try {
    const result = await generateFinancialStatement(organizationId, auth.session.userId, parsed.data);
    await writeAuditLog({ userId: auth.session.userId, action: parsed.data.publish ? "ENTERPRISE_FINANCIAL_STATEMENT_PUBLISHED" : "ENTERPRISE_FINANCIAL_STATEMENT_GENERATED", entity: "EnterpriseFinancialStatementSnapshot", entityId: result.statement.id, request: req, metadata: { organizationId, statementType: parsed.data.statementType, periodStart: parsed.data.periodStart.toISOString(), periodEnd: parsed.data.periodEnd.toISOString(), currency: parsed.data.currencyCode } });
    await writeApiLog({ request: req, statusCode: 201, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "financial-statements", statementType: parsed.data.statementType, publish: parsed.data.publish } });
    return NextResponse.json({ ok: true, ...result }, { status: 201 });
  } catch (error) {
    return financeErrorResponse(error, "FINANCIAL_STATEMENT_GENERATION_FAILED");
  }
}
