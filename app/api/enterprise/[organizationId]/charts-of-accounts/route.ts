import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { authorizeFinanceRequest, financeErrorResponse, financeListParams } from "@/lib/enterprise/accounting/http";
import { createChartOfAccounts } from "@/lib/enterprise/accounting/master-service";
import { chartCreateSchema } from "@/lib/enterprise/accounting/schemas";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_ACCOUNTING", "view");
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const { page, pageSize, search, status } = financeListParams(req);
  const recordId = url.searchParams.get("recordId")?.trim() || undefined;
  const where: Prisma.EnterpriseChartOfAccountsWhereInput = {
    organizationId,
    ...(recordId ? { id: recordId } : {}),
    ...(status ? { status } : {}),
    ...(search ? { OR: [
      { code: { contains: search, mode: "insensitive" } },
      { nameFr: { contains: search, mode: "insensitive" } },
      { nameEn: { contains: search, mode: "insensitive" } },
      { templateCode: { contains: search, mode: "insensitive" } },
    ] } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.enterpriseChartOfAccounts.findMany({
      where,
      orderBy: [{ status: "asc" }, { code: "asc" }],
      skip: recordId ? 0 : (page - 1) * pageSize,
      take: recordId ? 1 : pageSize,
      include: { _count: { select: { groups: true, accounts: true } } },
    }),
    prisma.enterpriseChartOfAccounts.count({ where }),
  ]);

  await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "charts-of-accounts", recordId: recordId || null, hasSearch: Boolean(search) } });
  return NextResponse.json({ items, pagination: { page: recordId ? 1 : page, pageSize: recordId ? 1 : pageSize, total, pageCount: recordId ? 1 : Math.max(1, Math.ceil(total / pageSize)) } });
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_ACCOUNTING", "manage", { mutation: true, limit: 20 });
  if (!auth.ok) return auth.response;
  const parsed = chartCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message }, { status: 400 });
  try {
    const chart = await createChartOfAccounts(organizationId, auth.session.userId, parsed.data);
    await writeAuditLog({ userId: auth.session.userId, action: "ENTERPRISE_CHART_OF_ACCOUNTS_CREATED", entity: "EnterpriseChartOfAccounts", entityId: chart.id, request: req, metadata: { organizationId, code: chart.code } });
    await writeApiLog({ request: req, statusCode: 201, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "charts-of-accounts" } });
    return NextResponse.json({ ok: true, chart }, { status: 201 });
  } catch (error) {
    return financeErrorResponse(error, "CHART_OF_ACCOUNTS_CREATE_FAILED");
  }
}
