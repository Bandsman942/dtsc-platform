import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { authorizeFinanceRequest, financeErrorResponse } from "@/lib/enterprise/accounting/http";
import { createChartOfAccounts } from "@/lib/enterprise/accounting/master-service";
import { chartCreateSchema } from "@/lib/enterprise/accounting/schemas";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_ACCOUNTING", "view");
  if (!auth.ok) return auth.response;

  const items = await prisma.enterpriseChartOfAccounts.findMany({
    where: { organizationId },
    orderBy: [{ status: "asc" }, { code: "asc" }],
    include: {
      _count: { select: { groups: true, accounts: true } },
    },
  });

  await writeApiLog({
    request: req,
    statusCode: 200,
    userId: auth.session.userId,
    startedAt,
    metadata: { organizationId, domain: "charts-of-accounts" },
  });
  return NextResponse.json({ items });
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_ACCOUNTING", "manage", {
    mutation: true,
    limit: 20,
  });
  if (!auth.ok) return auth.response;

  const parsed = chartCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", message: parsed.error.issues[0]?.message },
      { status: 400 },
    );
  }

  try {
    const chart = await createChartOfAccounts(organizationId, auth.session.userId, parsed.data);
    await writeAuditLog({
      userId: auth.session.userId,
      action: "ENTERPRISE_CHART_OF_ACCOUNTS_CREATED",
      entity: "EnterpriseChartOfAccounts",
      entityId: chart.id,
      request: req,
      metadata: { organizationId, code: chart.code },
    });
    await writeApiLog({
      request: req,
      statusCode: 201,
      userId: auth.session.userId,
      startedAt,
      metadata: { organizationId, domain: "charts-of-accounts" },
    });
    return NextResponse.json({ ok: true, chart }, { status: 201 });
  } catch (error) {
    return financeErrorResponse(error, "CHART_OF_ACCOUNTS_CREATE_FAILED");
  }
}
