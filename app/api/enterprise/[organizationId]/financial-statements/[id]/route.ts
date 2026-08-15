import { NextResponse } from "next/server";
import { writeApiLog } from "@/lib/audit";
import { authorizeFinanceRequest, financeErrorResponse } from "@/lib/enterprise/accounting/http";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string; id: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId, id } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_STATEMENTS", "view");
  if (!auth.ok) return auth.response;

  try {
    const statement = await prisma.enterpriseFinancialStatementSnapshot.findFirst({
      where: { id, organizationId },
      select: {
        id: true,
        statementType: true,
        periodStart: true,
        periodEnd: true,
        currencyCode: true,
        status: true,
        snapshotJson: true,
        generatedAt: true,
        publishedAt: true,
      },
    });

    if (!statement) {
      await writeApiLog({
        request: req,
        statusCode: 404,
        userId: auth.session.userId,
        startedAt,
        metadata: { organizationId, domain: "financial-statements", statementId: id },
      });
      return NextResponse.json({ error: "FINANCIAL_STATEMENT_NOT_FOUND" }, { status: 404 });
    }

    await writeApiLog({
      request: req,
      statusCode: 200,
      userId: auth.session.userId,
      startedAt,
      metadata: { organizationId, domain: "financial-statements", statementId: id },
    });
    return NextResponse.json({ statement });
  } catch (error) {
    return financeErrorResponse(error, "FINANCIAL_STATEMENT_DETAIL_FAILED");
  }
}
