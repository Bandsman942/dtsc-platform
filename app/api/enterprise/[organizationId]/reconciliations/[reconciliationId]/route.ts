import { NextResponse } from "next/server";
import { writeApiLog } from "@/lib/audit";
import { authorizeFinanceRequest } from "@/lib/enterprise/accounting/http";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string; reconciliationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId, reconciliationId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_RECONCILIATION", "view");
  if (!auth.ok) return auth.response;

  const reconciliation = await prisma.enterpriseReconciliationSession.findFirst({
    where: { id: reconciliationId, organizationId },
    include: {
      financialAccount: {
        select: {
          id: true,
          code: true,
          name: true,
          currencyCode: true,
          maskedReference: true,
          operationalBalance: true,
          reconciledBalance: true,
        },
      },
      matches: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!reconciliation) return NextResponse.json({ error: "RECONCILIATION_NOT_FOUND", message: "Le rapprochement demandé est introuvable." }, { status: 404 });

  const bankStatement = reconciliation.bankStatementId
    ? await prisma.enterpriseBankStatement.findFirst({
        where: { id: reconciliation.bankStatementId, organizationId },
        select: {
          id: true,
          reference: true,
          statementDate: true,
          periodStart: true,
          periodEnd: true,
          currencyCode: true,
          openingBalance: true,
          closingBalance: true,
          status: true,
        },
      })
    : null;
  const statementLines = reconciliation.bankStatementId
    ? await prisma.enterpriseBankStatementLine.findMany({
        where: { organizationId, bankStatementId: reconciliation.bankStatementId },
        orderBy: [{ lineNumber: "asc" }, { transactionDate: "asc" }],
      })
    : [];

  await writeApiLog({
    request: req,
    statusCode: 200,
    userId: auth.session.userId,
    startedAt,
    metadata: { organizationId, domain: "reconciliation-detail", reconciliationId },
  });
  return NextResponse.json({
    reconciliation: {
      ...reconciliation,
      differenceAmount: reconciliation.reconciledDifference,
      bankStatement,
      statementLines,
    },
  });
}
